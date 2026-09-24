<?php
header('Content-Type: application/json');
require_once '../db_connection.php';

// The resident is always the signed-in session user — never a user_id sent
// in the request, which anyone could change to act as another resident.
require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Your session has expired. Please log in again.', 'auth_error' => true]);
    exit;
}

$user_id = (int)$_SESSION['user_id'];

try {
    // Query incident reports for the user
    $query = "SELECT 
        id,
        track_code as tracking_code,
        reporter_name,
        reporter_address,
        reporter_contact,
        reporter_email,
        contact_person_name,
        contact_person_number,
        incident_address,
        description,
        attachment_path,
        attachment_type,
        incident_class,
        reporting_class,
        status,
        created_at
    FROM incident_reports 
    WHERE user_id = ? 
    ORDER BY created_at DESC";

    $stmt = $conn->prepare($query);
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $reports = [];
    while ($row = $result->fetch_assoc()) {
        $reports[] = $row;
    }

    echo json_encode([
        'success' => true,
        'data' => $reports,
        'count' => count($reports)
    ]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

$conn->close();
