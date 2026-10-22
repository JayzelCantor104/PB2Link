<?php
// Advisory SMS to all residents (migration 023).
//
// system_settings.advisory_sms_mode:
//   manual  staff send texts from the SMS dispatcher (broadcast_sms.php),
//           which can target "All residents";
//   auto    pb2_advisory_sms_auto() texts every Active resident with a mobile
//           number when an advisory goes live. Called after staff publish or
//           reactivate an advisory (disaster_risk.php) and after the hazard
//           feed publishes or raises one (hazard_feeds_common.php).
// An advisory is texted once per alert level (disaster_alerts.sms_sent_level),
// so a raised level is texted again and a wording edit is not.
// Emergency texts ignore the residents' notification preference, like the
// dispatcher, and count toward SMS_MONTHLY_CAP without being blocked by it.
//
// Migration 032: each resident gets the advisory in their language
// (residents.preferred_language; the Filipino text when staff wrote one).
// Practice advisories never reach residents: pb2_advisory_went_live() texts
// them to staff only (verified admin mobiles), whatever the SMS mode.

require_once __DIR__ . '/account_approval.php'; // pb2_setting_get
require_once __DIR__ . '/sms.php';
require_once __DIR__ . '/audit_log.php';

const PB2_ADVISORY_SMS_MODES = ['manual', 'auto'];

function pb2_advisory_sms_mode(mysqli $conn): string
{
    $m = pb2_setting_get($conn, 'advisory_sms_mode', 'manual');
    return in_array($m, PB2_ADVISORY_SMS_MODES, true) ? $m : 'manual';
}

