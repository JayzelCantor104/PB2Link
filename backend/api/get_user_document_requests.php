<?php
header('Content-Type: application/json');
include_once __DIR__ . '/../db_connection.php';

$user_id = isset($_GET['user_id']) ? intval($_GET['user_id']) : 0;

if (!$user_id) {
    echo json_encode(['success' => false, 'message' => 'User ID required']);
    exit;
}

$requests = [];

// Barangay clearance requests
$sql1 = "SELECT 
    bc.request_id, 
    bc.tracking_code, 
    bc.resident_id, 
    'Barangay Clearance' AS type, 
    bc.fName, 
    bc.mName, 
    bc.lName, 
    bc.suffix,
    bc.purpose, 
    bc.status, 
    bc.date_requested AS requested_at, 
    bc.remarks AS notes,
    bc.beneficiary_name,
    bc.birth_date,
    bc.gender,
    bc.civil_status,
    bc.address,
    bc.sector,
    bc.request_mode,
    bc.years_in_PB2,
    bc.precinct_no,
    bc.id_front,
    bc.id_back,
    bc.id_holding
FROM req_barangay_clearance bc
INNER JOIN residents r ON bc.resident_id = r.resident_id
WHERE r.user_id = ?
ORDER BY bc.date_requested DESC";
$stmt1 = $conn->prepare($sql1);
$stmt1->bind_param('i', $user_id);
$stmt1->execute();
$result1 = $stmt1->get_result();
if ($result1) {
    while ($row = $result1->fetch_assoc()) {
        $row['name'] = trim($row['fName'] . ' ' . ($row['mName'] ? $row['mName'] . ' ' : '') . $row['lName'] . ' ' . ($row['suffix'] ?? ''));
        $requests[] = $row;
    }
}

// Certificate of residency requests
$sql2 = "SELECT 
    cr.request_id, 
    cr.tracking_code, 
    cr.resident_id, 
    'Certificate of Residency' AS type, 
    cr.fName, 
    cr.mName, 
    cr.lName,
    NULL as suffix,
    cr.purpose, 
    cr.status, 
    cr.date_requested AS requested_at, 
    cr.valid_id AS remarks,
    cr.beneficiary_name,
    cr.birth_date,
    cr.gender,
    cr.civil_status,
    cr.address,
    cr.sector,
    NULL as request_mode,
    cr.years_in_PB2,
    NULL as precinct_no,
    cr.valid_id,
    cr.proof_doc,
    NULL as id_holding,
    cr.residency_status
FROM req_certificate_residency cr
INNER JOIN residents r ON cr.resident_id = r.resident_id
WHERE r.user_id = ?
ORDER BY cr.date_requested DESC";
$stmt2 = $conn->prepare($sql2);
$stmt2->bind_param('i', $user_id);
$stmt2->execute();
$result2 = $stmt2->get_result();
if ($result2) {
    while ($row = $result2->fetch_assoc()) {
        $row['name'] = trim($row['fName'] . ' ' . ($row['mName'] ? $row['mName'] . ' ' : '') . $row['lName']);
        $requests[] = $row;
    }
}

// Barangay ID requests
$sql3 = "SELECT 
    bi.request_id, 
    bi.tracking_code, 
    bi.resident_id, 
    'Barangay ID' AS type, 
    bi.fName, 
    bi.mName, 
    bi.lName, 
    bi.suffix,
    NULL as purpose, 
    bi.status, 
    bi.date_requested AS requested_at, 
    NULL AS notes,
    bi.beneficiary_name,
    bi.birth_date,
    NULL as gender,
    NULL as civil_status,
    bi.address,
    NULL as sector,
    bi.request_mode,
    NULL as years_in_PB2,
    NULL as precinct_no,
    bi.id_picture as id_front,
    NULL as id_back,
    bi.signature as id_holding,
    bi.birth_place,
    bi.contact_num,
    bi.height,
    bi.weight,
    bi.blood_type,
    bi.tin_no,
    bi.contact_person,
    bi.contactp_num,
    bi.contactp_relationship,
    bi.emergency_address
FROM req_barangay_id bi
INNER JOIN residents r ON bi.resident_id = r.resident_id
WHERE r.user_id = ?
ORDER BY bi.date_requested DESC";
$stmt3 = $conn->prepare($sql3);
$stmt3->bind_param('i', $user_id);
$stmt3->execute();
$result3 = $stmt3->get_result();
if ($result3) {
    while ($row = $result3->fetch_assoc()) {
        $row['name'] = trim($row['fName'] . ' ' . ($row['mName'] ? $row['mName'] . ' ' : '') . $row['lName'] . ' ' . ($row['suffix'] ?? ''));
        $requests[] = $row;
    }
}

// Business clearance requests
$sql4 = "SELECT 
    bcl.request_id, 
    bcl.tracking_code, 
    bcl.resident_id, 
    'Business Clearance' AS type, 
    bcl.fName, 
    bcl.mName, 
    bcl.lName, 
    bcl.suffix,
    NULL as purpose, 
    bcl.status, 
    bcl.date_requested AS requested_at, 
    NULL AS notes,
    bcl.beneficiary_name,
    NULL as birth_date,
    NULL as gender,
    NULL as civil_status,
    bcl.address,
    NULL as sector,
    bcl.request_mode,
    NULL as years_in_PB2,
    NULL as precinct_no,
    bcl.owner_id as id_front,
    bcl.dti_reg as id_back,
    NULL as id_holding,
    bcl.business_name,
    bcl.business_type,
    bcl.nature_business,
    bcl.business_address,
    bcl.contact_person as business_contact_person,
    bcl.business_contact_num
