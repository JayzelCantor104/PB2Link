<?php
/**
 * Setup script to create and seed tables for:
 * 1. Waste Management & Garbage Pick-up System
 * 2. Disaster Risk Reduction & Management (DRRM) System
 */
include_once __DIR__ . '/db_connection.php';

if (!$conn) {
    die(json_encode([
        'success' => false,
        'message' => 'Database connection failed. Check backend/config.php and database status.'
    ]));
}

$tables = [
    'waste_schedules' => "CREATE TABLE IF NOT EXISTS waste_schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        zone_area VARCHAR(150) NOT NULL,
        collection_day VARCHAR(50) NOT NULL,
        collection_time VARCHAR(100) NOT NULL,
        waste_type VARCHAR(100) NOT NULL,
        truck_route TEXT NOT NULL,
        disposal_site VARCHAR(255) NOT NULL DEFAULT 'Imus City Materials Recovery Facility (MRF) / Central Landfill',
        truck_team VARCHAR(100) DEFAULT 'PB2 Green Fleet - Truck #1',
        status ENUM('Active', 'Suspended', 'Rescheduled', 'Completed') NOT NULL DEFAULT 'Active',
        notes TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

    'waste_segregation' => "CREATE TABLE IF NOT EXISTS waste_segregation (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

    'evacuation_centers' => "CREATE TABLE IF NOT EXISTS evacuation_centers (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

    'disaster_alerts' => "CREATE TABLE IF NOT EXISTS disaster_alerts (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
];

$output = [];

foreach ($tables as $tbl => $sql) {
    if (mysqli_query($conn, $sql)) {
        $output[] = "Table '$tbl' created or verified.";
    } else {
        $output[] = "Error creating '$tbl': " . mysqli_error($conn);
    }
}

