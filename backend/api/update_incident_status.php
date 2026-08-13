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
// Include PHPMailer autoload for email notifications
require __DIR__ . '/vendor/autoload.php';

$data = json_decode(file_get_contents('php://input'), true);
$id = isset($data['id']) ? intval($data['id']) : 0;
$status = isset($data['status']) ? mysqli_real_escape_string($conn, $data['status']) : '';
$remarks = isset($data['remarks']) ? mysqli_real_escape_string($conn, $data['remarks']) : '';

if (!$id || !$status) {
    echo json_encode(['success' => false, 'message' => 'Incident ID and status are required']);
    exit;
}

$allowed = ['Pending', 'Processing', 'Resolved', 'Closed', 'Approved', 'Rejected'];
if (!in_array($status, $allowed, true)) {
    echo json_encode(['success' => false, 'message' => 'Invalid status value']);
    exit;
}

// Get reporter email and tracking code before updating, so we can notify the reporter
$incidentSql = "SELECT reporter_email, track_code, reporter_name, status AS old_status FROM incident_reports WHERE id = $id LIMIT 1";
$incidentResult = $conn->query($incidentSql);
$incidentInfo = $incidentResult ? $incidentResult->fetch_assoc() : null;
$reporterEmail = $incidentInfo['reporter_email'] ?? null;
$trackCode = $incidentInfo['track_code'] ?? 'Unknown';
$reporterName = $incidentInfo['reporter_name'] ?? 'Resident';
$oldStatus = $incidentInfo['old_status'] ?? null;

$sql = "UPDATE incident_reports SET status = '$status' WHERE id = $id";
if ($conn->query($sql)) {

    pb2_log_admin_action(
        'incident_report.status.update',
        'incident_report',
        (string)$id,
        "Updated incident report [$trackCode] status to $status",
        [
            ['field' => 'status', 'old_value' => $oldStatus, 'new_value' => $status],
        ]
    );

    if (!empty($reporterEmail)) {
        $status_color = '#3b82f6';
        $instruction_html = '';
        switch ($status) {
            case 'Processing':
                $status_color = '#3b82f6';
                $instruction_html = "<p style='margin-top: 15px;'>Your report is currently being reviewed by the Barangay Administration. We will notify you again when there is an update.</p>";
                break;
            case 'Resolved':
                $status_color = '#10b981';
                $instruction_html = "<div style='background-color: #d1fae5; border-left: 4px solid #10b981; padding: 12px; margin-top: 15px;'><p style='margin: 0; color: #065f46;'><strong>Update:</strong> Your report has been resolved. If you have follow-up information, please contact the Barangay Office.</p></div>";
                break;
            case 'Closed':
                $status_color = '#ef4444';
                $instruction_html = "<div style='background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 12px; margin-top: 15px;'><p style='margin: 0; color: #991b1b;'><strong>Notice:</strong> This incident report has been closed. Please contact the Barangay Hall if you need further assistance.</p></div>";
                break;
            default:
                $status_color = '#f59e0b';
                $instruction_html = "<p style='margin-top: 15px;'>The status of your report has been updated.</p>";
                break;
        }

        $remarks_html = '';
        if (!empty($remarks)) {
            $remarks_html = "<div style='margin-top: 20px; border-top: 1px dashed #cbd5e1; padding-top: 15px;'><h4 style='margin: 0 0 5px 0; color: #475569;'>Message from Admin:</h4><p style='margin: 0; font-style: italic; color: #334155; padding: 10px; background-color: #f8fafc; border-radius: 5px;'>\"" . htmlspecialchars($remarks) . "\"</p></div>";
        }

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
            $mail->addAddress($reporterEmail);
            $mail->isHTML(true);
            $mail->Subject = "Incident Update [$trackCode]";
            $mail->Body = "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>"
                . "<h2 style='color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px;'>Incident Report Update</h2>"
                . "<p>Hello " . htmlspecialchars($reporterName) . ",</p>"
                . "<p>There is an update on your incident report.</p>"
                . "<div style='background-color: #ffffff; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #cbd5e1;'>"
                . "<p style='margin: 8px 0;'><strong>Tracking Code:</strong> " . htmlspecialchars($trackCode) . "</p>"
                . "<p style='margin: 8px 0;'><strong>New Status:</strong> <span style='background-color: " . $status_color . "; color: white; padding: 4px 10px; border-radius: 12px; font-weight: bold; font-size: 13px;'>" . strtoupper(htmlspecialchars($status)) . "</span></p>"
                . $instruction_html
                . $remarks_html
                . "</div>"
                . "<p style='color: #64748b; font-size: 14px; margin-top: 30px;'>Thank you,<br>Barangay Pasong Buaya II Administration</p>"
                . "</div>";
            $mail->AltBody = "Your incident report (Tracking: " . $trackCode . ") status has been updated to " . strtoupper($status) . ".\n\n" . (!empty($remarks) ? "Message from Admin: " . $remarks : '');
            $mail->send();
        } catch (Exception $e) {
            error_log("Failed to send Incident Status Email to $reporterEmail. Error: {$mail->ErrorInfo}");
        }
    }
    echo json_encode(['success' => true, 'message' => 'Incident status updated']);
} else {
    echo json_encode(['success' => false, 'message' => $conn->error]);
}
$conn->close();
?>