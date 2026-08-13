<?php
header('Content-Type: application/json');

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();

include_once __DIR__ . '/../db_connection.php';

$sql = "SELECT r.resident_id, r.control_num, r.user_id, r.fName, r.mName, r.lName, r.suffix, r.birth_date, r.gender, r.height, r.contact_num, r.civil_status, r.spouse_name_text, r.blood_type, r.religion, r.birth_city, r.birth_province, r.birth_country, r.house_no, r.street, r.zone, r.subdivision, r.years_in_PB2, r.residency_status, r.contact_person, r.contactp_num, r.contactp_relationship, r.philsys_nat_id, r.valid_id, r.valid_id_img_front, r.valid_id_img_back, r.valid_id_img_holding, r.proof_pwd, r.proof_4ps, r.proof_solo_parent, r.proof_indigent, r.is_senior, r.is_pwd, r.is_4ps, r.is_solo_parent, r.is_indigent, r.date_registered, r.status, u.email
        FROM residents r
        LEFT JOIN users u ON r.user_id = u.user_id
        WHERE r.status = 'Pending'
        ORDER BY r.date_registered DESC";

$result = $conn->query($sql);
if (!$result) {
    echo json_encode(['success' => false, 'message' => $conn->error]);
    exit;
}

$items = [];
while ($row = $result->fetch_assoc()) {
    $row['name'] = trim($row['fName'] . ' ' . ($row['mName'] ? $row['mName'] . ' ' : '') . $row['lName']);
    $items[] = $row;
}

echo json_encode(['success' => true, 'data' => $items]);
$conn->close();
?>