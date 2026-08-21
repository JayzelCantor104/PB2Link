<?php
header('Content-Type: application/json');
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();

require_once __DIR__ . '/../db_connection.php';

if (!$conn) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$raw = json_decode(file_get_contents('php://input'), true);
$announcementId = (int) ($raw['announcement_id'] ?? $_POST['announcement_id'] ?? 0);

if ($announcementId <= 0) {
    echo json_encode(['success' => false, 'message' => 'Missing announcement_id.']);
    exit;
}

$stmt = $conn->prepare('SELECT image_path FROM announcement_images WHERE announcement_id = ?');
$stmt->bind_param('i', $announcementId);
$stmt->execute();
$images = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();

$stmt = $conn->prepare('DELETE FROM announcements WHERE announcement_id = ?');
$stmt->bind_param('i', $announcementId);
$stmt->execute();
$deleted = $stmt->affected_rows > 0;
$stmt->close();

if (!$deleted) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Announcement not found.']);
    exit;
}

foreach ($images as $img) {
    $absolute = __DIR__ . '/../uploads/' . $img['image_path'];
    if (is_file($absolute)) {
        unlink($absolute);
    }
}
$folder = __DIR__ . '/../uploads/announcements/' . $announcementId;
if (is_dir($folder)) {
    @rmdir($folder);
}

echo json_encode(['success' => true]);
$conn->close();
