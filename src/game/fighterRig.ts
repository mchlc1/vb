import * as THREE from 'three';
import { getPhaseProgress, type FighterState } from './combatEngine';
import { type ArmTrackingTarget } from './visionMath';

export interface FighterRig {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  neck: THREE.Group;
  rShoulder: THREE.Group;
  rElbow: THREE.Group;
  rWrist: THREE.Group;
  lShoulder: THREE.Group;
  lElbow: THREE.Group;
  lThigh: THREE.Group;
  lKnee: THREE.Group;
  rThigh: THREE.Group;
  rKnee: THREE.Group;
  shieldMesh: THREE.Mesh;
  shieldMat: THREE.MeshPhysicalMaterial;
  swordEdgeMat: THREE.MeshStandardMaterial;
  slashArcMesh: THREE.Mesh;
  slashArcMat: THREE.MeshBasicMaterial;
  armorMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshStandardMaterial;
  updatePose: (
    fighter: FighterState,
    dt: number,
    elapsed: number,
    facingSign: number,
    armOverride?: ArmTrackingTarget
  ) => void;
  dispose: () => void;
}

export function createGladiatorRig(
  tunicColor: number,
  crestColor: number,
  armorBump: THREE.Texture,
  scutumMap: THREE.Texture,
  contactShadowMap: THREE.Texture,
  enableShadows: boolean
): FighterRig {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Authentic 80 AD Roman Materials with realistic roughness contrast (>= 0.25 delta)
  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc58f68,
      roughness: 0.78,
      metalness: 0.02,
    })
  );

  const leatherMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4b2b16,
      roughness: 0.74,
      metalness: 0.06,
      bumpMap: armorBump,
      bumpScale: 0.012,
    })
  );

  const clothMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: tunicColor,
      roughness: 0.88,
      metalness: 0.02,
    })
  );

  const armorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb68a46, // Polished Roman bronze
      roughness: 0.26,
      metalness: 0.88,
      bumpMap: armorBump,
      bumpScale: 0.014,
    })
  );

  const steelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc2c7ce,
      roughness: 0.2,
      metalness: 0.94,
    })
  );

  const coreMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: crestColor, // Horsehair crest & faction trim
      roughness: 0.82,
      metalness: 0.05,
    })
  );

  const swordEdgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdbe2ea,
      emissive: 0x3b2a14,
      emissiveIntensity: 0.15,
      roughness: 0.14,
      metalness: 0.96,
    })
  );

  // Ground contact shadow disc (bottom-center pivot y = 0)
  const shadowGeo = trackGeo(new THREE.CircleGeometry(0.92, 24));
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowMap,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.015;
  root.add(contactShadow);

  // 1. Hips, Subligaculum Loincloth & Leather Balteus Belt (Pivot y = 0.98m)
  const hips = new THREE.Group();
  hips.position.y = 0.98;
  root.add(hips);

  const subligaculum = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.23, 0.27, 0.28, 12)),
    clothMat
  );
  hips.add(subligaculum);

  const beltMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.245, 0.245, 0.11, 12)),
    leatherMat
  );
  beltMesh.position.y = 0.09;
  hips.add(beltMesh);

  const beltBuckle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.08, 0.06)), armorMat);
  beltBuckle.position.set(0, 0.09, 0.23);
  hips.add(beltBuckle);

  // 2. Articulated Muscular Legs + Bronze Ocrea Shin Greave + Caligae Sandals
  const buildLeg = (sideX: number, hasBronzeGreave: boolean) => {
    const thigh = new THREE.Group();
    thigh.position.set(sideX, -0.06, 0);
    hips.add(thigh);

    const thighMesh = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.11, 0.09, 0.44, 10)),
      skinMat
    );
    thighMesh.position.y = -0.22;
    thigh.add(thighMesh);

    const knee = new THREE.Group();
    knee.position.y = -0.45;
    thigh.add(knee);

    const kneeCap = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.088, 10, 10)),
      hasBronzeGreave ? armorMat : skinMat
    );
    knee.add(kneeCap);

    const shinMesh = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.088, 0.068, 0.42, 10)),
      skinMat
    );
    shinMesh.position.y = -0.21;
    knee.add(shinMesh);

    if (hasBronzeGreave) {
      const ocrea = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.094, 0.076, 0.36, 10, 1, false, -Math.PI * 0.45, Math.PI * 0.9)),
        armorMat
      );
      ocrea.position.y = -0.2;
      knee.add(ocrea);
    } else {
      const shinWrap = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.09, 0.074, 0.26, 10)),
        leatherMat
      );
      shinWrap.position.y = -0.25;
      knee.add(shinWrap);
    }

    const sandalFoot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.13, 0.09, 0.27)), leatherMat);
    sandalFoot.position.set(0, -0.44, 0.045);
    knee.add(sandalFoot);

    return { thigh, knee };
  };

  const leftLeg = buildLeg(-0.16, true);
  const rightLeg = buildLeg(0.16, false);

  // 3. Torso, Sculpted Bare Chest, Diagonal Leather Balteus & Shoulder Galerus
  const spine = new THREE.Group();
  spine.position.y = 0.14;
  hips.add(spine);

  const abdomen = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.21, 0.19, 0.3, 10)),
    skinMat
  );
  abdomen.position.y = 0.15;
  spine.add(abdomen);

  const chestShape = new THREE.Shape();
  chestShape.moveTo(-0.31, 0);
  chestShape.lineTo(0.31, 0);
  chestShape.lineTo(0.36, 0.36);
  chestShape.lineTo(0.2, 0.49);
  chestShape.lineTo(-0.2, 0.49);
  chestShape.lineTo(-0.36, 0.36);
  chestShape.closePath();

  const chestGeo = trackGeo(
    new THREE.ExtrudeGeometry(chestShape, {
      depth: 0.28,
      bevelEnabled: true,
      bevelThickness: 0.045,
      bevelSize: 0.035,
      bevelSegments: 2,
    })
  );
  chestGeo.center();
  const chestTorso = new THREE.Mesh(chestGeo, skinMat);
  chestTorso.position.y = 0.48;
  spine.add(chestTorso);

  // Diagonal leather harness + bronze pectoral disk (cardiophylax)
  const balteusStrap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.68, 0.38)), leatherMat);
  balteusStrap.position.set(0, 0.48, 0);
  balteusStrap.rotation.z = 0.56;
  spine.add(balteusStrap);

  const pectoralPlate = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 16)),
    armorMat
  );
  pectoralPlate.rotation.x = Math.PI / 2;
  pectoralPlate.position.set(0, 0.52, 0.185);
  spine.add(pectoralPlate);

  // Short Roman Shoulder Capelet in faction color for instant silhouette read
  const shoulderSash = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.24, 0.32, 0.22, 10, 1, true, Math.PI * 0.65, Math.PI * 0.7)),
    coreMat
  );
  shoulderSash.position.set(0, 0.6, -0.05);
  spine.add(shoulderSash);

  // 4. Neck & Historically Authentic Roman Gladiator Bronze Helmet (Galea / Murmillo with Crest & Cheek Guards)
  const neck = new THREE.Group();
  neck.position.y = 0.78;
  spine.add(neck);

  const neckCol = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.095, 0.115, 0.13, 10)), skinMat);
  neckCol.position.y = 0.05;
  neck.add(neckCol);

  const helmetBowl = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.185, 16, 12)), armorMat);
  helmetBowl.position.y = 0.25;
  neck.add(helmetBowl);

  // Broad rear/side gladiator helmet brim
  const helmetBrim = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.24, 0.25, 0.03, 16)),
    armorMat
  );
  helmetBrim.position.set(0, 0.17, -0.02);
  helmetBrim.rotation.x = -0.15;
  neck.add(helmetBrim);

  // Cheek guards (bucculae) & perforated bronze face guard
  const facePlate = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.17, 0.155, 0.16, 12, 1, false, -Math.PI * 0.42, Math.PI * 0.84)), steelMat);
  facePlate.position.set(0, 0.2, 0.02);
  neck.add(facePlate);

  const eyeSlit = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.032, 0.05)), leatherMat);
  eyeSlit.position.set(0, 0.245, 0.165);
  neck.add(eyeSlit);

  // Horsehair Roman Crest (Crista)
  const crestHolder = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.045, 0.06, 0.3)), armorMat);
  crestHolder.position.set(0, 0.42, -0.01);
  neck.add(crestHolder);

  const horsehairCrest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.065, 0.15, 0.38)), coreMat);
  horsehairCrest.position.set(0, 0.49, -0.03);
  neck.add(horsehairCrest);

  // 5. Right Sword Arm (Bronze Galerus Pauldron + Segmented Manica + Roman Gladius Short Sword)
  const rShoulder = new THREE.Group();
  rShoulder.position.set(0.43, 0.65, 0);
  spine.add(rShoulder);

  const rGalerus = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.14, 0.17, 0.22, 10, 1, false, -Math.PI * 0.3, Math.PI * 0.8)),
    armorMat
  );
  rGalerus.rotation.z = -0.3;
  rShoulder.add(rGalerus);

  const rUpperArm = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.085, 0.075, 0.33, 10)),
    skinMat
  );
  rUpperArm.position.y = -0.17;
  rShoulder.add(rUpperArm);

  const rElbow = new THREE.Group();
  rElbow.position.y = -0.34;
  rShoulder.add(rElbow);

  // Segmented Manica arm guard on forearm
  const rManica = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.082, 0.068, 0.31, 10)),
    leatherMat
  );
  rManica.position.y = -0.15;
  rElbow.add(rManica);

  const manicaBand = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.076, 0.015, 6, 12)), armorMat);
  manicaBand.rotation.x = Math.PI / 2;
  manicaBand.position.y = -0.14;
  rElbow.add(manicaBand);

  const rWrist = new THREE.Group();
  rWrist.position.y = -0.32;
  rElbow.add(rWrist);

  // Historically Accurate Roman Gladius (Pommel + Ribbed Wood Grip + Hemispherical Guard + Broad Steel Blade)
  const gladiusGroup = new THREE.Group();
  gladiusGroup.rotation.x = Math.PI / 2.2;
  rWrist.add(gladiusGroup);

  const grip = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 10)), leatherMat);
  grip.position.y = 0.02;
  gladiusGroup.add(grip);

  const pommel = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.048, 10, 10)), armorMat);
  pommel.position.y = -0.11;
  gladiusGroup.add(pommel);

  const handGuard = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.068, 12, 8)), armorMat);
  handGuard.scale.set(1.2, 0.65, 1.0);
  handGuard.position.y = 0.14;
  gladiusGroup.add(handGuard);

  const bladeBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.022, 0.94, 0.085)), swordEdgeMat);
  bladeBody.position.set(0, 0.62, 0);
  gladiusGroup.add(bladeBody);

  const bladePoint = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.045, 0.2, 4)), swordEdgeMat);
  bladePoint.rotation.y = Math.PI / 4;
  bladePoint.position.set(0, 1.18, 0);
  gladiusGroup.add(bladePoint);

  // Subtle Steel Motion Arc Crescent during active sword strike
  const slashGeo = trackGeo(new THREE.RingGeometry(0.95, 1.24, 28, 1, -Math.PI * 0.36, Math.PI * 0.72));
  const slashArcMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfef3c7,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const slashArcMesh = new THREE.Mesh(slashGeo, slashArcMat);
  slashArcMesh.position.set(0.36, 0.56, 0.28);
  slashArcMesh.rotation.y = Math.PI / 2;
  spine.add(slashArcMesh);

  // 6. Left Shield Arm + Historically Accurate Rectangular Curved Roman Scutum Shield
  const lShoulder = new THREE.Group();
  lShoulder.position.set(-0.43, 0.65, 0);
  spine.add(lShoulder);

  const lUpperArm = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.085, 0.075, 0.33, 10)),
    skinMat
  );
  lUpperArm.position.y = -0.17;
  lShoulder.add(lUpperArm);

  const lElbow = new THREE.Group();
  lElbow.position.y = -0.34;
  lShoulder.add(lElbow);

  const lForearm = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.075, 0.064, 0.31, 10)),
    leatherMat
  );
  lForearm.position.y = -0.15;
  lElbow.add(lForearm);

  const shieldMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: scutumMap,
      transparent: true,
      opacity: 0.96,
      roughness: 0.58,
      metalness: 0.14,
      side: THREE.DoubleSide,
    })
  );
  // Curved rectangular Roman Scutum held upright on the left forearm
  const shieldMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.78, 14, 1, true, -Math.PI * 0.28, Math.PI * 0.56)),
    shieldMat
  );
  shieldMesh.position.set(-0.08, -0.14, 0.16);
  shieldMesh.rotation.set(0.78, -0.22, 0.12);
  lElbow.add(shieldMesh);

  const umboBoss = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.085, 12, 10)), armorMat);
  umboBoss.scale.set(1, 1, 0.55);
  umboBoss.position.set(0, 0, 0.42);
  shieldMesh.add(umboBoss);

  // Enable shadow casting across gladiator parts
  if (enableShadows) {
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj !== contactShadow && obj !== slashArcMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }

  const updatePose = (
    fighter: FighterState,
    dt: number,
    elapsed: number,
    facingSign: number,
    armOverride?: ArmTrackingTarget
  ) => {
    const p = getPhaseProgress(fighter);
    const speedNorm = Math.min(1, Math.abs(fighter.vx) / 5.5);

    const stride = Math.sin(fighter.walkDistance * 3.6) * (0.28 + speedNorm * 0.25);
    const hipBob = Math.abs(Math.cos(fighter.walkDistance * 3.6)) * 0.045 * speedNorm;
    const idleBreath = Math.sin(elapsed * 2.6 + (facingSign > 0 ? 0 : 1.5)) * 0.025;

    let targetHipsY = 0.98 + hipBob + idleBreath;
    let targetSpinePitch = 0.08 + speedNorm * 0.12;
    let targetSpineYaw = -0.25;
    let targetRShoulderX = -0.45;
    let targetRShoulderZ = -0.22;
    let targetRElbowX = -0.95;
    let targetRWristX = 0.15;
    let targetRWristZ = 0;
    let targetLShoulderX = -0.5;
    let targetLElbowX = -0.85;
    let targetShieldScale = 0.84;
    let targetSlashOpacity = 0;

    if (fighter.phase === 'IDLE' && !fighter.isGuarding && armOverride?.hasArm) {
      targetRShoulderX = armOverride.shoulderPitch;
      targetRShoulderZ = armOverride.shoulderRoll;
      targetRElbowX = armOverride.elbowBend;
      targetRWristZ = armOverride.wristTwist;
      targetSpinePitch = 0.08 + Math.max(0, -armOverride.shoulderPitch - 0.5) * 0.08;
    }

    if (fighter.phase === 'WINDUP') {
      const w = Math.sin(p * Math.PI * 0.5);
      targetHipsY = 0.93;
      targetSpinePitch = -0.08 * w;
      targetSpineYaw = -0.65 * w;
      targetRShoulderX = -2.2 * w - 0.3;
      targetRShoulderZ = -0.5 * w;
      targetRElbowX = -1.1;
      targetRWristX = -0.25;
      swordEdgeMat.emissiveIntensity = 0.25 + w * 0.9;
    } else if (fighter.phase === 'ACTIVE') {
      const swingCurve = 1 - Math.pow(1 - p, 3);
      targetHipsY = 0.91;
      targetSpinePitch = 0.28;
      targetSpineYaw = THREE.MathUtils.lerp(-0.65, 0.72, swingCurve);
      targetRShoulderX = THREE.MathUtils.lerp(-2.35, 0.68, swingCurve);
      targetRShoulderZ = THREE.MathUtils.lerp(-0.5, 0.28, swingCurve);
      targetRElbowX = THREE.MathUtils.lerp(-1.05, -0.18, swingCurve);
      targetRWristX = THREE.MathUtils.lerp(-0.2, 0.45, swingCurve);
      targetSlashOpacity = Math.sin(p * Math.PI) * 0.72;
      slashArcMesh.rotation.z = THREE.MathUtils.lerp(0.65, -0.55, swingCurve);
      swordEdgeMat.emissiveIntensity = 0.95;
    } else if (fighter.phase === 'RECOVERY') {
      const rec = p;
      targetSpinePitch = THREE.MathUtils.lerp(0.24, 0.08, rec);
      targetSpineYaw = THREE.MathUtils.lerp(0.6, -0.25, rec);
      targetRShoulderX = THREE.MathUtils.lerp(0.55, -0.45, rec);
      targetRElbowX = THREE.MathUtils.lerp(-0.2, -0.95, rec);
      targetSlashOpacity = (1 - rec) * 0.22;
      swordEdgeMat.emissiveIntensity = 0.2;
    } else if (fighter.phase === 'STUNNED') {
      const recoil = Math.sin(p * Math.PI);
      targetHipsY = 0.94;
      targetSpinePitch = -0.35 * recoil - 0.1;
      targetSpineYaw = -0.4;
      targetRShoulderX = 0.25;
      targetRShoulderZ = -0.75;
      targetRElbowX = -0.35;
      swordEdgeMat.emissiveIntensity = 0.05;
    } else if (fighter.phase === 'KO') {
      targetHipsY = 0.45;
      targetSpinePitch = -1.1;
      targetRShoulderX = 0.5;
      targetRShoulderZ = -0.9;
      swordEdgeMat.emissiveIntensity = 0;
    } else if (fighter.isGuarding) {
      // Raised Roman Scutum shield wall guard
      targetHipsY = 0.92;
      targetSpinePitch = 0.12;
      targetSpineYaw = 0.42;
      targetLShoulderX = -1.1;
      targetLElbowX = -0.58;
      targetRShoulderX = -0.78;
      targetRElbowX = -1.25;
      targetShieldScale = 1.05;
      shieldMesh.rotation.x = THREE.MathUtils.damp(shieldMesh.rotation.x, 1.48, 18, dt);
      shieldMesh.rotation.y = THREE.MathUtils.damp(shieldMesh.rotation.y, 0.05, 18, dt);
      swordEdgeMat.emissiveIntensity = 0.2;
    } else {
      shieldMesh.rotation.x = THREE.MathUtils.damp(shieldMesh.rotation.x, 0.78, 16, dt);
      shieldMesh.rotation.y = THREE.MathUtils.damp(shieldMesh.rotation.y, -0.22, 16, dt);
      swordEdgeMat.emissiveIntensity = 0.14;
    }

    const poseLambda = fighter.phase === 'ACTIVE' ? 42 : fighter.phase === 'WINDUP' ? 28 : 16;

    hips.position.y = THREE.MathUtils.damp(hips.position.y, targetHipsY, poseLambda, dt);
    spine.rotation.x = THREE.MathUtils.damp(spine.rotation.x, targetSpinePitch, poseLambda, dt);
    spine.rotation.y = THREE.MathUtils.damp(spine.rotation.y, targetSpineYaw, poseLambda, dt);

    rShoulder.rotation.x = THREE.MathUtils.damp(rShoulder.rotation.x, targetRShoulderX, poseLambda, dt);
    rShoulder.rotation.z = THREE.MathUtils.damp(rShoulder.rotation.z, targetRShoulderZ, poseLambda, dt);
    rElbow.rotation.x = THREE.MathUtils.damp(rElbow.rotation.x, targetRElbowX, poseLambda, dt);
    rWrist.rotation.x = THREE.MathUtils.damp(rWrist.rotation.x, targetRWristX, poseLambda, dt);
    rWrist.rotation.z = THREE.MathUtils.damp(rWrist.rotation.z, targetRWristZ, poseLambda, dt);

    lShoulder.rotation.x = THREE.MathUtils.damp(lShoulder.rotation.x, targetLShoulderX, 18, dt);
    lElbow.rotation.x = THREE.MathUtils.damp(lElbow.rotation.x, targetLElbowX, 18, dt);

    const baseStanceAngle = fighter.phase === 'ACTIVE' ? 0.38 : 0.14;
    leftLeg.thigh.rotation.x = THREE.MathUtils.damp(leftLeg.thigh.rotation.x, -baseStanceAngle + stride, 16, dt);
    rightLeg.thigh.rotation.x = THREE.MathUtils.damp(rightLeg.thigh.rotation.x, baseStanceAngle - stride, 16, dt);
    leftLeg.knee.rotation.x = THREE.MathUtils.damp(leftLeg.knee.rotation.x, 0.28 + Math.max(0, -stride) * 0.6, 16, dt);
    rightLeg.knee.rotation.x = THREE.MathUtils.damp(rightLeg.knee.rotation.x, 0.24 + Math.max(0, stride) * 0.6, 16, dt);

    const sScale = THREE.MathUtils.damp(shieldMesh.scale.x, targetShieldScale, 20, dt);
    shieldMesh.scale.set(sScale, sScale, sScale);
    slashArcMat.opacity = targetSlashOpacity;

    if (fighter.hitFlashTimer > 0) {
      armorMat.emissive.setHex(0xffe0a0);
      armorMat.emissiveIntensity = 1.4;
      skinMat.emissive.setHex(0xffffff);
      skinMat.emissiveIntensity = 0.85;
    } else {
      armorMat.emissive.setHex(0x000000);
      armorMat.emissiveIntensity = 0;
      skinMat.emissive.setHex(0x000000);
      skinMat.emissiveIntensity = 0;
    }

    root.position.x = fighter.x;
    root.rotation.y = facingSign > 0 ? Math.PI / 2 : -Math.PI / 2;
  };

  return {
    root,
    hips,
    spine,
    neck,
    rShoulder,
    rElbow,
    rWrist,
    lShoulder,
    lElbow,
    lThigh: leftLeg.thigh,
    lKnee: leftLeg.knee,
    rThigh: rightLeg.thigh,
    rKnee: rightLeg.knee,
    shieldMesh,
    shieldMat,
    swordEdgeMat,
    slashArcMesh,
    slashArcMat,
    armorMat,
    coreMat,
    updatePose,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
