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
