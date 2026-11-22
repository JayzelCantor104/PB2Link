-- 054_ocr_vision_usage_key.sql
--
-- The monthly Google Vision counter (ocr_vision_usage, used by
-- tryReserveVisionQuota() in backend/api/vision_common.php) had lost its
-- primary key, as other tables did in an older dump (see 025 for the
-- announcement tables). "INSERT ... ON DUPLICATE KEY" then added a new row
-- on every scan, and each scan's UPDATE counted up every row of the month,
-- so the month had dozens of rows. The oldest row of each month was counted
-- up on every call, so the highest value is the month's real total: keep it,
-- drop the rest, and put the key back.
--
-- Safe to re-run:
--     Get-Content backend/migrations/054_ocr_vision_usage_key.sql | C:\xampp\mysql\bin\mysql.exe -u root barangay_bims

CREATE TEMPORARY TABLE ocr_vision_usage_totals AS
    SELECT usage_month, MAX(call_count) AS call_count
    FROM ocr_vision_usage
    GROUP BY usage_month;

DELETE FROM ocr_vision_usage;

INSERT INTO ocr_vision_usage (usage_month, call_count)
    SELECT usage_month, call_count FROM ocr_vision_usage_totals;

DROP TEMPORARY TABLE ocr_vision_usage_totals;

ALTER TABLE ocr_vision_usage
    ADD UNIQUE KEY IF NOT EXISTS uniq_usage_month (usage_month);
