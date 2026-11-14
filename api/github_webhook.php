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

// 2. Boyut sinirli (64 KB) govde okuma ve X-Hub-Signature-256 sabit zamanli (hash_equals) imza dogrulamasi
$maxPayloadBytes = 65536;
$contentLen = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
if ($contentLen > $maxPayloadBytes) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'Payload Too Large']);
    exit;
}

$stdin = fopen('php://input', 'rb');
$rawBody = $stdin ? stream_get_contents($stdin, $maxPayloadBytes + 1) : '';
if ($stdin) {
    fclose($stdin);
}
if (!is_string($rawBody) || strlen($rawBody) > $maxPayloadBytes) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'Payload Too Large']);
    exit;
}

$sigHeader = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
$expectedSig = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);

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

$payload = json_decode($rawBody, true);
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
                if (strpos((string)$f, $pref) === 0) {
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

// 4. Arka planda mars-web-sync calistir (HTTP istegini bekletme ve ic dosya yolunu sizdirma)
$syncBin = '/usr/local/bin/mars-web-sync';
if (is_executable($syncBin)) {
    $cmdOut = [];
    $exitCode = 1;
    @exec('nohup sudo -n /usr/local/bin/mars-web-sync >/dev/null 2>&1 &', $cmdOut, $exitCode);
    if ($exitCode === 0) {
        echo json_encode(['ok' => true, 'triggered' => true, 'target' => 'mars.kubitron.com']);
        exit;
    }
}

http_response_code(500);
echo json_encode(['ok' => false, 'error' => 'Dagitim servisi tetiklenemedi']);

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-16: JSDoc, guvenlik basliklari ve POST metod zorunlulugu.
   - Satir 18-56: Web koku disindaki webhook.secret okuma, 64 KB govde siniri ve HMAC-SHA256 imza dogrulamasi.
   - Satir 58-95: Sadece main dalindaki web dosyalarini (css/js/api/chat/data) filtreleme.
   - Satir 97-110: Arka planda mars-web-sync betigini tetikleme ve ic sunucu yollarini gizleme.
   ========================================================================== */
