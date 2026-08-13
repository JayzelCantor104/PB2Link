<?php 
header("Access-Control-Allow-Origin: *"); 
header("Access-Control-Allow-Methods: POST, OPTIONS"); 
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With"); 
header("Content-Type: application/json"); 

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(200); 
    exit(); 
} 

include '../db_connection.php'; 

// --- INTEGRATE PHPMAILER NAMESPACES --- 
require_once __DIR__ . '/vendor/autoload.php'; 
use PHPMailer\PHPMailer\PHPMailer; 
use PHPMailer\PHPMailer\Exception; 
// -------------------------------------- 

if (!$conn) { 
    echo json_encode(["success" => false, "message" => "Database connection failed."]); 
    exit; 
} 

if ($_SERVER['REQUEST_METHOD'] === 'POST') { 
    $resident_id = $_POST['resident_id']; 
    $tracking_code = $_POST['tracking_code']; 
    $venue = $_POST['venue']; 
    $date = $_POST['date']; 
    $time_slot = $_POST['time_slot']; 
    $purpose = $_POST['purpose']; 
    $contact_name = $_POST['contact_name']; 
    $contact_number = $_POST['contact_number']; 

    // --- NEW FIX: Fetch the control_num for folder creation ---
    $getControlNum = $conn->prepare("SELECT control_num FROM residents WHERE resident_id = ?");
    $getControlNum->bind_param("i", $resident_id);
    $getControlNum->execute();
    $cnResult = $getControlNum->get_result()->fetch_assoc();
    $control_num = $cnResult ? $cnResult['control_num'] : 'UNKNOWN';
    $getControlNum->close();
    // ----------------------------------------------------------

    // 1. Prevent duplicate bookings (Original Check)
    $check = $conn->prepare("SELECT request_id FROM req_amenity_reservation WHERE venue = ? AND reservation_date = ? AND time_slot = ? AND status IN ('Approved', 'Pending', 'Processing')"); 
    $check->bind_param("sss", $venue, $date, $time_slot); 
    $check->execute(); 
    if ($check->get_result()->num_rows > 0) { 
        echo json_encode(["success" => false, "message" => "This slot has just been reserved. Please try another time."]); 
        exit; 
    } 

    // ------------------------------------------------------------------------
    // NEW RESTRICTION 2: RESIDENT ABUSE / MONOPOLIZATION PREVENTION
    // ------------------------------------------------------------------------
    // Check if this resident already holds 2 or more active/pending reservations
    $abuseCheck = $conn->prepare("SELECT COUNT(*) as active_bookings FROM req_amenity_reservation WHERE resident_id = ? AND status IN ('Pending', 'Approved', 'Processing')");
    $abuseCheck->bind_param("i", $resident_id);
    $abuseCheck->execute();
    $abuseResult = $abuseCheck->get_result()->fetch_assoc();
    
    if ($abuseResult['active_bookings'] >= 2) {
        echo json_encode([
            "success" => false, 
            "message" => "Booking Limit Reached: You can hold a maximum of 2 active or pending facility reservations at any given time to ensure fair access for everyone."
        ]);
        $abuseCheck->close();
        $conn->close();
        exit;
    }
    $abuseCheck->close();

    // ------------------------------------------------------------------------
    // NEW RESTRICTION 3: ABSOLUTE BOOKING WINDOWS (MIN / MAX LEAD TIME)
    // ------------------------------------------------------------------------
    try {
        $bookingDateObj = new DateTime($date);
        $todayObj = new DateTime();
        $todayObj->setTime(0, 0, 0); // Clear current time elements for crisp calendar evaluation

        $interval = $todayObj->diff($bookingDateObj);
        $daysDifference = (int)$interval->format("%r%a"); // Yields negative integer if picking a past date

        // Guardrail A: 24-hour baseline maintenance notice buffer 
        if ($daysDifference < 1) {
            echo json_encode([
                "success" => false, 
                "message" => "Invalid Reservation Date: Bookings must be scheduled at least 24 hours in advance to allow operational preparation."
            ]);
            $conn->close();
            exit;
        }

        // Guardrail B: 60-day maximum visibility window
        if ($daysDifference > 60) {
            echo json_encode([
                "success" => false, 
                "message" => "Invalid Reservation Date: To ensure open schedules, you cannot reserve neighborhood amenities more than 60 days into the future."
            ]);
            $conn->close();
            exit;
        }
    } catch (Exception $dateException) {
        echo json_encode(["success" => false, "message" => "Invalid date format submitted."]);
        $conn->close();
        exit;
    }
    // ------------------------------------------------------------------------


    // Move up 2 levels from /backend/api to root /uploads/ 
    $upload_dir = "uploads/Resident_FacilityBookings/" . $control_num . "/" . $tracking_code . "/"; 
    if (!is_dir($upload_dir)) { 
        mkdir($upload_dir, 0777, true); 
    } 

    $id_front_path = ""; 
    $id_holding_path = ""; 
    $file_hash = substr(md5(time() . mt_rand()), 0, 13); 

    if (isset($_FILES['id_front']) && $_FILES['id_front']['error'] === UPLOAD_ERR_OK) { 
        $ext = pathinfo($_FILES["id_front"]["name"], PATHINFO_EXTENSION); 
        $filename = $file_hash . "_front." . $ext; 
        if (move_uploaded_file($_FILES["id_front"]["tmp_name"], $upload_dir . $filename)) { 
            $id_front_path = "uploads/" . $filename; 
        } 
    } 

    if (isset($_FILES['id_holding']) && $_FILES['id_holding']['error'] === UPLOAD_ERR_OK) { 
        $ext = pathinfo($_FILES["id_holding"]["name"], PATHINFO_EXTENSION); 
        $filename = $file_hash . "_holding." . $ext; 
        if (move_uploaded_file($_FILES["id_holding"]["tmp_name"], $upload_dir . $filename)) { 
            $id_holding_path = "uploads/" . $filename; 
        } 
    } 

    $stmt = $conn->prepare("INSERT INTO req_amenity_reservation (resident_id, tracking_code, venue, reservation_date, time_slot, purpose, contact_name, contact_number, id_front, id_holding, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')"); 
    $stmt->bind_param("isssssssss", $resident_id, $tracking_code, $venue, $date, $time_slot, $purpose, $contact_name, $contact_number, $id_front_path, $id_holding_path); 

    if ($stmt->execute()) { 
        // --- START OF PHPMAILER RECEIPT DISPATCH --- 
        $email_stmt = $conn->prepare("SELECT email FROM users WHERE user_id = (SELECT user_id FROM residents WHERE resident_id = ?) LIMIT 1"); 
        if (!$email_stmt) { 
            $email_stmt = $conn->prepare("SELECT email FROM users WHERE user_id = ? LIMIT 1"); 
        } 
        $email_stmt->bind_param("i", $resident_id); 
        $email_stmt->execute(); 
        $email_res = $email_stmt->get_result()->fetch_assoc(); 
        $resident_email = $email_res['email'] ?? ''; 

        if (!empty($resident_email)) { 
            $mail = new PHPMailer(true); 
            try { 
                $mail->isSMTP(); 
                $mail->Host       = 'smtp.gmail.com'; 
                $mail->SMTPAuth   = true; 
                $mail->Username   = SMTP_USER; 
                $mail->Password   = SMTP_PASS; 
                $mail->SMTPSecure = 'ssl'; 
                $mail->Port       = 465; 
                
                $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II'); 
                $mail->addAddress($resident_email); 
                $mail->isHTML(true); 
                $mail->Subject = 'Reservation Logged - Reference: ' . $tracking_code; 
                $mail->Body    = " 
                    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'> 
                        <h2 style='color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;'>Facility Reservation Received</h2> 
                        <p>Dear " . htmlspecialchars($contact_name) . ",</p> 
                        <p>Your reservation request has been successfully submitted and is now pending administrative document review.</p> 
                        <table style='width: 100%; border-collapse: collapse; margin: 20px 0;'> 
                            <tr style='background: #f8fafc;'> 
                                <td style='padding: 10px; font-weight: bold; border: 1px solid #cbd5e1; width: 40%;'>Tracking Reference:</td> 
                                <td style='padding: 10px; border: 1px solid #cbd5e1; color: #b45309; font-family: monospace; font-weight: bold;'>" . htmlspecialchars($tracking_code) . "</td> 
                            </tr> 
                            <tr> 
                                <td style='padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;'>Facility / Venue:</td> 
                                <td style='padding: 10px; border: 1px solid #cbd5e1;'>" . htmlspecialchars($venue) . "</td> 
                            </tr> 
                            <tr style='background: #f8fafc;'> 
                                <td style='padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;'>Target Date:</td> 
                                <td style='padding: 10px; border: 1px solid #cbd5e1;'>" . htmlspecialchars($date) . "</td> 
                            </tr> 
                            <tr> 
                                <td style='padding: 10px; font-weight: bold; border: 1px solid #cbd5e1;'>Time Frame Slot:</td> 
                                <td style='padding: 10px; border: 1px solid #cbd5e1;'>" . htmlspecialchars($time_slot) . "</td> 
                            </tr> 
                        </table> 
                        <p style='color: #64748b; font-size: 14px;'>You can use your Tracking Reference ID to check the status of your reservation request anytime from your dashboard tracker.</p> 
                        <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;'> 
                        <p style='color: #64748b; font-size: 14px;'>Thank you,<br>Barangay Pasong Buaya II Administration</p> 
                    </div> 
                "; 
                $mail->send(); 
            } catch (Exception $e) { 
                // Quiet catch so minor SMTP issues won't break client-side execution experience
            } 
        } 
        // --- END OF PHPMAILER RECEIPT DISPATCH --- 

        echo json_encode(["success" => true, "message" => "Reservation submitted successfully! Tracking ID: " . $tracking_code]); 
    } else { 
        echo json_encode(["success" => false, "message" => "Database insertion failed."]); 
    } 
    $stmt->close(); 
    $conn->close(); 
} 
?>