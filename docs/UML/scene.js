/* Idea Vault cinematic 3D intro + living background.
 *
 * A glass lightbulb (the "idea") rests on a giant printed "idea chart" with
 * Zettelkasten index cards around it. On load the camera glides low over the
 * letters, reaches the bulb, the bulb lights up, the title rises and the app
 * appears. Afterwards the scene keeps slowly orbiting behind the app.
 *
 * Source file: client/scene.js  ->  bundled to public/scene.js with `npm run build:scene`.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const INTRO_KEY = 'idea-vault-intro-seen';
const body = document.body;
const canvas = document.getElementById('scene');
const titleEl = document.getElementById('intro-title');
const skipBtn = document.getElementById('intro-skip');
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function seenIntro() { try { return sessionStorage.getItem(INTRO_KEY) === '1'; } catch (e) { return false; } }
function markSeen() { try { sessionStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* ignore */ } }

let ended = false;
function endIntro() {
  if (ended) return;
  ended = true;
  markSeen();
  titleEl.classList.add('out');
  body.classList.remove('intro');
  body.classList.add('intro-done');
  setTimeout(() => { titleEl.hidden = true; skipBtn.hidden = true; }, 700);
}
window.IVEndIntro = endIntro;

// ---------- WebGL support ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  renderer = null;
}
// Software / emulated WebGL (no graphics card) is far too slow for a 3D scene:
// keep the lightweight animated gradient background instead.
function isSoftwareGL(r) {
  try {
    const gl = r.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (e) { return false; }
}
const forceScene = /[?&]scene=force/.test(location.search); // lets the automated checks render 3D anyway
if (renderer && isSoftwareGL(renderer) && !forceScene) {
  renderer.dispose();
  renderer = null;
}
if (!renderer) {
  endIntro();
} else {
  body.classList.add('has-scene');
  if (!reduce && !seenIntro()) body.classList.add('intro');
  try { start(); } catch (err) {
    // never let the intro trap the user
    console.warn('3D scene disabled:', err);
    body.classList.remove('has-scene');
    endIntro();
  }
}

function start() {
  const isNarrow = () => window.innerWidth <= 520;
  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const PAPER = new THREE.Color('#2A2438');
  const scene = new THREE.Scene();
  scene.background = PAPER;
  scene.fog = new THREE.Fog(PAPER, 15, 40);
  // soft studio reflections for the glass and metal
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight('#D9D2EE', '#2A2438', 0.85));
  const sun = new THREE.DirectionalLight('#EDE8F7', 1.7);
  sun.position.set(5, 11, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 30 });
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 6;
  if ('intensity' in sun.shadow) sun.shadow.intensity = 0.9;
  scene.add(sun);

  // ---------- the printed "idea chart" ----------
  function chartTexture() {
    const S = 2048;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#352F44';
    g.fillRect(0, 0, S, S);
    const ink = '#6E6588';
    const rows = [
      ['IDEA', 330],
      ['S P A R K', 190],
      ['L I N K S', 146],
      ['C O N N E C T', 108],
      ['C A P T U R E', 82],
      ['W R I T E   ·   B U I L D', 62],
      ['T H I N K   D E E P E R', 47],
      ['Z E T T E L K A S T E N', 36],
      ['N E V E R   L O S E   A   R A N D O M   I D E A', 26],
    ];
    let y = 230;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    rows.forEach(([txt, size], i) => {
      g.font = `700 ${size}px "Rockwell", "Roboto Slab", "Courier New", serif`;
      g.fillStyle = ink;
      g.fillText(txt, S / 2, y + size * 0.78);
      // eye-chart style line numbers on both sides
      g.font = '600 30px "Helvetica Neue", Arial, sans-serif';
      g.fillStyle = '#5C5470';
      g.textAlign = 'left';
      g.fillText(String(i + 1), 120, y + size * 0.6);
      g.textAlign = 'right';
      g.fillText(`${(i + 1) * 10}/${100 - i * 10}`, S - 110, y + size * 0.6);
      g.textAlign = 'center';
      // coloured bars like a real chart, in the app colours
      if (i === 3) { g.fillStyle = 'rgba(180,156,255,.55)'; g.fillRect(S / 2 - 520, y + size + 22, 1040, 14); }
      if (i === 5) { g.fillStyle = 'rgba(219,216,227,.5)'; g.fillRect(S / 2 - 470, y + size + 20, 940, 12); }
      y += size + (i < 2 ? 70 : 54);
    });
    g.font = 'italic 28px Georgia, serif';
    g.fillStyle = '#5C5470';
    g.fillText('[[Atomic notes]]  ·  [[Ideas compound when linked]]  ·  [[Spark]]', S / 2, S - 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ map: chartTexture(), roughness: 0.92, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-1.2, 0, -2);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- the lightbulb ----------
  function makeBulb(scale = 1) {
    const group = new THREE.Group();
    // glass profile (y up), turned on a lathe
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const y = t * 2.6;
      let r;
      if (y < 0.5) r = 0.36 + y * 0.06;
      else {
        const k = (y - 0.5) / 2.1; // 0..1 across the dome
        r = 0.39 + Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.62) * 0.66;
        if (k > 0.72) r *= Math.sqrt(Math.max(0, 1 - Math.pow((k - 0.72) / 0.28, 2)));
      }
      pts.push(new THREE.Vector2(Math.max(r, 0.001), y));
    }
    const glass = new THREE.Mesh(
      new THREE.LatheGeometry(pts, 64),
      new THREE.MeshPhysicalMaterial({
        color: '#C9BEF0', roughness: 0.06, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04,
        transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2.2,
        specularIntensity: 1, sheen: 0.4, sheenColor: new THREE.Color('#EFEAFB'),
        emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0,
      })
    );
    glass.castShadow = true;
    group.add(glass);

    // metal screw base with threads
    const metal = new THREE.MeshStandardMaterial({ color: '#D6CFE6', metalness: 1, roughness: 0.22 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.33, 0.62, 40), metal);
    cap.position.y = -0.28;
    cap.castShadow = true;
    group.add(cap);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.365 - i * 0.008, 0.035, 10, 40), metal);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.08 - i * 0.14;
      group.add(ring);
    }
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 12), new THREE.MeshStandardMaterial({ color: '#2A2438', roughness: 0.5, metalness: 0.4 }));
    tip.position.y = -0.62;
    tip.scale.y = 0.55;
    group.add(tip);

    // filament: a small zigzag coil on two wires
    const wireMat = new THREE.MeshStandardMaterial({ color: '#8a96a3', metalness: 0.6, roughness: 0.4 });
    [-0.14, 0.14].forEach((x) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6), wireMat);
      w.position.set(x, 0.75, 0);
      group.add(w);
    });
    const coilPts = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      coilPts.push(new THREE.Vector3(-0.14 + t * 0.28, 1.32 + Math.sin(t * Math.PI * 10) * 0.07, Math.cos(t * Math.PI * 10) * 0.07));
    }
    const filamentMat = new THREE.MeshStandardMaterial({ color: '#9a8a70', emissive: new THREE.Color('#ffb547'), emissiveIntensity: 0, roughness: 0.5 });
    const filament = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 80, 0.018, 6), filamentMat);
    group.add(filament);

    group.scale.setScalar(scale);
    return { group, glass, filamentMat };
  }

  // soft contact shadow (a blurred dark ellipse) so objects feel grounded, like a real photo
  const contactTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(8,4,16,.7)');
    grd.addColorStop(0.45, 'rgba(8,4,16,.3)');
    grd.addColorStop(1, 'rgba(8,4,16,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  function contactShadow(group) {
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -group.rotation.y;
    m.scale.set(size.x * 1.15 + 0.4, size.z * 1.15 + 0.4, 1);
    m.position.set(centre.x, 0.012, centre.z);
    m.renderOrder = 1;
    scene.add(m);
  }
  // place a rotated object so that it rests exactly on the paper
  function rest(group, x, z) {
    group.position.set(x, 0, z);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    group.position.y = -box.min.y;
    group.updateMatrixWorld(true);
    contactShadow(group);
  }
  const hero = makeBulb(1);
  // lying on its side on the chart
  hero.group.rotation.set(0, 0.5, Math.PI / 2 + 0.12);
  rest(hero.group, 0, 0);
  scene.add(hero.group);
  const bulbCentre = new THREE.Box3().setFromObject(hero.glass).getCenter(new THREE.Vector3());

  // warm light inside the bulb + additive halo sprite (cheap bloom)
  const glow = new THREE.PointLight('#ffc46b', 0, 9, 1.6);
  glow.position.copy(bulbCentre);
  scene.add(glow);
  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,236,170,1)');
    grd.addColorStop(0.25, 'rgba(255,205,110,.55)');
    grd.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  halo.position.copy(glow.position);
  halo.scale.setScalar(0.01);
  scene.add(halo);

  // smaller, farther bulbs (out of focus in the fog, like a real lens)
  const far1 = makeBulb(0.7);
  far1.group.rotation.set(0, -0.9, Math.PI / 2 + 0.12);
  rest(far1.group, -6.5, -5.5);
  scene.add(far1.group);
  const far2 = makeBulb(0.6);
  far2.group.rotation.set(0, 2.3, Math.PI / 2 + 0.12);
  rest(far2.group, 5.5, -8);
  scene.add(far2.group);

  // Zettelkasten index cards lying around the bulb
  function cardTexture(title, lines) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 320;
    const g = c.getContext('2d');
    g.fillStyle = '#DBD8E3'; g.fillRect(0, 0, 512, 320);
    g.fillStyle = '#C9C2DA'; g.fillRect(0, 0, 512, 58);
    g.strokeStyle = '#C3BCD3'; g.lineWidth = 2;
    for (let y = 100; y < 320; y += 38) { g.beginPath(); g.moveTo(28, y); g.lineTo(484, y); g.stroke(); }
    g.fillStyle = '#2A2438'; g.font = '700 30px Arial, sans-serif'; g.fillText(title, 28, 40);
    g.fillStyle = '#5C5470'; g.font = '24px Georgia, serif';
    lines.forEach((l, i) => g.fillText(l, 30, 92 + i * 38));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  const cards = [
    { title: '#1 Atomic notes', lines: ['One idea per note.', 'Link it: [[Zettelkasten]]'], pos: [2.4, 0.03, 1.6], rot: -0.35 },
    { title: '#2 Newsletter', lines: ['Weekly teardown for', 'indie founders → [[Podcast]]'], pos: [-2.9, 0.03, 1.9], rot: 0.28 },
    { title: '#3 Spark ✦', lines: ['Podcast × Newsletter =', 'audio newsletter?'], pos: [1.4, 0.03, -2.6], rot: 0.12 },
  ];
  const edge = new THREE.MeshStandardMaterial({ color: '#C9C2DA', roughness: 0.9 });
  cards.forEach((cd) => {
    const top = new THREE.MeshStandardMaterial({ map: cardTexture(cd.title, cd.lines), roughness: 0.85 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.035, 1.25), [edge, edge, top, edge, edge, edge]);
    m.position.set(...cd.pos);
    m.rotation.y = cd.rot;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  });
  // a thread connecting two cards to the bulb (the "link")
  const threadCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.2, 0.05, 1.7), new THREE.Vector3(-1.2, 0.04, 1.3), new THREE.Vector3(-0.3, 0.05, 0.9),
    new THREE.Vector3(0.9, 0.04, 1.2), new THREE.Vector3(1.7, 0.05, 1.5),
  ]);
  const thread = new THREE.Mesh(new THREE.TubeGeometry(threadCurve, 80, 0.018, 6), new THREE.MeshStandardMaterial({ color: '#B49CFF', roughness: 0.5, emissive: new THREE.Color('#5B45A8'), emissiveIntensity: 0.4 }));
  thread.castShadow = true;
  scene.add(thread);

  // ---------- camera path ----------
  const BC = bulbCentre.toArray(); // bulb centre
  const keys = [
    // [time s, camera position, look-at]
    [0.0, [-13, 3.0, 11], [-6.5, 0.0, 3.5]],
    [1.3, [-7.5, 3.0, 8.2], [-2.2, 0.6, 1.6]],
    [2.3, [BC[0] - 2.6, 3.0, BC[2] + 6.2], BC],
    [3.5, [BC[0] + 10, 11, BC[2] + 13], [BC[0], BC[1] + 1.6, BC[2]]],
  ];
  const posCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k[1])), false, 'centripetal');
  const tgtCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k[2])), false, 'centripetal');
  const INTRO = keys[keys.length - 1][0];
  const LIGHT_AT = 1.75;
  const TITLE_AT = 2.05;
  const endPos = new THREE.Vector3(...keys[3][1]);
  const endTgt = new THREE.Vector3(...keys[3][2]);
  const orbitR = Math.hypot(endPos.x - endTgt.x, endPos.z - endTgt.z);
  const orbitA0 = Math.atan2(endPos.z - endTgt.z, endPos.x - endTgt.x);

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

  // where the bulb sits on screen in the background: shifted right on wide screens so the app doesn't hide it
  let viewShift = 0;
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // tall (phone) screens: widen the lens so the whole bulb stays in frame
    camera.fov = w / h < 1 ? 32 + (1 - w / h) * 34 : 32;
    applyView(w, h);
  }
  // Put the bulb in the free space to the right of the phone (measured from the layout).
  function bulbScreenX(w) {
    const wrap = document.querySelector('.phone-wrap');
    const stage = document.querySelector('.stage');
    if (!wrap || !stage) return w * 0.8;
    const phoneRight = stage.offsetLeft + wrap.offsetLeft + wrap.offsetWidth;
    return Math.min(w * 0.93, phoneRight + (w - phoneRight) * 0.62);
  }
  function applyView(w = window.innerWidth, h = window.innerHeight) {
    const k = w >= 1000 ? viewShift : 0;
    const x = bulbScreenX(w);
    if (k > 0.001 && x > w / 2) camera.setViewOffset(w + (2 * x - w) * k, h, 0, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- light-up ----------
  function setLight(k, flicker = 0) {
    const v = Math.max(0, k + flicker);
    hero.filamentMat.emissiveIntensity = v * 5;
    hero.glass.material.emissiveIntensity = v * 0.05;
    glow.intensity = v * 9;
    halo.material.opacity = Math.min(1, v) * 0.45;
    halo.scale.setScalar(0.01 + v * 2.6);
  }

  // ---------- mouse parallax ----------
  let mx = 0, my = 0, smx = 0, smy = 0;
  window.addEventListener('pointermove', (e) => {
    mx = e.clientX / window.innerWidth - 0.5;
    my = e.clientY / window.innerHeight - 0.5;
  });

  // ---------- intro ----------
  const playIntro = !reduce && !seenIntro();
  if (playIntro) {
    body.classList.add('intro');
    titleEl.hidden = false;
    skipBtn.hidden = false;
    const skip = () => { introT = INTRO; };
    skipBtn.addEventListener('click', skip);
    window.addEventListener('keydown', (e) => { if (!ended && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) skip(); });
    canvas.addEventListener('click', skip);
  } else {
    endIntro();
  }

  // Intro time only advances by at most 1/20 s per frame, so a slow first frame
  // (shader compile on weaker devices) never skips the intro.
  let introT = 0;
  let slowFrames = 0;
  window.IVSeek = (x) => { introT = x; }; // used by the automated UI checks
  let prev = 0;
  let bgStart = 0;
  let titleShown = false;
  let last = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const rawDt = prev ? (now - prev) / 1000 : 0;
    if (playIntro && !ended && !forceScene && rawDt > 0.25 && ++slowFrames >= 3) { stillFrame(); return; }
    const dt = Math.min(0.05, rawDt);
    prev = now;
    if (playIntro && introT < INTRO) introT = Math.min(INTRO, introT + dt);
    const t = introT;
    window.IVIntroTime = introT; // read by the automated UI checks
    const inIntro = playIntro && introT < INTRO;

    // after the intro, throttle to ~30 fps to save battery
    if (!inIntro && now - last < 32) return;
    last = now;

    if (inIntro) {
      const u = ease(Math.min(1, t / INTRO));
      camera.position.copy(posCurve.getPoint(u));
      camera.lookAt(tgtCurve.getPoint(u));
      viewShift = smooth(2.5, INTRO, t);
      applyView();
      setLight(smooth(LIGHT_AT, LIGHT_AT + 0.5, t) * (t < LIGHT_AT + 0.25 ? 0.6 + 0.4 * Math.sin(t * 70) : 1));
      if (!titleShown && t >= TITLE_AT) { titleShown = true; titleEl.classList.add('in'); }
    } else {
      if (playIntro && !ended) endIntro();
      if (!bgStart) bgStart = now;
      // slow orbit + gentle bob + mouse parallax
      const tb = (now - bgStart) / 1000;
      smx += (mx - smx) * 0.04;
      smy += (my - smy) * 0.04;
      const a = orbitA0 + tb * 0.035 + smx * 0.25;
      camera.position.set(endTgt.x + Math.cos(a) * orbitR, endPos.y + Math.sin(tb * 0.3) * 0.15 - smy * 0.8, endTgt.z + Math.sin(a) * orbitR);
      camera.lookAt(endTgt);
      if (viewShift !== 1) { viewShift = 1; applyView(); }
      setLight(1, Math.sin(tb * 2.1) * 0.04 + Math.sin(tb * 7.3) * 0.02);
      // on phones the app covers the whole screen: stop drawing once settled
      if (isNarrow() && tb > 0.5) { renderer.render(scene, camera); running = false; return; }
    }
    renderer.render(scene, camera);
  }

  function stillFrame() {
    // one still frame of the background, no motion
    running = false;
    camera.position.copy(endPos);
    camera.lookAt(endTgt);
    viewShift = 1;
    applyView();
    setLight(1);
    renderer.render(scene, camera);
    if (!ended) endIntro();
    window.addEventListener('resize', () => { applyView(); renderer.render(scene, camera); });
  }
  if (reduce) { stillFrame(); return; }

  // warm up: compile shaders and draw the first shot before the clock starts
  camera.position.copy(posCurve.getPoint(0));
  camera.lookAt(tgtCurve.getPoint(0));
  setLight(0);
  const tw = performance.now();
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  const warm = performance.now() - tw;

  // Very slow graphics: skip the intro and show a still background.
  if (warm > 900 && !forceScene) {
    stillFrame();
    return;
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running && !isNarrow()) { running = true; prev = 0; requestAnimationFrame(frame); }
  });
  window.addEventListener('resize', () => {
    if (!running && !isNarrow() && !document.hidden) { running = true; prev = 0; requestAnimationFrame(frame); }
  });
}
