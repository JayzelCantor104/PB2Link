<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');

require_once __DIR__ . '/../db_connection.php';
// tryReserveVisionQuota(), detectExifOrientation(), applyExifOrientation()
require_once __DIR__ . '/vision_common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// --- Rate limiting: unauthenticated (pre-registration) and now real cost per call ---
// 20 scans per 10 minutes from one connection. The automatic second look the
// page takes at a poor read (enhance=1, scanIdWithRetry in backendOcr.js) is
// part of the same try, so it doesn't use up one of the 20: it is counted
// apart (the address with "#retry"), with its own limit of 20, so sending
// every scan as a "second look" can't get around the limit.
const PB2_OCR_SCAN_LIMIT = 20;
$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$isAutoRetry = ($_POST['enhance'] ?? '') === '1';
$countKey = $isAutoRetry ? substr($clientIp, 0, 37) . '#retry' : $clientIp;
if ($conn) {
    $stmt = mysqli_prepare($conn, "SELECT COUNT(*) AS attempts FROM ocr_scan_attempts WHERE ip_address = ? AND created_at > (NOW() - INTERVAL 10 MINUTE)");
    mysqli_stmt_bind_param($stmt, "s", $countKey);
    mysqli_stmt_execute($stmt);
    $rateResult = mysqli_stmt_get_result($stmt);
    $rateRow = $rateResult ? mysqli_fetch_assoc($rateResult) : ['attempts' => 0];
    mysqli_stmt_close($stmt);

    if ((int)$rateRow['attempts'] >= PB2_OCR_SCAN_LIMIT) {
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'You have used all 20 scans for now.', 'code' => 'RATE_LIMITED']);
        exit;
    }

    $logStmt = mysqli_prepare($conn, "INSERT INTO ocr_scan_attempts (ip_address) VALUES (?)");
    mysqli_stmt_bind_param($logStmt, "s", $countKey);
    mysqli_stmt_execute($logStmt);
    mysqli_stmt_close($logStmt);
}

// A photo this endpoint can't use, with a reason the resident can act on
// (code BAD_PHOTO: the page shows it as is, instead of "scanner unavailable").
function pb2_ocr_bad_photo(string $message): void
{
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $message, 'code' => 'BAD_PHOTO']);
    exit;
}

// --- OCR availability: fail cleanly and honestly rather than crash mid-request ---
if (!defined('GOOGLE_VISION_API_KEY') || GOOGLE_VISION_API_KEY === '' || !function_exists('curl_init') || !function_exists('imagecreatefromjpeg')) {
    http_response_code(200);
    echo json_encode(['success' => false, 'error' => 'ID scanning is temporarily unavailable.', 'code' => 'OCR_UNAVAILABLE']);
    exit;
}

if (!isset($_FILES['id_image'])) {
    pb2_ocr_bad_photo('No photo was received. Please choose the photo of your ID again.');
}

$file = $_FILES['id_image'];
$validTypes = ['image/jpeg', 'image/png', 'image/webp'];
$maxSize = 10 * 1024 * 1024;

if ($file['error'] !== UPLOAD_ERR_OK) {
    pb2_ocr_bad_photo('The photo could not be uploaded. Please try again.');
}

if (!in_array($file['type'], $validTypes)) {
    pb2_ocr_bad_photo('Please use a JPG, PNG or WebP photo of your ID.');
}

if ($file['size'] > $maxSize) {
    pb2_ocr_bad_photo('The photo is too large (over 10 MB). Please use a smaller photo.');
}

// Verify actual file content, not just the client-supplied MIME header
// (which is spoofable) — same defense-in-depth this project already uses
// in register.php's validateAndGetExtension().
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$realMime = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
if ($finfo) finfo_close($finfo);

if (!$realMime || !in_array($realMime, $validTypes, true)) {
    pb2_ocr_bad_photo('Please use a JPG, PNG or WebP photo of your ID.');
}

$tempDir = sys_get_temp_dir();
$uploadedFile = $file['tmp_name'];
$filename = 'id_' . time() . '_' . uniqid();
$processedImage = $tempDir . DIRECTORY_SEPARATOR . $filename . '.jpg';

