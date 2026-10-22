<?php
/**
 * Residents' own information is stored in ALL CAPS (house rule, as
 * register.php has always done for names and addresses): what residents type
 * on registration, Edit Profile and request forms, and staff edits to it.
 *
 * NOT for website text or staff messages, which are stored as typed:
 * announcements, services and form questions, amenities, waste schedules,
 * advisories, evacuation centers, hotlines, guides, council and staff names,
 * remarks and notes to a resident, and public issue-map comments.
 *
 *     require_once __DIR__ . '/text_case.php';
 *     $purpose = pb2_caps($_POST['purpose'] ?? '');
 *     $data = pb2_caps_keys($data, ['title', 'description']);
 *
 * Apply it only to free text a person types. Never to: emails (stored
 * lowercase), passwords / codes / tokens / hashes, file paths (case-sensitive
 * on Linux hosting), JSON, phone numbers, dates, or values picked from a fixed
 * list (status, civil_status, sex, suffix, sector, category, alert level...),
 * which code compares exactly.
 *
 * Multibyte-safe: strtoupper() would leave "ñ" lowercase in names like Peña.
 */

function pb2_caps($value)
{
    if ($value === null) return null;
    $value = (string)$value;
    return function_exists('mb_strtoupper') ? mb_strtoupper($value, 'UTF-8') : strtoupper($value);
}

/** Uppercases the listed keys of an array (keys that are missing are skipped). */
function pb2_caps_keys(array $data, array $keys): array
{
    foreach ($keys as $k) {
        if (array_key_exists($k, $data) && is_string($data[$k])) {
            $data[$k] = pb2_caps($data[$k]);
        }
    }
    return $data;
}
