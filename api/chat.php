<?php
/**
 * @file chat.php
 * @description AstroChief Mars Görev İletişim & Dosya Aktarım Güvenli Backend API'si.
 * Gerçek zamanlı mesajlaşma, dosya yükleme, SQLite3 veri kalıcılığı ve katı siber güvenlik
 * kontrolleri (XSS, Rate Limiting, MIME denetimi, Path Traversal koruması) sağlar.
 */

// 1. Temel Başlıklar ve Güvenlik Ayarları
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');

// Hata raporlama: Canlı ortamda hassas sunucu ayrıntılarını gizle
ini_set('display_errors', '0');
error_reporting(E_ALL);

// Sabitler ve Dizinler
$baseDir = dirname(__DIR__);
$storageDir = $baseDir . DIRECTORY_SEPARATOR . 'storage';
$uploadDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads';

if (!is_dir($storageDir)) {
    @mkdir($storageDir, 0770, true);
}
if (!is_dir($uploadDir)) {
    @mkdir($uploadDir, 0775, true);
}

// Dizin güvenlik dosyaları (.htaccess ile doğrudan erişim ve betik çalıştırma engeli)
$storageHtaccess = $storageDir . DIRECTORY_SEPARATOR . '.htaccess';
if (!file_exists($storageHtaccess)) {
    @file_put_contents($storageHtaccess, "Order deny,allow\nDeny from all\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n");
}
$uploadHtaccess = $uploadDir . DIRECTORY_SEPARATOR . '.htaccess';
if (!file_exists($uploadHtaccess)) {
    @file_put_contents(
        $uploadHtaccess,
        "Options -ExecCGI -Indexes\nphp_flag engine off\nRemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .phar .pht .cgi .pl .py .sh\n<FilesMatch \"\\.(php\\d*|phtml|pht|phar|sh|py|pl|cgi|htaccess|svg|html|htm|js)$\">\n  Order deny,allow\n  Deny from all\n</FilesMatch>\n<IfModule mod_headers.c>\n  Header set X-Content-Type-Options \"nosniff\"\n</IfModule>\n"
    );
}

