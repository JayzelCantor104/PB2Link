<?php
header('Content-Type: application/json');

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();

include_once __DIR__ . '/../db_connection.php';

// Fetch ALL columns from residents and join with users table for email
$sql = "SELECT r.*, u.email 
        FROM residents r 
        LEFT JOIN users u ON r.user_id = u.user_id 
        ORDER BY r.date_registered DESC";

$result = $conn->query($sql);

if (!$result) {
    echo json_encode(["success" => false, "message" => $conn->error]);
    exit;
}

$residents = [];

while ($row = $result->fetch_assoc()) {
    // Construct Full Name safely
    $fName = trim($row['fName'] ?? '');
    $mName = trim($row['mName'] ?? '');
    $lName = trim($row['lName'] ?? '');
    $suffix = trim($row['suffix'] ?? '');
    $row['full_name'] = trim("$fName $mName $lName $suffix");

    // Construct Full Address safely, omitting empty parts
    $address_parts = array_filter([
        $row['house_no'] ?? '',
        $row['street'] ?? '',
        $row['subdivision'] ?? '',
        !empty($row['zone']) ? "Zone " . $row['zone'] : ''
    ]);
    $row['full_address'] = implode(', ', $address_parts);

    $residents[] = $row;
}

echo json_encode(['success' => true, 'data' => $residents]);
$conn->close();
?>