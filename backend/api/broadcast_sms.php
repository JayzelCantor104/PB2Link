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

    if (!in_array($targetType, ['area', 'sector', 'individual'], true) || $targetValue === '') {
        pb2_sms_respond(400, ['success' => false, 'message' => 'Select a valid target and enter its value.']);
    }
    if ($message === '' || $messageLength > 160) {
        pb2_sms_respond(400, ['success' => false, 'message' => 'The SMS message must contain 1 to 160 characters.']);
    }
    if (!defined('SMS_API_KEY') || SMS_API_KEY === '') {
        pb2_sms_respond(503, ['success' => false, 'message' => 'SMS is not configured. Add the PhilSMS API key in backend/config.php.']);
    }

    $recipients = [];
    if ($targetType === 'individual') {
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

    $normalized = [];
    foreach ($recipients as $number) {
        $clean = preg_replace('/\D/', '', (string) $number);
        if (strlen($clean) === 11 && substr($clean, 0, 2) === '09') {
            $clean = '63' . substr($clean, 1);
        }
        if (preg_match('/^639\d{9}$/', $clean)) {
            $normalized[] = $clean;
        }
    }
    $normalized = array_values(array_unique($normalized));
    if (!$normalized) {
        pb2_sms_respond(400, ['success' => false, 'message' => 'No valid phone numbers were found for this target.']);
    }

    $payload = [
        'recipient' => implode(',', $normalized),
        'sender_id' => defined('SMS_SENDER_ID') && SMS_SENDER_ID !== '' ? SMS_SENDER_ID : 'PhilSMS',
        'type' => 'plain',
        'message' => $message
    ];
    $gatewayUrl = defined('SMS_GATEWAY_URL') && SMS_GATEWAY_URL !== ''
        ? SMS_GATEWAY_URL
        : 'https://philsms.com/api/v3/sms/send';
    $curl = curl_init($gatewayUrl);
    if ($curl === false) {
        throw new RuntimeException('Unable to initialize the SMS gateway request.');
    }
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . SMS_API_KEY,
            'Content-Type: application/json',
            'Accept: application/json'
        ]
    ]);
    $responseBody = curl_exec($curl);
    $curlError = curl_error($curl);
    $httpCode = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($responseBody === false) {
        throw new RuntimeException('SMS gateway connection failed: ' . $curlError);
    }
    $gatewayResponse = json_decode($responseBody, true);
    if ($httpCode < 200 || $httpCode >= 300 || (is_array($gatewayResponse) && ($gatewayResponse['status'] ?? '') === 'error')) {
        $providerMessage = is_array($gatewayResponse) ? ($gatewayResponse['message'] ?? '') : '';
        throw new RuntimeException($providerMessage ?: 'The SMS provider rejected the broadcast.');
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