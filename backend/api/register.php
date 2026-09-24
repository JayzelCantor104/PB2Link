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
class RegistrationError extends Exception {}

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

    // Unique Control Number Generator with Collision Checking Verification Loop
    function generateUniqueControlNumber($conn, $birthDate, $firstName, $lastName) {
        $currentYear = date("Y");
        
        $timestamp = strtotime($birthDate);
        $bYear  = date("Y", $timestamp);
        $bMonth = date("m", $timestamp);
        $bDay   = date("d", $timestamp);
        
        $firstLetterName = substr(trim($firstName), 0, 1);
        $firstLetterSurn = substr(trim($lastName), 0, 1);
        
        $isUnique = false;
        $control_num = "";
        
        while (!$isUnique) {
            $letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            $randomLetters = $letters[rand(0, 25)] . $letters[rand(0, 25)];
            $randomNumber = rand(0, 9);
            
            $control_num = sprintf(
                "PB2-%s-%s%s%s%s%s%s%d",
                $currentYear,
                $bYear,
                $bMonth,
                $bDay,
                strtoupper($firstLetterName),
                strtoupper($firstLetterSurn),
                $randomLetters,
                $randomNumber
            );
            
            // Prepared Check against database to guarantee uniqueness
            $stmt = mysqli_prepare($conn, "SELECT resident_id FROM residents WHERE control_num = ?");
            mysqli_stmt_bind_param($stmt, "s", $control_num);
            mysqli_stmt_execute($stmt);
            $result = mysqli_stmt_get_result($stmt);
            
            if (mysqli_num_rows($result) === 0) {
                $isUnique = true;
            }
            mysqli_stmt_close($stmt);
        }
        return $control_num;
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

        // 1. Verify OTP Before Doing Anything Else
        $stmtFetch = mysqli_prepare($conn, "SELECT otp_hash, expires_at FROM email_verifications WHERE email = ?");
        mysqli_stmt_bind_param($stmtFetch, "s", $email);
        mysqli_stmt_execute($stmtFetch);
        $result = mysqli_stmt_get_result($stmtFetch);

        if ($row = mysqli_fetch_assoc($result)) {
            if (time() > strtotime($row['expires_at'])) {
                throw new RegistrationError("Your verification code has expired. Please request a new one.");
            }
            if (!password_verify($user_code, $row['otp_hash'])) {
                throw new RegistrationError("Incorrect verification code. Please re-enter the correct code.");
            }
        } else {
            throw new RegistrationError("No verification code was requested for this email. Please request a new one.");
        }
        mysqli_stmt_close($stmtFetch);
        
        
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
            'street' => 'Street', 'subdivision' => 'Subdivision',
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
        $yearsNum = filter_var($post('years_in_PB2'), FILTER_VALIDATE_INT);
        if ($yearsNum === false || $yearsNum < 0 || $yearsNum > 120) {
            throw new RegistrationError("Please enter a valid number of years in Pasong Buaya II.");
        }
        $allowedIdTypes = ['National ID (PhilID/ePhilID)', 'Passport', 'Drivers License', 'UMID (SSS/GSIS)', 'PRC ID', 'Postal ID', 'Voters ID', 'PhilHealth ID', 'TIN ID'];
        if (!in_array($post('valid_id'), $allowedIdTypes, true)) {
            throw new RegistrationError("Please select your government ID type.");
        }
        if (!$isTrue('privacy_agreed')) {
            throw new RegistrationError("You must accept the Data Privacy Statement.");
        }

        $requiredFiles = [
            'profile_picture' => 'Profile Photo', 'valid_id_img_front' => 'ID Front Photo',
            'valid_id_img_back' => 'ID Back Photo', 'valid_id_img_holding' => 'Selfie Holding ID',
        ];
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
        $control_num = generateUniqueControlNumber($conn, $_POST['birth_date'], $_POST['fName'], $_POST['lName']);
        $pass_hash = password_hash($_POST['password'] ?? '', PASSWORD_DEFAULT);

        // Nested Directory Generation matching structural isolation rules
        $base_upload_dir = "uploads/Resident_submitted_valid_ID/" . $control_num . "/";
        if (!is_dir($base_upload_dir)) {
            mkdir($base_upload_dir, 0777, true);
        }

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
        $id_back  = uploadIdentityDocument('valid_id_img_back', 'back_ID', $base_upload_dir);
        $id_hold  = uploadIdentityDocument('valid_id_img_holding', 'selfie_with_ID', $base_upload_dir);
        $profile_pic = uploadIdentityDocument('profile_picture', 'profile_picture', $base_upload_dir);

        // These columns are NOT NULL — fail with a clear message now rather than
        // letting an invalid/unreadable image (e.g. an unsupported HEIC photo)
        // hit the database constraint and surface as a generic exception later.
        if (!$id_front || !$id_back || !$id_hold) {
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

        // Senior status comes from the validated birth date, not the browser.
        // (residents.age itself is a generated column computed by the database.)
        $age            = (int)$bd->diff(new DateTime('today'))->y;
        $is_senior      = $age >= 60 ? 1 : 0;
        $is_pwd         = (($_POST['is_pwd'] ?? 'false') === 'true' ? 1 : 0);
        $is_4ps         = (($_POST['is_4ps'] ?? 'false') === 'true' ? 1 : 0);
        $is_solo_parent = (($_POST['is_solo_parent'] ?? 'false') === 'true' ? 1 : 0);
       $is_indigent    = (($_POST['is_indigent'] ?? 'false') === 'true' ? 1 : 0);
        
        // Fix: Treat as string (VARCHAR) to match your updated database schema
        $years_val      = trim($_POST['years_in_PB2'] ?? '1');

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
            house_no, street, zone, subdivision, area, block_lot, landmark, years_in_PB2, residency_status,
            contact_person, contactp_num, contactp_relationship, philsys_nat_id, valid_id,
            valid_id_img_front, valid_id_img_back, valid_id_img_holding, profile_picture, status,
            id_ocr_snapshot, id_ocr_confidence, id_verification_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)";

       $stmt2 = mysqli_prepare($conn, $sql2);

        // --- 17s + 5 sector flags(i) + 23s (incl. profile_picture) + OCR (s d s) = 48. ('age' is a GENERATED column: never insert it.) ---
        $types = "sssssssssssssssss" . "iiiii" . "sssssssssssssssssssssss" . "sds";

        mysqli_stmt_bind_param($stmt2, $types,
            $user_id, $control_num,
            $fName, $mName, $lName, $suf,
            $b_date, $gender, $height, $c_num,
            $c_status, $sName, $bType, $birth_city, $birth_prov, $birth_ctry, $religion,
            $is_senior, $is_pwd, $is_4ps, $is_solo_parent, $is_indigent, $empty_sector_doc,
            $p_pwd, $p_4ps, $p_solo_parent, $p_indigent,
            $h_no, $street, $zone, $subdiv, $area, $b_lot, $l_mark,
            $years_val,
            $r_status, $c_person,
            $cp_num, $c_rel, $phil_id,
            $vIDType,
            $id_front, $id_back, $id_hold, $profile_pic,
            $ocrSnapshotJson, $ocrConfidence, $verificationStatus
        );

        mysqli_stmt_execute($stmt2);
        mysqli_stmt_close($stmt2);

        // 2. Clean up OTP only after the profile successfully saves
        $stmtClear = mysqli_prepare($conn, "DELETE FROM email_verifications WHERE email = ?");
        mysqli_stmt_bind_param($stmtClear, "s", $email);
        mysqli_stmt_execute($stmtClear);
        mysqli_stmt_close($stmtClear);

        mysqli_commit($conn);
        $response["success"] = true;
        $response["message"] = "Profiling Complete: Your records have been submitted for official verification.";

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
    } else {
        error_log("register.php: " . $e->getMessage());
        $response["message"] = "We couldn't save your registration due to a server error. Please try again in a moment.";
    }
}

// GUARANTEE JSON: Wipe any accidental PHP warnings from the buffer before outputting
ob_end_clean();
echo json_encode($response);
?>