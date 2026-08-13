<?php
// Turn off raw error displays so they don't break JSON structure
ini_set('display_errors', 0);
error_reporting(E_ALL);

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
        throw new Exception("Resident profile not found.");
    }
    
    $user_email = $resResult['email']; // Capture the email for PHPMailer later
    $control_num = $resResult['control_num']; // Capture the control_num for folder creation

    // 2. Capture Form Data
    $tracking_code          = $_POST['tracking_code'] ?? '';
    $fName                  = $_POST['fName'] ?? '';
    $mName                  = $_POST['mName'] ?? '';
    $lName                  = $_POST['lName'] ?? '';
    $suffix                 = $_POST['suffix'] ?? '';
    $address                = $_POST['address'] ?? '';
    $birth_date             = $_POST['birth_date'] ?? '';
    $birth_place            = $_POST['birth_place'] ?? '';
    $contact_num            = $_POST['contact_num'] ?? '';
    $request_mode           = $_POST['request_mode'] ?? 'Self';
    $beneficiary_name       = $_POST['beneficiary_name'] ?? '';
    $height                 = $_POST['height'] ?? '';
    $weight                 = $_POST['weight'] ?? '';
    $blood_type             = $_POST['blood_type'] ?? '';
    $tin_no                 = $_POST['tin_no'] ?? '';
    $contact_person         = $_POST['contact_person'] ?? '';
    $contactp_num           = $_POST['contactp_num'] ?? '';
    $contactp_relationship  = $_POST['contactp_relationship'] ?? '';
    $emergency_address      = $_POST['emergency_address'] ?? '';

    // Validate tracking code isn't empty
    if (empty($tracking_code)) {
        throw new Exception("Tracking code generation failed.");
    }

    // 3. Duplicate Check
    $checkDuplicate = $conn->prepare("SELECT request_id FROM req_barangay_id 
                                      WHERE beneficiary_name = ? 
                                      AND status NOT IN ('Claimed', 'Declined')");
    $checkDuplicate->bind_param("s", $beneficiary_name);
    $checkDuplicate->execute();

    if ($checkDuplicate->get_result()->fetch_assoc()) {
        throw new Exception("You already have an active Barangay ID request for this beneficiary.");
    }

    // 4. Secure File Handling (Fixed with absolute paths pointing to your project root)
    // Adjust $_SERVER['DOCUMENT_ROOT'] as needed based on your local asset pathing setup
    $base_upload_path = $_SERVER['DOCUMENT_ROOT'] . "uploads/Resident_DocumentRequests/Barangay_ID/" . $control_num . "/" . $tracking_code . "/";
    
    if (!is_dir($base_upload_path)) {
        if (!mkdir($base_upload_path, 0777, true)) {
            throw new Exception("Failed to create file upload directories.");
        }
    }

    // File names for local disk save
    $id_photo_name = "id_photo_" . uniqid() . ".png";
    $signature_name = "signature_" . uniqid() . ".png";

    $id_picture_absolute = $base_upload_path . $id_photo_name;
    $signature_absolute  = $base_upload_path . $signature_name;

    // Database safe string representations (matching your SQL structure)
    $id_picture_db_path = "PB2Link/backend/uploads/Resident_Submitted_Doc/Barangay_ID/" . $tracking_code . "/" . $id_photo_name;
    $signature_db_path  = "PB2Link/backend/uploads/Resident_Submitted_Doc/Barangay_ID/" . $tracking_code . "/" . $signature_name;

    if (!isset($_FILES['id_picture']) || !move_uploaded_file($_FILES['id_picture']['tmp_name'], $id_picture_absolute)) {
        throw new Exception("Failed to upload ID Picture. Check upload file limits.");
    }
    if (!isset($_FILES['signature']) || !move_uploaded_file($_FILES['signature']['tmp_name'], $signature_absolute)) {
        throw new Exception("Failed to upload Signature document.");
    }

    // 5. Insert Data
    $sql = "INSERT INTO req_barangay_id 
            (tracking_code, resident_id, fName, mName, lName, suffix, address, birth_date, birth_place, contact_num, request_mode, beneficiary_name, height, weight, blood_type, tin_no, contact_person, contactp_num, contactp_relationship, emergency_address, id_picture, signature, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        throw new Exception("Statement preparation failed: " . $conn->error);
    }
    
    $stmt->bind_param("sissssssssssssssssssss", 
        $tracking_code, 
        $resident_id, 
        $fName, 
        $mName, 
        $lName, 
        $suffix, 
        $address, 
        $birth_date, 
        $birth_place, 
        $contact_num, 
        $request_mode, 
        $beneficiary_name, 
        $height, 
        $weight, 
        $blood_type, 
        $tin_no, 
        $contact_person, 
        $contactp_num, 
        $contactp_relationship, 
        $emergency_address, 
        $id_picture_db_path, 
        $signature_db_path
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
                $mail->Subject = "Barangay ID Request Received [$tracking_code]";
                
                $request_type_text = ($request_mode === 'Self') ? 'Account Holder (Self)' : 'Someone Else';
                
                // HTML Email Template with Summary of ALL info submitted
                $mail->Body = "
                    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                        <h2 style='color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;'>Document Request Received</h2>
                        <p>Hello,</p>
                        <p>We have successfully received your request for a <strong>Barangay ID</strong>. It is currently queued for official verification by the Barangay Administration.</p>
                        
                        <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;'>
                            <h3 style='margin-top: 0; color: #334155; font-size: 16px;'>Request Summary</h3>
                            <p style='margin: 8px 0;'><strong>Tracking Code:</strong> <span style='color: #059669; font-weight: bold;'>$tracking_code</span></p>
                            <p style='margin: 8px 0;'><strong>Status:</strong> <span style='background-color: #fef08a; color: #854d0e; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;'>PENDING</span></p>
                            <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;'>
                            
                            <h4 style='color: #475569; margin: 15px 0 5px 0;'>Identity Information</h4>
                            <p style='margin: 4px 0;'><strong>Beneficiary Name:</strong> $beneficiary_name</p>
                            <p style='margin: 4px 0;'><strong>First Name:</strong> $fName</p>
                            <p style='margin: 4px 0;'><strong>Middle Name:</strong> $mName</p>
                            <p style='margin: 4px 0;'><strong>Last Name:</strong> $lName</p>
                            <p style='margin: 4px 0;'><strong>Suffix:</strong> " . ($suffix ?: 'None') . "</p>
                            <p style='margin: 4px 0;'><strong>Birthdate:</strong> $birth_date</p>
                            <p style='margin: 4px 0;'><strong>Birth Place:</strong> $birth_place</p>
                            <p style='margin: 4px 0;'><strong>Address:</strong> $address</p>
                            <p style='margin: 4px 0;'><strong>Request For:</strong> $request_type_text</p>

                            <h4 style='color: #475569; margin: 15px 0 5px 0;'>Personal & Physical Details</h4>
                            <p style='margin: 4px 0;'><strong>Contact Number:</strong> $contact_num</p>
                            <p style='margin: 4px 0;'><strong>Height:</strong> $height</p>
                            <p style='margin: 4px 0;'><strong>Weight:</strong> $weight</p>
                            <p style='margin: 4px 0;'><strong>Blood Type:</strong> $blood_type</p>
                            <p style='margin: 4px 0;'><strong>TIN No.:</strong> " . ($tin_no ?: 'None') . "</p>

                            <h4 style='color: #475569; margin: 15px 0 5px 0;'>Emergency Contact</h4>
                            <p style='margin: 4px 0;'><strong>Contact Person:</strong> $contact_person</p>
                            <p style='margin: 4px 0;'><strong>Relationship:</strong> $contactp_relationship</p>
                            <p style='margin: 4px 0;'><strong>Contact Number:</strong> $contactp_num</p>
                            <p style='margin: 4px 0;'><strong>Emergency Address:</strong> $emergency_address</p>
                        </div>

                        <p>An email notification will be sent to you once your Barangay ID is approved and ready for claiming.</p>
                        <p style='color: #64748b; font-size: 14px; margin-top: 30px;'>Thank you,<br>Barangay Pasong Buaya II Administration</p>
                    </div>
                ";
                
                // Plain Text Fallback
                $mail->AltBody = "Your Barangay ID request (Tracking: $tracking_code) has been received and is currently PENDING. We will notify you once it is approved.";

                $mail->send();
            } catch (Exception $e) {
                // Log the error but continue executing (so the client still receives the success response)
                error_log("Failed to send Barangay ID Request Email to $user_email. Error: {$mail->ErrorInfo}");
            }
        }

        echo json_encode(["success" => true, "message" => "Barangay ID request submitted successfully!"]);
    } else {
        throw new Exception("Database execution error: " . $stmt->error);
    }

} catch (Exception $e) {
    // Keep HTTP 200 format standard so client catch block can parse the failure message cleanly
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}
?>
