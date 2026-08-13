<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

include "../db_connection.php";
require __DIR__ . '/vendor/autoload.php';

// Validate required fields
$required_fields = ['user_id', 'reporter_name', 'reporter_address', 'reporter_contact', 'reporter_email', 'incident_address', 'description', 'incident_class', 'reporting_class', 'track_code'];
foreach ($required_fields as $field) {
    if (!isset($_POST[$field]) || empty($_POST[$field])) {
        echo json_encode(['success' => false, 'message' => "Field '$field' is required"]);
        exit;
    }
}

// Check for file upload structural format safely
if (!isset($_FILES['attachment']) || empty($_FILES['attachment']['name'])) {
    echo json_encode(['success' => false, 'message' => 'Evidence attachment is required']);
    exit;
}

$file_post = $_FILES['attachment'];
$files = [];

// Since we are using attachment[], $file_post['name'] will be a native PHP array
if (is_array($file_post['name'])) {
    $file_count = count($file_post['name']);
    $file_keys = array_keys($file_post);

    for ($i = 0; $i < $file_count; $i++) {
        foreach ($file_keys as $key) {
            $files[$i][$key] = $file_post[$key][$i];
        }
    }
} else {
    // Fallback for single file upload scenario if brackets are dropped
    $files[0] = $file_post;
}

// Sanitize input data
$user_id = intval($_POST['user_id']);
$reporter_name = mysqli_real_escape_string($conn, $_POST['reporter_name']);
$reporter_address = mysqli_real_escape_string($conn, $_POST['reporter_address']);
$reporter_contact = mysqli_real_escape_string($conn, $_POST['reporter_contact']);
$reporter_email = mysqli_real_escape_string($conn, $_POST['reporter_email']);
$contact_person_name = isset($_POST['contact_person_name']) ? mysqli_real_escape_string($conn, $_POST['contact_person_name']) : '';
$contact_person_number = isset($_POST['contact_person_number']) ? mysqli_real_escape_string($conn, $_POST['contact_person_number']) : '';
$incident_address = mysqli_real_escape_string($conn, $_POST['incident_address']);
$description = mysqli_real_escape_string($conn, $_POST['description']);
$incident_class = mysqli_real_escape_string($conn, $_POST['incident_class']);
$reporting_class = mysqli_real_escape_string($conn, $_POST['reporting_class']);
$track_code = mysqli_real_escape_string($conn, $_POST['track_code']);
$status = 'Pending';

// Fetch the control_num for folder creation
$getControlNum = $conn->prepare("SELECT control_num FROM residents WHERE user_id = ?");
$getControlNum->bind_param("i", $user_id);
$getControlNum->execute();
$cnResult = $getControlNum->get_result()->fetch_assoc();
$control_num = $cnResult ? $cnResult['control_num'] : 'UNKNOWN';
$getControlNum->close();

// Create upload directory
$upload_dir = "uploads/Incident_Reports/" . $control_num . "/" . $track_code . "/";
if (!is_dir($upload_dir)) {
    mkdir($upload_dir, 0777, true);
}

$allowed_image = ['jpg', 'jpeg', 'png'];
$allowed_video = ['mp4'];

$uploaded_paths = [];
$primary_attachment_type = 'image';
$total_files = count($files);

foreach ($files as $file) {
    $tmp_name = $file['tmp_name'];
    $original_name = $file['name'];
    $file_size = $file['size'];

    if (empty($original_name))
        continue;

    $file_ext = strtolower(pathinfo($original_name, PATHINFO_EXTENSION));

    // Type checking
    if (in_array($file_ext, $allowed_image)) {
        $current_type = 'image';
    } elseif (in_array($file_ext, $allowed_video)) {
        $current_type = 'video';
        $primary_attachment_type = 'video';
    } else {
        echo json_encode(['success' => false, 'message' => "Invalid type for file: $original_name. Only JPG, PNG, and MP4 are allowed."]);
        exit;
    }

    // Size limit verification
    if ($file_size > 10 * 1024 * 1024) {
        echo json_encode(['success' => false, 'message' => "File $original_name exceeds 10MB limit."]);
        exit;
    }

    // Generate distinctive file name and target route
    $file_name = uniqid("incident_") . "." . $file_ext;
    $target_path = $upload_dir . $file_name;

    if (move_uploaded_file($tmp_name, $target_path)) {
        $uploaded_paths[] = $target_path;
    } else {
        echo json_encode(['success' => false, 'message' => "Failed to upload file: $original_name"]);
        exit;
    }
}

