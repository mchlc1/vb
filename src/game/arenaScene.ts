import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCyberKnightRig, type FighterRig } from './fighterRig';
import { createProceduralTextures } from './materials';
import { type DuelState } from './combatEngine';
import { type ArmTrackingTarget } from './visionMath';

interface SparkParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

interface EmberMote {
  angle: number;
  radius: number;
  y: number;
  speed: number;
  scale: number;
}

export interface ArenaSceneHandle {
  spawnSparkBurst: (x: number, y: number, colorHex: number, count: number, speed?: number) => void;
  spawnShockwave: (x: number, y: number, colorHex: number) => void;
  dispose: () => void;
}

// Pre-allocated scratch math helpers (zero GC inside render loop)
const _dummyObj = new THREE.Object3D();
const _camTarget = new THREE.Vector3();
const _camGoal = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export function mountArenaScene(
  container: HTMLElement,
  getState: () => DuelState,
  onStep: (dt: number) => void,
  getArmOverride?: () => ArmTrackingTarget | undefined
): ArenaSceneHandle {
  const isSoftwareGl = detectSoftwareGl();

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.setAttribute('data-testid', 'arena-webgl-canvas');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060913);
  scene.fog = new THREE.FogExp2(0x060913, 0.024);

  const camera = new THREE.PerspectiveCamera(
    46,
    (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
    0.1,
    130
  );
  camera.position.set(0, 3.3, 9.2);

  // Studio Environment Reflections (PMREM + RoomEnvironment) on all devices
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envRT.texture;
  roomEnv.dispose();
  pmremGenerator.dispose();

  // Warm/Cool 3-Point Lighting Rig + Subtle Arena Side Glows
  const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x1e1b2e, 0.78);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff1db, 2.15);
  keyLight.position.set(6, 14, 7);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 34;
  keyLight.shadow.camera.left = -10;
  keyLight.shadow.camera.right = 10;
  keyLight.shadow.camera.top = 10;
  keyLight.shadow.camera.bottom = -10;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.45);
  rimLight.position.set(-7, 7, -10);
  scene.add(rimLight);

  // Two opposing corner accent lights (cyan left / crimson right)
  const cyanCornerLight = new THREE.PointLight(0x06b6d4, 5.5, 18, 2);
  cyanCornerLight.position.set(-6.5, 2.2, -3.5);
  scene.add(cyanCornerLight);

  const crimsonCornerLight = new THREE.PointLight(0xf43f5e, 5.5, 18, 2);
  crimsonCornerLight.position.set(6.5, 2.2, -3.5);
  scene.add(crimsonCornerLight);

  // Procedural Textures & Upgraded Cyber-Colosseum Arena
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const textures = createProceduralTextures(maxAniso);

  const trackedGeos: THREE.BufferGeometry[] = [];
  const trackedMats: THREE.Material[] = [];
  const trackG = <T extends THREE.BufferGeometry>(g: T): T => {
    trackedGeos.push(g);
    return g;
  };
  const trackM = <T extends THREE.Material>(m: T): T => {
    trackedMats.push(m);
    return m;
  };

  // Outer continuous obsidian terrain deck (eliminates void drop-off)
  const outerGroundMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x070b15,
      roughness: 0.85,
      metalness: 0.25,
    })
  );
  const outerGround = new THREE.Mesh(trackG(new THREE.CircleGeometry(48, 48)), outerGroundMat);
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.26;
  outerGround.receiveShadow = !isSoftwareGl;
  scene.add(outerGround);

  // Tiered Outer Walkway Ring around Combat Plinth
  const steelDarkMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.38,
      metalness: 0.82,
    })
  );
  const trimMetalMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.25,
      metalness: 0.9,
    })
  );
  const outerDeck = new THREE.Mesh(trackG(new THREE.CylinderGeometry(12.2, 12.8, 0.2, 16)), steelDarkMat);
  outerDeck.position.y = -0.18;
  outerDeck.receiveShadow = !isSoftwareGl;
  scene.add(outerDeck);

  // Glowing Abyssal Moat Channel separating walkway and combat plinth
  const moatMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0x0891b2,
      transparent: true,
      opacity: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const energyMoat = new THREE.Mesh(trackG(new THREE.RingGeometry(8.68, 9.45, 48)), moatMat);
  energyMoat.rotation.x = -Math.PI / 2;
  energyMoat.position.y = -0.055;
  scene.add(energyMoat);

  // Elevated Octagonal Combat Plinth (top surface exactly y = 0)
  const plinthMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.arenaFloorMap,
      bumpMap: textures.arenaFloorBump,
      bumpScale: 0.015,
      roughness: 0.4,
      metalness: 0.58,
    })
  );
  const plinth = new THREE.Mesh(trackG(new THREE.CylinderGeometry(8.6, 9.1, 0.24, 8)), plinthMat);
  plinth.position.y = -0.12;
  plinth.receiveShadow = !isSoftwareGl;
  scene.add(plinth);

  // Beveled Stepped Plinth Rim
  const plinthRim = new THREE.Mesh(trackG(new THREE.TorusGeometry(8.62, 0.11, 8, 8)), trimMetalMat);
  plinthRim.rotation.x = Math.PI / 2;
  plinthRim.rotation.z = Math.PI / 8;
  plinthRim.position.y = 0.01;
  scene.add(plinthRim);

  // Glowing Combat Perimeter Ring & Center Engagement Lane
  const ringMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.52,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const perimeterRing = new THREE.Mesh(trackG(new THREE.RingGeometry(6.88, 7.0, 64)), ringMat);
  perimeterRing.rotation.x = -Math.PI / 2;
  perimeterRing.position.y = 0.012;
  scene.add(perimeterRing);

  // Dynamic Duel Midpoint Floor Reticle
  const reticleMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.36,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const duelReticle = new THREE.Mesh(trackG(new THREE.RingGeometry(1.15, 1.24, 32)), reticleMat);
  duelReticle.rotation.x = -Math.PI / 2;
  duelReticle.position.y = 0.015;
  scene.add(duelReticle);

  // 6 Rear Curved Parapet Barrier Walls along the Far Arc (never occludes front camera!)
  const barrierMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.48,
      metalness: 0.72,
    })
  );
  const barrierRailMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.35,
      roughness: 0.25,
    })
  );
  const barrierGeo = trackG(new THREE.BoxGeometry(3.2, 0.88, 0.32));
  const barrierRailGeo = trackG(new THREE.BoxGeometry(2.9, 0.09, 0.36));

  for (let i = 0; i < 6; i++) {
    const angle = Math.PI + ((i - 2.5) / 5.2) * Math.PI * 0.92; // Rear arc (-Z hemisphere)
    const r = 9.85;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    const wallGroup = new THREE.Group();
    wallGroup.position.set(x, 0.36, z);
    wallGroup.rotation.y = angle;

    const wallMesh = new THREE.Mesh(barrierGeo, barrierMat);
    wallMesh.castShadow = !isSoftwareGl;
    wallMesh.receiveShadow = !isSoftwareGl;
    wallGroup.add(wallMesh);

    const railMesh = new THREE.Mesh(barrierRailGeo, barrierRailMat);
    railMesh.position.y = 0.38;
    wallGroup.add(railMesh);

    scene.add(wallGroup);
  }

  // 8 Multi-Part Architectural Colosseum Pylons (Pedestal + Column + Conduit + Crown)
  const pylonCount = 8;
  const pylonBaseGeo = trackG(new THREE.BoxGeometry(1.25, 0.6, 1.25));
  const pylonBodyGeo = trackG(new THREE.BoxGeometry(0.76, 5.2, 0.76));
  const pylonStripGeo = trackG(new THREE.BoxGeometry(0.16, 4.4, 0.82));
  const pylonCapGeo = trackG(new THREE.BoxGeometry(1.15, 0.36, 1.15));

  const pylonStripMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.65,
      roughness: 0.2,
    })
  );

  const pylonBaseInst = new THREE.InstancedMesh(pylonBaseGeo, trimMetalMat, pylonCount);
  const pylonInst = new THREE.InstancedMesh(pylonBodyGeo, steelDarkMat, pylonCount);
  const stripInst = new THREE.InstancedMesh(pylonStripGeo, pylonStripMat, pylonCount);
  const pylonCapInst = new THREE.InstancedMesh(pylonCapGeo, trimMetalMat, pylonCount);
  pylonInst.castShadow = !isSoftwareGl;
  pylonInst.receiveShadow = !isSoftwareGl;

  for (let i = 0; i < pylonCount; i++) {
    const angle = (i / pylonCount) * Math.PI * 2 + Math.PI / 8;
    const radius = 10.9;
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius;

    _dummyObj.position.set(px, 0.12, pz);
    _dummyObj.rotation.set(0, -angle, 0);
    _dummyObj.scale.set(1, 1, 1);
    _dummyObj.updateMatrix();
    pylonBaseInst.setMatrixAt(i, _dummyObj.matrix);

    _dummyObj.position.set(px, 2.48, pz);
    _dummyObj.updateMatrix();
    pylonInst.setMatrixAt(i, _dummyObj.matrix);
    stripInst.setMatrixAt(i, _dummyObj.matrix);

    _dummyObj.position.set(px, 5.15, pz);
    _dummyObj.updateMatrix();
    pylonCapInst.setMatrixAt(i, _dummyObj.matrix);
  }
  pylonBaseInst.computeBoundingSphere();
  pylonInst.computeBoundingSphere();
  stripInst.computeBoundingSphere();
  pylonCapInst.computeBoundingSphere();
  scene.add(pylonBaseInst);
  scene.add(pylonInst);
  scene.add(stripInst);
  scene.add(pylonCapInst);

  // Overhead Dual-Halo Colosseum Crown Rings
  const crownOuter = new THREE.Mesh(trackG(new THREE.TorusGeometry(10.9, 0.16, 10, 48)), trimMetalMat);
  crownOuter.rotation.x = Math.PI / 2;
  crownOuter.position.y = 5.25;
  scene.add(crownOuter);

  const crownInner = new THREE.Mesh(
    trackG(new THREE.TorusGeometry(10.45, 0.06, 8, 48)),
    pylonStripMat
  );
  crownInner.rotation.x = Math.PI / 2;
  crownInner.position.y = 5.05;
  scene.add(crownInner);

  // Fighters: Cyber Knight (Player - Titanium/Cyan) vs Shadow Ronin (Bot - Obsidian/Crimson)
  const playerRig: FighterRig = createCyberKnightRig(
    0x1e3a5f,
    0x06b6d4,
    textures.armorWeaveBump,
    textures.contactShadowMap,
    !isSoftwareGl
  );
  const botRig: FighterRig = createCyberKnightRig(
    0x3b1224,
    0xf43f5e,
    textures.armorWeaveBump,
    textures.contactShadowMap,
    !isSoftwareGl
  );
  scene.add(playerRig.root);
  scene.add(botRig.root);

  // Pooled Ambient Arena Embers (36 floating dust motes around perimeter, zero GC)
  const EMBER_COUNT = 36;
  const embers: EmberMote[] = Array.from({ length: EMBER_COUNT }, (_, i) => ({
    angle: (i / EMBER_COUNT) * Math.PI * 2,
    radius: 7.5 + (i % 5) * 0.85,
    y: 0.4 + (i % 7) * 0.65,
    speed: 0.35 + (i % 4) * 0.14,
    scale: 0.6 + (i % 3) * 0.28,
  }));
  const emberGeo = trackG(new THREE.OctahedronGeometry(0.055, 0));
  const emberMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const emberMesh = new THREE.InstancedMesh(emberGeo, emberMat, EMBER_COUNT);
  emberMesh.frustumCulled = false;
  scene.add(emberMesh);

  // Pooled Spark Particle Ring Buffer (64 instances, zero GC)
  const MAX_SPARKS = 64;
  const sparks: SparkParticle[] = Array.from({ length: MAX_SPARKS }, () => ({
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    maxLife: 0.3,
    scale: 1,
    color: new THREE.Color(0xffffff),
  }));
  let sparkCursor = 0;

  const sparkGeo = trackG(new THREE.OctahedronGeometry(0.08, 0));
  const sparkMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
  );
  const sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
  sparkMesh.frustumCulled = false;
  for (let i = 0; i < MAX_SPARKS; i++) {
    _dummyObj.position.set(0, -100, 0);
    _dummyObj.scale.set(0, 0, 0);
    _dummyObj.updateMatrix();
    sparkMesh.setMatrixAt(i, _dummyObj.matrix);
    sparkMesh.setColorAt(i, sparks[i].color);
  }
  scene.add(sparkMesh);

  // Pooled Shockwave Ring (thin crisp kinetic pulse)
  const waveMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const shockwaveMesh = new THREE.Mesh(trackG(new THREE.RingGeometry(0.46, 0.54, 40)), waveMat);
  shockwaveMesh.visible = false;
  scene.add(shockwaveMesh);
  let waveLife = 0;
  const waveDuration = 0.18;

  const spawnSparkBurst = (x: number, y: number, colorHex: number, count: number, speed = 7.5) => {
    for (let i = 0; i < count; i++) {
      const p = sparks[sparkCursor];
      sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.35) * Math.PI;
      const spd = speed * (0.45 + Math.random() * 0.75);
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = (Math.random() - 0.5) * 0.35;
      p.vx = Math.cos(theta) * Math.cos(phi) * spd;
      p.vy = Math.sin(phi) * spd + 1.8;
      p.vz = Math.sin(theta) * Math.cos(phi) * spd;
      p.maxLife = 0.22 + Math.random() * 0.2;
      p.life = p.maxLife;
      p.scale = 0.65 + Math.random() * 0.9;
      p.color.setHex(colorHex);
      sparkMesh.setColorAt(sparkCursor === 0 ? MAX_SPARKS - 1 : sparkCursor - 1, p.color);
    }
    if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
  };

  const spawnShockwave = (x: number, y: number, colorHex: number) => {
    shockwaveMesh.position.set(x, y, 0.25);
    shockwaveMesh.scale.set(0.4, 0.4, 0.4);
    waveMat.color.setHex(colorHex);
    waveMat.opacity = 0.9;
    shockwaveMesh.visible = true;
    waveLife = waveDuration;
  };

  // Pre-warm shaders on GPU devices
  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  // Handle Resize cleanly
  const handleResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', handleResize);

  // Software-WebGL Paced Animation Loop (afterDraw on SoftwareGL, rAF on GPU)
  let frameId = 0;
  let disposed = false;
  let lastTickMs = performance.now();
  const startTickMs = lastTickMs;

  function afterDraw(cb: () => void) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (status === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 80);
      }
    };
    frameId = window.setTimeout(poll, 5);
  }

  function updateVfx(dt: number, elapsed: number) {
    // Update ambient arena embers
    for (let i = 0; i < EMBER_COUNT; i++) {
      const m = embers[i];
      m.y += m.speed * dt;
      m.angle += dt * 0.14;
      if (m.y > 4.8) m.y = 0.2;
      _dummyObj.position.set(Math.cos(m.angle) * m.radius, m.y, Math.sin(m.angle) * m.radius);
      _dummyObj.rotation.set(elapsed + i, elapsed * 0.7, 0);
      _dummyObj.scale.setScalar(m.scale);
      _dummyObj.updateMatrix();
      emberMesh.setMatrixAt(i, _dummyObj.matrix);
    }
    emberMesh.instanceMatrix.needsUpdate = true;

    // Subtle moat energy shimmer
    moatMat.opacity = 0.52 + Math.sin(elapsed * 2.2) * 0.12;

    // Update burst sparks
    let anyChanged = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const p = sparks[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _dummyObj.position.set(0, -100, 0);
        _dummyObj.scale.set(0, 0, 0);
        _dummyObj.updateMatrix();
        sparkMesh.setMatrixAt(i, _dummyObj.matrix);
        continue;
      }
      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.04, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const ratio = p.life / p.maxLife;
      const s = p.scale * ratio;
      _dummyObj.position.set(p.x, p.y, p.z);
      _dummyObj.rotation.set(p.life * 10, p.life * 14, 0);
      _dummyObj.scale.set(s, s * 1.8, s);
      _dummyObj.updateMatrix();
      sparkMesh.setMatrixAt(i, _dummyObj.matrix);
    }
    if (anyChanged) {
      sparkMesh.instanceMatrix.needsUpdate = true;
    }

    if (waveLife > 0) {
      waveLife -= dt;
      const prog = 1 - Math.max(0, waveLife / waveDuration);
      const scale = 0.6 + prog * 2.4;
      shockwaveMesh.scale.set(scale, scale, scale);
      waveMat.opacity = (1 - prog) * 0.62;
      if (waveLife <= 0) shockwaveMesh.visible = false;
    }
  }

  function tick() {
    if (disposed) return;
    const nowMs = performance.now();
    const rawDt = (nowMs - lastTickMs) / 1000;
    lastTickMs = nowMs;
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    const elapsed = (nowMs - startTickMs) / 1000;

    onStep(dt);
    const state = getState();
    const armOverride = getArmOverride?.();

    // Update fighter rigs (player sword arm mirrors live arm+fist override when idle)
    playerRig.updatePose(state.player, dt, elapsed, 1, armOverride);
    botRig.updatePose(state.bot, dt, elapsed, -1);

    // Track floor duel reticle to fighters' midpoint
    const midX = (state.player.x + state.bot.x) * 0.5;
    duelReticle.position.x = THREE.MathUtils.damp(duelReticle.position.x, midX, 12, dt);

    // Update particles, embers & shockwaves
    updateVfx(dt, elapsed);

    // Camera choreography: Asymmetric right-2/3 showcase on Title vs Dynamic Duel Framing in Playing
    if (state.screen === 'title') {
      const orbitAngle = 0.48 + Math.sin(elapsed * 0.25) * 0.35;
      _camGoal.set(
        -1.6 + Math.sin(orbitAngle) * 8.4,
        2.95 + Math.sin(elapsed * 0.5) * 0.2,
        Math.cos(orbitAngle) * 8.4
      );
      camera.position.lerp(_camGoal, 1 - Math.exp(-4 * dt));
      _camTarget.set(-1.65, 1.35, 0);
      camera.lookAt(_camTarget);
    } else {
      const dist = Math.abs(state.bot.x - state.player.x);
      const zoomZ = THREE.MathUtils.clamp(5.9 + dist * 0.68, 6.8, 10.6);

      _camGoal.set(midX * 0.72, 2.65 + (zoomZ - 6.8) * 0.14, zoomZ);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoal.x, 8, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoal.y, 8, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoal.z, 8, dt);

      _camTarget.set(midX, 1.42, 0);
      camera.lookAt(_camTarget);

      // Trauma-squared rotational & positional camera shake
      if (state.cameraTrauma > 0.005) {
        const shake = state.cameraTrauma * state.cameraTrauma;
        camera.position.x += (Math.random() - 0.5) * shake * 0.45;
        camera.position.y += (Math.random() - 0.5) * shake * 0.35;
        camera.rotation.z += (Math.random() - 0.5) * shake * 0.04;
      }
    }

    renderer.render(scene, camera);

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  }

  if (isSoftwareGl) {
    afterDraw(tick);
  } else {
    frameId = requestAnimationFrame(tick);
  }

  return {
    spawnSparkBurst,
    spawnShockwave,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      playerRig.dispose();
      botRig.dispose();
      textures.dispose();
      envRT.dispose();
      trackedGeos.forEach((g) => g.dispose());
      trackedMats.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
