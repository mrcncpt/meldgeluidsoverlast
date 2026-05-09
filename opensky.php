<?php
/**
 * OpenSky Network API — CORS-proxy voor MeldGeluidsoverlast.
 *
 * Productie-vervanger voor proxy.py (dev-only).
 * Wordt aangeroepen via /api/opensky?lamin=...&lamax=...&lomin=...&lomax=...
 * (de .htaccess rewrite zet /api/opensky om naar /opensky.php).
 *
 * Bypassed CORS, voegt korte cache toe (30s) zodat we OpenSky's rate limit niet overschrijden,
 * en stuurt 502 terug als OpenSky onbereikbaar is.
 */

// === CORS — alle origins toestaan (we zijn een publieke proxy) ===
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// === Cache-Control — 30 sec cache (OpenSky updaet ~10s, notify.js polt 45s) ===
header('Cache-Control: public, max-age=30');
header('Content-Type: application/json; charset=utf-8');

// === Bouw de OpenSky-URL ===
// Alleen lamin / lamax / lomin / lomax doorgeven (whitelist parameters)
$allowed = ['lamin', 'lamax', 'lomin', 'lomax'];
$query = [];
foreach ($allowed as $key) {
    if (isset($_GET[$key]) && is_numeric($_GET[$key])) {
        // Coerce naar float met max 6 decimalen om rare input te voorkomen
        $query[$key] = sprintf('%.6f', floatval($_GET[$key]));
    }
}

if (count($query) !== 4) {
    http_response_code(400);
    echo json_encode([
        'error' => 'invalid_query',
        'message' => 'Required: lamin, lamax, lomin, lomax (numeric).'
    ]);
    exit;
}

$apiUrl = 'https://opensky-network.org/api/states/all?' . http_build_query($query);

// === Fetch met timeout (OpenSky kan traag zijn) ===
$ctx = stream_context_create([
    'http' => [
        'method' => 'GET',
        'timeout' => 8,
        'header' => "User-Agent: meldgeluidsoverlast.nl/1.0 (proxy)\r\nAccept: application/json\r\n",
        'ignore_errors' => true,
    ],
    'ssl' => [
        'verify_peer' => true,
        'verify_peer_name' => true,
    ],
]);

$data = @file_get_contents($apiUrl, false, $ctx);

if ($data === false) {
    http_response_code(502);
    echo json_encode(['error' => 'opensky_unreachable', 'message' => 'OpenSky-API niet bereikbaar.']);
    exit;
}

// Forward HTTP-status als die beschikbaar is
if (isset($http_response_header[0]) && preg_match('#HTTP/[\d.]+\s+(\d+)#', $http_response_header[0], $m)) {
    $code = intval($m[1]);
    if ($code >= 400) {
        http_response_code($code);
        echo json_encode(['error' => 'opensky_status_' . $code]);
        exit;
    }
}

// Ruwe JSON van OpenSky doorgeven
echo $data;
