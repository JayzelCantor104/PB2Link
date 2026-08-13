<?php
/** @var mysqli|false $conn */
include_once __DIR__ . '/db_connection.php';

if (!$conn) {
    die('Database connection failed. Check backend/config.php and that the barangay_bims database exists.' . PHP_EOL);
}

$result = mysqli_query($conn, 'SELECT user_id, email, reset_token, reset_expiry FROM users WHERE reset_token IS NOT NULL');
echo 'Users with reset tokens:' . PHP_EOL;
while ($row = mysqli_fetch_assoc($result)) {
    echo 'User: ' . $row['user_id'] . ' (' . $row['email'] . ') - Token: ' . substr($row['reset_token'], 0, 10) . '... - Expires: ' . $row['reset_expiry'] . PHP_EOL;
}

echo PHP_EOL . 'Current time: ' . date('Y-m-d H:i:s') . PHP_EOL;
?>