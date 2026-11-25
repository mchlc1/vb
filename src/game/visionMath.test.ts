import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeArmTrackingAngles,
  computeBodyMoveDir,
  evaluateArmGestures,
} from './visionMath';

test('computeBodyMoveDir moves backward (left/-1) when body leans left and forward (right/+1) when body leans right', () => {
  // Centered within deadzone -> 0
  assert.equal(computeBodyMoveDir(0.5), 0);
  assert.equal(computeBodyMoveDir(0.53), 0);

  // Mirrored webcam: leaning LEFT in self-view means rawX > 0.5 -> negative (MUNDUR)
  const leftDir = computeBodyMoveDir(0.72);
  assert.ok(leftDir < 0, `Expected negative moveDir when body leans left, got ${leftDir}`);

  // Mirrored webcam: leaning RIGHT in self-view means rawX < 0.5 -> positive (MAJU)
  const rightDir = computeBodyMoveDir(0.28);
  assert.ok(rightDir > 0, `Expected positive moveDir when body leans right, got ${rightDir}`);
});

test('computeArmTrackingAngles raises sword arm when wrist is high and lowers when wrist is low', () => {
  const shoulder = { x: 0.6, y: 0.45 };
  const elbow = { x: 0.5, y: 0.42 };

  // High raised wrist (y = 0.20)
  const raised = computeArmTrackingAngles(shoulder, elbow, { x: 0.42, y: 0.2 });
  // Lowered wrist (y = 0.72)
  const lowered = computeArmTrackingAngles(shoulder, elbow, { x: 0.42, y: 0.72 });

  assert.equal(raised.hasArm, true);
  assert.ok(
    raised.shoulderPitch < lowered.shoulderPitch,
    `Raised arm (${raised.shoulderPitch}) should pitch higher (more negative) than lowered arm (${lowered.shoulderPitch})`
  );
});

test('computeArmTrackingAngles measures wrist velocity for swing detection', () => {
  const shoulder = { x: 0.6, y: 0.45 };
  const elbow = { x: 0.5, y: 0.45 };
  const res = computeArmTrackingAngles(
    shoulder,
    elbow,
    { x: 0.35, y: 0.55 },
    undefined,
    undefined,
    { x: 0.55, y: 0.35 },
    0.033
  );
  assert.ok(res.armSpeed > 5, `Expected brisk armSpeed > 5, got ${res.armSpeed}`);
});

test('evaluateArmGestures raises shield when hand/arm is raised steady and swings sword on brisk arm swing', () => {
  // 1. Hand raised steady above shoulder -> shield raised, no sword swing
  const raisedShield = evaluateArmGestures({
    swordShoulder: { x: 0.6, y: 0.5 },
    swordWrist: { x: 0.55, y: 0.3 },
    armSpeed: 0.2,
    isOpenPalm: false,
    isFist: false,
    justClosedFist: false,
  });
  assert.equal(raisedShield.isShieldRaised, true);
  assert.equal(raisedShield.shouldSwing, false);

  // 2. Brisk arm swing (even without closed fist!) -> sword swings, single-arm shield drops
  const swingingArm = evaluateArmGestures({
    swordShoulder: { x: 0.6, y: 0.5 },
    swordWrist: { x: 0.38, y: 0.48 },
    armSpeed: 2.3,
    isOpenPalm: false,
    isFist: false,
    justClosedFist: false,
  });
  assert.equal(swingingArm.shouldSwing, true);
  assert.equal(swingingArm.isShieldRaised, false);

  // 3. Off-arm raised while sword arm rests low -> shield raised
  const offArmGuard = evaluateArmGestures({
    swordShoulder: { x: 0.6, y: 0.5 },
    swordWrist: { x: 0.5, y: 0.72 },
    offShoulder: { x: 0.4, y: 0.5 },
    offWrist: { x: 0.35, y: 0.28, visibility: 0.9 },
    armSpeed: 0.3,
    isOpenPalm: false,
    isFist: false,
    justClosedFist: false,
  });
  assert.equal(offArmGuard.isShieldRaised, true);
  assert.equal(offArmGuard.shouldSwing, false);
});
