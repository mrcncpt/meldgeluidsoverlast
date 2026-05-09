<?php
/**
 * MeldGeluidsoverlast — privé admin dashboard.
 *
 * Toegang: https://meldgeluidsoverlast.nl/admin.php?key=ADMIN_KEY
 * (Verander ADMIN_KEY hieronder als je 'm wilt rouleren.)
 */

// === Auth ===
$ADMIN_KEY = 'Y4QcHIrm2efabQKU4m8YPl4veMZgzjCP';

if (!isset($_GET['key']) || !hash_equals($ADMIN_KEY, $_GET['key'])) {
    http_response_code(403);
    header('Content-Type: text/html; charset=utf-8');
    echo '<h1>403 Forbidden</h1>';
    exit;
}

// === Load all daily files ===
$STORAGE_DIR = __DIR__ . '/private';
$files = is_dir($STORAGE_DIR) ? glob($STORAGE_DIR . '/stats-*.json') : [];
sort($files);
$days = [];
foreach ($files as $f) {
    $d = json_decode(@file_get_contents($f), true);
    if (is_array($d) && isset($d['date'])) {
        $days[$d['date']] = $d;
    }
}
ksort($days);

// === Aggregeer totals ===
$totalVisitors = 0;
$totalPageviews = 0;
$totalMeldingen = 0;
$pageTotals = [];
$eventTotals = [];
$referrerTotals = [];

foreach ($days as $date => $d) {
    $totalVisitors += $d['visitor_count'] ?? 0;
    foreach (($d['pageviews'] ?? []) as $page => $count) {
        $totalPageviews += $count;
        $pageTotals[$page] = ($pageTotals[$page] ?? 0) + $count;
    }
    foreach (($d['events'] ?? []) as $event => $types) {
        foreach ($types as $type => $count) {
            $key = $event . ($type !== '_total' ? '/' . $type : '');
            $eventTotals[$key] = ($eventTotals[$key] ?? 0) + $count;
            if ($event === 'melding') $totalMeldingen += $count;
        }
    }
    foreach (($d['referrers'] ?? []) as $host => $count) {
        $referrerTotals[$host] = ($referrerTotals[$host] ?? 0) + $count;
    }
}

arsort($pageTotals);
arsort($eventTotals);
arsort($referrerTotals);

// === Last-30-days array (incl. zero-days) ===
$today = gmdate('Y-m-d');
$last30 = [];
for ($i = 29; $i >= 0; $i--) {
    $d = gmdate('Y-m-d', strtotime("-$i day"));
    $last30[$d] = $days[$d] ?? null;
}

$todayData = $days[$today] ?? null;
$yesterdayData = $days[gmdate('Y-m-d', strtotime('-1 day'))] ?? null;
$last7Visitors = 0;
$last7Pageviews = 0;
foreach ($last30 as $d => $data) {
    if (strtotime($d) >= strtotime('-6 day') && $data) {
        $last7Visitors += $data['visitor_count'] ?? 0;
        foreach (($data['pageviews'] ?? []) as $count) $last7Pageviews += $count;
    }
}

// Bar chart max for last 30 days
$max30 = 1;
foreach ($last30 as $d) {
    if ($d) $max30 = max($max30, $d['visitor_count'] ?? 0);
}

