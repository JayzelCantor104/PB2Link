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