// 2. Güvenli SQLite3 Veritabanı Bağlantısı
$dbFile = $storageDir . DIRECTORY_SEPARATOR . 'chat.db';
try {
    $db = new PDO('sqlite:' . $dbFile);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $db->exec("PRAGMA busy_timeout = 3000");

    // Mesajlar Tablosu
    $db->exec("CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT NOT NULL,
        role TEXT NOT NULL,
        message TEXT,
        file_url TEXT,
        file_name TEXT,
        file_size INTEGER,
        file_type TEXT,
        ip TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // Hız Sınırı (Rate Limiting) Tablosu
    $db->exec("CREATE TABLE IF NOT EXISTS rate_limits (
        ip TEXT PRIMARY KEY,
        last_message_time INTEGER,
        upload_count INTEGER,
        upload_window_start INTEGER
    )");
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Veritabanı başlatılamadı']);
    exit;
}

// İstemci IP Adresi Belirleme (Sahte X-Forwarded-For başlığına karşı yalnızca yerel vekilden gelen başlığa güven)
$remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$clientIp = $remoteAddr;
if ($remoteAddr === '127.0.0.1' || $remoteAddr === '::1') {
    $forwarded = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($forwarded !== '') {
        $parts = explode(',', $forwarded);
        $candidate = trim($parts[0]);
        if (filter_var($candidate, FILTER_VALIDATE_IP)) {
            $clientIp = $candidate;
        }
    }
}

// 3. Eylemi Belirleme
$action = $_GET['action'] ?? ($_POST['action'] ?? 'get_messages');

// =========================================================================
// İŞLEM 1: MESAJLARI GETİR (get_messages)
// =========================================================================
if ($action === 'get_messages') {
    $sinceId = isset($_GET['since_id']) ? max(0, (int)$_GET['since_id']) : 0;
    $limit = isset($_GET['limit']) ? max(1, min((int)$_GET['limit'], 100)) : 50;

    try {
        if ($sinceId > 0) {
            $stmt = $db->prepare("SELECT id, user_name, role, message, file_url, file_name, file_size, file_type, created_at FROM messages WHERE id > :since ORDER BY id ASC LIMIT :limit");
            $stmt->bindValue(':since', $sinceId, PDO::PARAM_INT);
        } else {
            $stmt = $db->prepare("SELECT id, user_name, role, message, file_url, file_name, file_size, file_type, created_at FROM (SELECT * FROM messages ORDER BY id DESC LIMIT :limit) ORDER BY id ASC");
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $messages = $stmt->fetchAll();

        foreach ($messages as &$row) {
            $row['user_name'] = html_entity_decode((string)($row['user_name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $row['role'] = html_entity_decode((string)($row['role'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            if ($row['message'] !== null) {
                $row['message'] = html_entity_decode((string)$row['message'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            }
            if ($row['file_name'] !== null) {
                $row['file_name'] = html_entity_decode((string)$row['file_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            }
        }
        unset($row);

        echo json_encode([
            'success' => true,
            'messages' => $messages,
            'server_time' => date('Y-m-d H:i:s')
        ]);
        exit;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Mesajlar listelenemedi']);
        exit;
    }
}

// =========================================================================
// İŞLEM 2: YENİ MESAJ VE DOSYA GÖNDER (send_message)
// =========================================================================
if ($action === 'send_message') {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Mesaj gönderimi yalnızca POST metodu ile yapılabilir.']);
        exit;
    }

    $currentTime = time();

    // Rate Limiting (Atomik INSERT OR IGNORE + SELECT ile yarış durumu engellenir)
    $db->prepare("INSERT OR IGNORE INTO rate_limits (ip, last_message_time, upload_count, upload_window_start) VALUES (:ip, 0, 0, :now)")
       ->execute([':ip' => $clientIp, ':now' => $currentTime]);

    $stmtRate = $db->prepare("SELECT * FROM rate_limits WHERE ip = :ip");
    $stmtRate->execute([':ip' => $clientIp]);
    $rateRow = $stmtRate->fetch();

    $hasUpload = isset($_FILES['file']) && $_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE;
    if ($rateRow) {
        if (($currentTime - (int)$rateRow['last_message_time']) < 1) {
            http_response_code(429);
            echo json_encode(['success' => false, 'error' => 'Çok hızlı mesaj gönderiyorsunuz. Lütfen 1 saniye bekleyin.']);
            exit;
        }
        if ($hasUpload && ($currentTime - (int)$rateRow['upload_window_start']) <= 60 && (int)$rateRow['upload_count'] >= 15) {
            http_response_code(429);
            echo json_encode(['success' => false, 'error' => 'Dosya yükleme hız sınırına ulaşıldı (Maksimum 15 dosya/dakika).']);
            exit;
        }
    }

    // Girdi Temizleme (Kontrol karakterlerini arındır, textContent ile çift kaçışı önle)
    $cleanText = static function (string $val, int $maxLen): string {
        $cleaned = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', trim($val)) ?? '';
        return mb_strlen($cleaned) > $maxLen ? mb_substr($cleaned, 0, $maxLen) : $cleaned;
    };

    $safeUserName = $cleanText((string)($_POST['user_name'] ?? 'Astronot'), 40);
    if ($safeUserName === '') {
        $safeUserName = 'Astronot';
    }
    $safeRole = $cleanText((string)($_POST['role'] ?? 'Mürettebat'), 30);
    if ($safeRole === '') {
        $safeRole = 'Mürettebat';
    }
    $safeMessage = $cleanText((string)($_POST['message'] ?? ''), 2000);

    // Dosya İşleme Değişkenleri
    $fileUrl = null;
    $originalFileName = null;
    $fileSize = null;
    $fileType = null;

    // Dosya Yükleme Güvenlik Denetimleri
    if ($hasUpload) {
        $file = $_FILES['file'];

        if ($file['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Dosya yükleme hatası kodu: ' . (int)$file['error']]);
            exit;
        }

        // 1. Boyut Sınırı: Maksimum 15 MB (15 * 1024 * 1024 bayt)
        $maxBytes = 15 * 1024 * 1024;
        if ($file['size'] <= 0 || $file['size'] > $maxBytes) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Dosya boyutu geçersiz veya çok büyük (Maksimum 15 MB).']);
            exit;
        }

        // 2. Uzantı Beyaz Listesi (Whitelist)
        $rawOriginalName = basename((string)$file['name']);
        $pathParts = pathinfo($rawOriginalName);
        $extension = strtolower($pathParts['extension'] ?? '');

        $allowedExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'webp',
            'pdf', 'txt', 'log', 'json', 'geojson', 'csv', 'zip'
        ];

        if (!in_array($extension, $allowedExtensions, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Geçersiz dosya türü! Güvenlik nedeniyle yalnızca görsel, log, metin, PDF ve veri dosyaları (.json, .zip) yüklenebilir.']);
            exit;
        }

        // 3. Çift Uzantı ve Zararlı Ad Engelleme (.php3-.php8, .pht, .shtml, .inc, .htaccess, .svg, .html, .js dahil)
        if (preg_match('/\.(php\d*|phtml|pht|phar|sh|py|pl|cgi|exe|bat|cmd|vbs|msi|shtml|inc|htaccess|svg|html|htm|js|jsp|asp|aspx)(\.|\s|$)/i', $rawOriginalName) ||
            preg_match('/[\x00-\x1F\x7F\/\\\\]/', $rawOriginalName)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Şüpheli veya zararlı dosya adı tespit edildi.']);
            exit;
        }

        // 4. MIME Türü Doğrulaması (finfo ile gerçek dosya içeriği tespiti — application/octet-stream hariç)
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $detectedMime = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
        if ($finfo) {
            finfo_close($finfo);
        }

        $allowedMimes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'text/plain', 'application/json',
            'text/csv', 'application/csv', 'application/zip', 'application/x-zip-compressed'
        ];

        if ($detectedMime === false || !in_array($detectedMime, $allowedMimes, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Dosya içerik türü (MIME) güvenlik kontrolünden geçemedi.']);
            exit;
        }

        // 5. Tam dosya içeriğinde PHP / HTML betik imzası taraması
        $fullContent = @file_get_contents($file['tmp_name']);
        if ($fullContent === false ||
            stripos($fullContent, '<?php') !== false ||
            stripos($fullContent, '<?=') !== false ||
            stripos($fullContent, '<script') !== false ||
            stripos($fullContent, '__HALT_COMPILER') !== false) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Dosya içeriğinde izin verilmeyen betik kodu algılandı.']);
            exit;
        }

        // 6. Güvenli Rastgele İsim Oluşturma (Kriptografik 32 karakterlik karma)
        $randomToken = bin2hex(random_bytes(16));
        $savedFileName = $randomToken . '.' . $extension;
        $targetPath = $uploadDir . DIRECTORY_SEPARATOR . $savedFileName;

        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Dosya hedef dizine kaydedilemedi.']);
            exit;
        }

        @chmod($targetPath, 0644);

        $fileUrl = 'uploads/' . $savedFileName;
        $originalFileName = $cleanText($rawOriginalName, 120);
        $fileSize = (int)$file['size'];
        $fileType = $extension;
    }

    // Mesaj veya dosyanın en az biri dolu olmalıdır
    if ($safeMessage === '' && $fileUrl === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Mesaj metni veya bir dosya eklemelisiniz.']);
        exit;
    }

    // Doğrulamalar başarılı olduktan sonra hız sınırı sayaçlarını güncelle
    if ($hasUpload) {
        if ($rateRow && ($currentTime - (int)$rateRow['upload_window_start']) <= 60) {
            $db->prepare("UPDATE rate_limits SET last_message_time = :now, upload_count = upload_count + 1 WHERE ip = :ip")
               ->execute([':now' => $currentTime, ':ip' => $clientIp]);
        } else {
            $db->prepare("UPDATE rate_limits SET last_message_time = :now, upload_count = 1, upload_window_start = :now WHERE ip = :ip")
               ->execute([':now' => $currentTime, ':ip' => $clientIp]);
        }
    } else {
        $db->prepare("UPDATE rate_limits SET last_message_time = :now WHERE ip = :ip")
           ->execute([':now' => $currentTime, ':ip' => $clientIp]);
    }

    // Veritabanına Kaydet
    try {
        $stmtInsert = $db->prepare("INSERT INTO messages (user_name, role, message, file_url, file_name, file_size, file_type, ip) VALUES (:user_name, :role, :message, :file_url, :file_name, :file_size, :file_type, :ip)");
        $stmtInsert->execute([
            ':user_name' => $safeUserName,
            ':role' => $safeRole,
            ':message' => $safeMessage,
            ':file_url' => $fileUrl,
            ':file_name' => $originalFileName,
            ':file_size' => $fileSize,
            ':file_type' => $fileType,
            ':ip' => $clientIp
        ]);

        $newId = (int)$db->lastInsertId();

        echo json_encode([
            'success' => true,
            'message_id' => $newId,
            'file_url' => $fileUrl,
            'created_at' => date('Y-m-d H:i:s')
        ]);
        exit;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Mesaj veritabanına yazılamadı']);
        exit;
    }
}

// Tanımsız Eylem
http_response_code(400);
echo json_encode(['success' => false, 'error' => 'Geçersiz eylem']);
exit;

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-18: JSDoc, HTTP güvenlik başlıkları ve canlı ortam hata gizleme ayarları.
   - Satır 19-44: storage/ ve uploads/ dizinlerinin oluşturulması ve .htaccess betik çalıştırma engeli.
   - Satır 46-79: SQLite3 PDO bağlantısı, busy_timeout ve messages / rate_limits tabloları.
   - Satır 81-94: Sahte X-Forwarded-For başlığına karşı REMOTE_ADDR tabanlı güvenli IP tespiti.
   - Satır 96-140: get_messages eylemi; pozitif limit/since_id doğrulaması ve entity decode.
   - Satır 145-196: send_message eylemi; zorunlu POST kontrolü, atomik rate limit ve girdi temizliği.
   - Satır 198-291: Katı dosya yükleme denetimleri (15 MB sınır, uzantı + finfo MIME beyaz listesi, tam içerik taraması).
   - Satır 293-351: Hız sınırı güncellemesi ve PDO prepared statement ile SQLi korumalı kayıt.
   ========================================================================== */
