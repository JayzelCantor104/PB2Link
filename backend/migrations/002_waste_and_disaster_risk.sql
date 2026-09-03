-- Migration: 002_waste_and_disaster_risk.sql
-- Description: Tables for Waste Management Scheduler and Disaster Risk Reduction Management (DRRM)

CREATE TABLE IF NOT EXISTS waste_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    zone_area VARCHAR(150) NOT NULL,
    collection_day VARCHAR(50) NOT NULL,
    collection_time VARCHAR(100) NOT NULL,
    waste_type VARCHAR(100) NOT NULL,
    truck_route TEXT NOT NULL,
    disposal_site VARCHAR(255) NOT NULL DEFAULT 'Imus City Materials Recovery Facility (MRF) / Central Sanitary Landfill',
    truck_team VARCHAR(100) DEFAULT 'Brgy. PB2 Green Team - Truck #1',
    status ENUM('Active', 'Suspended', 'Rescheduled', 'Completed') NOT NULL DEFAULT 'Active',
    notes TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS waste_segregation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    color_tag VARCHAR(50) NOT NULL DEFAULT 'green',
    icon_class VARCHAR(50) NOT NULL DEFAULT 'bi-trash-fill',
    description TEXT NOT NULL,
    allowed_items TEXT NOT NULL,
    prohibited_items TEXT NULL,
    collection_days VARCHAR(100) NOT NULL,
    guidelines TEXT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS evacuation_centers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    location VARCHAR(255) NOT NULL,
    capacity_families INT NOT NULL DEFAULT 100,
    current_families INT NOT NULL DEFAULT 0,
    status ENUM('Available', 'Standby', 'Full', 'Closed') NOT NULL DEFAULT 'Available',
    facilities TEXT NOT NULL,
    contact_person VARCHAR(100) NOT NULL,
    contact_number VARCHAR(50) NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS disaster_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    alert_level ENUM('Advisory', 'Watch', 'Warning', 'Severe') NOT NULL DEFAULT 'Advisory',
    calamity_type VARCHAR(100) NOT NULL DEFAULT 'Typhoon / Heavy Rain',
    affected_areas TEXT NOT NULL,
    evacuation_schedule VARCHAR(255) NULL,
    instructions TEXT NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

