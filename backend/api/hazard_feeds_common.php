<?php
// Live hazard feeds for Disaster Risk (migration 022).
//
// Sources, each fetched by the server on its own timer and cached in
// hazard_feed_cache, so all visitors share one request and the last good copy
// is still shown while a source is down:
//   pagasa   PAGASA severe weather bulletin page (official PH typhoon signals).
//            No API exists, so the HTML is read; if PAGASA redesigns the page
//            the parse fails soft and the card links to the bulletin instead.
//   gdacs    GDACS (UN / European Commission) current tropical cyclones, JSON.
//   phivolcs PHIVOLCS latest earthquakes page (official PH source), HTML.
//   usgs     USGS earthquakes near Imus, JSON. Shown only when PHIVOLCS can't
//            be read.
//   weather  Open-Meteo model forecast (not official; labelled as such).
//
// Detection (pb2_haz_detect) turns serious readings into hazard_events, one
// per hazard and severity. system_settings.hazard_alert_mode decides what
// happens next:
//   off    feeds are shown, nothing is recorded;
//   draft  staff see "detected: create an advisory?" with a pre-filled draft;
//   auto   an advisory is published at once (model rainfall stays a draft).
// A published advisory is texted to all residents only when the Super Admin
// set advisory_sms_mode to 'auto' (advisory_sms.php); otherwise staff send it.

require_once __DIR__ . '/account_approval.php'; // pb2_setting_get / pb2_setting_set
require_once __DIR__ . '/text_case.php';
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/advisory_sms.php';

const PB2_HAZ_LAT = 14.3936564;
const PB2_HAZ_LON = 120.9618181;
const PB2_HAZ_MODES = ['off', 'draft', 'auto'];

// Seconds between fetches per source.
const PB2_HAZ_TTL = ['pagasa' => 600, 'gdacs' => 900, 'phivolcs' => 600, 'usgs' => 600, 'weather' => 1800];

const PB2_HAZ_URLS = [
    'pagasa'   => 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin',
    'phivolcs' => 'https://earthquake.phivolcs.dost.gov.ph/',
    'gdacs'    => 'https://www.gdacs.org/',
    'usgs'     => 'https://earthquake.usgs.gov/earthquakes/map/',
    'weather'  => 'https://open-meteo.com/',
];

// Earthquakes listed on the page: within this distance, in the last 7 days.
const PB2_HAZ_QUAKE_RADIUS_KM = 300;

function pb2_haz_mode(mysqli $conn): string
{
    $m = pb2_setting_get($conn, 'hazard_alert_mode', 'draft');
    return in_array($m, PB2_HAZ_MODES, true) ? $m : 'draft';
}

function pb2_haz_km(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $r = 6371.0;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
    return $r * 2 * atan2(sqrt($a), sqrt(1 - $a));
}

function pb2_haz_text(string $html): string
{
    $s = preg_replace('/<br\s*\/?>/i', ' ', $html);
    $s = html_entity_decode(strip_tags($s), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $s = str_replace("\xC2\xA0", ' ', $s);
    return trim(preg_replace('/\s+/u', ' ', $s));
}

/**
 * Fetch several URLs in parallel. $requests: source => [url, maxBytes, caFile?].
 * A maxBytes cap stops the download early (the PHIVOLCS page is ~5 MB and the
 * newest quakes are at the top). Returns source => [ok, body, error].
 */
function pb2_haz_http_multi(array $requests): array
{
    $mh = curl_multi_init();
    $handles = [];
    $bodies = [];
    foreach ($requests as $key => $req) {
        [$url, $maxBytes] = $req;
        $bodies[$key] = '';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT        => 25,
            CURLOPT_USERAGENT      => 'PB2Link/1.0 (Barangay Pasong Buaya II disaster information page)',
            CURLOPT_HTTPHEADER     => ['Accept: text/html,application/json;q=0.9,*/*;q=0.8'],
            CURLOPT_ENCODING       => '',
            CURLOPT_WRITEFUNCTION  => function ($ch, $chunk) use (&$bodies, $key, $maxBytes) {
                $bodies[$key] .= $chunk;
                // Returning a short count aborts the transfer once we have enough.
                return ($maxBytes > 0 && strlen($bodies[$key]) >= $maxBytes) ? 0 : strlen($chunk);
            },
        ]);
        // A source whose server leaves out its intermediate certificate gets
        // its own CA file, so verification stays on (see certs/).
        if (!empty($req[2])) curl_setopt($ch, CURLOPT_CAINFO, $req[2]);
        curl_multi_add_handle($mh, $ch);
        $handles[$key] = $ch;
    }
    // curl_errno() stays 0 for handles run through curl_multi, even after a
    // timeout, so each transfer's real result is read from curl_multi_info_read().
    $results = [];
    do {
        $status = curl_multi_exec($mh, $running);
        while ($info = curl_multi_info_read($mh)) {
            $results[(int)$info['handle']] = $info['result'];
        }
        if ($running) curl_multi_select($mh, 1.0);
    } while ($running && $status === CURLM_OK);
    while ($info = curl_multi_info_read($mh)) {
        $results[(int)$info['handle']] = $info['result'];
    }

    $out = [];
    foreach ($handles as $key => $ch) {
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $errno = $results[(int)$ch] ?? CURLE_OPERATION_TIMEDOUT;
        $maxBytes = $requests[$key][1];
        $capped = $errno === CURLE_WRITE_ERROR && $maxBytes > 0 && strlen($bodies[$key]) >= $maxBytes;
        $ok = ($errno === CURLE_OK || $capped) && $code >= 200 && $code < 300 && $bodies[$key] !== '';
        $error = null;
        if (!$ok) {
            $error = $errno !== CURLE_OK && !$capped ? (curl_strerror($errno) ?: "cURL error $errno") : "HTTP $code";
        }
        $out[$key] = [$ok, $bodies[$key], $error];
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
    return $out;
}

