<?php
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();
require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/sms.php';
require_once __DIR__ . '/advisory_sms.php';

function pb2_sms_respond($statusCode, array $payload)
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        pb2_sms_respond(405, ['success' => false, 'message' => 'Only POST requests are allowed.']);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        pb2_sms_respond(400, ['success' => false, 'message' => 'Invalid JSON request.']);
    }

    $targetType = $input['target_type'] ?? '';
    $targetValue = trim((string) ($input['target_value'] ?? ''));
    $message = trim((string) ($input['message'] ?? ''));
    $messageLength = function_exists('mb_strlen') ? mb_strlen($message, 'UTF-8') : strlen($message);

    if ($targetType === 'all') $targetValue = 'ALL RESIDENTS'; // every Active resident (migration 023)
    if (!in_array($targetType, ['all', 'area', 'sector', 'individual'], true) || $targetValue === '') {
        pb2_sms_respond(400, ['success' => false, 'message' => 'Select a valid target and enter its value.']);
    }
    if ($message === '' || $messageLength > 160) {
        pb2_sms_respond(400, ['success' => false, 'message' => 'The SMS message must contain 1 to 160 characters.']);
    }
    if (!pb2_sms_configured()) {
        pb2_sms_respond(503, ['success' => false, 'message' => 'SMS is not configured. Add the PhilSMS API key in backend/config.php.']);
    }

    $recipients = [];
    if ($targetType === 'all') {
        $recipients = pb2_all_resident_numbers($conn);
    } elseif ($targetType === 'individual') {
        if (!preg_match('/^(09\d{9}|\+639\d{9}|639\d{9})$/', $targetValue)) {
            pb2_sms_respond(400, ['success' => false, 'message' => 'Enter a valid Philippine mobile number.']);
        }
        $recipients[] = $targetValue;
    } elseif ($targetType === 'area') {
        $searchTerm = '%' . $targetValue . '%';
        $stmt = $conn->prepare("SELECT DISTINCT contact_num FROM residents
            WHERE status = 'ACTIVE' AND contact_num IS NOT NULL AND contact_num != ''
            AND (street LIKE ? OR subdivision LIKE ? OR area LIKE ? OR zone LIKE ?)");
        $stmt->bind_param('ssss', $searchTerm, $searchTerm, $searchTerm, $searchTerm);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $recipients[] = $row['contact_num'];
        }
        $stmt->close();
    } else {
        $sectorKey = strtolower($targetValue);
        $sectorConditions = [
            'senior' => '(is_senior = 1 OR sector = \'Senior Citizen\')',
            'pwd' => '(is_pwd = 1 OR sector = \'PWD\')',
            'disab' => '(is_pwd = 1 OR sector = \'PWD\')',
            'solo' => '(is_solo_parent = 1 OR sector = \'Solo Parent\')',
            '4p' => 'is_4ps = 1',
            'indigent' => '(is_indigent = 1 OR sector = \'Indigent\')'
        ];
        $condition = null;
        foreach ($sectorConditions as $keyword => $sqlCondition) {
            if (strpos($sectorKey, $keyword) !== false) {
                $condition = $sqlCondition;
                break;
            }
        }

        if ($condition !== null) {
            $stmt = $conn->prepare("SELECT DISTINCT contact_num FROM residents
                WHERE status = 'ACTIVE' AND contact_num IS NOT NULL AND contact_num != '' AND $condition");
        } else {
            $searchTerm = '%' . $targetValue . '%';
            $stmt = $conn->prepare("SELECT DISTINCT contact_num FROM residents
                WHERE status = 'ACTIVE' AND contact_num IS NOT NULL AND contact_num != '' AND sector LIKE ?");
            $stmt->bind_param('s', $searchTerm);
        }
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $recipients[] = $row['contact_num'];
        }
        $stmt->close();
    }

    // Sent through the shared sender (sms.php): normalises the numbers, logs
    // the broadcast and counts it toward SMS_MONTHLY_CAP without being
    // blocked by it — an emergency alert must always go out.
    $normalized = [];
    foreach ($recipients as $number) {
        $n = pb2_sms_normalize($number);
        if ($n !== null) $normalized[$n] = true;
    }
    $normalized = array_keys($normalized);
    if (!$normalized) {
        pb2_sms_respond(400, ["success" => false, "message" => "No valid phone numbers were found for this target."]);
    }

    $result = pb2_send_sms($conn, $normalized, $message, "disaster_broadcast", [
        "admin_id" => $_SESSION["admin_id"] ?? null,
        "bypass_cap" => true,
    ]);
    if (!$result["ok"]) {
        throw new RuntimeException($result["message"] ?: "The SMS provider rejected the broadcast.");
    }

    $recipientCount = count($normalized);
    pb2_log_admin_action(
        'disaster.sms.broadcast',
        'resident_group',
        null,
        "Sent disaster SMS to $recipientCount recipient(s) using target type '$targetType'."
    );

    pb2_sms_respond(200, [
        'success' => true,
        'recipient_count' => $recipientCount,
        'message' => "SMS accepted by the provider for $recipientCount recipient(s)."
    ]);
} catch (Throwable $error) {
    error_log('Disaster SMS broadcast failed: ' . $error->getMessage());
    pb2_sms_respond(502, ['success' => false, 'message' => $error->getMessage()]);
}