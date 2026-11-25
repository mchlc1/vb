export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type CombatPhase =
  | 'IDLE'
  | 'WINDUP'
  | 'ACTIVE'
  | 'RECOVERY'
  | 'STUNNED'
  | 'KO';

export type BotPolicy = 'RUSHER' | 'COUNTER' | 'FEINT';

export type CombatEventType =
  | 'PLAYER_SWING'
  | 'BOT_SWING'
  | 'BOT_TELEGRAPH'
  | 'HIT_BOT'
  | 'HIT_PLAYER'
  | 'CLASH_BLOCK'
  | 'PERFECT_PARRY'
  | 'WHIFF'
  | 'DASH'
  | 'VICTORY'
  | 'DEFEAT';

export interface CombatEvent {
  type: CombatEventType;
  label?: string;
  damage?: number;
  x: number;
  y: number;
  heavy?: boolean;
}

export interface FighterState {
  id: 'player' | 'bot';
  x: number;
  vx: number;
  hp: number;
  maxHp: number;
  ghostHp: number;
  stamina: number;
  maxStamina: number;
  phase: CombatPhase;
  phaseTimer: number;
  phaseDuration: number;
  hasRegisteredHit: boolean;
  isGuarding: boolean;
  guardTimer: number;
  comboStep: number;
  hitFlashTimer: number;
  invulnTimer: number;
  walkDistance: number;
  attackBufferTimer: number;
  dashCooldown: number;
}

export interface MatchStats {
  elapsedTime: number;
  damageDealt: number;
  damageTaken: number;
  perfectParries: number;
  hitsLanded: number;
  maxCombo: number;
  currentCombo: number;
  comboResetTimer: number;
}

export interface BotAiState {
  policy: BotPolicy;
  decisionTimer: number;
  lungeActive: boolean;
}

export interface DuelState {
  screen: GameScreenState;
  player: FighterState;
  bot: FighterState;
  botAi: BotAiState;
  stats: MatchStats;
  hitstopTimer: number;
  cameraTrauma: number;
  koFinishDelay: number;
  winner: 'player' | 'bot' | null;
  events: CombatEvent[];
}

export interface StepInputs {
  moveDir: number; // -1 (left) .. 0 .. +1 (right)
  attackJustPressed: boolean;
  guardHeld: boolean;
  dashJustPressed: boolean;
}

export const ARENA_HALF_WIDTH = 6.2;
export const MIN_FIGHTER_SEPARATION = 1.32;
export const STRIKE_RANGE = 2.48;

export const PLAYER_WINDUP_DURATION = 0.085;
export const PLAYER_ACTIVE_DURATION = 0.1;
export const PLAYER_RECOVERY_DURATION = 0.175;

export const BOT_WINDUP_DURATION = 0.44;
export const BOT_ACTIVE_DURATION = 0.11;
export const BOT_RECOVERY_DURATION = 0.24;

export const PERFECT_PARRY_WINDOW = 0.26;
export const ATTACK_BUFFER_WINDOW = 0.13;

function createFighter(id: 'player' | 'bot', x: number): FighterState {
  return {
    id,
    x,
    vx: 0,
    hp: 100,
    maxHp: 100,
    ghostHp: 100,
    stamina: 100,
    maxStamina: 100,
    phase: 'IDLE',
    phaseTimer: 0,
    phaseDuration: 0,
    hasRegisteredHit: false,
    isGuarding: false,
    guardTimer: 0,
    comboStep: 0,
    hitFlashTimer: 0,
    invulnTimer: 0,
    walkDistance: 0,
    attackBufferTimer: 0,
    dashCooldown: 0,
  };
}

export function createInitialDuelState(screen: GameScreenState = 'title'): DuelState {
  return {
    screen,
    player: createFighter('player', -2.3),
    bot: createFighter('bot', 2.3),
    botAi: {
      policy: 'RUSHER',
      decisionTimer: 0.45,
      lungeActive: false,
    },
    stats: {
      elapsedTime: 0,
      damageDealt: 0,
      damageTaken: 0,
      perfectParries: 0,
      hitsLanded: 0,
      maxCombo: 0,
      currentCombo: 0,
      comboResetTimer: 0,
    },
    hitstopTimer: 0,
    cameraTrauma: 0,
    koFinishDelay: 0,
    winner: null,
    events: [],
  };
}