/** Every Active resident's mobile number, normalised and de-duplicated. */
function pb2_all_resident_numbers(mysqli $conn): array
{
    $numbers = [];
    $res = $conn->query("SELECT contact_num FROM residents
                         WHERE status = 'ACTIVE' AND contact_num IS NOT NULL AND contact_num <> ''");
    while ($res && ($row = $res->fetch_row())) {
        $n = pb2_sms_normalize($row[0]);
        if ($n !== null) $numbers[$n] = true;
    }
    return array_keys($numbers);
}

/** Active residents' numbers by language: ['en' => [...], 'fil' => [...]]. */
function pb2_resident_numbers_by_language(mysqli $conn): array
{
    $out = ['en' => [], 'fil' => []];
    try {
        $res = $conn->query("SELECT contact_num, preferred_language FROM residents
                             WHERE status = 'ACTIVE' AND contact_num IS NOT NULL AND contact_num <> ''");
    } catch (Throwable $e) {
        return ['en' => pb2_all_resident_numbers($conn), 'fil' => []]; // migration 032 not applied
    }
    while ($res && ($row = $res->fetch_row())) {
        $n = pb2_sms_normalize($row[0]);
        if ($n === null) continue;
        $out[$row[1] === 'fil' ? 'fil' : 'en'][$n] = true;
    }
    // A number shared by two residents gets one text, in English.
    foreach (array_keys($out['en']) as $n) unset($out['fil'][$n]);
    return ['en' => array_keys($out['en']), 'fil' => array_keys($out['fil'])];
}

/** Verified mobile numbers of active staff (practice advisories). */
function pb2_staff_numbers(mysqli $conn): array
{
    $numbers = [];
    $res = $conn->query("SELECT mobile_num FROM admins WHERE status = 'active' AND mobile_verified_at IS NOT NULL AND mobile_num IS NOT NULL");
    while ($res && ($row = $res->fetch_row())) {
        $n = pb2_sms_normalize($row[0]);
        if ($n !== null) $numbers[$n] = true;
    }
    return array_keys($numbers);
}

/**
 * One SMS (160 characters) from the advisory: level, title, then as much of
 * the instructions as fits. $lang 'fil' uses the Filipino text when staff
 * wrote one. Practice advisories start with "PRACTICE".
 */
/**
 * The emergency page link for advisory texts, e.g. "pb2link.com/emergency"
 * (no scheme, to save characters; phones still make it a link). Needs
 * PB2_SITE_URL in config.php, the public address of the site. Without it
 * texts carry no link: an advisory can be sent from the hazard-feed cron,
 * where there is no request to take the address from.
 */
function pb2_advisory_sms_link(): string
{
    if (!defined('PB2_SITE_URL') || trim((string)PB2_SITE_URL) === '') return '';
    $host = preg_replace('#^https?://#i', '', rtrim(trim((string)PB2_SITE_URL), '/'));
    return $host !== '' ? $host . '/emergency' : '';
}

function pb2_advisory_sms_text(array $alert, string $lang = 'en'): string
{
    $fil = $lang === 'fil' && trim((string)($alert['title_fil'] ?? '')) !== '';
    $title = $fil ? $alert['title_fil'] : ($alert['title'] ?? '');
    $body = $fil && trim((string)($alert['instructions_fil'] ?? '')) !== '' ? $alert['instructions_fil'] : ($alert['instructions'] ?? '');
    $text = ((int)($alert['is_practice'] ?? 0) === 1 ? 'PRACTICE - ' : '')
        . 'BRGY PASONG BUAYA II ' . strtoupper($alert['alert_level'] ?? 'ADVISORY') . ': '
        . trim((string)$title) . '. ' . trim((string)$body);
    $text = pb2_sms_clean_text($text);
    // Practice texts go to staff only: no public link.
    $link = (int)($alert['is_practice'] ?? 0) === 1 ? '' : pb2_advisory_sms_link();
    $tail = $link !== '' ? ' Info: ' . $link : '';
    $room = 160 - strlen($tail);
    if (strlen($text) > $room) {
        $cut = substr($text, 0, $room - 3);
        $space = strrpos($cut, ' ');
        $text = ($space > $room - 40 ? substr($cut, 0, $space) : $cut) . '...';
    }
    return $text . $tail;
}

/**
 * Text an advisory to all residents if the mode is 'auto', it is active, and
 * this level hasn't been texted yet. Returns null when nothing was due,
 * otherwise ['ok', 'sent', 'message'].
 */
function pb2_advisory_sms_auto(mysqli $conn, int $alertId, ?array $actor = null): ?array
{
    if (pb2_advisory_sms_mode($conn) !== 'auto') return null;

    $alert = pb2_advisory_load($conn, $alertId);
    if (!$alert || (int)$alert['is_active'] !== 1 || (int)($alert['is_practice'] ?? 0) === 1 || $alert['sms_sent_level'] === $alert['alert_level']) return null;

    // Claim this level first, so two requests can't text the same advisory twice.
    $claim = $conn->prepare("UPDATE disaster_alerts SET sms_sent_level = ?, sms_sent_at = NOW()
                             WHERE id = ? AND (sms_sent_level IS NULL OR sms_sent_level <> ?)");
    $claim->bind_param('sis', $alert['alert_level'], $alertId, $alert['alert_level']);
    $claim->execute();
    $claimed = $claim->affected_rows === 1;
    $claim->close();
    if (!$claimed) return null;

    // Each resident in their language: one send per language.
    $groups = pb2_resident_numbers_by_language($conn);
    if (!$groups['en'] && !$groups['fil']) {
        return ['ok' => false, 'sent' => 0, 'message' => 'No resident has a valid mobile number on file.'];
    }
    $sent = 0;
    $lastError = '';
    foreach ($groups as $lang => $numbers) {
        if (!$numbers) continue;
        $r = pb2_send_sms($conn, $numbers, pb2_advisory_sms_text($alert, $lang), 'disaster_broadcast', [
            'admin_id' => $actor['admin_id'] ?? null,
            'bypass_cap' => true,
        ]);
        if ($r['ok']) $sent += count($numbers);
        if (!$r['ok']) $lastError = (string)($r['message'] ?? '');
    }

    if ($sent > 0) {
        $up = $conn->prepare("UPDATE disaster_alerts SET sms_sent_count = ? WHERE id = ?");
        $up->bind_param('ii', $sent, $alertId);
        $up->execute();
        $up->close();
        pb2_log_admin_action('disaster.sms.auto', 'disaster_alert', (string)$alertId,
            "Automatically texted advisory #$alertId ({$alert['alert_level']}) to $sent resident(s)", null, 'success', $actor);
        return ['ok' => true, 'sent' => $sent, 'message' => "Texted to $sent resident(s)."];
    }

    // Release the claim so the next save or feed check can try again.
    $rel = $conn->prepare("UPDATE disaster_alerts SET sms_sent_level = NULL WHERE id = ?");
    $rel->bind_param('i', $alertId);
    $rel->execute();
    $rel->close();
    pb2_log_admin_action('disaster.sms.auto', 'disaster_alert', (string)$alertId,
        "Automatic advisory SMS for #$alertId failed: " . substr($lastError, 0, 120), null, 'failure', $actor);
    return ['ok' => false, 'sent' => 0, 'message' => $lastError ?: 'The SMS provider rejected the text.'];
}

/** The advisory row with the migration-032 columns when they exist. */
function pb2_advisory_load(mysqli $conn, int $alertId): ?array
{
    try {
        $st = $conn->prepare("SELECT id, title, title_fil, alert_level, instructions, instructions_fil, is_active, is_practice, sms_sent_level FROM disaster_alerts WHERE id = ?");
        $st->bind_param('i', $alertId);
        $st->execute();
    } catch (Throwable $e) {
        $st = $conn->prepare("SELECT id, title, alert_level, instructions, is_active, sms_sent_level FROM disaster_alerts WHERE id = ?");
        $st->bind_param('i', $alertId);
        $st->execute();
    }
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    return $row ?: null;
}

/**
 * A practice advisory went live: text it to staff only, once per level.
 * Returns null when nothing was due, otherwise ['ok', 'sent', 'message'].
 */
function pb2_advisory_practice_sms(mysqli $conn, int $alertId, ?array $actor = null): ?array
{
    $alert = pb2_advisory_load($conn, $alertId);
    if (!$alert || (int)$alert['is_active'] !== 1 || (int)($alert['is_practice'] ?? 0) !== 1 || $alert['sms_sent_level'] === $alert['alert_level']) return null;
    $claim = $conn->prepare("UPDATE disaster_alerts SET sms_sent_level = ?, sms_sent_at = NOW()
                             WHERE id = ? AND (sms_sent_level IS NULL OR sms_sent_level <> ?)");
    $claim->bind_param('sis', $alert['alert_level'], $alertId, $alert['alert_level']);
    $claim->execute();
    $claimed = $claim->affected_rows === 1;
    $claim->close();
    if (!$claimed) return null;

    $numbers = pb2_staff_numbers($conn);
    if (!$numbers) return ['ok' => false, 'sent' => 0, 'message' => 'No staff member has a verified mobile number.'];
    $r = pb2_send_sms($conn, $numbers, pb2_advisory_sms_text($alert), 'disaster_practice', ['admin_id' => $actor['admin_id'] ?? null]);
    $sent = $r['ok'] ? count($numbers) : 0;
    $up = $conn->prepare("UPDATE disaster_alerts SET sms_sent_count = ?" . ($r['ok'] ? '' : ', sms_sent_level = NULL') . " WHERE id = ?");
    $up->bind_param('ii', $sent, $alertId);
    $up->execute();
    pb2_log_admin_action('disaster.sms.practice', 'disaster_alert', (string)$alertId,
        $r['ok'] ? "Practice advisory #$alertId texted to $sent staff member(s)" : 'Practice SMS failed: ' . substr((string)$r['message'], 0, 120),
        null, $r['ok'] ? 'success' : 'failure', $actor);
    return ['ok' => $r['ok'], 'sent' => $sent, 'message' => $r['ok'] ? "Texted to $sent staff member(s)." : (string)$r['message']];
}

/**
 * Everything that happens when an advisory goes live (published, raised to a
 * higher level, or reactivated): push to devices, and SMS (automatic mode to
 * residents, or staff only for practice). Each runs once per level. Returns a
 * short note for the response message ('' when nothing was sent).
 */
function pb2_advisory_went_live(mysqli $conn, int $alertId, ?array $actor = null): string
{
    require_once __DIR__ . '/advisory_push.php';
    $notes = [];
    $alert = pb2_advisory_load($conn, $alertId);
    $practice = $alert && (int)($alert['is_practice'] ?? 0) === 1;

    $sms = $practice ? pb2_advisory_practice_sms($conn, $alertId, $actor) : pb2_advisory_sms_auto($conn, $alertId, $actor);
    if ($sms !== null) {
        $notes[] = $sms['ok']
            ? ($practice ? "Practice SMS sent to {$sms['sent']} staff member(s)." : "Texted to {$sms['sent']} resident(s).")
            : 'The SMS was not sent: ' . $sms['message'];
    }
    $push = pb2_push_advisory($conn, $alertId, $actor);
    if ($push !== null && $push['sent'] > 0) {
        $notes[] = $practice ? "Pushed to {$push['sent']} staff device(s)." : "Pushed to {$push['sent']} device(s).";
    }
    return $notes ? ' ' . implode(' ', $notes) : '';
}
