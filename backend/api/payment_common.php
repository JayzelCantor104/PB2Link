<?php
/**
 * Fees and payments for document requests (migration 020).
 *
 * Real-life rules this follows:
 *  - The fee comes from the barangay revenue ordinance: staff set it per
 *    request type (request_fees); the server copies it onto each request, the
 *    resident never sends an amount that is trusted.
 *  - A GCash / Maya screenshot is proof of transfer, not an Official Receipt.
 *    Staff with 'payments.verify' match the reference number against the
 *    barangay's own e-wallet history, then record the O.R. number the
 *    treasurer issued (printed on the certificate).
 *  - The QR belongs to the barangay's official account (payment_* settings,
 *    shown with the account name and number so residents can check it).
 *  - Paying at the barangay hall stays possible (payment_allow_hall).
 *  - Exemptions: First-Time Jobseeker (RA 11261, once per person, with the oath
 *    of undertaking, confirmed by staff), and verified Indigent / Senior
 *    Citizen / PWD status where the fee allows it (waived at once, because staff
 *    already verified that status).
 *
 * Security:
 *  - one reference number per payment (UNIQUE), the same receipt image can't
 *    back two requests (SHA-256), mismatched amount / old or future date flagged;
 *  - receipts and oaths are stored in backend/private_uploads/payments/, which
 *    refuses direct web access, and are served only by payment_file.php to
 *    staff with 'payments.verify' or the resident who uploaded them;
 *  - nothing is confirmed automatically; release (Ready for Pick Up / Claimed)
 *    waits for Paid or Waived (pb2_payment_release_block).
 *
 * Callers must already have $conn (db_connection.php).
 */

require_once __DIR__ . '/text_case.php';

const PB2_FEE_TYPES = [
    'clearance'          => 'Barangay Clearance',
    'residency'          => 'Certificate of Residency',
    'barangay_id'        => 'Barangay ID',
    'business_clearance' => 'Business Clearance',
    'indigency'          => 'Certificate of Indigency',
];

// request_type (as update_document_request.php names it) -> table
const PB2_PAYMENT_TABLES = [
    'clearance'          => 'req_barangay_clearance',
    'residency'          => 'req_certificate_residency',
    'barangay_id'        => 'req_barangay_id',
    'business_clearance' => 'req_business_clearance',
    'indigency'          => 'req_certificate_indigency',
    'service'            => 'service_submissions',
];

// The 'type' label the request lists use -> request_type
const PB2_PAYMENT_TYPE_BY_LABEL = [
    'Barangay Clearance'       => 'clearance',
    'Certificate of Residency' => 'residency',
    'Barangay ID'              => 'barangay_id',
    'Business Clearance'       => 'business_clearance',
    'Certificate of Indigency' => 'indigency',
];

const PB2_EXEMPTIONS = [
    'first_time_jobseeker' => 'First-Time Jobseeker (RA 11261)',
    'indigent'             => 'Indigent',
    'senior'               => 'Senior Citizen',
    'pwd'                  => 'Person with Disability',
];

const PB2_PAYMENT_SETTLED = ['Paid', 'Waived'];
const PB2_PAYMENT_RECEIPT_MAX_AGE_DAYS = 30;

class PaymentError extends Exception {}

/** fee_key for a request type ('service' needs the service id). */
function pb2_fee_key(string $request_type, ?int $service_id = null): string
{
    return $request_type === 'service' ? 'service:' . (int)$service_id : $request_type;
}

/** The fee row, or a free default. */
function pb2_fee_get(mysqli $conn, string $fee_key): array
{
    $stmt = $conn->prepare("SELECT * FROM request_fees WHERE fee_key = ?");
    $stmt->bind_param('s', $fee_key);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: ['fee_key' => $fee_key, 'amount' => '0.00', 'waive_first_jobseeker' => 0,
                    'waive_indigent' => 0, 'waive_senior' => 0, 'waive_pwd' => 0];
}

function pb2_payment_setting(mysqli $conn, string $key, string $default = ''): string
{
    $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_row();
    $stmt->close();
    return $row ? (string)$row[0] : $default;
}