// Seed default waste schedules if empty
$chkSchedule = mysqli_query($conn, "SELECT COUNT(*) as cnt FROM waste_schedules");
$rowSchedule = mysqli_fetch_assoc($chkSchedule);
if ($rowSchedule && (int) $rowSchedule['cnt'] === 0) {
    $schedules = [
        [
            'Phase 1 - Main Avenue & Secondary Streets',
            'Monday & Thursday',
            '06:00 AM - 09:00 AM',
            'Biodegradable (Nabubulok)',
            'PB2 Barangay Hall -> Entrance Gate -> Sampaguita St. -> Phase 1 Covered Court -> Exit',
            'Imus City Materials Recovery Facility (MRF)',
            'PB2 Green Fleet - Truck #1',
            'Active',
            'Strictly drain food waste before leaving bins outside.'
        ],
        [
            'Phase 2 - Golden Mile Subdivision',
            'Tuesday & Friday',
            '07:00 AM - 10:00 AM',
            'Non-Biodegradable / Residual',
            'Golden Mile Gate -> Acacia Ave -> Narra St. -> Phase 2 Outpost -> Main Highway',
            'Imus Central Sanitary Landfill',
            'PB2 Green Fleet - Truck #2',
            'Active',
            'Residual waste must be packed securely in tied bags.'
        ],
        [
            'Purok 3 & Bucandala Border',
            'Wednesday & Saturday',
            '08:00 AM - 11:00 AM',
            'Recyclables & Dry Plastics',
            'Boundary Arch -> Purok 3 Daycare -> Purok 3 Alleys -> Eco Drop Point',
            'Barangay PB2 Eco-Shed / MRF',
            'PB2 Green Fleet - Truck #3',
            'Active',
            'Bring clean and dry plastic bottles and cartons.'
        ]
    ];

    $stmt = mysqli_prepare($conn, "INSERT INTO waste_schedules 
        (zone_area, collection_day, collection_time, waste_type, truck_route, disposal_site, truck_team, status, notes) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($schedules as $s) {
        mysqli_stmt_bind_param($stmt, 'sssssssss', $s[0], $s[1], $s[2], $s[3], $s[4], $s[5], $s[6], $s[7], $s[8]);
        mysqli_stmt_execute($stmt);
    }
    mysqli_stmt_close($stmt);
    $output[] = "Seeded initial waste schedules.";
}

// Seed default waste segregation rules if empty
$chkSeg = mysqli_query($conn, "SELECT COUNT(*) as cnt FROM waste_segregation");
$rowSeg = mysqli_fetch_assoc($chkSeg);
if ($rowSeg && (int) $rowSeg['cnt'] === 0) {
    $rules = [
        [
            'Biodegradable (Nabubulok)',
            'green',
            'bi-recycle',
            'Organic waste that decomposes naturally into compost or fertilizer.',
            'Food scraps, fruit peelings, vegetable trimmings, leftover rice, fish/meat parts, dead leaves, garden clippings',
            'Plastics, styrofoam, cans, glass, batteries, hazardous chemicals',
            'Monday & Thursday (6:00 AM - 9:00 AM)',
            'Drain liquids, use reusable green bins or paper-lined biodegradable bags. Do not mix with plastics.'
        ],
        [
            'Non-Biodegradable / Residual',
            'amber',
            'bi-trash2-fill',
            'Inorganic and non-recyclable solid waste that goes to sanitary disposal.',
            'Worn-out rags, sanitary napkins, ceramic shards, soiled foil wrappers, diapers, broken slippers',
            'Recyclable clean PET bottles, organic food waste, car batteries',
            'Tuesday & Friday (7:00 AM - 10:00 AM)',
            'Ensure bags are tied tightly to avoid scattering by street animals. Sharp items must be securely wrapped.'
        ],
        [
            'Recyclables (Mareresiklo)',
            'blue',
            'bi-box-seam-fill',
            'Dry solid materials that can be salvaged, reprocessed, or sold to scrap dealers.',
            'PET plastic bottles, cardboard cartons, clean newspapers, aluminum/tin cans, glass bottles, hard plastics',
            'Dirty food containers, greasy pizza boxes, medical syringes',
            'Wednesday & Saturday (8:00 AM - 11:00 AM)',
            'Rinse bottles with water and dry before segregating. Flatten cardboard boxes to conserve space.'
        ],
        [
            'Special & Hazardous Waste',
            'red',
            'bi-exclamation-octagon-fill',
            'Toxic, chemical, or electronic items requiring specialized barangay handling.',
            'Busted fluorescent bulbs (CFL/LED), used alkaline batteries, expired medicines, paint cans, old cellphones/chargers',
            'Regular household trash and kitchen food waste',
            '1st Saturday of the Month (Eco-Shed Drop-off)',
            'Never dispose in general trash. Bring directly to the Barangay PB2 Eco-Center or hand over to Green Officers.'
        ]
    ];

    $stmt = mysqli_prepare($conn, "INSERT INTO waste_segregation 
        (category_name, color_tag, icon_class, description, allowed_items, prohibited_items, collection_days, guidelines) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($rules as $r) {
        mysqli_stmt_bind_param($stmt, 'ssssssss', $r[0], $r[1], $r[2], $r[3], $r[4], $r[5], $r[6], $r[7]);
        mysqli_stmt_execute($stmt);
    }
    mysqli_stmt_close($stmt);
    $output[] = "Seeded initial segregation categories.";
}

// Seed default evacuation centers if empty
$chkEvac = mysqli_query($conn, "SELECT COUNT(*) as cnt FROM evacuation_centers");
$rowEvac = mysqli_fetch_assoc($chkEvac);
if ($rowEvac && (int) $rowEvac['cnt'] === 0) {
    $centers = [
        [
            'Pasong Buaya II Covered Court',
            'Barangay Compound, Pasong Buaya II, Imus, Cavite',
            120,
            0,
            'Available',
            'Potable Water Station, 4 Clean Restrooms, Standby First Aid Station, Heavy-duty Generator, Relief Packs Storage',
            'Kagawad on Duty (BDRRMC Focal)',
            '(046) 471-0000 / 0917-123-4567'
        ],
        [
            'PB2 Elementary School Multi-Purpose Bldg',
            'Purok 2, Pasong Buaya II, Imus, Cavite',
            180,
            0,
            'Available',
            '10 Designated Classroom Quarters, 6 Restrooms, Community Kitchen, Medical Triage Booth',
            'School Coordinator / BDRRMC Officer',
            '(046) 471-1111 / 0918-765-4321'
        ],
        [
            'Barangay Hall Disaster Operations Center',
            'Main Road, Pasong Buaya II, Imus, Cavite',
            50,
            0,
            'Standby',
            'Command Center, 2-Way Radio Base, Emergency Power, Health Center Clinic, 24/7 CCTV Monitoring',
            'Punong Barangay / BDRRMC Head',
            '(046) 471-2222 / 0999-888-7777'
        ]
    ];

    $stmt = mysqli_prepare($conn, "INSERT INTO evacuation_centers 
        (name, location, capacity_families, current_families, status, facilities, contact_person, contact_number) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($centers as $c) {
        mysqli_stmt_bind_param($stmt, 'ssiissss', $c[0], $c[1], $c[2], $c[3], $c[4], $c[5], $c[6], $c[7]);
        mysqli_stmt_execute($stmt);
    }
    mysqli_stmt_close($stmt);
    $output[] = "Seeded initial evacuation centers.";
}

// Seed default disaster alert if empty
$chkAlert = mysqli_query($conn, "SELECT COUNT(*) as cnt FROM disaster_alerts");
$rowAlert = mysqli_fetch_assoc($chkAlert);
if ($rowAlert && (int) $rowAlert['cnt'] === 0) {
    $stmt = mysqli_prepare($conn, "INSERT INTO disaster_alerts 
        (title, alert_level, calamity_type, affected_areas, evacuation_schedule, instructions, is_active) 
        VALUES (?, ?, ?, ?, ?, ?, ?)");
    $title = "Habagat & Heavy Rainfall Weather Watch";
    $level = "Watch";
    $type = "Heavy Rainfall / Monsoon";
    $areas = "Low-lying subdivisions in Phase 1, Riverside areas along Bucandala creek, and Purok 4";
    $sched = "Voluntary pre-emptive evacuation begins at 4:00 PM today for low-lying families";
    $inst = "Prepare 72-hour Emergency Go Bags (medicines, documents, canned food, flashlight). Secure pets and elevate appliances. Keep emergency contacts handy.";
    $active = 1;
    mysqli_stmt_bind_param($stmt, 'ssssssi', $title, $level, $type, $areas, $sched, $inst, $active);
    mysqli_stmt_execute($stmt);
    mysqli_stmt_close($stmt);
    $output[] = "Seeded initial disaster risk bulletin.";
}

header('Content-Type: application/json');
echo json_encode([
    'success' => true,
    'message' => 'Waste Management and Disaster Risk tables successfully set up.',
    'log' => $output
], JSON_PRETTY_PRINT);

