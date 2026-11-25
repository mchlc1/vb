/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AuditModal } from './components/AuditModal';
import { CombatHud, type CalloutItem, type HudSnapshot } from './components/CombatHud';
import { GameModal } from './components/GameModal';
import { TitleOverlay } from './components/TitleOverlay';
import { mountArenaScene, type ArenaSceneHandle } from './game/arenaScene';
import {
  createInitialDuelState,
  stepDuelSimulation,
  type DuelState,
  type GameScreenState,
  type MatchStats,
} from './game/combatEngine';
import { SoundFX } from './game/soundFx';
import { VisionController, type VisionStateSnapshot } from './game/visionInput';

function getInitialScreen(): GameScreenState {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') return 'playing';
  }
  return 'title';
}

function buildHudSnapshot(state: DuelState): HudSnapshot {
  return {
    playerHp: state.player.hp,
    playerGhostHp: state.player.ghostHp,
    playerStamina: state.player.stamina,
    playerPhase: state.player.phase,
    playerGuarding: state.player.isGuarding,
    botHp: state.bot.hp,
    botGhostHp: state.bot.ghostHp,
    botStamina: state.bot.stamina,
    botPhase: state.bot.phase,
    botGuarding: state.bot.isGuarding,
    combo: state.stats.currentCombo,
    elapsedTime: state.stats.elapsedTime,
  };
}

