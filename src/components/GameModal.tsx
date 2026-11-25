import React from 'react';
import { type GameScreenState, type MatchStats } from '../game/combatEngine';

interface GameModalProps {
  screen: Exclude<GameScreenState, 'title' | 'playing'>;
  winner: 'player' | 'bot' | null;
  botHpRemaining: number;
  stats: MatchStats;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const GameModal: React.FC<GameModalProps> = ({
  screen,
  winner,
  botHpRemaining,
  stats,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  const isPause = screen === 'paused';
  const isVictory = screen === 'gameover' && winner === 'player';

  const heading = isPause ? 'Duel Paused' : isVictory ? 'Victory' : 'Defeat';
  const accentClass = isPause
    ? 'text-cyan-300'
    : isVictory
    ? 'text-cyan-300'
    : 'text-rose-400';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-modal-heading"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-md bg-[#0b1221] border border-slate-700 rounded-lg p-6 md:p-7 text-center">
        <h2
          id="game-modal-heading"
          className={`font-display text-3xl font-bold tracking-wide ${accentClass}`}
        >
          {heading}
        </h2>
        <p className="text-xs text-slate-400 mt-1 mb-5">
          {isPause
            ? 'Simulation suspended'
            : isVictory
            ? 'Shadow Ronin neutralized in the arena'
            : 'Your cyber-knight fell in combat'}
        </p>

        {/* 3 Tabular Stat Tiles */}
        <div className="grid grid-cols-3 gap-2.5 mb-6 text-left">
          <div className="bg-[#060a14] border border-slate-800 rounded-md p-3">
            <div className="text-[11px] text-slate-400">
              {isVictory || isPause ? 'Damage Dealt' : 'Bot HP Left'}
            </div>
            <div className="font-mono-num text-xl font-bold text-slate-50 mt-0.5">
              {isVictory || isPause ? Math.round(stats.damageDealt) : Math.round(botHpRemaining)}
            </div>
          </div>

          <div className="bg-[#060a14] border border-slate-800 rounded-md p-3">
            <div className="text-[11px] text-slate-400">Parries</div>
            <div className="font-mono-num text-xl font-bold text-cyan-300 mt-0.5">
              {stats.perfectParries}
            </div>
          </div>

          <div className="bg-[#060a14] border border-slate-800 rounded-md p-3">
            <div className="text-[11px] text-slate-400">Max Combo</div>
            <div className="font-mono-num text-xl font-bold text-amber-300 mt-0.5">
              {stats.maxCombo}x
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {isPause ? (
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 px-5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-sm tracking-wide cursor-pointer"
            >
              Resume Duel
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onRestart}
              className="w-full py-3 px-5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-sm tracking-wide cursor-pointer"
            >
              Play Again
            </button>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            {isPause && (
              <button
                type="button"
                onClick={onRestart}
                className="py-2.5 px-4 rounded-md border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Restart
              </button>
            )}
            <button
              type="button"
              onClick={onReturnTitle}
              className={`py-2.5 px-4 rounded-md border border-slate-700 hover:border-slate-500 text-slate-300 text-xs font-semibold cursor-pointer ${
                isPause ? '' : 'col-span-2'
              }`}
            >
              Back to Title
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
