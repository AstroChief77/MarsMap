/**
 * Tehlike bölgesi etiketleri (asit yağmuru, fırtına, radyasyon).
 * Normal pin etiketlerinden ayrı: uyarı üçgeni, bant şeridi, kalın kenarlık ve
 * noktaya inen bir çizgiyle "burası tehlikeli" hissi verir.
 */
(function (ns) {
  "use strict";

  const Helper = ns.OverlayDrawHelper;
  if (!Helper) return;

  const AMBER = "#d9a521";

  function path(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // sarı-siyah diyagonal şerit (yol işi bandı gibi)
  function tape(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = AMBER;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#1a1208";
    const step = 8;
    for (let sx = x - h; sx < x + w + h; sx += step * 2) {
      ctx.beginPath();
      ctx.moveTo(sx, y + h);
      ctx.lineTo(sx + step, y + h);
      ctx.lineTo(sx + step + h, y);
      ctx.lineTo(sx + h, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function warnTriangle(ctx, cx, cy, size) {
    const h = size * 0.9;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(size / 2, h / 2);
    ctx.lineTo(-size / 2, h / 2);
    ctx.closePath();
    ctx.fillStyle = AMBER;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#1a1208";
    ctx.stroke();
    ctx.fillStyle = "#1a1208";
    ctx.fillRect(-0.9, -h / 2 + 4.2, 1.8, h * 0.34);
    ctx.beginPath();
    ctx.arc(0, h / 2 - 3.2, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  Helper.prototype.drawDangerLabel = function (ctx, px, py, labelText, accentHex = "#b8512f") {
    if (!labelText) return;
    ctx.save();
    ctx.font = "700 11px 'Public Sans Web', sans-serif";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0.3px";
    const text = String(labelText).toUpperCase();
    const iconW = 30;
    const boxH = 30;
    const tapeH = 4;
    const boxW = Math.ceil(ctx.measureText(text).width + iconW + 18);
    const gap = 28;

    const offsets = [
      [0, 0], [0, -24], [0, gap * 2 + boxH],
      [-(boxW * 0.55 + 10), 0], [boxW * 0.55 + 10, 0],
      [-(boxW * 0.55 + 10), gap * 2 + boxH], [boxW * 0.55 + 10, gap * 2 + boxH]
    ];
    const slot = this.claimLabelSlot(px - boxW / 2, py - boxH - gap, boxW, boxH, offsets, false);
    if (!slot.placed) { ctx.restore(); return; }
    const { x, y } = slot;

    // noktadan etikete inen çizgi + hedef halkası
    const lx = Math.max(x + 6, Math.min(px, x + boxW - 6));
    const ly = y + boxH / 2 < py ? y + boxH : y;
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = accentHex;
    ctx.fill();

    // gövde
    path(ctx, x, y, boxW, boxH, 2);
    ctx.fillStyle = "#2a1210";
    ctx.fill();

    ctx.save();
    path(ctx, x, y, boxW, boxH, 2);
    ctx.clip();
    tape(ctx, x, y + boxH - tapeH, boxW, tapeH);
    tape(ctx, x, y, boxW, tapeH);
    ctx.restore();

    path(ctx, x, y, boxW, boxH, 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = accentHex;
    ctx.stroke();

    warnTriangle(ctx, x + iconW / 2 + 1, y + boxH / 2, 17);

    ctx.fillStyle = "#f2ebe3";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + iconW + 6, y + boxH / 2 + 0.5);
    ctx.restore();
  };
})(window.AstroChief = window.AstroChief || {});
