<?php
/**
 * One-time merge of the two upload roots (command line only).
 *
 * Before: backend/uploads/ held the public site images (announcements, issue
 * map photos, council photos, the payment QR, old Edit Profile proofs) with
 * paths stored relative to it ("announcements/4/x.jpg"), while everything else
 * lived in backend/api/uploads/ with paths stored as "uploads/..." relative to
 * backend/api. After: one root, backend/api/uploads/, and every stored path is
 * "uploads/<folder>/..." relative to backend/api, served at /api_backend/<path>.
 *
 *   php backend/merge_upload_roots.php          (dry run: lists what would change)
 *   php backend/merge_upload_roots.php --apply
 *
 * Safe to re-run: moved files and prefixed paths are skipped. Run it right
 * after deploying the code that reads the new paths.
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/db_connection.php';
$apply = in_array('--apply', $argv, true);
$old = __DIR__ . '/uploads';
$new = __DIR__ . '/api/uploads';
$say = fn($s) => print(($apply ? '' : '[dry run] ') . $s . "\n");

// ---- 1. Files: every folder under backend/uploads/ moves under backend/api/uploads/.
$movedFiles = 0; $conflicts = [];
if (is_dir($old)) {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($old, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
    foreach ($it as $f) {
        if (!$f->isFile()) continue;
        $rel = substr(str_replace('\\', '/', $f->getPathname()), strlen(str_replace('\\', '/', $old)) + 1);
        if ($rel === '.htaccess') continue;                    // the new root has its own
        $dest = $new . '/' . $rel;
        if (is_file($dest)) {
            if (hash_file('sha256', $dest) !== hash_file('sha256', $f->getPathname())) $conflicts[] = $rel;
            elseif ($apply) unlink($f->getPathname());          // same file already moved
            continue;
        }
        if ($apply) {
            if (!is_dir(dirname($dest))) mkdir(dirname($dest), 0755, true);
            if (!rename($f->getPathname(), $dest)) { fwrite(STDERR, "Could not move $rel\n"); continue; }
        }
        $movedFiles++;
    }
}
$say("$movedFiles file(s) " . ($apply ? 'moved' : 'to move') . " into backend/api/uploads/.");
if ($conflicts) {
    fwrite(STDERR, "These exist in both roots with different content; left in place, check by hand:\n  " . implode("\n  ", $conflicts) . "\n");
}

// ---- 2. Stored paths: add the "uploads/" prefix (only where it is missing).
$updates = [
    ['announcement_images',     'image_path',    "image_path LIKE 'announcements/%'"],
    ['community_issue_reports', 'photo_path',    "photo_path LIKE 'issue_reports/%'"],
    ['barangay_officials',      'photo_path',    "photo_path LIKE 'officials/%'"],
    ['system_settings',         'setting_value', "setting_key = 'payment_qr_path' AND setting_value LIKE 'payment/%'"],
];
foreach ($updates as [$table, $col, $where]) {
    $n = (int)$conn->query("SELECT COUNT(*) FROM $table WHERE $where")->fetch_row()[0];
    if ($apply && $n) $conn->query("UPDATE $table SET $col = CONCAT('uploads/', $col) WHERE $where");
    $say("$table.$col: $n path(s) " . ($apply ? 'updated' : 'to update') . '.');
}
// pending_profile_changes keeps "uploads/proofs/..." as it is: that string now
// points into backend/api/uploads/proofs/ (php backend/move_proofs_to_resident_folders.php
// then files those proofs in each resident's own folder).

// ---- 3. Remove the old root once nothing is left in it.
if ($apply && is_dir($old)) {
    $left = 0;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($old, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) {
        if ($f->isDir()) { @rmdir($f->getPathname()); continue; }
        if ($f->getFilename() === '.htaccess' && dirname($f->getPathname()) === $old) continue;
        $left++;
    }
    if ($left === 0) {
        @unlink($old . '/.htaccess');
        @rmdir($old);
        echo is_dir($old) ? "backend/uploads/ could not be removed.\n" : "backend/uploads/ removed: one uploads root now.\n";
    } else {
        echo "backend/uploads/ still holds $left file(s) (see above); it was kept.\n";
    }
}
if (!$apply) echo "Run again with --apply to make these changes.\n";
