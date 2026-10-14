<?php
// Street and subdivision pick lists (migration 026), shared by
// address_options.php, register.php and admin_process_profile.php.
// Names are stored in ALL CAPS, like the addresses themselves.

require_once __DIR__ . '/text_case.php';

const PB2_SUBDIVISION_KINDS = ['subdivision', 'village', 'compound', 'area'];
const PB2_ADDRESS_NAME_MAX = 150;

/** Trimmed, single-spaced, ALL CAPS. */
function pb2_address_clean($value): string
{
    return pb2_caps(trim(preg_replace('/\s+/u', ' ', (string)$value)));
}

/**
 * The lists. Public callers get active entries only; staff ($all) also get
 * hidden ones and the suggestions waiting for review.
 */
function pb2_address_lists(mysqli $conn, bool $all = false): array
{
    $where = $all ? '' : 'WHERE is_active = 1';
    $subdivisions = [];
    $res = $conn->query("SELECT id, name, kind, is_active, source FROM address_subdivisions $where ORDER BY name");
    while ($res && ($r = $res->fetch_assoc())) {
        $r['id'] = (int)$r['id'];
        $r['is_active'] = (int)$r['is_active'];
        $subdivisions[] = $r;
    }
    $whereStreet = $all ? '' : 'WHERE s.is_active = 1';
    $streets = [];
    $res = $conn->query("SELECT s.id, s.name, s.subdivision_id, s.is_active, s.source FROM address_streets s $whereStreet ORDER BY s.name");
    while ($res && ($r = $res->fetch_assoc())) {
        $r['id'] = (int)$r['id'];
        $r['subdivision_id'] = $r['subdivision_id'] !== null ? (int)$r['subdivision_id'] : null;
        $r['is_active'] = (int)$r['is_active'];
        $streets[] = $r;
    }
    $out = ['subdivisions' => $subdivisions, 'streets' => $streets];
    if ($all) {
        $out['suggestions'] = [];
        $res = $conn->query("SELECT id, kind, name, subdivision_name, times_seen, first_seen, last_seen
                             FROM address_suggestions WHERE status = 'new' ORDER BY times_seen DESC, last_seen DESC LIMIT 200");
        while ($res && ($r = $res->fetch_assoc())) {
            $r['id'] = (int)$r['id'];
            $r['times_seen'] = (int)$r['times_seen'];
            $out['suggestions'][] = $r;
        }
    }
    return $out;
}

/**
 * Records a street or subdivision a resident typed that isn't on the list, so
 * staff can add it. Called after an address is saved; never throws.
 */
function pb2_address_note_unlisted(mysqli $conn, $street, $subdivision): void
{
    try {
        $street = pb2_address_clean($street);
        $subdivision = pb2_address_clean($subdivision);
        $upsert = $conn->prepare("INSERT INTO address_suggestions (kind, name, subdivision_name) VALUES (?, ?, ?)
                                  ON DUPLICATE KEY UPDATE times_seen = times_seen + 1, last_seen = NOW(),
                                  status = IF(status = 'dismissed', 'dismissed', 'new')");
        if ($subdivision !== '' && mb_strlen($subdivision) <= PB2_ADDRESS_NAME_MAX) {
            $q = $conn->prepare("SELECT 1 FROM address_subdivisions WHERE name = ?");
            $q->bind_param('s', $subdivision);
            $q->execute();
            if (!$q->get_result()->fetch_row()) {
                $kind = 'subdivision';
                $empty = '';
                $upsert->bind_param('sss', $kind, $subdivision, $empty);
                $upsert->execute();
            }
            $q->close();
        }
        if ($street !== '' && mb_strlen($street) <= PB2_ADDRESS_NAME_MAX) {
            $q = $conn->prepare("SELECT 1 FROM address_streets WHERE name = ?");
            $q->bind_param('s', $street);
            $q->execute();
            if (!$q->get_result()->fetch_row()) {
                $kind = 'street';
                $upsert->bind_param('sss', $kind, $street, $subdivision);
                $upsert->execute();
            }
            $q->close();
        }
        $upsert->close();
    } catch (Throwable $e) {
        error_log('pb2_address_note_unlisted: ' . $e->getMessage());
    }
}

/** The subdivision's id, creating it (as a staff entry) when it isn't listed yet. */
function pb2_address_subdivision_id(mysqli $conn, string $name, string $source = 'staff'): ?int
{
    $name = pb2_address_clean($name);
    if ($name === '') return null;
    $q = $conn->prepare("SELECT id FROM address_subdivisions WHERE name = ?");
    $q->bind_param('s', $name);
    $q->execute();
    $row = $q->get_result()->fetch_row();
    $q->close();
    if ($row) return (int)$row[0];
    $ins = $conn->prepare("INSERT INTO address_subdivisions (name, source) VALUES (?, ?)");
    $ins->bind_param('ss', $name, $source);
    $ins->execute();
    $id = (int)$ins->insert_id;
    $ins->close();
    return $id;
}