/** What residents see on the payment step. */
function pb2_payment_settings(mysqli $conn): array
{
    $qr = pb2_payment_setting($conn, 'payment_qr_path');
    return [
        'channel'        => pb2_payment_setting($conn, 'payment_channel', 'GCash'),
        'account_name'   => pb2_payment_setting($conn, 'payment_account_name'),
        'account_number' => pb2_payment_setting($conn, 'payment_account_number'),
        'instructions'   => pb2_payment_setting($conn, 'payment_instructions'),
        'allow_hall'     => pb2_payment_setting($conn, 'payment_allow_hall', '1') === '1',
        'qr_url'         => $qr !== '' ? '/uploads_backend/' . $qr : null,
    ];
}

/** Online payment is offered only once the QR and account are set up. */
function pb2_payment_online_ready(array $settings): bool
{
    return $settings['qr_url'] && $settings['account_name'] !== '' && $settings['account_number'] !== '';
}

/**
 * Exemptions this resident may claim on this fee (Self requests only — the
 * account holder's verified status says nothing about someone else).
 * Returns [key => ['label', 'auto' => true if already verified, so waived at
 * once; false = needs proof and staff confirmation]].
 */
function pb2_payment_exemptions_for(mysqli $conn, array $fee, int $resident_id, string $request_mode): array
{
    if ($request_mode !== 'Self') return [];
    $stmt = $conn->prepare("SELECT birth_date, is_indigent, is_pwd, ftj_availed_at FROM residents WHERE resident_id = ?");
    $stmt->bind_param('i', $resident_id);
    $stmt->execute();
    $r = $stmt->get_result()->fetch_assoc() ?: [];
    $stmt->close();

    $age = !empty($r['birth_date']) ? (int)(new DateTime($r['birth_date']))->diff(new DateTime('today'))->y : 0;
    $out = [];
    if ((int)$fee['waive_indigent'] && (int)($r['is_indigent'] ?? 0)) {
        $out['indigent'] = ['label' => PB2_EXEMPTIONS['indigent'], 'auto' => true];
    }
    if ((int)$fee['waive_senior'] && $age >= 60) {
        $out['senior'] = ['label' => PB2_EXEMPTIONS['senior'], 'auto' => true];
    }
    if ((int)$fee['waive_pwd'] && (int)($r['is_pwd'] ?? 0)) {
        $out['pwd'] = ['label' => PB2_EXEMPTIONS['pwd'], 'auto' => true];
    }
    if ((int)$fee['waive_first_jobseeker'] && empty($r['ftj_availed_at'])) {
        // Once per person: not while another claim is waiting either.
        $chk = $conn->prepare("SELECT 1 FROM request_payments WHERE resident_id = ? AND exemption = 'first_time_jobseeker'
                                 AND status IN ('For Verification','Waived') LIMIT 1");
        $chk->bind_param('i', $resident_id);
        $chk->execute();
        $pending = (bool)$chk->get_result()->fetch_row();
        $chk->close();
        if (!$pending) $out['first_time_jobseeker'] = ['label' => PB2_EXEMPTIONS['first_time_jobseeker'], 'auto' => false];
    }
    return $out;
}

/** Everything the payment step needs. */
function pb2_payment_info(mysqli $conn, string $fee_key, int $resident_id, string $request_mode): array
{
    $fee = pb2_fee_get($conn, $fee_key);
    $amount = (float)$fee['amount'];
    $settings = pb2_payment_settings($conn);
    return [
        'required'     => $amount > 0,
        'amount'       => $amount,
        'fee_key'      => $fee_key,
        'settings'     => $settings,
        'online_ready' => pb2_payment_online_ready($settings),
        'exemptions'   => $amount > 0 ? pb2_payment_exemptions_for($conn, $fee, $resident_id, $request_mode) : [],
    ];
}

/** Validates an upload by its real content. Returns [ext, sha256] or throws. */
function pb2_payment_check_file(?array $file, array $allowed, string $what): array
{
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        throw new PaymentError("Please attach $what.");
    }
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 8 * 1024 * 1024) {
        throw new PaymentError(ucfirst($what) . ' could not be uploaded. Please use a file up to 8 MB.');
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
    if ($finfo) finfo_close($finfo);
    $map = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];
    if (!$mime || !isset($map[$mime]) || !in_array($map[$mime], $allowed, true)) {
        throw new PaymentError(ucfirst($what) . ' must be a ' . strtoupper(implode(', ', $allowed)) . ' file.');
    }
    return [$map[$mime], hash_file('sha256', $file['tmp_name'])];
}

