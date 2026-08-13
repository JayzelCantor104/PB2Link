<?php
/**
 * BACKEND: check_tracking_code.php
 * Verifies if a generated tracking code already exists in any request tables.
 */
header('Content-Type: application/json');
include "db_connection.php";

$code = mysqli_real_escape_string($conn, $_GET['code'] ?? '');

if (empty($code)) {
    echo json_encode(['available' => false]);
    exit;
}

// Check uniqueness across the clearance table
// You can expand this to check other transaction tables if necessary
$query = "SELECT tracking_code FROM req_barangay_clearance WHERE tracking_code = '$code'";
$result = mysqli_query($conn, $query);

if (mysqli_num_rows($result) > 0) {
    echo json_encode(['available' => false]);
} else {
    echo json_encode(['available' => true]);
}
?>