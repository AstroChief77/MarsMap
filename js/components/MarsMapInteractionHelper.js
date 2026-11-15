/**
 * @file MarsMapInteractionHelper.js
 * @description 2D/3D Mars tuvali icin fare surukleme, sag-tik 3D orbit (Pitch/Yaw), tekerlek zoom,
 * klavye gezinme, atalet (inertia) ve hedef krater/yuzey secim tiklamalarini yoneten yardimci sinif.
 * MarsNavigatorController.js dosyasini 800 satir kuralinin altinda tutmak icin ayrilmistir.
 */

(function (ns) {
  "use strict";

  class MarsMapInteractionHelper {
    /**
     * @param {MarsNavigatorController} ctrl - Ana harita denetleyicisi referansi
     */
    constructor(ctrl) {
      this.ctrl = ctrl;
    }

    /** Tum tuval ve pencere olay dinleyicilerini tek seferde baglar */
    bindAll() {
      this.bindCanvasEvents();
      this.bindGlobalEvents();
    }

    /** Surukleme, animasyon ve zoom zamanlayicilarini guvenle iptal eder */
    cancelAll() {
      const c = this.ctrl;
      if (c.animFrame) cancelAnimationFrame(c.animFrame);
      clearTimeout(c.zoomSettleTimer);
      clearTimeout(c.dragSettleTimer);
      c.animFrame = null;
      c.isDragging = false;
      c.isOrbitDragging = false;
      c.isZooming = false;
      c.isAnimating = false;
    }

    _applyDragStep(dx, dy) {
      const c = this.ctrl;
      if (dx === 0 && dy === 0) return;
      if (dx * dx + dy * dy > 4) c.hasMoved = true;

      if (c.isOrbitDragging) {
        c.state.camYaw = ((c.state.camYaw || 0) + dx * 0.28 + 360) % 360;
        c.state.camPitch = Math.max(0, Math.min(68, (c.state.camPitch ?? 0) - dy * 0.24));
        const tiltBtn = document.getElementById("btn-3d-tilt");
        if (tiltBtn) tiltBtn.textContent = `${Math.round(c.state.camPitch)}°`;
        c.scheduleRender(false);
        c.schedulePersistState();
        return;
      }

      const vw = c.viewWidth || 1280;
      const vh = c.viewHeight || 720;
      const { stepLon, stepLat } = c.routePlanner?.geo
        ? c.routePlanner.geo.computePanStep(dx, dy, vw, vh, c.state)
        : { stepLon: 0, stepLat: 0 };
      c.velLon = stepLon * 0.42;
      c.velLat = stepLat * 0.42;
      c.state.rotLon = c.normalizeLon(c.state.rotLon + stepLon);
      c.state.rotLat = Math.max(-78, Math.min(78, c.state.rotLat + stepLat));
      c.hoverCoords.lat = c.state.rotLat;
      c.hoverCoords.lon = c.state.rotLon;
      c.scheduleRender(false);
    }

    bindCanvasEvents() {
      const c = this.ctrl;
      if (!c.canvas) return;
      c.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

      c.canvas.addEventListener("mousedown", (e) => {
        if (c.animFrame) cancelAnimationFrame(c.animFrame);
        clearTimeout(c.dragSettleTimer);
        c.animFrame = null;
        c.isAnimating = false;
        c.isDragging = true;
        c.isOrbitDragging = (e.button === 2 || e.shiftKey) && c.state.viewMode === "3d";
        c.hasMoved = false;
        c.dragX = e.clientX;
        c.dragY = e.clientY;
        c.velLat = 0;
        c.velLon = 0;
      });

      c.canvas.addEventListener("mousemove", (e) => {
        if (!c.isDragging) { c.updateHoverCoords(e); return; }
        const dx = e.clientX - c.dragX;
        const dy = e.clientY - c.dragY;
        c.dragX = e.clientX;
        c.dragY = e.clientY;
        this._applyDragStep(dx, dy);
      });

      let pinchDist = 0;
      c.canvas.addEventListener("touchstart", (e) => {
        if (c.animFrame) cancelAnimationFrame(c.animFrame);
        clearTimeout(c.dragSettleTimer);
        c.animFrame = null;
        c.isAnimating = false;
        c.isOrbitDragging = false;
        if (e.touches.length === 1) {
          const t = e.touches[0];
          pinchDist = 0;
          c.isDragging = true;
          c.hasMoved = false;
          c.dragX = t.clientX;
          c.dragY = t.clientY;
          c.velLat = 0;
          c.velLon = 0;
        } else if (e.touches.length === 2) {
          c.isDragging = false;
          c.hasMoved = true;
          pinchDist = Math.hypot(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY
          );
        }
      }, { passive: false });

      c.canvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        if (e.touches.length === 2) {
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          const nextDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
          if (pinchDist > 8 && nextDist > 8) {
            const rect = c.canvas.getBoundingClientRect();
            const mx = (t0.clientX + t1.clientX) * 0.5 - rect.left;
            const my = (t0.clientY + t1.clientY) * 0.5 - rect.top;
            this.applyZoom(c.state.zoom * (nextDist / pinchDist), mx, my);
          }
          pinchDist = nextDist;
          return;
        }
        if (e.touches.length === 1 && c.isDragging) {
          const t = e.touches[0];
          const dx = t.clientX - c.dragX;
          const dy = t.clientY - c.dragY;
          c.dragX = t.clientX;
          c.dragY = t.clientY;
          this._applyDragStep(dx, dy);
        }
      }, { passive: false });

      const endTouch = (e) => {
        if (e.touches.length === 1) {
          pinchDist = 0;
          c.isDragging = true;
          c.dragX = e.touches[0].clientX;
          c.dragY = e.touches[0].clientY;
          c.velLat = 0;
          c.velLon = 0;
          return;
        }
        pinchDist = 0;
        if (!c.isDragging) return;
        c.isDragging = false;
        this.startInertia();
      };
      c.canvas.addEventListener("touchend", endTouch, { passive: true });
      c.canvas.addEventListener("touchcancel", endTouch, { passive: true });

      c.canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        if (c.animFrame) { cancelAnimationFrame(c.animFrame); c.animFrame = null; c.isAnimating = false; }
        const geo = c.routePlanner?.geo;
        const rect = c.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const nextZoom = geo
          ? geo.computeWheelTargetZoom(c.state.zoom, e.deltaY, e.deltaMode, c.state.viewMode)
          : c.state.zoom * Math.pow(1.002, -Math.max(-160, Math.min(160, e.deltaY)));
        this.applyZoom(nextZoom, px, py);
        c.updateHoverCoords(e);
      }, { passive: false });

      c.canvas.addEventListener("click", (e) => {
        if (c.hasMoved) return;
        const rect = c.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        const hit = c.hitTargets.find((t) => Math.hypot(cx - t.x, cy - t.y) <= t.r);
        if (hit && !c.pickMode) { c.flyToCraterById(hit.crater.id); return; }
        if (c.pickMode !== "destination") return;

        const geo = c.pixelToGeo(cx, cy);
        if (!geo.insideMap) {
          c.showToast(c.t("toastClickMarsSurface"), true);
          return;
        }
        c.pickMode = null;
        c.canvas.style.cursor = "";
        c.state.customDestination = c.routePlanner.geo.makeEndpointPoint("picked-dest", c.t("pickedDestName"), geo.lat, geo.lon);
        c.state.useCustomCoordinates = true;
        c.state.routeScope = "global";
        c.backendRoutes = null;
        if (c.hasValidMissionParams?.() && c.state.missionParamsConfirmed) {
          c.persistState();
          c.refreshAll();
          c.showToast(c.t("toastDestPicked", { lat: geo.lat.toFixed(2), lon: geo.lon.toFixed(2) }));
          c.scheduleBackendRouteFetch(20);
        } else {
          c.state.inspectorOpen = true;
          c.persistState();
          c.refreshAll();
          c.showToast(`${c.t("toastDestPicked", { lat: geo.lat.toFixed(2), lon: geo.lon.toFixed(2) })} — ${c.t("demoGateBlockedToast")}`, true);
        }
      });
    }

    bindGlobalEvents() {
      const c = this.ctrl;
      window.addEventListener("mouseup", () => {
        if (!c.isDragging) return;
        const wasOrbit = c.isOrbitDragging;
        c.isDragging = false;
        c.isOrbitDragging = false;
        if (!wasOrbit) this.startInertia();
        else { c.scheduleRender(true); c.schedulePersistState(); }
      });

      window.addEventListener("keydown", (e) => {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "select" || tag === "textarea") return;
        const k = e.key.toLowerCase();
        const step = Math.max(0.15, 4.5 / Math.max(1, c.state.zoom));
        if (k === "w" || e.key === "ArrowUp") c.state.rotLat = Math.max(-78, Math.min(78, c.state.rotLat + step));
        else if (k === "s" || e.key === "ArrowDown") c.state.rotLat = Math.max(-78, Math.min(78, c.state.rotLat - step));
        else if (k === "a" || e.key === "ArrowLeft") c.state.rotLon = c.normalizeLon(c.state.rotLon - step);
        else if (k === "d" || e.key === "ArrowRight") c.state.rotLon = c.normalizeLon(c.state.rotLon + step);
        else if (k === "r") { c.state.camPitch = Math.min(68, (c.state.camPitch ?? 0) + 5); c.renderBottomRight(); }
        else if (k === "f") { c.state.camPitch = Math.max(0, (c.state.camPitch ?? 0) - 5); c.renderBottomRight(); }
        else if (k === "c" || k === " ") {
          const cr = c.getActiveCrater();
          c.state.camPitch = 0;
          c.state.camYaw = 0;
          c.renderBottomRight();
          this.animateTo(cr.coordinates.lat, cr.coordinates.lon, 1.05);
          return;
        } else return;
        c.scheduleRender(true);
        c.schedulePersistState();
      });

      document.addEventListener("click", (e) => {
        if (!e.target.closest("#settings-anchor")) c.settingsPanel.close();
        if (!e.target.closest("#bottom-left-dock")) c.satellitesPanel.close();
      });

      window.addEventListener("resize", () => { c.resizeCanvas(); c.scheduleRender(true); });
    }

    startInertia() {
      const c = this.ctrl;
      if (c.animFrame) cancelAnimationFrame(c.animFrame);
      const step = () => {
        if (Math.abs(c.velLon) < 0.03 && Math.abs(c.velLat) < 0.03) {
          c.isAnimating = false;
          c.animFrame = null;
          c.scheduleRender(true);
          c.schedulePersistState();
          return;
        }
        c.isAnimating = true;
        c.state.rotLon = c.normalizeLon(c.state.rotLon + c.velLon);
        c.state.rotLat = Math.max(-78, Math.min(78, c.state.rotLat + c.velLat));
        c.velLon *= 0.82;
        c.velLat *= 0.82;
        c.scheduleRender(false);
        c.animFrame = requestAnimationFrame(step);
      };
      c.animFrame = requestAnimationFrame(step);
    }

    animateTo(targetLat, targetLon, targetZoom) {
      const c = this.ctrl;
      if (c.animFrame) cancelAnimationFrame(c.animFrame);
      clearTimeout(c.zoomSettleTimer);
      c.isZooming = false;
      const maxZ = c.state.viewMode === "3d" ? 80.0 : 32.0;
      const clampedZoom = Math.min(Math.max(targetZoom, 0.65), maxZ);
      let dLon = targetLon - c.state.rotLon;
      if (dLon > 180) dLon -= 360;
      else if (dLon < -180) dLon += 360;

      const startLat = c.state.rotLat;
      const startLon = c.state.rotLon;
      const startZoom = c.state.zoom;
      const tStart = performance.now();
      const duration = 420;
      c.isAnimating = true;

      const tick = (now) => {
        const t = Math.min(1, (now - tStart) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        c.state.rotLat = startLat + (targetLat - startLat) * ease;
        c.state.rotLon = c.normalizeLon(startLon + dLon * ease);
        c.state.zoom = startZoom + (clampedZoom - startZoom) * ease;
        if (t < 1) {
          c.scheduleRender(false);
          c.animFrame = requestAnimationFrame(tick);
        } else {
          c.isAnimating = false;
          c.animFrame = null;
          c.scheduleRender(true);
          c.persistState();
        }
      };
      c.animFrame = requestAnimationFrame(tick);
    }

    applyZoom(nextZoom, anchorPx = null, anchorPy = null) {
      const c = this.ctrl;
      const geo = c.routePlanner?.geo;
      const relief = c.state.enable3DTerrain === false ? 0 : (c.state.topoReliefScale ?? 1.0);
      if (geo && Number.isFinite(anchorPx) && Number.isFinite(anchorPy)) {
        const nextCam = geo.computeZoomToPoint({
          px: anchorPx,
          py: anchorPy,
          width: c.viewWidth || c.canvas?.clientWidth || window.innerWidth,
          height: c.viewHeight || c.canvas?.clientHeight || window.innerHeight,
          viewMode: c.state.viewMode,
          rotLat: c.state.rotLat,
          rotLon: c.state.rotLon,
          zoom: c.state.zoom,
          nextZoom,
          camPitch: c.state.camPitch ?? 0,
          camYaw: c.state.camYaw ?? 0,
          reliefScale: relief
        });
        c.state.rotLat = nextCam.rotLat;
        c.state.rotLon = nextCam.rotLon;
        c.state.zoom = nextCam.zoom;
      } else {
        const maxZ = c.state.viewMode === "3d" ? 80.0 : 32.0;
        c.state.zoom = Math.min(Math.max(nextZoom, 0.65), maxZ);
      }
      c.isZooming = true;
      clearTimeout(c.zoomSettleTimer);
      c.zoomSettleTimer = setTimeout(() => {
        c.isZooming = false;
        c.scheduleRender(true);
        c.persistState();
      }, 75);
      c.scheduleRender(true);
      c.schedulePersistState();
    }
    /** Ust arama cubugundan koordinat (lat, lon) veya yer/krater/inis sahasi aramasini isler */
    _normalizeSearch(str) {
      return String(str || "")
        .replace(/İ/g, "i").replace(/I/g, "i")
        .toLowerCase()
        .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
        .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
        .replace(/[^a-z0-9\s]+/g, " ")
        .trim();
    }

    _levenshtein(a, b) {
      const m = a.length, n = b.length;
      if (m === 0) return n;
      if (n === 0) return m;
      const dp = Array.from({ length: n + 1 }, (_, j) => j);
      for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
          const tmp = dp[j];
          dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
          prev = tmp;
        }
      }
      return dp[n];
    }

    _scoreCandidate(normQ, qTokens, fields) {
      let best = 0;
      for (const raw of fields) {
        if (!raw) continue;
        const normF = this._normalizeSearch(raw);
        if (!normF) continue;
        if (normF === normQ) return 1000;
        if (normF.includes(normQ)) best = Math.max(best, 800 - (normF.length - normQ.length));
        const fTokens = normF.split(/\s+/).filter(Boolean);
        if (qTokens.length && fTokens.length) {
          let totalScore = 0;
          let matched = 0;
          for (const qt of qTokens) {
            let tokBest = 0;
            for (const ft of fTokens) {
              if (ft === qt) { tokBest = 120; break; }
              if (ft.startsWith(qt) || qt.startsWith(ft)) { tokBest = Math.max(tokBest, 95); continue; }
              if (ft.includes(qt)) { tokBest = Math.max(tokBest, 80); continue; }
              const maxDist = Math.max(qt.length, ft.length) >= 5 ? 2 : 1;
              const d = this._levenshtein(qt, ft);
              if (d <= maxDist) tokBest = Math.max(tokBest, 70 - d * 18);
            }
            if (tokBest > 0) { matched++; totalScore += tokBest; }
          }
          if (matched === qTokens.length) best = Math.max(best, 200 + totalScore);
          else if (matched > 0) best = Math.max(best, totalScore * 0.6);
        }
      }
      return best;
    }

    handleSearchQuery(rawQuery) {
      const c = this.ctrl;
      const q = String(rawQuery || "").trim();
      if (!q) return;
      const coordMatch = q.match(/^\s*([-+]?\d+(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]\s*([-+]?\d+(?:\.\d+)?)\s*°?\s*([EWew])?\s*$/);
      if (coordMatch) {
        let lat = parseFloat(coordMatch[1]);
        let lon = parseFloat(coordMatch[3]);
        if (coordMatch[2] && coordMatch[2].toUpperCase() === "S") lat = -Math.abs(lat);
        if (coordMatch[4] && coordMatch[4].toUpperCase() === "W") lon = -Math.abs(lon);
        const lonValid = coordMatch[4] ? (lon >= -180 && lon <= 180) : (lon >= -180 && lon <= 360);
        if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lonValid) {
          const normLon = c.normalizeLon(lon);
          const label = `${lat.toFixed(2)}°, ${normLon.toFixed(2)}°`;
          c.setSearchDestination(label, lat, normLon, 2.2);
          c.showToast(`${label} → B`);
          return;
        }
      }

      const normQ = this._normalizeSearch(q);
      const qTokens = normQ.split(/\s+/).filter(Boolean);
      const landmarks = [
        { name: "Olympus Mons", alias: "olimpus olimpos dag", lat: 18.65, lon: -133.8, zoom: 2.35 },
        { name: "Elysium Mons", alias: "elsiyum elizyum dag", lat: 25.02, lon: 147.21, zoom: 2.3 },
        { name: "Ascraeus Mons", alias: "askreus dag", lat: 11.92, lon: -104.08, zoom: 2.3 },
        { name: "Pavonis Mons", alias: "tavus dag", lat: 1.48, lon: -112.96, zoom: 2.3 },
        { name: "Arsia Mons", alias: "arsiya dag", lat: -8.35, lon: -120.09, zoom: 2.3 },
        { name: "Alba Mons", alias: "alba patera dag", lat: 40.5, lon: -109.9, zoom: 2.15 },
        { name: "Aeolis Mons (Mount Sharp)", alias: "mount sharp sarp dagi gale", lat: -5.08, lon: 137.85, zoom: 2.6 },
        { name: "Albor Tholus", alias: "albor dag", lat: 18.87, lon: 150.47, zoom: 2.4 },
        { name: "Hecates Tholus", alias: "hekates dag", lat: 32.12, lon: 150.24, zoom: 2.4 },
        { name: "Apollinaris Mons", alias: "apollinaris patera dag", lat: -9.3, lon: 174.4, zoom: 2.3 },
        { name: "Biblis Tholus", alias: "biblis patera dag", lat: 2.52, lon: -124.54, zoom: 2.4 },
        { name: "Ulysses Tholus", alias: "ulises patera dag", lat: 2.96, lon: -121.55, zoom: 2.4 },
        { name: "Uranius Mons", alias: "uranius patera dag", lat: 26.9, lon: -92.15, zoom: 2.35 },
        { name: "Tharsis Montes", alias: "tarsis daglari", lat: 1.5, lon: -112.5, zoom: 1.85 },
        { name: "Valles Marineris", alias: "marineris vadisi kanyon", lat: -13.9, lon: -59.2, zoom: 2.25 },
        { name: "Candor Chasma", alias: "kandor kasma kanyon", lat: -6.5, lon: -70.9, zoom: 2.4 },
        { name: "Noctis Labyrinthus", alias: "noktis labirent", lat: -7.0, lon: -102.2, zoom: 2.3 },
        { name: "Kasei Valles", alias: "kasei vadisi", lat: 24.6, lon: -65.0, zoom: 2.1 },
        { name: "Ares Vallis", alias: "ares vadisi pathfinder", lat: 10.4, lon: -25.8, zoom: 2.2 },
        { name: "Hellas Planitia", alias: "helas havza ova", lat: -42.4, lon: 70.5, zoom: 1.85 },
        { name: "Argyre Planitia", alias: "arjire arjir havza", lat: -49.7, lon: -43.9, zoom: 1.95 },
        { name: "Isidis Planitia", alias: "isidis ovasi", lat: 12.9, lon: 87.0, zoom: 2.0 },
        { name: "Utopia Planitia", alias: "utopya ovasi", lat: 46.7, lon: 117.5, zoom: 1.95 },
        { name: "Acidalia Planitia", alias: "asidalya ovasi", lat: 49.8, lon: -20.7, zoom: 1.95 },
        { name: "Chryse Planitia", alias: "krise ovasi", lat: 28.4, lon: -39.7, zoom: 2.0 },
        { name: "Arcadia Planitia", alias: "arkadya ovasi", lat: 46.7, lon: -172.0, zoom: 1.95 },
        { name: "Amazonis Planitia", alias: "amazonis ovasi", lat: 24.8, lon: -164.0, zoom: 1.95 },
        { name: "Syrtis Major", alias: "sirtis major", lat: 8.4, lon: 69.5, zoom: 2.0 },
        { name: "Planum Boreum", alias: "kuzey kutbu north pole", lat: 88.0, lon: 15.0, zoom: 2.1 },
        { name: "Planum Australe", alias: "guney kutbu south pole", lat: -86.5, lon: 160.0, zoom: 2.1 }
      ];

      let bestMatch = null;
      let bestScore = 85;
      for (const cr of c.getLocalizedCraters()) {
        const sc = this._scoreCandidate(normQ, qTokens, [cr.name, cr.englishName, cr.id]);
        if (sc > bestScore) { bestScore = sc; bestMatch = { kind: "crater", item: cr }; }
      }
      for (const s of (c.landingSites || [])) {
        const sc = this._scoreCandidate(normQ, qTokens, [s.name, s.site_name, s.id]);
        if (sc > bestScore) { bestScore = sc; bestMatch = { kind: "site", item: s }; }
      }
      for (const l of landmarks) {
        const sc = this._scoreCandidate(normQ, qTokens, [l.name, l.alias]);
        if (sc > bestScore) { bestScore = sc; bestMatch = { kind: "landmark", item: l }; }
      }

      if (bestMatch) {
        if (bestMatch.kind === "crater") {
          const cr = bestMatch.item;
          c.flyToCraterById(cr.id);
          c.showToast(`${cr.name} (${cr.coordinates.lat.toFixed(2)}°, ${c.normalizeLon(cr.coordinates.lon).toFixed(2)}°) → B`);
          return;
        }
        if (bestMatch.kind === "site") {
          const s = bestMatch.item;
          const sLat = Number(s.latitude ?? s.lat);
          const sLon = c.normalizeLon(Number(s.longitude ?? s.lon));
          if (Number.isFinite(sLat) && Number.isFinite(sLon)) {
            c.setSearchDestination(s.name || s.site_name || q, sLat, sLon, 2.2, s.id);
            c.showToast(`${s.name || q} → B`);
            return;
          }
        }
        const lm = bestMatch.item;
        c.setSearchDestination(lm.name, lm.lat, lm.lon, lm.zoom);
        c.showToast(`${lm.name} → B`);
        return;
      }
      c.showToast(c.t("toastSearchNotFound", { query: q }), true);
    }

    /** Acik HUD panellerinin tuval uzerindeki cakismadan kacinma dikdortgenlerini hesaplar */
    computeUiAvoidRects() {
      const c = this.ctrl;
      if (!c.canvas || typeof document === "undefined") return [];
      const cr = c.canvas.getBoundingClientRect();
      const rects = [];
      const selectors = [
        "#top-left-dock .icon-square-btn",
        "#top-left-dock .top-nav-pill",
        "#settings-dropdown.open",
        "#btn-toggle-inspector",
        "#top-right-dock .inspector-card.open",
        "#btn-satellites-toggle",
        "#satellites-popover.open",
        "#bottom-right-dock .zoom-stack",
        "#bottom-right-dock .telemetry-strip",
        "#demo-bar-root .demo-panel",
        "#demo-bar-root .demo-collapsed-pill"
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const b = el.getBoundingClientRect();
        if (b.width <= 0 || b.height <= 0) continue;
        rects.push({ x: b.left - cr.left, y: b.top - cr.top, w: b.width, h: b.height });
      }
      return rects;
    }
  }

  ns.MarsMapInteractionHelper = MarsMapInteractionHelper;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-17: JSDoc, IIFE modul tanimi ve MarsMapInteractionHelper yapici metodu.
   - Satir 19-36: bindAll ve cancelAll; tum olay dinleyicilerini kurar ve aktif hareket/zamanlayicilari iptal eder.
   - Satir 38-137: bindCanvasEvents; 2D/3D surukleme (computePanStep), orbit, imlec odakli tekerlek zoom ve kapi korumali pick tiklamalari.
   - Satir 139-179: bindGlobalEvents; mouseup atalet baslatma, WASD/ok/R/F/C klavye gezinme ve dis tiklama kapama.
   - Satir 181-275: startInertia, animateTo ve applyZoom; yumusak kubik kamera gecisleri ve imlece odakli yakinlastirma.
   - Satir 277-370: handleSearchQuery ve computeUiAvoidRects; lokalize krater/0-360° arama ve HUD cakisma kutularini hesaplar.
   ========================================================================== */
