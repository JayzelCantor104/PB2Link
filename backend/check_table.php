<?php
/** @var mysqli|false $conn */
include_once __DIR__ . '/db_connection.php';

if (!$conn) {
    die('Database connection failed. Check backend/config.php and that the barangay_bims database exists.' . PHP_EOL);
}

$result = mysqli_query($conn, 'DESCRIBE users');
echo "Users table structure:\n";
while ($row = mysqli_fetch_assoc($result)) {
    echo $row['Field'] . ' - ' . $row['Type'] . ' - ' . ($row['Null'] == 'YES' ? 'NULL' : 'NOT NULL') . "\n";
}
?>