<?php
// Editable About page and barangay council (migration 024).
//   GET                              public: { content, officials } for the About
//                                    page and printed documents. ?all=1 (admin)
//                                    also returns rows hidden from both places.
//   POST action=save_content (JSON) admin: hero_title, hero_subtitle, mission,
//                                    vision, timeline [{year, title, description}]
//   POST action=save_official        admin, multipart: id?, full_name, position,
//                                    role_key, show_on_about, show_on_print,
//                                    photo? (JPEG/PNG/WEBP, 5 MB), remove_photo?
//   POST action=delete_official      admin: { id }
//   POST action=reorder              admin: { ids: [...] } in display order
// Council names and positions are stored in ALL CAPS like other typed text. The
// About page text (banner, mission, vision, timeline) is an exception: it is
// published prose, so it keeps the capitalisation the admin typed.
// Every write is audit-logged.
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
pb2_session_start();
require_once __DIR__ . '/../db_connection.php';
require_once __DIR__ . '/text_case.php';
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/announcements_common.php'; // pb2_save_announcement_image()

if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

const PB2_OFFICIAL_ROLES = ['punong_barangay', 'kagawad', 'sk_chair', 'secretary', 'treasurer', 'other'];
const PB2_ABOUT_KEYS = ['hero_title' => 200, 'hero_subtitle' => 400, 'mission' => 2000, 'vision' => 2000];
const PB2_TIMELINE_MAX = 20;
const PB2_OFFICIALS_DIR = __DIR__ . '/../uploads/officials';