export function clampDeltaTime(rawDt: number): number {
  if (!Number.isFinite(rawDt) || rawDt <= 0) return 0;
  return Math.min(rawDt, 0.05);
}

export function getPhaseProgress(fighter: FighterState): number {
  if (fighter.phaseDuration <= 0) return 0;
  return Math.max(0, Math.min(1, fighter.phaseTimer / fighter.phaseDuration));
}

function startAttack(fighter: FighterState, windupDuration: number, isCounterBonus = false): boolean {
  if (fighter.phase !== 'IDLE' && fighter.phase !== 'RECOVERY') return false;
  const staminaCost = 14;
  if (fighter.stamina < staminaCost) return false;

  fighter.stamina = Math.max(0, fighter.stamina - staminaCost);
  fighter.phase = 'WINDUP';
  fighter.phaseTimer = 0;
  fighter.phaseDuration = isCounterBonus ? windupDuration * 0.78 : windupDuration;
  fighter.hasRegisteredHit = false;
  fighter.isGuarding = false;
  fighter.comboStep = (fighter.comboStep + 1) % 3;
  return true;
}

function advanceFighterPhase(
  fighter: FighterState,
  dt: number,
  activeDuration: number,
  recoveryDuration: number,
  onEnterActive?: () => void
) {
  fighter.phaseTimer += dt;
  if (fighter.phaseTimer < fighter.phaseDuration) return;

  if (fighter.phase === 'WINDUP') {
    fighter.phase = 'ACTIVE';
    fighter.phaseTimer = 0;
    fighter.phaseDuration = activeDuration;
    onEnterActive?.();
  } else if (fighter.phase === 'ACTIVE') {
    fighter.phase = 'RECOVERY';
    fighter.phaseTimer = 0;
    fighter.phaseDuration = recoveryDuration;
  } else if (fighter.phase === 'RECOVERY' || fighter.phase === 'STUNNED') {
    fighter.phase = 'IDLE';
    fighter.phaseTimer = 0;
    fighter.phaseDuration = 0;
  }
}

