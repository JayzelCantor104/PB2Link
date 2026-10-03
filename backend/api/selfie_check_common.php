<?php
/**
 * Verification-selfie check (migration 014).
 *
 * check_selfie.php asks Google Vision for the faces and readable text in a
 * "selfie holding ID" photo and stores the result under a one-time token tied
 * to the photo's SHA-256. When the registration / ID-change form is sent, the
 * server judges that stored result itself (never the browser's verdict):
 *
 *   1. the selfie isn't the same file as the ID front/back photo,
 *   2. there is a face AND a clearly smaller second face — the photo printed
 *      on the ID. A photo of the ID alone has only that one small face, so it
 *      fails here,
 *   3. the resident's surname or given name can be read on the ID in the photo.
 *
 * A failed check never blocks: the record is saved as 'Needs Review' with the
 * reason for staff. No usable check (scanning unavailable, no token, a
 * different photo) is 'Not Checked'.
 *
 * Callers must already have $conn (db_connection.php).
 */

require_once __DIR__ . '/philsys_scan_common.php'; // pb2_scan_normalize()

const PB2_SELFIE_TOKEN_TTL_SECONDS = 3600;
// Vision's own confidence that a box really is a face.
const PB2_SELFIE_MIN_FACE_CONFIDENCE = 0.5;
// The ID's printed photo must be at most this fraction of the person's face
// height. At arm's length the ID portrait is typically a quarter or less.
const PB2_SELFIE_ID_FACE_MAX_RATIO = 0.67;

/**
 * Reduces Vision faceAnnotations to what the check needs:
 * ['face_count' => int, 'id_face' => bool].
 */
function pb2_selfie_analyze_faces(array $faceAnnotations): array
{
    $heights = [];
    foreach ($faceAnnotations as $face) {
        if ((float)($face['detectionConfidence'] ?? 0) < PB2_SELFIE_MIN_FACE_CONFIDENCE) continue;
        // fdBoundingPoly hugs the face itself; boundingPoly includes the head.
        $ys = array_map(function ($v) { return (int)($v['y'] ?? 0); },
            $face['fdBoundingPoly']['vertices'] ?? $face['boundingPoly']['vertices'] ?? []);
        if (count($ys) < 2) continue;
        $h = max($ys) - min($ys);
        if ($h > 0) $heights[] = $h;
    }
    rsort($heights);
    $idFace = false;
    for ($i = 1; $i < count($heights); $i++) {
        if ($heights[$i] <= $heights[0] * PB2_SELFIE_ID_FACE_MAX_RATIO) { $idFace = true; break; }
    }
    return ['face_count' => count($heights), 'id_face' => $idFace];
}

/** Every word of $name appears as a whole word in the normalized text. */
function pb2_selfie_name_in_text(string $normalizedText, ?string $name): bool
{
    $words = array_filter(explode(' ', pb2_scan_normalize((string)$name)), function ($w) { return strlen($w) >= 2; });
    if (!$words) return false;
    $hay = ' ' . $normalizedText . ' ';
    foreach ($words as $w) {
        if (strpos($hay, " $w ") === false) return false;
    }
    return true;
}

/**
 * Judges a stored check. $fName/$lName may be empty (the registration form
 * before the name is known): the name step is then skipped, which is only
 * ever done for the on-page hint — the final judgement always has the name.
 *
 * Returns ['status' => 'Verified'|'Needs Review', 'code' => ..., 'message' =>
 * resident-facing advice, 'note' => staff-facing reason].
 */
function pb2_selfie_judge(array $row, string $fName, string $lName): array
{
    if ((int)$row['face_count'] === 0) {
        return ['status' => 'Needs Review', 'code' => 'no_face',
            'message' => "We couldn't find a face in this photo. Take the selfie facing the camera in good light, holding your ID beside your face.",
            'note' => 'No face was found in the selfie.'];
    }
    if (!(int)$row['id_face']) {
        return ['status' => 'Needs Review', 'code' => 'no_id_photo',
            'message' => "We couldn't see both your face and the photo on your ID. Hold the ID beside your face with its photo side toward the camera — a picture of the ID alone won't pass.",
            'note' => 'Only one face was found — the ID\'s photo was not visible, or this is not a selfie.'];
    }
    if (trim($fName . $lName) !== '') {
        $text = pb2_scan_normalize((string)$row['ocr_text']);
        if (!pb2_selfie_name_in_text($text, $lName) && !pb2_selfie_name_in_text($text, $fName)) {
            return ['status' => 'Needs Review', 'code' => 'name_not_read',
                'message' => "We can see you and an ID, but couldn't read your name on it. Hold the ID closer to the camera, keep it in focus, and avoid glare.",
                'note' => 'A face and an ID photo were found, but the resident\'s name could not be read on the ID.'];
        }
    }
    return ['status' => 'Verified', 'code' => 'ok', 'message' => '', 'note' => ''];
}

/** Loads an unused, unexpired check for exactly this photo, or null. */
function pb2_selfie_load(mysqli $conn, string $token, string $imageBinary): ?array
{
    if (!preg_match('/^[a-f0-9]{32}$/', $token) || $imageBinary === '') return null;
    $stmt = $conn->prepare("SELECT image_sha256, face_count, id_face, ocr_text, created_at, used_at FROM selfie_check_results WHERE check_token = ?");
    $stmt->bind_param("s", $token);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row || $row['used_at'] !== null) return null;
    if (time() - strtotime($row['created_at']) > PB2_SELFIE_TOKEN_TTL_SECONDS) return null;
    if (!hash_equals($row['image_sha256'], hash('sha256', $imageBinary))) return null;
    return $row;
}

function pb2_selfie_mark_used(mysqli $conn, string $token): void
{
    $now = date('Y-m-d H:i:s');
    $stmt = $conn->prepare("UPDATE selfie_check_results SET used_at = ? WHERE check_token = ? AND used_at IS NULL");
    $stmt->bind_param("ss", $now, $token);
    $stmt->execute();
    $stmt->close();
}

/**
 * One call for submit endpoints. $otherBinaries = the ID front/back photos.
 * Returns ['status' => 'Verified'|'Needs Review'|'Not Checked', 'notes' =>
 * staff-facing reason or null, 'token' => token to mark used, or null].
 */
function pb2_selfie_finalize(mysqli $conn, ?string $token, string $selfieBinary, array $otherBinaries,
                             string $fName, string $lName): array
{
    $selfieHash = hash('sha256', $selfieBinary);
    foreach ($otherBinaries as $other) {
        if ($other !== '' && hash_equals(hash('sha256', $other), $selfieHash)) {
            return ['status' => 'Needs Review', 'notes' => 'The selfie is the same photo as the ID front/back photo.', 'token' => null];
        }
    }
    $row = $token ? pb2_selfie_load($conn, $token, $selfieBinary) : null;
    if (!$row) {
        return ['status' => 'Not Checked', 'notes' => 'The selfie was not checked automatically — compare it with the ID photos.', 'token' => null];
    }
    $judged = pb2_selfie_judge($row, $fName, $lName);
    return ['status' => $judged['status'], 'notes' => $judged['note'] ?: null, 'token' => $token];
}
