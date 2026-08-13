<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/audit_log.php';
pb2_require_admin();

include_once __DIR__ . '/../db_connection.php';
// Include PHPMailer autoload
require __DIR__ . '/vendor/autoload.php';

$data = json_decode(file_get_contents('php://input'), true);
$request_id = isset($data['request_id']) ? intval($data['request_id']) : 0;
$request_type = isset($data['request_type']) ? $data['request_type'] : '';
$status = isset($data['status']) ? mysqli_real_escape_string($conn, $data['status']) : '';
$remarks = isset($data['remarks']) ? mysqli_real_escape_string($conn, $data['remarks']) : '';

if (!$request_id || !$request_type || !$status) {
    echo json_encode(['success' => false, 'message' => 'request_id, request_type and status are required']);
    exit;
}

$allowedStatuses = ['Pending', 'Processing', 'Ready for Pick Up', 'Declined', 'Claimed', 'Approved', 'Rejected'];
if (!in_array($status, $allowedStatuses, true)) {
    echo json_encode(['success' => false, 'message' => 'Invalid status value']);
    exit;
}

// Exact database table schema registry mapping
$mapping = [
    'clearance'          => 'req_barangay_clearance',
    'residency'          => 'req_certificate_residency',
    'barangay_id'        => 'req_barangay_id',
    'business_clearance' => 'req_business_clearance',
    'indigency'          => 'req_certificate_indigency',
    'volunteer'          => 'req_volunteer_registration',
    'amenity'            => 'req_amenity_reservation'
];

if (!isset($mapping[$request_type])) {
    echo json_encode(['success' => false, 'message' => 'Invalid request type: ' . $request_type]);
    exit;
}

$table = $mapping[$request_type];

// 1. Fetch Request Details and Resident's Email BEFORE Updating
// We need the tracking code and user email to send the notification
$fetchSql = "
    SELECT t.tracking_code, t.status AS old_status, u.email
    FROM $table t
    JOIN residents r ON t.resident_id = r.resident_id
    JOIN users u ON r.user_id = u.user_id
    WHERE t.request_id = $request_id
";
$result = $conn->query($fetchSql);
$requestDetails = $result ? $result->fetch_assoc() : null;

$user_email = $requestDetails ? $requestDetails['email'] : null;
$tracking_code = $requestDetails ? $requestDetails['tracking_code'] : 'Unknown';
$old_status = $requestDetails ? $requestDetails['old_status'] : null;

// Safely identify if the targeted table contains a dedicated remarks field
// NOTE: req_certificate_indigency does not have a remarks column in your SQL dump.
if ($table === 'req_certificate_indigency') {
    // Falls back to safe execution without losing data if table doesn't have a remarks column
    $sql = "UPDATE $table SET status = '$status' WHERE request_id = $request_id";
} else {
    // Uses the actual 'remarks' column verified from your SQL schema
    $sql = "UPDATE $table SET status = '$status', remarks = '$remarks' WHERE request_id = $request_id";
}