function resolveStrikeImpact(
  state: DuelState,
  attacker: FighterState,
  defender: FighterState,
  baseDamage: number
) {
  if (attacker.hasRegisteredHit) return;
  if (attacker.phase !== 'ACTIVE') return;
  if (getPhaseProgress(attacker) < 0.25) return;

  attacker.hasRegisteredHit = true;

  const dist = Math.abs(attacker.x - defender.x);
  const contactX = (attacker.x + defender.x) * 0.5;

  if (dist > STRIKE_RANGE || defender.invulnTimer > 0) {
    state.events.push({
      type: 'WHIFF',
      x: attacker.x + (attacker.id === 'player' ? 1.1 : -1.1),
      y: 1.45,
    });
    return;
  }

  // Defender is guarding: check Perfect Parry vs Standard Block
  if (defender.isGuarding && defender.phase !== 'STUNNED' && defender.phase !== 'KO') {
    if (defender.guardTimer <= PERFECT_PARRY_WINDOW) {
      // Perfect Parry!
      attacker.phase = 'STUNNED';
      attacker.phaseTimer = 0;
      attacker.phaseDuration = 0.75;
      attacker.vx = attacker.id === 'player' ? -5.5 : 5.5;

      defender.stamina = Math.min(defender.maxStamina, defender.stamina + 28);
      defender.hitFlashTimer = 0.08;
      state.hitstopTimer = 0.068;
      state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.58);

      if (defender.id === 'player') {
        state.stats.perfectParries += 1;
        state.stats.currentCombo += 1;
        state.stats.maxCombo = Math.max(state.stats.maxCombo, state.stats.currentCombo);
        state.stats.comboResetTimer = 3.2;
      }

      state.events.push({
        type: 'PERFECT_PARRY',
        label: 'PERFECT PARRY!',
        x: contactX,
        y: 1.5,
        heavy: true,
      });
      return;
    }

    // Standard Block
    const chipDamage = 3;
    defender.hp = Math.max(0, defender.hp - chipDamage);
    defender.stamina = Math.max(0, defender.stamina - 16);
    defender.hitFlashTimer = 0.04;
    defender.vx = defender.id === 'player' ? -3.0 : 3.0;
    attacker.vx = attacker.id === 'player' ? -1.8 : 1.8;

    state.hitstopTimer = 0.036;
    state.cameraTrauma = Math.min(1, state.cameraTrauma + 0.3);

    if (attacker.id === 'player') {
      state.stats.damageDealt += chipDamage;
    } else {
      state.stats.damageTaken += chipDamage;
    }

    state.events.push({
      type: 'CLASH_BLOCK',
      label: 'BLOCKED',
      damage: chipDamage,
      x: contactX,
      y: 1.45,
      heavy: false,
    });
    return;
  }

  // Clean Hit!
  const stunnedBonus = defender.phase === 'STUNNED' ? 1.5 : 1.0;
  const comboBonus = attacker.comboStep === 2 ? 1.2 : 1.0;
  const finalDamage = Math.round(baseDamage * stunnedBonus * comboBonus);

  defender.hp = Math.max(0, defender.hp - finalDamage);
  defender.hitFlashTimer = 0.09;
  defender.vx = defender.id === 'player' ? -5.8 : 5.8;

  if (defender.phase === 'WINDUP') {
    // Counter-hit interrupts enemy windup
    defender.phase = 'STUNNED';
    defender.phaseTimer = 0;
    defender.phaseDuration = 0.28;
  }

  state.hitstopTimer = stunnedBonus > 1 ? 0.07 : 0.048;
  state.cameraTrauma = Math.min(1, state.cameraTrauma + (stunnedBonus > 1 ? 0.65 : 0.42));

  if (attacker.id === 'player') {
    state.stats.damageDealt += finalDamage;
    state.stats.hitsLanded += 1;
    state.stats.currentCombo += 1;
    state.stats.maxCombo = Math.max(state.stats.maxCombo, state.stats.currentCombo);
    state.stats.comboResetTimer = 3.0;
    state.events.push({
      type: 'HIT_BOT',
      label: stunnedBonus > 1 ? `COUNTER -${finalDamage}` : `-${finalDamage} HP`,
      damage: finalDamage,
      x: contactX,
      y: 1.5,
      heavy: stunnedBonus > 1 || attacker.comboStep === 2,
    });
  } else {
    state.stats.damageTaken += finalDamage;
    state.stats.currentCombo = 0;
    state.events.push({
      type: 'HIT_PLAYER',
      label: `-${finalDamage} HP`,
      damage: finalDamage,
      x: contactX,
      y: 1.5,
      heavy: true,
    });
  }
}

function updateBotAi(state: DuelState, dt: number) {
  const { bot, player, botAi } = state;
  if (bot.phase === 'KO' || bot.phase === 'STUNNED') return;

  const dist = Math.abs(bot.x - player.x);
  botAi.decisionTimer -= dt;

  // Dynamic policy shifts
  if (botAi.decisionTimer <= 0) {
    bot.isGuarding = false;
    botAi.lungeActive = false;

    if (dist > 3.1) {
      botAi.policy = 'RUSHER';
      botAi.decisionTimer = 0.55;
    } else if (
      state.stats.elapsedTime > 1.5 &&
      (player.phase === 'WINDUP' || player.phase === 'ACTIVE') &&
      !bot.isGuarding
    ) {
      // Counter tactician raises shield or steps back (fair probability, not instant auto-parry on frame 1)
      if (bot.stamina >= 20 && Math.random() < 0.35) {
        botAi.policy = 'COUNTER';
        bot.isGuarding = true;
        bot.guardTimer = PERFECT_PARRY_WINDOW + 0.02; // Standard block when reacting late, fair to player
        botAi.decisionTimer = 0.58;
      } else {
        botAi.policy = 'FEINT';
        bot.vx = 4.6; // quick backstep
        botAi.decisionTimer = 0.38;
      }
    } else if (dist <= STRIKE_RANGE - 0.15) {
      const roll = Math.random();
      if (roll < 0.58) {
        botAi.policy = 'RUSHER';
        if (startAttack(bot, BOT_WINDUP_DURATION, false)) {
          state.events.push({
            type: 'BOT_TELEGRAPH',
            x: bot.x,
            y: 1.65,
          });
        }
        botAi.decisionTimer = 0.85;
      } else if (roll < 0.82) {
        botAi.policy = 'COUNTER';
        bot.isGuarding = true;
        bot.guardTimer = 0;
        botAi.decisionTimer = 0.65;
      } else {
        botAi.policy = 'FEINT';
        bot.vx = 4.2;
        botAi.decisionTimer = 0.45;
      }
    } else {
      // Mid-range lunge strike
      botAi.policy = 'FEINT';
      botAi.lungeActive = true;
      if (startAttack(bot, BOT_WINDUP_DURATION * 1.05, false)) {
        bot.vx = -4.6;
        state.events.push({
          type: 'BOT_TELEGRAPH',
          x: bot.x,
          y: 1.65,
        });
      }
      botAi.decisionTimer = 0.9;
    }
  }

  // Policy locomotion when idle
  if (bot.phase === 'IDLE' && !bot.isGuarding) {
    if (botAi.policy === 'RUSHER' && dist > 1.85) {
      bot.vx += (-4.6 - bot.vx) * (1 - Math.exp(-10 * dt));
    } else if (botAi.policy === 'FEINT' && dist < 2.9 && !botAi.lungeActive) {
      bot.vx += (2.4 - bot.vx) * (1 - Math.exp(-8 * dt));
    }
  }
}

