# AstroChief MarsMap — Commit Geçmişi, Geri-Yazım (Churn) ve Eksiklik Raporu

> **Oluşturulma:** `2026-11-15 03:45:55` · **Üretici:** `tools/audit_project.py` · **Toplam Commit:** `99`

## 1. Özet İstatistikler

- **Toplam Commit:** `99`
- **Özellik (`feat`):** `32` | **Hata Düzeltme (`fix`):** `9` | **Birleştirme (`merge`):** `7` | **Geri Alma/Silme (`revert/remove`):** `7` | **Refaktör/Temizlik:** `3` | **Dokümantasyon:** `33` | **CI/Deploy:** `5`
- **Hata / Geri-Yazım / Çakışma Olayı Sayısı:** `16`
- **Commit Edilmemiş Değişiklikler:** `10` dosya

## 2. Tespit Edilen Mevcut Eksiklikler ve Riskler

### 2.1 Commit Edilmemiş (Açık) Çalışma Ağacı Değişiklikleri
- ` M ForAgents/PROJECT_STATE.md`
- ` M css/inspector.css`
- ` M data/i18n/localesMission.js`
- ` M demo/index.html`
- ` M index.html`
- ` M js/components/RouteInspectorPanel.js`
- ` M js/services/BackendApiService.js`
- ` M logs/change_log.txt`
- `?? tools/__pycache__/`
- `?? tools/audit_project.py`

### 2.2 Kod Kuralları, Satır Sınırı ve Mimari Eksiklikler
- `>= 800` satır kuralını aşan dosya yok.
- **800 Satır Sınırına Yaklaşan Dosyalar (>=650 satır, bölünme adayı):**
  - `data/i18n/localesJaKoArHe.js`: **688** satır
  - `js/components/DemoStudioController.js`: **767** satır
  - `js/components/MarsNavigatorController.js`: **744** satır
  - `js/renderers/Map3DRenderer.js`: **730** satır
  - `js/renderers/OverlayDrawHelper.js`: **771** satır
  - `js/services/BackendApiService.js`: **767** satır
- **Kod İçindeki TODO/FIXME İşaretleri:**
  - `tools/audit_project.py:217` -> `# 2. Kod dosyalari taramasi (<800 satir, footer, dis URL, TODO)`
  - `tools/audit_project.py:240` -> `if re.search(r"\b(TODO|FIXME|HACK|XXX)\b", ln):`
  - `tools/audit_project.py:355` -> `lines.append("- **Kod İçindeki TODO/FIXME İşaretleri:**")`
- **[EKSİKLİK]** Repoda kalıcı otomatik test paketi (`tests/` klasörü veya CI unit/E2E test koşusu) bulunmuyor; yalnızca geçici doğrulamalar yapılıyor.
- **Karo (Tile) Envanter Durumu:** `manifest.json`=None, Git izlenen PNG=225, Yerel disk PNG=4788.
- **[DAĞITIM FARKI]** GitHub Actions (.github/workflows/deploy-mars-web.yml) yalnizca mars.kubitron.com hedefine bagli; marsmap.wiki (20.102.97.92) manuel SCP/SSH ile guncelleniyor.
- **[DAĞITIM FARKI]** marsmap.wiki Nginx sunucusunda PHP-FPM yok; chat/index.html ve api/chat.php yalnizca PHP destekli sunucuda calisir.

## 3. En Çok Üstüne Yazılan / Hata Düzeltilen Dosyalar (Churn Analizi)

