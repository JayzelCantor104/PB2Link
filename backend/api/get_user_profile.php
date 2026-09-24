<?php
// Returns the signed-in resident's own profile, used by the request pages
// (Barangay Clearance, Residency, ID, Business Clearance, Indigency,
// Volunteer, Amenity Booking, dynamic services) to pre-fill their forms.
//
// The resident is taken from the PHP session only. This endpoint used to
// accept ?user_id=... with no login check, so anyone could read any
// resident's full record by changing the number; that parameter is now
// ignored.
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Your session has expired. Please log in again.', 'auth_error' => true]);
    exit;
}

include "../db_connection.php";
if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$user_id = $_SESSION['user_id'];
$stmt = $conn->prepare("SELECT r.*, u.email
                        FROM residents r
                        LEFT JOIN users u ON r.user_id = u.user_id
                        WHERE r.user_id = ?");
$stmt->bind_param("s", $user_id);
$stmt->execute();
$data = $stmt->get_result()->fetch_assoc();
$stmt->close();

if ($data) {
    echo json_encode(['success' => true, 'data' => $data]);
} else {
    echo json_encode(['success' => false, 'message' => 'Profile not found']);
}
