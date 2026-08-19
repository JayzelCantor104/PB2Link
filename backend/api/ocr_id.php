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

$tempDir = sys_get_temp_dir();
$uploadedFile = $file['tmp_name'];
$filename = 'id_' . time() . '_' . uniqid();
$processedImage = $tempDir . DIRECTORY_SEPARATOR . $filename . '.png';
$outputJson = $tempDir . DIRECTORY_SEPARATOR . $filename . '.json';

try {
    // 1. Check image quality
    $imageSize = @getimagesize($uploadedFile);
    if (!$imageSize) {
        throw new Exception('Invalid image format');
    }

    list($width, $height) = $imageSize;
    $aspectRatio = $width / $height;

    if ($aspectRatio < 1.2 || $aspectRatio > 1.9) {
        throw new Exception('Invalid ID card aspect ratio. Please ensure the full card is visible without strong cropping');
    }

    // 2. Preprocess and enhance image
    $processedPath = preprocessImage($uploadedFile, $processedImage);
    if (!$processedPath) {
        throw new Exception('Failed to preprocess image');
    }

    // 3. Detect and straighten card
    $straightenedImage = straightenCard($processedPath, $tempDir, $filename);
    if (!$straightenedImage) {
        $straightenedImage = $processedPath;
    }

    // 4. Extract fields using OCR
    $idType = isset($_POST['id_type']) ? $_POST['id_type'] : 'national';
    $extracted = extractIdFields($straightenedImage, $idType, $tempDir, $filename);

    if (!$extracted) {
        throw new Exception('OCR extraction failed');
    }

    // Cleanup
    @unlink($straightenedImage);
    @unlink($processedImage);
    @unlink($uploadedFile);

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'data' => $extracted
    ]);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'error' => $e->getMessage(),
        'success' => false
    ]);
}

function preprocessImage($inputPath, $outputPath)
{
    $cmd = sprintf(
        'convert "%s" -quality 95 -colorspace sRGB -auto-level -enhance -sharpen 0x1 -strip "%s" 2>&1',
        escapeshellarg($inputPath),
        escapeshellarg($outputPath)
    );

    $output = [];
    $returnVar = 0;
    exec($cmd, $output, $returnVar);

    if ($returnVar !== 0 || !file_exists($outputPath)) {
        return false;
    }

    return $outputPath;
}

function straightenCard($imagePath, $tempDir, $filename)
{
    $straightenedPath = $tempDir . DIRECTORY_SEPARATOR . $filename . '_straight.png';

    $cmd = sprintf(
        'convert "%s" -virtual-pixel edge -distort Perspective "0,0 0,0 %%[fx:w-1],0 %%[fx:w-1],0 0,%%[fx:h-1] 0,%%[fx:h-1] %%[fx:w-1],%%[fx:h-1] %%[fx:w-1],%%[fx:h-1]" "%s" 2>&1',
        escapeshellarg($imagePath),
        escapeshellarg($straightenedPath)
    );

    $output = [];
    $returnVar = 0;
    exec($cmd, $output, $returnVar);

    if ($returnVar !== 0 || !file_exists($straightenedPath)) {
        return null;
    }

    return $straightenedPath;
}

function extractIdFields($imagePath, $idType, $tempDir, $filename)
{
    $fields = getPhilSysNationalIdRegions();
    $extracted = [
        'fields' => [],
        'confidence' => 0,
        'warnings' => []
    ];

    foreach ($fields as $fieldName => $region) {
        $cropPath = $tempDir . DIRECTORY_SEPARATOR . $filename . '_' . $fieldName . '.png';

        $cmd = sprintf(
            'convert "%s" -crop %dx%d+%d+%d +repage "%s" 2>&1',
            escapeshellarg($imagePath),
            $region['width'],
            $region['height'],
            $region['x'],
            $region['y'],
            escapeshellarg($cropPath)
        );

        $output = [];
        $returnVar = 0;
        exec($cmd, $output, $returnVar);

        if ($returnVar !== 0 || !file_exists($cropPath)) {
            $extracted['warnings'][] = "Could not crop region: $fieldName";
            continue;
        }

        // Run Tesseract OCR
        $textPath = $tempDir . DIRECTORY_SEPARATOR . $filename . '_' . $fieldName;
        $tesseractCmd = sprintf(
            'tesseract "%s" "%s" -l eng+fil --psm 7 --oem 1 -c tessedit_char_whitelist="%s" 2>&1',
            escapeshellarg($cropPath),
            escapeshellarg($textPath),
            getWhitelistForField($fieldName)
        );

        $ocrOutput = [];
        $ocrReturn = 0;
        exec($tesseractCmd, $ocrOutput, $ocrReturn);

        $textFile = $textPath . '.txt';
        if (file_exists($textFile)) {
            $rawText = trim(file_get_contents($textFile));
            $confidence = getConfidenceScore($rawText, $fieldName);
            $cleanedText = cleanFieldValue($rawText, $fieldName);

            $extracted['fields'][$fieldName] = [
                'value' => $cleanedText,
                'confidence' => $confidence,
                'raw' => $rawText
            ];

            @unlink($textFile);
        } else {
            $extracted['warnings'][] = "OCR failed for field: $fieldName";
        }

        @unlink($cropPath);
    }

    $extracted['confidence'] = array_reduce(
        $extracted['fields'],
        function ($carry, $item) {
            return $carry + $item['confidence'];
        },
        0
    ) / max(1, count($extracted['fields']));

    return $extracted;
}

