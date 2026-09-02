<?php 
// 1. Output buffering to ensure stray warnings never corrupt JSON output
ob_start();

// 2. CORS and Content Headers
header("Access-Control-Allow-Origin: *"); 
header("Access-Control-Allow-Methods: POST, OPTIONS"); 
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With"); 
header("Content-Type: application/json; charset=UTF-8"); 

// Turn off display of PHP errors to prevent HTML formatting in JSON responses
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Pre-flight OPTIONS handling
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    ob_clean();
    http_response_code(200); 
    exit(); 
} 

try {
    // 3. Database Connection
    $db_path = __DIR__ . '/../db_connection.php';
    if (!file_exists($db_path)) {
        throw new Exception("Database connection file missing.");
    }
    include_once $db_path; 

    if (!isset($conn) || $conn->connect_error) { 
        throw new Exception("Database connection failed.");
    } 

    // 4. Safe PHPMailer Inclusion (Checks local api/ vendor first, then parent backend/ vendor)
    $autoload_path = __DIR__ . '/vendor/autoload.php';
    if (!file_exists($autoload_path)) {
        $autoload_path = __DIR__ . '/../vendor/autoload.php';
    }

    $has_mailer = false;
    if (file_exists($autoload_path)) {
        require_once $autoload_path;
        $has_mailer = true;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') { 
        // Normalize parameter inputs from React request
        $resident_id    = $_POST['resident_id'] ?? null; 
        $tracking_code  = $_POST['tracking_code'] ?? null; 
        $venue          = $_POST['venue'] ?? $_POST['amenity_id'] ?? null; 
        $date           = $_POST['date'] ?? $_POST['reservation_date'] ?? null; 
        $time_slot      = $_POST['time_slot'] ?? null; 
        $purpose        = $_POST['purpose'] ?? ''; 
        $contact_name   = $_POST['contact_name'] ?? ''; 
        $contact_number = $_POST['contact_number'] ?? ''; 

        if (!$resident_id || !$venue || !$date) {
            throw new Exception("Missing required reservation fields (Resident ID, Venue/Amenity, or Date).");
        }

        // Fetch resident control_num for structured image uploads
        $control_num = 'UNKNOWN';
        $getControlNum = $conn->prepare("SELECT control_num FROM residents WHERE resident_id = ?");
        if ($getControlNum) {
            $getControlNum->bind_param("i", $resident_id);
            $getControlNum->execute();
            $cnResult = $getControlNum->get_result()->fetch_assoc();
            if ($cnResult && isset($cnResult['control_num'])) {
                $control_num = $cnResult['control_num'];
            }
            $getControlNum->close();
        }

        // 1. Prevent duplicate bookings for the exact same slot and venue
        $check = $conn->prepare("SELECT request_id FROM req_amenity_reservation WHERE venue = ? AND reservation_date = ? AND time_slot = ? AND status IN ('Approved', 'Pending', 'Processing')"); 
        if ($check) {
            $check->bind_param("sss", $venue, $date, $time_slot); 
            $check->execute(); 
            if ($check->get_result()->num_rows > 0) { 
                throw new Exception("This slot has just been reserved. Please try another time.");
            } 
            $check->close();
        }

        // 2. Prevent Booking Limit Abuse (Max 2 active/pending requests)
        $abuseCheck = $conn->prepare("SELECT COUNT(*) as active_bookings FROM req_amenity_reservation WHERE resident_id = ? AND status IN ('Pending', 'Approved', 'Processing')");
        if ($abuseCheck) {
            $abuseCheck->bind_param("i", $resident_id);
            $abuseCheck->execute();
            $abuseResult = $abuseCheck->get_result()->fetch_assoc();
            
            if ($abuseResult && $abuseResult['active_bookings'] >= 2) {
                throw new Exception("Booking Limit Reached: You can hold a maximum of 2 active or pending facility reservations.");
            }
            $abuseCheck->close();
        }

        // 3. File Uploads Directory Handling
        $upload_dir = __DIR__ . "/../uploads/Resident_FacilityBookings/" . $control_num . "/" . $tracking_code . "/"; 
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
                $id_front_path = "uploads/Resident_FacilityBookings/" . $control_num . "/" . $tracking_code . "/" . $filename; 
            } 
        } 

        if (isset($_FILES['id_holding']) && $_FILES['id_holding']['error'] === UPLOAD_ERR_OK) { 
            $ext = pathinfo($_FILES["id_holding"]["name"], PATHINFO_EXTENSION); 
            $filename = $file_hash . "_holding." . $ext; 
            if (move_uploaded_file($_FILES["id_holding"]["tmp_name"], $upload_dir . $filename)) { 
                $id_holding_path = "uploads/Resident_FacilityBookings/" . $control_num . "/" . $tracking_code . "/" . $filename; 
            } 
        } 

        // 4. Insert Reservation Record into Database
        $stmt = $conn->prepare("INSERT INTO req_amenity_reservation (resident_id, tracking_code, venue, reservation_date, time_slot, purpose, contact_name, contact_number, id_front, id_holding, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')"); 
        
        if (!$stmt) {
            throw new Exception("Database prepare statement error: " . $conn->error);
        }

        $stmt->bind_param("isssssssss", $resident_id, $tracking_code, $venue, $date, $time_slot, $purpose, $contact_name, $contact_number, $id_front_path, $id_holding_path); 

        if (!$stmt->execute()) {
            throw new Exception("Database execution error: " . $stmt->error);
        }

        // 5. Send Confirmation Email (Only runs if autoload/PHPMailer exists)
        if ($has_mailer && class_exists('PHPMailer\PHPMailer\PHPMailer')) {
            try {
                $email_stmt = $conn->prepare("SELECT email FROM users WHERE user_id = (SELECT user_id FROM residents WHERE resident_id = ?) LIMIT 1"); 
                if ($email_stmt) {
                    $email_stmt->bind_param("i", $resident_id); 
                    $email_stmt->execute(); 
                    $email_res = $email_stmt->get_result()->fetch_assoc(); 
                    $resident_email = $email_res['email'] ?? ''; 

                    if (!empty($resident_email)) { 
                        $mail = new PHPMailer\PHPMailer\PHPMailer(true); 
                        $mail->isSMTP(); 
                        $mail->Host       = 'smtp.gmail.com'; 
                        $mail->SMTPAuth   = true; 
                        
                        // Replace with your active credentials or define constants in db_connection.php
                        $mail->Username   = defined('SMTP_USER') ? SMTP_USER : 'jzelcantor@gmail.com'; 
                        $mail->Password   = defined('SMTP_PASS') ? SMTP_PASS : 'ujkxkwahegmirrun'; 
                        $mail->SMTPSecure = 'ssl'; 
                        $mail->Port       = 465; 
                        
                        $mail->setFrom(defined('SMTP_FROM_EMAIL') ? SMTP_FROM_EMAIL : 'noreply@pasongbuaya2.com', 'Barangay Pasong Buaya II'); 
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
                                <p style='color: #64748b; font-size: 14px;'>You can use your Tracking Reference ID to check the status of your request anytime.</p> 
                                <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;'> 
                                <p style='color: #64748b; font-size: 14px;'>Thank you,<br>Barangay Pasong Buaya II Administration</p> 
                            </div> 
                        "; 
                        $mail->send(); 
                    }
                }
            } catch (Exception $mailException) {
                // Ignore mail errors so backend registration succeeds regardless
            }
        }

        $stmt->close(); 
        $conn->close();

        // 6. Return JSON Success Payload
        ob_clean();
        http_response_code(200);
        echo json_encode([
            "success" => true, 
            "message" => "Reservation submitted successfully! Tracking ID: " . $tracking_code
        ]);
        exit();
    }
} catch (Exception $err) {
    // Clean buffer and return JSON error message to React frontend
    ob_clean();
    http_response_code(200);
    echo json_encode([
        "success" => false, 
        "message" => $err->getMessage()
    ]);
    exit();
}
?>