| Dosya | Toplam Commit | Fix/Geri Alma | Merge | Eklenen (+) | Silinen (-) | Geri-Yazım Oranı |
|---|---:|---:|---:|---:|---:|---:|
| `logs/change_log.txt` | 47 | 10 | 0 | +555 | -40 | %7.2 |
| `index.html` | 32 | 10 | 0 | +801 | -693 | %86.5 |
| `js/components/MarsNavigatorController.js` | 23 | 9 | 0 | +1782 | -952 | %53.4 |
| `js/renderers/Map3DRenderer.js` | 22 | 8 | 0 | +1778 | -1237 | %69.6 |
| `dist/linux/AstroChief-MarsMap-linux/index.html` | 21 | 7 | 0 | +510 | -505 | %99.0 |
| `dist/windows/AstroChief-MarsMap-win64/index.html` | 21 | 7 | 0 | +510 | -505 | %99.0 |
| `dist/linux/AstroChief-MarsMap-linux/SHA256SUMS.txt` | 21 | 5 | 0 | +939 | -936 | %99.7 |
| `readme.md` | 30 | 0 | 0 | +181 | -101 | %55.8 |
| `dist/linux/AstroChief-MarsMap-linux/js/renderers/Map3DRenderer.js` | 15 | 7 | 0 | +1602 | -1601 | %99.9 |
| `dist/windows/AstroChief-MarsMap-win64/js/renderers/Map3DRenderer.js` | 15 | 7 | 0 | +1602 | -1601 | %99.9 |
| `dist/linux/AstroChief-MarsMap-linux/js/components/MarsNavigatorController.js` | 16 | 6 | 0 | +1437 | -1437 | %100.0 |
| `dist/windows/AstroChief-MarsMap-win64/js/components/MarsNavigatorController.js` | 16 | 6 | 0 | +1437 | -1437 | %100.0 |
| `ForAgents/PROJECT_STATE.md` | 15 | 5 | 0 | +174 | -42 | %24.1 |
| `js/services/BackendApiService.js` | 12 | 4 | 0 | +1559 | -568 | %36.4 |
| `dist/windows/AstroChief-MarsMap-win64/MarsMap-win64.exe` | 16 | 2 | 0 | +0 | -0 | %0.0 |
| `css/controls.css` | 11 | 4 | 0 | +824 | -202 | %24.5 |
| `js/renderers/Map2DRenderer.js` | 11 | 4 | 0 | +413 | -83 | %20.1 |
| `js/components/RouteInspectorPanel.js` | 12 | 3 | 0 | +1002 | -554 | %55.3 |
| `js/components/SettingsPanel.js` | 11 | 3 | 0 | +401 | -137 | %34.2 |
| `dist/linux/AstroChief-MarsMap-linux/ForAgents/PROJECT_STATE.md` | 9 | 4 | 0 | +107 | -115 | %107.5 |

## 4. Hatalı Değişiklikler, Çakışmalar ve Üstüne Geri Yazılan Zincirler

