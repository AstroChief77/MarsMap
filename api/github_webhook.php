<?php
/**
 * @file github_webhook.php
 * @description GitHub push olaylarini HMAC-SHA256 imza kontrolu ile dogrulayip
 * mars.kubitron.com sunucusunda web guncellemesini (/usr/local/bin/mars-web-sync) anlik tetikler.
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method Not Allowed']);
    exit;
}

// 1. Webhook sirrini web kok dizini disindan oku (asla repoda saklanmaz)
$secret = getenv('MARS_WEBHOOK_SECRET') ?: '';
$secretFile = '/etc/mars-autodeploy/webhook.secret';
if ($secret === '' && is_readable($secretFile)) {
    $secret = trim((string)file_get_contents($secretFile));
}

if ($secret === '') {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Webhook secret sunucuda tanimlanmamis']);
    exit;
}

// 2. X-Hub-Signature-256 sabit zamanli (hash_equals) imza dogrulamasi
$rawBody = file_get_contents('php://input');
$sigHeader = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
$expectedSig = 'sha256=' . hash_hmac('sha256', (string)$rawBody, $secret);

if ($sigHeader === '' || !hash_equals($expectedSig, $sigHeader)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Gecersiz GitHub imzasi']);
    exit;
}

$event = $_SERVER['HTTP_X_GITHUB_EVENT'] ?? 'push';
if ($event === 'ping') {
    echo json_encode(['ok' => true, 'status' => 'pong']);
    exit;
}

$payload = json_decode((string)$rawBody, true);
if (!is_array($payload) || ($payload['ref'] ?? '') !== 'refs/heads/main') {
    echo json_encode(['ok' => true, 'skipped' => true, 'reason' => 'Sadece main dali dagitilir']);
    exit;
}

// 3. Yalnizca web dosyalari etkilendiyse senkronizasyon baslat
$webPrefixes = ['index.html', 'version.json', 'SOURCES.md', 'BACKEND_API.md', 'api/', 'chat/', 'css/', 'js/', 'data/', 'res/'];
$hasWebChange = false;
$commits = $payload['commits'] ?? [];
if (empty($commits)) {
    $hasWebChange = true; // GitHub Actions manuel webhook tetigi
} else {
    foreach ($commits as $c) {
        $touched = array_merge($c['added'] ?? [], $c['modified'] ?? [], $c['removed'] ?? []);
        foreach ($touched as $f) {
            foreach ($webPrefixes as $pref) {
                if (strpos($f, $pref) === 0) {
                    $hasWebChange = true;
                    break 3;
                }
            }
        }
    }
}

if (!$hasWebChange) {
    echo json_encode(['ok' => true, 'skipped' => true, 'reason' => 'Web dosyasi degisikligi yok']);
    exit;
}

// 4. Arka planda mars-web-sync calistir (HTTP istegini bekletme)
if (is_executable('/usr/local/bin/mars-web-sync')) {
    @exec('nohup sudo -n /usr/local/bin/mars-web-sync >/dev/null 2>&1 &');
    echo json_encode(['ok' => true, 'triggered' => true, 'target' => 'mars.kubitron.com']);
    exit;
}

http_response_code(500);
echo json_encode(['ok' => false, 'error' => '/usr/local/bin/mars-web-sync kurulu degil']);

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-16: JSDoc, guvenlik basliklari ve POST metod zorunlulugu.
   - Satir 18-39: Web koku disindaki webhook.secret okuma ve HMAC-SHA256 imza dogrulamasi.
   - Satir 41-72: Sadece main dalindaki web dosyalarini (css/js/api/chat/data) filtreleme.
   - Satir 74-83: Arka planda sudo mars-web-sync betigini kilitlemeden tetikleme.
   ========================================================================== */