/** "1234 567 890123" -> "1234567890123" (letters kept, uppercased). */
function pb2_payment_clean_reference(string $ref): string
{
    return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $ref));
}

/**
 * Reads and checks the payment part of a submission (names below) BEFORE the
 * request is saved. Throws PaymentError with a message for the resident.
 *   payment_method      'online' | 'hall' | 'exempt'
 *   payment_reference, payment_amount, payment_date, payment_receipt (file)   for online
 *   payment_exemption, payment_exemption_proof (file, First-Time Jobseeker)   for exempt
 * $excludePaymentId: when re-submitting on an existing payment, its own old
 * reference/receipt don't count as duplicates.
 * Returns null when the fee is 0, else the checked data for pb2_payment_save().
 */
function pb2_payment_prepare(mysqli $conn, string $fee_key, int $resident_id, string $request_mode,
                             array $post, array $files, int $excludePaymentId = 0): ?array
{
    $info = pb2_payment_info($conn, $fee_key, $resident_id, $request_mode);
    if (!$info['required']) return null;
    $amount = $info['amount'];
    $method = (string)($post['payment_method'] ?? '');
    $prep = ['fee_key' => $fee_key, 'amount_due' => $amount, 'method' => $method, 'flags' => [],
             'reference_no' => null, 'amount_paid' => null, 'paid_on' => null, 'receipt' => null,
             'exemption' => null, 'exemption_proof' => null];

    if ($method === 'online') {
        if (!$info['online_ready']) throw new PaymentError('Online payment is not available right now. Please choose to pay at the barangay hall.');
        $ref = pb2_payment_clean_reference((string)($post['payment_reference'] ?? ''));
        if (strlen($ref) < 6 || strlen($ref) > 40) throw new PaymentError('Please enter the reference number shown on your payment receipt.');
        $paid = filter_var($post['payment_amount'] ?? '', FILTER_VALIDATE_FLOAT);
        if ($paid === false || $paid <= 0) throw new PaymentError('Please enter the amount you paid.');
        // '!' zeroes the time of day; without it a date of today would be "later than today".
        $date = DateTime::createFromFormat('!Y-m-d', (string)($post['payment_date'] ?? ''));
        if (!$date || $date->format('Y-m-d') !== ($post['payment_date'] ?? '')) throw new PaymentError('Please enter the date you paid.');
        if ($date > new DateTime('today')) throw new PaymentError('The payment date cannot be in the future.');
        [$ext, $sha] = pb2_payment_check_file($files['payment_receipt'] ?? null, ['jpg', 'png', 'webp', 'pdf'], 'a photo or screenshot of your payment receipt');

        $dup = $conn->prepare("SELECT payment_id FROM request_payments WHERE (reference_no = ? OR receipt_sha256 = ?) AND payment_id <> ? LIMIT 1");
        $dup->bind_param('ssi', $ref, $sha, $excludePaymentId);
        $dup->execute();
        $used = (bool)$dup->get_result()->fetch_row();
        $dup->close();
        if ($used) throw new PaymentError('This payment reference or receipt was already submitted for another request. Each payment can be used once.');

        if (abs($paid - $amount) > 0.009) $prep['flags'][] = sprintf('Amount entered (PHP %.2f) differs from the fee (PHP %.2f).', $paid, $amount);
        if ($date < (new DateTime('today'))->modify('-' . PB2_PAYMENT_RECEIPT_MAX_AGE_DAYS . ' days')) {
            $prep['flags'][] = 'Payment date is more than ' . PB2_PAYMENT_RECEIPT_MAX_AGE_DAYS . ' days ago.';
        }
        $prep['reference_no'] = $ref;
        $prep['amount_paid'] = round($paid, 2);
        $prep['paid_on'] = $date->format('Y-m-d');
        $prep['receipt'] = ['tmp' => $files['payment_receipt']['tmp_name'], 'ext' => $ext, 'sha' => $sha];
        $prep['status'] = 'For Verification';
    } elseif ($method === 'hall') {
        if (!$info['settings']['allow_hall']) throw new PaymentError('Please pay online and attach your receipt.');
        $prep['status'] = 'Unpaid';
    } elseif ($method === 'exempt') {
        $key = (string)($post['payment_exemption'] ?? '');
        if (!isset($info['exemptions'][$key])) throw new PaymentError('This exemption does not apply to you for this request.');
        $prep['exemption'] = $key;
        if ($info['exemptions'][$key]['auto']) {
            $prep['status'] = 'Waived';
            $prep['flags'][] = 'Waived automatically: verified ' . PB2_EXEMPTIONS[$key] . ' status on the resident record.';
        } else {
            [$ext, $sha] = pb2_payment_check_file($files['payment_exemption_proof'] ?? null, ['jpg', 'png', 'webp', 'pdf'], 'your signed Oath of Undertaking');
            $prep['exemption_proof'] = ['tmp' => $files['payment_exemption_proof']['tmp_name'], 'ext' => $ext];
            $prep['status'] = 'For Verification';
        }
    } else {
        throw new PaymentError('Please choose how you will pay the PHP ' . number_format($amount, 2) . ' fee.');
    }
    return $prep;
}

