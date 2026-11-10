-- 044: A passport has only its photo page, so registration and the Edit Profile
-- ID change no longer ask for a back photo when the ID is a passport
-- (register.php, request_id_change.php). The back photo becomes optional:
--   residents.valid_id_img_back      empty for a passport
--   req_barangay_clearance.id_back   copied from the resident's ID on a "Self"
--                                    request, so it can be empty too
-- Every other ID still requires both sides (checked in PHP). Existing rows are
-- untouched. Safe to re-run.
ALTER TABLE residents MODIFY valid_id_img_back VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE req_barangay_clearance MODIFY id_back VARCHAR(255) NULL DEFAULT NULL;
