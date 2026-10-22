<?php
// Resident picker for Announcements ("Specific residents"). Returns only what
// the picker needs (user_id, resident_id, full_name) for Active residents,
// who are the only ones able to sign in and read a post. Full records are on
// the Residents page (admin_residents.php).
header('Content-Type: application/json');
header('Cache-Control: no-store');

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();
require_once __DIR__ . '/admin_permissions.php';
pb2_require_any_permission(['module.announcements', 'module.residents']); // tab access

include_once __DIR__ . '/../db_connection.php';

$sql = "SELECT r.user_id, r.resident_id, r.fName, r.mName, r.lName, r.suffix
        FROM residents r
        WHERE r.status = 'Active' AND r.user_id IS NOT NULL
        ORDER BY r.lName, r.fName";

$result = $conn->query($sql);

if (!$result) {
    echo json_encode(["success" => false, "message" => "Couldn't load the resident list."]);
    exit;
}

$residents = [];
while ($row = $result->fetch_assoc()) {
    $name = trim(preg_replace('/\s+/', ' ', implode(' ', [
        $row['fName'] ?? '', $row['mName'] ?? '', $row['lName'] ?? '', $row['suffix'] ?? '',
    ])));
    $residents[] = [
        'user_id' => (int)$row['user_id'],
        'resident_id' => (int)$row['resident_id'],
        'full_name' => $name,
    ];
}

echo json_encode(['success' => true, 'data' => $residents]);
$conn->close();