// Convert all saved paths into a comma-separated string for database storage
$all_attachments_string = mysqli_real_escape_string($conn, implode(',', $uploaded_paths));

// Ensure table exists
$table_check = "CREATE TABLE IF NOT EXISTS incident_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    reporter_name VARCHAR(255) NOT NULL,
    reporter_address TEXT,
    reporter_contact VARCHAR(20),
    reporter_email VARCHAR(255),
    contact_person_name VARCHAR(255),
    contact_person_number VARCHAR(20),
    incident_address TEXT NOT NULL,
    description LONGTEXT NOT NULL,
    attachment_path LONGTEXT,
    attachment_type TEXT,
    status VARCHAR(50) DEFAULT 'Pending',
    track_code VARCHAR(50) UNIQUE NOT NULL,
    incident_class VARCHAR(100),
    reporting_class VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
)";
mysqli_query($conn, $table_check);

// Upgrade existing schema if it was created with a short attachment_path column.
mysqli_query($conn, "ALTER TABLE incident_reports MODIFY attachment_path LONGTEXT");
mysqli_query($conn, "ALTER TABLE incident_reports MODIFY attachment_type TEXT");

// Insert statement with updated attachment paths string
$query = "INSERT INTO incident_reports 
    (user_id, reporter_name, reporter_address, reporter_contact, reporter_email, contact_person_name, contact_person_number, incident_address, description, attachment_path, attachment_type, status, track_code, incident_class, reporting_class)
    VALUES 
    ($user_id, '$reporter_name', '$reporter_address', '$reporter_contact', '$reporter_email', '$contact_person_name', '$contact_person_number', '$incident_address', '$description', '$all_attachments_string', '$primary_attachment_type', '$status', '$track_code', '$incident_class', '$reporting_class')";

if (mysqli_query($conn, $query)) {
    $incident_id = mysqli_insert_id($conn);

    // ==========================================
    // EMAIL SENDING LOGIC (Using Gmail SMTP)
    // ==========================================
    if (!empty($reporter_email)) {
        $mail = new PHPMailer\PHPMailer\PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host = 'smtp.gmail.com';
            $mail->SMTPAuth = true;
            $mail->Username = SMTP_USER;
            $mail->Password = SMTP_PASS;
            $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
            $mail->Port = 465;

            $mail->setFrom(SMTP_FROM_EMAIL, 'Barangay Pasong Buaya II');
            $mail->addAddress($reporter_email);

            $mail->isHTML(true);
            $mail->Subject = "Incident Report Received [$track_code]";

            $mail->Body = "
                <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                    <h2 style='color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px;'>Incident Report Received</h2>
                    <p>Hello $reporter_name,</p>
                    <p>We have successfully received your incident report with attachments. It is currently under review.</p>
                    <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;'>
                        <p><strong>Tracking Code:</strong> <span style='color: #dc2626; font-weight: bold;'>$track_code</span></p>
                        <p><strong>Incident Location:</strong> $incident_address</p>
                        <p><strong>Total Files Uploaded:</strong> $total_files</p>
                    </div>
                    <p>Thank you,<br>Barangay Pasong Buaya II Administration</p>
                </div>";

            $mail->send();
        } catch (Exception $e) {
            error_log("Failed to send Incident Report Email to $reporter_email.");
        }
    }

    $result = mysqli_query($conn, "SELECT created_at FROM incident_reports WHERE id = $incident_id");
    $row = mysqli_fetch_assoc($result);

    echo json_encode([
        'success' => true,
        'message' => 'Incident report submitted securely',
        'incident_id' => $incident_id,
        'track_code' => $track_code,
        'created_at' => $row['created_at']
    ]);
} else {
    echo json_encode(['success' => false, 'message' => 'Failed to submit incident report.']);
}

mysqli_close($conn);
?>