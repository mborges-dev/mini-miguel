// renderer.js — Three.js: cena, GLB e reação aos estados do agente.
//
// Comportamento:
//   idle    → PARADO (pose de descanso, sem animação nenhuma)
//   working → anda (a janela desloca-se pela base do ecrã, tratado no main)
//   asking  → de pé, vira-se p/ ti, balão "!" a pulsar
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ipc = window.ipc;
const W = 92, H = 120;                  // janela ainda mais pequena
const FPS = 30, FRAME = 1 / FPS;
const DEG = (d) => (d * Math.PI) / 180;
const FACE = -Math.PI / 2;              // rotação base p/ ficar de frente p/ a câmara
const rand = (a, b) => a + Math.random() * (b - a);

// ── Renderer / cena / câmara ────────────────────────────────────────────────
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: false });
renderer.setSize(W, H, false);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
camera.position.set(0, 1.05, 7.0);  // mais recuado → figura mais pequena com folga à volta
camera.lookAt(0, 1.05, 0);          // mira mais alto → o boneco assenta em baixo sem cortar os pés

// ── Iluminação ───────────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0xfff5e5, 0xd4c5b0, 0.5));
const key = new THREE.DirectionalLight(0xffe8c8, 0.9); key.position.set(-2, 3, 2); scene.add(key);
const rim = new THREE.DirectionalLight(0xffb870, 0.5); rim.position.set(1.5, 2, -3); scene.add(rim);

// ── Hierarquia ────────────────────────────────────────────────────────────────
const avatar = new THREE.Group(); scene.add(avatar);
const modelPivot = new THREE.Group(); modelPivot.rotation.y = FACE; avatar.add(modelPivot); // rotação ("virar-se")
const fx = new THREE.Group(); avatar.add(fx);                 // efeitos acima da cabeça

// ── Estado ────────────────────────────────────────────────────────────────────
let mixer = null, skeleton = null, restPose = null;
const actions = { idle: null, walk: null };
let current = null;
let headTop = 1.6, modelReady = false;
let state = 'idle', prevState = null;
let soundOn = false;
const clock = new THREE.Clock();

// ── Easings ───────────────────────────────────────────────────────────────────
const ease = {
  linear: (x) => x,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  outElastic: (x) => { const c4 = (2 * Math.PI) / 3; return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1; },
};

// ── Tween mínimo ──────────────────────────────────────────────────────────────
const tweens = [];
function addTween(dur, on, done, e) { tweens.push({ t: 0, dur, on, done: done || null, e: e || ease.linear }); }
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.on(tw.e(k), k);
    if (k >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
  }
}
function tweenRot(obj, axis, target, dur, e) {
  const from = obj.rotation[axis];
  addTween(dur, (k) => { obj.rotation[axis] = from + (target - from) * k; }, null, e);
}

// ── Carregar o modelo ─────────────────────────────────────────────────────────
async function loadModel() {
  let url = '';
  try { url = await ipc.invoke('get-model-path'); } catch (_) {}
  new GLTFLoader().load(url, (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => { if (o.isSkinnedMesh && !skeleton) skeleton = o.skeleton; });

    let box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(1.6 / (size.y || 1));
    box = new THREE.Box3().setFromObject(model);
    model.position.x -= (box.min.x + box.max.x) / 2;
    model.position.z -= (box.min.z + box.max.z) / 2;
    model.position.y -= box.min.y;
    modelPivot.add(model);
    headTop = (box.max.y - box.min.y);
    fx.position.set(0, headTop + 0.4, 0);

    mixer = new THREE.AnimationMixer(model);
    const list = gltf.animations || [];
    const find = (kw) => list.find((c) => c.name.toLowerCase().includes(kw));
    const idleClip = find('idle') || list[0];
    const walkClip = find('walk') || (list.length > 1 ? list[1] : list[0]);
    if (idleClip) actions.idle = mixer.clipAction(idleClip);
    if (walkClip) actions.walk = mixer.clipAction(walkClip);

    // Guarda a pose por defeito (tal como veio no GLB): corpo em pé, de frente.
    if (skeleton) restPose = skeleton.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));

    modelReady = true;
    enterState('idle', true);
  }, undefined, (err) => console.error('Falha a carregar o GLB:', err));
}

function playAction(name, speed) {
  const next = actions[name];
  if (!next) return;
  next.timeScale = speed || 1;
  if (next === current) return;
  next.reset(); next.enabled = true; next.setEffectiveWeight(1); next.play();
  if (current) current.crossFadeTo(next, 0.25, false);
  current = next;
}

