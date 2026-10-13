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

/** One SMS (160 characters) from the advisory: level, title, then as much of the instructions as fits. */
function pb2_advisory_sms_text(array $alert): string
{
    $text = 'BRGY PASONG BUAYA II ' . strtoupper($alert['alert_level'] ?? 'ADVISORY') . ': '
        . trim((string)($alert['title'] ?? '')) . '. ' . trim((string)($alert['instructions'] ?? ''));
    $text = pb2_sms_clean_text($text);
    if (strlen($text) > 160) {
        $cut = substr($text, 0, 157);
        $space = strrpos($cut, ' ');
        $text = ($space > 120 ? substr($cut, 0, $space) : $cut) . '...';
    }
    return $text;
}

/**
 * Text an advisory to all residents if the mode is 'auto', it is active, and
 * this level hasn't been texted yet. Returns null when nothing was due,
 * otherwise ['ok', 'sent', 'message'].
 */
function pb2_advisory_sms_auto(mysqli $conn, int $alertId, ?array $actor = null): ?array
{
    if (pb2_advisory_sms_mode($conn) !== 'auto') return null;

    $st = $conn->prepare("SELECT id, title, alert_level, instructions, is_active, sms_sent_level FROM disaster_alerts WHERE id = ?");
    $st->bind_param('i', $alertId);
    $st->execute();
    $alert = $st->get_result()->fetch_assoc();
    $st->close();
    if (!$alert || (int)$alert['is_active'] !== 1 || $alert['sms_sent_level'] === $alert['alert_level']) return null;

    // Claim this level first, so two requests can't text the same advisory twice.
    $claim = $conn->prepare("UPDATE disaster_alerts SET sms_sent_level = ?, sms_sent_at = NOW()
                             WHERE id = ? AND (sms_sent_level IS NULL OR sms_sent_level <> ?)");
    $claim->bind_param('sis', $alert['alert_level'], $alertId, $alert['alert_level']);
    $claim->execute();
    $claimed = $claim->affected_rows === 1;
    $claim->close();
    if (!$claimed) return null;

    $numbers = pb2_all_resident_numbers($conn);
    if (!$numbers) {
        return ['ok' => false, 'sent' => 0, 'message' => 'No resident has a valid mobile number on file.'];
    }
    $result = pb2_send_sms($conn, $numbers, pb2_advisory_sms_text($alert), 'disaster_broadcast', [
        'admin_id' => $actor['admin_id'] ?? null,
        'bypass_cap' => true,
    ]);

    if ($result['ok']) {
        $sent = count($numbers);
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
        "Automatic advisory SMS for #$alertId failed: " . substr($result['message'] ?? '', 0, 120), null, 'failure', $actor);
    return ['ok' => false, 'sent' => 0, 'message' => $result['message'] ?: 'The SMS provider rejected the text.'];
}
