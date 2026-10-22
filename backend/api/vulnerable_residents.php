<?php
// Vulnerable residents for evacuation planning (migration 033).
//   GET  action=list        Active residents aged 60+ or PWD, with their street's
//                           flood level and contact numbers
//   POST action=log_print   JSON { count, filter }: records that the list was printed
//
// Needs the disaster.vulnerable permission, which is not part of the default
// standard admin access: this is personal data, given only to the people who
// run evacuations. Every view and print is audit-logged. There is no CSV
// export on purpose, so the list doesn't end up in files outside the system.
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/auth_guard.php';
require_once __DIR__ . '/../db_connection.php';
pb2_require_admin();
require_once __DIR__ . '/admin_permissions.php';
pb2_require_any_permission(['disaster.vulnerable']);
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/preparedness_common.php';

if (!$conn) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

$action = (string)($_GET['action'] ?? 'list');

if ($action === 'list' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $floods = pb2_street_flood_map($conn);
    $res = $conn->query(
        "SELECT resident_id, control_num, fName, mName, lName, suffix, age, gender, is_pwd,
                house_no, block_lot, street, subdivision, zone, landmark,
                contact_num, mobile_verified_at, contact_person, contactp_num, contactp_relationship
           FROM residents
          WHERE status = 'Active' AND (age >= 60 OR is_pwd = 1)
          ORDER BY street, lName, fName");
    $rows = [];
    while ($res && ($r = $res->fetch_assoc())) {
        $key = pb2_street_key($r['street']);
        $name = trim(preg_replace('/\s+/', ' ', "{$r['fName']} {$r['mName']} {$r['lName']} " . ($r['suffix'] ?? '')));
        $rows[] = [
            'resident_id' => (int)$r['resident_id'],
            'control_num' => $r['control_num'],
            'name' => $name,
            'age' => $r['age'] !== null ? (int)$r['age'] : null,
            'gender' => $r['gender'],
            'senior' => $r['age'] !== null && (int)$r['age'] >= 60,
            'pwd' => (int)$r['is_pwd'] === 1,
            'address' => trim(implode(' ', array_filter([$r['house_no'], $r['block_lot'] ?: null, $r['street']]))),
            'street' => $r['street'],
            'subdivision' => $r['subdivision'],
            'zone' => $r['zone'],
            'landmark' => $r['landmark'],
            'mobile' => $r['contact_num'],
            'mobile_verified' => $r['mobile_verified_at'] !== null,
            'emergency_contact' => $r['contact_person'],
            'emergency_number' => $r['contactp_num'],
            'emergency_relationship' => $r['contactp_relationship'],
            'flood_level' => array_key_exists($key, $floods) ? $floods[$key] : null,
        ];
    }
    pb2_log_admin_action('disaster.vulnerable.view', 'vulnerable_residents', null,
        'Opened the vulnerable residents list (' . count($rows) . ' residents)');
    echo json_encode(['success' => true, 'residents' => $rows]);
    exit;
}

if ($action === 'log_print' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $count = max(0, (int)($input['count'] ?? 0));
    $filter = mb_substr(trim((string)($input['filter'] ?? '')), 0, 200);
    pb2_log_admin_action('disaster.vulnerable.print', 'vulnerable_residents', null,
        "Printed the vulnerable residents list ($count residents" . ($filter !== '' ? "; $filter" : '') . ')');
    echo json_encode(['success' => true]);
    exit;
}

echo json_encode(['success' => false, 'message' => 'Unknown action.']);
