<?php
/**
 * Questions built in Services Management (service_fields) and the answers to
 * them: the whole form of a custom service (submit_service_request.php), and
 * the extra questions at the end of a built-in form (pb2_extra_*).
 *
 * Answers are always checked against the question's own definition on the
 * server: required, a choice from the list, a real date / time / number, a
 * length limit, an image or PDF up to 10 MB judged by its content. Typed
 * answers are stored in ALL CAPS; picked choices already are.
 *
 * Each request stores its own copy of the questions with the answers:
 *   [{ name, label, type, step, value }]   (a file's value is its saved path)
 * so editing or removing a question later never changes an old request.
 */

require_once __DIR__ . '/text_case.php';

const PB2_SF_FILE_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];
const PB2_SF_MAX_FILE = 10 * 1024 * 1024;

/** Whether a question is asked for this request mode ('Self' / 'Others'). */
function pb2_sf_visible(string $target, string $mode): bool
{
    if ($target === 'all' || $target === '') return true;
    if (in_array($target, ['myself_only', 'myself'], true)) return $mode === 'Self';
    if (in_array($target, ['someone_else_only', 'third_party'], true)) return $mode === 'Others';
    return true;
}

/**
 * Saves one uploaded file from $_FILES[$key] into $dir as $basename.<ext>.
 * Returns [path|null, error|null]; null path with no error = nothing sent.
 */
function pb2_sf_save_upload(string $key, string $dir, string $basename, string $label): array
{
    $file = $_FILES[$key] ?? null;
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return [null, null];
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > PB2_SF_MAX_FILE) {
        return [null, "$label could not be uploaded. Files must be 10MB or smaller."];
    }
    // Type from the file's content, never its name: this folder is web-served.
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
    if ($finfo) finfo_close($finfo);
    if (!$mime || !isset(PB2_SF_FILE_TYPES[$mime])) return [null, "$label must be a JPEG, PNG, WebP image, or a PDF."];
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) return [null, 'Unable to prepare the upload folder. Please try again.'];
    $dest = rtrim($dir, '/') . '/' . $basename . '.' . PB2_SF_FILE_TYPES[$mime];
    if (!move_uploaded_file($file['tmp_name'], $dest)) return [null, "Unable to save $label. Please try again."];
    return [$dest, null];
}

/**
 * Checks the answers to $fields and saves their files.
 *   $answers     field_name => value | [values]   (non-file answers)
 *   $filePrefix  $_FILES key prefix for file questions ('dyn_' / 'extra_')
 * Returns ['ok' => true, 'data' => [...snapshot], 'files' => [path => true]]
 *      or ['ok' => false, 'message' => ..., 'files' => [...]] (files saved so far,
 *         for the caller to remove).
 */
function pb2_sf_collect(array $fields, array $answers, string $mode, string $uploadDir, string $filePrefix): array
{
    $data = [];
    $files = [];
    $fail = function ($msg) use (&$files) { return ['ok' => false, 'message' => $msg, 'files' => $files]; };
    foreach ($fields as $f) {
        if (!pb2_sf_visible((string)$f['show_for_target'], $mode)) continue;
        $name = (string)$f['field_name'];
        $label = (string)$f['field_label'];
        $type = (string)$f['field_type'];
        $required = (int)$f['is_required'] === 1;
        $options = json_decode((string)$f['field_options'], true);
        if (!is_array($options)) $options = [];

        if ($type === 'file') {
            [$path, $err] = pb2_sf_save_upload($filePrefix . $name, $uploadDir, 'field_' . preg_replace('/[^a-z0-9_]/', '', $name), $label);
            if ($err) return $fail($err);
            if ($required && !$path) return $fail("Please upload: $label.");
            if ($path) $files[$path] = true;
            $data[] = ['name' => $name, 'label' => $label, 'type' => $type, 'step' => $f['step_section'] ?? null, 'value' => $path ?: ''];
            continue;
        }

        $raw = $answers[$name] ?? '';
        if ($type === 'checkbox') {
            $values = is_array($raw) ? $raw : ($raw === '' ? [] : [$raw]);
            $values = array_values(array_filter(array_map(function ($v) { return trim((string)$v); }, $values), 'strlen'));
            if ($options) $values = array_values(array_intersect($values, $options));
            if ($required && !$values) return $fail("Please complete: $label.");
            $value = implode(', ', $values);
        } else {
            $value = trim(is_array($raw) ? implode(', ', $raw) : (string)$raw);
            if ($required && $value === '') return $fail("Please complete: $label.");
            if ($value !== '') {
                if (in_array($type, ['select', 'radio'], true) && $options && !in_array($value, $options, true)) return $fail("Please choose a valid option for: $label.");
                if ($type === 'number' && !is_numeric($value)) return $fail("$label must be a number.");
                if ($type === 'date') {
                    $d = DateTime::createFromFormat('Y-m-d', $value);
                    if (!$d || $d->format('Y-m-d') !== $value) return $fail("$label must be a valid date.");
                }
                if ($type === 'time' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value)) return $fail("$label must be a valid time.");
                if (mb_strlen($value) > ($type === 'textarea' ? 5000 : 500)) return $fail("$label is too long.");
            }
            if (in_array($type, ['text', 'textarea'], true)) $value = pb2_caps($value);
        }
        $data[] = ['name' => $name, 'label' => $label, 'type' => $type, 'step' => $f['step_section'] ?? null, 'value' => $value];
    }
    return ['ok' => true, 'data' => $data, 'files' => $files];
}

