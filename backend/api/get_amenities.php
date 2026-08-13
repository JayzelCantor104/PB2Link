<?php
header("Content-Type: application/json");

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();

include_once __DIR__ . '/../db_connection.php';

// ------------------------------------------------------------------------
// AUTOMATION GUARDRAILS (Cleans the database silently before fetching)
// ------------------------------------------------------------------------

// Guardrail 1: Auto-decline pending requests if the reservation date has passed
$autoDeclineSql = "UPDATE req_amenity_reservation 
                   SET status = 'Declined' 
                   WHERE status = 'Pending' AND reservation_date < CURDATE()";
$conn->query($autoDeclineSql);

// Guardrail 2: Auto-complete approved reservations 3 days after the event date has passed
$autoCompleteSql = "UPDATE req_amenity_reservation 
                    SET status = 'Completed' 
                    WHERE status = 'Approved' AND reservation_date < DATE_SUB(CURDATE(), INTERVAL 3 DAY)";
$conn->query($autoCompleteSql);


// ------------------------------------------------------------------------
// MAIN FETCH QUERY
// ------------------------------------------------------------------------
$sql = "SELECT * FROM req_amenity_reservation ORDER BY reservation_date DESC"; 

$result = $conn->query($sql);

if (!$result) {
    echo json_encode(["error" => $conn->error, "sql" => $sql]);
    exit;
}

$reservations = [];
while($row = $result->fetch_assoc()) {
    $reservations[] = $row;
}

echo json_encode($reservations);
$conn->close();
?>