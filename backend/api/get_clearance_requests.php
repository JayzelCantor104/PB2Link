<?php
header('Content-Type: application/json');
require_once '../db_connection.php';

// The resident is always the signed-in session user — never a user_id sent
// in the request, which anyone could change to read another resident's data.
require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Your session has expired. Please log in again.', 'auth_error' => true]);
    exit;
}
$user_id = (int)$_SESSION['user_id'];

try {
    // Query clearance requests for the user from req_barangay_clearance table
    // Join with residents table to get user_id
    $query = "SELECT 
    bc.request_id as id,
    bc.tracking_code,
    bc.fName,
    bc.mName,
    bc.lName,
    bc.suffix,
    bc.birth_date,
    bc.gender,
    bc.civil_status,
    bc.address,
    bc.sector,
    bc.request_mode,
    bc.beneficiary_name,
    bc.years_in_PB2,
    bc.precinct_no,
    bc.purpose,
    bc.id_front,
    bc.id_back,
    bc.id_holding,
    bc.status,
    bc.date_requested as created_at,
    bc.remarks as notes
FROM req_barangay_clearance bc
INNER JOIN residents r ON bc.resident_id = r.resident_id
WHERE r.user_id = ?
ORDER BY bc.date_requested DESC";

    $stmt = $conn->prepare($query);
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $requests = [];
    while ($row = $result->fetch_assoc()) {
        $requests[] = $row;
    }

    echo json_encode([
        'success' => true,
        'data' => $requests,
        'count' => count($requests)
    ]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

$conn->close();
