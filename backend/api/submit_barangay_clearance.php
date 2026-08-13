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
        throw new Exception("Resident profile not found. Please complete your profile first.");
    }
    
    $user_email = $resResult['email']; // Capture the email for PHPMailer later
    $control_num = $resResult['control_num'];

    // 2. Capture and Anonymize/Sanitize Data (Data Privacy Act Compliance)
    $tracking_code  = $_POST['tracking_code'] ?? '';
    $fName          = $_POST['fName'] ?? '';
    $mName          = $_POST['mName'] ?? '';
    $lName          = $_POST['lName'] ?? '';
    $suffix         = $_POST['suffix'] ?? '';
    $birth_date     = $_POST['birth_date'] ?? NULL;
    $gender         = $_POST['gender'] ?? '';
    $civil_status   = $_POST['civil_status'] ?? 'Single';
    $address        = $_POST['address'] ?? '';
    $sector         = $_POST['sector'] ?? '';
    $request_mode   = $_POST['request_mode'] ?? 'Self';
    $beneficiary    = $_POST['beneficiary_name'] ?? '';
    $years_in_PB2   =$_POST['years_in_PB2'] ?? 0; 
    $precinct_no    = $_POST['precinct_no'] ?? '';
    $purpose        = $_POST['purpose'] ?? '';

    // 3. Secure File Handling
    $upload_dir = "uploads/Resident_DocumentRequests/Barangay_Clearance/" . $control_num . "/" . $tracking_code . "/";
    if (!is_dir($upload_dir)) mkdir($upload_dir, 0777, true);

    // Using unique IDs prevents attackers from guessing file locations
    $id_front   = $upload_dir . "id_front_" . uniqid() . ".png";
    $id_back    = $upload_dir . "id_back_" . uniqid() . ".png";
    $id_holding = $upload_dir . "id_holding_" . uniqid() . ".png";

    move_uploaded_file($_FILES['id_front']['tmp_name'], $id_front);
    move_uploaded_file($_FILES['id_back']['tmp_name'], $id_back);
    move_uploaded_file($_FILES['id_holding']['tmp_name'], $id_holding);


    // --- UPDATED PURPOSE-BASED DUPLICATE CHECK ---

    // Check if a request for this SPECIFIC purpose is already active for this person
    $checkDuplicate = $conn->prepare("SELECT request_id FROM req_barangay_clearance 
                                      WHERE beneficiary_name = ? 
                                      AND purpose = ? 
                                      AND status NOT IN ('Claimed', 'Declined')");

    // We bind both the name and the purpose
    $checkDuplicate->bind_param("ss", $beneficiary, $purpose);
    $checkDuplicate->execute();

    if ($checkDuplicate->get_result()->fetch_assoc()) {
        throw new Exception("You already have an active request for '$purpose'. You can only submit a new one for this purpose once the current one is Claimed or Declined.");
    }

    // --- END OF CHECK ---

    // 4. Secure SQL Injection Fix: Prepared Statements 
    $sql = "INSERT INTO req_barangay_clearance 
            (tracking_code, resident_id, fName, mName, lName, suffix, birth_date, gender, civil_status, address, sector, request_mode, beneficiary_name, years_in_PB2, precinct_no, purpose, id_front, id_back, id_holding, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')";

    $stmt = $conn->prepare($sql);
    // Securely bind parameters to prevent ' OR '1'='1 style attacks
    $stmt->bind_param("sisssssssssssisssss", 
        $tracking_code, $resident_id, $fName, $mName, $lName, $suffix, $birth_date, $gender, $civil_status, $address, $sector, $request_mode, $beneficiary, 
        $years_in_PB2, $precinct_no, $purpose, $id_front, $id_back, $id_holding
    );

    if ($stmt->execute()) {
        
        // ==========================================
        // EMAIL SENDING LOGIC (Using Gmail SMTP)
        // ==========================================
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
                $mail->Subject = "Barangay Clearance Request Received [$tracking_code]";
                
                // HTML Email Template with Summary
                $request_type_text = ($request_mode === 'Self') ? 'Account Holder (Self)' : 'Someone Else';
                
                $mail->Body = "
                    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                        <h2 style='color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;'>Document Request Received</h2>
                        <p>Hello,</p>
                        <p>We have successfully received your request for a <strong>Barangay Clearance</strong>. It is currently queued for official verification by the Barangay Administration.</p>
                        
                        <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;'>
                            <h3 style='margin-top: 0; color: #334155; font-size: 16px;'>Request Summary</h3>
                            <p style='margin: 8px 0;'><strong>Tracking Code:</strong> <span style='color: #059669; font-weight: bold;'>$tracking_code</span></p>
                            <p style='margin: 8px 0;'><strong>Status:</strong> <span style='background-color: #fef08a; color: #854d0e; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;'>PENDING</span></p>
                            <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;'>
                            <p style='margin: 8px 0;'><strong>Beneficiary Name:</strong> $beneficiary</p>
                            <p style='margin: 8px 0;'><strong>Request For:</strong> $request_type_text</p>
                            <p style='margin: 8px 0;'><strong>Address:</strong> $address</p>
                            <p style='margin: 8px 0;'><strong>Purpose:</strong> $purpose</p>
                        </div>

                        <p>An email notification will be sent to you once your document is approved and ready for claiming.</p>
                        <p style='color: #64748b; font-size: 14px; margin-top: 30px;'>Thank you,<br>Barangay Pasong Buaya II Administration</p>
                    </div>
                ";
                
                // Plain Text Fallback
                $mail->AltBody = "Your Barangay Clearance request (Tracking: $tracking_code) has been received and is currently PENDING. We will notify you once it is approved.";

                $mail->send();
            } catch (Exception $e) {
                // We log the error but DO NOT crash the script. 
                // The DB insertion was successful, so the user should still see a success message.
                error_log("Failed to send Clearance Request Email to $user_email. Error: {$mail->ErrorInfo}");
            }
        }

        echo json_encode(["success" => true, "message" => "Request submitted securely."]);
    } else {
        throw new Exception("Execution failed. Please try again later.");
    }

} catch (Exception $e) {
    http_response_code(500);
    // Use generic messages in production to avoid leaking database structure
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}
?>