function getPhilSysNationalIdRegions()
{
    return [
        'surName' => ['x' => 280, 'y' => 320, 'width' => 600, 'height' => 80],
        'firstName' => ['x' => 280, 'y' => 420, 'width' => 600, 'height' => 80],
        'middleName' => ['x' => 280, 'y' => 500, 'width' => 600, 'height' => 70],
        'sex' => ['x' => 730, 'y' => 580, 'width' => 120, 'height' => 60],
        'birthDate' => ['x' => 320, 'y' => 580, 'width' => 400, 'height' => 60],
        'address' => ['x' => 150, 'y' => 700, 'width' => 680, 'height' => 110]
    ];
}

function getWhitelistForField($fieldName)
{
    $whitelists = [
        'surName' => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz \'-.',
        'firstName' => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz \'-.',
        'middleName' => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz \'-.',
        'sex' => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        'birthDate' => '0123456789/-',
        'address' => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#.,/ -'
    ];

    return $whitelists[$fieldName] ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#.,/ -';
}

function cleanFieldValue($text, $fieldName)
{
    $text = preg_replace('/^(?:SURNAME|LAST\s*NAME|GIVEN\s*NAMES?|MIDDLE\s*NAME|APELYIDO|PANGALAN|GITNANG|BIRTH\s*DATE|DATE\s*OF\s*BIRTH|ADDRESS|TIRAHAN|SEX|SEKS)\s*[:\-]?/i', '', $text);
    $text = preg_replace('/(?:Mga\s*Pangalan|Given\s*Names|Middle\s*Name|Date\s*of\s*Birth|Last\s*Name)\s*[:\-]?/i', '', $text);
    $text = preg_replace('/\s+(?:PHILIPPINES|CITY|PROVINCE)\s*$/i', '', $text);
    $text = trim(preg_replace('/\s+/', ' ', $text));

    if ($fieldName === 'sex') {
        $upper = strtoupper($text);
        return (strpos($upper, 'MALE') !== false || strpos($upper, 'M') !== false) ? 'M' : (strpos($upper, 'FEMALE') !== false || strpos($upper, 'F') !== false ? 'F' : '');
    }

    if ($fieldName === 'birthDate') {
        return formatDate($text);
    }

    return $text;
}

function formatDate($text)
{
    $text = preg_replace('/[^0-9\/\-]/', '', $text);

    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $text, $m)) {
        return $text;
    }

    if (preg_match('/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/', $text, $m)) {
        return $m[3] . '-' . $m[2] . '-' . $m[1];
    }

    if (preg_match('/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/', $text, $m)) {
        return $m[1] . '-' . $m[2] . '-' . $m[3];
    }

    if (preg_match('/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/', $text, $m)) {
        $year = strlen($m[3]) === 2 ? '20' . $m[3] : $m[3];
        return $year . '-' . str_pad($m[2], 2, '0', STR_PAD_LEFT) . '-' . str_pad($m[1], 2, '0', STR_PAD_LEFT);
    }

    return '';
}

function getConfidenceScore($text, $fieldName)
{
    if (empty($text)) {
        return 0;
    }

    $score = 50;

    if (strlen($text) >= 2) {
        $score += 20;
    }

    if (strlen($text) > 60 && in_array($fieldName, ['surName', 'firstName', 'middleName'])) {
        $score -= 10;
    }

    if ($fieldName === 'sex' && preg_match('/^(M|F|MALE|FEMALE)$/i', trim($text))) {
        $score += 30;
    }

    if ($fieldName === 'birthDate' && preg_match('/^\d{4}-\d{2}-\d{2}$/', trim($text))) {
        $score += 30;
    }

    if (preg_match('/\d/', $text) && !in_array($fieldName, ['birthDate', 'sex'])) {
        $score -= 15;
    }

    return min(100, max(0, $score));
}
?>