function pb2_haz_request_for(string $source): array
{
    $now = new DateTime('now', new DateTimeZone('UTC'));
    switch ($source) {
        case 'pagasa':
            return [PB2_HAZ_URLS['pagasa'], 0];
        case 'phivolcs':
            return [PB2_HAZ_URLS['phivolcs'], 900000, __DIR__ . '/certs/phivolcs_chain.pem'];
        case 'gdacs':
            $from = (clone $now)->modify('-14 days')->format('Y-m-d');
            return ['https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&alertlevel=green;orange;red'
                . "&fromdate=$from&todate=" . $now->format('Y-m-d'), 0];
        case 'usgs':
            $start = (clone $now)->modify('-7 days')->format('Y-m-d\TH:i:s');
            return ['https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time&limit=60&minmagnitude=2.5'
                . '&latitude=' . PB2_HAZ_LAT . '&longitude=' . PB2_HAZ_LON . '&maxradiuskm=' . PB2_HAZ_QUAKE_RADIUS_KM . "&starttime=$start", 0];
        case 'weather':
            return ['https://api.open-meteo.com/v1/forecast?' . http_build_query([
                'latitude' => PB2_HAZ_LAT,
                'longitude' => PB2_HAZ_LON,
                'current' => 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
                'hourly' => 'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m',
                'daily' => 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
                'past_days' => 1,
                'forecast_days' => 7,
                'timezone' => 'Asia/Manila',
            ]), 0];
    }
    throw new InvalidArgumentException("Unknown source $source");
}

// ---------------------------------------------------------------- parsers

