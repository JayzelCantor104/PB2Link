<?php
/**
 * One-time move (command line only): Edit Profile proofs saved before the
 * "one folder per resident" rule lived in backend/uploads/proofs/. This moves
 * each file referenced by pending_profile_changes into the resident's own
 * folder, backend/api/uploads/Resident_submitted_valid_ID/<control no.>/, and
 * updates the rows. Files nothing points to are left alone. Safe to re-run.
 *
 *   php backend/move_proofs_to_resident_folders.php          (dry run: lists what would move)
 *   php backend/move_proofs_to_resident_folders.php --apply
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/db_connection.php';
$apply = in_array('--apply', $argv, true);
$api = __DIR__ . '/api/';

$rows = $conn->query("SELECT p.change_id, p.user_id, p.proof_document, p.proof_document_back, r.control_num
                        FROM pending_profile_changes p JOIN residents r ON r.user_id = p.user_id
                       WHERE p.proof_document LIKE 'uploads/proofs/%' OR p.proof_document_back LIKE 'uploads/proofs/%'");
$moved = []; $updates = 0; $missing = 0;
while ($row = $rows->fetch_assoc()) {
    if (!preg_match('/^[A-Za-z0-9-]+$/', (string)$row['control_num'])) continue;
    $destDir = 'uploads/Resident_submitted_valid_ID/' . $row['control_num'] . '/';
    $set = [];
    foreach (['proof_document', 'proof_document_back'] as $col) {
        $old = (string)$row[$col];
        if (strpos($old, 'uploads/proofs/') !== 0 || strpos($old, '..') !== false) continue;
        if (!isset($moved[$old])) {
            $src = is_file($api . $old) ? $api . $old : __DIR__ . '/' . $old; // after / before the merge
            $new = $destDir . 'change_' . basename($old);
            if (!is_file($src) && !is_file($api . $new)) { $missing++; continue; }
            if ($apply && is_file($src)) {
                if (!is_dir($api . $destDir)) mkdir($api . $destDir, 0755, true);
                if (!rename($src, $api . $new)) { fwrite(STDERR, "Could not move $old\n"); continue; }
            }
            $moved[$old] = $new;
        }
        $set[$col] = $moved[$old];
    }
    if (!$set) continue;
    echo ($apply ? 'Moved' : 'Would move') . " change #{$row['change_id']}: " . implode(', ', $set) . "\n";
    if ($apply) {
        foreach ($set as $col => $new) {
            $st = $conn->prepare("UPDATE pending_profile_changes SET `$col` = ? WHERE change_id = ?");
            $id = (int)$row['change_id'];
            $st->bind_param('si', $new, $id);
            $st->execute();
            $st->close();
        }
    }
    $updates++;
}
echo ($apply ? '' : '[dry run] ') . count($moved) . " file(s), $updates change row(s)" . ($missing ? ", $missing file(s) already missing" : '') . ".\n";
if (!$apply && $updates) echo "Run again with --apply to move them.\n";
