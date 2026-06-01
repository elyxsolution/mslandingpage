/* ============================================================
   Malnad Stories — Coming Soon
   Scroll-driven 3D mist-and-mountains experience (Three.js r128)
   ============================================================ */

(function () {
  'use strict';

  // ---------------------------------------------------------
  // Tiny improved-Perlin noise (Ken Perlin, JS port)
  // ---------------------------------------------------------
  const Perlin = (function () {
    const p = new Uint8Array(512);
    const perm = [];
    for (let i = 0; i < 256; i++) perm[i] = i;
    // deterministic shuffle
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + t * (b - a);
    const grad = (hash, x, y) => {
      const h = hash & 7;
      const u = h < 4 ? x : y;
      const v = h < 4 ? y : x;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
    };
    return {
      noise2(x, y) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        const u = fade(x), v = fade(y);
        const A = p[X] + Y, B = p[X + 1] + Y;
        return lerp(
          lerp(grad(p[A], x, y), grad(p[B], x - 1, y), u),
          lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u),
          v
        );
      }
    };
  })();

  // fractal brownian motion (layered noise) — 1D ridge profile
  function fbm(x, seed) {
    let v = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < 5; o++) {
      v += amp * Perlin.noise2(x * freq, seed * 13.3);
      norm += amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return v / norm;
  }

  // ---------------------------------------------------------
  // Color helpers
  // ---------------------------------------------------------
  const C = (hex) => new THREE.Color(hex);
  const lerpColor = (a, b, t) => a.clone().lerp(b, t);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };

  // Sky keyframes: pre-dawn -> golden dawn -> morning -> misty day
  const SKY = [
    { at: 0.00, top: C('#070a24'), bot: C('#241d4a') }, // pre-dawn
    { at: 0.32, top: C('#243a66'), bot: C('#e8915a') }, // golden hour
    { at: 0.62, top: C('#5f9bcf'), bot: C('#ffd9a6') }, // sunrise glow
    { at: 1.00, top: C('#9cc2da'), bot: C('#e9f1ef') }  // misty morning
  ];
  function skyAt(p) {
    let a = SKY[0], b = SKY[SKY.length - 1];
    for (let i = 0; i < SKY.length - 1; i++) {
      if (p >= SKY[i].at && p <= SKY[i + 1].at) { a = SKY[i]; b = SKY[i + 1]; break; }
    }
    const t = smooth(a.at, b.at, p);
    return { top: lerpColor(a.top, b.top, t), bot: lerpColor(a.bot, b.bot, t) };
  }

  // ---------------------------------------------------------
  // Canvas textures (soft cloud + sun glow)
  // ---------------------------------------------------------
  function radialTexture(stops) {
    const s = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  function cloudTexture() {
    const s = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const x = Math.random() * s, y = s * 0.5 + (Math.random() - 0.5) * s * 0.4;
      const r = 30 + Math.random() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.10 + Math.random() * 0.12;
      g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  // ---------------------------------------------------------
  // Scene setup
  // ---------------------------------------------------------
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x241d4a, 260, 1100);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 6000);
  camera.position.set(0, 34, 150);

  // ---- Sky dome (gradient shader, ignores fog) ----
  const skyUniforms = {
    topColor: { value: C('#070a24') },
    botColor: { value: C('#241d4a') },
    offset: { value: 33.0 },
    expo: { value: 0.7 }
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4000, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 botColor;
        uniform float offset; uniform float expo;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos + vec3(0.0, offset, 0.0)).y;
          float t = pow(max(h, 0.0), expo);
          gl_FragColor = vec4(mix(botColor, topColor, t), 1.0);
        }`
    })
  );
  scene.add(sky);

  // ---- Stars (fade out as dawn breaks) ----
  const starGeo = new THREE.BufferGeometry();
  const starCount = 1400;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 2200;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.85 + 0.1); // upper hemisphere
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 60;
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 6, sizeAttenuation: true,
    transparent: true, opacity: 0.9, fog: false, depthWrite: false
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ---- Sun (glow sprite + halo) ----
  const sunTex = radialTexture([
    [0.0, 'rgba(255,247,230,1)'],
    [0.18, 'rgba(255,214,150,0.95)'],
    [0.5, 'rgba(255,170,90,0.35)'],
    [1.0, 'rgba(255,150,80,0)']
  ]);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, opacity: 0.0
  }));
  sun.scale.set(520, 520, 1);
  sun.position.set(-120, -60, -1500);
  scene.add(sun);

  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(255,250,240,1)'], [0.45, 'rgba(255,234,200,0.9)'], [1, 'rgba(255,210,150,0)']]),
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.0
  }));
  sunCore.scale.set(180, 180, 1);
  scene.add(sunCore);

  // ---- Mountain ridges (layered silhouettes) ----
  const RIDGE_COUNT = 9;
  const nearCol = C('#10241d');
  const farCol = C('#9db9c2');
  const ridges = [];

  function buildRidge(index) {
    const t = index / (RIDGE_COUNT - 1);              // 0 near -> 1 far
    const width = 1700;
    const seg = 260;
    const z = -60 - t * 1150;
    const amp = lerp(70, 230, t) * (0.7 + Math.random() * 0.5);
    const base = lerp(-30, 95, t);
    const freq = lerp(0.9, 0.32, t);
    const seed = index * 7.7 + 3.1;

    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const fx = i / seg;
      const x = (fx - 0.5) * width;
      const h = base + amp * (fbm(fx * 4.0 * (1 / freq) * freq + seed, seed) * 0.5 + 0.5)
                     + amp * 0.35 * fbm(fx * 9.0 + seed * 2.0, seed * 1.7);
      pts.push(new THREE.Vector2(x, h));
    }
    const shape = new THREE.Shape();
    shape.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
    shape.lineTo(pts[pts.length - 1].x, -900);
    shape.lineTo(pts[0].x, -900);
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape);
    const col = lerpColor(nearCol, farCol, Math.pow(t, 0.85));
    const mat = new THREE.MeshBasicMaterial({ color: col, fog: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, z);
    mesh.userData = {
      baseY: 0,
      parallax: lerp(0.18, 1.0, 1 - t),   // near layers move more
      drift: lerp(2, 9, t),
      phase: Math.random() * Math.PI * 2,
      baseColor: col.clone()
    };
    scene.add(mesh);
    ridges.push(mesh);
  }
  for (let i = 0; i < RIDGE_COUNT; i++) buildRidge(i);

  // ---- Mist bands drifting between ridges ----
  const cloudTex = cloudTexture();
  const mists = [];
  for (let i = 0; i < 14; i++) {
    const z = -90 - Math.random() * 1050;
    const tz = (-z) / 1150;
    const mat = new THREE.MeshBasicMaterial({
      map: cloudTex, transparent: true, depthWrite: false,
      opacity: lerp(0.22, 0.5, tz), fog: true, blending: THREE.NormalBlending
    });
    const w = lerp(500, 1500, tz), h = lerp(140, 320, tz);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set((Math.random() - 0.5) * 1400, lerp(20, 150, tz) + (Math.random() - 0.5) * 60, z + 4);
    m.userData = { speed: (0.4 + Math.random() * 0.8) * (Math.random() > 0.5 ? 1 : -1) * lerp(3, 9, tz), span: 1400 };
    scene.add(m);
    mists.push(m);
  }

  // ---- Floating motes (fireflies / dust) ----
  const moteGeo = new THREE.BufferGeometry();
  const moteN = 260;
  const motePos = new Float32Array(moteN * 3);
  const moteSeed = [];
  for (let i = 0; i < moteN; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 900;
    motePos[i * 3 + 1] = Math.random() * 260 - 20;
    motePos[i * 3 + 2] = -Math.random() * 700 + 80;
    moteSeed.push(Math.random() * 100);
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: 0xffe9c2, size: 3.4, transparent: true, opacity: 0.0,
    sizeAttenuation: true, depthWrite: false, fog: true, blending: THREE.AdditiveBlending
  }));
  scene.add(motes);

  // ---------------------------------------------------------
  // Scroll + mouse state
  // ---------------------------------------------------------
  let targetScroll = 0, curScroll = 0;
  function readScroll() {
    const max = document.body.scrollHeight - window.innerHeight;
    targetScroll = max > 0 ? clamp01(window.scrollY / max) : 0;
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  let mx = 0, my = 0, tmx = 0, tmy = 0;
  window.addEventListener('mousemove', (e) => {
    tmx = (e.clientX / window.innerWidth - 0.5);
    tmy = (e.clientY / window.innerHeight - 0.5);
  });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma != null) { tmx = clamp01((e.gamma + 45) / 90) - 0.5; tmy = clamp01((e.beta) / 90) - 0.5; }
  });

  // ---------------------------------------------------------
  // Resize
  // ---------------------------------------------------------
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    readScroll();
  }
  window.addEventListener('resize', onResize);

  // ---------------------------------------------------------
  // Animation loop
  // ---------------------------------------------------------
  const clock = new THREE.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // smooth the scroll + mouse
    curScroll += (targetScroll - curScroll) * Math.min(1, dt * 4.0);
    mx += (tmx - mx) * Math.min(1, dt * 3.0);
    my += (tmy - my) * Math.min(1, dt * 3.0);
    const p = curScroll;

    // --- sky / fog colors ---
    const s = skyAt(p);
    skyUniforms.topColor.value.copy(s.top);
    skyUniforms.botColor.value.copy(s.bot);
    scene.fog.color.copy(s.bot);

    // --- stars fade ---
    starMat.opacity = lerp(0.9, 0.0, smooth(0.05, 0.45, p));
    stars.rotation.y = time * 0.005;

    // --- sun rise + travel ---
    const sunY = lerp(-90, 240, smooth(0.05, 0.85, p));
    const sunX = lerp(-160, 180, p);
    sun.position.set(sunX, sunY, -1500);
    sunCore.position.set(sunX, sunY, -1480);
    const sunVis = smooth(0.12, 0.4, p) * (1 - smooth(0.9, 1.0, p) * 0.2);
    sun.material.opacity = sunVis * 0.95;
    sunCore.material.opacity = sunVis;

    // --- camera: dolly forward + gentle descent, with parallax + bob ---
    camera.position.x = lerp(0, 16, p) + mx * 28;
    camera.position.y = 34 + lerp(0, 26, p) + Math.sin(time * 0.4) * 1.2 - my * 14;
    camera.position.z = lerp(150, 8, p);
    camera.lookAt(mx * 14, 30 + lerp(0, 18, p) - my * 8, -400);

    // --- ridges: parallax lift + subtle breathing + warm tint from sun ---
    const warm = C('#ffcaa0');
    for (let i = 0; i < ridges.length; i++) {
      const r = ridges[i], u = r.userData;
      r.position.y = u.baseY + p * 70 * u.parallax + Math.sin(time * 0.25 + u.phase) * 1.6 * u.parallax;
      const tint = sunVis * 0.22 * u.parallax;
      r.material.color.copy(lerpColor(u.baseColor, warm, tint));
    }

    // --- mist drift ---
    for (let i = 0; i < mists.length; i++) {
      const m = mists[i], u = m.userData;
      m.position.x += u.speed * dt;
      if (m.position.x > u.span) m.position.x = -u.span;
      else if (m.position.x < -u.span) m.position.x = u.span;
      m.position.y += Math.sin(time * 0.2 + i) * 0.04;
    }

    // --- motes ---
    motes.material.opacity = lerp(0.0, 0.55, smooth(0.15, 0.6, p)) * (0.6 + 0.4 * Math.sin(time));
    const mp = moteGeo.attributes.position.array;
    for (let i = 0; i < moteN; i++) {
      mp[i * 3 + 1] += Math.sin(time * 0.5 + moteSeed[i]) * 0.05 + 0.06;
      mp[i * 3] += Math.cos(time * 0.3 + moteSeed[i]) * 0.04;
      if (mp[i * 3 + 1] > 250) mp[i * 3 + 1] = -20;
    }
    moteGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------
  // Loader -> start
  // ---------------------------------------------------------
  const loader = document.getElementById('loader');
  const bar = loader.querySelector('.loader-bar span');
  document.getElementById('year').textContent = new Date().getFullYear();

  let prog = 0;
  const fakeLoad = setInterval(() => {
    prog = Math.min(100, prog + 6 + Math.random() * 14);
    bar.style.width = prog + '%';
    if (prog >= 100) {
      clearInterval(fakeLoad);
      setTimeout(() => loader.classList.add('hidden'), 350);
    }
  }, 120);

  frame();
})();