/** PAGASA bulletin page -> ['active' => bool, 'storms' => [...], 'bulletin_pdf' => url|null]. */
function pb2_haz_parse_pagasa(string $html): array
{
    if (stripos($html, 'severe-weather-bulletin') === false && stripos($html, 'Tropical Cyclone') === false) {
        throw new RuntimeException('Unexpected PAGASA page');
    }
    $pdf = null;
    if (preg_match('/href="(https?:\/\/pubfiles\.pagasa\.dost\.gov\.ph\/[^"]+\.pdf)"/i', $html, $m)) $pdf = $m[1];

    if (preg_match('/No Active Tropical Cyclone/i', $html)) {
        return ['active' => false, 'storms' => [], 'bulletin_pdf' => $pdf];
    }

    // One chunk per storm (multiple storms are tabs, each with its own panels).
    $parts = preg_split('/(?=panel-heading[^>]*>\s*Location of Eye\/center)/i', $html);
    array_shift($parts);
    $storms = [];
    foreach ($parts as $chunk) {
        $panel = function (string $title) use ($chunk) {
            return preg_match('/panel-heading[^>]*>\s*' . $title . '\s*<\/div>\s*<div[^>]*panel-body[^>]*>(.*?)<\/div>/is', $chunk, $m)
                ? pb2_haz_text($m[1]) : '';
        };
        $location = $panel('Location of Eye\/center');
        $movement = $panel('Movement');
        $strength = $panel('Strength');

        $name = null;
        $category = null;
        if (preg_match('/(Super Typhoon|Typhoon|Severe Tropical Storm|Tropical Storm|Tropical Depression)\s*["“”\']?\s*([A-Z][A-Za-z\-]+)/u', $location, $m)) {
            $category = $m[1];
            $name = strtoupper($m[2]);
        }
        $lat = $lon = null;
        if (preg_match('/([0-9]+(?:\.[0-9]+)?)\s*°?\s*N\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*°?\s*E/u', $location, $m)) {
            $lat = (float)$m[1];
            $lon = (float)$m[2];
        }
        $maxWind = $gust = null;
        if (preg_match('/sustained winds of\s*([0-9]+)\s*km\/h.*?gustiness of up to\s*([0-9]+)\s*km\/h/is', $strength, $m)) {
            $maxWind = (int)$m[1];
            $gust = (int)$m[2];
        }

        // Wind signals: from the "Wind Signal" heading to the bulletin archive.
        $signals = [];
        if (preg_match('/panel-heading[^>]*>\s*Wind Signal.*?(?=panel-heading[^>]*>\s*Tropical Cyclone Bulletin Archive|\z)/is', $chunk, $sec)
            && !preg_match('/No Tropical Cyclone Wind Signal/i', $sec[0])) {
            preg_match_all('/class="signalno(\d+)"/i', $sec[0], $heads, PREG_OFFSET_CAPTURE);
            foreach ($heads[1] as $i => [$num, $off]) {
                $end = isset($heads[0][$i + 1]) ? $heads[0][$i + 1][1] : strlen($sec[0]);
                $part = substr($sec[0], $off, $end - $off);
                $areas = '';
                if (preg_match('/Affected Areas\s*<\/strong>\s*<\/td>\s*<td[^>]*>(.*?)<\/td>/is', $part, $am)) {
                    $a = preg_replace('/<\/strong>/i', ': ', $am[1]);
                    $a = preg_replace('/<\/li>/i', '; ', $a);
                    $a = pb2_haz_text($a);
                    $areas = trim(preg_replace('/(;\s*){2,}/', '; ', $a), '; ');
                }
                $signals[] = ['signal' => (int)$num, 'areas' => $areas];
            }
        }

        // Highest signal whose areas name Cavite (a "portion of Cavite" still counts).
        $cavite = 0;
        $cavitePartial = false;
        foreach ($signals as $s) {
            if (preg_match('/Cavite/i', $s['areas']) && $s['signal'] > $cavite) {
                $cavite = $s['signal'];
                $cavitePartial = (bool)preg_match('/portion[^;]*Cavite/i', $s['areas']) && !preg_match('/Imus/i', $s['areas']);
            }
        }

        $storms[] = [
            'name' => $name,
            'category' => $category,
            'location' => $location,
            'lat' => $lat,
            'lon' => $lon,
            'distance_km' => ($lat !== null) ? (int)round(pb2_haz_km(PB2_HAZ_LAT, PB2_HAZ_LON, $lat, $lon)) : null,
            'movement' => $movement,
            'strength' => $strength,
            'max_wind_kmh' => $maxWind,
            'gust_kmh' => $gust,
            'signals' => $signals,
            'cavite_signal' => $cavite,
            'cavite_partial' => $cavitePartial,
        ];
    }
    if (!$storms) {
        // A storm is up but the layout changed: say so rather than "no storm".
        return ['active' => true, 'storms' => [], 'bulletin_pdf' => $pdf, 'unparsed' => true];
    }
    return ['active' => true, 'storms' => $storms, 'bulletin_pdf' => $pdf];
}

/** PHIVOLCS latest-earthquakes page -> list of quakes (newest first, up to 150). */
function pb2_haz_parse_phivolcs(string $html): array
{
    $tz = new DateTimeZone('Asia/Manila');
    $out = [];
    if (!preg_match_all('/<tr[^>]*>(.*?)<\/tr>/is', $html, $rows)) throw new RuntimeException('No PHIVOLCS rows');
    foreach ($rows[1] as $row) {
        if (!preg_match_all('/<td[^>]*>(.*?)<\/td>/is', $row, $cells) || count($cells[1]) < 6) continue;
        $c = $cells[1];
        $when = pb2_haz_text($c[0]);
        $dt = DateTime::createFromFormat('!j F Y - h:i A', $when, $tz);
        if (!$dt) continue;
        $lat = (float)pb2_haz_text($c[1]);
        $lon = (float)pb2_haz_text($c[2]);
        $mag = (float)pb2_haz_text($c[4]);
        if (!$lat || !$lon || !$mag) continue;
        $url = null;
        if (preg_match('/href="([^"]+)"/i', $c[0], $hm)) {
            $href = str_replace('\\', '/', html_entity_decode($hm[1]));
            $url = preg_match('/^https?:/i', $href) ? $href : PB2_HAZ_URLS['phivolcs'] . ltrim($href, '/');
        }
        $out[] = [
            'time' => $dt->format(DateTime::ATOM),
            'mag' => $mag,
            'depth_km' => (int)pb2_haz_text($c[3]),
            'lat' => $lat,
            'lon' => $lon,
            'place' => pb2_haz_text($c[5]),
            'url' => $url,
        ];
        if (count($out) >= 150) break;
    }
    if (!$out) throw new RuntimeException('PHIVOLCS table not recognised');
    return $out;
}

