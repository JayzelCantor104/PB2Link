<?php
// Finds the reference number, amount and date in the text of an e-wallet
// receipt (ocr_receipt.php). Kept apart so it can be tested without Vision.
//
//   GCash:  "Ref No. 1012 345 678901"  (13 digits, shown 4-3-6)
//           "Amount 50.00" / "Total Amount Sent ₱50.00"
//           "Nov 20, 2026 3:15 PM"
//   Maya:   "Reference ID 1234 5678 9012", "Amount ₱50.00", "Nov 20, 2026, 03:15 pm"
//   Others: any "Ref / Reference / Transaction No." followed by 8-20 digits.

/** ['reference' => ?string, 'amount' => ?string, 'date' => ?'Y-m-d']. */
function pb2_receipt_read(string $text): array
{
    $t = str_replace(["\r", "\u{20B1}"], ["\n", ' PHP '], $text); // ₱ -> PHP
    $lines = array_values(array_filter(array_map('trim', explode("\n", $t)), 'strlen'));
    $flat = implode("\n", $lines);

    // --- Reference number: after its caption (same line or the next one).
    $ref = null;
    $caption = '/\b(?:ref(?:erence)?|transaction|trans|txn)\b\.?\s*(?:no|number|num|id|code|#)?\.?\s*[:#]?\s*(.*)$/i';
    foreach ($lines as $i => $line) {
        if (!preg_match($caption, $line, $cm)) continue;
        foreach ([$cm[1], $lines[$i + 1] ?? ''] as $cand) {
            if (preg_match('/(\d[\d \-]{6,26}\d)/', $cand, $m)) {
                $digits = preg_replace('/\D/', '', $m[1]);
                if (strlen($digits) >= 8 && strlen($digits) <= 20) { $ref = $digits; break 2; }
            }
        }
    }
    // No caption read: a GCash-shaped 13-digit number anywhere.
    if ($ref === null && preg_match('/\b(\d{4}\s?\d{3}\s?\d{6})\b/', $flat, $m)) {
        $ref = preg_replace('/\D/', '', $m[1]);
    }
    if ($ref !== null && strlen($ref) === 13) {
        $ref = substr($ref, 0, 4) . ' ' . substr($ref, 4, 3) . ' ' . substr($ref, 7); // GCash's own spacing
    }

    // --- Amount: after Amount / Total / Sent / Paid, else the first peso figure.
    $amount = null;
    if (preg_match('/\b(?:total\s+amount(?:\s+sent)?|amount(?:\s+sent|\s+paid)?|total|sent|paid)\b[^\d\n]{0,20}?(?:PHP|P)?\s*([\d,]+\.\d{2})\b/i', $flat, $m)
        || preg_match('/\bPHP\s*([\d,]+\.\d{2})\b/', $flat, $m)) {
        $amount = number_format((float)str_replace(',', '', $m[1]), 2, '.', '');
    }

    // --- Date: "Nov 20, 2026" (GCash / Maya), or 2026-11-20 / 11/20/2026 (month first).
    $date = null;
    $months = ['jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'may' => 5, 'jun' => 6, 'jul' => 7, 'aug' => 8, 'sep' => 9, 'oct' => 10, 'nov' => 11, 'dec' => 12];
    if (preg_match('/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i', $flat, $m)) {
        $date = sprintf('%04d-%02d-%02d', (int)$m[3], $months[strtolower($m[1])], (int)$m[2]);
    } elseif (preg_match('/\b(\d{4})-(\d{2})-(\d{2})\b/', $flat, $m)) {
        $date = "$m[1]-$m[2]-$m[3]";
    } elseif (preg_match('/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/', $flat, $m)) {
        $date = sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[1], (int)$m[2]);
    }
    if ($date !== null) {
        [$y, $mo, $d] = array_map('intval', explode('-', $date));
        if (!checkdate($mo, $d, $y) || $date > date('Y-m-d')) $date = null; // not a real or a future date
    }

    return ['reference' => $ref, 'amount' => $amount, 'date' => $date];
}