/** Removes files saved by a request that then failed, and their folder once empty. */
function pb2_sf_discard(array $files): void
{
    foreach (array_keys($files) as $p) {
        @unlink($p);
        @rmdir(dirname($p));
    }
}

// ---- Extra questions on a built-in form -----------------------------------------

/** The extra questions of a built-in service, in order ([] when none or no migration 031). */
function pb2_extra_fields(mysqli $conn, string $key): array
{
    try {
        $st = $conn->prepare("SELECT field_id, field_name, field_label, field_type, field_options, help_text, is_required, show_for_target, step_section, sort_order
                              FROM service_fields WHERE builtin_key = ? ORDER BY sort_order ASC, field_id ASC");
        $st->bind_param('s', $key);
        $st->execute();
        return $st->get_result()->fetch_all(MYSQLI_ASSOC);
    } catch (Throwable $e) {
        return [];
    }
}

/**
 * Checks the extra answers sent with a built-in request (POST extra_answers =
 * JSON, files extra_<field_name>) and saves their files. Call it before the
 * request is saved; on ['ok' => false] refuse the request with 'message'.
 * Files go to uploads/Extra_Answers/<control no.>/<tracking code>/.
 */
function pb2_extra_prepare(mysqli $conn, string $key, string $mode, string $controlNum, string $trackingCode): array
{
    $fields = pb2_extra_fields($conn, $key);
    if (!$fields) return ['ok' => true, 'json' => null, 'files' => []];
    $answers = json_decode((string)($_POST['extra_answers'] ?? '{}'), true);
    if (!is_array($answers)) $answers = [];
    $safe = function ($s) { return preg_match('/^[A-Za-z0-9-]+$/', (string)$s) ? (string)$s : 'UNASSIGNED'; };
    $dir = 'uploads/Extra_Answers/' . $safe($controlNum) . '/' . $safe($trackingCode) . '/';
    $r = pb2_sf_collect($fields, $answers, $mode === 'Others' ? 'Others' : 'Self', $dir, 'extra_');
    if (!$r['ok']) {
        pb2_sf_discard($r['files']);
        return ['ok' => false, 'message' => $r['message'], 'files' => []];
    }
    return ['ok' => true, 'json' => $r['data'] ? json_encode($r['data'], JSON_UNESCAPED_UNICODE) : null, 'files' => $r['files']];
}

/** Stores prepared extra answers on the saved request. Never throws. */
function pb2_extra_store(mysqli $conn, string $table, string $idCol, int $id, array $extra): void
{
    if (empty($extra['json']) || $id <= 0) return;
    if (!preg_match('/^[a-z_]+$/', $table) || !preg_match('/^[a-z_]+$/', $idCol)) return;
    try {
        $st = $conn->prepare("UPDATE `$table` SET extra_answers = ? WHERE `$idCol` = ?");
        $st->bind_param('si', $extra['json'], $id);
        $st->execute();
    } catch (Throwable $e) {
        error_log("pb2_extra_store $table#$id: " . $e->getMessage());
    }
}
