<?php
// Session is started by auth_guard.php below, which sets hardened cookie
// params first. Calling session_start() here would lock in PHP's defaults.
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once '../db_connection.php';

if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit;
}

$api_action = $_GET['api'] ?? '';

// --- ACTION 1: FETCH ACCURATE COUNTS MATCHING YOUR SCHEMA ---
if ($api_action === 'dashboard_counts') {
    
    // 1. Total Residents
    $total_residents = 0;
    if ($res = $conn->query("SELECT COUNT(*) as count FROM residents")) {
        $total_residents = $res->fetch_assoc()['count'] ?? 0;
    }

    // 2. Pending Amenity Reservations (Table: req_amenity_reservation)
    $pending_amenities = 0;
    if ($res = $conn->query("SELECT COUNT(*) as count FROM req_amenity_reservation WHERE status = 'Pending'")) {
        $pending_amenities = $res->fetch_assoc()['count'] ?? 0;
    }

    // 3. Combined Document Requests (Aggregates across all 5 of your specific request tables)
    $pending_docs = 0;
    
    $clearance_cnt = $conn->query("SELECT COUNT(*) as count FROM req_barangay_clearance WHERE status = 'Pending'")->fetch_assoc()['count'] ?? 0;
    $brgy_id_cnt   = $conn->query("SELECT COUNT(*) as count FROM req_barangay_id WHERE status = 'Pending'")->fetch_assoc()['count'] ?? 0;
    $business_cnt  = $conn->query("SELECT COUNT(*) as count FROM req_business_clearance WHERE status = 'Pending'")->fetch_assoc()['count'] ?? 0;
    $indigency_cnt = $conn->query("SELECT COUNT(*) as count FROM req_certificate_indigency WHERE status = 'Pending'")->fetch_assoc()['count'] ?? 0;
    $residency_cnt = $conn->query("SELECT COUNT(*) as count FROM req_certificate_residency WHERE status = 'Pending'")->fetch_assoc()['count'] ?? 0;
    
    // Sum total items matching the 'Pending' status state
    $pending_docs = $clearance_cnt + $brgy_id_cnt + $business_cnt + $indigency_cnt + $residency_cnt;

    // 4. Incident Reports (Status is variable, dynamically capturing null/active/pending structures)
    $active_incidents = 0;
    if ($res = $conn->query("SELECT COUNT(*) as count FROM incident_reports WHERE status IS NULL OR status = 'Pending' OR status = 'Active'")) {
        $active_incidents = $res->fetch_assoc()['count'] ?? 0;
    }

    // 5. Profile Changes (Table: pending_profile_changes where status = 'pending_approval')
    $pending_profiles = 0;
    if ($res = $conn->query("SELECT COUNT(DISTINCT user_id) as count FROM pending_profile_changes WHERE status = 'pending_approval'")) {
        $pending_profiles = $res->fetch_assoc()['count'] ?? 0;
    }

    echo json_encode([
        "total" => (int)$total_residents,
        "pending_amenities" => (int)$pending_amenities,
        "pending_docs" => (int)$pending_docs,
        "active_incidents" => (int)$active_incidents,
        "pending_profiles" => (int)$pending_profiles
    ]);
    exit;
}

