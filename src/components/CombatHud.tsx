import React from 'react';
import { type CombatPhase } from '../game/combatEngine';
import { type VisionStateSnapshot } from '../game/visionInput';

export interface HudSnapshot {
  playerHp: number;
  playerGhostHp: number;
  playerStamina: number;
  playerPhase: CombatPhase;
  playerGuarding: boolean;
  botHp: number;
  botGhostHp: number;
  botStamina: number;
  botPhase: CombatPhase;
  botGuarding: boolean;
  combo: number;
  elapsedTime: number;
}

export interface CalloutItem {
  id: number;
  text: string;
  tone: 'cyan' | 'amber' | 'rose';
}

interface CombatHudProps {
  hud: HudSnapshot;
  callouts: CalloutItem[];
  muted: boolean;
  visionEnabled: boolean;
  visionStatus: VisionStateSnapshot;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  pipCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
}

function getStanceLabel(phase: CombatPhase, guarding: boolean): string {
  if (phase === 'WINDUP') return 'WINDUP';
  if (phase === 'ACTIVE') return 'STRIKE';
  if (phase === 'RECOVERY') return 'RECOVER';
  if (phase === 'STUNNED') return 'STUNNED';
  if (phase === 'KO') return 'KO';
  return guarding ? 'GUARD' : 'READY';
}

