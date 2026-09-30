<?php
/**
 * Shared Google Cloud Vision plumbing for ocr_id.php (ID text) and
 * check_selfie.php (verification selfie): the monthly cost cap and EXIF
 * orientation handling. Callers must already have $conn (db_connection.php),
 * which also defines GOOGLE_VISION_API_KEY / OCR_MONTHLY_CAP.
 */

/**
 * Atomically reserves $units of this month's Vision API quota. Fails
 * closed if the DB is unreachable — unlike the IP rate limiter (which
 * fails open, since it only protects server CPU), this gate exists
 * specifically to bound real Google Cloud cost, so "can't verify the cap"
 * must mean "don't spend," not "allow uncounted." Google bills each
 * feature of a request separately, so a request asking for two features
 * (the selfie check) reserves 2.
 */
function tryReserveVisionQuota($conn, int $units = 1)
{
    if (!$conn) {
        return false;
    }

    $month = date('Y-m');

    $upsert = mysqli_prepare($conn, "INSERT INTO ocr_vision_usage (usage_month, call_count) VALUES (?, 0) ON DUPLICATE KEY UPDATE usage_month = usage_month");
    mysqli_stmt_bind_param($upsert, "s", $month);
    mysqli_stmt_execute($upsert);
    mysqli_stmt_close($upsert);

    mysqli_begin_transaction($conn);

    $stmt = mysqli_prepare($conn, "SELECT call_count FROM ocr_vision_usage WHERE usage_month = ? FOR UPDATE");
    mysqli_stmt_bind_param($stmt, "s", $month);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $row = $result ? mysqli_fetch_assoc($result) : null;
    mysqli_stmt_close($stmt);

    $count = $row ? (int)$row['call_count'] : 0;

    if ($count + $units > OCR_MONTHLY_CAP) {
        mysqli_rollback($conn);
        return false;
    }

    $update = mysqli_prepare($conn, "UPDATE ocr_vision_usage SET call_count = call_count + ? WHERE usage_month = ?");
    mysqli_stmt_bind_param($update, "is", $units, $month);
    mysqli_stmt_execute($update);
    mysqli_stmt_close($update);

    mysqli_commit($conn);
    return true;
}

/**
 * Reads the EXIF Orientation tag (1-8; 1 = already correct). Returns 1 for
 * every non-JPEG format or when EXIF is unreadable/absent — those cases need
 * no correction. Shared by the aspect-ratio check (which must judge the
 * photo's visual dimensions, not its raw stored ones) and
 * preprocessImageGD()'s actual pixel correction, so both always agree on
 * what "this photo's real orientation" means.
 */
function detectExifOrientation($inputPath, $mimeType)
{
    if ($mimeType !== 'image/jpeg' || !function_exists('exif_read_data')) {
        return 1;
    }

    $exif = @exif_read_data($inputPath);
    $orientation = isset($exif['Orientation']) ? (int)$exif['Orientation'] : 1;

    return ($orientation >= 1 && $orientation <= 8) ? $orientation : 1;
}

/**
 * Rotates/flips a GD image per its EXIF Orientation tag (values 2-8; 1 is
 * already correct and never reaches here). imagerotate() rotates
 * counter-clockwise for a positive angle, so "-90" below means 90° clockwise.
 * This mapping is the standard EXIF-orientation correction table.
 */
function applyExifOrientation($image, $orientation)
{
    switch ($orientation) {
        case 2:
            imageflip($image, IMG_FLIP_HORIZONTAL);
            return $image;
        case 3:
            $rotated = imagerotate($image, 180, 0);
            break;
        case 4:
            imageflip($image, IMG_FLIP_VERTICAL);
            return $image;
        case 5:
            imageflip($image, IMG_FLIP_VERTICAL);
            $rotated = imagerotate($image, -90, 0);
            break;
        case 6:
            $rotated = imagerotate($image, -90, 0);
            break;
        case 7:
            imageflip($image, IMG_FLIP_HORIZONTAL);
            $rotated = imagerotate($image, -90, 0);
            break;
        case 8:
            $rotated = imagerotate($image, 90, 0);
            break;
        default:
            return $image;
    }

    if ($rotated === false) {
        return $image;
    }

    imagedestroy($image);
    return $rotated;
}
