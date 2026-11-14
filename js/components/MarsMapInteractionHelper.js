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
        if (dx === 0 && dy === 0) return;
        if (dx * dx + dy * dy > 4) c.hasMoved = true;
        c.dragX = e.clientX;
        c.dragY = e.clientY;

        if (c.isOrbitDragging) {
          c.state.camYaw = ((c.state.camYaw || 0) + dx * 0.28 + 360) % 360;
          c.state.camPitch = Math.max(0, Math.min(68, (c.state.camPitch ?? 28) - dy * 0.24));
          const tiltBtn = document.getElementById("btn-3d-tilt");
          if (tiltBtn) tiltBtn.textContent = `${Math.round(c.state.camPitch)}°`;
          c.scheduleRender(false);
          c.schedulePersistState();
          return;
        }

        const vw = c.viewWidth || 1280;
        const vh = c.viewHeight || 720;
        let stepLon;
        let stepLat;
        if (c.state.viewMode === "3d") {
          const radius = Math.min(vw, vh) * 0.41 * Math.min(Math.max(c.state.zoom, 0.55), 80.0);
          const degPerPx = 57.29578 / Math.max(80, radius);
          const pitchRad = (Math.max(0, Math.min(72, c.state.camPitch ?? 28)) * Math.PI) / 180;
          const cosP = Math.max(0.38, Math.cos(pitchRad));
          const yawRad = ((c.state.camYaw || 0) * Math.PI) / 180;
          const cosY = Math.cos(yawRad);
          const sinY = Math.sin(yawRad);
          const dx1 = -dx;
          const dy1 = dy / cosP;
          const dEast = dx1 * cosY + dy1 * sinY;
          const dNorth = -dx1 * sinY + dy1 * cosY;
          const cosLat = Math.max(0.35, Math.cos((c.state.rotLat * Math.PI) / 180));
          stepLon = (dEast / cosLat) * degPerPx;
          stepLat = dNorth * degPerPx;
        } else {
          const mapW = Math.max(vw * 0.86, 620) * Math.min(Math.max(c.state.zoom, 0.65), 32.0);
          stepLon = (-dx / mapW) * 360;
          stepLat = (dy / (mapW * 0.5)) * 180;
        }
        c.velLon = stepLon * 0.42;
        c.velLat = stepLat * 0.42;
        c.state.rotLon = c.normalizeLon(c.state.rotLon + stepLon);
        c.state.rotLat = Math.max(-78, Math.min(78, c.state.rotLat + stepLat));
        c.hoverCoords.lat = c.state.rotLat;
        c.hoverCoords.lon = c.state.rotLon;
        c.scheduleRender(false);
      });

      c.canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const clampedDelta = Math.max(-160, Math.min(160, e.deltaY));
        this.applyZoom(c.state.zoom * Math.pow(1.002, -clampedDelta));
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
        c.persistState();
        c.refreshAll();
        c.showToast(c.t("toastDestPicked", { lat: geo.lat.toFixed(2), lon: geo.lon.toFixed(2) }));
        c.scheduleBackendRouteFetch(20);
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
        else if (k === "r") { c.state.camPitch = Math.min(68, (c.state.camPitch ?? 28) + 5); c.renderBottomRight(); }
        else if (k === "f") { c.state.camPitch = Math.max(0, (c.state.camPitch ?? 28) - 5); c.renderBottomRight(); }
        else if (k === "c" || k === " ") {
          const cr = c.getActiveCrater();
          c.state.camPitch = 28;
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

    applyZoom(nextZoom) {
      const c = this.ctrl;
      const maxZ = c.state.viewMode === "3d" ? 80.0 : 32.0;
      c.state.zoom = Math.min(Math.max(nextZoom, 0.65), maxZ);
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
  }

  ns.MarsMapInteractionHelper = MarsMapInteractionHelper;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-17: JSDoc, IIFE modul tanimi ve MarsMapInteractionHelper yapici metodu.
   - Satir 19-36: bindAll ve cancelAll; tum olay dinleyicilerini kurar ve aktif hareket/zamanlayicilari iptal eder.
   - Satir 38-141: bindCanvasEvents; 2D/3D surukleme, sag-tik/Shift 3D Pitch-Yaw orbit, tekerlek zoom ve hedef pick tiklamalari.
   - Satir 143-183: bindGlobalEvents; mouseup atalet baslatma, WASD/ok/R/F/C klavye gezinme ve dis tiklama kapama.
   - Satir 185-258: startInertia, animateTo ve applyZoom; yumusak kubik kamera gecisleri ve 3D/2D yakinlastirma kontrolu.
   ========================================================================== */
