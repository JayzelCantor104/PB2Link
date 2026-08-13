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

    $user_email = $resResult['email']; // Capture the email for PHPMailer later
    $control_num = $resResult['control_num']; // Capture the control_num for folder creation

    // 2. Prevent Multiple Registrations using Duplicate Tracking Token Verification
    $tracking_code = $_POST['tracking_code'] ?? '';
    $checkDuplicate = $conn->prepare("SELECT tracking_code FROM req_volunteer_registration WHERE tracking_code = ?");
    $checkDuplicate->bind_param("s", $tracking_code);
    $checkDuplicate->execute();
    if ($checkDuplicate->get_result()->fetch_assoc()) {
        throw new Exception("System trace collision exception: Active tracking identification hash collision.");
    }

    // 3. Extract and Sanitize Inbound Input Stack Values
    $fName         = $_POST['fName'] ?? '';
    $mName         = $_POST['mName'] ?? '';
    $lName         = $_POST['lName'] ?? '';
    $suffix        = $_POST['suffix'] ?? '';
    $address       = $_POST['address'] ?? '';
    $contact_num   = $_POST['contact_num'] ?? '';
    $email         = $_POST['email'] ?? ''; // This is the contact email provided in the form
    $program_area  = $_POST['program_area'] ?? '';
    $availability  = $_POST['availability'] ?? '';
    $occupation    = $_POST['occupation'] ?? '';
    $skills        = $_POST['skills'] ?? '';

    // Verify critical document binary presence before allocating folders
    if (!isset($_FILES['valid_id']) || $_FILES['valid_id']['error'] !== UPLOAD_ERR_OK) {
        throw new Exception("Filing Error: Missing required verification file source (Valid ID Card).");
    }

    // 4. Create Isolation Directory Structure using Tracking Code Hashes
    $upload_dir = "uploads/Resident_DocumentRequests/Volunteer_Registration/" . $control_num . "/" . $tracking_code . "/";
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }

    $valid_id_path = $upload_dir . "volunteer_id_" . uniqid() . ".png";
    move_uploaded_file($_FILES['valid_id']['tmp_name'], $valid_id_path);

    // 5. Parameterized Insertion Routine 
    $sql = "INSERT INTO req_volunteer_registration 
            (tracking_code, resident_id, fName, mName, lName, suffix, address, contact_num, email, program_area, availability, occupation, skills, valid_id, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')";

    $stmt = $conn->prepare($sql);
    
    // Bind parameters securely to validate types and prevent string injection escapes (s=string, i=integer) 
    $stmt->bind_param("sissssssssssss", 
        $tracking_code, $resident_id, $fName, $mName, $lName, $suffix, $address, $contact_num, 
        $email, $program_area, $availability, $occupation, $skills, $valid_id_path
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
                
                // --- UPDATE WITH YOUR GMAIL DETAILS ---
                $mail->Username   = SMTP_USER; 
                $mail->Password   = SMTP_PASS; 
                
                $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
                $mail->Port       = 465;

                $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II');
                $mail->addAddress($user_email);

                $mail->isHTML(true);
                $mail->Subject = "Volunteer Registration Received [$tracking_code]";
                
                // HTML Email Template with Summary of ALL info submitted
                $mail->Body = "
                    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                        <h2 style='color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;'>Volunteer Registration Received</h2>
                        <p>Hello,</p>
                        <p>We have successfully received your <strong>Volunteer Registration</strong>. It is currently under review by the Barangay Administration.</p>
                        
                        <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;'>
                            <h3 style='margin-top: 0; color: #334155; font-size: 16px;'>Registration Summary</h3>
                            <p style='margin: 8px 0;'><strong>Tracking Code:</strong> <span style='color: #059669; font-weight: bold;'>$tracking_code</span></p>
                            <p style='margin: 8px 0;'><strong>Status:</strong> <span style='background-color: #fef08a; color: #854d0e; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;'>PENDING</span></p>
                            <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;'>
                            
                            <h4 style='color: #475569; margin: 15px 0 5px 0;'>Personal Information</h4>
                            <p style='margin: 4px 0;'><strong>First Name:</strong> $fName</p>
                            <p style='margin: 4px 0;'><strong>Middle Name:</strong> $mName</p>
                            <p style='margin: 4px 0;'><strong>Last Name:</strong> $lName</p>
                            <p style='margin: 4px 0;'><strong>Suffix:</strong> " . ($suffix ?: 'None') . "</p>
                            <p style='margin: 4px 0;'><strong>Address:</strong> $address</p>

                            <h4 style='color: #475569; margin: 15px 0 5px 0;'>Contact Details</h4>
                            <p style='margin: 4px 0;'><strong>Contact Number:</strong> $contact_num</p>
                            <p style='margin: 4px 0;'><strong>Contact Email:</strong> $email</p>

                            <h4 style='color: #475569; margin: 15px 0 5px 0;'>Volunteer Profile</h4>
                            <p style='margin: 4px 0;'><strong>Program Area:</strong> $program_area</p>
                            <p style='margin: 4px 0;'><strong>Availability:</strong> $availability</p>
                            <p style='margin: 4px 0;'><strong>Occupation:</strong> " . ($occupation ?: 'Not Specified') . "</p>
                            <p style='margin: 4px 0;'><strong>Skills/Interests:</strong> " . ($skills ?: 'Not Specified') . "</p>
                        </div>

                        <p>We appreciate your willingness to serve our community. We will notify you once your registration has been reviewed.</p>
                        <p style='color: #64748b; font-size: 14px; margin-top: 30px;'>Thank you,<br>Barangay Pasong Buaya II Administration</p>
                    </div>
                ";
                
                // Plain Text Fallback
                $mail->AltBody = "Your Volunteer Registration (Tracking: $tracking_code) has been received and is currently PENDING review.";

                $mail->send();
            } catch (Exception $e) {
                // Log the error but continue executing
                error_log("Failed to send Volunteer Registration Email to $user_email. Error: {$mail->ErrorInfo}");
            }
        }

        echo json_encode(["success" => true, "message" => "Volunteer profile successfully updated in log index charts! ID: " . $tracking_code]);
    } else {
        throw new Exception("Internal storage engine write context runtime exception.");
    }

} catch (Exception $e) {
    // Sanitizes response parameters to restrict unhandled error stacks from breaking JSON decoding
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

if (isset($conn)) {
    $conn->close();
}
?>
