<?php
header("Content-Type: application/json");

require_once __DIR__ . '/auth_guard.php';
pb2_require_admin();

include_once __DIR__ . '/../db_connection.php';

// Get the ID from the URL parameter (e.g., ?id=1)
$id = isset($_GET['id']) ? $conn->real_escape_string($_GET['id']) : null;

if ($id) {
    // We use a JOIN if you need resident details, or just the table if everything is in one
    $sql = "SELECT * FROM req_amenity_reservation WHERE request_id = '$id' LIMIT 1";
    $result = $conn->query($sql);

    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();
        echo json_encode($row);
    } else {
        echo json_encode(["error" => "Reservation not found"]);
    }
} else {
    echo json_encode(["error" => "No ID provided"]);
}

$conn->close();
?>