export function stepDuelSimulation(
  state: DuelState,
  rawDt: number,
  inputs: StepInputs
): void {
  state.events.length = 0;
  const dt = clampDeltaTime(rawDt);
  if (dt <= 0 || state.screen !== 'playing') return;

  // Decay visual feedback timers even during hitstop
  state.cameraTrauma = Math.max(0, state.cameraTrauma - dt * 1.9);
  state.player.hitFlashTimer = Math.max(0, state.player.hitFlashTimer - dt);
  state.bot.hitFlashTimer = Math.max(0, state.bot.hitFlashTimer - dt);
  state.player.ghostHp += (state.player.hp - state.player.ghostHp) * (1 - Math.exp(-5 * dt));
  state.bot.ghostHp += (state.bot.hp - state.bot.ghostHp) * (1 - Math.exp(-5 * dt));

  if (state.hitstopTimer > 0) {
    state.hitstopTimer = Math.max(0, state.hitstopTimer - dt);
    return;
  }

  // Handle KO beat before transitioning to gameover modal
  if (state.winner !== null) {
    state.koFinishDelay -= dt;
    if (state.koFinishDelay <= 0) {
      state.screen = 'gameover';
      state.events.push({
        type: state.winner === 'player' ? 'VICTORY' : 'DEFEAT',
        x: 0,
        y: 1.5,
      });
    }
    return;
  }

  state.stats.elapsedTime += dt;

  if (state.stats.comboResetTimer > 0) {
    state.stats.comboResetTimer -= dt;
    if (state.stats.comboResetTimer <= 0) {
      state.stats.currentCombo = 0;
    }
  }

  const { player, bot } = state;

  // Cooldowns & Stamina regen
  player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  bot.invulnTimer = Math.max(0, bot.invulnTimer - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.attackBufferTimer = Math.max(0, player.attackBufferTimer - dt);

  if (player.phase === 'IDLE' && !player.isGuarding) {
    player.stamina = Math.min(player.maxStamina, player.stamina + 26 * dt);
  }
  if (bot.phase === 'IDLE' && !bot.isGuarding) {
    bot.stamina = Math.min(bot.maxStamina, bot.stamina + 22 * dt);
  }

  // Input buffering for Player attack
  if (inputs.attackJustPressed) {
    player.attackBufferTimer = ATTACK_BUFFER_WINDOW;
  }

  // Player Guard / Parry state
  if (player.phase === 'IDLE' || player.phase === 'RECOVERY') {
    if (inputs.guardHeld && player.stamina > 6) {
      if (!player.isGuarding) {
        player.isGuarding = true;
        player.guardTimer = 0;
      } else {
        player.guardTimer += dt;
      }
    } else {
      player.isGuarding = false;
      player.guardTimer = 0;
    }
  } else {
    player.isGuarding = false;
  }

  // Player Dash / Lunge
  if (
    inputs.dashJustPressed &&
    player.dashCooldown <= 0 &&
    player.stamina >= 22 &&
    player.phase !== 'STUNNED' &&
    player.phase !== 'KO'
  ) {
    const dashDir = inputs.moveDir !== 0 ? Math.sign(inputs.moveDir) : 1;
    player.stamina -= 22;
    player.dashCooldown = 0.45;
    player.invulnTimer = 0.16;
    player.vx = dashDir * 12.5;
    player.phase = 'IDLE';
    player.phaseTimer = 0;
    player.isGuarding = false;
    state.events.push({
      type: 'DASH',
      x: player.x,
      y: 0.9,
    });
  }

  // Trigger buffered Player Attack
  if (
    player.attackBufferTimer > 0 &&
    (player.phase === 'IDLE' || (player.phase === 'RECOVERY' && getPhaseProgress(player) >= 0.65))
  ) {
    const counterBonus = bot.phase === 'STUNNED';
    if (startAttack(player, PLAYER_WINDUP_DURATION, counterBonus)) {
      player.attackBufferTimer = 0;
      // Forward step momentum on swing
      if (Math.abs(bot.x - player.x) > 1.75) {
        player.vx += 3.2;
      }
    }
  }

  // Player horizontal locomotion
  const maxMoveSpeed = player.isGuarding ? 2.6 : player.phase === 'IDLE' ? 5.6 : 2.1;
  if (Math.abs(inputs.moveDir) > 0.05 && player.phase !== 'STUNNED') {
    const targetVx = inputs.moveDir * maxMoveSpeed;
    player.vx += (targetVx - player.vx) * (1 - Math.exp(-16 * dt));
  } else {
    // Exponential ground friction
    player.vx *= Math.exp(-13 * dt);
  }

  // Bot AI update
  updateBotAi(state, dt);
  if (bot.phase !== 'IDLE' || bot.isGuarding) {
    bot.vx *= Math.exp(-10 * dt);
  }

  // Advance Combat Phases & Fire Swing Audio on ACTIVE entry
  advanceFighterPhase(player, dt, PLAYER_ACTIVE_DURATION, PLAYER_RECOVERY_DURATION, () => {
    state.events.push({ type: 'PLAYER_SWING', x: player.x + 0.8, y: 1.4 });
  });
  advanceFighterPhase(bot, dt, BOT_ACTIVE_DURATION, BOT_RECOVERY_DURATION, () => {
    state.events.push({ type: 'BOT_SWING', x: bot.x - 0.8, y: 1.4 });
  });

  // Resolve Hitboxes strictly inside ACTIVE phase peak!
  resolveStrikeImpact(state, player, bot, 16);
  resolveStrikeImpact(state, bot, player, 14);

  // Integrate Positions & Enforce Arena Bounds + Minimum Duelist Spacing
  const prevPx = player.x;
  const prevBx = bot.x;
  player.x += player.vx * dt;
  bot.x += bot.vx * dt;

  player.x = Math.max(-ARENA_HALF_WIDTH, Math.min(ARENA_HALF_WIDTH, player.x));
  bot.x = Math.max(-ARENA_HALF_WIDTH, Math.min(ARENA_HALF_WIDTH, bot.x));

  const separation = bot.x - player.x;
  if (separation < MIN_FIGHTER_SEPARATION) {
    const overlap = (MIN_FIGHTER_SEPARATION - separation) * 0.5;
    player.x = Math.max(-ARENA_HALF_WIDTH, player.x - overlap);
    bot.x = Math.min(ARENA_HALF_WIDTH, bot.x + overlap);
    if (bot.x - player.x < MIN_FIGHTER_SEPARATION) {
      if (player.x <= -ARENA_HALF_WIDTH) bot.x = player.x + MIN_FIGHTER_SEPARATION;
      else player.x = bot.x - MIN_FIGHTER_SEPARATION;
    }
  }

  // Distance-synced walk accumulation (zero skating)
  player.walkDistance += Math.abs(player.x - prevPx);
  bot.walkDistance += Math.abs(bot.x - prevBx);

  // Check Victory / Defeat
  if (bot.hp <= 0) {
    bot.hp = 0;
    bot.phase = 'KO';
    bot.phaseTimer = 0;
    bot.phaseDuration = 0.6;
    state.winner = 'player';
    state.koFinishDelay = 0.55;
    state.cameraTrauma = 0.85;
  } else if (player.hp <= 0) {
    player.hp = 0;
    player.phase = 'KO';
    player.phaseTimer = 0;
    player.phaseDuration = 0.6;
    state.winner = 'bot';
    state.koFinishDelay = 0.55;
    state.cameraTrauma = 0.85;
  }
}