FROM req_business_clearance bcl
INNER JOIN residents r ON bcl.resident_id = r.resident_id
WHERE r.user_id = ?
ORDER BY bcl.date_requested DESC";
$stmt4 = $conn->prepare($sql4);
$stmt4->bind_param('i', $user_id);
$stmt4->execute();
$result4 = $stmt4->get_result();
if ($result4) {
    while ($row = $result4->fetch_assoc()) {
        $row['name'] = trim($row['fName'] . ' ' . ($row['mName'] ? $row['mName'] . ' ' : '') . $row['lName'] . ' ' . ($row['suffix'] ?? ''));
        $requests[] = $row;
    }
}

// Certificate of indigency requests
$sql5 = "SELECT 
    ci.request_id, 
    ci.tracking_code, 
    ci.resident_id, 
    'Certificate of Indigency' AS type, 
    ci.fName, 
    ci.mName, 
    ci.lName, 
    ci.suffix,
    ci.purpose, 
    ci.status, 
    ci.date_requested AS requested_at, 
    ci.purpose_details AS notes,
    ci.beneficiary_name,
    NULL as birth_date,
    NULL as gender,
    ci.civil_status,
    ci.address,
    NULL as sector,
    ci.request_mode,
    NULL as years_in_PB2,
    NULL as precinct_no,
    ci.valid_id,
    ci.proof_doc,
    NULL as id_holding,
    ci.monthly_income,
    ci.employment_status
FROM req_certificate_indigency ci
INNER JOIN residents r ON ci.resident_id = r.resident_id
WHERE r.user_id = ?
ORDER BY ci.date_requested DESC";
$stmt5 = $conn->prepare($sql5);
$stmt5->bind_param('i', $user_id);
$stmt5->execute();
$result5 = $stmt5->get_result();
if ($result5) {
    while ($row = $result5->fetch_assoc()) {
        $row['name'] = trim($row['fName'] . ' ' . ($row['mName'] ? $row['mName'] . ' ' : '') . $row['lName'] . ' ' . ($row['suffix'] ?? ''));
        $requests[] = $row;
    }
}

// Volunteer registration requests
$sql6 = "SELECT 
    vr.request_id, 
    vr.tracking_code, 
    vr.resident_id, 
    'Volunteer Registration' AS type, 
    vr.fName, 
    vr.mName, 
    vr.lName, 
    vr.suffix,
    NULL as purpose, 
    vr.status, 
    vr.date_requested AS requested_at, 
    vr.skills AS notes,
    NULL as beneficiary_name,
    NULL as birth_date,
    NULL as gender,
    NULL as civil_status,
    vr.address,
    NULL as sector,
    NULL as request_mode,
    NULL as years_in_PB2,
    NULL as precinct_no,
    vr.valid_id,
    NULL as id_back,
    NULL as id_holding,
    vr.contact_num,
    vr.email,
    vr.program_area,
    vr.availability,
    vr.occupation,
    vr.skills
FROM req_volunteer_registration vr
INNER JOIN residents r ON vr.resident_id = r.resident_id
WHERE r.user_id = ?
ORDER BY vr.date_requested DESC";
$stmt6 = $conn->prepare($sql6);
$stmt6->bind_param('i', $user_id);
$stmt6->execute();
$result6 = $stmt6->get_result();
if ($result6) {
    while ($row = $result6->fetch_assoc()) {
        $row['name'] = trim($row['fName'] . ' ' . ($row['mName'] ? $row['mName'] . ' ' : '') . $row['lName'] . ' ' . ($row['suffix'] ?? ''));
        $requests[] = $row;
    }
}

// Amenity reservation requests
$sql7 = "SELECT 
    ar.request_id, 
    ar.tracking_code, 
    ar.resident_id, 
    'Amenity Reservation' AS type, 
    ar.contact_name as fName, 
    NULL as mName, 
    NULL as lName, 
    NULL as suffix,
    ar.purpose, 
    ar.status, 
    ar.date_requested AS requested_at, 
    NULL AS notes,
    NULL as beneficiary_name,
    NULL as birth_date,
    NULL as gender,
    NULL as civil_status,
    NULL as address,
    NULL as sector,
    NULL as request_mode,
    NULL as years_in_PB2,
    NULL as precinct_no,
    ar.id_front,
    NULL as id_back,
    ar.id_holding,
    ar.venue,
    ar.reservation_date,
    ar.time_slot,
    ar.contact_number,
    ar.contact_name
FROM req_amenity_reservation ar
INNER JOIN residents r ON ar.resident_id = r.resident_id
WHERE r.user_id = ?
ORDER BY ar.date_requested DESC";
$stmt7 = $conn->prepare($sql7);
$stmt7->bind_param('i', $user_id);
$stmt7->execute();
$result7 = $stmt7->get_result();
if ($result7) {
    while ($row = $result7->fetch_assoc()) {
        $requests[] = $row;
    }
}

if ($conn->error) {
    echo json_encode(['success' => false, 'message' => $conn->error]);
    exit;
}

echo json_encode([
    'success' => true,
    'data' => $requests,
    'count' => count($requests)
]);
$conn->close();
?>