// Para tudo e regressa à pose de descanso (de pé, imóvel).
function stopAnim() {
  if (actions.idle) actions.idle.stop();
  if (actions.walk) actions.walk.stop();
  current = null;
  if (skeleton && restPose) {
    skeleton.bones.forEach((b, i) => { b.position.copy(restPose[i].p); b.quaternion.copy(restPose[i].q); b.scale.copy(restPose[i].s); });
  } else if (skeleton) {
    skeleton.pose();
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  EFEITOS (engrenagem, faíscas, burst, balão)
// ════════════════════════════════════════════════════════════════════════════
function disposeObj(o) {
  o.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
  });
}

let gear = null, gearT = 0;
function showGear() {
  if (gear) return;
  gear = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.05, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xf5c518, metalness: 0.7, roughness: 0.3 })
  );
  gear.scale.setScalar(0); fx.add(gear);
  addTween(0.3, (e) => gear.scale.setScalar(e), null, ease.outBack);
}
function hideGear(cb) {
  if (!gear) { if (cb) cb(); return; }
  const g = gear; gear = null;
  addTween(0.3, (e) => g.scale.setScalar(1 - e), () => { fx.remove(g); disposeObj(g); if (cb) cb(); });
}

let sparksOn = false;
const sparks = [];
function spawnSpark() {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xf5c518, emissive: 0xf5c518, emissiveIntensity: 0.8, transparent: true, opacity: 1 })
  );
  m.position.set(rand(-0.12, 0.12), 0, rand(-0.06, 0.06));
  fx.add(m); sparks.push({ mesh: m, t: 0, life: 1.2 });
}
function killSpark(i) { const s = sparks[i]; fx.remove(s.mesh); disposeObj(s.mesh); sparks.splice(i, 1); }
function updateSparks(dt) {
  if (sparksOn) while (sparks.length < 6) spawnSpark();
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.t += dt; const k = s.t / s.life;
    s.mesh.position.y = 0.5 * k; s.mesh.material.opacity = Math.max(0, 1 - k);
    if (k >= 1) { killSpark(i); if (sparksOn) spawnSpark(); }
  }
}
function stopSparks() { sparksOn = false; while (sparks.length) killSpark(sparks.length - 1); }

const burst = [];
function greenBurst() {
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x34c759, emissive: 0x34c759, emissiveIntensity: 0.9, transparent: true, opacity: 1 })
    );
    fx.add(m);
    const a = Math.random() * Math.PI * 2, sp = rand(0.4, 0.9);
    burst.push({ mesh: m, t: 0, life: 1.0, vx: Math.cos(a) * sp, vy: rand(0.3, 0.8), vz: Math.sin(a) * sp });
  }
}
function updateBurst(dt) {
  for (let i = burst.length - 1; i >= 0; i--) {
    const b = burst[i]; b.t += dt; const k = b.t / b.life;
    b.mesh.position.set(b.vx * b.t, b.vy * b.t, b.vz * b.t);
    b.mesh.material.opacity = Math.max(0, 1 - k);
    if (k >= 1) { fx.remove(b.mesh); disposeObj(b.mesh); burst.splice(i, 1); }
  }
}

let balloon = null, balloonMat = null, pulseT = 0;
function makeExclamation() {
  const bar = new THREE.Shape();
  bar.moveTo(-0.018, -0.02); bar.lineTo(0.018, -0.02); bar.lineTo(0.018, 0.14); bar.lineTo(-0.018, 0.14); bar.lineTo(-0.018, -0.02);
  const dot = new THREE.Shape();
  dot.moveTo(-0.02, -0.10); dot.lineTo(0.02, -0.10); dot.lineTo(0.02, -0.06); dot.lineTo(-0.02, -0.06); dot.lineTo(-0.02, -0.10);
  const geo = new THREE.ExtrudeGeometry([bar, dot], { depth: 0.02, bevelEnabled: false }); geo.center();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2 }));
}
function showBalloon() {
  if (balloon) return;
  balloon = new THREE.Group();
  balloonMat = new THREE.MeshStandardMaterial({ color: 0xff5c5c, emissive: 0xff5c5c, emissiveIntensity: 0.3 });
  const bub = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), balloonMat); bub.scale.z = 0.5; balloon.add(bub);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 12), balloonMat); tail.position.set(-0.04, -0.2, 0); tail.rotation.z = Math.PI * 0.82; balloon.add(tail);
  const exc = makeExclamation(); exc.position.set(0, 0.01, 0.12); balloon.add(exc);
  balloon.scale.setScalar(0); fx.add(balloon); pulseT = 0;
  addTween(0.3, (e) => balloon.scale.setScalar(e), null, ease.outElastic);
}
function hideBalloon() {
  if (!balloon) return;
  const b = balloon; balloon = null; balloonMat = null;
  addTween(0.2, (e) => b.scale.setScalar(1 - e), () => { fx.remove(b); disposeObj(b); });
}

