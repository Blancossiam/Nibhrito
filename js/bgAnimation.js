/**
 * bgAnimation.js — Canvas-based animated background
 *
 * Draws animated nature elements layered over the static boat.png:
 *   - Moonlight reflection shimmering on the river surface
 *   - 3 large, softly drifting clouds moving slowly across the sky
 *   - Gentle water ripple rings expanding outward
 *   - Left palm fronds swaying slowly in a breeze
 *   - Subtle mist wisps drifting across the mid-river
 *
 * All motion is deliberately very slow and calming.
 */

class BackgroundAnimation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.t      = 0;          // global time counter
    this.raf    = null;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Seed cloud positions
    this.clouds = [
      { x: 0.55, y: 0.08, rx: 0.18, ry: 0.045, speed: 0.000035, opacity: 0.05 },
      { x: 0.72, y: 0.12, rx: 0.12, ry: 0.030, speed: 0.000022, opacity: 0.04 },
      { x: 0.30, y: 0.06, rx: 0.10, ry: 0.025, speed: 0.000028, opacity: 0.035 },
    ];

    // Ripple rings on the water
    this.ripples = [];
    this._nextRippleIn = 0;

    // Mist wisps
    this.wisps = [
      { x: 0.10, y: 0.60, width: 0.55, speed: 0.000015, opacity: 0.06, phase: 0.0 },
      { x: -0.05, y: 0.65, width: 0.45, speed: 0.000010, opacity: 0.04, phase: 1.2 },
      { x: 0.35, y: 0.58, width: 0.40, speed: 0.000018, opacity: 0.03, phase: 2.5 },
    ];

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
  }

  start() {
    if (this.reducedMotion) return; // respect system preference
    const loop = (timestamp) => {
      this.t = timestamp;
      this._draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  _draw() {
    const { ctx, w, h, t } = this;
    ctx.clearRect(0, 0, w, h);

    this._drawMoonReflection(t);
    this._drawClouds(t);
    this._drawMistWisps(t);
    this._updateRipples(t);
    this._drawRipples();
    this._drawLeafSway(t);
  }

  // ── Moon reflection shimmer on water ──────────────────────
  _drawMoonReflection(t) {
    const { ctx, w, h } = this;
    // Moon is roughly at 62% x, 22% y in the image.
    // Reflection runs vertically down the center of the river.
    const cx = w * 0.63;
    const waterTop   = h * 0.50;
    const waterBtm   = h * 1.0;

    // The reflection column — vertical gradient strip
    const grad = ctx.createLinearGradient(cx, waterTop, cx, waterBtm);
    grad.addColorStop(0.0, 'rgba(230, 240, 255, 0.00)');
    grad.addColorStop(0.15, 'rgba(230, 240, 255, 0.07)');
    grad.addColorStop(0.40, 'rgba(210, 230, 255, 0.10)');
    grad.addColorStop(0.70, 'rgba(190, 215, 255, 0.06)');
    grad.addColorStop(1.0, 'rgba(190, 215, 255, 0.00)');

    // Oscillate the width — makes it feel like water is moving
    const shimmerW = 28 + Math.sin(t * 0.0008) * 12;
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 0.0006);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, (waterTop + waterBtm) * 0.5, shimmerW, (waterBtm - waterTop) * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Horizontal ripple bands — thin horizontal lines that drift down
    for (let i = 0; i < 5; i++) {
      const phase = (t * 0.00018 + i * 0.38) % 1.0;
      const y     = waterTop + phase * (h - waterTop);
      const amp   = 20 + i * 6;
      const alpha = (1 - phase) * 0.045;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(200, 225, 255, 1)';
      ctx.lineWidth   = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - amp, y);
      ctx.lineTo(cx + amp, y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Slowly drifting soft clouds ────────────────────────────
  _drawClouds(t) {
    const { ctx, w, h } = this;

    this.clouds.forEach((c) => {
      // Move cloud slowly left to right; wrap around
      const xPos = ((c.x + c.speed * t) % 1.35) - 0.15;
      const cx   = xPos * w;
      const cy   = c.y * h;
      const rx   = c.rx * w;
      const ry   = c.ry * h;

      ctx.save();
      ctx.globalAlpha = c.opacity + 0.02 * Math.sin(t * 0.0003 + c.x * 10);

      // Draw cloud as a cluster of soft overlapping ellipses
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grad.addColorStop(0.0, 'rgba(180, 200, 240, 0.95)');
      grad.addColorStop(0.5, 'rgba(160, 190, 230, 0.50)');
      grad.addColorStop(1.0, 'rgba(140, 170, 220, 0.00)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx,         cy,       rx,       ry,       0, 0, Math.PI * 2);
      ctx.fill();

      // Second puff — slightly offset
      ctx.beginPath();
      ctx.ellipse(cx - rx * 0.35, cy + ry * 0.15, rx * 0.65, ry * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(cx + rx * 0.38, cy + ry * 0.10, rx * 0.55, ry * 0.70, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  // ── Mist wisps drifting horizontally ──────────────────────
  _drawMistWisps(t) {
    const { ctx, w, h } = this;

    this.wisps.forEach((wisp) => {
      // Slowly drift right, wrap
      const xPos = ((wisp.x + wisp.speed * t) % 1.4) - 0.2;
      const cx   = (xPos + wisp.width * 0.5) * w;
      const cy   = wisp.y * h + Math.sin(t * 0.0004 + wisp.phase) * h * 0.015;
      const rx   = wisp.width * w * 0.5;
      const ry   = h * 0.028;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grad.addColorStop(0, `rgba(190, 210, 240, ${wisp.opacity})`);
      grad.addColorStop(1, 'rgba(190, 210, 240, 0)');

      ctx.save();
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 0.0005 + wisp.phase);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ── Water ripple rings ─────────────────────────────────────
  _updateRipples(t) {
    // Spawn a new ripple periodically
    if (t > this._nextRippleIn) {
      // Ripple in the river area (50–85% vertical, 35–75% horizontal)
      this.ripples.push({
        x:       this.w * (0.35 + Math.random() * 0.40),
        y:       this.h * (0.52 + Math.random() * 0.30),
        r:       0,
        maxR:    30 + Math.random() * 25,
        born:    t,
        life:    3500 + Math.random() * 2500,
      });
      this._nextRippleIn = t + 2200 + Math.random() * 2000;
    }

    // Remove dead ripples
    this.ripples = this.ripples.filter((rp) => (t - rp.born) < rp.life);
  }

  _drawRipples() {
    const { ctx, t } = this;

    this.ripples.forEach((rp) => {
      const progress = (t - rp.born) / rp.life;
      const r        = rp.maxR * progress;
      const alpha    = (1 - progress) * 0.10;

      ctx.save();
      ctx.globalAlpha   = alpha;
      ctx.strokeStyle   = 'rgba(200, 225, 255, 1)';
      ctx.lineWidth     = 0.8;
      ctx.beginPath();
      // Flatten into horizontal ellipse (water surface perspective)
      ctx.ellipse(rp.x, rp.y, r, r * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  // ── Palm leaf sway ─────────────────────────────────────────
  _drawLeafSway(t) {
    const { ctx, w, h } = this;

    // The large palm is on the left ~10% x, fronds spread upper-left
    const trunkX = w * 0.10;
    const trunkY = h * 0.55;

    // Draw 5 gentle fronds
    const fronds = [
      { len: 0.22, baseAngle: -1.1, sway: 0.04, phase: 0.0 },
      { len: 0.18, baseAngle: -0.6, sway: 0.05, phase: 0.8 },
      { len: 0.15, baseAngle: -1.6, sway: 0.03, phase: 1.5 },
      { len: 0.20, baseAngle: -0.3, sway: 0.04, phase: 2.1 },
      { len: 0.12, baseAngle: -2.0, sway: 0.03, phase: 0.5 },
    ];

    fronds.forEach((f) => {
      const angle = f.baseAngle + Math.sin(t * 0.00055 + f.phase) * f.sway;
      const len   = f.len * w;

      // Control point for the curving frond
      const cp1x = trunkX + Math.cos(angle - 0.3) * len * 0.4;
      const cp1y = trunkY + Math.sin(angle - 0.3) * len * 0.4;
      const cp2x = trunkX + Math.cos(angle + 0.15) * len * 0.75;
      const cp2y = trunkY + Math.sin(angle + 0.15) * len * 0.75;
      const endx = trunkX + Math.cos(angle + 0.3) * len;
      const endy = trunkY + Math.sin(angle + 0.3) * len;

      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = 'rgba(30, 60, 30, 1)';
      ctx.lineWidth   = 2;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(trunkX, trunkY);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endx, endy);
      ctx.stroke();

      // Leaflets branching off the frond
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        const frac  = i / (steps + 1);
        const bx    = trunkX + (endx - trunkX) * frac;
        const by    = trunkY + (endy - trunkY) * frac;
        const leafL = len * 0.10 * (1 - frac * 0.5);
        const side  = i % 2 === 0 ? 1 : -1;
        const lax   = bx + Math.cos(angle + Math.PI * 0.5 * side) * leafL;
        const lay   = by + Math.sin(angle + Math.PI * 0.5 * side) * leafL;

        ctx.globalAlpha = 0.10;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(lax, lay);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
}

// ── Boot ─────────────────────────────────────────────────────
let _anim = null;

export function startBackgroundAnimation() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  if (_anim) _anim.stop();
  _anim = new BackgroundAnimation(canvas);
  _anim.start();
}

export function stopBackgroundAnimation() {
  _anim?.stop();
}
