<?php
// Prevent PHP notices/warnings from injecting HTML before JSON output
ob_start();
ini_set('display_errors', 0);
error_reporting(E_ALL);

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ob_clean();
    http_response_code(200);
    exit(0);
}

// 1. REQUIRE AUTH GUARD AND BOOTSTRAP SESSION FIRST
$authGuardPath = __DIR__ . '/auth_guard.php';
if (file_exists($authGuardPath)) {
    require_once $authGuardPath;
    if (function_exists('pb2_session_start')) {
        pb2_session_start();
    }
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// 2. NOW SAFELY VERIFY ADMIN PRIVILEGES
if (function_exists('pb2_require_admin')) {
    pb2_require_admin();
} else {
    if (empty($_SESSION['user_id']) || !in_array($_SESSION['role'] ?? '', ['Super', 'Admin', 'Staff'])) {
        ob_clean();
        http_response_code(401);
        echo json_encode([
            "success" => false,
            "message" => "Not authenticated. Please sign in as an administrator.",
            "auth_error" => true
        ]);
        exit;
    }
}

require_once __DIR__ . '/../db_connection.php';

// Resolve PDO or MySQLi connection instance
if (!isset($conn) && isset($pdo)) {
    $conn = $pdo;
}

if (!$conn) {
    ob_clean();
    echo json_encode(["success" => false, "message" => "Database connection failed."]);
    exit;
}

$api_action = $_GET['api'] ?? '';

// ========================================================================= //
// ACTION 1: FETCH ACCURATE COUNTS MATCHING YOUR UNIFIED SCHEMA              //
// ========================================================================= //
if ($api_action === 'dashboard_counts') {
    $total_residents = 0;
    $pending_amenities = 0;
    $pending_docs = 0;
    $active_incidents = 0;
    $pending_profiles = 0;

    // 1. Total Registered Residents (Querying user_information or users table)
    $res = $conn->query("SELECT COUNT(*) as count FROM user_information WHERE status = 'Active'");
    if ($res) {
        $total_residents = $res->fetch_assoc()['count'] ?? 0;
    } else {
        // Fallback check against users table for residents
        $res = $conn->query("SELECT COUNT(*) as count FROM users WHERE role = 'Resident'");
        if ($res) {
            $total_residents = $res->fetch_assoc()['count'] ?? 0;
        }
    }

    // 2. Pending Amenity Reservations (req_amenity_reservation)
    $res = $conn->query("SELECT COUNT(*) as count FROM req_amenity_reservation WHERE status = 'Pending'");
    if ($res) {
        $pending_amenities = $res->fetch_assoc()['count'] ?? 0;
    }

    // 3. Combined Pending Service Submissions & Dynamic Document Requests
    // A. Dynamic Service Builder Submissions
    $dynamic_cnt = 0;
    $res = $conn->query("SELECT COUNT(*) as count FROM service_submissions WHERE status = 'Pending'");
    if ($res) {
        $dynamic_cnt = $res->fetch_assoc()['count'] ?? 0;
    }

    // B. Legacy Individual Document Request Tables (if still populated)
    $clearance_cnt = 0;
    $brgy_id_cnt   = 0;
    $business_cnt  = 0;
    $indigency_cnt = 0;
    $residency_cnt = 0;

    if ($r = $conn->query("SELECT COUNT(*) as count FROM req_barangay_clearance WHERE status = 'Pending'")) {
        $clearance_cnt = $r->fetch_assoc()['count'] ?? 0;
    }
    if ($r = $conn->query("SELECT COUNT(*) as count FROM req_barangay_id WHERE status = 'Pending'")) {
        $brgy_id_cnt = $r->fetch_assoc()['count'] ?? 0;
    }
    if ($r = $conn->query("SELECT COUNT(*) as count FROM req_business_clearance WHERE status = 'Pending'")) {
        $business_cnt = $r->fetch_assoc()['count'] ?? 0;
    }
    if ($r = $conn->query("SELECT COUNT(*) as count FROM req_certificate_indigency WHERE status = 'Pending'")) {
        $indigency_cnt = $r->fetch_assoc()['count'] ?? 0;
    }
    if ($r = $conn->query("SELECT COUNT(*) as count FROM req_certificate_residency WHERE status = 'Pending'")) {
        $residency_cnt = $r->fetch_assoc()['count'] ?? 0;
    }

    $pending_docs = $dynamic_cnt + $clearance_cnt + $brgy_id_cnt + $business_cnt + $indigency_cnt + $residency_cnt;

    // 4. Incident Reports (active or pending blotters)
    $res = $conn->query("SELECT COUNT(*) as count FROM incident_reports WHERE status IS NULL OR status = 'Pending' OR status = 'Active'");
    if ($res) {
        $active_incidents = $res->fetch_assoc()['count'] ?? 0;
    }

    // 5. Pending Profile Changes
    $res = $conn->query("SELECT COUNT(DISTINCT user_id) as count FROM pending_profile_changes WHERE status = 'pending_approval'");
    if ($res) {
        $pending_profiles = $res->fetch_assoc()['count'] ?? 0;
    }

    ob_clean();
    echo json_encode([
        "success" => true,
        "total" => (int)$total_residents,
        "pending_amenities" => (int)$pending_amenities,
        "pending_docs" => (int)$pending_docs,
        "active_incidents" => (int)$active_incidents,
        "pending_profiles" => (int)$pending_profiles
    ]);
    exit;
}

// ========================================================================= //
// ACTION 2: RECENT RESIDENT REGISTRATIONS                                   //
// ========================================================================= //
if ($api_action === 'recent_residents') {
    $recent_records = [];
    // Query from user_information joined with users
    $query = "SELECT ui.info_id as resident_id, ui.fName as first_name, ui.lName as last_name, DATE_FORMAT(ui.created_at, '%b %d, %Y') as created_at FROM user_information ui ORDER BY ui.created_at DESC LIMIT 4";
    $result = $conn->query($query);
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $recent_records[] = $row;
        }
    }

    ob_clean();
    echo json_encode($recent_records);
    exit;
}

ob_clean();
echo json_encode(["success" => false, "message" => "Endpoint signature mismatch."]);
exit;
?>