| Commit | Tarih | Tür | Fark | Yakın Önceki Çakışan Commit | Açıklama |
|---|---|---|---|---|---|
| `510ed1a` | `2026-11-14 13:11:46` | `fix` | `+6835/-1584` | `e804256 (ForAgents/PROJECT_STATE.md, dist/AstroChief-MarsMap-v3.0.0-linux.tar.gz), e058d7f (dist/AstroChief-MarsMap-v3.0.0-linux.tar.gz, dist/AstroChief-MarsMap-v3.0.0-windows.zip), 91d112e (dist/AstroChief-MarsMap-v3.0.0-linux.tar.gz, dist/AstroChief-MarsMap-v3.0.0-windows.zip)` | Fix map pixelation and zoom freeze with HiDPI LOD tiles and coalesced rendering |
| `3221338` | `2026-11-14 13:34:13` | `revert/remove` | `+3701/-445` | `e058d7f (dist/linux/AstroChief-MarsMap-linux/SHA256SUMS.txt, logs/change_log.txt), 91d112e (dist/linux/AstroChief-MarsMap-linux/SHA256SUMS.txt, dist/linux/AstroChief-MarsMap-linux/js/components/SettingsPanel.js), 3cf3b40 (dist/linux/AstroChief-MarsMap-linux/SHA256SUMS.txt, dist/linux/AstroChief-MarsMap-linux/index.html)` | fix(i18n): remove Chinese (zh) language support completely (9 languages supported) |
| `48d2fd5` | `2026-11-14 17:29:45` | `fix` | `+1998/-810` | `510ed1a (dist/linux/AstroChief-MarsMap-linux/ForAgents/PROJECT_STATE.md, dist/linux/AstroChief-MarsMap-linux/SHA256SUMS.txt), 6b652eb (dist/linux/AstroChief-MarsMap-linux/ForAgents/PROJECT_STATE.md, dist/linux/AstroChief-MarsMap-linux/SHA256SUMS.txt), 3221338 (dist/AstroChief-MarsMap-v3.1.0-linux.tar.gz, dist/AstroChief-MarsMap-v3.1.0-windows.zip)` | 3D kamera egimi (Pitch/Yaw) sag tik orbit dondurme duzeltmesi (v3.4) |
| `7ead6e8` | `2026-11-14 17:34:35` | `fix` | `+120/-107` | `6b652eb (dist/linux/AstroChief-MarsMap-linux/SHA256SUMS.txt, dist/linux/AstroChief-MarsMap-linux/index.html), 3221338 (dist/AstroChief-MarsMap-v3.1.0-linux.tar.gz, dist/AstroChief-MarsMap-v3.1.0-windows.zip), 5df481d (dist/AstroChief-MarsMap-v3.1.0-linux.tar.gz, dist/AstroChief-MarsMap-v3.1.0-windows.zip)` | 3D aci (camYaw) degiskenken surukleme yonu duzeltildi (v3.5) |
| `dfb10fd` | `2026-11-14 19:32:32` | `fix` | `+528/-558` | `a4a8133 (index.html, js/components/MarsNavigatorController.js), 48d2fd5 (dist/linux/AstroChief-MarsMap-linux/index.html, dist/linux/AstroChief-MarsMap-linux/js/components/MarsNavigatorController.js), 7ead6e8 (dist/linux/AstroChief-MarsMap-linux/index.html, dist/linux/AstroChief-MarsMap-linux/js/components/MarsNavigatorController.js)` | fix(render): eliminate zoom pixelation via bilinear MOLA DEM interpolation, 4-tap Hermite texel filtering, and eager z=3..5 zoom loading (v3.8) |
| `465fdae` | `2026-11-14 19:45:37` | `revert/remove` | `+0/-71490` | `48d2fd5 (backups/snapshot_20261114_3d_orbit_fix/Map3DRenderer.js, backups/snapshot_20261114_3d_orbit_fix/OverlayDrawHelper.js), b4894dc (backups/snapshot_20261114_google_maps_perf/Map2DRenderer.js, backups/snapshot_20261114_google_maps_perf/Map3DRenderer.js)` | Delete backups directory |
| `f8a166a` | `2026-11-14 20:03:04` | `fix` | `+315/-319` | `9fb4063 (js/components/MarsNavigatorController.js, js/renderers/Map3DRenderer.js), b4894dc (js/components/MarsNavigatorController.js, js/renderers/Map2DRenderer.js), dfb10fd (js/components/MarsNavigatorController.js, js/renderers/Map2DRenderer.js)` | Fix button sizes, photo card click toggle, and 3D/2D Mars center lock & controls |
| `c8382c9` | `2026-11-14 20:39:38` | `revert/remove` | `+1788/-569` | `30fe12a (backups/rapor_backup_20261114_165939.md), f8a166a (js/components/MarsNavigatorController.js, js/renderers/Map2DRenderer.js), 8bec84d (js/components/MarsNavigatorController.js, js/renderers/Map3DRenderer.js)` | feat(route): remove alternative pale-blue route and keep single primary route only (v3.9) |
| `b318877` | `2026-11-14 21:31:39` | `revert/remove` | `+3/-6` | `8bec84d (js/renderers/Map3DRenderer.js), f0cc2d3 (dist/linux/AstroChief-MarsMap-linux/js/renderers/Map3DRenderer.js, dist/windows/AstroChief-MarsMap-win64/js/renderers/Map3DRenderer.js), c8382c9 (js/renderers/Map3DRenderer.js)` | fix(3d): remove undeclared dr assignment from auto-merge in Map3DRenderer.js |
| `3eba2a4` | `2026-11-14 21:33:52` | `fix` | `+3/-3` | `f0cc2d3 (dist/linux/AstroChief-MarsMap-linux/js/renderers/Map3DRenderer.js, dist/windows/AstroChief-MarsMap-win64/js/renderers/Map3DRenderer.js), c8382c9 (js/renderers/Map3DRenderer.js), 7f6ad99 (dist/linux/AstroChief-MarsMap-linux/js/renderers/Map3DRenderer.js, dist/windows/AstroChief-MarsMap-win64/js/renderers/Map3DRenderer.js)` | fix(3d): use baseR2 instead of finalRhoSq in Map3DRenderer evalRay return |
| `c7ed976` | `2026-11-14 21:55:45` | `fix` | `+179/-160` | `3eba2a4 (dist/linux/AstroChief-MarsMap-linux/js/renderers/Map3DRenderer.js, dist/windows/AstroChief-MarsMap-win64/js/renderers/Map3DRenderer.js), 9611edc (dist/linux/AstroChief-MarsMap-linux/index.html, dist/linux/AstroChief-MarsMap-linux/js/renderers/Map3DFallbackRenderer.js)` | fix(3d-fallback): fix canvas transform reset so heatmap sticks cleanly in file:// fallback mode too (v4.1) |
| `e8e8aeb` | `2026-11-14 21:55:46` | `revert/remove` | `+0/-7` | `9611edc (js/renderers/Map3DRenderer.js)` | Remove hard atmospheric outline stroke while preserving orange atmospheric glow |
| `cb04871` | `2026-11-15 00:24:50` | `fix` | `+620/-68094` | `8036f9e (ForAgents/PROJECT_STATE.md, backups/snapshot_20261114_rapor_fixes/.github/workflows/deploy-mars-web.yml), a72a78e (data/tiles/manifest.json, index.html), 75cec41 (ForAgents/PROJECT_STATE.md, demo/index.html)` | chore(cleanup): fix shortestDeltaLon crash, index.html UTF-8, CI tile manifest, <800 line splits & untrack dist/backups |
| `2789bff` | `2026-11-15 00:28:38` | `fix` | `+222/-43` | `8036f9e (ForAgents/PROJECT_STATE.md, index.html), a72a78e (index.html, logs/change_log.txt), 75cec41 (ForAgents/PROJECT_STATE.md, demo/index.html)` | fix(zoom): add cursor-anchored 2D/3D wheel zoom on main map and /demo |
| `b563c16` | `2026-11-14 22:59:16` | `revert/remove` | `+2323/-891` | `a72a78e (css/style.css, index.html), 75cec41 (ForAgents/PROJECT_STATE.md, ForAgents/SHARED_PLANS_AND_API.md), cb04871 (ForAgents/PROJECT_STATE.md, demo/index.html)` | feat(v4.4.0): unified rover+human travel, remove Bilim tab, mandatory O2/energy/water gate & dark contrast fixes |
| `82bddf1` | `2026-11-15 03:31:13` | `revert/remove` | `+1053/-850` | `2789bff (index.html), 4d45122 (index.html, js/services/BackendApiService.js), 4c02347 (css/controls.css, css/inspector.css)` | fix(ui): improve satellites panel contrast, remove bottom-right telemetry strip, move info button to settings |

