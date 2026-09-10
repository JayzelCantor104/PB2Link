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

try {
    include "../db_connection.php";
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
                throw new Exception("Token Expired: The 10-minute validity period has elapsed.");
            }
            if (!password_verify($user_code, $row['otp_hash'])) {
                throw new Exception("Incorrect verification code. Please re-enter the correct code.");
            }
        } else {
            throw new Exception("Invalid Session: No registration handshake found for this identity.");
        }
        mysqli_stmt_close($stmtFetch);
        
        
        // Secure Prepared Check for Email Duplication
        $stmtCheck = mysqli_prepare($conn, "SELECT user_id FROM users WHERE email = ?");
        mysqli_stmt_bind_param($stmtCheck, "s", $email);
        mysqli_stmt_execute($stmtCheck);
        $resultCheck = mysqli_stmt_get_result($stmtCheck);
        
        if (mysqli_num_rows($resultCheck) > 0) {
            mysqli_stmt_close($stmtCheck);
            $response["message"] = "Official Record Error: This email address is already registered.";
            echo json_encode($response); 
            exit();
        }
        mysqli_stmt_close($stmtCheck);

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

        // These columns are NOT NULL — fail with a clear message now rather than
        // letting an invalid/unreadable image (e.g. an unsupported HEIC photo)
        // hit the database constraint and surface as a generic exception later.
        if (!$id_front || !$id_back || !$id_hold) {
            throw new Exception("Upload Error: One or more ID images could not be read as a valid JPEG, PNG, or WebP photo. Please re-upload clear photos in one of those formats.");
        }

        // Auxiliary sector proofs handler
        $p_pwd         = uploadProof('proof_pwd', $base_upload_dir);
        $p_4ps         = uploadProof('proof_4ps', $base_upload_dir);
        $p_solo_parent = uploadProof('proof_solo_parent', $base_upload_dir);
        $p_indigent    = uploadProof('proof_indigent', $base_upload_dir);

        $is_senior      = (($_POST['is_senior'] ?? 'false') === 'true' ? 1 : 0);
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
        $fName = strtoupper($_POST['fName'] ?? '');
        $mName = nullIfEmpty(strtoupper($_POST['mName'] ?? ''));
        $lName = strtoupper($_POST['lName'] ?? '');
        $sName = nullIfEmpty(strtoupper($_POST['spouse_name_text'] ?? ''));
        
        $birth_city = strtoupper($_POST['birth_city'] ?? 'IMUS CITY');
        $birth_prov = strtoupper($_POST['birth_province'] ?? 'CAVITE');
        $birth_ctry = strtoupper($_POST['birth_country'] ?? 'PHILIPPINES');
        $religion   = strtoupper($_POST['religion'] ?? '');
        
        $h_no   = strtoupper($_POST['house_no'] ?? '');
        $street = strtoupper($_POST['street'] ?? '');
        $zone   = strtoupper($_POST['zone'] ?? '');
        $subdiv = nullIfEmpty(strtoupper($_POST['subdivision'] ?? ''));
        $area   = nullIfEmpty(strtoupper($_POST['area'] ?? ''));
        $b_lot  = nullIfEmpty(strtoupper($_POST['block_lot'] ?? ''));
        $l_mark = nullIfEmpty(strtoupper($_POST['landmark'] ?? ''));
        
        $c_person = strtoupper($_POST['contact_person'] ?? '');
        $c_rel    = strtoupper($_POST['contactp_relationship'] ?? '');

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
        $stmt1 = mysqli_prepare($conn, "INSERT INTO users (user_id, email, password_hash) VALUES (?, ?, ?)");
        mysqli_stmt_bind_param($stmt1, "sss", $user_id, strtolower($email), $pass_hash);
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
            valid_id_img_front, valid_id_img_back, valid_id_img_holding, status,
            id_ocr_snapshot, id_ocr_confidence, id_verification_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)";

       $stmt2 = mysqli_prepare($conn, $sql2);

        // --- 17s + 5i + 22s + (s d s) for the OCR verification columns = 47 characters ---
        $types = "sssssssssssssssssiiiiissssssssssssssssssssss" . "sds";

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
            $id_front, $id_back, $id_hold,
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

} catch (Exception $e) {
    if (isset($conn) && $conn instanceof mysqli) mysqli_rollback($conn);
    $response["message"] = "System Exception: " . $e->getMessage();
}

// GUARANTEE JSON: Wipe any accidental PHP warnings from the buffer before outputting
ob_end_clean();
echo json_encode($response);
?>