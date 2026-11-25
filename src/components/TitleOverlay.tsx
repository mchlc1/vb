import React from 'react';

interface TitleOverlayProps {
  visionEnabled: boolean;
  onToggleVision: () => void;
  onStart: () => void;
  onOpenAudit: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  visionEnabled,
  onToggleVision,
  onStart,
  onOpenAudit,
}) => {
  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 md:p-12 bg-gradient-to-r from-[#060913]/92 via-[#060913]/45 to-transparent">
      {/* Asymmetric Left-Third Composition over Orbital 3D Arena */}
      <div className="my-auto max-w-md pointer-events-auto">
        <div className="mb-5 flex items-center gap-3">
          {/* Custom Inline SVG Crest Emblem */}
          <svg
            viewBox="0 0 48 48"
            className="w-11 h-11 shrink-0"
            aria-hidden="true"
          >
            <polygon
              points="24,2 44,14 44,34 24,46 4,34 4,14"
              fill="#0b1324"
              stroke="#06b6d4"
              strokeWidth="2.2"
            />
            <path
              d="M24 9 L28 28 L24 37 L20 28 Z"
              fill="#06b6d4"
            />
            <path
              d="M15 27 L33 27"
              stroke="#f59e0b"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-slate-50 leading-none">
              AETHER BLADE
            </h1>
            <p className="text-xs font-mono-num tracking-widest text-cyan-400 mt-1.5">
              3D PVP SWORD COMBAT
            </p>
          </div>
        </div>

        <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-7 max-w-sm">
          Phase-synchronized 3D sword dueling with zero-delay blade contact,
          timed energy parries, and articulated cyber-knight kinematics.
        </p>

        {/* <= 3 Menu Actions Total */}
        <div className="flex flex-col gap-3 max-w-xs">
          <button
            type="button"
            data-start="true"
            onClick={onStart}
            className="w-full py-3.5 px-6 rounded-md bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 font-display font-bold text-base tracking-wide transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 whitespace-nowrap"
          >
            Start Duel
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onToggleVision}
              aria-pressed={visionEnabled}
              className={`py-2.5 px-3 rounded-md border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap truncate focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                visionEnabled
                  ? 'bg-cyan-950/90 border-cyan-400 text-cyan-200'
                  : 'bg-[#0b1221]/90 border-slate-700 text-slate-200 hover:border-slate-500'
              }`}
            >
              {visionEnabled ? 'Input: Webcam CV' : 'Input: Keys & Mouse'}
            </button>

            <button
              type="button"
              onClick={onOpenAudit}
              className="py-2.5 px-3 rounded-md border border-slate-700 bg-[#0b1221]/90 hover:border-amber-400/70 text-slate-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap truncate focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              Delay & 3D Audit
            </button>
          </div>
        </div>
      </div>

      {/* Flat Borderless Control Hint in Bottom Safe Margin */}
      <div className="text-xs text-slate-400 tracking-wide">
        <span>A / D Move</span>
        <span className="mx-2 text-slate-600">·</span>
        <span>Shift Dash</span>
        <span className="mx-2 text-slate-600">·</span>
        <span>Space / Click Strike</span>
        <span className="mx-2 text-slate-600">·</span>
        <span>E / Right-Click Parry</span>
        <span className="mx-2 text-slate-600">·</span>
        <span>Enter / Space to Start</span>
      </div>
    </div>
  );
};
