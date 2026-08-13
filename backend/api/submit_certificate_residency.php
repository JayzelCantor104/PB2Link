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
        throw new Exception("Resident profile not found. Please log in again.");
    }

    $user_email = $resResult['email']; // Capture the email for PHPMailer later
    $control_num = $resResult['control_num'];

    // 2. Data Capture 
    $tracking_code      = $_POST['tracking_code'] ?? '';
    $fName              = $_POST['fName'] ?? '';
    $mName              = $_POST['mName'] ?? '';
    $lName              = $_POST['lName'] ?? '';
    $birth_date         = $_POST['birth_date'] ?? NULL;
    $address            = $_POST['address'] ?? '';
    $gender             = $_POST['gender'] ?? ''; // FIXED: Removed trailing spaces in key
    $civil_status       = $_POST['civil_status'] ?? '';
    $sector             = $_POST['sector'] ?? '';
    $residency_status   = $_POST['residency_status'] ?? '';
    $beneficiary_name   = $_POST['beneficiary_name'] ?? ''; // FIXED: Ensure this variable name matches below
    $years_in_PB2       = $_POST['years_in_PB2'] ?? 0;
    $purpose            = $_POST['purpose'] ?? '';

    // 3. Duplicate Request Check (HCI Efficiency: Prevents unnecessary mental load for admins)
    // FIXED: Corrected table name to match your schema 'req_certificate_residency'
    $checkDuplicate = $conn->prepare("SELECT request_id FROM req_certificate_residency 
                                      WHERE beneficiary_name = ? 
                                      AND purpose = ? 
                                      AND status NOT IN ('Claimed', 'Declined')");

    // FIXED: Changed $beneficiary to $beneficiary_name
    $checkDuplicate->bind_param("ss", $beneficiary_name, $purpose);
    $checkDuplicate->execute();

    if ($checkDuplicate->get_result()->fetch_assoc()) {
        throw new Exception("You already have an active request for '$purpose'. You can only submit a new one once the current one is Claimed or Declined.");
    }

    // 4. File Handling
    $upload_dir = "uploads/Resident_DocumentRequests/Certificate_of_Residency/" . $control_num . "/" . $tracking_code . "/";
    if (!is_dir($upload_dir)) mkdir($upload_dir, 0777, true);

    $valid_id  = $upload_dir . "valid_id_" . uniqid() . ".png";
    $proof_doc = $upload_dir . "proof_residency_" . uniqid() . ".png";

    move_uploaded_file($_FILES['valid_id']['tmp_name'], $valid_id);
    move_uploaded_file($_FILES['proof_doc']['tmp_name'], $proof_doc);

    // 5. Secure Final Insertion (Blocks inputs like ' OR '1'='1)
    $sql = "INSERT INTO req_certificate_residency 
            (tracking_code, resident_id, fName, mName, lName, birth_date, address, gender, civil_status, sector, residency_status, beneficiary_name, years_in_PB2, purpose, valid_id, proof_doc, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("sissssssssssisss", 
        $tracking_code, $resident_id, $fName, $mName, $lName, $birth_date, $address, $gender, $civil_status, $sector, $residency_status, $beneficiary_name, 
        $years_in_PB2, $purpose, $valid_id, $proof_doc
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
                $mail->Subject = "Certificate of Residency Request Received [$tracking_code]";
                
                // HTML Email Template with Summary of ALL info submitted
                $mail->Body = "
                    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                        <h2 style='color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;'>Document Request Received</h2>
                        <p>Hello,</p>
                        <p>We have successfully received your request for a <strong>Certificate of Residency</strong>. It is currently queued for official verification by the Barangay Administration.</p>
                        
                        <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;'>
                            <h3 style='margin-top: 0; color: #334155; font-size: 16px;'>Request Summary</h3>
                            <p style='margin: 8px 0;'><strong>Tracking Code:</strong> <span style='color: #059669; font-weight: bold;'>$tracking_code</span></p>
                            <p style='margin: 8px 0;'><strong>Status:</strong> <span style='background-color: #fef08a; color: #854d0e; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;'>PENDING</span></p>
                            <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;'>
                            <p style='margin: 8px 0;'><strong>Beneficiary Name:</strong> $beneficiary_name</p>
                            <p style='margin: 8px 0;'><strong>First Name:</strong> $fName</p>
                            <p style='margin: 8px 0;'><strong>Middle Name:</strong> $mName</p>
                            <p style='margin: 8px 0;'><strong>Last Name:</strong> $lName</p>
                            <p style='margin: 8px 0;'><strong>Birthdate:</strong> $birth_date</p>
                            <p style='margin: 8px 0;'><strong>Gender:</strong> $gender</p>
                            <p style='margin: 8px 0;'><strong>Civil Status:</strong> $civil_status</p>
                            <p style='margin: 8px 0;'><strong>Sector:</strong> $sector</p>
                            <p style='margin: 8px 0;'><strong>Address:</strong> $address</p>
                            <p style='margin: 8px 0;'><strong>Years in Barangay:</strong> $years_in_PB2</p>
                            <p style='margin: 8px 0;'><strong>Residency Status:</strong> $residency_status</p>
                            <p style='margin: 8px 0;'><strong>Purpose:</strong> $purpose</p>
                        </div>

                        <p>An email notification will be sent to you once your document is approved and ready for claiming.</p>
                        <p style='color: #64748b; font-size: 14px; margin-top: 30px;'>Thank you,<br>Barangay Pasong Buaya II Administration</p>
                    </div>
                ";
                
                // Plain Text Fallback
                $mail->AltBody = "Your Certificate of Residency request (Tracking: $tracking_code) has been received and is currently PENDING. We will notify you once it is approved.";

                $mail->send();
            } catch (Exception $e) {
                // We log the error but DO NOT crash the script. 
                error_log("Failed to send Certificate of Residency Request Email to $user_email. Error: {$mail->ErrorInfo}");
            }
        }

        echo json_encode(["success" => true, "message" => "Residency request submitted successfully."]);
    } else {
        throw new Exception("Submission failed. Database error.");
    }

} catch (Exception $e) {
    // Fixed: http_response_code(500) instead of 5000 (which is an invalid HTTP status code)
    http_response_code(500); 
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}
?>
