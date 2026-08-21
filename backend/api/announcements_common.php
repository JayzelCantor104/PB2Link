<?php
// Shared helpers for the citizen-facing announcement endpoints. Included, not
// called directly — defines the "which posts can this viewer see" rule once so
// the home feed and the archive page can never drift apart on it.

const PB2_ANNOUNCEMENT_SECTORS = ['Senior Citizen', 'PWD', 'Solo Parent', 'Indigent', '4Ps'];

function pb2_resident_sectors(mysqli $conn, int $userId): array
{
    $stmt = $conn->prepare('SELECT is_senior, is_pwd, is_solo_parent, is_indigent, is_4ps FROM residents WHERE user_id = ? LIMIT 1');
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        return [];
    }

    $sectors = [];
    if (!empty($row['is_senior']))      $sectors[] = 'Senior Citizen';
    if (!empty($row['is_pwd']))         $sectors[] = 'PWD';
    if (!empty($row['is_solo_parent'])) $sectors[] = 'Solo Parent';
    if (!empty($row['is_indigent']))    $sectors[] = 'Indigent';
    if (!empty($row['is_4ps']))         $sectors[] = '4Ps';
    return $sectors;
}

/**
 * Builds the WHERE fragment + bound params deciding which announcements a
 * viewer may see: always 'Everyone' posts, plus 'Sector' posts matching one of
 * their resident sector flags, plus 'Specific' posts naming their user_id.
 * $userId is null for an anonymous visitor, who then only sees 'Everyone' posts.
 */
function pb2_announcement_visibility(mysqli $conn, ?int $userId): array
{
    $conditions = ["a.audience_type = 'Everyone'"];
    $params = [];
    $types = '';

    if ($userId !== null) {
        $sectors = pb2_resident_sectors($conn, $userId);

        if (!empty($sectors)) {
            $placeholders = implode(',', array_fill(0, count($sectors), '?'));
            $conditions[] = "(a.audience_type = 'Sector' AND EXISTS (
                SELECT 1 FROM announcement_sectors s WHERE s.announcement_id = a.announcement_id AND s.sector IN ($placeholders)
            ))";
            foreach ($sectors as $sector) {
                $params[] = $sector;
                $types .= 's';
            }
        }

        $conditions[] = "(a.audience_type = 'Specific' AND EXISTS (
            SELECT 1 FROM announcement_recipients r WHERE r.announcement_id = a.announcement_id AND r.user_id = ?
        ))";
        $params[] = $userId;
        $types .= 'i';
    }

    return [
        'where' => '(' . implode(' OR ', $conditions) . ')',
        'params' => $params,
        'types' => $types,
    ];
}

const PB2_ANNOUNCEMENT_MAX_IMAGES = 6;
const PB2_ANNOUNCEMENT_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Validates one uploaded image and moves it into $destDir with a server-chosen
 * name. Never trusts the client's filename or the extension it arrived with —
 * the real type is read from the file bytes via getimagesize().
 *
 * @return array{ok:bool, filename?:string, error?:string}
 */
function pb2_save_announcement_image(array $file, string $destDir): array
{
    if (!isset($file['tmp_name']) || $file['error'] !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'error' => 'Upload failed.'];
    }
    if ($file['size'] > PB2_ANNOUNCEMENT_MAX_IMAGE_BYTES) {
        return ['ok' => false, 'error' => 'Image is larger than 5MB.'];
    }

    $info = @getimagesize($file['tmp_name']);
    if ($info === false) {
        return ['ok' => false, 'error' => 'File is not a valid image.'];
    }

    $extensionByMime = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];
    $mime = $info['mime'];
    if (!isset($extensionByMime[$mime])) {
        return ['ok' => false, 'error' => 'Only JPEG, PNG, or WEBP images are allowed.'];
    }

    if (!is_dir($destDir) && !mkdir($destDir, 0755, true)) {
        return ['ok' => false, 'error' => 'Could not create upload directory.'];
    }

    $filename = 'img_' . uniqid() . '.' . $extensionByMime[$mime];
    if (!move_uploaded_file($file['tmp_name'], $destDir . '/' . $filename)) {
        return ['ok' => false, 'error' => 'Could not save uploaded image.'];
    }

    return ['ok' => true, 'filename' => $filename];
}

/** Attaches images[] and, for Sector posts, target_sectors[] to each announcement row. */
function pb2_attach_announcement_details(mysqli $conn, array $rows): array
{
    if (empty($rows)) {
        return $rows;
    }

    $ids = array_column($rows, 'announcement_id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));

    $imagesByAnnouncement = [];
    $stmt = $conn->prepare("SELECT announcement_id, image_id, image_path FROM announcement_images WHERE announcement_id IN ($placeholders) ORDER BY sort_order ASC, image_id ASC");
    $stmt->bind_param($types, ...$ids);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($img = $result->fetch_assoc()) {
        $imagesByAnnouncement[$img['announcement_id']][] = [
            'image_id' => (int) $img['image_id'],
            'image_path' => $img['image_path'],
        ];
    }
    $stmt->close();

    $sectorsByAnnouncement = [];
    $stmt = $conn->prepare("SELECT announcement_id, sector FROM announcement_sectors WHERE announcement_id IN ($placeholders)");
    $stmt->bind_param($types, ...$ids);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $sectorsByAnnouncement[$row['announcement_id']][] = $row['sector'];
    }
    $stmt->close();

    foreach ($rows as &$row) {
        $row['images'] = $imagesByAnnouncement[$row['announcement_id']] ?? [];
        $row['target_sectors'] = $sectorsByAnnouncement[$row['announcement_id']] ?? [];
    }
    unset($row);

    return $rows;
}
