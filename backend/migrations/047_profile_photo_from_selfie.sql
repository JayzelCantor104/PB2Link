-- 047: Profile photo rule. The selfie with ID (valid_id_img_holding) is a
-- resident's profile photo until they upload their own (Edit Profile,
-- update_profile_picture.php). Registration no longer requires a separate
-- photo. Gives residents with no photo their selfie. Safe to re-run.
UPDATE residents
   SET profile_picture = valid_id_img_holding
 WHERE (profile_picture IS NULL OR profile_picture = '')
   AND valid_id_img_holding IS NOT NULL AND valid_id_img_holding <> '';
