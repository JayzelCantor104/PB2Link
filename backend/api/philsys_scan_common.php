<?php
/**
 * PhilSys (National ID) number verification by scan (migration 013).
 *
 * ocr_id.php stores what Google Vision read from each photo under a one-time
 * scan token, tied to the photo's SHA-256. When a resident submits a PhilSys
 * number together with the card photo, the server checks — itself, not the
 * browser — that:
 *   - the photo is the very one that was scanned (hash match, token < 1 hour
 *     old and unused),
 *   - the 16-digit PhilSys Card Number was printed on it and equals the one
 *     submitted, and
 *   - the name printed on the card matches the resident.
 *
 * Name rule: case, accents (Ñ/N), punctuation and spacing are ignored. Every
 * word of the first and last name must appear on the card; the middle name
 * must too when it's a full name (a middle initial on file is not checked).
 * Suffixes (Jr., III) are ignored.
 *
 * Callers must already have $conn (db_connection.php).
 */

const PB2_SCAN_TOKEN_TTL_SECONDS = 3600;

/** Uppercase A-Z/0-9 words only: "Peña, Ma. José" -> "PENA MA JOSE". */
function pb2_scan_normalize(string $s): string
{
    $s = strtr($s, ['ñ' => 'n', 'Ñ' => 'N']);
    if (function_exists('iconv')) {
        $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
        // Transliteration can leave accent marks behind as separate
        // characters ("José" -> "Jos'e"); drop them so the word stays whole.
        if ($converted !== false) $s = str_replace(["'", '`', '^', '~', '"'], '', $converted);
    }
    $s = strtoupper($s);
    $s = preg_replace('/[^A-Z0-9]+/', ' ', $s);
    return trim(preg_replace('/\s+/', ' ', $s));
}

/**
 * Loads a scan for this photo. Returns ['text' => normalized OCR text,
 * 'raw' => OCR text, 'token' => ...] or null (unknown/expired/used token, or
 * the photo isn't the one that was scanned).
 */
function pb2_scan_load(mysqli $conn, string $token, string $imageBinary): ?array
{
    if (!preg_match('/^[a-f0-9]{32}$/', $token) || $imageBinary === '') return null;
    $stmt = $conn->prepare("SELECT image_sha256, ocr_text, created_at, used_at FROM ocr_scan_results WHERE scan_token = ?");
    $stmt->bind_param("s", $token);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row || $row['used_at'] !== null) return null;
    if (time() - strtotime($row['created_at']) > PB2_SCAN_TOKEN_TTL_SECONDS) return null;
    if (!hash_equals($row['image_sha256'], hash('sha256', $imageBinary))) return null;
    return ['token' => $token, 'raw' => $row['ocr_text'], 'text' => pb2_scan_normalize($row['ocr_text'])];
}

/** Marks a scan as used so the same token can't back a second submission. */
function pb2_scan_mark_used(mysqli $conn, string $token): void
{
    $now = date('Y-m-d H:i:s');
    $stmt = $conn->prepare("UPDATE ocr_scan_results SET used_at = ? WHERE scan_token = ? AND used_at IS NULL");
    $stmt->bind_param("ss", $now, $token);
    $stmt->execute();
    $stmt->close();
}

/** Every 16-digit PhilSys Card Number printed in the scan (digits only). */
function pb2_scan_philsys_numbers(array $scan): array
{
    preg_match_all('/(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/', $scan['raw'], $m);
    return array_values(array_unique(array_map(function ($n) { return preg_replace('/\D/', '', $n); }, $m[0])));
}

/**
 * Does the card's printed name match? Returns ['match' => bool,
 * 'missing' => [name parts not found on the card]].
 */
function pb2_scan_name_matches(array $scan, string $fName, ?string $mName, string $lName): array
{
    $haystack = ' ' . $scan['text'] . ' ';
    $missing = [];
    $check = function ($label, $value) use ($haystack, &$missing) {
        foreach (explode(' ', pb2_scan_normalize((string)$value)) as $word) {
            if ($word === '') continue;
            if (strpos($haystack, " $word ") === false) { $missing[] = $label; return; }
        }
    };
    $check('first name', $fName);
    $check('last name', $lName);
    $middle = pb2_scan_normalize((string)$mName);
    if (strlen(str_replace(' ', '', $middle)) > 1) $check('middle name', $middle); // an initial isn't checked
    return ['match' => empty($missing), 'missing' => $missing];
}

/**
 * One call for callers: verifies a PhilSys submission against its scan.
 * Returns ['status' => 'Matched' | 'Mismatch' | 'Manual Entry', 'reason' => text,
 * 'scan_numbers' => [...]]. 'Manual Entry' = no usable scan (no token,
 * expired/used, or a different photo).
 */
function pb2_philsys_verify(mysqli $conn, ?string $token, string $frontImageBinary, string $submittedNumber,
                            string $fName, ?string $mName, string $lName): array
{
    $scan = $token ? pb2_scan_load($conn, $token, $frontImageBinary) : null;
    if (!$scan) {
        return ['status' => 'Manual Entry', 'reason' => 'No matching scan of this card photo.', 'scan_numbers' => []];
    }
    $numbers = pb2_scan_philsys_numbers($scan);
    $submitted = preg_replace('/\D/', '', $submittedNumber);
    if (!in_array($submitted, $numbers, true)) {
        return ['status' => 'Mismatch', 'reason' => $numbers
            ? 'The PhilSys number does not match the one printed on the card.'
            : 'No PhilSys number could be read on the card.', 'scan_numbers' => $numbers];
    }
    $name = pb2_scan_name_matches($scan, $fName, $mName, $lName);
    if (!$name['match']) {
        return ['status' => 'Mismatch', 'reason' => 'The name on the card does not match your profile (' . implode(', ', $name['missing']) . ').', 'scan_numbers' => $numbers];
    }
    return ['status' => 'Matched', 'reason' => '', 'scan_numbers' => $numbers];
}

/**
 * Copies an Edit Profile upload (backend/uploads/proofs/...) into the
 * resident's own folder under backend/api/uploads/Resident_submitted_valid_ID/,
 * where registration files their documents. Returns the stored path or null.
 */
function pb2_file_proof_on_record(mysqli $conn, $user_id, $src_rel, string $basename): ?string
{
    $src_rel = (string)$src_rel;
    if (strpos($src_rel, 'uploads/proofs/') !== 0 || strpos($src_rel, '..') !== false) return null;
    $src = __DIR__ . '/../' . $src_rel;
    $stmt = $conn->prepare("SELECT control_num FROM residents WHERE user_id = ?");
    $uid = (string)$user_id;
    $stmt->bind_param("s", $uid);
    $stmt->execute();
    $control_num = (string)($stmt->get_result()->fetch_row()[0] ?? '');
    $stmt->close();
    if (!is_file($src) || !preg_match('/^[A-Za-z0-9-]+$/', $control_num)) return null;
    $dest_dir = 'uploads/Resident_submitted_valid_ID/' . $control_num . '/';
    if (!is_dir(__DIR__ . '/' . $dest_dir)) mkdir(__DIR__ . '/' . $dest_dir, 0755, true);
    $dest = $dest_dir . $basename . '_' . time() . '.' . strtolower(pathinfo($src, PATHINFO_EXTENSION));
    return copy($src, __DIR__ . '/' . $dest) ? $dest : null;
}