// --- ACTION: FULL OVERVIEW (Dashboard.jsx) -------------------------------------
// One call with everything the dashboard shows. Every block is fetched on its
// own (try/catch), so a module whose migration isn't applied just comes back
// empty instead of breaking the page. Money figures and the admin activity
// feed are only included for admins allowed to see them.
if ($api_action === 'overview') {
    require_once __DIR__ . '/admin_permissions.php';
    $admin = pb2_current_admin();
    $perms = $admin ? pb2_admin_permissions($conn, (int)$admin['admin_id']) : [];
    $isSuper = ($admin['role'] ?? '') === 'Super';

    $one = function (string $sql) use ($conn) {
        try { $r = $conn->query($sql); return $r ? (int)($r->fetch_row()[0] ?? 0) : 0; } catch (Throwable $e) { return 0; }
    };
    $rows = function (string $sql) use ($conn) {
        try { $r = $conn->query($sql); return $r ? $r->fetch_all(MYSQLI_ASSOC) : []; } catch (Throwable $e) { return []; }
    };
    $out = ['generated_at' => date('Y-m-d H:i:s')];

    // Residents
    $out['residents'] = [
        'total'           => $one("SELECT COUNT(*) FROM residents"),
        'active'          => $one("SELECT COUNT(*) FROM residents WHERE UPPER(status) = 'ACTIVE'"),
        'pending'         => $one("SELECT COUNT(*) FROM residents WHERE UPPER(status) = 'PENDING'"),
        'action_required' => $one("SELECT COUNT(*) FROM residents WHERE status = 'Action Required'"),
        'new_this_month'  => $one("SELECT COUNT(*) FROM residents WHERE date_registered >= DATE_FORMAT(CURDATE(), '%Y-%m-01')"),
        'auto_approved_30d' => $one("SELECT COUNT(*) FROM residents WHERE approval_method = 'auto' AND date_registered >= CURDATE() - INTERVAL 30 DAY"),
        'sectors' => [
            'Senior Citizen' => $one("SELECT COUNT(*) FROM residents WHERE UPPER(status) = 'ACTIVE' AND is_senior = 1"),
            'PWD'            => $one("SELECT COUNT(*) FROM residents WHERE UPPER(status) = 'ACTIVE' AND is_pwd = 1"),
            'Solo Parent'    => $one("SELECT COUNT(*) FROM residents WHERE UPPER(status) = 'ACTIVE' AND is_solo_parent = 1"),
            '4Ps'            => $one("SELECT COUNT(*) FROM residents WHERE UPPER(status) = 'ACTIVE' AND is_4ps = 1"),
            'Indigent'       => $one("SELECT COUNT(*) FROM residents WHERE UPPER(status) = 'ACTIVE' AND is_indigent = 1"),
        ],
    ];

    // Document requests, per type and status
    $docTables = [
        'Barangay Clearance'       => 'req_barangay_clearance',
        'Certificate of Residency' => 'req_certificate_residency',
        'Barangay ID'              => 'req_barangay_id',
        'Business Clearance'       => 'req_business_clearance',
        'Certificate of Indigency' => 'req_certificate_indigency',
        'Volunteer Registration'   => 'req_volunteer_registration',
        'Custom Services'          => 'service_submissions',
    ];
    $docs = [];
    $totals = ['Pending' => 0, 'Processing' => 0, 'Ready for Pick Up' => 0, 'today' => 0, 'this_month' => 0, 'claimed_this_month' => 0];
    foreach ($docTables as $label => $table) {
        $row = $rows("SELECT
                SUM(status = 'Pending') pending, SUM(status = 'Processing') processing,
                SUM(status IN ('Ready for Pick Up', 'Approved')) ready,
                SUM(DATE(date_requested) = CURDATE()) today,
                SUM(date_requested >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) this_month,
                SUM(status = 'Claimed' AND date_requested >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) claimed
              FROM `$table`")[0] ?? [];
        $d = ['type' => $label, 'pending' => (int)($row['pending'] ?? 0), 'processing' => (int)($row['processing'] ?? 0),
              'ready' => (int)($row['ready'] ?? 0), 'today' => (int)($row['today'] ?? 0), 'this_month' => (int)($row['this_month'] ?? 0)];
        $docs[] = $d;
        $totals['Pending'] += $d['pending'];
        $totals['Processing'] += $d['processing'];
        $totals['Ready for Pick Up'] += $d['ready'];
        $totals['today'] += $d['today'];
        $totals['this_month'] += $d['this_month'];
        $totals['claimed_this_month'] += (int)($row['claimed'] ?? 0);
    }
    // Requests per day, last 7 days (all document tables)
    $union = implode(' UNION ALL ', array_map(fn($t) => "SELECT DATE(date_requested) d FROM `$t` WHERE date_requested >= CURDATE() - INTERVAL 6 DAY", $docTables));
    $byDay = [];
    foreach ($rows("SELECT d, COUNT(*) n FROM ($union) x GROUP BY d") as $r) $byDay[$r['d']] = (int)$r['n'];
    $trend = [];
    for ($i = 6; $i >= 0; $i--) {
        $day = date('Y-m-d', strtotime("-$i day"));
        $trend[] = ['date' => $day, 'label' => date('D', strtotime($day)), 'count' => $byDay[$day] ?? 0];
    }
    $out['documents'] = ['by_type' => $docs, 'totals' => $totals, 'trend' => $trend];

    // Verification queues (staff to-do)
    $out['queues'] = [
        'profile_changes'  => $one("SELECT COUNT(DISTINCT user_id) FROM pending_profile_changes WHERE status = 'pending_approval'"),
        'residency_proofs' => $one("SELECT COUNT(*) FROM resident_residency_proofs p JOIN residents r ON r.resident_id = p.resident_id
                                     WHERE p.status = 'Pending' AND UPPER(r.status) = 'ACTIVE'"),
    ];

    // Payments (migration 020): counts for everyone, money only with payments.verify
    $pay = ['for_verification' => $one("SELECT COUNT(*) FROM request_payments WHERE status = 'For Verification'"),
            'unpaid_hall'      => $one("SELECT COUNT(*) FROM request_payments WHERE status = 'Unpaid'")];
    if (in_array('payments.verify', $perms, true)) {
        $pay['collected_today'] = (float)($rows("SELECT COALESCE(SUM(amount_due), 0) s FROM request_payments WHERE status = 'Paid' AND DATE(verified_at) = CURDATE()")[0]['s'] ?? 0);
        $pay['collected_month'] = (float)($rows("SELECT COALESCE(SUM(amount_due), 0) s FROM request_payments WHERE status = 'Paid' AND verified_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')")[0]['s'] ?? 0);
        $pay['paid_month_count'] = $one("SELECT COUNT(*) FROM request_payments WHERE status = 'Paid' AND verified_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')");
    }
    $pay['can_see_amounts'] = in_array('payments.verify', $perms, true);
    $out['payments'] = $pay;

    // Amenities: pending + today's schedule
    $out['amenities'] = [
        'pending' => $one("SELECT COUNT(*) FROM req_amenity_reservation WHERE status = 'Pending'"),
        'today'   => $rows("SELECT ar.request_id, ar.status, ar.start_time, ar.end_time, ar.time_slot, ar.quantity, a.name, a.category,
                                   TRIM(CONCAT(r.fName, ' ', r.lName)) AS resident
                              FROM req_amenity_reservation ar
                              JOIN amenities a ON a.amenity_id = ar.amenity_id
                              LEFT JOIN residents r ON r.resident_id = ar.resident_id
                             WHERE ar.reservation_date = CURDATE() AND ar.status IN ('Pending', 'Approved')
                             ORDER BY ar.start_time LIMIT 8"),
    ];

    // Incidents
    $out['incidents'] = [
        'pending'    => $one("SELECT COUNT(*) FROM incident_reports WHERE status IS NULL OR status = 'Pending'"),
        'processing' => $one("SELECT COUNT(*) FROM incident_reports WHERE status = 'Processing'"),
        'this_month' => $one("SELECT COUNT(*) FROM incident_reports WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')"),
        'recent'     => $rows("SELECT id, track_code, incident_class, reporting_class, status, created_at FROM incident_reports
                                WHERE status IS NULL OR status IN ('Pending', 'Processing') ORDER BY created_at DESC LIMIT 4"),
    ];

    // Community Issue Map
    $issueOpen = "status IN ('Reported', 'Acknowledged', 'In Progress')";
    $out['issues'] = [
        'open'        => $one("SELECT COUNT(*) FROM community_issues WHERE $issueOpen"),
        'new'         => $one("SELECT COUNT(*) FROM community_issues WHERE status = 'Reported'"),
        'in_progress' => $one("SELECT COUNT(*) FROM community_issues WHERE status = 'In Progress'"),
        'resolved_30d'=> $one("SELECT COUNT(*) FROM community_issues WHERE status = 'Resolved' AND status_updated_at >= CURDATE() - INTERVAL 30 DAY"),
        'top'         => $rows("SELECT issue_id, category, landmark, report_count, status FROM community_issues WHERE $issueOpen
                                 ORDER BY report_count DESC, last_reported_at DESC LIMIT 4"),
    ];

    // Disaster risk
    $alert = $rows("SELECT id, title, alert_level, calamity_type, affected_areas, updated_at FROM disaster_alerts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1")[0] ?? null;
    // 'Available' counts as open, same rule as disaster_risk.php.
    $centers = $rows("SELECT COUNT(*) n, SUM(status = 'Available') available,
                             COALESCE(SUM(capacity_families), 0) capacity, COALESCE(SUM(current_families), 0) occupied
                        FROM evacuation_centers")[0] ?? [];
    $out['disaster'] = [
        'active_alert' => $alert,
        'active_alerts' => $one("SELECT COUNT(*) FROM disaster_alerts WHERE is_active = 1"),
        'centers' => (int)($centers['n'] ?? 0), 'centers_available' => (int)($centers['available'] ?? 0),
        'capacity' => (int)($centers['capacity'] ?? 0), 'occupied' => (int)($centers['occupied'] ?? 0),
        // Hazard feeds (migration 022): read from the cache only, never fetched here.
        'hazards_detected' => $one("SELECT COUNT(*) FROM hazard_events WHERE status = 'new' AND detected_at >= NOW() - INTERVAL 3 DAY"),
        'live' => null,
    ];
    try {
        require_once __DIR__ . '/hazard_feeds_common.php';
        $live = pb2_haz_live($conn);
        $storm = $live['typhoon']['pagasa']['storms'][0] ?? null;
        $out['disaster']['live'] = [
            'storm' => $storm ? ['name' => $storm['name'], 'category' => $storm['category'], 'cavite_signal' => $storm['cavite_signal'], 'distance_km' => $storm['distance_km']] : null,
            'storm_active' => (bool)($live['typhoon']['pagasa']['active'] ?? false),
            'quakes_7d' => $live['earthquakes']['count_7d'],
            'strongest_quake' => $live['earthquakes']['strongest_7d'],
            'quake_source' => $live['earthquakes']['source'],
            'rain_today_mm' => $live['rainfall'][0]['mm'] ?? null,
        ];
    } catch (Throwable $e) { /* feeds not set up yet */ }

    // Waste collection today (collection_day is typed text, e.g. "MONDAY & THURSDAY")
    $todayName = strtoupper(date('l'));
    $stmt = $conn->prepare("SELECT zone_area, collection_time, waste_type FROM waste_schedules
                             WHERE UPPER(collection_day) LIKE CONCAT('%', ?, '%') AND (status IS NULL OR status = 'Active') ORDER BY collection_time LIMIT 6");
    $waste = [];
    if ($stmt) {
        $stmt->bind_param('s', $todayName);
        $stmt->execute();
        $waste = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
    }
    $out['waste'] = ['day' => date('l'), 'today' => $waste, 'active_schedules' => $one("SELECT COUNT(*) FROM waste_schedules WHERE status IS NULL OR status = 'Active'")];

    // Announcements
    $out['announcements'] = $rows("SELECT announcement_id, caption, audience_type, created_at FROM announcements ORDER BY created_at DESC LIMIT 3");

    // Service usage this month (paid APIs)
    $month = date('Y-m');
    $out['usage'] = [
        'sms_used' => $one("SELECT sms_count FROM sms_usage WHERE usage_month = '$month'"),
        'sms_cap'  => defined('SMS_MONTHLY_CAP') ? (int)SMS_MONTHLY_CAP : 0,
        'ocr_used' => $one("SELECT call_count FROM ocr_vision_usage WHERE usage_month = '$month'"),
        'ocr_cap'  => defined('OCR_MONTHLY_CAP') ? (int)OCR_MONTHLY_CAP : 0,
    ];

    // Recent registrations
    $out['recent_residents'] = $rows("SELECT resident_id, control_num, TRIM(CONCAT(fName, ' ', lName)) AS name, status, approval_method, date_registered
                                        FROM residents ORDER BY date_registered DESC LIMIT 5");

    // Admin activity (Super Admins only, like the audit log)
    $out['activity'] = $isSuper ? $rows("SELECT actor_username, description, created_at FROM admin_audit_log ORDER BY log_id DESC LIMIT 6") : null;

    echo json_encode(['success' => true] + $out);
    exit;
}

// --- ACTION 2: RECENT REGISTRATIONS (MATCHING EXACT CASING AND TIMESTAMP) ---
if ($api_action === 'recent_residents') {
    // Uses fName, lName, and date_registered columns found in your sql dump
    $query = "SELECT 
                resident_id, 
                fName as first_name, 
                lName as last_name, 
                DATE_FORMAT(date_registered, '%b %d, %Y') as created_at 
              FROM residents 
              ORDER BY date_registered DESC 
              LIMIT 4";
              
    $result = $conn->query($query);
    
    $recent_records = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $recent_records[] = $row;
        }
    }
    
    echo json_encode($recent_records);
    exit;
}

echo json_encode(["success" => false, "message" => "Endpoint signature mismatch."]);
exit;
?>