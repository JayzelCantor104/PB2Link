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
$admin = pb2_require_admin();

require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/announcements_common.php';

if (!$conn) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$caption = trim($_POST['caption'] ?? '');
$audienceType = $_POST['audience_type'] ?? 'Everyone';
$sectors = array_values(array_intersect($_POST['sectors'] ?? [], PB2_ANNOUNCEMENT_SECTORS));
$recipientIds = array_values(array_unique(array_map('intval', $_POST['recipient_user_ids'] ?? [])));
$imageCount = isset($_FILES['images']['name']) ? count($_FILES['images']['name']) : 0;

if (!in_array($audienceType, ['Everyone', 'Sector', 'Specific'], true)) {
    echo json_encode(['success' => false, 'message' => 'Invalid audience type.']);
    exit;
}
if (strlen($caption) > 3000) {
    echo json_encode(['success' => false, 'message' => 'Caption is too long (max 3000 characters).']);
    exit;
}
if ($caption === '' && $imageCount === 0) {
    echo json_encode(['success' => false, 'message' => 'Add a caption or at least one photo.']);
    exit;
}
if ($audienceType === 'Sector' && empty($sectors)) {
    echo json_encode(['success' => false, 'message' => 'Select at least one sector.']);
    exit;
}
if ($audienceType === 'Specific' && empty($recipientIds)) {
    echo json_encode(['success' => false, 'message' => 'Select at least one resident.']);
    exit;
}
if ($imageCount > PB2_ANNOUNCEMENT_MAX_IMAGES) {
    echo json_encode(['success' => false, 'message' => 'Up to ' . PB2_ANNOUNCEMENT_MAX_IMAGES . ' images per post.']);
    exit;
}

$conn->begin_transaction();
try {
    $stmt = $conn->prepare('INSERT INTO announcements (admin_id, caption, audience_type) VALUES (?, ?, ?)');
    $stmt->bind_param('iss', $admin['admin_id'], $caption, $audienceType);
    $stmt->execute();
    $announcementId = $stmt->insert_id;
    $stmt->close();

    if ($audienceType === 'Sector') {
        $stmt = $conn->prepare('INSERT INTO announcement_sectors (announcement_id, sector) VALUES (?, ?)');
        foreach ($sectors as $sector) {
            $stmt->bind_param('is', $announcementId, $sector);
            $stmt->execute();
        }
        $stmt->close();
    } elseif ($audienceType === 'Specific') {
        $stmt = $conn->prepare('INSERT INTO announcement_recipients (announcement_id, user_id) VALUES (?, ?)');
        foreach ($recipientIds as $userId) {
            $stmt->bind_param('ii', $announcementId, $userId);
            $stmt->execute();
        }
        $stmt->close();
    }

    if ($imageCount > 0) {
        $destDir = __DIR__ . '/../uploads/announcements/' . $announcementId;
        $stmt = $conn->prepare('INSERT INTO announcement_images (announcement_id, image_path, sort_order) VALUES (?, ?, ?)');
        for ($i = 0; $i < $imageCount; $i++) {
            $file = [
                'tmp_name' => $_FILES['images']['tmp_name'][$i],
                'error' => $_FILES['images']['error'][$i],
                'size' => $_FILES['images']['size'][$i],
            ];
            $saved = pb2_save_announcement_image($file, $destDir);
            if (!$saved['ok']) {
                throw new Exception($saved['error']);
            }
            $imagePath = 'announcements/' . $announcementId . '/' . $saved['filename'];
            $stmt->bind_param('isi', $announcementId, $imagePath, $i);
            $stmt->execute();
        }
        $stmt->close();
    }

    $conn->commit();
    echo json_encode(['success' => true, 'announcement_id' => $announcementId]);
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

$conn->close();
