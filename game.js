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
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Game state ----------
  const state = {
    running: false,
    over: false,
    t: 0,                // seconds
    distance: 0,         // meters traveled
    worldY: 0,           // camera y (world units, increases as we go down)
    speed: 280,          // px/sec downward
    targetSpeed: 280,
    maxSpeed: 720,
    minSpeed: 120,
    momentum: 0.6,       // 0..1
    momentumDecay: 0.045, // per second
    player: { x: 0, lane: 0, leanX: 0 }, // x is screen x
    inputX: null,        // active touch x
    gates: [],           // [{worldY, hit:false, judged:null}]
    nextGateY: 0,
    sparkles: [],
    trail: [],
  };

  function reset() {
    state.running = true;
    state.over = false;
    state.t = 0;
    state.distance = 0;
    state.worldY = 0;
    state.speed = 280;
    state.targetSpeed = 280;
    state.momentum = 0.6;
    state.player.x = W / 2;
    state.player.leanX = 0;
    state.gates.length = 0;
    state.sparkles.length = 0;
    state.trail.length = 0;
    state.nextGateY = 320;
    showJudge('', null);
  }

  // ---------- Input ----------
  function pointerDown(e) {
    if (!state.running) return;
    const p = pt(e);
    state.inputX = p.x;
    tryJudgeTap();
    e.preventDefault();
  }
  function pointerMove(e) {
    if (!state.running) return;
    if (state.inputX === null) return;
    const p = pt(e);
    state.inputX = p.x;
    e.preventDefault();
  }
  function pointerUp(e) {
    state.inputX = null;
    e.preventDefault();
  }
  function pt(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }
  canvas.addEventListener('touchstart', pointerDown, { passive: false });
  canvas.addEventListener('touchmove', pointerMove, { passive: false });
  canvas.addEventListener('touchend', pointerUp, { passive: false });
  canvas.addEventListener('touchcancel', pointerUp, { passive: false });
  canvas.addEventListener('mousedown', pointerDown);
  canvas.addEventListener('mousemove', pointerMove);
  canvas.addEventListener('mouseup', pointerUp);

  startBtn.addEventListener('click', () => {
    overlay.classList.remove('visible');
    reset();
  });

  // ---------- Gates ----------
  // A "gate" is a horizontal sweet-spot strip on the slope.
  // The center has a PERFECT band, surrounded by a GOOD band, then nothing.
  // If the player passes a gate without tapping in time, it's a MISS.
  function spawnGate() {
    // Spacing shrinks as momentum/speed grows for tighter rhythm.
    const spacing = Math.max(220, 460 - state.speed * 0.25);
    const cx = 80 + Math.random() * (W - 160);
    const width = Math.max(120, Math.min(W * 0.6, 260 - state.speed * 0.08));
    state.gates.push({
      worldY: state.nextGateY,
      cx, width,
      perfectBand: 22, // px tolerance from center along travel direction
      goodBand: 60,
      hit: false,
      judged: null,
      pulse: 0,
    });
    state.nextGateY += spacing;
  }

  function tryJudgeTap() {
    // Find the next un-judged gate visible/upcoming.
    const playerY = state.worldY + playerScreenY();
    let gate = null;
    for (const g of state.gates) {
      if (g.judged) continue;
      if (g.worldY < state.worldY - 40) continue; // already passed
      gate = g; break;
    }
    if (!gate) return;
    const dy = Math.abs(gate.worldY - playerY);
    const dx = Math.abs(gate.cx - state.player.x);
    let judgement = 'miss';
    // Lateral: must be roughly inside the gate's lateral span to count at all
    const insideLateral = dx <= gate.width * 0.5 + 30;
    if (insideLateral && dy <= gate.perfectBand) judgement = 'perfect';
    else if (insideLateral && dy <= gate.goodBand) judgement = 'good';
    applyJudgement(gate, judgement);
  }

  function applyJudgement(gate, j) {
    gate.judged = j;
    gate.pulse = 1;
    if (j === 'perfect') {
      state.momentum = Math.min(1, state.momentum + 0.18);
      state.targetSpeed = Math.min(state.maxSpeed, state.targetSpeed + 70);
      burst(gate.cx, gate.worldY, '#06d6a0', 22);
    } else if (j === 'good') {
      state.momentum = Math.min(1, state.momentum + 0.05);
      state.targetSpeed = Math.min(state.maxSpeed, state.targetSpeed + 18);
      burst(gate.cx, gate.worldY, '#ffd166', 10);
    } else {
      state.momentum = Math.max(0, state.momentum - 0.18);
      state.targetSpeed = Math.max(state.minSpeed, state.targetSpeed - 110);
      burst(gate.cx, gate.worldY, '#ef476f', 8);
    }
    showJudge(j.toUpperCase(), j);
  }

  function showJudge(text, cls) {
    judgeEl.textContent = text;
    judgeEl.className = '';
    if (cls) {
      judgeEl.classList.add('show', cls);
      clearTimeout(showJudge._t);
      showJudge._t = setTimeout(() => judgeEl.classList.remove('show'), 500);
    }
  }

  function burst(worldX, worldY, color, n) {
    for (let i = 0; i < n; i++) {
      state.sparkles.push({
        x: worldX, y: worldY,
        vx: (Math.random() - 0.5) * 260,
        vy: (Math.random() - 0.5) * 260 - 60,
        life: 0.5 + Math.random() * 0.4,
        age: 0, color,
      });
    }
  }

  function playerScreenY() { return H * 0.72; }

  // ---------- Update ----------
  let lastT = 0;
  function frame(ts) {
    const now = ts / 1000;
    const dt = Math.min(0.033, lastT ? now - lastT : 0.016);
    lastT = now;
    if (state.running) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    state.t += dt;

    // Steering: drag left/right relative to player x.
    if (state.inputX !== null) {
      const target = state.inputX;
      const k = 12; // smoothing
      state.player.x += (target - state.player.x) * Math.min(1, k * dt);
    }
    state.player.x = Math.max(28, Math.min(W - 28, state.player.x));
    // Lean is derivative-ish: how fast we are moving sideways
    const dx = (state.inputX !== null) ? (state.inputX - state.player.x) : 0;
    state.player.leanX = clamp(dx / 80, -1, 1);

    // Momentum decay; speed eases toward targetSpeed which drifts down with momentum.
    state.momentum = Math.max(0, state.momentum - state.momentumDecay * dt);
    state.targetSpeed = Math.max(state.minSpeed, state.targetSpeed - 35 * dt);
    // Momentum couples to speed: higher momentum -> raises floor of targetSpeed.
    const floor = state.minSpeed + state.momentum * (state.maxSpeed - state.minSpeed) * 0.85;
    if (state.targetSpeed < floor) state.targetSpeed = floor;
    state.speed += (state.targetSpeed - state.speed) * Math.min(1, 3 * dt);

    // Advance world.
    state.worldY += state.speed * dt;
    state.distance += state.speed * dt / 28; // ~28 px per meter

    // Spawn gates ahead.
    while (state.nextGateY < state.worldY + H + 200) spawnGate();

    // Auto-judge missed gates.
    const playerY = state.worldY + playerScreenY();
    for (const g of state.gates) {
      if (!g.judged && g.worldY < playerY - g.goodBand) {
        applyJudgement(g, 'miss');
      }
      if (g.pulse > 0) g.pulse = Math.max(0, g.pulse - dt * 2.2);
    }
    // Cull old gates.
    while (state.gates.length && state.gates[0].worldY < state.worldY - 200) state.gates.shift();

    // Sparkles.
    for (const s of state.sparkles) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 480 * dt;
    }
    for (let i = state.sparkles.length - 1; i >= 0; i--) {
      if (state.sparkles[i].age >= state.sparkles[i].life) state.sparkles.splice(i, 1);
    }

    // Trail.
    state.trail.push({ x: state.player.x, worldY: state.worldY + playerScreenY() });
    if (state.trail.length > 60) state.trail.shift();

    // Game over if momentum hits 0 and speed bottoms out.
    if (state.momentum <= 0 && state.speed <= state.minSpeed + 1) {
      gameOver();
    }

    // HUD.
    scoreEl.textContent = Math.floor(state.distance) + ' m';
    momentumEl.style.width = (state.momentum * 100).toFixed(0) + '%';
  }

  function gameOver() {
    if (state.over) return;
    state.over = true;
    state.running = false;
    overlay.querySelector('h1').textContent = 'Wiped Out!';
    overlay.querySelector('p').innerHTML =
      `You slid <b>${Math.floor(state.distance)} m</b>.<br/>Tap right on the gate for PERFECT slides.`;
    overlay.querySelector('button').textContent = 'Slide Again';
    overlay.classList.add('visible');
  }

  // ---------- Render ----------
  function render() {
    // Sky / slope background
    ctx.clearRect(0, 0, W, H);

    drawSlope();
    drawTrail();
    drawGates();
    drawPlayer();
    drawSparkles();
  }

  function drawSlope() {
    // Subtle scrolling stripes to convey downward motion.
    const stripeH = 70;
    const offset = (state.worldY) % stripeH;
    ctx.save();
    ctx.globalAlpha = 0.16;
    for (let y = -stripeH + offset * -1; y < H + stripeH; y += stripeH) {
      const y0 = y;
      ctx.fillStyle = (Math.floor((state.worldY + y) / stripeH) % 2 === 0)
        ? '#ffffff' : '#bcdcff';
      ctx.fillRect(0, y0, W, stripeH);
    }
    ctx.restore();

    // Side rails
    ctx.fillStyle = 'rgba(11,37,69,.18)';
    ctx.fillRect(0, 0, 14, H);
    ctx.fillRect(W - 14, 0, 14, H);
  }

  function drawTrail() {
    if (state.trail.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < state.trail.length; i++) {
      const p = state.trail[i];
      const sy = p.worldY - state.worldY;
      if (sy < -20 || sy > H + 20) continue;
      if (i === 0) ctx.moveTo(p.x, sy);
      else ctx.lineTo(p.x, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawGates() {
    for (const g of state.gates) {
      const sy = g.worldY - state.worldY;
      if (sy < -80 || sy > H + 80) continue;
      const x0 = g.cx - g.width / 2;
      const x1 = g.cx + g.width / 2;
      // Good band
      ctx.fillStyle = g.judged === 'miss' ? 'rgba(239,71,111,.25)' : 'rgba(255,209,102,.35)';
      ctx.fillRect(x0, sy - g.goodBand, g.width, g.goodBand * 2);
      // Perfect band
      ctx.fillStyle = g.judged === 'perfect' ? 'rgba(6,214,160,.85)' : 'rgba(6,214,160,.55)';
      ctx.fillRect(x0, sy - g.perfectBand, g.width, g.perfectBand * 2);
      // Center line
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, sy);
      ctx.lineTo(x1, sy);
      ctx.stroke();
      // Side posts
      ctx.fillStyle = '#0b2545';
      ctx.fillRect(x0 - 3, sy - g.goodBand - 4, 6, g.goodBand * 2 + 8);
      ctx.fillRect(x1 - 3, sy - g.goodBand - 4, 6, g.goodBand * 2 + 8);
      // Pulse
      if (g.pulse > 0) {
        ctx.globalAlpha = g.pulse;
        ctx.strokeStyle = g.judged === 'perfect' ? '#06d6a0'
                       : g.judged === 'good' ? '#ffd166' : '#ef476f';
        ctx.lineWidth = 4;
        ctx.strokeRect(x0 - 6, sy - g.goodBand - 6, g.width + 12, g.goodBand * 2 + 12);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawPlayer() {
    const x = state.player.x;
    const y = playerScreenY();
    const lean = state.player.leanX;

    // Shadow
    ctx.fillStyle = 'rgba(11,37,69,.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 18, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body (rounded rect tilted by lean)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * 0.4);
    // board
    ctx.fillStyle = '#0b2545';
    roundRect(ctx, -14, -22, 28, 44, 8);
    ctx.fill();
    // jacket
    ctx.fillStyle = '#ef476f';
    roundRect(ctx, -10, -16, 20, 22, 6);
    ctx.fill();
    // head
    ctx.fillStyle = '#ffd9b3';
    ctx.beginPath();
    ctx.arc(0, -22, 7, 0, Math.PI * 2);
    ctx.fill();
    // beanie
    ctx.fillStyle = '#06d6a0';
    roundRect(ctx, -7, -30, 14, 8, 3);
    ctx.fill();
    ctx.restore();
  }

  function drawSparkles() {
    for (const s of state.sparkles) {
      const sy = s.y - state.worldY;
      const a = 1 - s.age / s.life;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = Math.max(0, a);
      ctx.beginPath();
      ctx.arc(s.x, sy, 3 + a * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  requestAnimationFrame(frame);
})();
