<?php
header('Content-Type: application/json');

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();

include_once __DIR__ . '/../db_connection.php';

$sql = "SELECT id, track_code, user_id, reporter_name, reporter_contact, contact_person_name, contact_person_number, incident_address, incident_class, reporting_class, status, created_at, description, attachment_path, attachment_type FROM incident_reports ORDER BY created_at DESC";
$result = $conn->query($sql);

if (!$result) {
    echo json_encode(['success' => false, 'message' => $conn->error]);
    exit;
}
$data = [];
while ($row = $result->fetch_assoc()) {
    $data[] = $row;
}

echo json_encode(['success' => true, 'data' => $data]);
$conn->close();
?>