function pb2_about_payload(mysqli $conn, bool $all): array
{
    $content = [];
    $res = $conn->query("SELECT content_key, content_value FROM site_content WHERE content_key LIKE 'about\\_%'");
    while ($res && ($r = $res->fetch_assoc())) {
        $content[substr($r['content_key'], 6)] = $r['content_value'];
    }
    $content['timeline'] = json_decode($content['timeline'] ?? '[]', true) ?: [];

    $where = $all ? '' : 'WHERE show_on_about = 1 OR show_on_print = 1';
    $officials = [];
    $res = $conn->query("SELECT id, full_name, position, role_key, photo_path, sort_order, show_on_about, show_on_print
                         FROM barangay_officials $where ORDER BY sort_order, id");
    while ($res && ($r = $res->fetch_assoc())) {
        $r['id'] = (int)$r['id'];
        $r['show_on_about'] = (int)$r['show_on_about'];
        $r['show_on_print'] = (int)$r['show_on_print'];
        $officials[] = $r;
    }
    return ['content' => $content, 'officials' => $officials];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $all = !empty($_GET['all']) && pb2_current_admin();
    echo json_encode(['success' => true] + pb2_about_payload($conn, (bool)$all));
    exit;
}

$admin = pb2_require_admin();
$action = $_GET['action'] ?? ($_POST['action'] ?? '');
$json = str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')
    ? (json_decode(file_get_contents('php://input'), true) ?: [])
    : $_POST;
$fail = function (string $msg) {
    echo json_encode(['success' => false, 'message' => $msg]);
    exit;
};

if ($action === 'save_content') {
    $values = [];
    foreach (PB2_ABOUT_KEYS as $key => $max) {
        $v = trim((string)($json[$key] ?? ''));
        if ($v === '') $fail('Fill in the title, subtitle, mission and vision.');
        if (mb_strlen($v) > $max) $fail(ucfirst(str_replace('_', ' ', $key)) . " is too long (max $max characters).");
        $values["about_$key"] = $v;
    }
    $timeline = [];
    foreach ((array)($json['timeline'] ?? []) as $t) {
        $year = trim((string)($t['year'] ?? ''));
        $title = trim((string)($t['title'] ?? ''));
        $desc = trim((string)($t['description'] ?? ''));
        if ($year === '' && $title === '' && $desc === '') continue; // blank row
        if ($year === '' || $title === '') $fail('Each timeline entry needs a year and a title.');
        if (mb_strlen($year) > 20 || mb_strlen($title) > 120 || mb_strlen($desc) > 600) $fail('A timeline entry is too long.');
        $timeline[] = ['year' => $year, 'title' => $title, 'description' => $desc];
    }
    if (count($timeline) > PB2_TIMELINE_MAX) $fail('Up to ' . PB2_TIMELINE_MAX . ' timeline entries.');
    $values['about_timeline'] = json_encode($timeline, JSON_UNESCAPED_UNICODE);

    $adminId = (int)$admin['admin_id'];
    $st = $conn->prepare("INSERT INTO site_content (content_key, content_value, updated_by) VALUES (?, ?, ?)
                          ON DUPLICATE KEY UPDATE content_value = VALUES(content_value), updated_by = VALUES(updated_by)");
    foreach ($values as $k => $v) {
        $st->bind_param('ssi', $k, $v, $adminId);
        $st->execute();
    }
    $st->close();
    pb2_log_admin_action('about.content.update', 'site_content', 'about', 'Updated the About page text (' . count($timeline) . ' timeline entries)');
    echo json_encode(['success' => true, 'message' => 'About page saved.'] + pb2_about_payload($conn, true));
    exit;
}

if ($action === 'save_official') {
    $id = (int)($json['id'] ?? 0);
    // "HON." is added on display for elected roles, so it's never stored.
    $name = pb2_caps(trim(preg_replace('/^\s*HON\.?\s+/i', '', (string)($json['full_name'] ?? ''))));
    $position = pb2_caps(trim((string)($json['position'] ?? '')));
    $role = (string)($json['role_key'] ?? 'other');
    $onAbout = !empty($json['show_on_about']) && $json['show_on_about'] !== '0' ? 1 : 0;
    $onPrint = !empty($json['show_on_print']) && $json['show_on_print'] !== '0' ? 1 : 0;
    if ($name === '' || $position === '') $fail('Enter the name and position.');
    if (mb_strlen($name) > 150 || mb_strlen($position) > 150) $fail('Name or position is too long.');
    if (!in_array($role, PB2_OFFICIAL_ROLES, true)) $fail('Choose a valid role.');

    $old = null;
    if ($id > 0) {
        $q = $conn->prepare("SELECT * FROM barangay_officials WHERE id = ?");
        $q->bind_param('i', $id);
        $q->execute();
        $old = $q->get_result()->fetch_assoc();
        $q->close();
        if (!$old) $fail('That official no longer exists.');
    }

    $photo = $old['photo_path'] ?? null;
    $oldPhotoToDelete = null;
    if (!empty($_FILES['photo']['tmp_name'])) {
        $saved = pb2_save_announcement_image($_FILES['photo'], PB2_OFFICIALS_DIR);
        if (!$saved['ok']) $fail($saved['error']);
        $oldPhotoToDelete = $photo;
        $photo = 'officials/' . $saved['filename'];
    } elseif (!empty($json['remove_photo'])) {
        $oldPhotoToDelete = $photo;
        $photo = null;
    }

    if ($id > 0) {
        $st = $conn->prepare("UPDATE barangay_officials SET full_name = ?, position = ?, role_key = ?, photo_path = ?, show_on_about = ?, show_on_print = ? WHERE id = ?");
        $st->bind_param('ssssiii', $name, $position, $role, $photo, $onAbout, $onPrint, $id);
        $st->execute();
        $st->close();
        $changes = [];
        foreach (['full_name' => $name, 'position' => $position, 'role_key' => $role, 'show_on_about' => $onAbout, 'show_on_print' => $onPrint] as $f => $v) {
            if ((string)$old[$f] !== (string)$v) $changes[] = ['field' => $f, 'old_value' => $old[$f], 'new_value' => $v];
        }
        if ($photo !== $old['photo_path']) $changes[] = ['field' => 'photo', 'old_value' => $old['photo_path'] ? 'set' : 'none', 'new_value' => $photo ? 'set' : 'none'];
        pb2_log_admin_action('about.official.update', 'barangay_official', (string)$id, "Updated council member $name ($position)", $changes ?: null);
    } else {
        $next = (int)($conn->query("SELECT COALESCE(MAX(sort_order), 0) + 10 FROM barangay_officials")->fetch_row()[0]);
        $st = $conn->prepare("INSERT INTO barangay_officials (full_name, position, role_key, photo_path, sort_order, show_on_about, show_on_print) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $st->bind_param('ssssiii', $name, $position, $role, $photo, $next, $onAbout, $onPrint);
        $st->execute();
        $id = (int)$st->insert_id;
        $st->close();
        pb2_log_admin_action('about.official.create', 'barangay_official', (string)$id, "Added council member $name ($position)");
    }

    // Only remove the replaced file once the row points at the new one.
    if ($oldPhotoToDelete && str_starts_with($oldPhotoToDelete, 'officials/')) {
        @unlink(PB2_OFFICIALS_DIR . '/' . basename($oldPhotoToDelete));
    }
    echo json_encode(['success' => true, 'message' => 'Council member saved.', 'id' => $id] + pb2_about_payload($conn, true));
    exit;
}

if ($action === 'delete_official') {
    $id = (int)($json['id'] ?? 0);
    $q = $conn->prepare("SELECT full_name, position, photo_path FROM barangay_officials WHERE id = ?");
    $q->bind_param('i', $id);
    $q->execute();
    $row = $q->get_result()->fetch_assoc();
    $q->close();
    if (!$row) $fail('That official no longer exists.');
    $st = $conn->prepare("DELETE FROM barangay_officials WHERE id = ?");
    $st->bind_param('i', $id);
    $st->execute();
    $st->close();
    if ($row['photo_path'] && str_starts_with($row['photo_path'], 'officials/')) {
        @unlink(PB2_OFFICIALS_DIR . '/' . basename($row['photo_path']));
    }
    pb2_log_admin_action('about.official.delete', 'barangay_official', (string)$id, "Removed council member {$row['full_name']} ({$row['position']})");
    echo json_encode(['success' => true, 'message' => 'Council member removed.'] + pb2_about_payload($conn, true));
    exit;
}

if ($action === 'reorder') {
    $ids = array_values(array_unique(array_map('intval', (array)($json['ids'] ?? []))));
    if (!$ids) $fail('Nothing to reorder.');
    $st = $conn->prepare("UPDATE barangay_officials SET sort_order = ? WHERE id = ?");
    foreach ($ids as $i => $oid) {
        $order = ($i + 1) * 10;
        $st->bind_param('ii', $order, $oid);
        $st->execute();
    }
    $st->close();
    pb2_log_admin_action('about.official.reorder', 'barangay_official', null, 'Changed the council display order');
    echo json_encode(['success' => true, 'message' => 'Order saved.'] + pb2_about_payload($conn, true));
    exit;
}

$fail('Invalid action.');
