<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');

require_once __DIR__ . '/../db_connection.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// --- Rate limiting: unauthenticated (pre-registration) and now real cost per call ---
$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if ($conn) {
    $stmt = mysqli_prepare($conn, "SELECT COUNT(*) AS attempts FROM ocr_scan_attempts WHERE ip_address = ? AND created_at > (NOW() - INTERVAL 10 MINUTE)");
    mysqli_stmt_bind_param($stmt, "s", $clientIp);
    mysqli_stmt_execute($stmt);
    $rateResult = mysqli_stmt_get_result($stmt);
    $rateRow = $rateResult ? mysqli_fetch_assoc($rateResult) : ['attempts' => 0];
    mysqli_stmt_close($stmt);

    if ((int)$rateRow['attempts'] >= 8) {
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'Too many scan attempts. Please wait a few minutes or fill in the form manually.', 'code' => 'RATE_LIMITED']);
        exit;
    }

    $logStmt = mysqli_prepare($conn, "INSERT INTO ocr_scan_attempts (ip_address) VALUES (?)");
    mysqli_stmt_bind_param($logStmt, "s", $clientIp);
    mysqli_stmt_execute($logStmt);
    mysqli_stmt_close($logStmt);
}

// --- OCR availability: fail cleanly and honestly rather than crash mid-request ---
if (!defined('GOOGLE_VISION_API_KEY') || GOOGLE_VISION_API_KEY === '' || !function_exists('curl_init') || !function_exists('imagecreatefromjpeg')) {
    http_response_code(200);
    echo json_encode(['success' => false, 'error' => 'ID scanning is temporarily unavailable.', 'code' => 'OCR_UNAVAILABLE']);
    exit;
}

if (!isset($_FILES['id_image'])) {
    http_response_code(400);
    echo json_encode(['error' => 'No image file provided']);
    exit;
}

$file = $_FILES['id_image'];
$validTypes = ['image/jpeg', 'image/png', 'image/webp'];
$maxSize = 10 * 1024 * 1024;

if (!in_array($file['type'], $validTypes)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid image type. Only JPEG, PNG, and WebP allowed']);
    exit;
}

if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode(['error' => 'Image file is too large']);
    exit;
}

if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'File upload error: ' . $file['error']]);
    exit;
}

// Verify actual file content, not just the client-supplied MIME header
// (which is spoofable) — same defense-in-depth this project already uses
// in register.php's validateAndGetExtension().
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$realMime = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
if ($finfo) finfo_close($finfo);

if (!$realMime || !in_array($realMime, $validTypes, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid image type. Only JPEG, PNG, and WebP allowed']);
    exit;
}

$tempDir = sys_get_temp_dir();
$uploadedFile = $file['tmp_name'];
$filename = 'id_' . time() . '_' . uniqid();
$processedImage = $tempDir . DIRECTORY_SEPARATOR . $filename . '.jpg';

class OcrUnavailableException extends Exception {}

try {
    // 1. Check image quality
    $imageSize = @getimagesize($uploadedFile);
    if (!$imageSize) {
        throw new Exception('Invalid image format');
    }

    list($width, $height) = $imageSize;

    // A phone photo's raw stored pixels are frequently portrait-shaped even
    // when the photo displays as landscape (or vice versa) — the EXIF
    // Orientation tag is what makes viewers show it correctly. Judging
    // aspect ratio on the raw dimensions would reject a perfectly good
    // sideways-stored ID photo before preprocessImageGD() ever gets a
    // chance to correct its orientation. Swap width/height here to match
    // what the photo will actually look like once corrected.
    $exifOrientation = detectExifOrientation($uploadedFile, $realMime);
    if (in_array($exifOrientation, [5, 6, 7, 8], true)) {
        [$width, $height] = [$height, $width];
    }

    $aspectRatio = $width / $height;

    if ($aspectRatio < 1.2 || $aspectRatio > 1.9) {
        throw new Exception('Invalid ID card aspect ratio. Please ensure the full card is visible without strong cropping');
    }

    // 2. Reserve monthly Vision quota now that the upload has passed validation —
    // rejected uploads should never spend budget.
    if (!tryReserveVisionQuota($conn)) {
        throw new OcrUnavailableException();
    }

    // 3. Resize/re-encode via GD — no exec()/proc_open(), works on shared
    // hosting. Deliberately no contrast/deskew correction here: Google
    // Vision's ML model is robust to moderate lighting/skew on its own,
    // which is the whole point of using it over a local classic OCR engine.
    $processedPath = preprocessImageGD($uploadedFile, $realMime, $processedImage);
    if (!$processedPath) {
        throw new Exception('Failed to preprocess image');
    }

    // 4. Call Google Vision, return the flattened text lines — field
    // extraction happens client-side in src/lib/idOcrExtraction.js, which
    // is engine-agnostic and already hardened against real Philippine IDs.
    $lines = callGoogleVisionOcr($processedPath);

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'data' => ['lines' => $lines]
    ]);

} catch (OcrUnavailableException $e) {
    http_response_code(200);
    echo json_encode(['success' => false, 'error' => 'ID scanning is temporarily unavailable.', 'code' => 'OCR_UNAVAILABLE']);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'error' => $e->getMessage(),
        'success' => false
    ]);
} finally {
    @unlink($uploadedFile);
    @unlink($processedImage);
}