/** backend/private_uploads/payments/ (created with a deny-all .htaccess). */
function pb2_payment_private_dir(): string
{
    $root = __DIR__ . '/../private_uploads';
    if (!is_dir($root)) mkdir($root, 0750, true);
    if (!is_file($root . '/.htaccess')) {
        file_put_contents($root . '/.htaccess', "# Payment receipts: never served directly; see backend/api/payment_file.php\nRequire all denied\nDeny from all\n");
    }
    $dir = $root . '/payments';
    if (!is_dir($dir)) mkdir($dir, 0750, true);
    return $dir;
}

/** Moves an uploaded file into the private folder. Returns the path relative to private_uploads/. */
function pb2_payment_store(array $file, string $tracking_code, string $kind): string
{
    $sub = preg_replace('/[^A-Za-z0-9-]/', '', $tracking_code) ?: 'misc';
    $dir = pb2_payment_private_dir() . '/' . $sub;
    if (!is_dir($dir)) mkdir($dir, 0750, true);
    $name = $kind . '_' . bin2hex(random_bytes(8)) . '.' . $file['ext'];
    if (!move_uploaded_file($file['tmp'], $dir . '/' . $name)) {
        throw new PaymentError('Your file could not be saved. Please try again.');
    }
    return 'payments/' . $sub . '/' . $name;
}

function pb2_payment_private_path(?string $rel): ?string
{
    if (!$rel || strpos($rel, 'payments/') !== 0 || strpos($rel, '..') !== false) return null;
    $path = __DIR__ . '/../private_uploads/' . $rel;
    return is_file($path) ? $path : null;
}

