<?php
/** @var mysqli|false $conn */
include_once __DIR__ . '/db_connection.php';

if (!$conn) {
    die('Database connection failed. Check backend/config.php and that the barangay_bims database exists.' . PHP_EOL);
}

$statements = [
    'announcements' => "CREATE TABLE IF NOT EXISTS announcements (
        announcement_id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NOT NULL,
        caption TEXT NOT NULL,
        audience_type ENUM('Everyone','Sector','Specific') NOT NULL DEFAULT 'Everyone',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT NULL,
        INDEX idx_created_at (created_at),
        FOREIGN KEY (admin_id) REFERENCES admins(admin_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

    'announcement_images' => "CREATE TABLE IF NOT EXISTS announcement_images (
        image_id INT AUTO_INCREMENT PRIMARY KEY,
        announcement_id INT NOT NULL,
        image_path VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        FOREIGN KEY (announcement_id) REFERENCES announcements(announcement_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

    'announcement_sectors' => "CREATE TABLE IF NOT EXISTS announcement_sectors (
        announcement_id INT NOT NULL,
        sector ENUM('Senior Citizen','PWD','Solo Parent','Indigent','4Ps') NOT NULL,
        PRIMARY KEY (announcement_id, sector),
        FOREIGN KEY (announcement_id) REFERENCES announcements(announcement_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

    'announcement_recipients' => "CREATE TABLE IF NOT EXISTS announcement_recipients (
        announcement_id INT NOT NULL,
        user_id BIGINT NOT NULL,
        PRIMARY KEY (announcement_id, user_id),
        FOREIGN KEY (announcement_id) REFERENCES announcements(announcement_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];

foreach ($statements as $table => $sql) {
    if (mysqli_query($conn, $sql)) {
        echo "OK: $table" . PHP_EOL;
    } else {
        echo "Error creating $table: " . mysqli_error($conn) . PHP_EOL;
    }
}
?>