/**
 * Atomically reserves one unit of this month's Vision API quota. Fails
 * closed if the DB is unreachable — unlike the IP rate limiter above (which
 * fails open, since it only protects server CPU), this gate exists
 * specifically to bound real Google Cloud cost, so "can't verify the cap"
 * must mean "don't spend," not "allow uncounted."
 */
function tryReserveVisionQuota($conn)
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

    if ($count >= OCR_MONTHLY_CAP) {
        mysqli_rollback($conn);
        return false;
    }

    $update = mysqli_prepare($conn, "UPDATE ocr_vision_usage SET call_count = call_count + 1 WHERE usage_month = ?");
    mysqli_stmt_bind_param($update, "s", $month);
    mysqli_stmt_execute($update);
    mysqli_stmt_close($update);

    mysqli_commit($conn);
    return true;
}

/**
 * Resize (shrink-only, max 1600px) and re-encode to JPEG via GD. Also
 * corrects EXIF sideways/upside-down orientation and applies a mild sharpen
 * pass — both real, common failure modes for phone-captured ID photos.
 * Deliberately no contrast or perspective/deskew correction: Google Vision's
 * ML model is robust to moderate lighting and in-frame skew on its own,
 * which is the whole point of using it over a local classic OCR engine.
 */
function preprocessImageGD($inputPath, $mimeType, $outputPath)
{
    $loaders = [
        'image/jpeg' => 'imagecreatefromjpeg',
        'image/png' => 'imagecreatefrompng',
        'image/webp' => 'imagecreatefromwebp',
    ];

    if (!isset($loaders[$mimeType]) || !function_exists($loaders[$mimeType])) {
        return false;
    }

    $src = @call_user_func($loaders[$mimeType], $inputPath);
    if (!$src) {
        return false;
    }

    // Phone cameras commonly store the sensor's native (often sideways or
    // upside-down) pixel data plus an EXIF Orientation tag telling viewers
    // how to rotate it for display. GD ignores that tag entirely, so an
    // uncorrected image sent to Vision can genuinely be rotated 90/180/270°
    // even though every photo-picker preview the citizen saw looked upright.
    // Only JPEG carries EXIF; correcting this before OCR is far more
    // reliable than hoping Vision's model reads text sideways.
    $orientation = detectExifOrientation($inputPath, $mimeType);
    if ($orientation > 1 && function_exists('imagerotate') && function_exists('imageflip')) {
        $src = applyExifOrientation($src, $orientation);
    }

    $width = imagesx($src);
    $height = imagesy($src);
    $maxDim = 1600;

    if (max($width, $height) > $maxDim) {
        $scale = $maxDim / max($width, $height);
        $newWidth = (int)round($width * $scale);
        $newHeight = (int)round($height * $scale);

        $resized = imagecreatetruecolor($newWidth, $newHeight);
        $white = imagecolorallocate($resized, 255, 255, 255);
        imagefilledrectangle($resized, 0, 0, $newWidth, $newHeight, $white);
        imagecopyresampled($resized, $src, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
        imagedestroy($src);
        $src = $resized;
    }

    // Mild unsharp-mask pass, applied at final resolution (after resampling,
    // which itself softens edges slightly). Helps genuinely soft/blurred
    // photos without the halo artifacts a stronger kernel would introduce on
    // already-sharp ones. Purely additive — never fatal if GD lacks
    // imageconvolution() on a given host.
    applyMildSharpen($src);

    $ok = imagejpeg($src, $outputPath, 85);
    imagedestroy($src);

    return $ok ? $outputPath : false;
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

/**
 * Gentle sharpen via a Laplacian-style convolution kernel (cross-shaped,
 * center weight 5) — deliberately weaker than the common 8-neighbor/weight-16
 * "sharpen" kernel, to nudge genuinely soft photos into focus without adding
 * visible haloing/noise on photos that were already sharp. Mutates $image in
 * place; no-op if this GD build lacks imageconvolution().
 */
function applyMildSharpen(&$image)
{
    if (!function_exists('imageconvolution')) {
        return;
    }

    $sharpenMatrix = [
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0],
    ];

    @imageconvolution($image, $sharpenMatrix, 1, 0);
}

/**
 * Sends the image to Google Cloud Vision's DOCUMENT_TEXT_DETECTION feature
 * over plain HTTPS (API-key auth, no SDK/service-account needed — works
 * from any host that can make outbound cURL requests, including shared
 * hosting). Returns the flattened [{text, confidence}, ...] line array.
 */
function callGoogleVisionOcr($imagePath)
{
    $imageData = @file_get_contents($imagePath);
    if ($imageData === false) {
        throw new Exception('Failed to read processed image for OCR');
    }

    $payload = json_encode([
        'requests' => [[
            'image' => ['content' => base64_encode($imageData)],
            'features' => [['type' => 'DOCUMENT_TEXT_DETECTION']],
        ]],
    ]);

    $url = 'https://vision.googleapis.com/v1/images:annotate?key=' . urlencode(GOOGLE_VISION_API_KEY);

    $ch = curl_init($url);
    if ($ch === false) {
        throw new Exception('Could not initialize OCR request');
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        throw new Exception('OCR service request failed: ' . $curlError);
    }

    $data = json_decode($response, true);
    if ($httpCode !== 200 || !is_array($data)) {
        throw new Exception('OCR service returned an unexpected response');
    }

    if (isset($data['responses'][0]['error'])) {
        throw new Exception('OCR service error: ' . ($data['responses'][0]['error']['message'] ?? 'unknown error'));
    }

    $annotation = $data['responses'][0]['fullTextAnnotation'] ?? null;
    if (!$annotation || empty($annotation['pages'])) {
        return []; // No readable text found — the frontend's extractIdFields() already handles this cleanly
    }

    return flattenVisionAnnotationToLines($annotation);
}

/**
 * Converts Google Vision's block/paragraph/word/symbol structure into a flat
 * [{text, confidence}, ...] array — the exact shape
 * src/lib/idOcrExtraction.js's extractIdFields() consumes, regardless of
 * which OCR engine produced it.
 *
 * Word text is rebuilt symbol-by-symbol using each symbol's
 * property.detectedBreak.type (SPACE / SURE_SPACE / EOL_SURE_SPACE /
 * LINE_BREAK / HYPHEN) — Google's own documented method for reconstructing
 * readable text. Naively concatenating symbols with no regard for breaks
 * glues adjacent words together with no space between them.
 */
function flattenVisionAnnotationToLines($annotation)
{
    $paragraphs = [];

    foreach ($annotation['pages'] as $page) {
        foreach (($page['blocks'] ?? []) as $block) {
            foreach (($block['paragraphs'] ?? []) as $paragraph) {
                $textParts = [];
                $confidences = [];

                foreach (($paragraph['words'] ?? []) as $word) {
                    $wordText = '';
                    foreach (($word['symbols'] ?? []) as $symbol) {
                        $wordText .= $symbol['text'] ?? '';

                        $breakType = $symbol['property']['detectedBreak']['type'] ?? null;
                        if (in_array($breakType, ['SPACE', 'SURE_SPACE'], true)) {
                            $wordText .= ' ';
                        } elseif (in_array($breakType, ['EOL_SURE_SPACE', 'LINE_BREAK'], true)) {
                            $wordText .= "\n";
                        }
                    }

                    if ($wordText === '') continue;

                    $textParts[] = $wordText;
                    if (isset($word['confidence'])) {
                        $confidences[] = (float)$word['confidence'];
                    }
                }

                if (empty($textParts)) continue;

                // Word text already carries its own trailing space/newline
                // from detectedBreak, so join with nothing extra.
                $text = trim(implode('', $textParts));
                if ($text === '') continue;

                $confidence = isset($paragraph['confidence'])
                    ? (float)$paragraph['confidence']
                    : (count($confidences) ? array_sum($confidences) / count($confidences) : 0);

                $top = (int)($paragraph['boundingBox']['vertices'][0]['y'] ?? 0);

                $paragraphs[] = ['text' => $text, 'confidence' => round($confidence * 100, 1), 'top' => $top];
            }
        }
    }

    usort($paragraphs, function ($a, $b) {
        return $a['top'] <=> $b['top'];
    });

    // A paragraph's rebuilt text can contain internal line breaks (from
    // EOL_SURE_SPACE/LINE_BREAK) — split those into separate lines so the
    // label-anchored extraction on the client sees one field label/value
    // per line, matching what it expects.
    $lines = [];
    foreach ($paragraphs as $p) {
        foreach (explode("\n", $p['text']) as $lineText) {
            $lineText = trim($lineText);
            if ($lineText === '') continue;
            $lines[] = ['text' => $lineText, 'confidence' => $p['confidence']];
        }
    }

    return $lines;
}
?>
