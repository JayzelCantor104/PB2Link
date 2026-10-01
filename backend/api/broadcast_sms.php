<?php
ob_start();
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

error_reporting(E_ALL);
ini_set('display_errors', 0);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ob_clean();
    http_response_code(200);
    exit();
}

try {
    // 1. Include Central Config & DB Connection
    $config_path = dirname(__DIR__) . '/config.php';
    if (!file_exists($config_path)) {
        throw new Exception("Config file missing at: " . $config_path);
    }
    require_once $config_path;

    $db_path = dirname(__DIR__) . '/db_connection.php';
    if (file_exists($db_path)) {
        require_once $db_path;
    }

    // 2. Parse Incoming JSON Request Payload
    $json = file_get_contents('php://input');
    $data = json_decode($json, true);

    $target_type  = $data['target_type'] ?? 'area';
    $target_value = trim($data['target_value'] ?? '');
    $message      = trim($data['message'] ?? '');

    if (empty($message)) {
        throw new Exception("SMS message body cannot be empty.");
    }

    $recipients = [];

    // 3. Process Target Selection
    if ($target_type === 'individual') {
        if (!preg_match('/^(09|\+639|639)\d{9}$/', $target_value)) {
            throw new Exception("Invalid Philippine mobile number format (e.g. 09537926555).");
        }
        $recipients[] = $target_value;

    } else if ($target_type === 'area' && isset($conn)) {
        $searchTerm = "%" . $target_value . "%";
        $stmt = $conn->prepare("
            SELECT DISTINCT contact_num 
            FROM residents 
            WHERE status = 'Active' 
              AND contact_num IS NOT NULL 
              AND contact_num != '' 
              AND (street LIKE ? OR subdivision LIKE ? OR area LIKE ? OR zone LIKE ?)
        ");
        $stmt->bind_param("ssss", $searchTerm, $searchTerm, $searchTerm, $searchTerm);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $recipients[] = $row['contact_num'];
        }
        $stmt->close();

    } else if ($target_type === 'sector' && isset($conn)) {
        $sectorKey = strtolower($target_value);
        $sql = "SELECT DISTINCT contact_num FROM residents WHERE status = 'Active' AND contact_num IS NOT NULL AND contact_num != '' AND ";
        
        if (strpos($sectorKey, 'senior') !== false) {
            $sql .= "(is_senior = 1 OR sector = 'Senior Citizen')";
        } else if (strpos($sectorKey, 'pwd') !== false || strpos($sectorKey, 'disab') !== false) {
            $sql .= "(is_pwd = 1 OR sector = 'PWD')";
        } else if (strpos($sectorKey, 'solo') !== false) {
            $sql .= "(is_solo_parent = 1 OR sector = 'Solo Parent')";
        } else if (strpos($sectorKey, '4p') !== false) {
            $sql .= "is_4ps = 1";
        } else if (strpos($sectorKey, 'indigent') !== false) {
            $sql .= "(is_indigent = 1 OR sector = 'Indigent')";
        } else {
            $sql .= "sector LIKE '%" . $conn->real_escape_string($target_value) . "%'";
        }

        $res = $conn->query($sql);
        if ($res) {
            while ($row = $res->fetch_assoc()) {
                $recipients[] = $row['contact_num'];
            }
        }
    }

    // 4. Clean & Normalize Phone Numbers (convert 09537926555 to 639537926555)
    $normalized = [];
    foreach ($recipients as $num) {
        $clean = preg_replace('/[^0-9]/', '', $num);
        if (strlen($clean) === 11 && substr($clean, 0, 2) === '09') {
            $clean = '63' . substr($clean, 1);
        }
        if (strlen($clean) === 12 && substr($clean, 0, 3) === '639') {
            $normalized[] = $clean;
        }
    }

    $normalized = array_values(array_unique($normalized));
    $recipient_count = count($normalized);

    if ($recipient_count === 0) {
        throw new Exception("No valid phone numbers found for target: '$target_value'.");
    }

    // 5. Check API Key
    if (!defined('SMS_API_KEY') || empty(SMS_API_KEY) || SMS_API_KEY === 'YOUR_PHILSMS_API_KEY_HERE') {
        throw new Exception("PhilSMS API key is not configured in backend/config.php.");
    }

    // 6. Build Payload for PhilSMS REST API
    // PhilSMS endpoint takes JSON body
    $sender_id = defined('SMS_SENDER_ID') && !empty(SMS_SENDER_ID) ? SMS_SENDER_ID : 'PhilSMS';
    $gateway_url = defined('SMS_GATEWAY_URL') && !empty(SMS_GATEWAY_URL) ? SMS_GATEWAY_URL : 'https://philsms.com/api/v3/sms/send';

    $payload = [
        'recipient' => implode(',', $normalized), // Or array: $normalized
        'sender_id' => $sender_id,
        'type'      => 'plain',
        'message'   => $message
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $gateway_url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer " . SMS_API_KEY,
        "Content-Type: application/json",
        "Accept: application/json"
    ]);

    $api_response = curl_exec($ch);
    $curl_error   = curl_error($ch);
    $http_code    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($curl_error) {
        throw new Exception("PhilSMS Connection Error: " . $curl_error);
    }

    $res_data = json_decode($api_response, true);

    // If PhilSMS returns an API error (e.g. invalid sender ID, insufficient credits, or invalid token)
    if ($http_code >= 400 || (isset($res_data['status']) && $res_data['status'] === 'error')) {
        $err_msg = $res_data['message'] ?? $api_response;
        throw new Exception("PhilSMS API Rejected Request ($http_code): " . (is_array($err_msg) ? json_encode($err_msg) : $err_msg));
    }

    ob_clean();
    echo json_encode([
        'success' => true,
        'recipient_count' => $recipient_count,
        'message' => "Emergency alert successfully sent via PhilSMS to $recipient_count phone number(s)!",
        'gateway_response' => $res_data
    ]);
    exit();

} catch (Exception $e) {
    ob_clean();
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
    exit();
}
?>