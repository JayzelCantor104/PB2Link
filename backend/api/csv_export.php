<?php
/**
 * CSV downloads for admin pages (Audit Log, Address List).
 *
 *     require_once __DIR__ . '/csv_export.php';
 *     pb2_csv_send('pb2-streets', ['Name', 'Subdivision'], $rows);
 *
 * Every cell goes through pb2_csv_cell(): a value starting with = + - @ (or a
 * tab / carriage return) would run as a formula when the file is opened in a
 * spreadsheet, so it gets a leading apostrophe. The file starts with a UTF-8
 * BOM so Excel shows Ñ and other accents correctly. Callers check access and
 * write the audit log entry before sending.
 */

function pb2_csv_cell($value): string
{
    $v = (string)($value ?? '');
    return preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v;
}

/** Sends the file and stops. $rows: list of lists, in $header's order. */
function pb2_csv_send(string $baseName, array $header, iterable $rows): void
{
    $out = fopen('php://temp', 'w+');
    fputcsv($out, $header);
    $count = 0;
    foreach ($rows as $row) {
        fputcsv($out, array_map('pb2_csv_cell', array_values($row)));
        $count++;
    }
    rewind($out);
    header('X-Row-Count: ' . $count);
    $file = preg_replace('/[^A-Za-z0-9._-]/', '-', $baseName) . '-' . date('Y-m-d') . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $file . '"');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo "\xEF\xBB\xBF" . stream_get_contents($out);
    exit;
}