class OcrUnavailableException extends Exception {}
// A photo that can't be read as an ID (shape, format): told to the resident.
class OcrBadPhotoException extends Exception {}

try {
    // 1. Check image quality
    $imageSize = @getimagesize($uploadedFile);
    if (!$imageSize) {
        throw new OcrBadPhotoException('This photo could not be opened. Please take or choose it again.');
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
        throw new OcrBadPhotoException('This photo isn\'t shaped like an ID card. Take it so the card fills the photo, lying flat and sideways, with only a little space around it.');
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
    // enhance=1: the browser's one automatic retry after a poor first read
    // (src/lib/backendOcr.js scanIdWithRetry) — washes out a light
    // background/watermark for any ID type, not just TIN.
    $processedPath = preprocessImageGD($uploadedFile, $realMime, $processedImage,
        strtolower((string)($_POST['id_type'] ?? '')), ($_POST['enhance'] ?? '') === '1');
    if (!$processedPath) {
        throw new Exception('Failed to preprocess image');
    }

    // 4. Call Google Vision, return the flattened text lines — field
    // extraction happens client-side in src/lib/idOcrExtraction.js, which
    // is engine-agnostic and already hardened against real Philippine IDs.
    $lines = callGoogleVisionOcr($processedPath);

    // 5. Remember what was read, tied to this exact photo (SHA-256 of the
    // original upload), under a one-time token. When the resident later
    // submits a PhilSys number with this photo, the server re-checks the
    // number and name against this record (philsys_scan_common.php) rather
    // than trusting the browser's extraction. Best-effort: a storage failure
    // just means no token, and the number is treated as manually entered.
    $scanToken = null;
    try {
        $scanToken = bin2hex(random_bytes(16));
        $imageHash = hash_file('sha256', $uploadedFile);
        $ocrText = implode("\n", array_map(function ($l) { return (string)($l['text'] ?? ''); }, $lines));
        $idTypeSlug = substr(preg_replace('/[^a-z_]/', '', strtolower((string)($_POST['id_type'] ?? ''))), 0, 40);
        $now = date('Y-m-d H:i:s');
        $save = mysqli_prepare($conn, "INSERT INTO ocr_scan_results (scan_token, image_sha256, id_type, ocr_text, created_at) VALUES (?, ?, ?, ?, ?)");
        mysqli_stmt_bind_param($save, "sssss", $scanToken, $imageHash, $idTypeSlug, $ocrText, $now);
        if (!mysqli_stmt_execute($save)) $scanToken = null;
        // Scans hold personal data — keep them no longer than a day.
        mysqli_query($conn, "DELETE FROM ocr_scan_results WHERE created_at < (NOW() - INTERVAL 1 DAY)");
    } catch (Throwable $storeErr) {
        error_log('ocr_id.php: could not store scan result: ' . $storeErr->getMessage());
        $scanToken = null;
    }

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'data' => ['lines' => $lines, 'scan_token' => $scanToken]
    ]);

} catch (OcrBadPhotoException $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage(), 'code' => 'BAD_PHOTO']);
} catch (OcrUnavailableException $e) {
    http_response_code(200);
    echo json_encode(['success' => false, 'error' => 'ID scanning is temporarily unavailable.', 'code' => 'OCR_UNAVAILABLE']);
} catch (Exception $e) {
    // A Vision or server error: the scanner, not the photo. The details stay
    // in the server log.
    error_log('ocr_id.php: ' . $e->getMessage());
    http_response_code(200);
    echo json_encode(['success' => false, 'error' => 'ID scanning is temporarily unavailable.', 'code' => 'OCR_UNAVAILABLE']);
} finally {
    @unlink($uploadedFile);
    @unlink($processedImage);
}

/**
 * Resize (shrink-only, max 2048px) and re-encode to JPEG via GD. Also
 * corrects EXIF sideways/upside-down orientation and applies a mild sharpen
 * pass — both real, common failure modes for phone-captured ID photos.
 * Deliberately no contrast or perspective/deskew correction: Google Vision's
 * ML model is robust to moderate lighting and in-frame skew on its own,
 * which is the whole point of using it over a local classic OCR engine.
 */
