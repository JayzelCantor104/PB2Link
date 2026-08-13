<?php
header('Content-Type: application/json');
require_once '../db_connection.php';
session_start();

// Get user ID from request
$user_id = isset($_GET['user_id']) ? intval($_GET['user_id']) : 0;

if (!$user_id) {
    echo json_encode(['success' => false, 'message' => 'User ID required']);
    exit;
}

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
