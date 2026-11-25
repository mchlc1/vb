import * as THREE from 'three';

export interface RomanCrowdAndLegionHandle {
  update: (elapsed: number) => void;
  dispose: () => void;
}

interface CheeringArmAnchor {
  x: number;
  y: number;
  z: number;
  yaw: number;
  phase: number;
  speed: number;
  side: number;
}

interface LegionPose {
  x: number;
  z: number;
  yaw: number;
  role: 'legionary' | 'officer' | 'standard';
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function buildRomanColosseumPopulation(
  scene: THREE.Scene,
  scutumMap: THREE.Texture,
  travertineMat: THREE.Material,
  warmStoneMat: THREE.Material,
  enableShadows: boolean
): RomanCrowdAndLegionHandle {
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

  // ============================================================================
  // 1. SPECTATOR CROWD (~720 Instanced Roman Citizens in Tunics, Togas & Cloaks)
  // ============================================================================
  const ARC_START = Math.PI * 0.31;
  const ARC_END = Math.PI * 1.69;
  const ARC_SPAN = ARC_END - ARC_START;

  const CROWD_TIERS = [
    { r: 12.6, y: 1.85, count: 140 }, // Equestrian & Senatorial lower terrace
    { r: 14.0, y: 2.75, count: 170 }, // Second stone terrace
    { r: 15.4, y: 3.65, count: 195 }, // Third stone terrace
    { r: 16.8, y: 4.55, count: 215 }, // Upper plebeian terrace
  ];
  const TOTAL_SPECTATORS = CROWD_TIERS.reduce((acc, t) => acc + t.count, 0);

  const tunicBodyGeo = trackG(new THREE.CylinderGeometry(0.19, 0.24, 0.72, 7));
  const headGeo = trackG(new THREE.SphereGeometry(0.135, 8, 8));
  const crowdArmGeo = trackG(new THREE.CylinderGeometry(0.045, 0.04, 0.42, 6));

  const crowdClothMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.02,
    })
  );
  const crowdSkinMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xc6936c,
      roughness: 0.8,
      metalness: 0.02,
    })
  );

  const crowdBodyInst = new THREE.InstancedMesh(tunicBodyGeo, crowdClothMat, TOTAL_SPECTATORS);
  const crowdHeadInst = new THREE.InstancedMesh(headGeo, crowdSkinMat, TOTAL_SPECTATORS);

  // Animate 180 raised cheering arms for vivid crowd energy
  const CHEER_ARMS = 180;
  const cheerArmInst = new THREE.InstancedMesh(crowdArmGeo, crowdClothMat, CHEER_ARMS);
  cheerArmInst.frustumCulled = false;

  const togaPalette = [
    0xece2ce, // Cream Roman wool toga
    0xdcc9a8, // Unbleached linen tunic
    0xc48b4d, // Ochre cloak
    0x9f4534, // Terracotta tunic
    0x7c6148, // Umber wool cloak
    0xb65d3d, // Burnt sienna
    0xd6c7b4, // Plebeian grey-cream
  ];

  const cheeringAnchors: CheeringArmAnchor[] = [];
  let sIdx = 0;

  CROWD_TIERS.forEach((tier, tierIdx) => {
    for (let i = 0; i < tier.count; i++) {
      const jitterT = ((i * 37) % 11 - 5) * 0.0012;
      const t = (i + 0.5) / tier.count + jitterT;
      const angle = ARC_START + t * ARC_SPAN;
      const rJitter = tier.r + (((i * 19 + tierIdx * 7) % 7) - 3) * 0.14;
      const px = Math.sin(angle) * rJitter;
      const pz = Math.cos(angle) * rJitter;
      const heightScale = 0.9 + ((i * 13) % 7) * 0.032;
      const yaw = angle + Math.PI; // Facing inward toward the arena pit

      _dummy.position.set(px, tier.y + 0.36 * heightScale, pz);
      _dummy.rotation.set(0, yaw, 0);
      _dummy.scale.set(1, heightScale, 0.9);
      _dummy.updateMatrix();
      crowdBodyInst.setMatrixAt(sIdx, _dummy.matrix);

      // Organic varied Roman tunics, togas & cloaks within every tier
      const hash = (i * 29 + tierIdx * 43 + (i % 5) * 11) % 10;
      const colHex =
        tierIdx === 0 && hash < 4
          ? 0xf4ecd8
          : togaPalette[(i * 11 + tierIdx * 5 + (i % 3)) % togaPalette.length];
      _color.setHex(colHex);
      crowdBodyInst.setColorAt(sIdx, _color);

      _dummy.position.set(px, tier.y + 0.84 * heightScale, pz);
      _dummy.rotation.set(0, yaw, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      crowdHeadInst.setMatrixAt(sIdx, _dummy.matrix);

      if (cheeringAnchors.length < CHEER_ARMS && (i + tierIdx) % 4 === 0) {
        cheeringAnchors.push({
          x: px,
          y: tier.y + 0.72 * heightScale,
          z: pz,
          yaw,
          phase: i * 0.73 + tierIdx * 1.4,
          speed: 5.5 + (i % 5) * 1.1,
          side: i % 2 === 0 ? 1 : -1,
        });
        cheerArmInst.setColorAt(cheeringAnchors.length - 1, _color);
      }

      sIdx++;
    }
  });

  crowdBodyInst.instanceMatrix.needsUpdate = true;
  if (crowdBodyInst.instanceColor) crowdBodyInst.instanceColor.needsUpdate = true;
  crowdBodyInst.computeBoundingSphere();
  crowdHeadInst.computeBoundingSphere();
  if (cheerArmInst.instanceColor) cheerArmInst.instanceColor.needsUpdate = true;
  scene.add(crowdBodyInst);
  scene.add(crowdHeadInst);
  scene.add(cheerArmInst);

  // ============================================================================
  // 2. ROMAN LEGIONARIES, CENTURION OFFICERS & GOLDEN EAGLE STANDARD BEARERS
  // ============================================================================
  const legionPlacements: LegionPose[] = [
    // Left Foreground Organized Formation (clearly visible on left flank)
    { x: -6.85, z: 2.35, yaw: 0.78, role: 'officer' },
    { x: -7.65, z: 1.65, yaw: 0.78, role: 'standard' },
    { x: -8.1, z: 2.65, yaw: 0.78, role: 'legionary' },
    { x: -7.4, z: 3.45, yaw: 0.78, role: 'legionary' },
    { x: -8.85, z: 1.95, yaw: 0.78, role: 'legionary' },
    { x: -8.6, z: 3.25, yaw: 0.78, role: 'legionary' },

    // Right Foreground Organized Formation (clearly visible on right flank)
    { x: 6.85, z: 2.35, yaw: -0.78, role: 'officer' },
    { x: 7.65, z: 1.65, yaw: -0.78, role: 'standard' },
    { x: 8.1, z: 2.65, yaw: -0.78, role: 'legionary' },
    { x: 7.4, z: 3.45, yaw: -0.78, role: 'legionary' },
    { x: 8.85, z: 1.95, yaw: -0.78, role: 'legionary' },
    { x: 8.6, z: 3.25, yaw: -0.78, role: 'legionary' },

    // Rear & Portal Guards Securing the Vaulted Arena Entrances
    { x: -8.65, z: -5.45, yaw: 0.55, role: 'legionary' },
    { x: -6.75, z: -7.55, yaw: 0.55, role: 'legionary' },
    { x: -2.05, z: -9.55, yaw: 0.08, role: 'officer' },
    { x: -1.15, z: -9.75, yaw: 0.04, role: 'standard' },
    { x: 1.15, z: -9.75, yaw: -0.04, role: 'standard' },
    { x: 2.05, z: -9.55, yaw: -0.08, role: 'officer' },
    { x: 6.75, z: -7.55, yaw: -0.55, role: 'legionary' },
    { x: 8.65, z: -5.45, yaw: -0.55, role: 'legionary' },
  ];

  // Shared Roman military materials (varied roughness for cloth, iron, bronze & gold)
  const redTunicMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.86, metalness: 0.03 })
  );
  const redCloakMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide })
  );
  const ironArmorMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0xb0b8c2, roughness: 0.28, metalness: 0.9 })
  );
  const bronzeHelmetMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0xc2934b, roughness: 0.25, metalness: 0.88 })
  );
  const goldEagleMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0xf4c44e, roughness: 0.18, metalness: 0.96 })
  );
  const woodSpearMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.78, metalness: 0.04 })
  );
  const leatherSandalMat = trackM(
    new THREE.MeshStandardMaterial({ color: 0x432613, roughness: 0.76, metalness: 0.05 })
  );
  const legionScutumMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: scutumMap,
      roughness: 0.56,
      metalness: 0.14,
      side: THREE.DoubleSide,
    })
  );

  // Reusable Roman Legionary component geometries
  const legGeo = trackG(new THREE.CylinderGeometry(0.088, 0.072, 0.76, 8));
  const sandalGeo = trackG(new THREE.BoxGeometry(0.125, 0.08, 0.24));
  const tunicSkirtGeo = trackG(new THREE.CylinderGeometry(0.21, 0.28, 0.44, 10));
  const loricaGeo = trackG(new THREE.CylinderGeometry(0.22, 0.2, 0.48, 10));
  const loricaBandGeo = trackG(new THREE.TorusGeometry(0.215, 0.018, 6, 12));
  const shoulderGuardGeo = trackG(new THREE.BoxGeometry(0.58, 0.13, 0.28));
  const cloakGeo = trackG(new THREE.BoxGeometry(0.46, 0.86, 0.055));
  const headSphereGeo = trackG(new THREE.SphereGeometry(0.125, 10, 10));
  const galeaDomeGeo = trackG(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6));
  const neckGuardGeo = trackG(new THREE.CylinderGeometry(0.19, 0.21, 0.035, 12, 1, false, Math.PI * 0.55, Math.PI * 0.9));
  const cheekGuardGeo = trackG(new THREE.BoxGeometry(0.032, 0.14, 0.11));
  const transverseCrestGeo = trackG(new THREE.BoxGeometry(0.42, 0.17, 0.08));
  const scutumArcGeo = trackG(
    new THREE.CylinderGeometry(0.48, 0.48, 0.98, 12, 1, true, -Math.PI * 0.25, Math.PI * 0.5)
  );
  const umboGeo = trackG(new THREE.SphereGeometry(0.085, 10, 8));
  const pilumShaftGeo = trackG(new THREE.CylinderGeometry(0.024, 0.026, 1.9, 6));
  const pilumIronGeo = trackG(new THREE.CylinderGeometry(0.014, 0.016, 0.54, 6));
  const pilumTipGeo = trackG(new THREE.ConeGeometry(0.028, 0.1, 4));
  const standardPoleGeo = trackG(new THREE.CylinderGeometry(0.028, 0.03, 2.75, 8));
  const crossBarGeo = trackG(new THREE.BoxGeometry(0.48, 0.05, 0.05));
  const eagleBodyGeo = trackG(new THREE.OctahedronGeometry(0.16, 0));
  const eagleWingGeo = trackG(new THREE.BoxGeometry(0.48, 0.15, 0.035));

  const legionGroup = new THREE.Group();

  legionPlacements.forEach((pos) => {
    const soldier = new THREE.Group();
    soldier.position.set(pos.x, 0, pos.z);
    soldier.rotation.y = pos.yaw;

    // Bare calves + leather Caligae sandals
    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(legGeo, crowdSkinMat);
      leg.position.set(sx, 0.41, 0);
      soldier.add(leg);

      const sandal = new THREE.Mesh(sandalGeo, leatherSandalMat);
      sandal.position.set(sx, 0.04, 0.035);
      soldier.add(sandal);
    }

    // Red Roman military tunic skirt
    const skirt = new THREE.Mesh(tunicSkirtGeo, redTunicMat);
    skirt.position.y = 0.84;
    soldier.add(skirt);

    // Torso: Officer bronze muscle cuirass vs Legionary banded Lorica Segmentata
    const torsoMat = pos.role === 'officer' ? bronzeHelmetMat : ironArmorMat;
    const torso = new THREE.Mesh(loricaGeo, torsoMat);
    torso.position.y = 1.24;
    soldier.add(torso);

    if (pos.role !== 'officer') {
      for (const by of [1.08, 1.2, 1.32]) {
        const band = new THREE.Mesh(loricaBandGeo, ironArmorMat);
        band.rotation.x = Math.PI / 2;
        band.position.y = by;
        soldier.add(band);
      }
      const shoulderPlates = new THREE.Mesh(shoulderGuardGeo, ironArmorMat);
      shoulderPlates.position.y = 1.44;
      soldier.add(shoulderPlates);
    }

    // Draped red military cloak (Sagum)
    const cloak = new THREE.Mesh(cloakGeo, redCloakMat);
    cloak.position.set(0, 1.12, -0.2);
    cloak.rotation.x = 0.08;
    soldier.add(cloak);

    // Head + Bronze Galea Helmet with cheek guards & neck guard
    const head = new THREE.Mesh(headSphereGeo, crowdSkinMat);
    head.position.y = 1.62;
    soldier.add(head);

    const galea = new THREE.Mesh(galeaDomeGeo, bronzeHelmetMat);
    galea.position.y = 1.64;
    soldier.add(galea);

    const neckGuard = new THREE.Mesh(neckGuardGeo, bronzeHelmetMat);
    neckGuard.position.set(0, 1.56, -0.02);
    soldier.add(neckGuard);

    for (const cx of [-0.115, 0.115]) {
      const cheek = new THREE.Mesh(cheekGuardGeo, bronzeHelmetMat);
      cheek.position.set(cx, 1.57, 0.04);
      soldier.add(cheek);
    }

    if (pos.role === 'officer') {
      const crest = new THREE.Mesh(transverseCrestGeo, redTunicMat);
      crest.position.set(0, 1.84, 0);
      soldier.add(crest);
    }

    // Rectangular Scutum Shield held on left flank
    if (pos.role !== 'standard') {
      const scutum = new THREE.Mesh(scutumArcGeo, legionScutumMat);
      scutum.position.set(-0.24, 1.02, 0.05);
      scutum.rotation.y = -Math.PI * 0.35;
      soldier.add(scutum);

      const umbo = new THREE.Mesh(umboGeo, bronzeHelmetMat);
      umbo.scale.set(1, 1, 0.5);
      umbo.position.set(0, 0, 0.46);
      scutum.add(umbo);
    }

    // Right hand: Pila Spear OR Golden Eagle Military Standard (Aquila)
    if (pos.role === 'standard') {
      const pole = new THREE.Mesh(standardPoleGeo, woodSpearMat);
      pole.position.set(0.32, 1.38, 0.16);
      soldier.add(pole);

      const crossBar = new THREE.Mesh(crossBarGeo, goldEagleMat);
      crossBar.position.set(0.32, 2.52, 0.16);
      soldier.add(crossBar);

      // Golden Roman Eagle (Aquila) with spread wings
      const eagleBody = new THREE.Mesh(eagleBodyGeo, goldEagleMat);
      eagleBody.position.set(0.32, 2.82, 0.16);
      soldier.add(eagleBody);

      const eagleWings = new THREE.Mesh(eagleWingGeo, goldEagleMat);
      eagleWings.position.set(0.32, 2.86, 0.16);
      soldier.add(eagleWings);
    } else {
      const shaft = new THREE.Mesh(pilumShaftGeo, woodSpearMat);
      shaft.position.set(0.3, 1.02, 0.16);
      soldier.add(shaft);

      const shank = new THREE.Mesh(pilumIronGeo, ironArmorMat);
      shank.position.set(0.3, 2.15, 0.16);
      soldier.add(shank);

      const tip = new THREE.Mesh(pilumTipGeo, ironArmorMat);
      tip.position.set(0.3, 2.44, 0.16);
      soldier.add(tip);
    }

    if (enableShadows) {
      soldier.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
    }

    legionGroup.add(soldier);
  });

  scene.add(legionGroup);

  // ============================================================================
  // 3. ANCIENT ROME 80 AD CITY SKYLINE & CYPRESS TREES BEYOND THE ARCHES
  // ============================================================================
  const cityMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0xc2ab8a,
      roughness: 0.85,
      metalness: 0.04,
    })
  );
  const roofMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x9b543b,
      roughness: 0.82,
      metalness: 0.05,
    })
  );
  const cypressMat = trackM(
    new THREE.MeshStandardMaterial({
      color: 0x3b4d2b,
      roughness: 0.9,
      metalness: 0.02,
    })
  );

  const BLDG_COUNT = 24;
  const bldgGeo = trackG(new THREE.BoxGeometry(3.4, 5.2, 3.2));
  const pedimentGeo = trackG(new THREE.ConeGeometry(2.6, 1.6, 4));
  const bldgInst = new THREE.InstancedMesh(bldgGeo, cityMat, BLDG_COUNT);
  const roofInst = new THREE.InstancedMesh(pedimentGeo, roofMat, BLDG_COUNT);

  const CYPRESS_COUNT = 32;
  const cypressGeo = trackG(new THREE.ConeGeometry(0.65, 4.8, 7));
  const cypressInst = new THREE.InstancedMesh(cypressGeo, cypressMat, CYPRESS_COUNT);

  for (let i = 0; i < BLDG_COUNT; i++) {
    const angle = Math.PI * 0.25 + (i / (BLDG_COUNT - 1)) * (Math.PI * 1.5);
    const r = 27 + (i % 3) * 5.2;
    const hScale = 0.8 + ((i * 5) % 4) * 0.35;
    const bx = Math.sin(angle) * r;
    const bz = Math.cos(angle) * r;

    _dummy.position.set(bx, 2.5 * hScale, bz);
    _dummy.rotation.set(0, angle, 0);
    _dummy.scale.set(0.85 + (i % 3) * 0.25, hScale, 1);
    _dummy.updateMatrix();
    bldgInst.setMatrixAt(i, _dummy.matrix);

    _dummy.position.set(bx, 5.0 * hScale + 0.75, bz);
    _dummy.rotation.set(0, angle + Math.PI / 4, 0);
    _dummy.scale.set(0.95 + (i % 3) * 0.22, 0.9, 0.95);
    _dummy.updateMatrix();
    roofInst.setMatrixAt(i, _dummy.matrix);
  }
  bldgInst.computeBoundingSphere();
  roofInst.computeBoundingSphere();
  scene.add(bldgInst);
  scene.add(roofInst);

  for (let i = 0; i < CYPRESS_COUNT; i++) {
    const angle = Math.PI * 0.22 + (i / (CYPRESS_COUNT - 1)) * (Math.PI * 1.56);
    const r = 23.5 + (i % 4) * 3.8;
    const s = 0.85 + (i % 3) * 0.25;
    _dummy.position.set(Math.sin(angle) * r, 2.2 * s, Math.cos(angle) * r);
    _dummy.rotation.set(0, i, 0);
    _dummy.scale.set(s, s, s);
    _dummy.updateMatrix();
    cypressInst.setMatrixAt(i, _dummy.matrix);
  }
  cypressInst.computeBoundingSphere();
  scene.add(cypressInst);

  // Unused stone refs kept clean if extended
  void travertineMat;
  void warmStoneMat;

  const update = (elapsed: number) => {
    for (let i = 0; i < cheeringAnchors.length; i++) {
      const a = cheeringAnchors[i];
      const wave = Math.sin(elapsed * a.speed + a.phase);
      const cosYaw = Math.cos(a.yaw);
      const sinYaw = Math.sin(a.yaw);
      const armOffset = a.side * 0.22;

      _dummy.position.set(
        a.x + cosYaw * armOffset,
        a.y + 0.16 + Math.max(0, wave) * 0.11,
        a.z - sinYaw * armOffset
      );
      _dummy.rotation.set(0.35 + wave * 0.45, a.yaw, a.side * (0.38 + wave * 0.25));
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      cheerArmInst.setMatrixAt(i, _dummy.matrix);
    }
    cheerArmInst.instanceMatrix.needsUpdate = true;
  };

  // Run initial crowd arm frame immediately so t=0 renders arms in position
  update(0);

  return {
    update,
    dispose: () => {
      trackedGeos.forEach((g) => g.dispose());
      trackedMats.forEach((m) => m.dispose());
    },
  };
}
