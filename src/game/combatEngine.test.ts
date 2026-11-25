import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_WINDUP_DURATION,
  PLAYER_ACTIVE_DURATION,
  PLAYER_WINDUP_DURATION,
  clampDeltaTime,
  createInitialDuelState,
  stepDuelSimulation,
  type StepInputs,
} from './combatEngine';

const idleInputs: StepInputs = {
  moveDir: 0,
  attackJustPressed: false,
  guardHeld: false,
  dashJustPressed: false,
};

test('clampDeltaTime caps large frame spikes to 0.05s', () => {
  assert.equal(clampDeltaTime(0.25), 0.05);
  assert.equal(clampDeltaTime(0.016), 0.016);
  assert.equal(clampDeltaTime(-1), 0);
});

test('attack does NOT deal premature damage during WINDUP (fixes t=0ms desync)', () => {
  const state = createInitialDuelState('playing');
  state.player.x = 0;
  state.bot.x = 1.8; // inside STRIKE_RANGE (2.48)

  // Frame 1: press attack -> enters WINDUP, zero damage dealt!
  stepDuelSimulation(state, 0.016, { ...idleInputs, attackJustPressed: true });
  assert.equal(state.player.phase, 'WINDUP');
  assert.equal(state.bot.hp, 100);

  // Advance just before windup ends
  stepDuelSimulation(state, PLAYER_WINDUP_DURATION - 0.025, idleInputs);
  assert.equal(state.player.phase, 'WINDUP');
  assert.equal(state.bot.hp, 100);
});

test('hit registers exactly once when blade crosses peak ACTIVE frame within range', () => {
  const state = createInitialDuelState('playing');
  state.player.x = 0;
  state.bot.x = 1.8;

  stepDuelSimulation(state, 0.016, { ...idleInputs, attackJustPressed: true });
  // Step past windup (0.085s) in clamped increments into ACTIVE
  stepDuelSimulation(state, 0.045, idleInputs);
  stepDuelSimulation(state, 0.045, idleInputs);
  assert.equal(state.player.phase, 'ACTIVE');

  // Step past 25% of ACTIVE duration to blade contact frame
  stepDuelSimulation(state, PLAYER_ACTIVE_DURATION * 0.35, idleInputs);
  const hpAfterContact = state.bot.hp;
  assert.ok(hpAfterContact < 100, 'Bot HP should drop at blade contact frame');

  // Clear hitstop and advance remaining ACTIVE frames: should NOT double-hit
  state.hitstopTimer = 0;
  stepDuelSimulation(state, PLAYER_ACTIVE_DURATION * 0.5, idleInputs);
  assert.equal(state.bot.hp, hpAfterContact);
});

test('moving out of range during windup causes a clean WHIFF with 0 damage', () => {
  const state = createInitialDuelState('playing');
  state.player.x = -2.5;
  state.bot.x = 2.5; // 5.0m apart > STRIKE_RANGE

  stepDuelSimulation(state, 0.016, { ...idleInputs, attackJustPressed: true });
  stepDuelSimulation(state, 0.045, idleInputs);
  stepDuelSimulation(state, 0.045, idleInputs);
  stepDuelSimulation(state, PLAYER_ACTIVE_DURATION * 0.4, idleInputs);

  assert.equal(state.bot.hp, 100);
  assert.ok(state.events.some((e) => e.type === 'WHIFF'));
});

test('timed guard within parry window triggers PERFECT PARRY, stuns bot, and takes 0 damage', () => {
  const state = createInitialDuelState('playing');
  state.player.x = 0;
  state.bot.x = 1.8;

  // Force bot into active attack about to hit
  state.bot.phase = 'WINDUP';
  state.bot.phaseTimer = BOT_WINDUP_DURATION - 0.01;
  state.bot.phaseDuration = BOT_WINDUP_DURATION;
  state.bot.hasRegisteredHit = false;

  // Player raises guard right before contact
  stepDuelSimulation(state, 0.016, { ...idleInputs, guardHeld: true });
  stepDuelSimulation(state, 0.035, { ...idleInputs, guardHeld: true });

  assert.equal(state.player.hp, 100);
  assert.equal(state.bot.phase, 'STUNNED');
  assert.equal(state.stats.perfectParries, 1);
  assert.ok(state.events.some((e) => e.type === 'PERFECT_PARRY'));
});

test('player reaches 0 HP on lethal hit and transitions cleanly to gameover after KO beat', () => {
  const state = createInitialDuelState('playing');
  state.player.x = 0;
  state.player.hp = 10;
  state.bot.x = 1.7;

  state.bot.phase = 'ACTIVE';
  state.bot.phaseTimer = 0.04;
  state.bot.phaseDuration = 0.11;
  state.bot.hasRegisteredHit = false;

  stepDuelSimulation(state, 0.016, idleInputs);
  assert.equal(state.player.hp, 0);
  assert.equal(state.player.phase, 'KO');
  assert.equal(state.winner, 'bot');

  // Clear hitstop and advance past KO delay
  state.hitstopTimer = 0;
  for (let i = 0; i < 16; i++) {
    stepDuelSimulation(state, 0.05, idleInputs);
  }
  assert.equal(state.screen, 'gameover');
});
