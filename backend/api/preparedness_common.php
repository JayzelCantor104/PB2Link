<?php
// Disaster preparedness (migration 033), shared by preparedness.php and
// vulnerable_residents.php. Mirrored for display in src/lib/preparedness.js.

const PB2_HOTLINE_CATEGORIES = ['emergency', 'police', 'fire', 'medical', 'rescue', 'barangay', 'utility', 'other'];
const PB2_GUIDE_HAZARDS = ['typhoon', 'flood', 'earthquake', 'fire'];
const PB2_GUIDE_PHASES = ['before', 'during', 'after'];
const PB2_FLOOD_LABELS = [0 => 'Not in a mapped flood area', 1 => 'Low', 2 => 'Medium', 3 => 'High'];

/** Street name as the address list compares it: caps, single spaces, no dots. */
function pb2_street_key($value): string
{
    return str_replace('.', '', mb_strtoupper(trim(preg_replace('/\s+/u', ' ', (string)$value)), 'UTF-8'));
}

/**
 * Flood level of a street from address_streets (migration 033/034).
 * Returns ['street', 'listed' (on the address list), 'mapped' (has a flood
 * level), 'flood_level' (0-3 or null), 'flood_share', 'label']. A street on
 * the list in the same subdivision wins over one with the same name elsewhere.
 */
function pb2_street_flood(mysqli $conn, ?string $street, ?string $subdivision = null): array
{
    $out = ['street' => mb_strtoupper(trim(preg_replace('/\s+/u', ' ', (string)$street)), 'UTF-8'), 'listed' => false, 'mapped' => false, 'flood_level' => null, 'flood_share' => null, 'label' => null];
    $key = pb2_street_key($street);
    if ($key === '') return $out;
    try {
        $st = $conn->prepare(
            "SELECT s.flood_level, s.flood_share, d.name AS subdivision
               FROM address_streets s LEFT JOIN address_subdivisions d ON d.id = s.subdivision_id
              WHERE REPLACE(s.name, '.', '') = ?
              ORDER BY (s.flood_level IS NULL), s.flood_level DESC");
        $st->bind_param('s', $key);
        $st->execute();
        $rows = $st->get_result()->fetch_all(MYSQLI_ASSOC);
        $st->close();
    } catch (Throwable $e) {
        return $out; // migration 033 not applied
    }
    if (!$rows) return $out;
    $pick = $rows[0];
    $subKey = pb2_street_key($subdivision);
    if ($subKey !== '') {
        foreach ($rows as $r) {
            if ($r['subdivision'] !== null && pb2_street_key($r['subdivision']) === $subKey) { $pick = $r; break; }
        }
    }
    $out['listed'] = true;
    if ($pick['flood_level'] !== null) {
        $out['mapped'] = true;
        $out['flood_level'] = (int)$pick['flood_level'];
        $out['flood_share'] = (float)$pick['flood_share'];
        $out['label'] = PB2_FLOOD_LABELS[$out['flood_level']] ?? null;
    }
    return $out;
}

/** Every street's flood level by street key (for lists). */
function pb2_street_flood_map(mysqli $conn): array
{
    $map = [];
    try {
        $res = $conn->query("SELECT name, MAX(flood_level) AS lvl FROM address_streets WHERE flood_level IS NOT NULL GROUP BY name");
        while ($res && ($r = $res->fetch_assoc())) {
            $k = pb2_street_key($r['name']);
            $map[$k] = max($map[$k] ?? 0, (int)$r['lvl']);
        }
    } catch (Throwable $e) {
        // migration 033 not applied
    }
    return $map;
}
