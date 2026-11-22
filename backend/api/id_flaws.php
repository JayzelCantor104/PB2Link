<?php
// Problems staff tick when an ID, selfie or PhilSys card doesn't pass review
// (admin_residents.php review_check). Mirrored for the screens by
// src/lib/idFlaws.js; keep the keys and wording the same. Stored as a JSON
// list in resident_check_reviews.flaws (migration 056) and sent to the
// resident in these words.

const PB2_ID_FLAWS = [
    'blurry'          => 'Blurry or out of focus',
    'glare'           => 'Glare or reflection covers part of it',
    'dark'            => 'Too dark or too bright',
    'cropped'         => 'Cut off: part of the ID is missing',
    'unreadable'      => "Text on the ID can't be read",
    'wrong_side'      => 'Wrong side, or front and back are the same photo',
    'screen_copy'     => 'A photo of a screen or a photocopy, not the card itself',
    'expired'         => 'The ID is expired',
    'not_accepted'    => 'Not one of the accepted IDs',
    'tampered'        => 'The ID looks edited or tampered with',
    'name_mismatch'   => "The name on the ID doesn't match the details given",
    'birth_mismatch'  => "The birth date on the ID doesn't match the details given",
    'face_mismatch'   => "The face doesn't match the photo on the ID",
    'id_not_visible'  => "The ID isn't clearly visible in the selfie",
    'number_mismatch' => "The PhilSys number doesn't match the card",
    'address_not_pb2' => "The address on the ID isn't in Pasong Buaya II",
];

const PB2_ID_FLAWS_FOR = [
    'id'      => ['blurry', 'glare', 'dark', 'cropped', 'unreadable', 'wrong_side', 'screen_copy', 'expired', 'not_accepted', 'tampered', 'name_mismatch', 'birth_mismatch'],
    'selfie'  => ['blurry', 'dark', 'face_mismatch', 'id_not_visible', 'screen_copy'],
    'philsys' => ['blurry', 'glare', 'cropped', 'unreadable', 'wrong_side', 'screen_copy', 'tampered', 'name_mismatch', 'number_mismatch'],
    'address' => ['blurry', 'unreadable', 'address_not_pb2'],
];

/** The ticked problems that fit this check, in list order (unknown keys dropped). */
function pb2_id_flaws_clean(string $check, $keys): array
{
    $allowed = PB2_ID_FLAWS_FOR[$check] ?? [];
    $keys = is_array($keys) ? array_map('strval', $keys) : [];
    return array_values(array_filter($allowed, fn($k) => in_array($k, $keys, true)));
}

/** Their wording, for notes and notices. */
function pb2_id_flaw_labels(array $keys): array
{
    return array_values(array_filter(array_map(fn($k) => PB2_ID_FLAWS[$k] ?? null, $keys)));
}
