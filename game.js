(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const momentumEl = document.getElementById('momentum');
  const judgeEl = document.getElementById('judge');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('start');

  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    rebuildTerrainConfig();
  }
  window.addEventListener('resize', resize);

  // ---------- Terrain ----------
  // Sum of sines. y is canvas-y (positive = down). Peaks have small y.
  let TERRAIN;
  function rebuildTerrainConfig() {
    // Two layers: a strong primary so peaks/troughs are at predictable
    // intervals (rhythmic chaining), plus a tiny high-frequency wobble
    // for visual texture only. Keep secondary's a*f small relative to
    // the primary so it doesn't move where the peaks are.
    // Primary controls jump rhythm. a*f^2 governs curvature at the peak,
    // which sets the minimum vx required to launch: v_min = sqrt(G / (a*f^2)).
    // Tuned so a player who just made it over one peak still launches off the next.
    TERRAIN = {
      base: H * 0.60,
      layers: [
        { a: Math.min(120, H * 0.20), f: 0.0120, p: Math.PI / 2 },
        { a: 8,                        f: 0.0300, p: 1.0 },
      ],
    };
  }
  resize();

  function terrainY(x) {
    let y = TERRAIN.base;
    for (const L of TERRAIN.layers) y -= L.a * Math.sin(x * L.f + L.p);
    return y;
  }
  function terrainSlope(x) {
    let s = 0;
    for (const L of TERRAIN.layers) s -= L.a * L.f * Math.cos(x * L.f + L.p);
    return s;
  }
  function terrainAngle(x) { return Math.atan(terrainSlope(x)); }

  // ---------- Constants ----------
  const G = 1400;          // px/s^2 baseline gravity
  const G_DIVE = 3200;     // when tap held mid-air
  const G_FLOAT = 900;     // when tap released mid-air (slight float, makes dive feel meaningful)
  const FRICTION = 0.015;  // ground friction (per second, multiplicative)
  const SPEED_MIN = 90;
  const SPEED_BASE = 440;
  const SPEED_MAX = 1200;
  const PERFECT_DEG = 9;
  const GOOD_DEG = 22;
  const PIXELS_PER_METER = 28;

  // ---------- State ----------
  const state = {
    running: false, over: false,
    t: 0,
    x: 0, y: 0,
    vx: SPEED_BASE, vy: 0,
    speed: SPEED_BASE,    // scalar speed used while grounded
    grounded: true,
    tapHeld: false,
    momentum: 0.6,
    distance: 0,
    cameraX: 0, cameraY: 0,
    sparkles: [],
    trail: [],
    bestStreak: 0, streak: 0,
    flashJudge: null,
    flashJudgeT: 0,
    lastLaunch: null,    // {x, y, speed}
    lastLanding: null,   // {x, y, judgement, t}
  };

  function reset() {
    state.running = true; state.over = false;
    state.t = 0;
    state.x = 60;
    state.y = terrainY(state.x);
    state.speed = SPEED_BASE;
    const a = terrainAngle(state.x);
    state.vx = state.speed * Math.cos(a);
    state.vy = state.speed * Math.sin(a);
    state.grounded = true;
    state.tapHeld = false;
    state.momentum = 0.7;
    state.distance = 0;
    state.streak = 0;
    state.cameraX = 0; state.cameraY = 0;
    state.sparkles.length = 0;
    state.trail.length = 0;
    state.lastLaunch = null;
    state.lastLanding = null;
    showJudge('', null);
  }

  // ---------- Input ----------
  function down(e) {
    if (!state.running) {
      if (state.over) { /* overlay button handles restart */ }
      return;
    }
    state.tapHeld = true;
    e.preventDefault();
  }
  function up(e) {
    state.tapHeld = false;
    e.preventDefault();
  }
  canvas.addEventListener('touchstart', down, { passive: false });
  canvas.addEventListener('touchend', up, { passive: false });
  canvas.addEventListener('touchcancel', up, { passive: false });
  canvas.addEventListener('mousedown', down);
  canvas.addEventListener('mouseup', up);
  canvas.addEventListener('mouseleave', up);
  window.addEventListener('keydown', e => {
    if (!state.running) return;
    if (e.code === 'Space' || e.code === 'ArrowDown') { state.tapHeld = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space' || e.code === 'ArrowDown') { state.tapHeld = false; e.preventDefault(); }
  });

  startBtn.addEventListener('click', () => {
    overlay.classList.remove('visible');
    reset();
  });

  // ---------- Loop ----------
  let lastT = 0;
  function frame(ts) {
    const now = ts / 1000;
    const dt = Math.min(0.033, lastT ? now - lastT : 0.016);
    lastT = now;
    if (state.running) update(dt);
    render(dt);
    requestAnimationFrame(frame);
  }

  function update(dt) {
    state.t += dt;

    if (state.grounded) updateGrounded(dt);
    else updateAir(dt);

    // Gentle global momentum decay so a stalled player will eventually fail.
    state.momentum = Math.max(0, state.momentum - 0.025 * dt);

    // Camera trails the player.
    const targetCamX = state.x - W * 0.32;
    const targetCamY = state.y - H * 0.55;
    const k = 6;
    state.cameraX += (targetCamX - state.cameraX) * Math.min(1, k * dt);
    state.cameraY += (targetCamY - state.cameraY) * Math.min(1, k * dt);
    // Don't let the camera show too much sky when on flat terrain
    state.cameraY = Math.min(state.cameraY, terrainY(state.x) - H * 0.45);

    state.distance = Math.max(state.distance, state.x / PIXELS_PER_METER);

    // Trail.
    state.trail.push({ x: state.x, y: state.y, t: state.t, air: !state.grounded });
    if (state.trail.length > 80) state.trail.shift();

    // Sparkles.
    for (const s of state.sparkles) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 900 * dt;
    }
    for (let i = state.sparkles.length - 1; i >= 0; i--) {
      if (state.sparkles[i].age >= state.sparkles[i].life) state.sparkles.splice(i, 1);
    }

    if (state.flashJudgeT > 0) state.flashJudgeT = Math.max(0, state.flashJudgeT - dt);

    // HUD.
    scoreEl.textContent = Math.floor(state.distance) + ' m';
    momentumEl.style.width = (state.momentum * 100).toFixed(0) + '%';

    // Game over: stalled out.
    if (state.grounded && state.speed < 60 && state.momentum <= 0.001) gameOver();
  }

  function updateGrounded(dt) {
    const angle = terrainAngle(state.x);
    // Gravity component along surface (downhill positive in canvas convention).
    state.speed += G * Math.sin(angle) * dt;
    // Friction.
    state.speed *= (1 - FRICTION * dt);
    // Min/max clamps.
    if (state.speed < SPEED_MIN) state.speed = SPEED_MIN;
    if (state.speed > SPEED_MAX) state.speed = SPEED_MAX;

    // Step forward along the surface.
    const dx = state.speed * Math.cos(angle) * dt;
    const newX = state.x + dx;
    const newSurfaceY = terrainY(newX);

    // Where would we be on a free ballistic step from here?
    const ballisticY = state.y + state.speed * Math.sin(angle) * dt + 0.5 * G * dt * dt;

    if (newSurfaceY > ballisticY + 0.5) {
      // Surface fell away faster than gravity would carry us — launch!
      state.grounded = false;
      state.x = newX;
      state.y = ballisticY;
      state.vx = state.speed * Math.cos(angle);
      state.vy = state.speed * Math.sin(angle) + G * dt;
      state.lastLaunch = { x: state.x, y: state.y, speed: state.speed };
    } else {
      state.x = newX;
      state.y = newSurfaceY;
      // Update vx/vy in case we transition out of grounded next frame.
      state.vx = state.speed * Math.cos(angle);
      state.vy = state.speed * Math.sin(angle);
    }
  }

  function updateAir(dt) {
    const g = state.tapHeld ? G_DIVE : G_FLOAT;
    state.vy += g * dt;
    state.x += state.vx * dt;
    state.y += state.vy * dt;

    const groundY = terrainY(state.x);
    if (state.y >= groundY) {
      // Land.
      state.y = groundY;
      const landAngle = terrainAngle(state.x);
      const flightAngle = Math.atan2(state.vy, state.vx);
      const speed = Math.hypot(state.vx, state.vy);
      let diff = Math.abs(flightAngle - landAngle);
      // Normalize tiny floating errors; we only care about within-quadrant difference.
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      const degDiff = diff * 180 / Math.PI;

      let judgement, retain;
      if (degDiff <= PERFECT_DEG) {
        judgement = 'perfect';
        // Bigger boost when chaining: each consecutive perfect compounds.
        retain = 1.22 + Math.min(0.18, state.streak * 0.03);
      } else if (degDiff <= GOOD_DEG) {
        judgement = 'good';
        retain = 1.00;          // exactly carry
      } else {
        judgement = 'miss';
        // The harder the slap, the more energy lost.
        const t = Math.min(1, degDiff / 90);
        retain = 0.30 + 0.45 * (1 - t);  // 0.30..0.75
      }
      state.speed = Math.max(SPEED_MIN * 0.6, Math.min(SPEED_MAX, speed * retain));
      // Project onto surface tangent so motion continues smoothly.
      state.vx = state.speed * Math.cos(landAngle);
      state.vy = state.speed * Math.sin(landAngle);
      state.grounded = true;

      // Momentum & streak.
      if (judgement === 'perfect') {
        state.streak += 1;
        state.momentum = Math.min(1, state.momentum + 0.22);
        burst(state.x, state.y, '#06d6a0', 22);
      } else if (judgement === 'good') {
        state.streak = Math.max(state.streak, 1);
        state.momentum = Math.min(1, state.momentum + 0.07);
        burst(state.x, state.y, '#ffd166', 12);
      } else {
        state.streak = 0;
        state.momentum = Math.max(0, state.momentum - 0.22);
        burst(state.x, state.y, '#ef476f', 16);
      }
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.lastLanding = { x: state.x, y: state.y, judgement, t: state.t };
      showJudge(judgement.toUpperCase(), judgement);
    }
  }

  // ---------- Helpers ----------
  function showJudge(text, cls) {
    judgeEl.textContent = text + (cls === 'perfect' && state.streak > 1 ? `  ×${state.streak}` : '');
    judgeEl.className = '';
    if (cls) {
      judgeEl.classList.add('show', cls);
      clearTimeout(showJudge._t);
      showJudge._t = setTimeout(() => judgeEl.classList.remove('show'), 600);
    }
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 280;
      state.sparkles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 80,
        life: 0.4 + Math.random() * 0.5,
        age: 0,
        color,
      });
    }
  }

  function gameOver() {
    if (state.over) return;
    state.over = true;
    state.running = false;
    overlay.querySelector('h1').textContent = 'Wiped Out!';
    overlay.querySelector('p').innerHTML =
      `Distance: <b>${Math.floor(state.distance)} m</b><br/>Best perfect streak: <b>${state.bestStreak}</b>`;
    overlay.querySelector('button').textContent = 'Slide Again';
    overlay.classList.add('visible');
  }

  // ---------- Render ----------
  function render(dt) {
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawParallax(0.20, '#bcdcff', 180, 0.0026, 0.7);
    drawParallax(0.45, '#9bc6ee', 120, 0.0035, 1.4);
    drawTerrain();
    drawTrail();
    drawPlayer();
    drawSparkles();
    drawDiveHint();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#cfe9ff');
    g.addColorStop(1, '#7fb6e6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawParallax(scrollFactor, color, amplitude, freq, phase) {
    const camX = state.cameraX * scrollFactor;
    const horizon = TERRAIN.base - amplitude * 0.2 - state.cameraY * 0.15;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, H + 20);
    for (let sx = -10; sx <= W + 10; sx += 6) {
      const wx = sx + camX;
      const y = horizon - amplitude * (0.5 + 0.5 * Math.sin(wx * freq + phase));
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(W + 10, H + 20);
    ctx.closePath();
    ctx.fill();
  }

  function drawTerrain() {
    const left = state.cameraX - 20;
    const right = state.cameraX + W + 20;
    ctx.beginPath();
    ctx.moveTo(-20 + 0, H + 40);
    let first = true;
    for (let x = left; x <= right; x += 4) {
      const sx = x - state.cameraX;
      const sy = terrainY(x) - state.cameraY;
      if (first) { ctx.lineTo(sx, sy); first = false; }
      else ctx.lineTo(sx, sy);
    }
    ctx.lineTo(W + 20, H + 40);
    ctx.closePath();

    const g = ctx.createLinearGradient(0, terrainY(state.x) - state.cameraY - 60, 0, H);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#dceffd');
    g.addColorStop(1, '#7ba9d2');
    ctx.fillStyle = g;
    ctx.fill();

    // Top crest line.
    ctx.beginPath();
    let started = false;
    for (let x = left; x <= right; x += 4) {
      const sx = x - state.cameraX;
      const sy = terrainY(x) - state.cameraY;
      if (!started) { ctx.moveTo(sx, sy); started = true; }
      else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = 'rgba(11,37,69,.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawTrail() {
    if (state.trail.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    for (let i = 1; i < state.trail.length; i++) {
      const a = state.trail[i - 1], b = state.trail[i];
      const ax = a.x - state.cameraX, ay = a.y - state.cameraY;
      const bx = b.x - state.cameraX, by = b.y - state.cameraY;
      const fade = i / state.trail.length;
      ctx.strokeStyle = b.air
        ? `rgba(255,255,255,${0.15 + 0.45 * fade})`
        : `rgba(11,37,69,${0.10 + 0.20 * fade})`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const sx = state.x - state.cameraX;
    const sy = state.y - state.cameraY;
    const ang = state.grounded
      ? terrainAngle(state.x)
      : Math.atan2(state.vy, state.vx);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang);

    // Squash a bit when diving for feedback.
    const sqX = state.tapHeld && !state.grounded ? 1.05 : 1;
    const sqY = state.tapHeld && !state.grounded ? 0.85 : 1;
    ctx.scale(sqX, sqY);

    // Board (drawn so the bottom touches y=0 = surface).
    ctx.fillStyle = '#0b2545';
    roundRect(ctx, -20, -6, 40, 6, 3);
    ctx.fill();

    // Body
    ctx.fillStyle = '#ef476f';
    roundRect(ctx, -10, -22, 20, 18, 6);
    ctx.fill();

    // Head
    ctx.fillStyle = '#ffd9b3';
    ctx.beginPath();
    ctx.arc(2, -28, 7, 0, Math.PI * 2);
    ctx.fill();

    // Beanie
    ctx.fillStyle = '#06d6a0';
    roundRect(ctx, -4, -36, 14, 7, 3);
    ctx.fill();

    ctx.restore();
  }

  function drawSparkles() {
    for (const s of state.sparkles) {
      const sx = s.x - state.cameraX, sy = s.y - state.cameraY;
      const a = 1 - s.age / s.life;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = Math.max(0, a);
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + a * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawDiveHint() {
    if (state.grounded || !state.tapHeld) return;
    const sx = state.x - state.cameraX;
    const sy = state.y - state.cameraY;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, sy + 4);
    ctx.lineTo(sx, sy + 28);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  requestAnimationFrame(frame);
})();