function pb2_haz_parse_usgs(string $body): array
{
    $j = json_decode($body, true);
    if (!is_array($j) || !isset($j['features'])) throw new RuntimeException('Bad USGS response');
    $out = [];
    foreach ($j['features'] as $f) {
        $p = $f['properties'] ?? [];
        $g = $f['geometry']['coordinates'] ?? [null, null, null];
        if (!isset($p['mag'], $p['time'], $g[0], $g[1])) continue;
        $out[] = [
            'id' => $f['id'] ?? null,
            'time' => (new DateTime('@' . intdiv((int)$p['time'], 1000)))->setTimezone(new DateTimeZone('Asia/Manila'))->format(DateTime::ATOM),
            'mag' => round((float)$p['mag'], 1),
            'depth_km' => (int)round((float)($g[2] ?? 0)),
            'lat' => (float)$g[1],
            'lon' => (float)$g[0],
            'place' => (string)($p['place'] ?? ''),
            'url' => $p['url'] ?? null,
        ];
    }
    return $out;
}

function pb2_haz_parse_gdacs(string $body): array
{
    $j = json_decode($body, true);
    if (!is_array($j) || !isset($j['features'])) throw new RuntimeException('Bad GDACS response');
    $out = [];
    foreach ($j['features'] as $f) {
        $p = $f['properties'] ?? [];
        if (empty($p['iscurrent']) || $p['iscurrent'] === 'false') continue;
        $c = $f['geometry']['coordinates'] ?? null;
        if (!is_array($c) || !is_numeric($c[0] ?? null)) continue;
        $countries = [];
        foreach ((array)($p['affectedcountries'] ?? []) as $ac) {
            $countries[] = is_array($ac) ? ($ac['countryname'] ?? ($ac['iso3'] ?? '')) : (string)$ac;
        }
        if (!empty($p['country'])) $countries = array_merge($countries, array_map('trim', explode(',', $p['country'])));
        $countries = array_values(array_unique(array_filter($countries)));
        $out[] = [
            'id' => (string)($p['eventid'] ?? ''),
            'name' => preg_replace('/^Tropical Cyclone\s+/i', '', (string)($p['name'] ?? $p['eventname'] ?? '')),
            'alert' => (string)($p['alertlevel'] ?? 'Green'),
            'lat' => (float)$c[1],
            'lon' => (float)$c[0],
            'distance_km' => (int)round(pb2_haz_km(PB2_HAZ_LAT, PB2_HAZ_LON, (float)$c[1], (float)$c[0])),
            'wind_kmh' => isset($p['severitydata']['severity']) ? (int)round((float)$p['severitydata']['severity']) : null,
            'severity' => (string)($p['severitydata']['severitytext'] ?? ''),
            'countries' => $countries,
            'ph_affected' => (bool)preg_grep('/Philippines|^PHL$|^RP$/i', $countries),
            'updated' => (string)($p['datemodified'] ?? ''),
            'url' => $p['url']['report'] ?? PB2_HAZ_URLS['gdacs'],
        ];
    }
    usort($out, fn($a, $b) => $a['distance_km'] <=> $b['distance_km']);
    return $out;
}

function pb2_haz_parse(string $source, string $body): array
{
    switch ($source) {
        case 'pagasa':   return pb2_haz_parse_pagasa($body);
        case 'phivolcs': return pb2_haz_parse_phivolcs($body);
        case 'usgs':     return pb2_haz_parse_usgs($body);
        case 'gdacs':    return pb2_haz_parse_gdacs($body);
        case 'weather':
            $j = json_decode($body, true);
            if (!is_array($j) || !isset($j['hourly'])) throw new RuntimeException('Bad Open-Meteo response');
            return $j;
    }
    throw new InvalidArgumentException("Unknown source $source");
}

// ---------------------------------------------------------------- cache

function pb2_haz_cache_all(mysqli $conn): array
{
    $rows = [];
    try {
        $res = $conn->query("SELECT source, payload, fetched_at, last_success_at, last_error FROM hazard_feed_cache");
        while ($r = $res->fetch_assoc()) {
            $r['data'] = $r['payload'] !== null ? json_decode($r['payload'], true) : null;
            unset($r['payload']);
            $rows[$r['source']] = $r;
        }
    } catch (Throwable $e) { /* table missing: treat as empty */ }
    return $rows;
}

/**
 * Fetch every source whose copy is older than its TTL (or all, with $force),
 * then run detection. Only one request refreshes at a time; the others keep
 * serving the cached copy.
 */