if ($conn->query($sql)) {

    pb2_log_admin_action(
        'document_request.status.update',
        'document_request',
        (string)$request_id,
        "Updated $request_type request [$tracking_code] status to $status",
        [
            ['field' => 'status', 'old_value' => $old_status, 'new_value' => $status],
        ]
    );

    // ==========================================
    // EMAIL SENDING LOGIC (Admin Status Update)
    // ==========================================
    if (!empty($user_email)) {
        
        // Define color and instruction text based on the status
        $status_color = "#3b82f6"; // Default Blue
        $instruction_html = "";
        
        switch ($status) {
            case 'Processing':
                $status_color = "#3b82f6"; // Blue
                $instruction_html = "<p style='margin-top: 15px;'>Your request is currently being reviewed and processed by the Barangay Administration. We will notify you again once it is ready.</p>";
                break;
            case 'Ready for Pick Up':
            case 'Approved':
                $status_color = "#10b981"; // Green
                $instruction_html = "
                    <div style='background-color: #d1fae5; border-left: 4px solid #10b981; padding: 12px; margin-top: 15px;'>
                        <p style='margin: 0; color: #065f46;'><strong>Instructions:</strong> Please proceed to the Barangay Hall during office hours to claim your document/ID. Present your tracking code and a valid ID to the staff.</p>
                    </div>";
                break;
            case 'Claimed':
                $status_color = "#64748b"; // Gray
                $instruction_html = "<p style='margin-top: 15px;'>Your document has been successfully claimed. Thank you for transacting with us!</p>";
                break;
            case 'Declined':
            case 'Rejected':
                $status_color = "#ef4444"; // Red
                $instruction_html = "
                    <div style='background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 12px; margin-top: 15px;'>
                        <p style='margin: 0; color: #991b1b;'><strong>Notice:</strong> We apologize, but your request could not be processed at this time. Please read the remarks below for more details, or visit the Barangay Hall for clarification.</p>
                    </div>";
                break;
            default:
                $status_color = "#eab308"; // Yellow
                break;
        }

        // Format remarks section (only show if remarks exist)
        $remarks_html = "";
        if (!empty($remarks)) {
            $remarks_html = "
                <div style='margin-top: 20px; border-top: 1px dashed #cbd5e1; padding-top: 15px;'>
                    <h4 style='margin: 0 0 5px 0; color: #475569;'>Message from Admin:</h4>
                    <p style='margin: 0; font-style: italic; color: #334155; padding: 10px; background-color: #f8fafc; border-radius: 5px;'>\"" . htmlspecialchars($remarks) . "\"</p>
                </div>
            ";
        }

        // Human-readable document name for the subject line
        $doc_titles = [
            'clearance'          => 'Barangay Clearance',
            'residency'          => 'Certificate of Residency',
            'barangay_id'        => 'Barangay ID',
            'business_clearance' => 'Business Clearance',
            'indigency'          => 'Certificate of Indigency',
            'volunteer'          => 'Volunteer Registration',
            'amenity'            => 'Facility Reservation'
        ];
        $doc_title = $doc_titles[$request_type] ?? 'Document';

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
            $mail->Subject = "Update: Your $doc_title Request [$tracking_code]";
            
            // Final HTML Template
            $mail->Body = "
                <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
                    <h2 style='color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;'>Request Status Update</h2>
                    <p>Hello,</p>
                    <p>There is an update regarding your request for a <strong>$doc_title</strong>.</p>
                    
                    <div style='background-color: #ffffff; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1; box-shadow: 0 1px 3px rgba(0,0,0,0.1);'>
                        <p style='margin: 8px 0;'><strong>Tracking Code:</strong> $tracking_code</p>
                        <p style='margin: 8px 0;'>
                            <strong>New Status:</strong> 
                            <span style='background-color: $status_color; color: white; padding: 4px 10px; border-radius: 12px; font-weight: bold; font-size: 13px;'>
                                " . strtoupper($status) . "
                            </span>
                        </p>
                        
                        $instruction_html
                        
                        $remarks_html
                    </div>

                    <p style='color: #64748b; font-size: 14px; margin-top: 30px;'>Thank you,<br>Barangay Pasong Buaya II Administration</p>
                </div>
            ";
            
            // Plain Text Fallback
            $mail->AltBody = "Your request for $doc_title (Tracking: $tracking_code) has been updated to: " . strtoupper($status) . ".\n\nRemarks: $remarks";

            $mail->send();
        } catch (Exception $e) {
            error_log("Failed to send Admin Status Update Email to $user_email. Error: {$mail->ErrorInfo}");
        }
    }

    echo json_encode(['success' => true, 'message' => 'Document request status updated successfully']);
} else {
    echo json_encode(['success' => false, 'message' => $conn->error]);
}

$conn->close();
?>