## 5. Tüm Commitler Listesi (Kronolojik)

| # | Commit | Tarih | Tür | Fark | Mesaj |
|---:|---|---|---|---|---|
| 1 | `ac2b746` | `2026-11-14 10:33:44` | `feat` | `+21/-0` | Initial commit |
| 2 | `89e0db9` | `2026-11-14 10:36:44` | `feat` | `+19/-0` | Add files via upload |
| 3 | `a57a94a` | `2026-11-14 10:46:52` | `docs` | `+10/-5` | Update readme.md |
| 4 | `5431630` | `2026-11-14 10:47:32` | `docs` | `+6/-0` | Update readme.md |
| 5 | `a22217d` | `2026-11-14 10:51:34` | `docs` | `+3/-1` | Update readme.md |
| 6 | `0739363` | `2026-11-14 11:02:11` | `docs` | `+2/-2` | Update readme.md formatting and content |
| 7 | `4878b2e` | `2026-11-14 11:04:22` | `docs` | `+13/-2` | Update readme.md |
| 8 | `bef9016` | `2026-11-14 11:10:52` | `feat` | `+2196/-2` | feat: AstroChief Mars template - Details, Resources, Teams, styles and documentation |
| 9 | `af3faa4` | `2026-11-14 11:12:23` | `docs` | `+41/-0` | docs: add rebase backup and update change log |
| 10 | `33b1547` | `2026-11-14 11:14:36` | `feat` | `+110/-0` | feat: add 1-click preview server script (serve.ps1, preview.bat) |
| 11 | `50ec554` | `2026-11-14 11:20:36` | `docs` | `+2/-0` | Update readme.md |
| 12 | `bc44b59` | `2026-11-14 08:22:02` | `ci/deploy` | `+118/-0` | feat: add 1-click desktop deployment scripts per updated readme.md rule |
| 13 | `b652f0f` | `2026-11-14 11:24:21` | `docs` | `+2/-0` | Update readme.md |
| 14 | `4c56e74` | `2026-11-14 11:26:28` | `docs` | `+6/-0` | Update readme.md |
| 15 | `ca42033` | `2026-11-14 11:24:56` | `feat` | `+779/-82` | feat(data): add NASA & USGS Mars datasets with full catalog documentation |
| 16 | `69832a2` | `2026-11-14 11:27:00` | `docs` | `+53/-0` | docs: add rebase backup and update change log |
| 17 | `ecebbea` | `2026-11-14 11:33:54` | `docs` | `+6/-2` | Update readme.md |
| 18 | `569b65d` | `2026-11-14 11:35:19` | `docs` | `+2/-0` | Update readme.md |
| 19 | `9bb794b` | `2026-11-14 11:45:46` | `docs` | `+4/-0` | Update readme.md |
| 20 | `70df709` | `2026-11-14 11:50:08` | `docs` | `+3/-1` | Update readme.md |
| 21 | `4781670` | `2026-11-14 11:54:04` | `docs` | `+1/-1` | Update readme.md |
| 22 | `30fcf2d` | `2026-11-14 11:58:51` | `docs` | `+2/-0` | Update readme.md |
| 23 | `07e239e` | `2026-11-14 12:10:21` | `docs` | `+3/-3` | Update readme.md |
| 24 | `8ca30fe` | `2026-11-14 12:13:17` | `docs` | `+2/-0` | Update readme.md |
| 25 | `ddc0bdb` | `2026-11-14 11:59:18` | `feat` | `+2572/-779` | feat(ui): redesign template as Google Earth style Mars Crater Navigator with starfield and HUD |
| 26 | `6664eb1` | `2026-11-14 11:56:59` | `feat` | `+6513/-1087` | feat(ui): implement 60-30-10 theme, 2D/3D crater renderer, acid/storm filters, and crater comparison |
| 27 | `48bcf20` | `2026-11-14 12:14:57` | `feat` | `+19207/-1448` | feat(ui,build): corporate Google Maps x Mars Trek layout, top-left Factory Reset, and Windows/Linux build tool |
| 28 | `0713503` | `2026-11-14 12:21:07` | `feat` | `+4572/-1039` | feat(lod,routes,release): v2.3.0 progressive LOD culling, blue/pale-blue ETA routes, radiation parameters, and Windows/Linux packages |
| 29 | `98482d3` | `2026-11-14 12:28:50` | `docs` | `+1/-1` | Update readme.md |
| 30 | `12531b0` | `2026-11-14 12:38:06` | `feat` | `+7514/-1861` | feat(globe,tiles,release): v2.4.0 navbar-free navigable Mars globe backed by 136 local tiles in data/tiles |
| 31 | `fdfa301` | `2026-11-14 12:42:37` | `docs` | `+3/-1` | Update readme.md |
| 32 | `79a5f56` | `2026-11-14 12:47:34` | `docs` | `+2/-14` | Update readme.md |
| 33 | `18d9d13` | `2026-11-14 12:51:13` | `feat` | `+6580/-1366` | feat(hires,backend,release): v2.5.0 HiDPI 1:1 zoomed globe tiles (z0-z7) and /api/v1 backend integration hooks |
| 34 | `711ea2d` | `2026-11-14 12:57:12` | `docs` | `+4/-0` | Update readme.md |
| 35 | `67d2612` | `2026-11-14 13:03:08` | `docs` | `+5/-1` | Update readme.md |
| 36 | `2fa1db0` | `2026-11-14 13:03:43` | `merge` | `+0/-0` | Merge branch 'main' of github.com:AstroChief77/MarsMap |
| 37 | `368c1fa` | `2026-11-14 13:30:06` | `feat` | `+2123/-4` | feat(comms): secure mission chat and file transfer system with sqlite3 and nginx hardening |
| 38 | `8eb6e7a` | `2026-11-14 13:36:34` | `feat` | `+542/-0` | feat(chat): add standalone /chat page for direct access via fesnex.com/chat |
| 39 | `edf2cf9` | `2026-11-14 13:39:49` | `perf` | `+7209/-199` | feat(optimize,ux,release): crater-focused foveated HiDPI rendering, satellite dock with NASA data photos, and backend v1.1 severity hooks |
| 40 | `b05d58a` | `2026-11-14 13:46:52` | `ci/deploy` | `+701/-0` | ci(deploy): add GitHub Actions + server systemd/webhook auto-deploy pipeline to mars.kubitron.com |
| 41 | `2cea166` | `2026-11-14 14:01:10` | `ci/deploy` | `+718/-66` | ci(deploy): support private GitHub repo SSH deploy keys, Nginx root auto-detect, and rsync protect rules |
| 42 | `94a7e5b` | `2026-11-14 11:03:23` | `feat` | `+29833/-13814` | v3.0.0: Full OOP rewrite with offline res/, dual HTTP/file:// Windows support, 2D default & safe routing |
| 43 | `9cd621f` | `2026-11-14 11:05:47` | `merge` | `+0/-0` | Merge origin/main CI/chat/tiles with AstroChief v3.0.0 OOP rewrite (dual HTTP/file:// Windows support) |
| 44 | `6416d6d` | `2026-11-14 14:12:09` | `ci/deploy` | `+311/-4` | ci(deploy): strip CRLF from DEPLOY_SSH_KEY, preserve mars:www-data ownership, and sync v3 res/ assets |
| 45 | `2478c00` | `2026-11-14 14:19:07` | `docs` | `+4/-6` | Update readme.md |
| 46 | `2ad8d5b` | `2026-11-14 14:32:22` | `docs` | `+2/-0` | Update readme.md |
| 47 | `8d7917f` | `2026-11-14 14:42:11` | `docs` | `+2/-0` | Update readme.md |
| 48 | `fbc4831` | `2026-11-14 14:54:21` | `feat` | `+1813/-131` | feat(lan): add 0.0.0.0 LAN server, local chat fonts, and GitHub auto-build watcher |
| 49 | `f689933` | `2026-11-14 15:04:02` | `docs` | `+1/-1` | Update readme.md |
| 50 | `d1e2869` | `2026-11-14 15:08:15` | `docs` | `+2/-0` | Update readme.md |
| 51 | `e804256` | `2026-11-14 15:20:11` | `feat` | `+8043/-639` | Add simplified Rust step-by-step backend routing, 10s FPS guard, and 3D default |
| 52 | `57ddffd` | `2026-11-14 15:21:11` | `merge` | `+0/-0` | Merge remote-tracking branch 'origin/main' |
| 53 | `e058d7f` | `2026-11-14 15:26:18` | `feat` | `+2234/-16` | Add 5-second top-right backend latency monitor and sync 3D default build |
| 54 | `91d112e` | `2026-11-14 15:38:00` | `feat` | `+2288/-543` | Simplify route UI to fixed Bulundugumuz Konum and single Hedef Konum selector |
| 55 | `3cf3b40` | `2026-11-14 15:55:28` | `feat` | `+549/-86` | Add cache-busting v3.2 tags and no-store headers for simplified route UI |
| 56 | `5463346` | `2026-11-14 16:06:35` | `feat` | `+2210/-511` | Sadelestirilmis saf Rust backend istek/yanit akisi (v3.3) |
| 57 | `510ed1a` | `2026-11-14 13:11:46` | `fix` | `+6835/-1584` | Fix map pixelation and zoom freeze with HiDPI LOD tiles and coalesced rendering |
| 58 | `6b652eb` | `2026-11-14 13:22:42` | `feat` | `+12991/-772` | feat(i18n): add 10-language support (TR, EN, DE, FR, ES, ZH, JA, KO, AR, HE) with RTL & localized UI |
| 59 | `3221338` | `2026-11-14 13:34:13` | `revert/remove` | `+3701/-445` | fix(i18n): remove Chinese (zh) language support completely (9 languages supported) |
| 60 | `d332ae5` | `2026-11-14 16:38:35` | `feat` | `+474/-0` | Mustafa Rust A* backend ve WebAssembly (backend_bg.wasm) derlenip entegre edildi |
| 61 | `5df481d` | `2026-11-14 16:40:38` | `feat` | `+4791/-268` | Derlenen js/wasm/backend_bg.wasm ve BackendApiService entegrasyonu |
| 62 | `a4a8133` | `2026-11-14 16:50:50` | `feat` | `+3908/-322` | feat(3d): add real-scale NASA MOLA 3D topography elevation and 3D planet navigation |
| 63 | `48d2fd5` | `2026-11-14 17:29:45` | `fix` | `+1998/-810` | 3D kamera egimi (Pitch/Yaw) sag tik orbit dondurme duzeltmesi (v3.4) |
| 64 | `7ead6e8` | `2026-11-14 17:34:35` | `fix` | `+120/-107` | 3D aci (camYaw) degiskenken surukleme yonu duzeltildi (v3.5) |
| 65 | `9fb4063` | `2026-11-14 17:39:06` | `perf` | `+152/-147` | Yakinlastirma siniri 80x ve 3D render hiz optimizasyonu (v3.6) |
| 66 | `26141d9` | `2026-11-14 15:34:06` | `docs` | `+226/-0` | docs: add security and code-quality audit report (rapor.md) |
| 67 | `b4894dc` | `2026-11-14 18:44:32` | `perf` | `+24837/-925` | perf(engine): Google Earth/Maps-grade frustum tile culling, time-sliced async pixel decode, and 16x faster 3D MOLA block raycaster (v3.7) |
| 68 | `dfb10fd` | `2026-11-14 19:32:32` | `fix` | `+528/-558` | fix(render): eliminate zoom pixelation via bilinear MOLA DEM interpolation, 4-tap Hermite texel filtering, and eager z=3..5 zoom loading (v3.8) |
| 69 | `465fdae` | `2026-11-14 19:45:37` | `revert/remove` | `+0/-71490` | Delete backups directory |
| 70 | `30fe12a` | `2026-11-14 17:01:38` | `docs` | `+350/-81` | docs: update technical audit report (rapor.md) for v3.8 with v3.7/26141d9 comparison |
| 71 | `f8a166a` | `2026-11-14 20:03:04` | `fix` | `+315/-319` | Fix button sizes, photo card click toggle, and 3D/2D Mars center lock & controls |
| 72 | `8bec84d` | `2026-11-14 20:08:47` | `feat` | `+83/-67` | Enable centered 3D right-click camera pitch tilt and compass yaw orbit |
| 73 | `f0cc2d3` | `2026-11-14 17:26:28` | `refactor/cleanup` | `+14106/-1416` | feat(ui): make Uydular image cards directly clickable with RTL/a11y fixes & split Map3DFallbackRenderer (v3.9) |
| 74 | `603b0d9` | `2026-11-14 20:05:36` | `refactor/cleanup` | `+13/-12` | refactor(backend) code base |
| 75 | `c8382c9` | `2026-11-14 20:39:38` | `revert/remove` | `+1788/-569` | feat(route): remove alternative pale-blue route and keep single primary route only (v3.9) |
| 76 | `59364db` | `2026-11-14 21:14:58` | `merge` | `+0/-0` | Merge branch 'main' of github.com:AstroChief77/MarsMap |
| 77 | `7f6ad99` | `2026-11-14 21:21:39` | `refactor/cleanup` | `+79/-249` | chore(3d): clean up Map3DFallbackRenderer merge in Map3DRenderer.js and index.html |
| 78 | `b318877` | `2026-11-14 21:31:39` | `revert/remove` | `+3/-6` | fix(3d): remove undeclared dr assignment from auto-merge in Map3DRenderer.js |
| 79 | `3eba2a4` | `2026-11-14 21:33:52` | `fix` | `+3/-3` | fix(3d): use baseR2 instead of finalRhoSq in Map3DRenderer evalRay return |
| 80 | `4cc7607` | `2026-11-14 21:37:22` | `feat` | `+12/-6` | feat: calculate distance and avaible oxygen |
| 81 | `b34986f` | `2026-11-14 21:39:44` | `docs` | `+3/-0` | Update readme.md |
| 82 | `9611edc` | `2026-11-14 21:41:59` | `feat` | `+1466/-408` | feat(heatmap): glue organic non-circular hazard heatmaps to 3D sphere (acid rain in blue, low transparency) |
| 83 | `dd3f025` | `2026-11-14 21:42:17` | `merge` | `+0/-0` | Merge branch 'main' of github.com:AstroChief77/MarsMap |
| 84 | `1459b81` | `2026-11-14 18:52:21` | `docs` | `+707/-1` | docs: add Prameters.md with realistic Mars EVA oxygen, rover, and human speed parameters |
| 85 | `c7ed976` | `2026-11-14 21:55:45` | `fix` | `+179/-160` | fix(3d-fallback): fix canvas transform reset so heatmap sticks cleanly in file:// fallback mode too (v4.1) |
| 86 | `e8e8aeb` | `2026-11-14 21:55:46` | `revert/remove` | `+0/-7` | Remove hard atmospheric outline stroke while preserving orange atmospheric glow |
| 87 | `7541d86` | `2026-11-14 21:55:48` | `merge` | `+0/-0` | Merge branches 'main' and 'main' of github.com:AstroChief77/MarsMap |
| 88 | `8036f9e` | `2026-11-14 19:16:54` | `docs` | `+30333/-32784` | v3.9.0: Resolve all rapor.md security, tile manifest, 3D raycast, i18n, and backend findings |
| 89 | `e5e2de6` | `2026-11-14 19:21:49` | `merge` | `+0/-0` | Merge origin/main and finalize v3.9.0 / v4.1 rapor.md audit fixes & build |
| 90 | `a72a78e` | `2026-11-14 23:13:41` | `feat` | `+10718/-815` | feat(v4.3): wire NASA MOLA DEM, hazards & O2 into rebuilt 8-arg Rust WASM + 3D heatmaps + 10249-tile manifest |
| 91 | `75cec41` | `2026-11-14 23:33:02` | `ci/deploy` | `+3175/-40` | feat(v4.3.0): add dedicated /demo survival simulation studio and web deploy routes |
| 92 | `cb04871` | `2026-11-15 00:24:50` | `fix` | `+620/-68094` | chore(cleanup): fix shortestDeltaLon crash, index.html UTF-8, CI tile manifest, <800 line splits & untrack dist/backups |
| 93 | `2789bff` | `2026-11-15 00:28:38` | `fix` | `+222/-43` | fix(zoom): add cursor-anchored 2D/3D wheel zoom on main map and /demo |
| 94 | `4d45122` | `2026-11-15 00:39:03` | `feat` | `+557/-173` | feat(backend-api): send 48x48 MOLA DEM grid, slopes, crater catalog & Prameters.md physics to backend |
| 95 | `4c02347` | `2026-11-15 01:26:48` | `feat` | `+308/-199` | feat(ui): dark cosmic Mars redesign, top search+coords, 0deg 3D, square sat button, compact route panel & progressive tile load |
| 96 | `b563c16` | `2026-11-14 22:59:16` | `revert/remove` | `+2323/-891` | feat(v4.4.0): unified rover+human travel, remove Bilim tab, mandatory O2/energy/water gate & dark contrast fixes |
| 97 | `9670528` | `2026-11-14 23:05:07` | `feat` | `+1794/-913` | feat(ui): v4.4.0 Light Gray Studio theme, 4c02347 merge & HUD/route polish |
| 98 | `3bda5d2` | `2026-11-14 23:23:39` | `feat` | `+0/-0` | merge: combine Light Gray Studio v4.4 GUI with Rover+Human mission gate (b563c16) |
| 99 | `82bddf1` | `2026-11-15 03:31:13` | `revert/remove` | `+1053/-850` | fix(ui): improve satellites panel contrast, remove bottom-right telemetry strip, move info button to settings |
