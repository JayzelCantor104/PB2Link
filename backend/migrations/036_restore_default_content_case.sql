-- 036_restore_default_content_case.sql
--
-- Website text is stored as typed (see 035). Migration 016 had turned the
-- default waste schedules, segregation guide, evacuation centers and the
-- sample advisory (seeded by backend/create_waste_and_risk_tables.php) into
-- capitals. This restores their original wording, and only for rows that
-- still hold exactly that default text in capitals; edited rows are left alone.
-- Generated from create_waste_and_risk_tables.php. Safe to re-run.

UPDATE `waste_schedules` SET `zone_area` = 'Phase 1 - Main Avenue & Secondary Streets' WHERE BINARY `zone_area` = BINARY 'PHASE 1 - MAIN AVENUE & SECONDARY STREETS';
UPDATE `waste_schedules` SET `collection_day` = 'Monday & Thursday' WHERE BINARY `collection_day` = BINARY 'MONDAY & THURSDAY';
UPDATE `waste_schedules` SET `truck_route` = 'PB2 Barangay Hall -> Entrance Gate -> Sampaguita St. -> Phase 1 Covered Court -> Exit' WHERE BINARY `truck_route` = BINARY 'PB2 BARANGAY HALL -> ENTRANCE GATE -> SAMPAGUITA ST. -> PHASE 1 COVERED COURT -> EXIT';
UPDATE `waste_schedules` SET `disposal_site` = 'Imus City Materials Recovery Facility (MRF)' WHERE BINARY `disposal_site` = BINARY 'IMUS CITY MATERIALS RECOVERY FACILITY (MRF)';
UPDATE `waste_schedules` SET `truck_team` = 'PB2 Green Fleet - Truck #1' WHERE BINARY `truck_team` = BINARY 'PB2 GREEN FLEET - TRUCK #1';
UPDATE `waste_schedules` SET `notes` = 'Strictly drain food waste before leaving bins outside.' WHERE BINARY `notes` = BINARY 'STRICTLY DRAIN FOOD WASTE BEFORE LEAVING BINS OUTSIDE.';
UPDATE `waste_schedules` SET `zone_area` = 'Phase 2 - Golden Mile Subdivision' WHERE BINARY `zone_area` = BINARY 'PHASE 2 - GOLDEN MILE SUBDIVISION';
UPDATE `waste_schedules` SET `collection_day` = 'Tuesday & Friday' WHERE BINARY `collection_day` = BINARY 'TUESDAY & FRIDAY';
UPDATE `waste_schedules` SET `truck_route` = 'Golden Mile Gate -> Acacia Ave -> Narra St. -> Phase 2 Outpost -> Main Highway' WHERE BINARY `truck_route` = BINARY 'GOLDEN MILE GATE -> ACACIA AVE -> NARRA ST. -> PHASE 2 OUTPOST -> MAIN HIGHWAY';
UPDATE `waste_schedules` SET `disposal_site` = 'Imus Central Sanitary Landfill' WHERE BINARY `disposal_site` = BINARY 'IMUS CENTRAL SANITARY LANDFILL';
UPDATE `waste_schedules` SET `truck_team` = 'PB2 Green Fleet - Truck #2' WHERE BINARY `truck_team` = BINARY 'PB2 GREEN FLEET - TRUCK #2';
UPDATE `waste_schedules` SET `notes` = 'Residual waste must be packed securely in tied bags.' WHERE BINARY `notes` = BINARY 'RESIDUAL WASTE MUST BE PACKED SECURELY IN TIED BAGS.';
UPDATE `waste_schedules` SET `zone_area` = 'Purok 3 & Bucandala Border' WHERE BINARY `zone_area` = BINARY 'PUROK 3 & BUCANDALA BORDER';
UPDATE `waste_schedules` SET `collection_day` = 'Wednesday & Saturday' WHERE BINARY `collection_day` = BINARY 'WEDNESDAY & SATURDAY';
UPDATE `waste_schedules` SET `truck_route` = 'Boundary Arch -> Purok 3 Daycare -> Purok 3 Alleys -> Eco Drop Point' WHERE BINARY `truck_route` = BINARY 'BOUNDARY ARCH -> PUROK 3 DAYCARE -> PUROK 3 ALLEYS -> ECO DROP POINT';
UPDATE `waste_schedules` SET `disposal_site` = 'Barangay PB2 Eco-Shed / MRF' WHERE BINARY `disposal_site` = BINARY 'BARANGAY PB2 ECO-SHED / MRF';
UPDATE `waste_schedules` SET `truck_team` = 'PB2 Green Fleet - Truck #3' WHERE BINARY `truck_team` = BINARY 'PB2 GREEN FLEET - TRUCK #3';
UPDATE `waste_schedules` SET `notes` = 'Bring clean and dry plastic bottles and cartons.' WHERE BINARY `notes` = BINARY 'BRING CLEAN AND DRY PLASTIC BOTTLES AND CARTONS.';
UPDATE `waste_segregation` SET `category_name` = 'Biodegradable (Nabubulok)' WHERE BINARY `category_name` = BINARY 'BIODEGRADABLE (NABUBULOK)';
UPDATE `waste_segregation` SET `description` = 'Organic waste that decomposes naturally into compost or fertilizer.' WHERE BINARY `description` = BINARY 'ORGANIC WASTE THAT DECOMPOSES NATURALLY INTO COMPOST OR FERTILIZER.';
UPDATE `waste_segregation` SET `allowed_items` = 'Food scraps, fruit peelings, vegetable trimmings, leftover rice, fish/meat parts, dead leaves, garden clippings' WHERE BINARY `allowed_items` = BINARY 'FOOD SCRAPS, FRUIT PEELINGS, VEGETABLE TRIMMINGS, LEFTOVER RICE, FISH/MEAT PARTS, DEAD LEAVES, GARDEN CLIPPINGS';
UPDATE `waste_segregation` SET `prohibited_items` = 'Plastics, styrofoam, cans, glass, batteries, hazardous chemicals' WHERE BINARY `prohibited_items` = BINARY 'PLASTICS, STYROFOAM, CANS, GLASS, BATTERIES, HAZARDOUS CHEMICALS';
UPDATE `waste_segregation` SET `collection_days` = 'Monday & Thursday (6:00 AM - 9:00 AM)' WHERE BINARY `collection_days` = BINARY 'MONDAY & THURSDAY (6:00 AM - 9:00 AM)';
UPDATE `waste_segregation` SET `guidelines` = 'Drain liquids, use reusable green bins or paper-lined biodegradable bags. Do not mix with plastics.' WHERE BINARY `guidelines` = BINARY 'DRAIN LIQUIDS, USE REUSABLE GREEN BINS OR PAPER-LINED BIODEGRADABLE BAGS. DO NOT MIX WITH PLASTICS.';
UPDATE `waste_segregation` SET `category_name` = 'Non-Biodegradable / Residual' WHERE BINARY `category_name` = BINARY 'NON-BIODEGRADABLE / RESIDUAL';
UPDATE `waste_segregation` SET `description` = 'Inorganic and non-recyclable solid waste that goes to sanitary disposal.' WHERE BINARY `description` = BINARY 'INORGANIC AND NON-RECYCLABLE SOLID WASTE THAT GOES TO SANITARY DISPOSAL.';
UPDATE `waste_segregation` SET `allowed_items` = 'Worn-out rags, sanitary napkins, ceramic shards, soiled foil wrappers, diapers, broken slippers' WHERE BINARY `allowed_items` = BINARY 'WORN-OUT RAGS, SANITARY NAPKINS, CERAMIC SHARDS, SOILED FOIL WRAPPERS, DIAPERS, BROKEN SLIPPERS';
UPDATE `waste_segregation` SET `prohibited_items` = 'Recyclable clean PET bottles, organic food waste, car batteries' WHERE BINARY `prohibited_items` = BINARY 'RECYCLABLE CLEAN PET BOTTLES, ORGANIC FOOD WASTE, CAR BATTERIES';
UPDATE `waste_segregation` SET `collection_days` = 'Tuesday & Friday (7:00 AM - 10:00 AM)' WHERE BINARY `collection_days` = BINARY 'TUESDAY & FRIDAY (7:00 AM - 10:00 AM)';
UPDATE `waste_segregation` SET `guidelines` = 'Ensure bags are tied tightly to avoid scattering by street animals. Sharp items must be securely wrapped.' WHERE BINARY `guidelines` = BINARY 'ENSURE BAGS ARE TIED TIGHTLY TO AVOID SCATTERING BY STREET ANIMALS. SHARP ITEMS MUST BE SECURELY WRAPPED.';
UPDATE `waste_segregation` SET `category_name` = 'Recyclables (Mareresiklo)' WHERE BINARY `category_name` = BINARY 'RECYCLABLES (MARERESIKLO)';
UPDATE `waste_segregation` SET `description` = 'Dry solid materials that can be salvaged, reprocessed, or sold to scrap dealers.' WHERE BINARY `description` = BINARY 'DRY SOLID MATERIALS THAT CAN BE SALVAGED, REPROCESSED, OR SOLD TO SCRAP DEALERS.';
UPDATE `waste_segregation` SET `allowed_items` = 'PET plastic bottles, cardboard cartons, clean newspapers, aluminum/tin cans, glass bottles, hard plastics' WHERE BINARY `allowed_items` = BINARY 'PET PLASTIC BOTTLES, CARDBOARD CARTONS, CLEAN NEWSPAPERS, ALUMINUM/TIN CANS, GLASS BOTTLES, HARD PLASTICS';
UPDATE `waste_segregation` SET `prohibited_items` = 'Dirty food containers, greasy pizza boxes, medical syringes' WHERE BINARY `prohibited_items` = BINARY 'DIRTY FOOD CONTAINERS, GREASY PIZZA BOXES, MEDICAL SYRINGES';
UPDATE `waste_segregation` SET `collection_days` = 'Wednesday & Saturday (8:00 AM - 11:00 AM)' WHERE BINARY `collection_days` = BINARY 'WEDNESDAY & SATURDAY (8:00 AM - 11:00 AM)';
UPDATE `waste_segregation` SET `guidelines` = 'Rinse bottles with water and dry before segregating. Flatten cardboard boxes to conserve space.' WHERE BINARY `guidelines` = BINARY 'RINSE BOTTLES WITH WATER AND DRY BEFORE SEGREGATING. FLATTEN CARDBOARD BOXES TO CONSERVE SPACE.';
UPDATE `waste_segregation` SET `category_name` = 'Special & Hazardous Waste' WHERE BINARY `category_name` = BINARY 'SPECIAL & HAZARDOUS WASTE';
UPDATE `waste_segregation` SET `description` = 'Toxic, chemical, or electronic items requiring specialized barangay handling.' WHERE BINARY `description` = BINARY 'TOXIC, CHEMICAL, OR ELECTRONIC ITEMS REQUIRING SPECIALIZED BARANGAY HANDLING.';
UPDATE `waste_segregation` SET `allowed_items` = 'Busted fluorescent bulbs (CFL/LED), used alkaline batteries, expired medicines, paint cans, old cellphones/chargers' WHERE BINARY `allowed_items` = BINARY 'BUSTED FLUORESCENT BULBS (CFL/LED), USED ALKALINE BATTERIES, EXPIRED MEDICINES, PAINT CANS, OLD CELLPHONES/CHARGERS';
UPDATE `waste_segregation` SET `prohibited_items` = 'Regular household trash and kitchen food waste' WHERE BINARY `prohibited_items` = BINARY 'REGULAR HOUSEHOLD TRASH AND KITCHEN FOOD WASTE';
UPDATE `waste_segregation` SET `collection_days` = '1st Saturday of the Month (Eco-Shed Drop-off)' WHERE BINARY `collection_days` = BINARY '1ST SATURDAY OF THE MONTH (ECO-SHED DROP-OFF)';
UPDATE `waste_segregation` SET `guidelines` = 'Never dispose in general trash. Bring directly to the Barangay PB2 Eco-Center or hand over to Green Officers.' WHERE BINARY `guidelines` = BINARY 'NEVER DISPOSE IN GENERAL TRASH. BRING DIRECTLY TO THE BARANGAY PB2 ECO-CENTER OR HAND OVER TO GREEN OFFICERS.';
UPDATE `evacuation_centers` SET `name` = 'Pasong Buaya II Covered Court' WHERE BINARY `name` = BINARY 'PASONG BUAYA II COVERED COURT';
UPDATE `evacuation_centers` SET `location` = 'Barangay Compound, Pasong Buaya II, Imus, Cavite' WHERE BINARY `location` = BINARY 'BARANGAY COMPOUND, PASONG BUAYA II, IMUS, CAVITE';
UPDATE `evacuation_centers` SET `facilities` = 'Potable Water Station, 4 Clean Restrooms, Standby First Aid Station, Heavy-duty Generator, Relief Packs Storage' WHERE BINARY `facilities` = BINARY 'POTABLE WATER STATION, 4 CLEAN RESTROOMS, STANDBY FIRST AID STATION, HEAVY-DUTY GENERATOR, RELIEF PACKS STORAGE';
UPDATE `evacuation_centers` SET `contact_person` = 'Kagawad on Duty (BDRRMC Focal)' WHERE BINARY `contact_person` = BINARY 'KAGAWAD ON DUTY (BDRRMC FOCAL)';
UPDATE `evacuation_centers` SET `name` = 'PB2 Elementary School Multi-Purpose Bldg' WHERE BINARY `name` = BINARY 'PB2 ELEMENTARY SCHOOL MULTI-PURPOSE BLDG';
UPDATE `evacuation_centers` SET `location` = 'Purok 2, Pasong Buaya II, Imus, Cavite' WHERE BINARY `location` = BINARY 'PUROK 2, PASONG BUAYA II, IMUS, CAVITE';
UPDATE `evacuation_centers` SET `facilities` = '10 Designated Classroom Quarters, 6 Restrooms, Community Kitchen, Medical Triage Booth' WHERE BINARY `facilities` = BINARY '10 DESIGNATED CLASSROOM QUARTERS, 6 RESTROOMS, COMMUNITY KITCHEN, MEDICAL TRIAGE BOOTH';
UPDATE `evacuation_centers` SET `contact_person` = 'School Coordinator / BDRRMC Officer' WHERE BINARY `contact_person` = BINARY 'SCHOOL COORDINATOR / BDRRMC OFFICER';
UPDATE `evacuation_centers` SET `name` = 'Barangay Hall Disaster Operations Center' WHERE BINARY `name` = BINARY 'BARANGAY HALL DISASTER OPERATIONS CENTER';
UPDATE `evacuation_centers` SET `location` = 'Main Road, Pasong Buaya II, Imus, Cavite' WHERE BINARY `location` = BINARY 'MAIN ROAD, PASONG BUAYA II, IMUS, CAVITE';
UPDATE `evacuation_centers` SET `facilities` = 'Command Center, 2-Way Radio Base, Emergency Power, Health Center Clinic, 24/7 CCTV Monitoring' WHERE BINARY `facilities` = BINARY 'COMMAND CENTER, 2-WAY RADIO BASE, EMERGENCY POWER, HEALTH CENTER CLINIC, 24/7 CCTV MONITORING';
UPDATE `evacuation_centers` SET `contact_person` = 'Punong Barangay / BDRRMC Head' WHERE BINARY `contact_person` = BINARY 'PUNONG BARANGAY / BDRRMC HEAD';
UPDATE `disaster_alerts` SET `title` = 'Habagat & Heavy Rainfall Weather Watch' WHERE BINARY `title` = BINARY 'HABAGAT & HEAVY RAINFALL WEATHER WATCH';
UPDATE `disaster_alerts` SET `calamity_type` = 'Heavy Rainfall / Monsoon' WHERE BINARY `calamity_type` = BINARY 'HEAVY RAINFALL / MONSOON';
UPDATE `disaster_alerts` SET `affected_areas` = 'Low-lying subdivisions in Phase 1, Riverside areas along Bucandala creek, and Purok 4' WHERE BINARY `affected_areas` = BINARY 'LOW-LYING SUBDIVISIONS IN PHASE 1, RIVERSIDE AREAS ALONG BUCANDALA CREEK, AND PUROK 4';
UPDATE `disaster_alerts` SET `evacuation_schedule` = 'Voluntary pre-emptive evacuation begins at 4:00 PM today for low-lying families' WHERE BINARY `evacuation_schedule` = BINARY 'VOLUNTARY PRE-EMPTIVE EVACUATION BEGINS AT 4:00 PM TODAY FOR LOW-LYING FAMILIES';
UPDATE `disaster_alerts` SET `instructions` = 'Prepare 72-hour Emergency Go Bags (medicines, documents, canned food, flashlight). Secure pets and elevate appliances. Keep emergency contacts handy.' WHERE BINARY `instructions` = BINARY 'PREPARE 72-HOUR EMERGENCY GO BAGS (MEDICINES, DOCUMENTS, CANNED FOOD, FLASHLIGHT). SECURE PETS AND ELEVATE APPLIANCES. KEEP EMERGENCY CONTACTS HANDY.';
