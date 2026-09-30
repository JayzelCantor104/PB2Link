<?php
/**
 * One place to send email, with the same SMTP account every other module
 * uses (the SMTP_* constants in backend/config.php, loaded by
 * db_connection.php): Gmail on port 465 over SSL, from
 * "Barangay Pasong Buaya II".
 *
 *     require_once __DIR__ . '/mailer.php';
 *     $ok = pb2_send_mail($to, $subject, $html, $plainText);
 *
 * Returns true when sent. On failure it logs the PHPMailer error and returns
 * false — callers decide whether that blocks the action (an email code must
 * arrive) or not (a courtesy notice).
 */

require_once __DIR__ . '/vendor/autoload.php';

function pb2_send_mail(string $to, string $subject, string $html, string $plainText = ''): bool
{
    if (!defined('SMTP_USER') || !defined('SMTP_PASS') || !defined('SMTP_FROM_EMAIL')) {
        error_log('pb2_send_mail: SMTP_* constants are missing — is backend/config.php loaded?');
        return false;
    }

    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $port = defined('SMTP_PORT') ? (int)SMTP_PORT : 465;
        $mail->isSMTP();
        $mail->Host       = defined('SMTP_HOST') ? SMTP_HOST : 'smtp.gmail.com';
        $mail->SMTPAuth   = true;
        $mail->Username   = SMTP_USER;
        $mail->Password   = SMTP_PASS;
        $mail->SMTPSecure = $port === 465
            ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $port;
        $mail->CharSet    = 'UTF-8';

        $mail->setFrom(SMTP_FROM_EMAIL, defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'Barangay Pasong Buaya II');
        $mail->addAddress($to);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $html;
        $mail->AltBody = $plainText !== '' ? $plainText : trim(strip_tags($html));

        $mail->send();
        return true;
    } catch (Throwable $e) {
        error_log("pb2_send_mail to $to failed: " . $mail->ErrorInfo);
        return false;
    }
}

/**
 * The portal's standard email layout (same look as the document-request
 * emails): a bordered card with a green heading.
 */
function pb2_mail_layout(string $heading, string $bodyHtml): string
{
    return "
        <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;'>
            <h2 style='color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;'>" . htmlspecialchars($heading) . "</h2>
            $bodyHtml
            <p style='color: #64748b; font-size: 14px; margin-top: 30px;'>Thank you,<br>Barangay Pasong Buaya II Administration</p>
        </div>";
}
