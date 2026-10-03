-- Timestamped DRRM map overlays; evacuation-center coordinates are added lazily by disaster_risk.php.
CREATE TABLE IF NOT EXISTS disaster_map_features (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(180) NOT NULL,
    feature_type VARCHAR(40) NOT NULL,
    description TEXT NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    end_latitude DECIMAL(10,7) NULL,
    end_longitude DECIMAL(10,7) NULL,
    radius_meters INT NOT NULL DEFAULT 180,
    start_at DATETIME NULL,
    end_at DATETIME NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;