?>
<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Admin — MeldGeluidsoverlast</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#0a0e1a;color:#e8eef9;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;min-height:100vh}
  .wrap{max-width:880px;margin:0 auto;padding:24px 18px 60px}
  h1{margin:0 0 4px;color:#ffb800;font-size:22px}
  .sub{color:#9aa6bd;margin:0 0 24px;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:20px}
  .card{background:#161d2f;border:1px solid #243150;border-radius:14px;padding:14px 16px}
  .card h3{margin:0 0 12px;font-size:12px;color:#9aa6bd;text-transform:uppercase;letter-spacing:0.05em;font-weight:700}
  .card.metric{text-align:center}
  .card.metric .num{font-size:32px;font-weight:800;color:#ffb800;line-height:1}
  .card.metric .lbl{margin-top:6px;font-size:11px;color:#9aa6bd;text-transform:uppercase;letter-spacing:0.05em}
  table{width:100%;border-collapse:collapse;font-size:13px}
  table td{padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
  table td.path{color:#cfd8ec;font-family:ui-monospace,monospace;font-size:12px}
  table td.count{text-align:right;color:#ffb800;font-weight:700;width:60px}
  table td .bar{display:inline-block;height:6px;background:linear-gradient(90deg,#ffb800,#f59e0b);border-radius:3px;vertical-align:middle;margin-right:8px;min-width:1px}
  .days-chart{display:flex;align-items:flex-end;gap:3px;height:120px;padding:4px 0;margin-bottom:8px}
  .day-bar{flex:1;background:linear-gradient(180deg,#ffb800,#f59e0b);border-radius:2px 2px 0 0;min-height:2px;cursor:pointer;opacity:0.85;transition:opacity 0.15s}
  .day-bar:hover{opacity:1}
  .day-bar.zero{background:rgba(255,255,255,0.04)}
  .day-bar:hover::after{content:attr(data-tip);display:block}
  .axis{display:flex;justify-content:space-between;font-size:10px;color:#5d6680;margin-top:4px}
  details{background:#161d2f;border:1px solid #243150;border-radius:14px;padding:14px 16px;margin-top:14px}
  details summary{cursor:pointer;font-weight:700;color:#ffb800;font-size:13px}
  details pre{font-size:11px;background:#0a0e1a;border:1px solid #243150;border-radius:8px;padding:10px;overflow:auto;margin-top:10px;color:#9aa6bd}
  .footer{margin-top:30px;text-align:center;color:#5d6680;font-size:11px}
  .footer a{color:#9aa6bd}
  .empty{color:#5d6680;font-style:italic;font-size:13px;padding:8px 0}
</style>
</head>
<body>
<div class="wrap">
  <h1>📊 MeldGeluidsoverlast — Admin</h1>
  <p class="sub">Privé dashboard. Niet zoekbaar (noindex). Sluit dit tabblad als je klaar bent.</p>

  <!-- Quick metrics -->
  <div class="grid">
    <div class="card metric">
      <div class="num"><?= $todayData['visitor_count'] ?? 0 ?></div>
      <div class="lbl">Vandaag (bezoekers)</div>
    </div>
    <div class="card metric">
      <div class="num"><?= $yesterdayData['visitor_count'] ?? 0 ?></div>
      <div class="lbl">Gisteren</div>
    </div>
    <div class="card metric">
      <div class="num"><?= $last7Visitors ?></div>
      <div class="lbl">Laatste 7 dagen</div>
    </div>
    <div class="card metric">
      <div class="num"><?= $totalVisitors ?></div>
      <div class="lbl">Totaal (alle dagen)</div>
    </div>
    <div class="card metric">
      <div class="num"><?= $totalPageviews ?></div>
      <div class="lbl">Pageviews totaal</div>
    </div>
    <div class="card metric">
      <div class="num"><?= $totalMeldingen ?></div>
      <div class="lbl">Meldingen verstuurd</div>
    </div>
  </div>

  <!-- Last 30 days bar chart -->
  <div class="card">
    <h3>Laatste 30 dagen — bezoekers per dag</h3>
    <?php if ($totalVisitors === 0): ?>
      <div class="empty">Nog geen data — wacht tot eerste bezoekers het tracking-script laden.</div>
    <?php else: ?>
      <div class="days-chart">
        <?php foreach ($last30 as $d => $data):
          $count = $data['visitor_count'] ?? 0;
          $h = $count > 0 ? max(2, ($count / $max30) * 100) : 2;
          $cls = $count === 0 ? ' zero' : '';
        ?>
          <div class="day-bar<?= $cls ?>" style="height:<?= $h ?>%" title="<?= $d ?>: <?= $count ?> bezoekers"></div>
        <?php endforeach; ?>
      </div>
      <div class="axis">
        <span>30d geleden</span>
        <span>15d</span>
        <span>vandaag</span>
      </div>
    <?php endif; ?>
  </div>

  <!-- Top pages -->
  <div class="card" style="margin-top:14px">
    <h3>Populairste pagina's (totaal)</h3>
    <?php if (empty($pageTotals)): ?>
      <div class="empty">Geen data.</div>
    <?php else:
      $maxPage = max(array_values($pageTotals)); ?>
      <table>
        <?php foreach (array_slice($pageTotals, 0, 15) as $page => $count): ?>
          <tr>
            <td class="path">
              <span class="bar" style="width:<?= max(2, ($count / $maxPage) * 200) ?>px"></span>
              <?= htmlspecialchars($page) ?>
            </td>
            <td class="count"><?= $count ?></td>
          </tr>
        <?php endforeach; ?>
      </table>
    <?php endif; ?>
  </div>

  <!-- Events / Meldingen per type -->
  <?php if (!empty($eventTotals)): ?>
  <div class="card" style="margin-top:14px">
    <h3>Events (incl. type-meldingen)</h3>
    <table>
      <?php foreach ($eventTotals as $key => $count): ?>
        <tr>
          <td class="path"><?= htmlspecialchars($key) ?></td>
          <td class="count"><?= $count ?></td>
        </tr>
      <?php endforeach; ?>
    </table>
  </div>
  <?php endif; ?>

  <!-- Referrers -->
  <?php if (!empty($referrerTotals)): ?>
  <div class="card" style="margin-top:14px">
    <h3>Top verwijzers (waar komen mensen vandaan)</h3>
    <table>
      <?php foreach (array_slice($referrerTotals, 0, 15) as $host => $count): ?>
        <tr>
          <td class="path"><?= htmlspecialchars($host) ?></td>
          <td class="count"><?= $count ?></td>
        </tr>
      <?php endforeach; ?>
    </table>
  </div>
  <?php endif; ?>

  <!-- Per-day expansion -->
  <details>
    <summary>Ruwe data per dag (<?= count($days) ?> dag<?= count($days) === 1 ? '' : 'en' ?>)</summary>
    <pre><?= htmlspecialchars(json_encode($days, JSON_PRETTY_PRINT)) ?></pre>
  </details>

  <p class="footer">
    Privacy: geen IPs opgeslagen, alleen daily-rotating SHA256-hash (niet reversible).<br>
    <a href="?key=<?= htmlspecialchars($ADMIN_KEY) ?>">Vernieuwen</a>
    &middot;
    <a href="https://meldgeluidsoverlast.nl/">site</a>
  </p>
</div>
</body>
</html>
