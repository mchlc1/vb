import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createGladiatorRig, type FighterRig } from './fighterRig';
import { createProceduralTextures } from './materials';
import { buildRomanColosseumPopulation } from './romanProps';
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

interface DustMote {
  x: number;
  y: number;
  z: number;
  speed: number;
  drift: number;
  phase: number;
  scale: number;
}

export interface ArenaSceneHandle {
  spawnSparkBurst: (x: number, y: number, colorHex: number, count: number, speed?: number) => void;
  spawnShockwave: (x: number, y: number, colorHex: number) => void;
  dispose: () => void;
}

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
  renderer.toneMappingExposure = 1.05;
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
  // Golden Roman afternoon atmospheric sky + matched horizon haze
  const SKY_COLOR = 0xd6b07c;
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.FogExp2(SKY_COLOR, 0.0115);

  const camera = new THREE.PerspectiveCamera(
    48,
    (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
    0.1,
    180
  );
  camera.position.set(-1.5, 4.1, 11.2);

  // Studio IBL Environment for realistic bronze/iron reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.72;
  roomEnv.dispose();
  pmremGenerator.dispose();

  // Golden Afternoon Sunlight & Mediterranean Bounce Lighting Rig
  const hemiLight = new THREE.HemisphereLight(0x9bc7f2, 0xb28247, 0.74);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffe0aa, 2.25);
  sunLight.position.set(14, 18, 11);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 52;
  sunLight.shadow.camera.left = -16;
  sunLight.shadow.camera.right = 16;
  sunLight.shadow.camera.top = 16;
  sunLight.shadow.camera.bottom = -16;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);

  const warmRimLight = new THREE.DirectionalLight(0xffbd6f, 0.85);
  warmRimLight.position.set(-12, 7, -10);
  scene.add(warmRimLight);

  // Subtle warm torch glow inside the vaulted underground/arena portals
  const portalGlowLeft = new THREE.PointLight(0xff8c32, 7.5, 11, 1.6);
  portalGlowLeft.position.set(-6.5, 2.1, -8.5);
  scene.add(portalGlowLeft);

  const portalGlowRight = new THREE.PointLight(0xff8c32, 7.5, 11, 1.6);
  portalGlowRight.position.set(6.5, 2.1, -8.5);
  scene.add(portalGlowRight);

  // Procedural Historical Roman Textures
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

  // Authentic Roman Stone, Sand, Timber & Bronze Materials
  const travertineMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.travertineMap,
      bumpMap: textures.travertineBump,
      bumpScale: 0.035,
      roughness: 0.84,
      metalness: 0.04,
    })
  );

  const warmStoneMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xb69c78,
      bumpMap: textures.travertineBump,
      bumpScale: 0.028,
      roughness: 0.88,
      metalness: 0.03,
    })
  );

  const darkStoneMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x382b1e,
      roughness: 0.94,
      metalness: 0.04,
    })
  );

  const bronzeMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xb3833e,
      roughness: 0.3,
      metalness: 0.86,
    })
  );

  const timberMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x624024,
      roughness: 0.85,
      metalness: 0.04,
    })
  );

  // 1. Extended Ancient Rome Earth Ground Plane (prevents floating void)
  const outerEarth = new THREE.Mesh(
    trackG(new THREE.CircleGeometry(85, 48)),
    trackM(
      new THREE.MeshStandardMaterial({
        color: 0x8f734a,
        roughness: 0.94,
        metalness: 0.02,
      })
    )
  );
  outerEarth.rotation.x = -Math.PI / 2;
  outerEarth.position.y = -0.18;
  outerEarth.receiveShadow = !isSoftwareGl;
  scene.add(outerEarth);

  // 2. Compacted Gladiator Harena Sand Floor (top surface y = 0)
  const sandFloorMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.arenaFloorMap,
      bumpMap: textures.arenaFloorBump,
      bumpScale: 0.022,
      roughness: 0.9,
      metalness: 0.03,
    })
  );
  const sandFloor = new THREE.Mesh(trackG(new THREE.CylinderGeometry(11.6, 11.7, 0.24, 56)), sandFloorMat);
  sandFloor.position.y = -0.12;
  sandFloor.receiveShadow = !isSoftwareGl;
  scene.add(sandFloor);

  // Carved Stone Arena Curb Ring around the sand pit
  const curbRing = new THREE.Mesh(trackG(new THREE.TorusGeometry(11.55, 0.22, 10, 56)), warmStoneMat);
  curbRing.rotation.x = Math.PI / 2;
  curbRing.position.y = 0.04;
  scene.add(curbRing);

  // 3. Podium Wall & Three Vaulted Underground / Vomitoria Entrances
  const ARC_START = Math.PI * 0.3;
  const ARC_END = Math.PI * 1.7;
  const ARC_SPAN = ARC_END - ARC_START;

  const PODIUM_SEGMENTS = 30;
  const portalAngles = [Math.PI * 0.62, Math.PI, Math.PI * 1.38];
  const podiumWallGeo = trackG(new THREE.BoxGeometry(1.92, 1.55, 0.95));
  const podiumInst = new THREE.InstancedMesh(podiumWallGeo, travertineMat, PODIUM_SEGMENTS);
  podiumInst.castShadow = !isSoftwareGl;
  podiumInst.receiveShadow = !isSoftwareGl;

  let podiumCount = 0;
  for (let i = 0; i < PODIUM_SEGMENTS; i++) {
    const t = i / (PODIUM_SEGMENTS - 1);
    const angle = ARC_START + t * ARC_SPAN;
    // Leave clean openings for the 3 vaulted entrances
    const nearPortal = portalAngles.some((pa) => Math.abs(angle - pa) < 0.1);
    if (nearPortal) continue;

    const r = 11.9;
    _dummyObj.position.set(Math.sin(angle) * r, 0.72, Math.cos(angle) * r);
    _dummyObj.rotation.set(0, angle, 0);
    _dummyObj.scale.set(1, 1, 1);
    _dummyObj.updateMatrix();
    podiumInst.setMatrixAt(podiumCount++, _dummyObj.matrix);
  }
  podiumInst.count = podiumCount;
  podiumInst.computeBoundingSphere();
  scene.add(podiumInst);

  // Construct 3 Vaulted Stone Entrances (Jambs, Arch Voussoir, Recessed Tunnel & Portcullis Bars)
  const jambGeo = trackG(new THREE.BoxGeometry(0.48, 2.3, 1.15));
  const lintelGeo = trackG(new THREE.BoxGeometry(3.15, 0.36, 1.25));
  const portalArchGeo = trackG(new THREE.TorusGeometry(1.06, 0.25, 8, 16, Math.PI));
  const tunnelRecessGeo = trackG(new THREE.BoxGeometry(2.12, 2.25, 0.9));
  const portcullisBarGeo = trackG(new THREE.CylinderGeometry(0.032, 0.032, 1.7, 6));

  portalAngles.forEach((angle) => {
    const portalGroup = new THREE.Group();
    const r = 11.95;
    portalGroup.position.set(Math.sin(angle) * r, 0, Math.cos(angle) * r);
    // Point local +Z inward toward arena center (0,0,0)
    portalGroup.rotation.y = angle + Math.PI;

    const lJamb = new THREE.Mesh(jambGeo, travertineMat);
    lJamb.position.set(-1.14, 1.15, 0.08);
    portalGroup.add(lJamb);

    const rJamb = new THREE.Mesh(jambGeo, travertineMat);
    rJamb.position.set(1.14, 1.15, 0.08);
    portalGroup.add(rJamb);

    const corniceCap = new THREE.Mesh(lintelGeo, warmStoneMat);
    corniceCap.position.set(0, 3.25, 0.12);
    portalGroup.add(corniceCap);

    const arch = new THREE.Mesh(portalArchGeo, travertineMat);
    arch.position.set(0, 2.15, 0.42);
    portalGroup.add(arch);

    // Recessed shadowed tunnel opening behind the stone jambs & arch
    const recess = new THREE.Mesh(tunnelRecessGeo, darkStoneMat);
    recess.position.set(0, 1.12, -0.35);
    portalGroup.add(recess);

    // Raised bronze/iron portcullis grate framed inside the arch
    for (let b = -3; b <= 3; b++) {
      const bar = new THREE.Mesh(portcullisBarGeo, bronzeMat);
      bar.position.set(b * 0.24, 2.05, 0.12);
      portalGroup.add(bar);
    }

    scene.add(portalGroup);
  });

  // 4. Four Enormous Concentric Stone Seating Terraces (Cavea)
  const TIER_RADII = [12.6, 14.0, 15.4, 16.8];
  const TIER_HEIGHTS = [1.85, 2.75, 3.65, 4.55];
  const TIER_SEGMENTS = 30;
  const seatBlockGeo = trackG(new THREE.BoxGeometry(2.75, 1.05, 1.5));
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
      _dummyObj.position.set(Math.sin(angle) * r, h - 0.52, Math.cos(angle) * r);
      _dummyObj.rotation.set(0, angle, 0);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.updateMatrix();
      seatInst.setMatrixAt(seatIdx++, _dummyObj.matrix);
    }
  }
  seatInst.computeBoundingSphere();
  scene.add(seatInst);

  // 5. Monumental 3-Tier Flavian Colosseum Arcaded Facade + Attic Story + Velarium Masts
  const BAY_COUNT = 18;
  const FACADE_RADIUS = 18.4;
  const PIER_COUNT = BAY_COUNT + 1;

  const pierGeo = trackG(new THREE.BoxGeometry(0.95, 3.85, 1.3));
  const halfColGeo = trackG(new THREE.CylinderGeometry(0.28, 0.32, 3.7, 10));
  const archGeo = trackG(new THREE.TorusGeometry(1.42, 0.28, 8, 18, Math.PI));

  const pierInst = new THREE.InstancedMesh(pierGeo, travertineMat, PIER_COUNT * 2);
  const colInst = new THREE.InstancedMesh(halfColGeo, warmStoneMat, PIER_COUNT * 2);
  const archInst = new THREE.InstancedMesh(archGeo, travertineMat, BAY_COUNT * 2);
  pierInst.castShadow = !isSoftwareGl;
  pierInst.receiveShadow = !isSoftwareGl;
  archInst.castShadow = !isSoftwareGl;

  // Attic Story Wall & Velarium Wooden Masts along the 3rd upper level
  const atticGeo = trackG(new THREE.BoxGeometry(3.25, 2.75, 0.9));
  const atticInst = new THREE.InstancedMesh(atticGeo, travertineMat, BAY_COUNT);
  const mastGeo = trackG(new THREE.CylinderGeometry(0.08, 0.1, 3.1, 6));
  const mastInst = new THREE.InstancedMesh(mastGeo, timberMat, PIER_COUNT);

  let pIdx = 0;
  for (let tier = 0; tier < 2; tier++) {
    const baseY = tier === 0 ? 4.85 : 8.65;
    for (let i = 0; i < PIER_COUNT; i++) {
      const t = i / (PIER_COUNT - 1);
      const angle = ARC_START + t * ARC_SPAN;
      const px = Math.sin(angle) * FACADE_RADIUS;
      const pz = Math.cos(angle) * FACADE_RADIUS;

      _dummyObj.position.set(px, baseY + 1.85, pz);
      _dummyObj.rotation.set(0, angle, 0);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.updateMatrix();
      pierInst.setMatrixAt(pIdx, _dummyObj.matrix);

      // Engaged Classical Column on inner arena face of each pier
      _dummyObj.position.set(
        Math.sin(angle) * (FACADE_RADIUS - 0.65),
        baseY + 1.85,
        Math.cos(angle) * (FACADE_RADIUS - 0.65)
      );
      _dummyObj.updateMatrix();
      colInst.setMatrixAt(pIdx, _dummyObj.matrix);

      if (tier === 1) {
        _dummyObj.position.set(
          Math.sin(angle) * (FACADE_RADIUS - 0.3),
          15.4,
          Math.cos(angle) * (FACADE_RADIUS - 0.3)
        );
        _dummyObj.updateMatrix();
        mastInst.setMatrixAt(i, _dummyObj.matrix);
      }

      pIdx++;
    }
  }
  pierInst.computeBoundingSphere();
  colInst.computeBoundingSphere();
  mastInst.computeBoundingSphere();
  scene.add(pierInst);
  scene.add(colInst);
  scene.add(mastInst);

  let aIdx = 0;
  for (let tier = 0; tier < 2; tier++) {
    const archY = tier === 0 ? 6.95 : 10.75;
    for (let i = 0; i < BAY_COUNT; i++) {
      const t = (i + 0.5) / BAY_COUNT;
      const angle = ARC_START + t * ARC_SPAN;
      const ax = Math.sin(angle) * FACADE_RADIUS;
      const az = Math.cos(angle) * FACADE_RADIUS;

      _dummyObj.position.set(ax, archY, az);
      _dummyObj.rotation.set(0, angle, 0);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.updateMatrix();
      archInst.setMatrixAt(aIdx++, _dummyObj.matrix);

      if (tier === 1) {
        _dummyObj.position.set(ax, 13.85, az);
        _dummyObj.updateMatrix();
        atticInst.setMatrixAt(i, _dummyObj.matrix);
      }
    }
  }
  archInst.computeBoundingSphere();
  atticInst.computeBoundingSphere();
  scene.add(archInst);
  scene.add(atticInst);

  // Horizontal Entablature Cornice Rings across all 3 Colosseum levels
  const corniceGeo = trackG(
    new THREE.CylinderGeometry(
      FACADE_RADIUS + 0.65,
      FACADE_RADIUS + 0.65,
      0.44,
      40,
      1,
      true,
      ARC_START - 0.04,
      ARC_SPAN + 0.08
    )
  );
  const corniceMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xd0bc9a,
      roughness: 0.78,
      metalness: 0.06,
      side: THREE.DoubleSide,
    })
  );
  for (const cy of [4.8, 8.6, 12.4, 15.3]) {
    const cornice = new THREE.Mesh(corniceGeo, corniceMat);
    cornice.position.y = cy;
    scene.add(cornice);
  }

  // 6. Populate 80 AD Spectator Crowd (~720 cheering citizens), Roman Legionaries, Centurions, Aquila Bearers & City Skyline
  const population = buildRomanColosseumPopulation(
    scene,
    textures.scutumMap,
    travertineMat,
    warmStoneMat,
    !isSoftwareGl
  );

  // 7. Arena Duelists: Murmillo (Blue-Plumed Player) vs Secutor (Crimson Enemy)
  const playerRig: FighterRig = createGladiatorRig(
    0x1e3a8a, // Sapphire-blue Roman subligaculum
    0x2563eb, // Blue horsehair helmet crest
    textures.armorWeaveBump,
    textures.scutumMap,
    textures.contactShadowMap,
    !isSoftwareGl
  );
  const botRig: FighterRig = createGladiatorRig(
    0x7f1d1d, // Imperial crimson subligaculum
    0xdc2626, // Crimson horsehair helmet crest
    textures.armorWeaveBump,
    textures.scutumMap,
    textures.contactShadowMap,
    !isSoftwareGl
  );
  scene.add(playerRig.root);
  scene.add(botRig.root);

  // 8. Golden Afternoon Floating Dust Motes (80 motes, zero GC)
  const DUST_COUNT = 80;
  const dustMotes: DustMote[] = Array.from({ length: DUST_COUNT }, (_, i) => ({
    x: ((i * 17) % 20) - 10,
    y: 0.4 + (i % 9) * 0.75,
    z: ((i * 11) % 14) - 8,
    speed: 0.14 + (i % 4) * 0.06,
    drift: 0.3 + (i % 3) * 0.15,
    phase: i * 0.9,
    scale: 0.03 + (i % 3) * 0.014,
  }));
  const dustGeo = trackG(new THREE.OctahedronGeometry(1, 0));
  const dustMat = trackM(
    new THREE.MeshBasicMaterial({
      color: 0xffe4b5,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    })
  );
  const dustMesh = new THREE.InstancedMesh(dustGeo, dustMat, DUST_COUNT);
  dustMesh.frustumCulled = false;
  scene.add(dustMesh);

  // 9. Pooled Blade Clash Spark Ring Buffer (64 instances, zero GC)
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

  // Pooled Clash Shockwave Ring
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
    waveMat.opacity = 0.85;
    shockwaveMesh.visible = true;
    waveLife = waveDuration;
  };

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  const handleResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', handleResize);

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
    // Update floating golden afternoon dust motes
    for (let i = 0; i < DUST_COUNT; i++) {
      const m = dustMotes[i];
      m.y += m.speed * dt;
      if (m.y > 7.5) m.y = 0.3;
      const sx = m.x + Math.sin(elapsed * 0.45 + m.phase) * m.drift;
      const sz = m.z + Math.cos(elapsed * 0.38 + m.phase) * m.drift;
      _dummyObj.position.set(sx, m.y, sz);
      _dummyObj.rotation.set(elapsed * 0.5 + i, elapsed * 0.3, 0);
      _dummyObj.scale.setScalar(m.scale);
      _dummyObj.updateMatrix();
      dustMesh.setMatrixAt(i, _dummyObj.matrix);
    }
    dustMesh.instanceMatrix.needsUpdate = true;

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

    // Update gladiators & cheering Colosseum crowd
    playerRig.updatePose(state.player, dt, elapsed, 1, armOverride);
    botRig.updatePose(state.bot, dt, elapsed, -1);
    population.update(elapsed);

    // Update dust & combat sparks
    updateVfx(dt, elapsed);

    const midX = (state.player.x + state.bot.x) * 0.5;

    // Camera choreography: Wide-angle 80 AD Colosseum establishing shot on Title vs Dynamic Duel Framing
    if (state.screen === 'title') {
      const orbitAngle = 0.25 + Math.sin(elapsed * 0.2) * 0.22;
      _camGoal.set(
        -1.75 + Math.sin(orbitAngle) * 10.6,
        3.95 + Math.sin(elapsed * 0.45) * 0.16,
        Math.cos(orbitAngle) * 10.6
      );
      camera.position.lerp(_camGoal, 1 - Math.exp(-4 * dt));
      _camTarget.set(-1.6, 2.05, -2.2);
      camera.lookAt(_camTarget);
    } else {
      const dist = Math.abs(state.bot.x - state.player.x);
      const zoomZ = THREE.MathUtils.clamp(6.8 + dist * 0.72, 7.6, 11.4);

      _camGoal.set(midX * 0.72, 3.05 + (zoomZ - 7.6) * 0.16, zoomZ);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoal.x, 8, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoal.y, 8, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoal.z, 8, dt);

      _camTarget.set(midX, 1.75, -1.2);
      camera.lookAt(_camTarget);

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
      population.dispose();
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
