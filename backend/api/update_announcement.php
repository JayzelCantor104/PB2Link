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
require_once __DIR__ . '/announcements_common.php';

if (!$conn) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$announcementId = (int) ($_POST['announcement_id'] ?? 0);
$caption = trim($_POST['caption'] ?? '');
$audienceType = $_POST['audience_type'] ?? 'Everyone';
$sectors = array_values(array_intersect($_POST['sectors'] ?? [], PB2_ANNOUNCEMENT_SECTORS));
$recipientIds = array_values(array_unique(array_map('intval', $_POST['recipient_user_ids'] ?? [])));
$removeImageIds = array_values(array_unique(array_map('intval', $_POST['remove_image_ids'] ?? [])));
$newImageCount = isset($_FILES['images']['name']) ? count($_FILES['images']['name']) : 0;

if ($announcementId <= 0) {
    echo json_encode(['success' => false, 'message' => 'Missing announcement_id.']);
    exit;
}
if (!in_array($audienceType, ['Everyone', 'Sector', 'Specific'], true)) {
    echo json_encode(['success' => false, 'message' => 'Invalid audience type.']);
    exit;
}
if (strlen($caption) > 3000) {
    echo json_encode(['success' => false, 'message' => 'Caption is too long (max 3000 characters).']);
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

$stmt = $conn->prepare('SELECT announcement_id FROM announcements WHERE announcement_id = ?');
$stmt->bind_param('i', $announcementId);
$stmt->execute();
if (!$stmt->get_result()->fetch_assoc()) {
    $stmt->close();
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Announcement not found.']);
    exit;
}
$stmt->close();

$currentImageCount = (int) ($conn->query("SELECT COUNT(*) AS c FROM announcement_images WHERE announcement_id = $announcementId")->fetch_assoc()['c'] ?? 0);
if ($currentImageCount - count($removeImageIds) + $newImageCount > PB2_ANNOUNCEMENT_MAX_IMAGES) {
    echo json_encode(['success' => false, 'message' => 'Up to ' . PB2_ANNOUNCEMENT_MAX_IMAGES . ' images per post.']);
    exit;
}

$conn->begin_transaction();
try {
    $stmt = $conn->prepare('UPDATE announcements SET caption = ?, audience_type = ?, updated_at = NOW() WHERE announcement_id = ?');
    $stmt->bind_param('ssi', $caption, $audienceType, $announcementId);
    $stmt->execute();
    $stmt->close();

    if (!empty($removeImageIds)) {
        $placeholders = implode(',', array_fill(0, count($removeImageIds), '?'));
        $types = str_repeat('i', count($removeImageIds));
        $params = $removeImageIds;

        $stmt = $conn->prepare("SELECT image_id, image_path FROM announcement_images WHERE announcement_id = ? AND image_id IN ($placeholders)");
        $stmt->bind_param('i' . $types, $announcementId, ...$params);
        $stmt->execute();
        $toDelete = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        $stmt = $conn->prepare("DELETE FROM announcement_images WHERE announcement_id = ? AND image_id IN ($placeholders)");
        $stmt->bind_param('i' . $types, $announcementId, ...$params);
        $stmt->execute();
        $stmt->close();

        foreach ($toDelete as $img) {
            $absolute = __DIR__ . '/../uploads/' . $img['image_path'];
            if (is_file($absolute)) {
                unlink($absolute);
            }
        }
    }

    $conn->query("DELETE FROM announcement_sectors WHERE announcement_id = $announcementId");
    $conn->query("DELETE FROM announcement_recipients WHERE announcement_id = $announcementId");

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

    if ($newImageCount > 0) {
        $destDir = __DIR__ . '/../uploads/announcements/' . $announcementId;
        $nextSortOrder = (int) ($conn->query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM announcement_images WHERE announcement_id = $announcementId")->fetch_assoc()['n'] ?? 0);

        $stmt = $conn->prepare('INSERT INTO announcement_images (announcement_id, image_path, sort_order) VALUES (?, ?, ?)');
        for ($i = 0; $i < $newImageCount; $i++) {
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
            $sortOrder = $nextSortOrder + $i;
            $stmt->bind_param('isi', $announcementId, $imagePath, $sortOrder);
            $stmt->execute();
        }
        $stmt->close();
    }

    $conn->commit();
    echo json_encode(['success' => true]);
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

$conn->close();