function pb2_payment_event(mysqli $conn, int $payment_id, string $action, ?string $old, ?string $new, ?string $detail, ?int $admin_id = null): void
{
    $stmt = $conn->prepare("INSERT INTO request_payment_events (payment_id, action, old_status, new_status, detail, admin_id) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('issssi', $payment_id, $action, $old, $new, $detail, $admin_id);
    $stmt->execute();
    $stmt->close();
}

/** Saves the payment for a request that was just saved. Returns payment_id. */
function pb2_payment_save(mysqli $conn, array $prep, string $request_type, int $request_id, string $tracking_code, int $resident_id): int
{
    $receipt = $prep['receipt'] ? pb2_payment_store($prep['receipt'], $tracking_code, 'receipt') : null;
    $proof = $prep['exemption_proof'] ? pb2_payment_store($prep['exemption_proof'], $tracking_code, 'oath') : null;
    $sha = $prep['receipt']['sha'] ?? null;
    $method = $prep['method'];
    $flags = $prep['flags'] ? json_encode($prep['flags'], JSON_UNESCAPED_UNICODE) : null;
    $stmt = $conn->prepare("INSERT INTO request_payments
        (request_type, request_id, tracking_code, resident_id, fee_key, amount_due, method, status, reference_no,
         amount_paid, paid_on, receipt_path, receipt_sha256, exemption, exemption_proof, flags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('sisisdsssdssssss', $request_type, $request_id, $tracking_code, $resident_id, $prep['fee_key'],
        $prep['amount_due'], $method, $prep['status'], $prep['reference_no'], $prep['amount_paid'], $prep['paid_on'],
        $receipt, $sha, $prep['exemption'], $proof, $flags);
    $stmt->execute();
    $id = (int)$stmt->insert_id;
    $stmt->close();
    pb2_payment_event($conn, $id, 'submitted', null, $prep['status'],
        $method === 'online' ? "Receipt submitted, reference {$prep['reference_no']}"
        : ($method === 'hall' ? 'Will pay at the barangay hall' : 'Exemption: ' . PB2_EXEMPTIONS[$prep['exemption']]));
    return $id;
}

/**
 * For the submit endpoints: checks the payment fields before the request is
 * saved, ending the request with a 422 JSON error if they're incomplete.
 */
function pb2_payment_prepare_or_fail(mysqli $conn, string $fee_key, int $resident_id, string $request_mode): ?array
{
    try {
        return pb2_payment_prepare($conn, $fee_key, $resident_id, $request_mode, $_POST, $_FILES);
    } catch (PaymentError $e) {
        http_response_code(422);
        echo json_encode(['success' => false, 'code' => 'PAYMENT_REQUIRED', 'message' => $e->getMessage()]);
        exit;
    }
}

/** After the request row is saved. Never throws (the request already exists). */
function pb2_payment_save_soft(mysqli $conn, ?array $prep, string $request_type, int $request_id, string $tracking_code, int $resident_id): ?string
{
    if (!$prep) return null;
    try {
        pb2_payment_save($conn, $prep, $request_type, $request_id, $tracking_code, $resident_id);
        return [
            'For Verification' => ' Your payment will be checked by the barangay treasurer.',
            'Unpaid'           => ' Please pay the fee at the barangay hall when you claim it.',
            'Waived'           => ' Your fee was waived.',
        ][$prep['status']] ?? '';
    } catch (Throwable $e) {
        error_log("payment save for $request_type #$request_id: " . $e->getMessage());
        return ' We could not attach your payment; please upload it again from Track Request.';
    }
}

function pb2_payment_for(mysqli $conn, string $request_type, int $request_id): ?array
{
    $stmt = $conn->prepare("SELECT * FROM request_payments WHERE request_type = ? AND request_id = ?");
    $stmt->bind_param('si', $request_type, $request_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

/**
 * update_document_request.php: why this request can't move to $newStatus yet,
 * or null. Ready for Pick Up / Approved need a settled payment, except a
 * pay-at-hall request (paid when claimed). Claimed always needs it.
 */
function pb2_payment_release_block(mysqli $conn, string $request_type, int $request_id, string $newStatus): ?string
{
    if (!in_array($newStatus, ['Ready for Pick Up', 'Approved', 'Claimed'], true)) return null;
    $p = pb2_payment_for($conn, $request_type, $request_id);
    if (!$p || (float)$p['amount_due'] <= 0 || in_array($p['status'], PB2_PAYMENT_SETTLED, true)) return null;
    if ($newStatus !== 'Claimed' && $p['method'] === 'hall' && $p['status'] === 'Unpaid') return null;
    return $newStatus === 'Claimed'
        ? 'The PHP ' . number_format((float)$p['amount_due'], 2) . ' fee is not settled yet. Record the payment and its O.R. number before marking this Claimed.'
        : 'The payment for this request is ' . strtolower($p['status']) . '. Verify it (or waive the fee) before releasing the document.';
}

/** Shape for the resident (Track Request) and the admin panel. */
function pb2_payment_public(array $p, bool $forStaff = false): array
{
    $out = [
        'payment_id'      => (int)$p['payment_id'],
        'amount_due'      => (float)$p['amount_due'],
        'method'          => $p['method'],
        'status'          => $p['status'],
        'reference_no'    => $p['reference_no'],
        'amount_paid'     => $p['amount_paid'] !== null ? (float)$p['amount_paid'] : null,
        'paid_on'         => $p['paid_on'],
        'exemption'       => $p['exemption'],
        'exemption_label' => $p['exemption'] ? PB2_EXEMPTIONS[$p['exemption']] : null,
        'or_number'       => $p['or_number'],
        'remarks'         => $p['remarks'],
        'verified_at'     => $p['verified_at'],
        'created_at'      => $p['created_at'],
        'has_receipt'     => !empty($p['receipt_path']),
        'has_exemption_proof' => !empty($p['exemption_proof']),
        'receipt_url'     => !empty($p['receipt_path']) ? '/api_backend/payment_file.php?payment_id=' . (int)$p['payment_id'] . '&kind=receipt' : null,
        'exemption_proof_url' => !empty($p['exemption_proof']) ? '/api_backend/payment_file.php?payment_id=' . (int)$p['payment_id'] . '&kind=exemption' : null,
        'can_resubmit'    => in_array($p['status'], ['Rejected', 'Unpaid'], true),
    ];
    if ($forStaff) {
        $out['flags'] = $p['flags'] ? (json_decode($p['flags'], true) ?: []) : [];
        $out['tracking_code'] = $p['tracking_code'];
        $out['request_type'] = $p['request_type'];
        $out['request_id'] = (int)$p['request_id'];
    }
    return $out;
}

/** Map of "request_type:request_id" => public payment, for the list endpoints. */
function pb2_payments_index(mysqli $conn, ?int $resident_id = null, bool $forStaff = false): array
{
    $sql = "SELECT * FROM request_payments" . ($resident_id ? " WHERE resident_id = " . (int)$resident_id : '');
    $out = [];
    $res = $conn->query($sql);
    if (!$res) return $out; // migration 020 not applied
    while ($p = $res->fetch_assoc()) $out[$p['request_type'] . ':' . $p['request_id']] = pb2_payment_public($p, $forStaff);
    return $out;
}

/** request_type for a request list row ('service' rows carry request_kind). */
function pb2_payment_type_of(array $row): ?string
{
    if (($row['request_kind'] ?? '') === 'service') return 'service';
    return PB2_PAYMENT_TYPE_BY_LABEL[$row['type'] ?? ''] ?? null;
}

/** Tells the resident about a payment decision (document rule: email and SMS). */
function pb2_payment_notify(mysqli $conn, array $p, string $what): void
{
    try {
        require_once __DIR__ . '/notify.php';
        $stmt = $conn->prepare("SELECT user_id FROM residents WHERE resident_id = ?");
        $rid = (int)$p['resident_id'];
        $stmt->bind_param('i', $rid);
        $stmt->execute();
        $uid = $stmt->get_result()->fetch_row()[0] ?? null;
        $stmt->close();
        if (!$uid) return;
        $code = $p['tracking_code'];
        $amount = 'PHP ' . number_format((float)$p['amount_due'], 2);
        $remarks = (string)($p['remarks'] ?? '');
        $safe = htmlspecialchars($remarks, ENT_QUOTES, 'UTF-8');
        switch ($what) {
            case 'Paid':
                $subject = "Payment confirmed [$code]";
                $line = "Your $amount payment for request <strong>$code</strong> was confirmed. Official Receipt No. <strong>" . htmlspecialchars((string)$p['or_number']) . "</strong>.";
                $sms = "PB2Link: Payment for $code confirmed. O.R. No. {$p['or_number']}.";
                break;
            case 'Waived':
                $subject = "Fee waived [$code]";
                $line = "The fee for request <strong>$code</strong> was waived" . ($p['exemption'] ? ' (' . PB2_EXEMPTIONS[$p['exemption']] . ')' : '') . '.';
                $sms = "PB2Link: The fee for $code was waived.";
                break;
            case 'Rejected':
                $subject = "Payment not accepted [$code]";
                $line = "We could not confirm your payment for request <strong>$code</strong>. Reason: $safe. Please upload a valid receipt from Track Request, or pay at the barangay hall.";
                $sms = "PB2Link: Payment for $code was not accepted. Please check Track Request and upload a valid receipt.";
                break;
            case 'Refunded':
                $subject = "Payment refunded [$code]";
                $line = "Your $amount payment for request <strong>$code</strong> was refunded. $safe";
                $sms = "PB2Link: Your payment for $code was refunded.";
                break;
            default:
                return;
        }
        $html = pb2_mail_layout($subject, "<p>Good day,</p><p>$line</p>");
        pb2_notify_resident($conn, $uid, $subject, $html, strip_tags($line), $sms, 'payment_' . strtolower($what), true);
    } catch (Throwable $e) {
        error_log('payment notify: ' . $e->getMessage());
    }
}