function preprocessImageGD($inputPath, $mimeType, $outputPath, $idType = '', $enhance = false)
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
    // Raised from 1600 — that cap was chosen to keep upload size/processing
    // time down, not based on accuracy testing. A modern phone photo is
    // often 3000px+, so downsizing to 1600 can throw away fine detail that
    // matters for small print. Google Vision's pricing is flat per request
    // regardless of image size, so a higher cap costs nothing extra per
    // scan — only a slightly larger upload and marginally slower request.
    $maxDim = 2048;

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
    } elseif (max($width, $height) < 1200 && max($width, $height) >= 200) {
        // Small photos (a screenshot, a saved web image) are enlarged to 1600px
        // on the long side: Vision wants roughly 1024px+ for small print, and
        // on a ~370px Postal ID it misread the tiny digits (585 -> 985,
        // 1742 -> 3742, '88 -> '68). Enlarging adds no detail, but gives the
        // recognizer letters several times taller. Still one request, same cost.
        $scale = 1600 / max($width, $height);
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

    // TIN IDs print dark text over a dense, tiled light-green "BUREAU OF
    // INTERNAL REVENUE" watermark. Sent as-is, Vision reads the watermark as
    // the document and drops the real fields entirely (confirmed on a real
    // card: 138 lines of watermark fragments, no name/TIN/address/birth
    // date). Washing everything lighter than the printed text to white fixes
    // it — see suppressLightWatermark(). Other ID types get it only on the
    // retry ($enhance): some print light text on dark areas (e.g. PRC ID
    // headers) that this would wash out, so it's never forced on a scan
    // that already read well.
    if ($idType === 'tin' || $enhance) {
        suppressLightWatermark($src);
    }

    $ok = imagejpeg($src, $outputPath, 85);
    imagedestroy($src);

    return $ok ? $outputPath : false;
}

/**
 * Removes a light background watermark behind dark printed text: grayscale,
 * then a "levels" cut — pixels darker than `lo` go black, lighter than `hi`
 * go white, linear in between. Mutates $image in place.
 *
 * The cut points adapt to each photo: `hi` is 74% of the median luminance
 * (the card's background, which dominates the frame), `lo` 50 levels below.
 * Measured on a real TIN ID photo: printed text 37-84, the watermark's
 * darkest 5% at 146, background median 190 -> cut 91-141, which leaves every
 * field crisp and the watermark gone. A darker photo gets proportionally
 * lower cut points, so it isn't washed out.
 */