function pb2_haz_refresh(mysqli $conn, bool $force = false): void
{
    $cache = pb2_haz_cache_all($conn);
    $due = [];
    $now = time();
    foreach (PB2_HAZ_TTL as $source => $ttl) {
        $at = isset($cache[$source]['fetched_at']) ? strtotime($cache[$source]['fetched_at']) : 0;
        // A source that failed last time is retried sooner than its usual timer.
        $wait = !empty($cache[$source]['last_error']) ? min($ttl, 120) : $ttl;
        if ($force || $now - $at >= $wait) $due[$source] = pb2_haz_request_for($source);
    }
    if (!$due) return;

    $lock = $conn->query("SELECT GET_LOCK('pb2_hazard_refresh', 0)")->fetch_row()[0] ?? 0;
    if ((int)$lock !== 1) return;
    try {
        // Claim the slot first so a slow source doesn't make the next visitor retry it.
        $claim = $conn->prepare("INSERT INTO hazard_feed_cache (source, fetched_at) VALUES (?, NOW())
                                 ON DUPLICATE KEY UPDATE fetched_at = NOW()");
        foreach (array_keys($due) as $s) { $claim->bind_param('s', $s); $claim->execute(); }
        $claim->close();

        $results = pb2_haz_http_multi($due);
        $okStmt = $conn->prepare("UPDATE hazard_feed_cache SET payload = ?, last_success_at = NOW(), last_error = NULL WHERE source = ?");
        $errStmt = $conn->prepare("UPDATE hazard_feed_cache SET last_error = ? WHERE source = ?");
        foreach ($results as $source => [$ok, $body, $error]) {
            try {
                if (!$ok) throw new RuntimeException($error ?: 'Request failed');
                $json = json_encode(pb2_haz_parse($source, $body), JSON_UNESCAPED_UNICODE);
                $okStmt->bind_param('ss', $json, $source);
                $okStmt->execute();
            } catch (Throwable $e) {
                $msg = substr($e->getMessage(), 0, 250);
                $errStmt->bind_param('ss', $msg, $source);
                $errStmt->execute();
            }
        }
        $okStmt->close();
        $errStmt->close();

        pb2_haz_detect($conn, pb2_haz_live($conn));
    } catch (Throwable $e) {
        error_log('pb2_haz_refresh: ' . $e->getMessage());
    } finally {
        $conn->query("SELECT RELEASE_LOCK('pb2_hazard_refresh')");
    }
}

// ---------------------------------------------------------------- public view

function pb2_haz_source_status(array $cache, string $source): array
{
    $c = $cache[$source] ?? [];
    $stale = empty($c['last_success_at']) || (time() - strtotime($c['last_success_at'])) > 3 * PB2_HAZ_TTL[$source] + 600;
    return [
        'ok' => !empty($c['last_success_at']) && empty($c['last_error']),
        'updated_at' => $c['last_success_at'] ?? null,
        'checked_at' => $c['fetched_at'] ?? null,
        'stale' => $stale,
        'error' => !empty($c['last_error']) ? 'Could not be read at the last check.' : null,
        'url' => PB2_HAZ_URLS[$source],
    ];
}

/** Everything the Disaster Risk pages show, built from the cache. */
function pb2_haz_live(mysqli $conn): array
{
    $cache = pb2_haz_cache_all($conn);
    $sources = [];
    foreach (array_keys(PB2_HAZ_TTL) as $s) $sources[$s] = pb2_haz_source_status($cache, $s);

    // Earthquakes: PHIVOLCS first; USGS when PHIVOLCS can't be read or is stale.
    $quakeSource = null;
    $list = [];
    if (!$sources['phivolcs']['stale'] && is_array($cache['phivolcs']['data'] ?? null)) {
        $quakeSource = 'phivolcs';
        $list = $cache['phivolcs']['data'];
    } elseif (is_array($cache['usgs']['data'] ?? null)) {
        $quakeSource = 'usgs';
        $list = $cache['usgs']['data'];
    }
    $weekAgo = time() - 7 * 86400;
    $nearby = [];
    foreach ($list as $q) {
        $km = pb2_haz_km(PB2_HAZ_LAT, PB2_HAZ_LON, $q['lat'], $q['lon']);
        if ($km > PB2_HAZ_QUAKE_RADIUS_KM || strtotime($q['time']) < $weekAgo) continue;
        $q['distance_km'] = (int)round($km);
        $nearby[] = $q;
    }
    usort($nearby, fn($a, $b) => strcmp($b['time'], $a['time']));
    $strongest = null;
    foreach ($nearby as $q) if (!$strongest || $q['mag'] > $strongest['mag']) $strongest = $q;

    // Rainfall from the model forecast, per day (today and the next 6).
    $rain = [];
    $w = $cache['weather']['data'] ?? null;
    if (is_array($w) && isset($w['daily']['time'])) {
        $today = (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
        foreach ($w['daily']['time'] as $i => $d) {
            if ($d < $today) continue;
            $rain[] = [
                'date' => $d,
                'mm' => isset($w['daily']['precipitation_sum'][$i]) ? round((float)$w['daily']['precipitation_sum'][$i], 1) : null,
                'chance' => $w['daily']['precipitation_probability_max'][$i] ?? null,
            ];
        }
    }

    $gdacs = is_array($cache['gdacs']['data'] ?? null) ? $cache['gdacs']['data'] : [];
    // Only storms that matter here: affecting the Philippines or within 2,000 km.
    $gdacs = array_values(array_filter($gdacs, fn($g) => $g['ph_affected'] || $g['distance_km'] <= 2000));

    return [
        'sources' => $sources,
        'typhoon' => [
            'pagasa' => $cache['pagasa']['data'] ?? null,
            'gdacs' => $gdacs,
        ],
        'earthquakes' => [
            'source' => $quakeSource,
            'radius_km' => PB2_HAZ_QUAKE_RADIUS_KM,
            'list' => array_slice($nearby, 0, 8),
            'count_7d' => count($nearby),
            'strongest_7d' => $strongest,
        ],
        'rainfall' => $rain,
    ];
}

function pb2_haz_weather(mysqli $conn): ?array
{
    $cache = pb2_haz_cache_all($conn);
    return $cache['weather']['data'] ?? null;
}

// ---------------------------------------------------------------- detection

/** Serious readings as candidate events (not yet saved). */
function pb2_haz_candidates(array $live): array
{
    $out = [];
    $area = 'BARANGAY PASONG BUAYA II (ALL AREAS)';

    foreach (($live['typhoon']['pagasa']['storms'] ?? []) as $s) {
        $n = (int)$s['cavite_signal'];
        if ($n < 1 || !$s['name']) continue;
        $level = $n >= 3 ? 'Severe' : ($n === 2 ? 'Warning' : 'Watch');
        $label = trim(($s['category'] ? $s['category'] . ' ' : '') . $s['name']);
        $instr = "PAGASA HAS RAISED TROPICAL CYCLONE WIND SIGNAL NO. $n OVER " . ($s['cavite_partial'] ? 'PORTIONS OF ' : '') . "CAVITE DUE TO " . strtoupper($label) . ". "
            . 'SECURE LOOSE ITEMS, PREPARE YOUR GO-BAG, CHARGE YOUR PHONES AND KEEP FLASHLIGHTS READY. '
            . ($n >= 2 ? 'RESIDENTS OF LOW-LYING AND FLOOD-PRONE AREAS SHOULD BE READY FOR PRE-EMPTIVE EVACUATION. ' : 'MONITOR BARANGAY ANNOUNCEMENTS AND PAGASA BULLETINS. ')
            . 'CALL THE BARANGAY HOTLINE FOR EMERGENCIES.';
        $out[] = [
            'source' => 'pagasa', 'kind' => 'typhoon', 'hazard_key' => 'pagasa:' . $s['name'], 'severity_key' => "tcws$n",
            'alert_level' => $level,
            'headline' => "Signal No. $n over " . ($s['cavite_partial'] ? 'part of ' : '') . "Cavite: $label",
            'details' => $s['location'] . ($s['strength'] ? ' ' . $s['strength'] : ''),
            'official_url' => $live['typhoon']['pagasa']['bulletin_pdf'] ?? PB2_HAZ_URLS['pagasa'],
            'draft' => [
                'title' => "TROPICAL CYCLONE WIND SIGNAL NO. $n: " . strtoupper($label),
                'alert_level' => $level,
                'calamity_type' => 'TYPHOON / TROPICAL CYCLONE',
                'affected_areas' => $area,
                'instructions' => $instr,
            ],
        ];
    }

    foreach (($live['typhoon']['gdacs'] ?? []) as $g) {
        if (!in_array($g['alert'], ['Orange', 'Red'], true) || !($g['ph_affected'] || $g['distance_km'] <= 800)) continue;
        $level = $g['alert'] === 'Red' ? 'Warning' : 'Watch';
        $name = strtoupper($g['name']);
        $out[] = [
            'source' => 'gdacs', 'kind' => 'typhoon', 'hazard_key' => 'gdacs:' . $g['id'], 'severity_key' => strtolower($g['alert']),
            'alert_level' => $level,
            'headline' => "{$g['alert']} storm alert: {$g['name']}, about " . number_format($g['distance_km']) . ' km away',
            'details' => trim($g['severity'] . ($g['countries'] ? ' Affected: ' . implode(', ', $g['countries']) . '.' : '')),
            'official_url' => $g['url'],
            'draft' => [
                'title' => "TROPICAL CYCLONE $name MONITORED NEAR THE PHILIPPINES",
                'alert_level' => $level,
                'calamity_type' => 'TYPHOON / TROPICAL CYCLONE',
                'affected_areas' => $area,
                'instructions' => "TROPICAL CYCLONE $name IS BEING TRACKED ABOUT " . number_format($g['distance_km']) . ' KM FROM IMUS. '
                    . 'FOLLOW PAGASA BULLETINS FOR WIND SIGNALS, PREPARE YOUR GO-BAG, AND WAIT FOR BARANGAY INSTRUCTIONS.',
            ],
        ];
    }

    $source = $live['earthquakes']['source'];
    foreach (($live['earthquakes']['list'] ?? []) as $q) {
        if (time() - strtotime($q['time']) > 6 * 3600) continue; // only fresh quakes
        $km = $q['distance_km'];
        if (!(($q['mag'] >= 5.0 && $km <= 100) || ($q['mag'] >= 6.0 && $km <= 250))) continue;
        $level = ($q['mag'] >= 6.5 && $km <= 100) ? 'Severe' : ($q['mag'] >= 6.0 ? 'Warning' : 'Watch');
        $by = $source === 'usgs' ? 'USGS' : 'PHIVOLCS';
        $when = (new DateTime($q['time']))->setTimezone(new DateTimeZone('Asia/Manila'))->format('M j, g:i A');
        $out[] = [
            'source' => $source, 'kind' => 'earthquake', 'hazard_key' => 'quake:' . substr($q['time'], 0, 16), 'severity_key' => 'm' . number_format($q['mag'], 1),
            'alert_level' => $level,
            'headline' => "Magnitude {$q['mag']} earthquake, $km km away ($when)",
            'details' => "$by: {$q['place']}, depth {$q['depth_km']} km.",
            'official_url' => $q['url'] ?: PB2_HAZ_URLS[$source],
            'mag' => $q['mag'],
            'draft' => [
                'title' => "MAGNITUDE {$q['mag']} EARTHQUAKE NEAR IMUS",
                'alert_level' => $level,
                'calamity_type' => 'EARTHQUAKE',
                'affected_areas' => $area,
                'instructions' => "$by RECORDED A MAGNITUDE {$q['mag']} EARTHQUAKE ABOUT $km KM FROM IMUS (" . strtoupper($q['place']) . '). '
                    . 'CHECK YOUR HOME FOR CRACKS AND GAS LEAKS, STAY AWAY FROM DAMAGED STRUCTURES, AND EXPECT AFTERSHOCKS. '
                    . 'REPORT INJURIES OR DAMAGE TO THE BARANGAY.',
            ],
        ];
    }

    foreach (($live['rainfall'] ?? []) as $d) {
        if ($d['mm'] === null || $d['mm'] < 50) continue;
        $heavy = $d['mm'] >= 100;
        $date = (new DateTime($d['date']))->format('M j');
        $out[] = [
            'source' => 'weather', 'kind' => 'rainfall', 'hazard_key' => 'rain:' . $d['date'], 'severity_key' => $heavy ? 'rain100' : 'rain50',
            'alert_level' => $heavy ? 'Watch' : 'Advisory',
            'headline' => "About {$d['mm']} mm of rain forecast on $date (model forecast)",
            'details' => 'Open-Meteo model forecast, not a PAGASA warning. Check PAGASA rainfall advisories before publishing.',
            'official_url' => 'https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd',
            'draft' => [
                'title' => 'HEAVY RAINFALL EXPECTED ON ' . strtoupper($date),
                'alert_level' => $heavy ? 'Watch' : 'Advisory',
                'calamity_type' => 'HEAVY RAINFALL / FLOODING',
                'affected_areas' => 'LOW-LYING AND FLOOD-PRONE AREAS OF BARANGAY PASONG BUAYA II',
                'instructions' => 'HEAVY RAIN IS FORECAST. AVOID WADING IN FLOODWATER, KEEP DRAINAGE CLEAR, MOVE VALUABLES TO HIGHER GROUND, '
                    . 'AND BE READY TO EVACUATE IF THE BARANGAY ADVISES IT.',
            ],
        ];
    }
    return $out;
}

/**
 * Record new serious readings. Draft mode leaves them for staff; auto mode
 * publishes an advisory (or raises the level of the one already published for
 * the same storm). Model rainfall is never published automatically.
 */
function pb2_haz_detect(mysqli $conn, array $live): void
{
    $mode = pb2_haz_mode($conn);
    if ($mode === 'off') return;

    foreach (pb2_haz_candidates($live) as $c) {
        // The same quake can appear under PHIVOLCS and USGS times a minute apart.
        if ($c['kind'] === 'earthquake') {
            $dup = $conn->prepare("SELECT COUNT(*) FROM hazard_events WHERE kind = 'earthquake' AND detected_at >= NOW() - INTERVAL 3 HOUR AND hazard_key <> ?");
            $dup->bind_param('s', $c['hazard_key']);
            $dup->execute();
            $recent = (int)$dup->get_result()->fetch_row()[0];
            $dup->close();
            if ($recent > 0) continue;
        }

        $draft = json_encode($c['draft'], JSON_UNESCAPED_UNICODE);
        $ins = $conn->prepare("INSERT IGNORE INTO hazard_events
            (source, hazard_key, severity_key, kind, alert_level, headline, details, draft, official_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $ins->bind_param('sssssssss', $c['source'], $c['hazard_key'], $c['severity_key'], $c['kind'], $c['alert_level'],
            $c['headline'], $c['details'], $draft, $c['official_url']);
        $ins->execute();
        $eventId = $ins->insert_id;
        $isNew = $ins->affected_rows === 1;
        $ins->close();
        if (!$isNew) continue;

        if ($mode === 'auto' && $c['kind'] !== 'rainfall') {
            $alertId = pb2_haz_publish($conn, $c);
            if ($alertId) {
                $up = $conn->prepare("UPDATE hazard_events SET status = 'published', alert_id = ?, handled_at = NOW() WHERE id = ?");
                $up->bind_param('ii', $alertId, $eventId);
                $up->execute();
                $up->close();
            }
        }
    }
}

/** Publish (or escalate) the advisory for a detected hazard. Returns the alert id. */
function pb2_haz_publish(mysqli $conn, array $c): ?int
{
    $d = array_map('pb2_caps', $c['draft']);
    $d['alert_level'] = $c['draft']['alert_level'];
    $system = ['admin_id' => null, 'username' => 'system (hazard feed)', 'role' => 'Admin'];

    // Same storm already announced automatically: update it instead of stacking advisories.
    $find = $conn->prepare("SELECT id FROM disaster_alerts WHERE source_ref = ? AND is_active = 1 ORDER BY id DESC LIMIT 1");
    $find->bind_param('s', $c['hazard_key']);
    $find->execute();
    $existing = $find->get_result()->fetch_row()[0] ?? null;
    $find->close();

    if ($existing) {
        $st = $conn->prepare("UPDATE disaster_alerts SET title = ?, alert_level = ?, calamity_type = ?, affected_areas = ?, instructions = ? WHERE id = ?");
        $st->bind_param('sssssi', $d['title'], $d['alert_level'], $d['calamity_type'], $d['affected_areas'], $d['instructions'], $existing);
        $ok = $st->execute();
        $st->close();
        if ($ok) {
            pb2_log_admin_action('disaster.alert.auto_update', 'disaster_alert', (string)$existing,
                "Hazard feed raised advisory #$existing to {$d['alert_level']}: {$c['headline']}", null, 'success', $system);
            pb2_advisory_sms_auto($conn, (int)$existing, $system); // texts the raised level, if advisory SMS is automatic
        }
        return $ok ? (int)$existing : null;
    }

    $st = $conn->prepare("INSERT INTO disaster_alerts
        (title, alert_level, calamity_type, affected_areas, evacuation_schedule, instructions, is_active, source, source_ref, auto_generated)
        VALUES (?, ?, ?, ?, '', ?, 1, ?, ?, 1)");
    $st->bind_param('sssssss', $d['title'], $d['alert_level'], $d['calamity_type'], $d['affected_areas'], $d['instructions'], $c['source'], $c['hazard_key']);
    $ok = $st->execute();
    $id = $ok ? (int)$st->insert_id : null;
    $st->close();
    if ($id) {
        pb2_log_admin_action('disaster.alert.auto_publish', 'disaster_alert', (string)$id,
            "Hazard feed published advisory ({$d['alert_level']}): {$c['headline']}", null, 'success', $system);
        pb2_advisory_sms_auto($conn, $id, $system); // only if advisory SMS is automatic
    }
    return $id;
}

/** Events waiting for staff (draft mode), newest first. */
function pb2_haz_pending_events(mysqli $conn, int $limit = 10): array
{
    $rows = [];
    try {
        $st = $conn->prepare("SELECT id, source, kind, alert_level, headline, details, draft, official_url, detected_at
                              FROM hazard_events WHERE status = 'new' AND detected_at >= NOW() - INTERVAL 3 DAY
                              ORDER BY detected_at DESC LIMIT ?");
        $st->bind_param('i', $limit);
        $st->execute();
        $res = $st->get_result();
        while ($r = $res->fetch_assoc()) {
            $r['draft'] = json_decode($r['draft'] ?? 'null', true);
            $rows[] = $r;
        }
        $st->close();
    } catch (Throwable $e) { /* table missing */ }
    return $rows;
}
