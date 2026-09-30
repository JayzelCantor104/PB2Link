<?php
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: " . $_SERVER['HTTP_ORIGIN']);
}
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Hardened session cookie (auth_guard.php) — never a bare session_start().
require_once __DIR__ . '/auth_guard.php';
pb2_session_start();

include_once "../db_connection.php";
require_once __DIR__ . '/profile_otp_common.php';

if (!$conn) {
    echo json_encode(["success" => false, "message" => "Database connection failed"]);
    exit;
}

// Authenticate session existence state context
if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'message' => 'Session invalid. Please log in again.']);
    exit;
}
$user_id = $_SESSION['user_id'];

try {
    // Queries data using your exact database user_id column properties layout
    $user_query = $conn->prepare("
        SELECT 
            r.fName, r.mName, r.lName, r.suffix, r.gender, r.birth_date, r.religion, r.civil_status,
            r.birth_city, r.birth_province, r.birth_country, r.house_no, r.street, r.zone, 
            r.subdivision, r.area, r.block_lot, r.landmark, r.residency_status, r.years_in_PB2, r.residing_since,
            r.contact_num, r.contact_person, r.contactp_relationship, r.contactp_num, r.profile_picture,
            r.valid_id, r.valid_id_img_front, r.valid_id_img_back, r.valid_id_img_holding,
            r.height, r.blood_type, r.spouse_name_text, r.philsys_nat_id, r.philsys_img_front, r.philsys_img_back, r.philsys_verification_status, r.age,
            r.is_senior, r.is_pwd, r.is_4ps, r.is_solo_parent, r.is_indigent,
            u.email
        FROM residents r
        JOIN users u ON r.user_id = u.user_id
        WHERE r.user_id = ?
    ");
    $user_query->bind_param("i", $user_id);
    $user_query->execute();
    $user_result = $user_query->get_result()->fetch_assoc();

    if (!$user_result) {
        echo json_encode(['success' => false, 'message' => 'Resident profile record not found.']);
        exit;
    }

    // Pull tracking tables for any active pending changes logs strings
    $changes_query = $conn->prepare("
        SELECT change_id, field_name, old_value, new_value, status, created_at 
        FROM pending_profile_changes 
        WHERE user_id = ? AND status IN ('pending_otp', 'pending_approval')
        ORDER BY created_at DESC
    ");
    $changes_query->bind_param("i", $user_id);
    $changes_query->execute();
    $changes_result = $changes_query->get_result();
    
    $pending_changes = [];
    while ($row = $changes_result->fetch_assoc()) {
        $pending_changes[] = $row;
    }

    echo json_encode([
        'success' => true,
        'user' => $user_result,
        'pending_changes' => $pending_changes,
        // Email codes still waiting (migration 011) — lets the page offer
        // "Enter code / Resend / Cancel" after a reload.
        'otp' => [
            'profile'  => pb2_otp_summary($conn, $user_id, 'profile'),
            'password' => pb2_otp_summary($conn, $user_id, 'password'),
        ],
    ]);

} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Database error execution: ' . $e->getMessage()
    ]);
}
?>