export default function App() {
  const initialScreen = getInitialScreen();
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const duelRef = useRef<DuelState>(createInitialDuelState(initialScreen));
  const arenaRef = useRef<ArenaSceneHandle | null>(null);
  const sfxRef = useRef<SoundFX>(new SoundFX());
  const visionRef = useRef<VisionController>(new VisionController());

  const keysHeldRef = useRef<Set<string>>(new Set());
  const rightMouseHeldRef = useRef(false);
  const attackEdgeRef = useRef(false);
  const dashEdgeRef = useRef(false);
  const calloutIdRef = useRef(1);
  const lastHudSyncRef = useRef(0);

  const [screen, setScreen] = useState<GameScreenState>(initialScreen);
  const [showAudit, setShowAudit] = useState(false);
  const [visionEnabled, setVisionEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(() => buildHudSnapshot(duelRef.current));
  const [endStats, setEndStats] = useState<{
    winner: 'player' | 'bot' | null;
    botHpRemaining: number;
    stats: MatchStats;
  }>({
    winner: null,
    botHpRemaining: 100,
    stats: { ...duelRef.current.stats },
  });
  const [callouts, setCallouts] = useState<CalloutItem[]>([]);
  const [visionStatus, setVisionStatus] = useState<VisionStateSnapshot>({
    active: false,
    statusText: 'Camera standby',
    moveLabel: 'Diam',
    statusTone: 'neutral',
    tiltMoveDir: 0,
    isFist: false,
    isOpenPalm: false,
    isShieldRaised: false,
    armTarget: {
      hasArm: false,
      shoulderPitch: -0.45,
      shoulderRoll: -0.22,
      elbowBend: -0.95,
      wristTwist: 0,
      armSpeed: 0,
    },
  });

  const visionEnabledRef = useRef(visionEnabled);
  visionEnabledRef.current = visionEnabled;

  const pushCallout = useCallback((text: string, tone: CalloutItem['tone']) => {
    const id = calloutIdRef.current++;
    setCallouts((prev) => [...prev.slice(-2), { id, text, tone }]);
    window.setTimeout(() => {
      setCallouts((prev) => prev.filter((item) => item.id !== id));
    }, 740);
  }, []);

  const clearInputs = useCallback(() => {
    keysHeldRef.current.clear();
    rightMouseHeldRef.current = false;
    attackEdgeRef.current = false;
    dashEdgeRef.current = false;
  }, []);

  const syncBodyState = useCallback((nextScreen: GameScreenState) => {
    document.body.dataset.state = nextScreen;
  }, []);

  useEffect(() => {
    syncBodyState(screen);
  }, [screen, syncBodyState]);

  const startNewDuel = useCallback(() => {
    sfxRef.current.unlock();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    clearInputs();
    const fresh = createInitialDuelState('playing');
    duelRef.current = fresh;
    setHud(buildHudSnapshot(fresh));
    setCallouts([]);
    setShowAudit(false);
    setScreen('playing');
    syncBodyState('playing');
  }, [clearInputs, syncBodyState]);

  const returnToTitle = useCallback(() => {
    clearInputs();
    const fresh = createInitialDuelState('title');
    duelRef.current = fresh;
    setHud(buildHudSnapshot(fresh));
    setCallouts([]);
    setScreen('title');
    syncBodyState('title');
  }, [clearInputs, syncBodyState]);

  const togglePause = useCallback(() => {
    const cur = duelRef.current.screen;
    if (cur === 'playing') {
      clearInputs();
      duelRef.current.screen = 'paused';
      setEndStats({
        winner: duelRef.current.winner,
        botHpRemaining: duelRef.current.bot.hp,
        stats: { ...duelRef.current.stats },
      });
      setScreen('paused');
      syncBodyState('paused');
    } else if (cur === 'paused') {
      clearInputs();
      duelRef.current.screen = 'playing';
      setScreen('playing');
      syncBodyState('playing');
    }
  }, [clearInputs, syncBodyState]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      sfxRef.current.muted = next;
      return next;
    });
  }, []);

  // Manage optional Webcam Computer Vision lifecycle
  useEffect(() => {
    const controller = visionRef.current;
    if (visionEnabled && screen === 'playing' && videoRef.current && pipCanvasRef.current) {
      void controller.start(videoRef.current, pipCanvasRef.current, setVisionStatus);
    } else {
      controller.stop();
    }
    return () => {
      controller.stop();
    };
  }, [visionEnabled, screen]);

  // Mount Three.js Arena ONCE in isolated container
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const handle = mountArenaScene(
      container,
      () => duelRef.current,
      (dt) => {
        const state = duelRef.current;
        if (state.screen !== 'playing') return;

        // Read continuous held keys + CV tilt
        const keys = keysHeldRef.current;
        let moveDir = 0;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) moveDir -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) moveDir += 1;

        const cvSnap = visionEnabledRef.current ? visionRef.current.getSnapshot() : null;
        if (moveDir === 0 && cvSnap && cvSnap.active) {
          moveDir = cvSnap.tiltMoveDir;
        }

        const attackJustPressed =
          attackEdgeRef.current ||
          (visionEnabledRef.current && visionRef.current.consumeAttackEdge());
        attackEdgeRef.current = false;

        const dashJustPressed = dashEdgeRef.current;
        dashEdgeRef.current = false;

        const guardHeld =
          keys.has('KeyE') ||
          rightMouseHeldRef.current ||
          Boolean(cvSnap && cvSnap.active && (cvSnap.isShieldRaised || cvSnap.isOpenPalm));

        const prevPlayerHp = state.player.hp;
        const prevBotHp = state.bot.hp;
        const prevScreen = state.screen;

        stepDuelSimulation(state, dt, {
          moveDir,
          attackJustPressed,
          guardHeld,
          dashJustPressed,
        });

        // Process synchronized combat audio, particles, and callouts
        for (const ev of state.events) {
          switch (ev.type) {
            case 'PLAYER_SWING':
              sfxRef.current.swing(false);
              break;
            case 'BOT_SWING':
              sfxRef.current.swing(true);
              break;
            case 'BOT_TELEGRAPH':
              sfxRef.current.telegraph();
              break;
            case 'HIT_BOT':
              sfxRef.current.hit(Boolean(ev.heavy));
              handle.spawnSparkBurst(ev.x, ev.y, 0xfbbf24, ev.heavy ? 22 : 14, 8.5);
              if (ev.heavy) handle.spawnShockwave(ev.x, ev.y, 0xf59e0b);
              if (ev.label) pushCallout(ev.label, ev.heavy ? 'amber' : 'cyan');
              break;
            case 'HIT_PLAYER':
              sfxRef.current.hit(true);
              handle.spawnSparkBurst(ev.x, ev.y, 0xdc2626, 20, 8.0);
              handle.spawnShockwave(ev.x, ev.y, 0xef4444);
              if (ev.label) pushCallout(ev.label, 'rose');
              break;
            case 'CLASH_BLOCK':
              sfxRef.current.clash(false);
              handle.spawnSparkBurst(ev.x, ev.y, 0xfde68a, 18, 7.8);
              if (ev.label) pushCallout(ev.label, 'amber');
              break;
            case 'PERFECT_PARRY':
              sfxRef.current.clash(true);
              handle.spawnSparkBurst(ev.x, ev.y, 0xfef08a, 28, 10.5);
              handle.spawnShockwave(ev.x, ev.y, 0xfbbf24);
              if (ev.label) pushCallout(ev.label, 'cyan');
              break;
            case 'DASH':
              sfxRef.current.dash();
              handle.spawnSparkBurst(ev.x, 0.25, 0xd6b47e, 10, 4.2);
              break;
            case 'VICTORY':
              sfxRef.current.finish(true);
              break;
            case 'DEFEAT':
              sfxRef.current.finish(false);
              break;
            default:
              break;
          }
        }

        // Handle transition to gameover
        if (state.screen !== prevScreen && state.screen === 'gameover') {
          setEndStats({
            winner: state.winner,
            botHpRemaining: state.bot.hp,
            stats: { ...state.stats },
          });
          setScreen('gameover');
          syncBodyState('gameover');
        }

        // Throttle React HUD updates (~15Hz) or flush immediately on HP changes
        const now = performance.now();
        const hpChanged = state.player.hp !== prevPlayerHp || state.bot.hp !== prevBotHp;
        if (hpChanged || now - lastHudSyncRef.current >= 66) {
          lastHudSyncRef.current = now;
          setHud(buildHudSnapshot(state));
        }
      },
      () =>
        visionEnabledRef.current
          ? visionRef.current.getSnapshot().armTarget
          : undefined
    );

    arenaRef.current = handle;
    return () => {
      handle.dispose();
      arenaRef.current = null;
    };
  }, [pushCallout, syncBodyState]);

  // Global Keyboard & Focus-Loss Hygiene
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const cur = duelRef.current.screen;

      if (cur === 'title' && !showAudit) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startNewDuel();
        }
        return;
      }

      if (showAudit && e.code === 'Escape') {
        e.preventDefault();
        setShowAudit(false);
        return;
      }

      if (e.code === 'KeyM') {
        toggleMute();
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (cur === 'playing' || cur === 'paused') {
          e.preventDefault();
          togglePause();
        }
        return;
      }

      if (e.code === 'KeyR' && cur === 'playing') {
        e.preventDefault();
        startNewDuel();
        return;
      }

      if (cur !== 'playing') return;

      if (e.code === 'Space' || e.code === 'KeyJ') {
        e.preventDefault();
        if (!e.repeat) {
          sfxRef.current.unlock();
          attackEdgeRef.current = true;
        }
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') {
        e.preventDefault();
        if (!e.repeat) {
          sfxRef.current.unlock();
          dashEdgeRef.current = true;
        }
      }

      keysHeldRef.current.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.code);
    };

    const onVisibilityOrBlur = () => {
      clearInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onVisibilityOrBlur);
    document.addEventListener('visibilitychange', onVisibilityOrBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onVisibilityOrBlur);
      document.removeEventListener('visibilitychange', onVisibilityOrBlur);
    };
  }, [clearInputs, showAudit, startNewDuel, toggleMute, togglePause]);

  // Direct Canvas Pointer Combat Controls (Left Click = Strike, Right Click = Guard/Parry)
  const handleArenaPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duelRef.current.screen !== 'playing') return;
    sfxRef.current.unlock();
    if (e.button === 0) {
      attackEdgeRef.current = true;
    } else if (e.button === 2) {
      rightMouseHeldRef.current = true;
    }
  };

  const handleArenaPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) {
      rightMouseHeldRef.current = false;
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#060913]">
      {/* Isolated WebGL Mount Container */}
      <div
        ref={canvasMountRef}
        onPointerDown={handleArenaPointerDown}
        onPointerUp={handleArenaPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        className="fixed inset-0 w-full h-full"
      />

      {screen === 'title' && (
        <TitleOverlay
          visionEnabled={visionEnabled}
          onToggleVision={() => setVisionEnabled((v) => !v)}
          onStart={startNewDuel}
          onOpenAudit={() => setShowAudit(true)}
        />
      )}

      {screen === 'playing' && (
        <CombatHud
          hud={hud}
          callouts={callouts}
          muted={muted}
          visionEnabled={visionEnabled}
          visionStatus={visionStatus}
          videoRef={videoRef}
          pipCanvasRef={pipCanvasRef}
          onToggleMute={toggleMute}
          onPause={togglePause}
          onRestart={startNewDuel}
        />
      )}

      {(screen === 'paused' || screen === 'gameover') && (
        <GameModal
          screen={screen}
          winner={endStats.winner}
          botHpRemaining={endStats.botHpRemaining}
          stats={endStats.stats}
          onResume={togglePause}
          onRestart={startNewDuel}
          onReturnTitle={returnToTitle}
        />
      )}

      {showAudit && <AuditModal onClose={() => setShowAudit(false)} />}
    </main>
  );
}
