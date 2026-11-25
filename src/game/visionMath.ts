export interface Landmark2D {
  x: number;
  y: number;
  visibility?: number;
}

export interface ArmTrackingTarget {
  hasArm: boolean;
  shoulderPitch: number; // radians for rShoulder.rotation.x
  shoulderRoll: number;  // radians for rShoulder.rotation.z
  elbowBend: number;     // radians for rElbow.rotation.x
  wristTwist: number;    // radians for rWrist.rotation.z
  armSpeed: number;      // normalized speed for swing detection
}

export interface ArmGestureInput {
  swordShoulder?: Landmark2D;
  swordWrist?: Landmark2D;
  offShoulder?: Landmark2D;
  offWrist?: Landmark2D;
  handWrist?: Landmark2D;
  armSpeed: number;
  isOpenPalm: boolean;
  isFist: boolean;
  justClosedFist: boolean;
}

export interface ArmGestureResult {
  isShieldRaised: boolean;
  shouldSwing: boolean;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes lateral movement direction from raw (unmirrored) Pose shoulder center X.
 * In mirrored self-view (mirroredX = 1 - rawX):
 * - Body leans/moves LEFT  (mirroredX < 0.5, rawX > 0.5) => negative (-1, Mundur)
 * - Body leans/moves RIGHT (mirroredX > 0.5, rawX < 0.5) => positive (+1, Maju)
 */
export function computeBodyMoveDir(rawShoulderCenterX: number, deadzone = 0.05): number {
  const mirroredX = 1 - rawShoulderCenterX;
  const offset = mirroredX - 0.5;
  if (Math.abs(offset) <= deadzone) return 0;
  const active = offset - Math.sign(offset) * deadzone;
  return clamp(active * 6.5, -1, 1);
}

/**
 * Computes articulated sword-arm joint targets from MediaPipe Pose + Hand landmarks.
 * Supports mirrored webcam coordinates so raising/extending/tilting your real arm & fist
 * maps intuitively to the 3D Gladiator's sword arm.
 */
export function computeArmTrackingAngles(
  shoulder: Landmark2D | undefined,
  elbow: Landmark2D | undefined,
  wrist: Landmark2D | undefined,
  handWrist?: Landmark2D,
  handIndexMcp?: Landmark2D,
  prevWrist?: Landmark2D | null,
  dt = 0.033
): ArmTrackingTarget {
  if (!shoulder || !elbow || !wrist) {
    return {
      hasArm: false,
      shoulderPitch: -0.45,
      shoulderRoll: -0.22,
      elbowBend: -0.95,
      wristTwist: 0,
      armSpeed: 0,
    };
  }

  // Convert to mirrored self-view coordinates where +X is right (toward opponent) and +Y is down
  const sx = 1 - shoulder.x;
  const sy = shoulder.y;
  const ex = 1 - elbow.x;
  const ey = elbow.y;
  const wx = 1 - wrist.x;
  const wy = wrist.y;

  // Upper arm vector (shoulder -> elbow)
  const ux = ex - sx;
  const uy = ey - sy;
  const upperLen = Math.max(0.02, Math.hypot(ux, uy));

  // Forearm vector (elbow -> wrist)
  const fx = wx - ex;
  const fy = wy - ey;
  const foreLen = Math.max(0.02, Math.hypot(fx, fy));

  // Elevation of wrist relative to shoulder (-1 = high overhead, +1 = low hip)
  const relWristY = clamp((wy - sy) / (upperLen + foreLen), -1, 1);
  // Forward extension of wrist relative to shoulder
  const relWristX = clamp((wx - sx) / (upperLen + foreLen), -0.8, 1);

  // Map elevation & reach to gladiator shoulder pitch (negative X rotates arm forward/up)
  const shoulderPitch = clamp(-0.95 + relWristY * 1.15 - relWristX * 0.45, -2.2, 0.55);

  // Lateral abduction (shoulder roll)
  const shoulderRoll = clamp(-0.22 - relWristX * 0.35, -0.85, 0.35);

  // Elbow bend angle between upper arm and forearm using dot product
  const dot = clamp((ux * fx + uy * fy) / (upperLen * foreLen), -1, 1);
  const angleBetween = Math.acos(dot); // 0 = straight, PI = folded
  const elbowBend = clamp(-0.25 - angleBetween * 0.72, -1.65, -0.15);

  // Wrist roll / sword tilt from hand orientation if available
  let wristTwist = 0;
  if (handWrist && handIndexMcp) {
    const hdx = (1 - handIndexMcp.x) - (1 - handWrist.x);
    const hdy = handIndexMcp.y - handWrist.y;
    const tilt = Math.atan2(hdx, -hdy);
    wristTwist = clamp(tilt * 0.65, -0.85, 0.85);
  }

  // Wrist velocity in mirrored screen units per second
  let armSpeed = 0;
  if (prevWrist && dt > 0) {
    const pwx = 1 - prevWrist.x;
    const pwy = prevWrist.y;
    armSpeed = Math.hypot(wx - pwx, wy - pwy) / Math.max(0.01, dt);
  }

  return {
    hasArm: true,
    shoulderPitch,
    shoulderRoll,
    elbowBend,
    wristTwist,
    armSpeed,
  };
}

/**
 * Classifies raised-hand shield guard vs arm-swing sword strike:
 * - Raising either hand/arm up (near or above shoulder height) while held steady raises the shield!
 * - Swinging the arm briskly triggers a sword strike (and releases single-arm guard).
 */
export function evaluateArmGestures(input: ArmGestureInput): ArmGestureResult {
  const SWING_SPEED_THRESHOLD = 1.6;
  const STEADY_GUARD_MAX_SPEED = 1.45;

  const isSwingingArm = input.armSpeed >= SWING_SPEED_THRESHOLD;

  const swordHandY = input.swordWrist?.y ?? input.handWrist?.y;
  const swordArmRaised =
    input.swordShoulder !== undefined &&
    swordHandY !== undefined &&
    swordHandY <= input.swordShoulder.y + 0.04;

  const offArmVisible =
    input.offShoulder !== undefined &&
    input.offWrist !== undefined &&
    (input.offWrist.visibility ?? 1) > 0.35;
  const offArmRaised =
    offArmVisible && input.offWrist!.y <= input.offShoulder!.y + 0.06;

  // Fallback when Pose isn't detecting shoulders yet: raising hand high in top half of frame
  const handHighWithoutPose =
    input.swordShoulder === undefined &&
    input.handWrist !== undefined &&
    input.handWrist.y < 0.42;

  const isShieldRaised =
    offArmRaised ||
    ((swordArmRaised || handHighWithoutPose || input.isOpenPalm) &&
      input.armSpeed < STEADY_GUARD_MAX_SPEED);

  const shouldSwing =
    isSwingingArm || (input.justClosedFist && !swordArmRaised && !offArmRaised);

  return {
    isShieldRaised,
    shouldSwing,
  };
}
