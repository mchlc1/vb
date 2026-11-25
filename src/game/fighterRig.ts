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

export function createCyberKnightRig(
  primaryColor: number,
  energyColor: number,
  armorBump: THREE.Texture,
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

  // PBR Materials with clear roughness contrast (>= 0.25 delta between matte chassis & polished armor)
  const chassisMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161b26,
      roughness: 0.72,
      metalness: 0.35,
      bumpMap: armorBump,
      bumpScale: 0.015,
    })
  );

  const armorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: primaryColor,
      roughness: 0.24,
      metalness: 0.88,
      bumpMap: armorBump,
      bumpScale: 0.01,
    })
  );

  const trimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.18,
      metalness: 0.95,
    })
  );

  const coreMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: energyColor,
      emissive: energyColor,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      metalness: 0.1,
    })
  );

  const swordEdgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: energyColor,
      emissive: energyColor,
      emissiveIntensity: 2.0,
      roughness: 0.15,
      metalness: 0.2,
    })
  );

  // Ground contact shadow disc (bottom-center pivot y = 0)
  const shadowGeo = trackGeo(new THREE.CircleGeometry(0.92, 24));
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowMap,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.015;
  root.add(contactShadow);

  // 1. Hips & Pelvis (Pivot y = 0.98m)
  const hips = new THREE.Group();
  hips.position.y = 0.98;
  root.add(hips);

  const pelvisMesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.2, 0.22, 8)), chassisMat);
  hips.add(pelvisMesh);

  const beltPlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.1, 0.3)), armorMat);
  beltPlate.position.y = 0.04;
  hips.add(beltPlate);

  // 2. Articulated Legs (Thigh -> Knee -> Shin -> Boot)
  const buildLeg = (sideX: number) => {
    const thigh = new THREE.Group();
    thigh.position.set(sideX, -0.06, 0);
    hips.add(thigh);

    const thighMesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.115, 0.095, 0.44, 10)), armorMat);
    thighMesh.position.y = -0.22;
    thigh.add(thighMesh);

    const knee = new THREE.Group();
    knee.position.y = -0.45;
    thigh.add(knee);

    const kneeCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.15, 0.14, 0.18)), trimMat);
    kneeCap.position.z = 0.03;
    knee.add(kneeCap);

    const shinMesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.095, 0.075, 0.42, 10)), chassisMat);
    shinMesh.position.y = -0.21;
    knee.add(shinMesh);

    const greavePlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.13, 0.34, 0.1)), armorMat);
    greavePlate.position.set(0, -0.2, 0.055);
    knee.add(greavePlate);

    const bootMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.15, 0.11, 0.28)), trimMat);
    bootMesh.position.set(0, -0.44, 0.05);
    knee.add(bootMesh);

    return { thigh, knee };
  };

  const leftLeg = buildLeg(-0.17);
  const rightLeg = buildLeg(0.17);

  // 3. Spine & Beveled Chest Armor (ExtrudeGeometry)
  const spine = new THREE.Group();
  spine.position.y = 0.14;
  hips.add(spine);

  const abdomen = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.2, 0.18, 0.28, 8)), chassisMat);
  abdomen.position.y = 0.14;
  spine.add(abdomen);

  const chestShape = new THREE.Shape();
  chestShape.moveTo(-0.34, 0);
  chestShape.lineTo(0.34, 0);
  chestShape.lineTo(0.4, 0.36);
  chestShape.lineTo(0.22, 0.5);
  chestShape.lineTo(-0.22, 0.5);
  chestShape.lineTo(-0.4, 0.36);
  chestShape.closePath();

  const chestGeo = trackGeo(
    new THREE.ExtrudeGeometry(chestShape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.035,
      bevelSegments: 2,
    })
  );
  chestGeo.center();
  const chestPlate = new THREE.Mesh(chestGeo, armorMat);
  chestPlate.position.y = 0.48;
  spine.add(chestPlate);

  // Reactor Core
  const reactorRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.11, 0.024, 10, 20)), trimMat);
  reactorRing.position.set(0, 0.52, 0.21);
  spine.add(reactorRing);

  const reactorCore = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 16)), coreMat);
  reactorCore.rotation.x = Math.PI / 2;
  reactorCore.position.set(0, 0.52, 0.21);
  spine.add(reactorCore);

  // 4. Neck & Faceted Knight Helmet with Visor
  const neck = new THREE.Group();
  neck.position.y = 0.78;
  spine.add(neck);

  const neckCol = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 10)), chassisMat);
  neckCol.position.y = 0.04;
  neck.add(neckCol);

  const helmetBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.34, 0.36)), armorMat);
  helmetBase.position.y = 0.24;
  neck.add(helmetBase);

  const helmetCrest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.12, 0.42)), trimMat);
  helmetCrest.position.set(0, 0.42, -0.02);
  neck.add(helmetCrest);

  const visorSlit = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.065, 0.05)), coreMat);
  visorSlit.position.set(0, 0.25, 0.175);
  neck.add(visorSlit);

  // 5. Right Sword Arm Hierarchy (Pauldron -> Upper Arm -> Elbow -> Forearm -> Wrist -> Plasma Katana)
  const rShoulder = new THREE.Group();
  rShoulder.position.set(0.46, 0.66, 0);
  spine.add(rShoulder);

  const rPauldron = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.22, 0.32)), armorMat);
  rPauldron.rotation.z = -0.25;
  rShoulder.add(rPauldron);

  const rUpperArm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.085, 0.075, 0.34, 10)), chassisMat);
  rUpperArm.position.y = -0.18;
  rShoulder.add(rUpperArm);

  const rElbow = new THREE.Group();
  rElbow.position.y = -0.36;
  rShoulder.add(rElbow);

  const rElbowJoint = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.085, 10, 10)), trimMat);
  rElbow.add(rElbowJoint);

  const rForearm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.075, 0.065, 0.32, 10)), armorMat);
  rForearm.position.y = -0.16;
  rElbow.add(rForearm);

  const rWrist = new THREE.Group();
  rWrist.position.y = -0.34;
  rElbow.add(rWrist);

  // Multi-part Energy Katana (Pommel + Hilt + Crossguard + Metallic Spine + Glowing Energy Blade)
  const swordGroup = new THREE.Group();
  swordGroup.rotation.x = Math.PI / 2.2;
  rWrist.add(swordGroup);

  const hilt = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.32, 10)), chassisMat);
  hilt.position.y = 0.02;
  swordGroup.add(hilt);

  const pommel = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.048, 10, 10)), trimMat);
  pommel.position.y = -0.15;
  swordGroup.add(pommel);

  const crossguard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.045, 0.09)), trimMat);
  crossguard.position.y = 0.19;
  swordGroup.add(crossguard);

  const bladeSpine = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.03, 1.25, 0.055)), trimMat);
  bladeSpine.position.set(0, 0.82, -0.015);
  swordGroup.add(bladeSpine);

  const bladeEdge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.022, 1.32, 0.045)), swordEdgeMat);
  bladeEdge.position.set(0, 0.85, 0.022);
  swordGroup.add(bladeEdge);

  // Dynamic 3D Slash Arc Crescent aligned in the vertical swing plane (YZ in local spine space)
  const slashGeo = trackGeo(new THREE.RingGeometry(1.08, 1.38, 28, 1, -Math.PI * 0.36, Math.PI * 0.72));
  const slashArcMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: energyColor,
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

  // 6. Left Shield Arm + Hexagonal Energy Buckler
  const lShoulder = new THREE.Group();
  lShoulder.position.set(-0.46, 0.66, 0);
  spine.add(lShoulder);

  const lPauldron = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.22, 0.32)), armorMat);
  lPauldron.rotation.z = 0.25;
  lShoulder.add(lPauldron);

  const lUpperArm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.085, 0.075, 0.34, 10)), chassisMat);
  lUpperArm.position.y = -0.18;
  lShoulder.add(lUpperArm);

  const lElbow = new THREE.Group();
  lElbow.position.y = -0.36;
  lShoulder.add(lElbow);

  const lForearm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.075, 0.065, 0.32, 10)), armorMat);
  lForearm.position.y = -0.16;
  lElbow.add(lForearm);

  const shieldMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: energyColor,
      emissive: energyColor,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.32,
      roughness: 0.15,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  const shieldMesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 6)), shieldMat);
  shieldMesh.rotation.x = Math.PI / 2;
  shieldMesh.position.set(-0.08, -0.26, 0.18);
  lElbow.add(shieldMesh);

  // Enable shadow casting across knight body meshes (except translucent effects & contact disc)
  if (enableShadows) {
    root.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj !== contactShadow &&
        obj !== slashArcMesh &&
        obj !== shieldMesh
      ) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }

  // Smooth pose target variables
  const updatePose = (
    fighter: FighterState,
    dt: number,
    elapsed: number,
    facingSign: number,
    armOverride?: ArmTrackingTarget
  ) => {
    const p = getPhaseProgress(fighter);
    const speedNorm = Math.min(1, Math.abs(fighter.vx) / 5.5);

    // Distance-synced walk gait (no skating!)
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
    let targetLShoulderX = -0.55;
    let targetLElbowX = -0.9;
    let targetShieldScale = 0.45;
    let targetShieldOpacity = 0.2;
    let targetSlashOpacity = 0;

    if (fighter.phase === 'IDLE' && !fighter.isGuarding && armOverride?.hasArm) {
      // Sword arm & fist follow the player's tracked arm and hand tilt in real time!
      targetRShoulderX = armOverride.shoulderPitch;
      targetRShoulderZ = armOverride.shoulderRoll;
      targetRElbowX = armOverride.elbowBend;
      targetRWristZ = armOverride.wristTwist;
      targetSpinePitch = 0.08 + Math.max(0, -armOverride.shoulderPitch - 0.5) * 0.08;
    }

    if (fighter.phase === 'WINDUP') {
      // Chamber blade backward cleanly before strike
      const w = Math.sin(p * Math.PI * 0.5);
      targetHipsY = 0.93;
      targetSpinePitch = -0.08 * w;
      targetSpineYaw = -0.65 * w;
      targetRShoulderX = -2.25 * w - 0.3;
      targetRShoulderZ = -0.55 * w;
      targetRElbowX = -1.1;
      targetRWristX = -0.25;
      // Telegraph blade glow intensifies on bot windup
      swordEdgeMat.emissiveIntensity = 2.0 + w * 2.8;
    } else if (fighter.phase === 'ACTIVE') {
      // Fast snap across the exact strike arc so blade meets enemy chest at p >= 0.25
      const swingCurve = 1 - Math.pow(1 - p, 3);
      targetHipsY = 0.91;
      targetSpinePitch = 0.28;
      targetSpineYaw = THREE.MathUtils.lerp(-0.65, 0.72, swingCurve);
      targetRShoulderX = THREE.MathUtils.lerp(-2.4, 0.68, swingCurve);
      targetRShoulderZ = THREE.MathUtils.lerp(-0.55, 0.28, swingCurve);
      targetRElbowX = THREE.MathUtils.lerp(-1.05, -0.18, swingCurve);
      targetRWristX = THREE.MathUtils.lerp(-0.2, 0.45, swingCurve);
      targetSlashOpacity = Math.sin(p * Math.PI) * 0.85;
      slashArcMesh.rotation.z = THREE.MathUtils.lerp(0.65, -0.55, swingCurve);
      swordEdgeMat.emissiveIntensity = 4.6;
    } else if (fighter.phase === 'RECOVERY') {
      const rec = p;
      targetSpinePitch = THREE.MathUtils.lerp(0.24, 0.08, rec);
      targetSpineYaw = THREE.MathUtils.lerp(0.6, -0.25, rec);
      targetRShoulderX = THREE.MathUtils.lerp(0.55, -0.45, rec);
      targetRElbowX = THREE.MathUtils.lerp(-0.2, -0.95, rec);
      targetSlashOpacity = (1 - rec) * 0.25;
      swordEdgeMat.emissiveIntensity = 2.2;
    } else if (fighter.phase === 'STUNNED') {
      const recoil = Math.sin(p * Math.PI);
      targetHipsY = 0.94;
      targetSpinePitch = -0.35 * recoil - 0.1;
      targetSpineYaw = -0.4;
      targetRShoulderX = 0.25;
      targetRShoulderZ = -0.75;
      targetRElbowX = -0.35;
      swordEdgeMat.emissiveIntensity = 1.0;
    } else if (fighter.phase === 'KO') {
      targetHipsY = 0.45;
      targetSpinePitch = -1.1;
      targetRShoulderX = 0.5;
      targetRShoulderZ = -0.9;
      swordEdgeMat.emissiveIntensity = 0.4;
    } else if (fighter.isGuarding) {
      // Raised hexagonal energy shield parry guard
      targetHipsY = 0.93;
      targetSpinePitch = 0.14;
      targetSpineYaw = 0.35;
      targetLShoulderX = -1.18;
      targetLElbowX = -0.65;
      targetRShoulderX = -0.75;
      targetRElbowX = -1.25;
      targetShieldScale = 1.15;
      targetShieldOpacity = fighter.guardTimer <= 0.26 ? 0.78 : 0.48;
      shieldMat.emissiveIntensity = fighter.guardTimer <= 0.26 ? 2.4 : 1.1;
      swordEdgeMat.emissiveIntensity = 2.0;
    } else {
      swordEdgeMat.emissiveIntensity = 1.8 + Math.sin(elapsed * 4) * 0.2;
    }

    // Crisp exponential damping (much faster during ACTIVE so animation never lags hitbox!)
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

    // Legs stride & knee bend
    const baseStanceAngle = fighter.phase === 'ACTIVE' ? 0.38 : 0.14;
    leftLeg.thigh.rotation.x = THREE.MathUtils.damp(leftLeg.thigh.rotation.x, -baseStanceAngle + stride, 16, dt);
    rightLeg.thigh.rotation.x = THREE.MathUtils.damp(rightLeg.thigh.rotation.x, baseStanceAngle - stride, 16, dt);
    leftLeg.knee.rotation.x = THREE.MathUtils.damp(leftLeg.knee.rotation.x, 0.28 + Math.max(0, -stride) * 0.6, 16, dt);
    rightLeg.knee.rotation.x = THREE.MathUtils.damp(rightLeg.knee.rotation.x, 0.24 + Math.max(0, stride) * 0.6, 16, dt);

    // Shield & slash arc opacity/scale
    const sScale = THREE.MathUtils.damp(shieldMesh.scale.x, targetShieldScale, 20, dt);
    shieldMesh.scale.set(sScale, 1, sScale);
    shieldMat.opacity = THREE.MathUtils.damp(shieldMat.opacity, targetShieldOpacity, 20, dt);
    slashArcMat.opacity = targetSlashOpacity;

    // White emissive hit flash (40-90ms)
    if (fighter.hitFlashTimer > 0) {
      armorMat.emissive.setHex(0xffffff);
      armorMat.emissiveIntensity = 1.6;
    } else {
      armorMat.emissive.setHex(0x000000);
      armorMat.emissiveIntensity = 0;
    }

    // Position & facing
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
