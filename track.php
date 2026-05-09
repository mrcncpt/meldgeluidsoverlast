<?php
/**
 * MeldGeluidsoverlast — anonieme tracker.
 *
 * Privacy-by-design:
 *   - Geen IPs ooit opgeslagen
 *   - Visitor-ID = SHA-256(IP + datum + secret) — verandert dagelijks, niet reversible
 *   - Geen cookies, geen fingerprinting, geen 3rd-party
 *   - Alle data blijft op deze server in private/ folder
 *
 * Aanroepen: /api/track?p=PAGE_PATH (page view)
 *            /api/track?e=EVENT_NAME&t=TYPE (event, bv. e=melding&t=binnen)
 */

// CORS — alleen voor onze eigen domain
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowed = ['https://meldgeluidsoverlast.nl', 'https://www.meldgeluidsoverlast.nl'];
if (in_array($origin, $allowed)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// === Configuratie ===
// Geheime hashing-salt — verander dit als je hashing-stream wilt resetten
$HASH_SECRET = 'qWsyGmEAfavvsE_0t4_RZxbsa-AN7SCJQBFbBHhe6Ak';

// Storage directory (buiten public_html zou beter zijn, maar shared hosting biedt dat niet altijd)
$STORAGE_DIR = __DIR__ . '/private';

// === Storage init ===
if (!is_dir($STORAGE_DIR)) {
    @mkdir($STORAGE_DIR, 0755, true);
}

// Bot-filter: ignore obvious crawlers
$ua = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
if (preg_match('/bot|crawler|spider|scraper|curl|wget|python|go-http|java|httpclient/i', $ua)) {
    echo json_encode(['ok' => true, 'skipped' => 'bot']);
    exit;
}

// === Inputs ===
$page = isset($_GET['p']) ? substr(preg_replace('#[^a-zA-Z0-9._/-]#', '', $_GET['p']), 0, 100) : '';
$event = isset($_GET['e']) ? substr(preg_replace('#[^a-z_]#', '', $_GET['e']), 0, 30) : '';
$type = isset($_GET['t']) ? substr(preg_replace('#[^a-z]#', '', $_GET['t']), 0, 20) : '';
$ref = isset($_GET['r']) ? substr(preg_replace('#[^a-zA-Z0-9.\-_:/]#', '', $_GET['r']), 0, 100) : '';

// === Anonimiseer bezoeker ===
$ip = '';
foreach (['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $key) {
    if (!empty($_SERVER[$key])) {
        $ip = trim(explode(',', $_SERVER[$key])[0]);
        break;
    }
}
$today = gmdate('Y-m-d');
$visitorHash = hash('sha256', $ip . $today . $HASH_SECRET);
unset($ip); // geen IP meer in geheugen

// === Storage filename ===
$file = $STORAGE_DIR . '/stats-' . $today . '.json';

// === Lock + read + write (atomic) ===
$fp = @fopen($file, 'c+');
if (!$fp) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'storage_unavailable']);
    exit;
}
flock($fp, LOCK_EX);
$content = stream_get_contents($fp);
$data = $content ? json_decode($content, true) : null;
if (!is_array($data)) {
    $data = [
        'date' => $today,
        'pageviews' => [],
        'unique_visitors' => [],
        'visitor_count' => 0,
        'events' => [],
        'referrers' => []
    ];
}

// === Update counters ===
$isNewVisitor = !in_array($visitorHash, $data['unique_visitors']);
if ($isNewVisitor) {
    $data['unique_visitors'][] = $visitorHash;
    $data['visitor_count'] = count($data['unique_visitors']);
}

if ($page) {
    $key = $page;
    $data['pageviews'][$key] = isset($data['pageviews'][$key]) ? $data['pageviews'][$key] + 1 : 1;
}

if ($event) {
    if (!isset($data['events'][$event])) $data['events'][$event] = [];
    if ($type) {
        $data['events'][$event][$type] = isset($data['events'][$event][$type])
            ? $data['events'][$event][$type] + 1 : 1;
    } else {
        $data['events'][$event]['_total'] = isset($data['events'][$event]['_total'])
            ? $data['events'][$event]['_total'] + 1 : 1;
    }
}

if ($ref && $isNewVisitor) {
    // Vereenvoudig referer naar host
    $host = parse_url($ref, PHP_URL_HOST);
    if ($host) {
        $host = preg_replace('#^www\.#', '', $host);
        if ($host !== 'meldgeluidsoverlast.nl') { // skip self-referers
            $data['referrers'][$host] = isset($data['referrers'][$host])
                ? $data['referrers'][$host] + 1 : 1;
        }
    }
}

// === Write back ===
ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($data));
flock($fp, LOCK_UN);
fclose($fp);

echo json_encode(['ok' => true]);
