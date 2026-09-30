<?php
header('Content-Type: application/json');

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();

include_once __DIR__ . '/../db_connection.php';

$sql = "SELECT i.id, i.track_code, i.user_id, i.reporter_name, i.reporter_contact, i.contact_person_name, i.contact_person_number, i.incident_address, i.incident_class, i.reporting_class, i.status, i.created_at, i.description, i.attachment_path, i.attachment_type,
    i.processed_by, i.processed_at, pa.fullname AS processed_by_name
FROM incident_reports i
LEFT JOIN admins pa ON pa.admin_id = i.processed_by
ORDER BY i.created_at DESC";
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