<?php
/**
 * Community Issue Map text screening (migration 048), run on every comment and
 * landmark before it is saved (issue_map.php).
 *
 *   pb2_issue_screen($conn, $text) -> ['blocked' => ?string, 'hold' => ?string]
 *
 *  - blocked: a message for the resident; the post is refused until they edit
 *    it. Phone numbers, email addresses and offensive words (English and
 *    Filipino) are clear cases.
 *  - hold: a note for staff; the post is saved but waits for a staff check
 *    before it appears, because it may name a person ("si/ni/kay <name>",
 *    "Mr./Kap./Aling <name>", or a registered resident's first name or surname).
 *    Possible names are uncertain, so they are never refused outright.
 *
 * Matching ignores case, accents (Ñ = N) and simple letter swaps (0 = o,
 * 1 = i, 3 = e, 4 = a, @ = a, $ = s), and stretched letters ("gagooo").
 * Edit the word lists below; keep them lowercase and without accents.
 */

// Matched as whole words, after normalising.
const PB2_SCREEN_OFFENSIVE_WORDS = [
    // Filipino
    'puta', 'putang', 'tangina', 'tanginamo', 'putangina', 'putanginamo', 'gago', 'gaga', 'gagu', 'tarantado', 'tarantada',
    'ulol', 'ulul', 'bobo', 'boba', 'tanga', 'inutil', 'punyeta', 'pakshet', 'pakyu', 'kupal', 'hindot',
    'kantot', 'kantutan', 'tite', 'titi', 'puke', 'pokpok', 'burat', 'bayag', 'siraulo', 'engot', 'hinayupak',
    'demonyo', 'walanghiya', 'malandi',
    // English
    'fuck', 'fucking', 'fucker', 'fucked', 'motherfucker', 'shit', 'bullshit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy',
    'cunt', 'whore', 'slut', 'retard', 'retarded', 'idiot', 'moron', 'stupid', 'dumbass', 'jackass', 'scumbag',
];
// Matched anywhere inside a word (unambiguous roots: "putanginamoka", "fuckin").
const PB2_SCREEN_OFFENSIVE_ROOTS = ['putangina', 'tangina', 'fuck', 'motherfuck', 'pakyu', 'punyeta'];

// Words after "si/ni/kay" or a title that are not names.
const PB2_SCREEN_NOT_NAMES = [
    'ang', 'mga', 'ito', 'iyan', 'iyon', 'yan', 'yon', 'yun', 'yung', 'kaya', 'ako', 'ikaw', 'siya', 'sila', 'kami', 'tayo',
    'kayo', 'nila', 'nyo', 'ninyo', 'namin', 'natin', 'atin', 'amin', 'akin', 'iyo', 'kanila', 'kaniya', 'kanya', 'lahat',
    'dami', 'laki', 'liit', 'ganda', 'bilis', 'tagal', 'sama', 'baho', 'dumi', 'init', 'lamig', 'hirap', 'gulo', 'ingay',
    'barangay', 'brgy', 'kapitan', 'kagawad', 'tanod', 'staff', 'admin', 'meralco', 'maynilad', 'city', 'hall', 'pulis',
    'the', 'and', 'for', 'was', 'not', 'are', 'all', 'this', 'that', 'there', 'here', 'from', 'with',
];

// Resident names that are also everyday words, never matched on their own.
const PB2_SCREEN_COMMON_WORDS = [
    'dela', 'delos', 'della', 'san', 'santa', 'sta', 'sto', 'santo', 'jose', 'maria', 'mary', 'jesus', 'cruz',
    'mark', 'will', 'bill', 'grace', 'hope', 'faith', 'rose', 'june', 'april', 'dawn', 'rich', 'king', 'love', 'joy',
    'luna', 'flores', 'rosas', 'lugar', 'bago', 'mabuti', 'buhay', 'tubig', 'ilaw', 'daan', 'kalye', 'kanto', 'basura',
    'baha', 'poste', 'kuryente', 'street', 'road', 'avenue', 'phase', 'block', 'village', 'homes', 'subdivision',
    'imus', 'cavite', 'pasong', 'buaya', 'ardia', 'vermosa', 'gardenia', 'malagasang', 'anabu', 'palico', 'bayan',
    'gabi', 'umaga', 'hapon', 'linggo', 'lunes', 'martes', 'sabado', 'tanghali', 'ngayon', 'kahapon', 'bukas',
];

/** Lowercase, accents off, simple letter swaps, punctuation to spaces. */
function pb2_screen_normalise(string $text): string
{
    $t = mb_strtolower($text, 'UTF-8');
    $t = strtr($t, ['ñ' => 'n', 'á' => 'a', 'à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
                    'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'ö' => 'o',
                    'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u']);
    $t = strtr($t, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '@' => 'a', '$' => 's', '!' => 'i']);
    $t = preg_replace('/[^a-z]+/', ' ', $t);
    return trim(preg_replace('/\s+/', ' ', $t));
}

/** "gagooo" -> "gago" (runs of one letter cut to one). */
function pb2_screen_squeeze(string $word): string
{
    return preg_replace('/(.)\1+/', '$1', $word);
}