function suppressLightWatermark(&$image)
{
    if (!function_exists('imagefilter') || !imagefilter($image, IMG_FILTER_GRAYSCALE)) {
        return;
    }
    $w = imagesx($image);
    $h = imagesy($image);

    $samples = [];
    for ($y = 0; $y < $h; $y += 4) {
        for ($x = 0; $x < $w; $x += 4) {
            $samples[] = imagecolorat($image, $x, $y) & 0xFF;
        }
    }
    if (!$samples) return;
    sort($samples);
    $background = $samples[(int)(count($samples) / 2)];

    $hi = (int)round($background * 0.74);
    $lo = max(0, $hi - 50);
    if ($hi <= $lo) return;

    $lut = [];
    for ($i = 0; $i < 256; $i++) {
        $o = $i <= $lo ? 0 : ($i >= $hi ? 255 : (int)round(($i - $lo) * 255 / ($hi - $lo)));
        $lut[$i] = ($o << 16) | ($o << 8) | $o;
    }
    for ($y = 0; $y < $h; $y++) {
        for ($x = 0; $x < $w; $x++) {
            imagesetpixel($image, $x, $y, $lut[imagecolorat($image, $x, $y) & 0xFF]);
        }
    }
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

    // Only the parts flattenVisionAnnotationToLines() reads. Without this,
    // Vision also sends every word a second time (textAnnotations) and a box
    // and confidence for every letter: on a real ID the answer was over
    // 430 KB, and over a slow connection its download ran past the time limit
    // ("Operation timed out ... 434315 bytes received"), which residents saw
    // as "ID scanning isn't available".
    $fields = 'responses(error,fullTextAnnotation/pages/blocks/paragraphs(boundingBox,confidence,'
        . 'words(boundingBox,confidence,symbols(text,property/detectedBreak))))';
    $url = 'https://vision.googleapis.com/v1/images:annotate?key=' . urlencode(GOOGLE_VISION_API_KEY)
        . '&fields=' . rawurlencode($fields);

    $ch = curl_init($url);
    if ($ch === false) {
        throw new Exception('Could not initialize OCR request');
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        // 45 s: a 2048px photo up and the answer down can take a while on a
        // slow connection (15 s ran out mid-download).
        CURLOPT_TIMEOUT => 45,
        CURLOPT_CONNECTTIMEOUT => 15,
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
 * [{text, confidence, x, y, w, h}, ...] array (x/y/w/h: the line's box on the
 * photo, used by layout-aware ID profiles) — the exact shape
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
                $confidences = [];
                // A paragraph's text can hold several printed lines (from
                // EOL_SURE_SPACE/LINE_BREAK). Each is kept as its own line,
                // with its own box on the card: the client reads some IDs by
                // layout ("the value is right below its caption"), which the
                // order alone can't tell (the National ID prints the PhilSys
                // number on the same row as the "LAST NAME" caption).
                $paraLines = [];
                $curText = '';
                $curBox = null;
                $closeLine = function () use (&$paraLines, &$curText, &$curBox) {
                    $t = trim($curText);
                    if ($t !== '') $paraLines[] = ['text' => $t, 'box' => $curBox];
                    $curText = '';
                    $curBox = null;
                };

                foreach (($paragraph['words'] ?? []) as $word) {
                    $wordText = '';
                    $endsLine = false;
                    foreach (($word['symbols'] ?? []) as $symbol) {
                        $wordText .= $symbol['text'] ?? '';

                        $breakType = $symbol['property']['detectedBreak']['type'] ?? null;
                        if (in_array($breakType, ['SPACE', 'SURE_SPACE'], true)) {
                            $wordText .= ' ';
                        } elseif (in_array($breakType, ['EOL_SURE_SPACE', 'LINE_BREAK'], true)) {
                            $endsLine = true;
                        }
                    }

                    if ($wordText === '') continue;

                    $curText .= $wordText;
                    foreach (($word['boundingBox']['vertices'] ?? []) as $v) {
                        $x = (int)($v['x'] ?? 0);
                        $y = (int)($v['y'] ?? 0);
                        if ($curBox === null) {
                            $curBox = [$x, $y, $x, $y];
                        } else {
                            $curBox = [min($curBox[0], $x), min($curBox[1], $y), max($curBox[2], $x), max($curBox[3], $y)];
                        }
                    }
                    if (isset($word['confidence'])) {
                        $confidences[] = (float)$word['confidence'];
                    }
                    if ($endsLine) $closeLine();
                }
                $closeLine();

                if (empty($paraLines)) continue;

                $confidence = isset($paragraph['confidence'])
                    ? (float)$paragraph['confidence']
                    : (count($confidences) ? array_sum($confidences) / count($confidences) : 0);

                $top = (int)($paragraph['boundingBox']['vertices'][0]['y'] ?? 0);

                $paragraphs[] = ['lines' => $paraLines, 'confidence' => round($confidence * 100, 1), 'top' => $top];
            }
        }
    }

    usort($paragraphs, function ($a, $b) {
        return $a['top'] <=> $b['top'];
    });

    // One entry per printed line, in the same order as before, now with its
    // box: x / y (top-left) and w / h, in pixels of the photo Vision read.
    $lines = [];
    foreach ($paragraphs as $p) {
        foreach ($p['lines'] as $line) {
            $entry = ['text' => $line['text'], 'confidence' => $p['confidence']];
            if ($line['box'] !== null) {
                [$x1, $y1, $x2, $y2] = $line['box'];
                $entry += ['x' => $x1, 'y' => $y1, 'w' => max(1, $x2 - $x1), 'h' => max(1, $y2 - $y1)];
            }
            $lines[] = $entry;
        }
    }

    return $lines;
}
?>
