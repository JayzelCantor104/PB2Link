<?php
ob_start();
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

// Thrown for problems the citizen can fix (missing field, bad OTP, bad photo).
// Its message is shown as-is; anything else (e.g. a mysqli_sql_exception) is
// logged and replaced with a generic message so SQL details never reach the UI.
class RegistrationError extends Exception {
    public $extra = []; // extra response keys, e.g. a code the form reacts to
    public function __construct($message, array $extra = []) {
        parent::__construct($message);
        $this->extra = $extra;
    }
}

$base_upload_dir = null;

try {
    include "../db_connection.php";
    // db_connection.php turns mysqli error reporting off; turn it back on so a
    // failed insert throws (and rolls back) instead of silently "succeeding".
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $response = ["success" => false, "message" => ""];

    if (!$conn) {
        throw new Exception("Registry Error: Secure link to database connection state failed.");
    }

    // Secure Sequential User ID Generation via Prepared Statements
    function generateUserId($conn) {
        $prefix = date("Ym"); 
        $like_param = $prefix . "%";
        $stmt = mysqli_prepare($conn, "SELECT user_id FROM users WHERE user_id LIKE ? ORDER BY user_id DESC LIMIT 1");
        mysqli_stmt_bind_param($stmt, "s", $like_param);
        mysqli_stmt_execute($stmt);
        $result = mysqli_stmt_get_result($stmt);
        
        if ($result && mysqli_num_rows($result) > 0) {
            $row = mysqli_fetch_assoc($result);
            mysqli_stmt_close($stmt);
            return strval($row['user_id'] + 1);
        }
        mysqli_stmt_close($stmt);
        return $prefix . "0001";
    }

    // First letter of a name as a plain A-Z letter for the control number.
    // Multibyte-safe: substr() took only the first byte of "Ñ" or "É", which
    // left half a character in the control number and the folder name.
    function controlNumberInitial($name) {
        $first = mb_strtoupper(mb_substr(trim((string)$name), 0, 1, 'UTF-8'), 'UTF-8');
        $first = strtr($first, [
            'Ñ' => 'N', 'Á' => 'A', 'À' => 'A', 'Â' => 'A', 'Ä' => 'A', 'Ã' => 'A',
            'É' => 'E', 'È' => 'E', 'Ê' => 'E', 'Ë' => 'E', 'Í' => 'I', 'Ì' => 'I',
            'Î' => 'I', 'Ï' => 'I', 'Ó' => 'O', 'Ò' => 'O', 'Ô' => 'O', 'Ö' => 'O',
            'Õ' => 'O', 'Ú' => 'U', 'Ù' => 'U', 'Û' => 'U', 'Ü' => 'U', 'Ç' => 'C',
        ]);
        return preg_match('/^[A-Z]$/', $first) ? $first : 'X';
    }

    // Unique control number: PB2-<year>-<birth YYYYMMDD><initials><2 letters><digit>.
    // A number counts as taken when either table already has it (both have a
    // UNIQUE index, migration 042) or its upload folder exists. It is claimed
    // by creating that folder: mkdir() succeeds for only one request, so two
    // registrations arriving at the same instant can never share a number, a
    // folder, or each other's ID photos (the failure clean-up below empties
    // the folder it was given).
    function generateUniqueControlNumber($conn, $birthDate, $firstName, $lastName, $uploadRoot) {
        $currentYear = date("Y");
        $birth = date("Ymd", strtotime($birthDate));
        $initials = controlNumberInitial($firstName) . controlNumberInitial($lastName);
        $letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

        if (!is_dir($uploadRoot)) {
            @mkdir($uploadRoot, 0777, true);
        }

        // 50 random endings first; if all are taken (only when thousands of
        // residents share this birth date and initials), go through every
        // ending in order so a free one is always found.
        $candidates = (function () use ($letters) {
            for ($i = 0; $i < 50; $i++) {
                yield $letters[random_int(0, 25)] . $letters[random_int(0, 25)] . random_int(0, 9);
            }
            for ($x = 0; $x < 26; $x++) for ($y = 0; $y < 26; $y++) for ($d = 0; $d < 10; $d++) {
                yield $letters[$x] . $letters[$y] . $d;
            }
        })();

        foreach ($candidates as $ending) {
            $control_num = "PB2-$currentYear-$birth$initials$ending";

            $stmt = mysqli_prepare($conn,
                "SELECT 1 FROM residents WHERE control_num = ? UNION ALL SELECT 1 FROM users WHERE control_num = ? LIMIT 1");
            mysqli_stmt_bind_param($stmt, "ss", $control_num, $control_num);
            mysqli_stmt_execute($stmt);
            $taken = mysqli_num_rows(mysqli_stmt_get_result($stmt)) > 0;
            mysqli_stmt_close($stmt);
            if ($taken) continue;

            // Claim it. Fails if the folder already exists (another request
            // just took this number, or an old folder was left behind).
            if (@mkdir($uploadRoot . $control_num, 0777)) {
                return $control_num;
            }
        }
        // Only reachable if all 6,760 endings for this birth date and initials
        // are used, or the uploads folder can't be written.
        throw new RuntimeException("Could not create a unique control number (all endings used, or $uploadRoot isn't writable)");
    }

    // Multibyte-safe: strtoupper() leaves "ñ" lowercase in names like Peña.
    function pb2_upper($val) {
        return function_exists('mb_strtoupper') ? mb_strtoupper((string)$val, 'UTF-8') : strtoupper((string)$val);
    }

    function nullIfEmpty($val) {
        $trimmed = trim($val ?? '');
        return ($trimmed === "") ? NULL : $trimmed;
    }

    if ($_SERVER["REQUEST_METHOD"] == "POST") {
        
        $email = trim($_POST['email'] ?? '');
        $user_code = trim($_POST['otp'] ?? '');

        // 1. Verify both codes before doing anything else (migration 015):
        //    the email code (send_otp.php), then the SMS code for the mobile
        //    number (registration_mobile_otp.php).
        require_once __DIR__ . '/verification_common.php';
        $stmtFetch = mysqli_prepare($conn, "SELECT 1 FROM email_verifications WHERE email = ?");
        mysqli_stmt_bind_param($stmtFetch, "s", $email);
        mysqli_stmt_execute($stmtFetch);
        $hasEmailCode = mysqli_num_rows(mysqli_stmt_get_result($stmtFetch)) > 0;
        mysqli_stmt_close($stmtFetch);
        if (!$hasEmailCode) {
            throw new RegistrationError("No verification code was requested for this email. Please request a new one.");
        }
        if (!pb2_registration_email_ok($conn, $email, $user_code)) {
            throw new RegistrationError("Your email verification code is incorrect or has expired. Please request a new one.");
        }
        if (!pb2_vc_is_verified($conn, 'register', strtolower($email), 'sms', (string)($_POST['contact_num'] ?? ''))) {
            throw new RegistrationError("Please verify your mobile number with the code we texted you.");
        }

        
        // Secure Prepared Check for Email Duplication
        $stmtCheck = mysqli_prepare($conn, "SELECT user_id FROM users WHERE email = ?");
        mysqli_stmt_bind_param($stmtCheck, "s", $email);
        mysqli_stmt_execute($stmtCheck);
        $resultCheck = mysqli_stmt_get_result($stmtCheck);
        
        if (mysqli_num_rows($resultCheck) > 0) {
            mysqli_stmt_close($stmtCheck);
            throw new RegistrationError("This email address is already registered.");
        }
        mysqli_stmt_close($stmtCheck);

        // Server-side mirror of the per-step checks in src/pages/Register.jsx —
        // the form's own validation can be bypassed by posting here directly.
        $post = function ($key) { return trim((string)($_POST[$key] ?? '')); };
        $isTrue = function ($key) { return ($_POST[$key] ?? 'false') === 'true'; };
        $mobileRegex = '/^09\d{9}$/';
        $missing = [];

        $requiredText = [
            'fName' => 'Given Name', 'lName' => 'Surname', 'religion' => 'Religion',
            'birth_city' => 'Birth City', 'birth_province' => 'Birth Province', 'birth_country' => 'Birth Country',
            'street' => 'Street',
            'contact_person' => 'Emergency Contact Person', 'contactp_relationship' => 'Emergency Contact Relationship',
        ];
        foreach ($requiredText as $key => $label) {
            if ($post($key) === '') $missing[] = $label;
        }
        if ($post('house_no') === '' && $post('block_lot') === '') $missing[] = 'House No. or Block & Lot';
        if (in_array($post('civil_status'), ['Married', 'Separated'], true) && $post('spouse_name_text') === '') {
            $missing[] = 'Spouse Name';
        }
        if ($missing) {
            throw new RegistrationError("Please complete the following required fields: " . implode(', ', $missing) . ".");
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RegistrationError("Please enter a valid email address.");
        }
        if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/', $_POST['password'] ?? '')) {
            throw new RegistrationError("Password must be at least 8 characters with an uppercase letter, a number, and a special character (@\$!%*?&).");
        }
        if (($_POST['password'] ?? '') !== ($_POST['confirmPassword'] ?? '')) {
            throw new RegistrationError("Passwords do not match.");
        }
        if (!preg_match($mobileRegex, $post('contact_num'))) {
            throw new RegistrationError("Mobile number must be 11 digits starting with 09.");
        }
        if (!preg_match($mobileRegex, $post('contactp_num'))) {
            throw new RegistrationError("Emergency contact number must be 11 digits starting with 09.");
        }
        $bd = DateTime::createFromFormat('Y-m-d', $post('birth_date'));
        if (!$bd || $bd->format('Y-m-d') !== $post('birth_date') || $bd > new DateTime('today') || (int)$bd->format('Y') < 1900) {
            throw new RegistrationError("Please enter a valid date of birth.");
        }
        // Only residents 18 or older have accounts. Anyone younger is served
        // through a parent's or guardian's account ("Someone else" on the
        // request forms).
        require_once __DIR__ . '/registration_fix_common.php';
        require_once __DIR__ . '/account_approval.php';
        if ((int)$bd->diff(new DateTime('today'))->y < PB2_ADULT_AGE) {
            throw new RegistrationError("You need to be at least " . PB2_ADULT_AGE . " years old to have your own account. A parent or guardian can request documents for you from their own account (choose \"Someone else\" on the request form).", ['code' => 'TOO_YOUNG']);
        }
        if (!in_array($post('gender'), ['Male', 'Female'], true)) {
            throw new RegistrationError("Please select your sex at birth.");
        }
        if (!in_array($post('civil_status'), ['Single', 'Married', 'Widowed', 'Separated'], true)) {
            throw new RegistrationError("Please select a valid civil status.");
        }
        if (!in_array($post('residency_status'), ['Homeowner', 'Tenant', 'Sharer'], true)) {
            throw new RegistrationError("Please select a valid residency status.");
        }
        $heightNum = filter_var($post('height'), FILTER_VALIDATE_INT);
        if ($heightNum === false || $heightNum < 50 || $heightNum > 250) {
            throw new RegistrationError("Please enter your height in centimeters (50–250).");
        }
        // Move-in month (migration 010); years_in_PB2 is derived from it.
        require_once __DIR__ . '/residency_requirement.php';
        $residingSince = pb2_parse_residing_since($post('residing_since'));
        if (!$residingSince) {
            throw new RegistrationError("Please enter the month you started living in Pasong Buaya II.");
        }
        // The move-in month is only a claim (migration 018). It stands on its
        // own only when the server's own scan of the ID front shows a Pasong
        // Buaya II address and it is 6+ months back; otherwise a proof is
        // required and staff review the account (residency_requirement.php).
        // The ID check runs here, on the uploaded temp file (same bytes as the
        // stored copy), because it decides which proof to ask for.
        require_once __DIR__ . '/account_approval.php';
        $idScanToken = (string)($_POST['id_scan_token'] ?? '');
        $idFrontTmp = $_FILES['valid_id_img_front']['tmp_name'] ?? '';
        $idCheck = pb2_id_scan_verify($conn, $idScanToken,
            ($idFrontTmp !== '' && is_uploaded_file($idFrontTmp)) ? (string)@file_get_contents($idFrontTmp) : '',
            $post('fName'), $post('lName'));
        $residencyRule = pb2_registration_residency_rule($idCheck['address_match'], (int)pb2_months_residing($residingSince));
        if ($residencyRule['proof']) {
            $proofAsk = $residencyRule['proof'] === 'endorsement'
                ? "You have lived in Pasong Buaya II for less than " . PB2_MIN_RESIDENCY_MONTHS . " months. Please upload an HOA endorsement (or another accepted certification)."
                : "The address on your ID is not in Pasong Buaya II" . ($idCheck['address_match'] === null ? " (or could not be read)" : "")
                  . ". Please upload a proof of address with your name, such as a utility bill, another ID, a parcel receipt, or an HOA endorsement.";
            $proofExtra = ['code' => 'RESIDENCY_PROOF_REQUIRED', 'proof_kind' => $residencyRule['proof']];
            if (!isset($_FILES['proof_residency']) || $_FILES['proof_residency']['error'] === UPLOAD_ERR_NO_FILE) {
                throw new RegistrationError($proofAsk, $proofExtra);
            }
            if (!in_array($post('residency_proof_type'), $residencyRule['types'], true)) {
                throw new RegistrationError("Please choose which kind of residency proof you are uploading.", $proofExtra);
            }
        }
        if (!in_array($post('valid_id'), PB2_VALID_ID_TYPES, true)) {
            throw new RegistrationError("Please select your government ID type.");
        }
        // A Senior Citizen ID (OSCA) is only issued from age 60.
        if ($post('valid_id') === 'Senior Citizen ID (OSCA)' && (int)$bd->diff(new DateTime('today'))->y < 60) {
            throw new RegistrationError("A Senior Citizen ID is only issued from age 60. Please check your birth date, or choose a different ID.");
        }
        if (!$isTrue('privacy_agreed')) {
            throw new RegistrationError("You must accept the Data Privacy Statement.");
        }

        // A passport has only its photo page, so no back photo (migration 044
        // lets valid_id_img_back be empty). Every other ID needs both sides.
        $idNeedsBack = $post('valid_id') !== 'Passport';
        // The profile photo is optional: without one, the selfie with ID is used.
        $requiredFiles = [
            'valid_id_img_front' => 'ID Front Photo',
            'valid_id_img_holding' => 'Selfie Holding ID',
        ];
        if ($idNeedsBack) $requiredFiles['valid_id_img_back'] = 'ID Back Photo';
        foreach (['is_pwd' => 'proof_pwd', 'is_4ps' => 'proof_4ps', 'is_solo_parent' => 'proof_solo_parent', 'is_indigent' => 'proof_indigent'] as $flag => $fileKey) {
            if ($isTrue($flag)) $requiredFiles[$fileKey] = 'supporting document for the selected sector';
        }
        foreach ($requiredFiles as $fileKey => $label) {
            if (!isset($_FILES[$fileKey]) || $_FILES[$fileKey]['error'] === UPLOAD_ERR_NO_FILE) {
                throw new RegistrationError("Please upload your $label.");
            }
        }

        // Core Identifiers Generation
        $user_id = generateUserId($conn);
        // Also creates this registration's own upload folder (see the function).
        $control_num = generateUniqueControlNumber($conn, $_POST['birth_date'], $_POST['fName'], $_POST['lName'], "uploads/Resident_submitted_valid_ID/");
        $base_upload_dir = "uploads/Resident_submitted_valid_ID/" . $control_num . "/";
        $pass_hash = password_hash($_POST['password'] ?? '', PASSWORD_DEFAULT);

        // Validates the uploaded file's actual content (not the client-supplied filename)
        // and returns the extension to store it under, or NULL if it fails validation.
        function validateAndGetExtension($file, array $allowedMimes) {
            if (!isset($file) || $file['error'] !== UPLOAD_ERR_OK) return null;
            if ($file['size'] > 10 * 1024 * 1024) return null;

            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo === false) return null; // fileinfo extension unavailable on this host
            $mime = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);
            if ($mime === false) return null;

            $map = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];
            if (!in_array($mime, $allowedMimes, true) || !isset($map[$mime])) return null;

            return $map[$mime];
        }

        // Refactored Upload Core for Specific Isolation Formatting
        function uploadIdentityDocument($key, $custom_name, $dir) {
            if (!isset($_FILES[$key])) return NULL;
            $ext = validateAndGetExtension($_FILES[$key], ['image/jpeg', 'image/png', 'image/webp']);
            if ($ext === null) return NULL;

            $final_destination = $dir . $custom_name . "." . $ext;
            if (move_uploaded_file($_FILES[$key]['tmp_name'], $final_destination)) {
                return $final_destination;
            }
            return NULL;
        }

        // Auxiliary sector proofs (PWD/4Ps/solo-parent/indigent) now save into
        // the same per-resident folder as the ID photos above, with a clean
        // predictable name matching that folder's front_ID/back_ID/
        // selfie_with_ID convention — not a separate flat uploads/ root with
        // a uniqid()-based name, which scattered a resident's documents
        // across two locations and made them untraceable by folder alone.
        function uploadProof($key, $dir) {
            if (!isset($_FILES[$key])) return NULL;
            $ext = validateAndGetExtension($_FILES[$key], ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
            if ($ext === null) return NULL;

            $final_destination = $dir . $key . "." . $ext;
            if (move_uploaded_file($_FILES[$key]['tmp_name'], $final_destination)) {
                return $final_destination;
            }
            return NULL;
        }

        // Route uploads through custom nested folder layout naming conventions
        $id_front = uploadIdentityDocument('valid_id_img_front', 'front_ID', $base_upload_dir);
        $id_back  = $idNeedsBack ? uploadIdentityDocument('valid_id_img_back', 'back_ID', $base_upload_dir) : null;
        $id_hold  = uploadIdentityDocument('valid_id_img_holding', 'selfie_with_ID', $base_upload_dir);
        // Profile photo rule: the selfie with ID, unless the resident chose their own photo.
        $profile_pic = (isset($_FILES['profile_picture']) && $_FILES['profile_picture']['error'] !== UPLOAD_ERR_NO_FILE)
            ? uploadIdentityDocument('profile_picture', 'profile_picture', $base_upload_dir)
            : $id_hold;

        // These columns are NOT NULL — fail with a clear message now rather than
        // letting an invalid/unreadable image (e.g. an unsupported HEIC photo)
        // hit the database constraint and surface as a generic exception later.
        if (!$id_front || ($idNeedsBack && !$id_back) || !$id_hold) {
            throw new RegistrationError("One or more ID images could not be read as a valid JPEG, PNG, or WebP photo (max 10MB). Please re-upload clear photos in one of those formats.");
        }
        if (!$profile_pic) {
            throw new RegistrationError("Your profile photo could not be read as a valid JPEG, PNG, or WebP image (max 10MB). Please upload a different photo.");
        }

        // Auxiliary sector proofs handler
        $p_pwd         = uploadProof('proof_pwd', $base_upload_dir);
        $p_4ps         = uploadProof('proof_4ps', $base_upload_dir);
        $p_solo_parent = uploadProof('proof_solo_parent', $base_upload_dir);
        $p_indigent    = uploadProof('proof_indigent', $base_upload_dir);

        if ($isTrue('is_pwd') && !$p_pwd
            || $isTrue('is_4ps') && !$p_4ps
            || $isTrue('is_solo_parent') && !$p_solo_parent
            || $isTrue('is_indigent') && !$p_indigent) {
            throw new RegistrationError("A sector supporting document could not be read. Please upload a JPEG, PNG, WebP, or PDF file (max 10MB).");
        }

        $p_residency = null;
        if ($residencyRule['proof']) {
            $p_residency = uploadProof('proof_residency', $base_upload_dir);
            if (!$p_residency) {
                throw new RegistrationError("Your residency proof could not be read. Please upload a JPEG, PNG, WebP, or PDF file (max 10MB).");
            }
        }

        // Senior status comes from the validated birth date, not the browser.
        // (residents.age itself is a generated column computed by the database.)
        $age            = (int)$bd->diff(new DateTime('today'))->y;
        $is_senior      = $age >= 60 ? 1 : 0;
        $is_pwd         = (($_POST['is_pwd'] ?? 'false') === 'true' ? 1 : 0);
        $is_4ps         = (($_POST['is_4ps'] ?? 'false') === 'true' ? 1 : 0);
        $is_solo_parent = (($_POST['is_solo_parent'] ?? 'false') === 'true' ? 1 : 0);
       $is_indigent    = (($_POST['is_indigent'] ?? 'false') === 'true' ? 1 : 0);
        
        // VARCHAR column; derived from the move-in month, not trusted from the form.
        $years_val      = (string)pb2_years_from_since($residingSince);

        // Fix: Extract everything to variables first to prevent PHP 8 Warnings that corrupt JSON
        $b_date   = $_POST['birth_date'] ?? '';
        $gender   = $_POST['gender'] ?? '';
        $height   = $_POST['height'] ?? '';
        $c_num    = $_POST['contact_num'] ?? '';
        $c_status = $_POST['civil_status'] ?? '';
        $r_status = $_POST['residency_status'] ?? '';
        $cp_num   = $_POST['contactp_num'] ?? '';
        $phil_id  = nullIfEmpty($_POST['philsys_nat_id'] ?? '');

        // Standardize text inputs to UPPERCASE for official records
        $fName = pb2_upper($_POST['fName'] ?? '');
        $mName = nullIfEmpty(pb2_upper($_POST['mName'] ?? ''));
        $lName = pb2_upper($_POST['lName'] ?? '');
        $sName = nullIfEmpty(pb2_upper($_POST['spouse_name_text'] ?? ''));
        
        $birth_city = pb2_upper($_POST['birth_city'] ?? 'IMUS CITY');
        $birth_prov = pb2_upper($_POST['birth_province'] ?? 'CAVITE');
        $birth_ctry = pb2_upper($_POST['birth_country'] ?? 'PHILIPPINES');
        $religion   = pb2_upper($_POST['religion'] ?? '');
        
        $h_no   = nullIfEmpty(pb2_upper($_POST['house_no'] ?? ''));
        $street = pb2_upper($_POST['street'] ?? '');
        $compound = nullIfEmpty(pb2_upper($_POST['compound'] ?? '')); // migration 046, optional
        $zone   = nullIfEmpty(pb2_upper($_POST['zone'] ?? ''));
        $subdiv = nullIfEmpty(pb2_upper($_POST['subdivision'] ?? ''));
        $area   = nullIfEmpty(pb2_upper($_POST['area'] ?? ''));
        $b_lot  = nullIfEmpty(pb2_upper($_POST['block_lot'] ?? ''));
        $l_mark = nullIfEmpty(pb2_upper($_POST['landmark'] ?? ''));
        
        $c_person = pb2_upper($_POST['contact_person'] ?? '');
        $c_rel    = pb2_upper($_POST['contactp_relationship'] ?? '');

        $suf     = nullIfEmpty($_POST['suffix'] ?? '');
        $bType   = nullIfEmpty($_POST['blood_type'] ?? '');
        $vIDType = nullIfEmpty($_POST['valid_id'] ?? '');

        // PhilSys number (migration 013). With a PhilSys card as the ID in
        // ID Intake, that card is the PhilSys card. With any other ID, the
        // resident uploads the PhilSys card's front and back. Either way the
        // server re-checks the scan itself (philsys_scan_common.php): a card
        // whose number/name don't match is still accepted but flagged
        // 'Mismatch' for the staff reviewing this registration.
        $philsysFront = null;
        $philsysBack = null;
        $philsysStatus = 'Not Provided';
        $philsysScanUsed = null;
        if ($phil_id !== null) {
            require_once __DIR__ . '/philsys_scan_common.php';
            $phil_id = preg_replace('/\D/', '', $phil_id);
            if (strlen($phil_id) !== 16) {
                throw new RegistrationError("Your PhilSys number must be 16 digits.");
            }
            if ($vIDType === 'National ID (PhilID/ePhilID)') {
                $philsysFront = $id_front;
                $philsysBack = $id_back;
                $scanToken = (string)($_POST['id_scan_token'] ?? '');
            } else {
                $philsysFront = uploadIdentityDocument('philsys_img_front', 'philsys_front', $base_upload_dir);
                $philsysBack = uploadIdentityDocument('philsys_img_back', 'philsys_back', $base_upload_dir);
                if (!$philsysFront || !$philsysBack) {
                    throw new RegistrationError("Please upload clear photos (JPEG, PNG, or WebP, max 10MB) of the front and back of your PhilSys card.");
                }
                $scanToken = (string)($_POST['philsys_scan_token'] ?? '');
            }
            $check = pb2_philsys_verify($conn, $scanToken, (string)@file_get_contents($philsysFront), $phil_id, $fName, $mName, $lName);
            $philsysStatus = $check['status'];
            $philsysReason = $check['reason'];
            if ($check['status'] !== 'Manual Entry') $philsysScanUsed = $scanToken;
        }

        // Verification selfie (migration 014): re-judged here from the stored
        // check with the name being registered. A failed check is accepted
        // but flagged 'Needs Review' for staff.
        require_once __DIR__ . '/selfie_check_common.php';
        $selfieCheck = pb2_selfie_finalize($conn, (string)($_POST['selfie_check_token'] ?? ''),
            (string)@file_get_contents($id_hold),
            array_filter([(string)@file_get_contents($id_front), $id_back ? (string)@file_get_contents($id_back) : '']),
            $fName, $lName);
        $selfieStatus = $selfieCheck['status'];
        $selfieNotes = $selfieCheck['notes'];

        // Compare what the ID scanner extracted (if the citizen used it) against
        // what was finally submitted. Computed server-side — never trust a
        // client-supplied verdict for this.
        $ocrSnapshot = null;
        $ocrConfidence = null;
        $verificationStatus = 'Manual Entry';
        $ocrSnapshotRaw = $_POST['id_ocr_snapshot'] ?? '';

        if ($ocrSnapshotRaw !== '') {
            $decodedSnapshot = json_decode($ocrSnapshotRaw, true);
            if (is_array($decodedSnapshot)) {
                $ocrSnapshot = $decodedSnapshot;
                $ocrConfidence = isset($decodedSnapshot['confidence']) && is_numeric($decodedSnapshot['confidence'])
                    ? (float)$decodedSnapshot['confidence']
                    : null;

                $normalizeForCompare = function ($value) {
                    $upper = function_exists('mb_strtoupper')
                        ? mb_strtoupper((string)$value, 'UTF-8')
                        : strtoupper((string)$value);
                    return trim(preg_replace('/\s+/', ' ', $upper));
                };

                // The scanner always sends these keys, but as an empty string when
                // OCR couldn't read that particular field — isset() alone treats an
                // empty string as "set", which would compare blank OCR data against
                // the citizen's real typed value and always fail. Only compare a
                // field when the scan actually produced non-empty text for it; a
                // field the scanner never read counts as "nothing to contradict",
                // not as a mismatch.
                $hasComparableName = isset($decodedSnapshot['fName'], $decodedSnapshot['lName'])
                    && trim((string)$decodedSnapshot['fName']) !== ''
                    && trim((string)$decodedSnapshot['lName']) !== '';
                $hasComparableBirthDate = isset($decodedSnapshot['birth_date'])
                    && trim((string)$decodedSnapshot['birth_date']) !== '';

                if (!$hasComparableName && !$hasComparableBirthDate) {
                    // Citizen used the scanner but it extracted nothing usable to
                    // verify against — equivalent to not having scanned at all.
                    $verificationStatus = 'Manual Entry';
                } else {
                    $namesMatch = !$hasComparableName || (
                        $normalizeForCompare($decodedSnapshot['fName']) === $normalizeForCompare($fName)
                        && $normalizeForCompare($decodedSnapshot['lName']) === $normalizeForCompare($lName)
                    );
                    $birthDateMatches = !$hasComparableBirthDate || $decodedSnapshot['birth_date'] === $b_date;

                    $verificationStatus = ($namesMatch && $birthDateMatches) ? 'Matched' : 'Mismatch';
                }
            }
        }

        $ocrSnapshotJson = $ocrSnapshot !== null ? json_encode($ocrSnapshot) : null;

        // The comparison above uses what the browser says the scanner read, so
        // it can't be trusted for automatic approval (migration 017). The ID
        // verdict that is saved and used comes from the server's own Vision
        // scan record of this exact photo instead ($idCheck, computed above).
        $verificationStatus = $idCheck['status'];
        $idAddressMatch = $idCheck['address_match'] === null ? null : ($idCheck['address_match'] ? 1 : 0);
        $duplicateReasons = pb2_find_duplicate_residents($conn, $fName, $lName, $b_date, $phil_id);

        mysqli_begin_transaction($conn);

        // Execution Part 1: Register credentials array
        $stmt1 = mysqli_prepare($conn, "INSERT INTO users (user_id, control_num, email, password_hash) VALUES (?, ?, ?, ?)");
        $email_lc = strtolower($email); // bind_param needs a variable, not an expression
        mysqli_stmt_bind_param($stmt1, "ssss", $user_id, $control_num, $email_lc, $pass_hash);
        mysqli_stmt_execute($stmt1);
        mysqli_stmt_close($stmt1);

        $empty_sector_doc = ""; 

        $sql2 = "INSERT INTO residents (
            user_id, control_num, fName, mName, lName, suffix, birth_date, gender, height, contact_num,
            civil_status, spouse_name_text, blood_type, birth_city, birth_province, birth_country, religion,
            is_senior, is_pwd, is_4ps, is_solo_parent, is_indigent, sector_validDoc,
            proof_pwd, proof_4ps, proof_solo_parent, proof_indigent,
            house_no, street, compound, zone, subdivision, area, block_lot, landmark, years_in_PB2, residency_status,
            contact_person, contactp_num, contactp_relationship, philsys_nat_id, valid_id,
            valid_id_img_front, valid_id_img_back, valid_id_img_holding, profile_picture, status,
            id_ocr_snapshot, id_ocr_confidence, id_verification_status, residing_since,
            philsys_img_front, philsys_img_back, philsys_verification_status,
            selfie_check_status, selfie_check_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)";

       $stmt2 = mysqli_prepare($conn, $sql2);

        // --- 17s + 5 sector flags(i) + 24s (incl. compound and profile_picture) + OCR (s d s) + residing_since (s) + PhilSys photos/status (sss) + selfie check (ss) = 55. ('age' is a GENERATED column: never insert it.) ---
        $types = "sssssssssssssssss" . "iiiii" . "ssssssssssssssssssssssss" . "sds" . "s" . "sss" . "ss";

        mysqli_stmt_bind_param($stmt2, $types,
            $user_id, $control_num,
            $fName, $mName, $lName, $suf,
            $b_date, $gender, $height, $c_num,
            $c_status, $sName, $bType, $birth_city, $birth_prov, $birth_ctry, $religion,
            $is_senior, $is_pwd, $is_4ps, $is_solo_parent, $is_indigent, $empty_sector_doc,
            $p_pwd, $p_4ps, $p_solo_parent, $p_indigent,
            $h_no, $street, $compound, $zone, $subdiv, $area, $b_lot, $l_mark,
            $years_val,
            $r_status, $c_person,
            $cp_num, $c_rel, $phil_id,
            $vIDType,
            $id_front, $id_back, $id_hold, $profile_pic,
            $ocrSnapshotJson, $ocrConfidence, $verificationStatus, $residingSince,
            $philsysFront, $philsysBack, $philsysStatus,
            $selfieStatus, $selfieNotes
        );

        mysqli_stmt_execute($stmt2);
        $new_resident_id = (int)mysqli_insert_id($conn);
        mysqli_stmt_close($stmt2);

        // Residency proof (under 6 months, or an ID without a PB2 address):
        // reviewed alongside the registration.
        if ($p_residency) {
            $proofType = $post('residency_proof_type');
            pb2_insert_residency_proof($conn, $new_resident_id, $proofType, $p_residency, null, null);
        }

        // The mobile number was confirmed by SMS above; record that and where
        // status updates should go (document requests always use both).
        $notifyChannel = in_array($post('notify_channel'), ['email', 'sms', 'both'], true) ? $post('notify_channel') : 'email';
        $stmtContact = mysqli_prepare($conn, "UPDATE residents SET mobile_verified_at = NOW(), notify_channel = ?, id_address_match = ? WHERE resident_id = ?");
        mysqli_stmt_bind_param($stmtContact, "sii", $notifyChannel, $idAddressMatch, $new_resident_id);
        mysqli_stmt_execute($stmtContact);
        mysqli_stmt_close($stmtContact);

        // Automatic approval (migration 017, rules in account_approval.php):
        // Active now when every server-side check passed, otherwise Pending
        // for staff with the reasons recorded.
        $decision = pb2_approval_decision($conn, [
            'id_status'      => $idCheck['status'],
            'id_reason'      => $idCheck['reason'],
            'selfie_status'  => $selfieStatus,
            'selfie_notes'   => $selfieNotes,
            'philsys_status' => $philsysStatus,
            'philsys_reason' => $philsysReason ?? '',
            'age'            => $age,
            'duplicates'     => $duplicateReasons,
            'residency_reason' => $residencyRule['review_reason'],
        ]);
        $heldSectors = [];
        if ($decision['auto']) {
            $stmtApprove = mysqli_prepare($conn, "UPDATE residents SET status = 'Active', approval_method = 'auto', review_reasons = NULL WHERE resident_id = ?");
            mysqli_stmt_bind_param($stmtApprove, "i", $new_resident_id);
            mysqli_stmt_execute($stmtApprove);
            mysqli_stmt_close($stmtApprove);
            // Sector claims still need a person to look at their documents.
            $heldSectors = pb2_hold_registration_sectors($conn, $user_id, $control_num, array_filter([
                'is_pwd' => $is_pwd ? $p_pwd : null,
                'is_4ps' => $is_4ps ? $p_4ps : null,
                'is_solo_parent' => $is_solo_parent ? $p_solo_parent : null,
                'is_indigent' => $is_indigent ? $p_indigent : null,
            ]));
        } else {
            $reasonsJson = json_encode($decision['reasons'], JSON_UNESCAPED_UNICODE);
            $stmtReview = mysqli_prepare($conn, "UPDATE residents SET review_reasons = ? WHERE resident_id = ?");
            mysqli_stmt_bind_param($stmtReview, "si", $reasonsJson, $new_resident_id);
            mysqli_stmt_execute($stmtReview);
            mysqli_stmt_close($stmtReview);
        }

        // 2. Clean up OTP only after the profile successfully saves
        $stmtClear = mysqli_prepare($conn, "DELETE FROM email_verifications WHERE email = ?");
        mysqli_stmt_bind_param($stmtClear, "s", $email);
        mysqli_stmt_execute($stmtClear);
        mysqli_stmt_close($stmtClear);
        pb2_vc_clear($conn, 'register', strtolower($email));

        mysqli_commit($conn);
        // Street / subdivision typed in but not on the pick list: queue it for staff (migration 026).
        require_once __DIR__ . '/address_common.php';
        pb2_address_note_unlisted($conn, $street, $subdiv);
        if ($philsysScanUsed) pb2_scan_mark_used($conn, $philsysScanUsed);
        if ($idCheck['status'] !== 'Manual Entry') pb2_scan_mark_used($conn, $idScanToken);
        if ($selfieCheck['token']) pb2_selfie_mark_used($conn, $selfieCheck['token']);
        $response["success"] = true;
        $response["auto_approved"] = $decision['auto'];
        $response["held_sectors"] = $heldSectors;
        $response["message"] = $decision['auto']
            ? "Your identity was verified and your account is active. You can log in now."
                . ($heldSectors ? " Your " . implode(', ', $heldSectors) . " status will apply once barangay staff check your document." : "")
            : "Profiling Complete: Your records have been submitted for official verification.";

    } else {
        $response["message"] = "Security Protocol: Invalid Request Method.";
    }

} catch (Throwable $e) {
    if (isset($conn) && $conn instanceof mysqli) {
        try { mysqli_rollback($conn); } catch (Throwable $ignored) {}
    }

    // The registration never completed, so don't leave its photos orphaned on
    // disk. The folder is keyed by a freshly generated control number, so
    // everything in it belongs to this request.
    if ($base_upload_dir && is_dir($base_upload_dir)) {
        foreach (glob($base_upload_dir . '*') ?: [] as $leftover) {
            if (is_file($leftover)) @unlink($leftover);
        }
        @rmdir($base_upload_dir);
    }

    if ($e instanceof RegistrationError) {
        $response["message"] = $e->getMessage();
        $response = array_merge($response, $e->extra);
    } else {
        error_log("register.php: " . $e->getMessage());
        $response["message"] = "We couldn't save your registration due to a server error. Please try again in a moment.";
    }
}

// GUARANTEE JSON: Wipe any accidental PHP warnings from the buffer before outputting
ob_end_clean();
echo json_encode($response);
?>