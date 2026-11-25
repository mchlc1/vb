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
  x: number;
  z: number;
  y: number;
  baseY: number;
  speed: number;
  phase: number;
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
  renderer.toneMappingExposure = 1.15;
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
  // Dusk Roman twilight sky + matched horizon fog
  const SKY_COLOR = 0x101624;
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.FogExp2(SKY_COLOR, 0.017);

  const camera = new THREE.PerspectiveCamera(
    46,
    (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
    0.1,
    150
  );
  camera.position.set(0, 3.4, 9.4);

  // Studio Environment Reflections (PMREM + RoomEnvironment)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envRT.texture;
  roomEnv.dispose();
  pmremGenerator.dispose();

  // Warm Golden Sun Key Light + Cool Twilight Sky Fill + Torchlight Accents
  const hemiLight = new THREE.HemisphereLight(0x8bb4e8, 0x4b3824, 0.88);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffe0b2, 2.2);
  keyLight.position.set(8, 16, 9);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 40;
  keyLight.shadow.camera.left = -12;
  keyLight.shadow.camera.right = 12;
  keyLight.shadow.camera.top = 12;
  keyLight.shadow.camera.bottom = -12;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x7dd3fc, 1.15);
  rimLight.position.set(-9, 8, -11);
  scene.add(rimLight);

  // Warm torchlight pools inside the Colosseum arcades
  const torchLightLeft = new THREE.PointLight(0xff922b, 7.5, 22, 1.6);
  torchLightLeft.position.set(-8.5, 3.6, -5.5);
  scene.add(torchLightLeft);

  const torchLightRight = new THREE.PointLight(0xff922b, 7.5, 22, 1.6);
  torchLightRight.position.set(8.5, 3.6, -5.5);
  scene.add(torchLightRight);

  // Procedural Colosseum Textures
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

  // Materials with realistic stone/sand/bronze roughness contrast
  const travertineMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.travertineMap,
      bumpMap: textures.travertineBump,
      bumpScale: 0.035,
      roughness: 0.82,
      metalness: 0.05,
    })
  );

  const warmStoneMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xa49073,
      bumpMap: textures.travertineBump,
      bumpScale: 0.025,
      roughness: 0.86,
      metalness: 0.04,
    })
  );

  const bronzeMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x7c5828,
      roughness: 0.34,
      metalness: 0.86,
    })
  );

  const flameMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0xff6b00,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
  );

  // 1. Extended Earth Ground Plane (prevents floating in empty void)
  const earthMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x221b14,
      roughness: 0.94,
      metalness: 0.02,
    })
  );
  const outerEarth = new THREE.Mesh(trackG(new THREE.CircleGeometry(65, 48)), earthMat);
  outerEarth.rotation.x = -Math.PI / 2;
  outerEarth.position.y = -0.18;
  outerEarth.receiveShadow = !isSoftwareGl;
  scene.add(outerEarth);

  // 2. Compacted Gladiator Sand Combat Pit (top surface exactly y = 0)
  const sandFloorMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.arenaFloorMap,
      bumpMap: textures.arenaFloorBump,
      bumpScale: 0.02,
      roughness: 0.88,
      metalness: 0.04,
    })
  );
  const sandFloor = new THREE.Mesh(trackG(new THREE.CylinderGeometry(9.1, 9.2, 0.24, 48)), sandFloorMat);
  sandFloor.position.y = -0.12;
  sandFloor.receiveShadow = !isSoftwareGl;
  scene.add(sandFloor);

  // Carved Stone Arena Curb Ring around the sand pit
  const curbRing = new THREE.Mesh(trackG(new THREE.TorusGeometry(9.05, 0.18, 10, 48)), warmStoneMat);
  curbRing.rotation.x = Math.PI / 2;
  curbRing.position.y = 0.04;
  scene.add(curbRing);

  // Subtle Bronze Combat Midpoint Reticle on the sand
  const reticleMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.34,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const duelReticle = new THREE.Mesh(trackG(new THREE.RingGeometry(1.12, 1.22, 32)), reticleMat);
  duelReticle.rotation.x = -Math.PI / 2;
  duelReticle.position.y = 0.015;
  scene.add(duelReticle);

  // 3. Colosseum Podium Wall + 3 Stepped Amphitheater Seating Tiers (Cavea)
  // Spans the rear & flank 235° arc (-Z hemisphere + sides) so front camera at +Z is never blocked
  const ARC_START = Math.PI * 0.34;
  const ARC_END = Math.PI * 1.66;
  const ARC_SPAN = ARC_END - ARC_START;

  const PODIUM_SEGMENTS = 24;
  const podiumWallGeo = trackG(new THREE.BoxGeometry(2.08, 1.25, 0.92));
  const podiumInst = new THREE.InstancedMesh(podiumWallGeo, travertineMat, PODIUM_SEGMENTS);
  podiumInst.castShadow = !isSoftwareGl;
  podiumInst.receiveShadow = !isSoftwareGl;

  for (let i = 0; i < PODIUM_SEGMENTS; i++) {
    const t = i / (PODIUM_SEGMENTS - 1);
    const angle = ARC_START + t * ARC_SPAN;
    const r = 9.5;
    _dummyObj.position.set(Math.sin(angle) * r, 0.54, Math.cos(angle) * r);
    _dummyObj.rotation.set(0, angle, 0);
    _dummyObj.scale.set(1, 1, 1);
    _dummyObj.updateMatrix();
    podiumInst.setMatrixAt(i, _dummyObj.matrix);
  }
  podiumInst.computeBoundingSphere();
  scene.add(podiumInst);

  // 3 Stepped Spectator Seating Tiers (Cavea)
  const TIER_RADII = [10.7, 12.1, 13.5];
  const TIER_HEIGHTS = [1.45, 2.35, 3.25];
  const TIER_SEGMENTS = 26;
  const seatBlockGeo = trackG(new THREE.BoxGeometry(2.42, 1.1, 1.55));
  const seatInst = new THREE.InstancedMesh(
    seatBlockGeo,
    warmStoneMat,
    TIER_RADII.length * TIER_SEGMENTS
  );
  seatInst.castShadow = !isSoftwareGl;
  seatInst.receiveShadow = !isSoftwareGl;

  let seatIdx = 0;
  for (let tier = 0; tier < TIER_RADII.length; tier++) {
    const r = TIER_RADII[tier];
    const h = TIER_HEIGHTS[tier];
    for (let i = 0; i < TIER_SEGMENTS; i++) {
      const t = i / (TIER_SEGMENTS - 1);
      const angle = ARC_START + t * ARC_SPAN;
      _dummyObj.position.set(Math.sin(angle) * r, h - 0.55, Math.cos(angle) * r);
      _dummyObj.rotation.set(0, angle, 0);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.updateMatrix();
      seatInst.setMatrixAt(seatIdx++, _dummyObj.matrix);
    }
  }
  seatInst.computeBoundingSphere();
  scene.add(seatInst);

  // 4. Iconic 2-Tier Roman Colosseum Arched Colonnade Facade (Piers + Semi-Circular Arches + Cornices)
  const BAY_COUNT = 14;
  const FACADE_RADIUS = 15.1;
  const PIER_COUNT = BAY_COUNT + 1;

  // Lower & Upper Travertine Piers (2 tiers = 30 piers)
  const pierGeo = trackG(new THREE.BoxGeometry(0.95, 3.85, 1.25));
  const pierInst = new THREE.InstancedMesh(pierGeo, travertineMat, PIER_COUNT * 2);
  pierInst.castShadow = !isSoftwareGl;
  pierInst.receiveShadow = !isSoftwareGl;

  // Semi-circular Roman Arches spanning flush between piers (2 tiers = 28 arches)
  const archGeo = trackG(new THREE.TorusGeometry(1.36, 0.28, 8, 18, Math.PI));
  const archInst = new THREE.InstancedMesh(archGeo, travertineMat, BAY_COUNT * 2);
  archInst.castShadow = !isSoftwareGl;

  // Warm shadowed alcove backdrop ONLY on Tier 1 so Tier 2 arches open dramatically to the twilight sky!
  const arcadeBackdropGeo = trackG(new THREE.BoxGeometry(2.85, 3.7, 0.2));
  const arcadeBackdropMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x24170f,
      emissive: 0x3b1503,
      emissiveIntensity: 0.7,
      roughness: 0.92,
    })
  );
  const backdropInst = new THREE.InstancedMesh(arcadeBackdropGeo, arcadeBackdropMat, BAY_COUNT);

  let pIdx = 0;
  for (let tier = 0; tier < 2; tier++) {
    const baseY = tier === 0 ? 3.55 : 7.35;
    for (let i = 0; i < PIER_COUNT; i++) {
      const t = i / (PIER_COUNT - 1);
      const angle = ARC_START + t * ARC_SPAN;
      _dummyObj.position.set(
        Math.sin(angle) * FACADE_RADIUS,
        baseY + 1.85,
        Math.cos(angle) * FACADE_RADIUS
      );
      _dummyObj.rotation.set(0, angle, 0);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.updateMatrix();
      pierInst.setMatrixAt(pIdx++, _dummyObj.matrix);
    }
  }
  pierInst.computeBoundingSphere();
  scene.add(pierInst);

  let aIdx = 0;
  for (let tier = 0; tier < 2; tier++) {
    const archY = tier === 0 ? 5.65 : 9.45;
    for (let i = 0; i < BAY_COUNT; i++) {
      const t = (i + 0.5) / BAY_COUNT;
      const angle = ARC_START + t * ARC_SPAN;

      _dummyObj.position.set(
        Math.sin(angle) * FACADE_RADIUS,
        archY,
        Math.cos(angle) * FACADE_RADIUS
      );
      _dummyObj.rotation.set(0, angle, 0);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.updateMatrix();
      archInst.setMatrixAt(aIdx, _dummyObj.matrix);

      if (tier === 0) {
        _dummyObj.position.set(
          Math.sin(angle) * (FACADE_RADIUS + 0.72),
          5.35,
          Math.cos(angle) * (FACADE_RADIUS + 0.72)
        );
        _dummyObj.updateMatrix();
        backdropInst.setMatrixAt(i, _dummyObj.matrix);
      }
      aIdx++;
    }
  }
  archInst.computeBoundingSphere();
  backdropInst.computeBoundingSphere();
  scene.add(archInst);
  scene.add(backdropInst);

  // Carved Horizontal Entablature Cornice Bands across the Colosseum Facade
  const corniceGeo = trackG(
    new THREE.CylinderGeometry(
      FACADE_RADIUS + 0.65,
      FACADE_RADIUS + 0.65,
      0.42,
      36,
      1,
      true,
      ARC_START - 0.04,
      ARC_SPAN + 0.08
    )
  );
  const corniceMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xcab99c,
      roughness: 0.75,
      metalness: 0.08,
      side: THREE.DoubleSide,
    })
  );
  for (const cy of [3.5, 7.25, 11.05]) {
    const cornice = new THREE.Mesh(corniceGeo, corniceMat);
    cornice.position.y = cy;
    scene.add(cornice);
  }

  // 5. Six Gladiator Torch Braziers along the Podium Rim (Multi-part Stone + Bronze Bowl + Flame)
  const BRAZIER_COUNT = 6;
  const flameMeshes: THREE.Mesh[] = [];
  const emberAnchors: { x: number; z: number }[] = [];

  const brazierPedestalGeo = trackG(new THREE.CylinderGeometry(0.32, 0.42, 0.9, 8));
  const brazierBowlGeo = trackG(new THREE.CylinderGeometry(0.46, 0.22, 0.34, 12));
  const flameGeo = trackG(new THREE.ConeGeometry(0.24, 0.68, 8));

  for (let i = 0; i < BRAZIER_COUNT; i++) {
    const t = i / (BRAZIER_COUNT - 1);
    const angle = Math.PI * 0.44 + t * (Math.PI * 1.12);
    const r = 8.75;
    const bx = Math.sin(angle) * r;
    const bz = Math.cos(angle) * r;
    emberAnchors.push({ x: bx, z: bz });

    const brazier = new THREE.Group();
    brazier.position.set(bx, 0, bz);

    const ped = new THREE.Mesh(brazierPedestalGeo, warmStoneMat);
    ped.position.y = 0.45;
    ped.castShadow = !isSoftwareGl;
    brazier.add(ped);

    const bowl = new THREE.Mesh(brazierBowlGeo, bronzeMat);
    bowl.position.y = 1.05;
    bowl.castShadow = !isSoftwareGl;
    brazier.add(bowl);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 1.45;
    brazier.add(flame);
    flameMeshes.push(flame);

    scene.add(brazier);
  }

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

  // Pooled Rising Brazier Embers (36 motes, zero GC)
  const EMBER_COUNT = 36;
  const embers: EmberMote[] = Array.from({ length: EMBER_COUNT }, (_, i) => {
    const anchor = emberAnchors[i % emberAnchors.length];
    return {
      x: anchor.x + ((i % 5) - 2) * 0.08,
      z: anchor.z + (((i * 3) % 5) - 2) * 0.08,
      y: 1.5 + (i % 6) * 0.65,
      baseY: 1.45,
      speed: 0.65 + (i % 4) * 0.25,
      phase: i * 1.1,
      scale: 0.45 + (i % 3) * 0.22,
    };
  });
  const emberGeo = trackG(new THREE.OctahedronGeometry(0.05, 0));
  const emberMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0xffb74d,
      transparent: true,
      opacity: 0.72,
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
    // Flicker torch flames & warm point lights
    flameMeshes.forEach((flame, idx) => {
      const flick = 0.85 + Math.sin(elapsed * 14 + idx * 1.9) * 0.16;
      flame.scale.set(0.95, flick, 0.95);
    });
    torchLightLeft.intensity = 7.2 + Math.sin(elapsed * 11) * 1.1;
    torchLightRight.intensity = 7.2 + Math.cos(elapsed * 12.5) * 1.1;

    // Update rising brazier embers
    for (let i = 0; i < EMBER_COUNT; i++) {
      const m = embers[i];
      m.y += m.speed * dt;
      if (m.y > 4.6) m.y = m.baseY;
      const swayX = Math.sin(elapsed * 2.5 + m.phase) * 0.14;
      const swayZ = Math.cos(elapsed * 2.1 + m.phase) * 0.14;
      _dummyObj.position.set(m.x + swayX, m.y, m.z + swayZ);
      _dummyObj.rotation.set(elapsed + i, elapsed * 0.7, 0);
      _dummyObj.scale.setScalar(m.scale * (1 - (m.y - m.baseY) / 3.8));
      _dummyObj.updateMatrix();
      emberMesh.setMatrixAt(i, _dummyObj.matrix);
    }
    emberMesh.instanceMatrix.needsUpdate = true;

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

    // Update fighter rigs
    playerRig.updatePose(state.player, dt, elapsed, 1, armOverride);
    botRig.updatePose(state.bot, dt, elapsed, -1);

    // Track floor duel reticle to fighters' midpoint
    const midX = (state.player.x + state.bot.x) * 0.5;
    duelReticle.position.x = THREE.MathUtils.damp(duelReticle.position.x, midX, 12, dt);

    // Update particles, braziers & shockwaves
    updateVfx(dt, elapsed);

    // Camera choreography: Asymmetric right-2/3 Colosseum showcase on Title vs Dynamic Duel Framing
    if (state.screen === 'title') {
      const orbitAngle = 0.42 + Math.sin(elapsed * 0.22) * 0.25;
      _camGoal.set(
        -1.6 + Math.sin(orbitAngle) * 8.8,
        3.05 + Math.sin(elapsed * 0.5) * 0.18,
        Math.cos(orbitAngle) * 8.8
      );
      camera.position.lerp(_camGoal, 1 - Math.exp(-4 * dt));
      _camTarget.set(-1.65, 1.55, -0.8);
      camera.lookAt(_camTarget);
    } else {
      const dist = Math.abs(state.bot.x - state.player.x);
      const zoomZ = THREE.MathUtils.clamp(6.1 + dist * 0.68, 7.0, 10.8);

      _camGoal.set(midX * 0.72, 2.75 + (zoomZ - 7.0) * 0.14, zoomZ);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoal.x, 8, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoal.y, 8, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoal.z, 8, dt);

      _camTarget.set(midX, 1.52, -0.6);
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

  frameId = requestAnimationFrame(tick);

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