// ════════════════════════════════════════════════════════════════════════════
//  ESTADOS
// ════════════════════════════════════════════════════════════════════════════
function enterState(s, force) {
  if (s === state && !force) return;
  prevState = state; state = s;
  if (ipc) ipc.send('state', s);            // o main move/para a janela conforme o estado

  if (s !== 'working') stopSparks();
  if (s !== 'asking') { hideBalloon(); }
  if (s !== 'asking') modelPivot.rotation.z = 0;

  if (s === 'idle') {
    hideGear(() => { if (prevState === 'working') greenBurst(); });
    stopAnim();                              // PARADO, sem animação
    tweenRot(modelPivot, 'y', FACE, 0.3);
    if (prevState === 'working') sound('ding');
  } else if (s === 'working') {
    playAction('walk', 1.0);                 // só aqui é que anda
    modelPivot.rotation.y = FACE - 0.5;      // ligeiro 3/4, parece estar a caminhar
    showGear(); sparksOn = true;
    if (prevState !== 'working') sound('clickIn');
  } else if (s === 'asking') {
    hideGear(); stopAnim();
    tweenRot(modelPivot, 'y', FACE, 0.4, ease.outBack);       // vira-se p/ ti
    addTween(0.4, (k) => { modelPivot.rotation.z = DEG(8) * k; }, null, ease.outBack);
    showBalloon();
    if (prevState !== 'asking') sound('ping');
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  SOM (Web Audio sintético, desligado por defeito)
// ════════════════════════════════════════════════════════════════════════════
let actx = null;
function audioCtx() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; }
function beep(freq, type, dur, vol, offset) {
  const ctx = audioCtx(), t0 = ctx.currentTime + (offset || 0);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function sound(kind) {
  if (!soundOn) return;
  try {
    if (kind === 'clickIn') beep(800, 'square', 0.05, 0.15, 0);
    else if (kind === 'ding') { beep(523, 'sine', 0.15, 0.2, 0); beep(659, 'sine', 0.15, 0.2, 0.15); }
    else if (kind === 'ping') beep(1200, 'sine', 0.4, 0.25, 0);
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
//  LOOP (30fps) + atualizações
// ════════════════════════════════════════════════════════════════════════════
let acc = 0;
function update(dt) {
  updateTweens(dt);
  if (mixer && current) mixer.update(dt);    // só atualiza o mixer quando há animação ativa

  if (gear) { gearT += dt; gear.rotation.y += dt * Math.PI; gear.position.y = 0.05 * Math.sin(gearT * 3); }
  updateSparks(dt);
  updateBurst(dt);

  if (state === 'asking' && balloon) {
    pulseT += dt;
    balloon.scale.setScalar(1 + 0.05 * Math.sin(pulseT * Math.PI * 2));
    if (balloonMat) balloonMat.emissiveIntensity = 0.3 + 0.1 * Math.sin(pulseT * Math.PI * 2);
  }
}
function loop() {
  requestAnimationFrame(loop);
  acc += clock.getDelta();
  if (acc < FRAME) return;
  const dt = acc; acc = 0;
  update(dt);
  renderer.render(scene, camera);
}

// ════════════════════════════════════════════════════════════════════════════
//  IPC / POLLING
// ════════════════════════════════════════════════════════════════════════════
ipc.on('set-sound', (_e, on) => { soundOn = !!on; });

setInterval(async () => {
  try { const st = await ipc.invoke('get-state'); if (st && st.state && st.state !== state) enterState(st.state); } catch (_) {}
}, 2000);

const badge = document.getElementById('badge');
setInterval(async () => {
  try {
    const n = await ipc.invoke('get-pending-count');
    if (n > 0) { badge.textContent = String(n); badge.classList.remove('hidden'); } else badge.classList.add('hidden');
  } catch (_) {}
}, 5000);

// ── Arrastar a janela + clique (janela sem moldura) ─────────────────────────
// O canvas é "no-drag", por isso recebemos os eventos do rato aqui: arrastamos a
// janela à mão (assim os cliques continuam a funcionar). Um clique SEM arrastar
// abre o mm no Terminal / faz attach à sessão ativa.
let dragging = false, dragMoved = false, startScreen = null, startWin = null;
canvas.addEventListener('mousedown', async (e) => {
  if (e.button !== 0) return;
  dragging = true; dragMoved = false;
  startScreen = { x: e.screenX, y: e.screenY };
  try { startWin = await ipc.invoke('get-win-pos'); } catch (_) { startWin = null; }
});
window.addEventListener('mousemove', (e) => {
  if (!dragging || !startWin) return;
  const dx = e.screenX - startScreen.x, dy = e.screenY - startScreen.y;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
  if (dragMoved) ipc.send('set-win-pos', { x: Math.round(startWin[0] + dx), y: Math.round(startWin[1] + dy) });
});
window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  if (!dragMoved) ipc.send('open-chat'); // clique simples → abre o chat
});

loadModel();
loop();
