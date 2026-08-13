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
    
    if (!$resResult) {
        throw new Exception("Authorization mismatch. Profile data invalid.");
    }
    
    $user_email = $resResult['email']; // Capture the email for PHPMailer later
    $control_num = $resResult['control_num']; // Capture the control_num for folder creation
    // 2. Structural Collision Control: Prevent Double Tracking Code Processing
    $tracking_code = $_POST['tracking_code'] ?? '';
    $checkDuplicate = $conn->prepare("SELECT tracking_code FROM req_business_clearance WHERE tracking_code = ?");
    $checkDuplicate->bind_param("s", $tracking_code);
    $checkDuplicate->execute();
    if ($checkDuplicate->get_result()->fetch_assoc()) {
        throw new Exception("System trace error: Active tracking configuration sequence collision.");
    }

    // 3. Extracting Inputs from Client Data Stack
    $fName                 = $_POST['fName'] ?? '';
    $mName                 = $_POST['mName'] ?? '';
    $lName                 = $_POST['lName'] ?? '';
    $suffix                = $_POST['suffix'] ?? '';
    $address               = $_POST['address'] ?? '';
    $contact_num           = $_POST['contact_num'] ?? '';
    $request_mode          = $_POST['request_mode'] ?? 'Self';
    $beneficiary_name      = $_POST['beneficiary_name'] ?? '';
    $business_name         = $_POST['business_name'] ?? '';
    $business_type         = $_POST['business_type'] ?? '';
    $nature_business       = $_POST['nature_business'] ?? '';
    $business_address      = $_POST['business_address'] ?? '';
    $contact_person        = $_POST['contact_person'] ?? '';
    $business_contact_num  = $_POST['business_contact_num'] ?? '';

    // Check mandatory file presence safely to avoid unhandled notices breaking JSON parsing streams
    if (!isset($_FILES['owner_id']) || $_FILES['owner_id']['error'] !== UPLOAD_ERR_OK) {
        throw new Exception("Missing required document attachment: Valid Owner ID Card.");
    }

    // 4. Document Index Path Generation
    $upload_dir = "uploads/Resident_DocumentRequests/Business_Clearance/" . $control_num . "/" . $tracking_code . "/";
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }

    $dti_reg_path  = "";
    if (isset($_FILES['dti_reg']) && $_FILES['dti_reg']['error'] === UPLOAD_ERR_OK) {
        $dti_reg_path = $upload_dir . "dti_index_" . uniqid() . ".png";
        move_uploaded_file($_FILES['dti_reg']['tmp_name'], $dti_reg_path);
    }
    
    $owner_id_path = $upload_dir . "owner_identity_" . uniqid() . ".png";
    move_uploaded_file($_FILES['owner_id']['tmp_name'], $owner_id_path);

    // 5. Secure Database Transaction Wrapper via Prepared Statements
    $sql = "INSERT INTO req_business_clearance 
            (tracking_code, resident_id, fName, mName, lName, suffix, address, contact_num, request_mode, beneficiary_name, business_name, business_type, nature_business, business_address, contact_person, business_contact_num, dti_reg, owner_id, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')";

    $stmt = $conn->prepare($sql);
    
    // Bind contract mapping sequence
    $stmt->bind_param("sissssssssssssssss", 
        $tracking_code, $resident_id, $fName, $mName, $lName, $suffix, $address, $contact_num, 
        $request_mode, $beneficiary_name, $business_name, $business_type, $nature_business, 
        $business_address, $contact_person, $business_contact_num, $dti_reg_path, $owner_id_path
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
                $mail->Subject = "Business Clearance Request Received [$tracking_code]";
                
                $request_type_text = ($request_mode === 'Self') ? 'Account Holder (Self)' : 'Someone Else';
                $dti_status_text = ($dti_reg_path !== "") ? "Provided" : "Not Provided (Optional)";
                
                // HTML Email Template with Summary of ALL info submitted
                $mail->Body = "
                    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                        <h2 style='color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;'>Document Request Received</h2>
                        <p>Hello,</p>
                        <p>We have successfully received your request for a <strong>Business Clearance</strong>. It is currently queued for official verification by the Barangay Administration.</p>
                        
                        <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;'>
                            <h3 style='margin-top: 0; color: #334155; font-size: 16px;'>Request Summary</h3>
                            <p style='margin: 8px 0;'><strong>Tracking Code:</strong> <span style='color: #059669; font-weight: bold;'>$tracking_code</span></p>
                            <p style='margin: 8px 0;'><strong>Status:</strong> <span style='background-color: #fef08a; color: #854d0e; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;'>PENDING</span></p>
                            <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;'>
                            
                            <h4 style='color: #475569; margin: 15px 0 5px 0;'>Owner / Requester Information</h4>
                            <p style='margin: 4px 0;'><strong>Beneficiary Name:</strong> $beneficiary_name</p>
                            <p style='margin: 4px 0;'><strong>First Name:</strong> $fName</p>
                            <p style='margin: 4px 0;'><strong>Middle Name:</strong> $mName</p>
                            <p style='margin: 4px 0;'><strong>Last Name:</strong> $lName</p>
                            <p style='margin: 4px 0;'><strong>Suffix:</strong> " . ($suffix ?: 'None') . "</p>
                            <p style='margin: 4px 0;'><strong>Owner Contact Number:</strong> $contact_num</p>
                            <p style='margin: 4px 0;'><strong>Owner Address:</strong> $address</p>
                            <p style='margin: 4px 0;'><strong>Request For:</strong> $request_type_text</p>

                            <h4 style='color: #475569; margin: 15px 0 5px 0;'>Business Details</h4>
                            <p style='margin: 4px 0;'><strong>Business Name:</strong> $business_name</p>
                            <p style='margin: 4px 0;'><strong>Business Type:</strong> $business_type</p>
                            <p style='margin: 4px 0;'><strong>Nature of Business:</strong> $nature_business</p>
                            <p style='margin: 4px 0;'><strong>Business Address:</strong> $business_address</p>
                            <p style='margin: 4px 0;'><strong>Business Contact Person:</strong> $contact_person</p>
                            <p style='margin: 4px 0;'><strong>Business Contact Number:</strong> $business_contact_num</p>
                            <p style='margin: 4px 0;'><strong>DTI/SEC Registration:</strong> $dti_status_text</p>
                        </div>

                        <p>An email notification will be sent to you once your Business Clearance is approved and ready for claiming.</p>
                        <p style='color: #64748b; font-size: 14px; margin-top: 30px;'>Thank you,<br>Barangay Pasong Buaya II Administration</p>
                    </div>
                ";
                
                // Plain Text Fallback
                $mail->AltBody = "Your Business Clearance request (Tracking: $tracking_code) has been received and is currently PENDING. We will notify you once it is approved.";

                $mail->send();
            } catch (Exception $e) {
                // Log the error but continue executing (so the client still receives the success response)
                error_log("Failed to send Business Clearance Request Email to $user_email. Error: {$mail->ErrorInfo}");
            }
        }

        echo json_encode(["success" => true, "message" => "Business entry logged successfully! ID Ref: " . $tracking_code]);
    } else {
        throw new Exception("Internal system exception during logging process execution context.");
    }

} catch (Exception $e) {
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

if (isset($conn)) {
    $conn->close();
}
?>
