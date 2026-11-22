<?php
// What counts as a valid email address, for every place a new address is
// typed in (registration, Edit Profile, staff edits, admins, walk-ins, codes).
// Mirrored for the forms by src/lib/emailRules.js.
//
//   local-part@domain
//   - No spaces, plain characters only (ASCII), exactly one @, at most 320 characters.
//   - Local part (before @): 1-64 characters; letters, numbers and . _ - +;
//     no period at the start or end; two of . _ - + never side by side.
//   - Domain (after @): labels separated by periods, each 1-63 characters of
//     letters, numbers and hyphens, not starting or ending with a hyphen; it
//     ends in a top-level domain of 2-63 letters; not all numbers.
//
// Addresses already stored are read as they are: this checks new input only.

const PB2_EMAIL_MAX = 320;

/** Why this email address isn't valid, in plain words, or null when it is. */
function pb2_email_problem(?string $value): ?string
{
    $email = trim((string)$value);
    if ($email === '') return 'Enter your email address.';
    if (preg_match('/\s/', $email)) return "An email address can't have spaces.";
    if (preg_match('/[^\x21-\x7E]/', $email)) return 'Use only plain letters, numbers and . _ - + in the email address.';
    if (strlen($email) > PB2_EMAIL_MAX) return 'An email address can be at most ' . PB2_EMAIL_MAX . ' characters.';

    $at = explode('@', $email);
    if (count($at) === 1) return 'The email address is missing the @ sign (for example name@gmail.com).';
    if (count($at) > 2) return 'An email address has only one @ sign.';
    [$local, $domain] = $at;

    if ($local === '') return 'Add your name part before the @ (for example juan.delacruz@gmail.com).';
    if (strlen($local) > 64) return 'The part before the @ can be at most 64 characters.';
    if (preg_match('/[^A-Za-z0-9._+-]/', $local)) return 'Before the @, use only letters, numbers and . _ - +';
    if ($local[0] === '.' || substr($local, -1) === '.') return "The part before the @ can't start or end with a period.";
    if (preg_match('/[._+-]{2}/', $local)) return 'Two of . _ - + can\'t be side by side (for example "juan..cruz").';

    if ($domain === '') return 'Add the domain after the @ (for example gmail.com).';
    $labels = explode('.', $domain);
    if (count($labels) < 2) return 'The domain needs an ending such as .com or .ph (for example gmail.com).';
    foreach ($labels as $l) {
        if ($l === '') return "The domain can't have a period at the start or end, or two periods together.";
        if (strlen($l) > 63) return 'Each part of the domain can be at most 63 characters.';
        if (preg_match('/[^A-Za-z0-9-]/', $l)) return 'After the @, use only letters, numbers, hyphens and periods.';
        if ($l[0] === '-' || substr($l, -1) === '-') return "A part of the domain can't start or end with a hyphen.";
    }
    if (!preg_match('/^[A-Za-z]{2,63}$/', end($labels))) return 'The domain must end in letters, such as .com or .ph.';
    if (preg_match('/^[0-9.]+$/', preg_replace('/\.[A-Za-z]+$/', '', $domain))) return "The domain can't be only numbers.";
    return null;
}

function pb2_email_valid(?string $value): bool
{
    return pb2_email_problem($value) === null;
}
