<?php
// Resident cancels their own booking while it is still Pending (Track Request).
//   POST JSON { request_id }
header("Content-Type: application/json");
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Your session has expired. Please log in again.', 'auth_error' => true]);
    exit();
}

include_once __DIR__ . '/../db_connection.php';
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit();
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$request_id = (int)($data['request_id'] ?? 0);
$user_id = $_SESSION['user_id'];

// Only the resident who owns the booking, and only while it's Pending.
$stmt = $conn->prepare("UPDATE req_amenity_reservation ar
    JOIN residents r ON r.resident_id = ar.resident_id
    SET ar.status = 'Cancelled', ar.remarks = CONCAT_WS(' ', NULLIF(ar.remarks, ''), '[Cancelled by resident]')
    WHERE ar.request_id = ? AND r.user_id = ? AND ar.status = 'Pending'");
$stmt->bind_param("is", $request_id, $user_id);
$stmt->execute();

if ($stmt->affected_rows === 1) {
    echo json_encode(['success' => true, 'message' => 'Your booking was cancelled.']);
} else {
    echo json_encode(['success' => false, 'message' => 'Only your own bookings that are still pending can be cancelled.']);
}
