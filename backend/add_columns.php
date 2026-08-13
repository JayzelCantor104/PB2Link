<?php
/** @var mysqli|false $conn */
include_once __DIR__ . '/db_connection.php';

if (!$conn) {
    die('Database connection failed. Check backend/config.php and that the barangay_bims database exists.' . PHP_EOL);
}

$query = 'ALTER TABLE users ADD COLUMN reset_token VARCHAR(64) NULL, ADD COLUMN reset_expiry DATETIME NULL';
if (mysqli_query($conn, $query)) {
    echo 'Columns added successfully';
} else {
    echo 'Error: ' . mysqli_error($conn);
}
?>