function pb2_screen(mysqli $conn, string $text): array
{
    $out = ['blocked' => null, 'hold' => null];
    if (trim($text) === '') return $out;

    // ---- clear cases: refused
    if (preg_match('/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i', $text)) {
        $out['blocked'] = 'Please remove the email address. Contact details can\'t be posted on the Issue Map, to protect everyone\'s privacy.';
        return $out;
    }
    $phone = '/(?:\+?63|\b0)\s*9\d{2}[\s.\-]*\d{3}[\s.\-]*\d{4}\b'      // mobile: 0917 123 4567, +63 917...
           . '|\(?\b0?\d{2,3}\)?[\s.\-]*\d{3}[\s.\-]\d{4}\b'             // landline: (046) 502-4058
           . '|\b\d{10,13}\b/';                                         // any long number
    if (preg_match($phone, $text)) {
        $out['blocked'] = 'Please remove the phone number. Contact details can\'t be posted on the Issue Map, to protect everyone\'s privacy.';
        return $out;
    }
    $norm = pb2_screen_normalise($text);
    $words = $norm === '' ? [] : explode(' ', $norm);
    $bad = array_flip(PB2_SCREEN_OFFENSIVE_WORDS);
    foreach ($words as $w) {
        $sq = pb2_screen_squeeze($w);
        $hit = isset($bad[$w]) || isset($bad[$sq]);
        if (!$hit) {
            foreach (PB2_SCREEN_OFFENSIVE_ROOTS as $root) {
                if (strpos($w, $root) !== false || strpos($sq, $root) !== false) { $hit = true; break; }
            }
        }
        if ($hit) {
            $out['blocked'] = 'Please remove offensive words and describe the problem, not people. Posts with insults or swearing can\'t be published.';
            return $out;
        }
    }
    // "putang ina" / "tang ina" written apart, or letters masked ("f*ck", "g@g0", "sh#t").
    if (preg_match('/\b(putang|tang) ina\b/', $norm)
        || preg_match('/\b(f[\*#\.]+c?k|f[u\*#]+[c\*#]+k|sh[\*#\.]+t|b[\*#\.]+tch|p[\*#\.]+ta|g[\*#\.]+go|put[\*#\.]+ng|t[\*#\.]+ngina)/i', $text)) {
        $out['blocked'] = 'Please remove offensive words and describe the problem, not people. Posts with insults or swearing can\'t be published.';
        return $out;
    }

    // ---- uncertain: may name a person, held for staff
    $notNames = array_flip(PB2_SCREEN_NOT_NAMES);
    $reasons = [];
    if (preg_match_all('/\b(si|ni|kay|sina|nina|kina)\s+([a-z]{3,})/', $norm, $m, PREG_SET_ORDER)) {
        foreach ($m as $hit) {
            if (!isset($notNames[$hit[2]])) { $reasons[] = "\"{$hit[1]} {$hit[2]}\""; break; }
        }
    }
    if (preg_match_all('/\b(mr|mrs|ms|miss|kap|kgd|konsehal|aling|mang|tita|tito|kuya|ate|sir|madam|maam|doc|engr|atty)\s+([a-z]{3,})/', $norm, $m, PREG_SET_ORDER)) {
        foreach ($m as $hit) {
            if (!isset($notNames[$hit[2]])) { $reasons[] = "\"{$hit[1]} {$hit[2]}\""; break; }
        }
    }
    $name = pb2_screen_resident_name($conn, $norm, $words);
    if ($name) $reasons[] = "the name \"$name\"";
    if ($reasons) {
        $out['hold'] = 'May name a person: ' . implode(', ', $reasons) . '.';
    }
    return $out;
}

/**
 * A registered resident's surname (or first name) found in the text, or null.
 * Names of 4+ letters only, minus everyday words and street / subdivision names.
 */
function pb2_screen_resident_name(mysqli $conn, string $norm, array $words): ?string
{
    static $names = null;
    if ($names === null) {
        $names = ['single' => [], 'phrase' => []];
        $skip = array_flip(PB2_SCREEN_COMMON_WORDS);
        try {
            // Street and subdivision names are places, not people.
            foreach (['address_streets', 'address_subdivisions'] as $t) {
                $res = $conn->query("SELECT name FROM $t");
                if ($res) foreach ($res->fetch_all() as $row) {
                    foreach (explode(' ', pb2_screen_normalise((string)$row[0])) as $w) if ($w !== '') $skip[$w] = true;
                }
            }
            $res = $conn->query("SELECT DISTINCT fName, lName FROM residents");
            if ($res) foreach ($res->fetch_all() as [$f, $l]) {
                $last = pb2_screen_normalise((string)$l);
                if (strpos($last, ' ') !== false) {
                    $names['phrase'][$last] = true;                       // "dela cruz"
                } elseif (strlen($last) >= 4 && !isset($skip[$last])) {
                    $names['single'][$last] = true;
                }
                $first = explode(' ', pb2_screen_normalise((string)$f))[0] ?? '';
                if (strlen($first) >= 4 && !isset($skip[$first])) $names['single'][$first] = true;
            }
        } catch (Throwable $e) {
            error_log('issue screen names: ' . $e->getMessage());
        }
    }
    foreach ($words as $w) {
        if (isset($names['single'][$w])) return strtoupper($w);
    }
    $padded = " $norm ";
    foreach ($names['phrase'] as $p => $_) {
        if (strpos($padded, " $p ") !== false) return strtoupper($p);
    }
    return null;
}