export const CombatHud: React.FC<CombatHudProps> = ({
  hud,
  callouts,
  muted,
  visionEnabled,
  visionStatus,
  videoRef,
  pipCanvasRef,
  onToggleMute,
  onPause,
  onRestart,
}) => {
  const playerStance = getStanceLabel(hud.playerPhase, hud.playerGuarding);
  const botStance = getStanceLabel(hud.botPhase, hud.botGuarding);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-6">
      {/* Top Perimeter Duel Bars + Utility Buttons */}
      <div className="flex items-start justify-between gap-4 w-full">
        {/* Player Plate (Top-Left) */}
        <div className="w-64 sm:w-80 bg-[#0a101f]/90 border border-cyan-500/35 rounded-md p-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
                <path d="M12 2L20 7V15L12 22L4 15V7L12 2Z" fill="#083344" stroke="#06b6d4" strokeWidth="2" />
                <path d="M12 6V17" stroke="#67e8f9" strokeWidth="2" />
              </svg>
              <span className="font-display text-xs font-bold tracking-wider text-cyan-300">
                CYBER KNIGHT
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-mono-num text-slate-400">{playerStance}</span>
              <span
                data-testid="player-hp-value"
                className="font-mono-num text-lg font-bold text-slate-50 leading-none"
              >
                {Math.round(hud.playerHp)}
              </span>
            </div>
          </div>

          {/* HP Bar with delayed trailing ghost damage fill */}
          <div className="relative h-3 w-full bg-slate-950 border border-slate-800 rounded-xs overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-amber-400/70 transition-none"
              style={{ width: `${Math.max(0, Math.min(100, hud.playerGhostHp))}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-cyan-400"
              style={{ width: `${Math.max(0, Math.min(100, hud.playerHp))}%` }}
            />
          </div>

          {/* Stamina Bar */}
          <div className="mt-1.5 h-1.5 w-full bg-slate-950 rounded-xs overflow-hidden">
            <div
              className="h-full bg-amber-400"
              style={{ width: `${Math.max(0, Math.min(100, hud.playerStamina))}%` }}
            />
          </div>
        </div>

        {/* Center Match Clock & Combo Counter */}
        <div className="hidden sm:flex flex-col items-center pt-1">
          <span className="font-mono-num text-xs text-slate-400 tracking-wider">
            {Math.floor(hud.elapsedTime)}s
          </span>
          {hud.combo > 1 && (
            <span className="font-display text-lg font-bold text-amber-400 tracking-wide mt-0.5">
              {hud.combo}x COMBO
            </span>
          )}
        </div>

        {/* Bot Plate + Square Utility Controls (Top-Right) */}
        <div className="flex items-start gap-2.5">
          <div className="w-64 sm:w-80 bg-[#0a101f]/90 border border-rose-500/35 rounded-md p-3">
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="flex items-baseline gap-2">
                <span
                  data-testid="bot-hp-value"
                  className="font-mono-num text-lg font-bold text-slate-50 leading-none"
                >
                  {Math.round(hud.botHp)}
                </span>
                <span className="text-[11px] font-mono-num text-slate-400">{botStance}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xs font-bold tracking-wider text-rose-300">
                  SHADOW RONIN
                </span>
                <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
                  <path d="M12 2L20 7V15L12 22L4 15V7L12 2Z" fill="#4c0519" stroke="#f43f5e" strokeWidth="2" />
                  <path d="M8 9L16 15M16 9L8 15" stroke="#fda4af" strokeWidth="2" />
                </svg>
              </div>
            </div>

            <div className="relative h-3 w-full bg-slate-950 border border-slate-800 rounded-xs overflow-hidden">
              <div
                className="absolute inset-y-0 right-0 bg-amber-400/70 transition-none"
                style={{ width: `${Math.max(0, Math.min(100, hud.botGhostHp))}%` }}
              />
              <div
                className="absolute inset-y-0 right-0 bg-rose-500"
                style={{ width: `${Math.max(0, Math.min(100, hud.botHp))}%` }}
              />
            </div>

            <div className="mt-1.5 h-1.5 w-full bg-slate-950 rounded-xs overflow-hidden">
              <div
                className="h-full bg-rose-400/80 ml-auto"
                style={{ width: `${Math.max(0, Math.min(100, hud.botStamina))}%` }}
              />
            </div>
          </div>

          {/* Utility Icon Buttons */}
          <div className="flex flex-col sm:flex-row gap-1.5 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
              title={muted ? 'Unmute [M]' : 'Mute [M]'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-9 h-9 rounded-md bg-[#0a101f]/90 border border-slate-700 hover:border-cyan-400 flex items-center justify-center text-slate-200 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                {muted ? (
                  <path d="M23 9l-6 6M17 9l6 6" />
                ) : (
                  <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
                )}
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause duel (P)"
              title="Pause [P]"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="w-9 h-9 rounded-md bg-[#0a101f]/90 border border-slate-700 hover:border-cyan-400 flex items-center justify-center text-slate-200 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Restart duel (R)"
              title="Restart [R]"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="w-9 h-9 rounded-md bg-[#0a101f]/90 border border-slate-700 hover:border-cyan-400 flex items-center justify-center text-slate-200 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Transient Combat Callouts (Non-blocking, Upper-Center) */}
      <div className="fixed top-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
        {callouts.map((c) => (
          <div
            key={c.id}
            className={`animate-callout font-display text-2xl md:text-3xl font-bold italic tracking-wider drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${
              c.tone === 'cyan'
                ? 'text-cyan-300'
                : c.tone === 'amber'
                ? 'text-amber-300'
                : 'text-rose-400'
            }`}
          >
            {c.text}
          </div>
        ))}
      </div>

      {/* Bottom Row: Optional Compact CV PiP Monitor + Flat Control Reference */}
      <div className="flex items-end justify-between w-full">
        {visionEnabled ? (
          <div className="relative w-44 h-32 rounded-md overflow-hidden border border-cyan-500/50 bg-[#0a101f]/95 pointer-events-auto">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100 opacity-50"
            />
            <canvas
              ref={pipCanvasRef}
              width={176}
              height={128}
              className="absolute inset-0 w-full h-full -scale-x-100"
            />
            <div className="absolute bottom-1.5 left-1.5 right-1.5 bg-slate-950/90 px-2 py-1 rounded-xs text-[11px] font-mono-num text-center text-cyan-300 truncate">
              {visionStatus.statusText} · {visionStatus.moveLabel}
            </div>
          </div>
        ) : (
          <div />
        )}

        <div className="text-[11px] text-slate-400 tracking-wide">
          A / D Move · Shift Dash · Space / Click Strike · E / Right-Click Parry · P Pause
        </div>
      </div>
    </div>
  );
};
