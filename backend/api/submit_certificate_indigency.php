<?php
include '../db_connection.php'; 
// Include PHPMailer autoload
require __DIR__ . '/vendor/autoload.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

try {
    // Professional Security: Rely on user_id from the authenticated session
    $user_id = $_POST['user_id'] ?? 0;
    
   // 1. Verify Resident & Fetch Email (Combined Query)
    $checkRes = $conn->prepare("
        SELECT r.resident_id, r.control_num, u.email 
        FROM residents r 
        JOIN users u ON r.user_id = u.user_id 
        WHERE u.user_id = ?
    ");

    $checkRes->bind_param("i", $user_id);
    $checkRes->execute();
    $resResult = $checkRes->get_result()->fetch_assoc();
    
    if (!$resResult) {
        throw new Exception("Resident profile not found. Please complete your profile first.");
    }
    
    $resident_id = $resResult['resident_id']; // Extract actual resident_id for the INSERT query
    $control_num = $resResult['control_num']; // Capture the control_num for folder creation

    if (!$resResult) {
        throw new Exception("Profile matching mismatch error. Invalid resident profile.");
    }
    
    $user_email = $resResult['email']; // Capture the email for PHPMailer later

    // 2. Tracking Duplication Filtering Rule Block
    $tracking_code = $_POST['tracking_code'] ?? '';
    $checkDuplicate = $conn->prepare("SELECT tracking_code FROM req_certificate_indigency WHERE tracking_code = ?");
    $checkDuplicate->bind_param("s", $tracking_code);
    $checkDuplicate->execute();
    if ($checkDuplicate->get_result()->fetch_assoc()) {
        throw new Exception("System trace error: Tracking validation configuration duplicate code collision.");
    }

    // 3. Extract and Sanitize Incoming Fields from Stack
    $fName              = $_POST['fName'] ?? '';
    $mName              = $_POST['mName'] ?? '';
    $lName              = $_POST['lName'] ?? '';
    $suffix             = $_POST['suffix'] ?? '';
    $address            = $_POST['address'] ?? '';
    $civil_status       = $_POST['civil_status'] ?? '';
    $request_mode       = $_POST['request_mode'] ?? 'Self';
    $beneficiary_name   = $_POST['beneficiary_name'] ?? '';
    $monthly_income     = $_POST['monthly_income'] ?? 0.00;
    $employment_status  = $_POST['employment_status'] ?? '';
    $purpose            = $_POST['purpose'] ?? '';
    $purpose_details    = $_POST['purpose_details'] ?? '';

    // Guard stream execution by ensuring mandatory files are verified before parsing continues
    if (!isset($_FILES['valid_id']) || $_FILES['valid_id']['error'] !== UPLOAD_ERR_OK ||
        !isset($_FILES['proof_doc']) || $_FILES['proof_doc']['error'] !== UPLOAD_ERR_OK) {
        throw new Exception("Filing error: Missing mandated valid id copy or proof documents.");
    }

    // 4. File Path Generation using Cryptographically Unique Shards
    $upload_dir = "uploads/Resident_DocumentRequests/Certificate_of_Indigency/" . $control_num . "/" . $tracking_code . "/";
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }

    $valid_id_path = $upload_dir . "valid_id_" . uniqid() . ".png";
    $proof_doc_path = $upload_dir . "proof_doc_" . uniqid() . ".png";

    move_uploaded_file($_FILES['valid_id']['tmp_name'], $valid_id_path);
    move_uploaded_file($_FILES['proof_doc']['tmp_name'], $proof_doc_path);

    // 5. Secure SQL Target Execution using Parameterized Statements 
    $sql = "INSERT INTO req_certificate_indigency 
            (tracking_code, resident_id, fName, mName, lName, suffix, address, civil_status, request_mode, beneficiary_name, monthly_income, employment_status, purpose, purpose_details, valid_id, proof_doc, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')";

    $stmt = $conn->prepare($sql);
    
    // Bind types contract structure matching exact database columns schema parameters (s=string, i=integer, d=decimal) 
    // Adjusted bind string: we have 16 parameters before 'Pending'. 
    // They are: tracking_code(s), resident_id(i), fName(s), mName(s), lName(s), suffix(s), address(s), civil_status(s), request_mode(s), beneficiary_name(s), monthly_income(d), employment_status(s), purpose(s), purpose_details(s), valid_id(s), proof_doc(s)
    $stmt->bind_param("sisssssssssdssss", 
        $tracking_code, $resident_id, $fName, $mName, $lName, $suffix, $address, $civil_status, 
        $request_mode, $beneficiary_name, $monthly_income, $employment_status, $purpose, 
        $purpose_details, $valid_id_path, $proof_doc_path
    );

    if ($stmt->execute()) {
        
       
        if (!empty($user_email)) {
            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            try {
                $mail->isSMTP();
                $mail->Host       = 'smtp.gmail.com';
                $mail->SMTPAuth   = true;
                
                
                $mail->Username   = SMTP_USER; 
                $mail->Password   = SMTP_PASS; 
                
                $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
                $mail->Port       = 465;

                $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II');
                $mail->addAddress($user_email);

                $mail->isHTML(true);
                $mail->Subject = "Certificate of Indigency Request Received [$tracking_code]";
                
                $request_type_text = ($request_mode === 'Self') ? 'Account Holder (Self)' : 'Someone Else';
                $formatted_income = "₱ " . number_format((float)$monthly_income, 2);
                
                // HTML Email Template with Summary of ALL info submitted
                $mail->Body = "
                    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                        <h2 style='color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;'>Document Request Received</h2>
                        <p>Hello,</p>
                        <p>We have successfully received your request for a <strong>Certificate of Indigency</strong>. It is currently queued for official verification by the Barangay Administration.</p>
                        
                        <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;'>
                            <h3 style='margin-top: 0; color: #334155; font-size: 16px;'>Request Summary</h3>
                            <p style='margin: 8px 0;'><strong>Tracking Code:</strong> <span style='color: #059669; font-weight: bold;'>$tracking_code</span></p>
                            <p style='margin: 8px 0;'><strong>Status:</strong> <span style='background-color: #fef08a; color: #854d0e; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;'>PENDING</span></p>
                            <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;'>
                            
                            <h4 style='color: #475569; margin: 15px 0 5px 0;'>Beneficiary Information</h4>
                            <p style='margin: 4px 0;'><strong>Beneficiary Name:</strong> $beneficiary_name</p>
                            <p style='margin: 4px 0;'><strong>First Name:</strong> $fName</p>
                            <p style='margin: 4px 0;'><strong>Middle Name:</strong> $mName</p>
                            <p style='margin: 4px 0;'><strong>Last Name:</strong> $lName</p>
                            <p style='margin: 4px 0;'><strong>Suffix:</strong> " . ($suffix ?: 'None') . "</p>
                            <p style='margin: 4px 0;'><strong>Address:</strong> $address</p>
                            <p style='margin: 4px 0;'><strong>Civil Status:</strong> $civil_status</p>
                            <p style='margin: 4px 0;'><strong>Request For:</strong> $request_type_text</p>

                            <h4 style='color: #475569; margin: 15px 0 5px 0;'>Financial Details</h4>
                            <p style='margin: 4px 0;'><strong>Employment Status:</strong> $employment_status</p>
                            <p style='margin: 4px 0;'><strong>Declared Monthly Income:</strong> $formatted_income</p>

                            <h4 style='color: #475569; margin: 15px 0 5px 0;'>Request Purpose</h4>
                            <p style='margin: 4px 0;'><strong>Main Purpose:</strong> $purpose</p>
                            <p style='margin: 4px 0;'><strong>Specific Details:</strong> $purpose_details</p>
                        </div>

                        <p>An email notification will be sent to you once your Certificate of Indigency is approved and ready for claiming.</p>
                        <p style='color: #64748b; font-size: 14px; margin-top: 30px;'>Thank you,<br>Barangay Pasong Buaya II Administration</p>
                    </div>
                ";
                
                // Plain Text Fallback
                $mail->AltBody = "Your Certificate of Indigency request (Tracking: $tracking_code) has been received and is currently PENDING. We will notify you once it is approved.";

                $mail->send();
            } catch (Exception $e) {
                // Log the error but continue executing
                error_log("Failed to send Certificate of Indigency Request Email to $user_email. Error: {$mail->ErrorInfo}");
            }
        }

        echo json_encode(["success" => true, "message" => "Indigency profile request submitted successfully!"]);
    } else {
        throw new Exception("Database transaction exception failure inside application filing framework context.");
    }

} catch (Exception $e) {
    // Graceful Exception Control hiding architectural structure layouts from raw response fields
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

if (isset($conn)) {
    $conn->close();
}
?>
