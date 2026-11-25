import test from 'node:test';
import assert from 'node:assert/strict';
import { computeArmTrackingAngles, computeBodyMoveDir } from './visionMath';

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
