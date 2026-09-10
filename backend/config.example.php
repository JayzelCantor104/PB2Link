<?php
/**
 * Configuration TEMPLATE — this file IS committed to version control.
 *
 * Setup:
 *   1. Copy this file to `backend/config.php`
 *   2. Fill in the real values there
 *
 * `backend/config.php` is gitignored and must never be committed.
 * Do not put real credentials in this file.
 */

// --- Database ---
define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'barangay_bims');

// --- SMTP / outbound mail ---
// For Gmail, SMTP_PASS must be a 16-character App Password, NOT the account
// password: https://myaccount.google.com/apppasswords
define('SMTP_HOST', 'smtp.gmail.com');
define('SMTP_PORT', 465);
define('SMTP_USER', 'your-address@gmail.com');
define('SMTP_PASS', 'your-16-char-app-password');
define('SMTP_FROM_EMAIL', 'your-address@gmail.com');
define('SMTP_FROM_NAME', 'Barangay Pasong Buaya II');

// --- Google Cloud Vision OCR (ID scanner) ---
// API key for a Google Cloud project with the Cloud Vision API enabled and
// billing active: console.cloud.google.com -> APIs & Services ->
// Credentials -> Create API key -> restrict it to "Cloud Vision API" only.
// Used server-side only, same as SMTP_PASS above — never sent to the
// frontend. Leave empty to make the scanner degrade cleanly to manual entry.
define('GOOGLE_VISION_API_KEY', '');

// Hard cap on Vision API calls per calendar month (see ocr_vision_usage
// table and tryReserveVisionQuota() in backend/api/ocr_id.php). Once
// reached, the scanner cleanly degrades to "fill in manually" instead of
// ever risking a surprise bill. Google Vision's free tier is 1,000
// DOCUMENT_TEXT_DETECTION units/month, resetting every month — 900 leaves
// headroom rather than riding that line exactly. Verify this is still
// accurate at https://cloud.google.com/vision/pricing before relying on it.
define('OCR_MONTHLY_CAP', 900);
