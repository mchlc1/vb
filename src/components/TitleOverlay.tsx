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
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 md:p-12 bg-gradient-to-r from-[#140d07]/90 via-[#140d07]/48 to-transparent">
      {/* Asymmetric Left-Third Composition over Wide-Angle 80 AD Colosseum */}
      <div className="my-auto max-w-md pointer-events-auto">
        <div className="mb-5 flex items-center gap-3">
          {/* Custom Inline SVG Roman Aquila Crest Emblem */}
          <svg
            viewBox="0 0 48 48"
            className="w-11 h-11 shrink-0"
            aria-hidden="true"
          >
            <polygon
              points="24,2 44,14 44,34 24,46 4,34 4,14"
              fill="#24160b"
              stroke="#f59e0b"
              strokeWidth="2.2"
            />
            <path
              d="M24 9 L28 28 L24 37 L20 28 Z"
              fill="#fbbf24"
            />
            <path
              d="M15 27 L33 27"
              stroke="#e11d48"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-amber-50 leading-none">
              AETHER BLADE
            </h1>
            <p className="text-xs font-mono-num tracking-widest text-amber-400 mt-1.5">
              ROME 80 AD · COLOSSEUM ARENA
            </p>
          </div>
        </div>

        <p className="text-sm md:text-base text-amber-100/90 leading-relaxed mb-7 max-w-sm">
          Step onto the sunlit sands of the Flavian Amphitheatre with zero-delay
          gladius strikes, scutum shield parries, and live arm tracking.
        </p>

        {/* <= 3 Menu Actions Total */}
        <div className="flex flex-col gap-3 max-w-xs">
          <button
            type="button"
            data-start="true"
            onClick={onStart}
            className="w-full py-3.5 px-6 rounded-md bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-stone-950 font-display font-bold text-base tracking-wide transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 whitespace-nowrap"
          >
            Start Duel
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onToggleVision}
              aria-pressed={visionEnabled}
              className={`py-2.5 px-3 rounded-md border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap truncate focus-visible:outline-2 focus-visible:outline-amber-400 ${
                visionEnabled
                  ? 'bg-amber-950/90 border-amber-400 text-amber-200'
                  : 'bg-[#1a1109]/92 border-amber-900/70 text-amber-100 hover:border-amber-500/70'
              }`}
            >
              {visionEnabled ? 'Input: Webcam CV' : 'Input: Keys & Mouse'}
            </button>

            <button
              type="button"
              onClick={onOpenAudit}
              className="py-2.5 px-3 rounded-md border border-amber-900/70 bg-[#1a1109]/92 hover:border-amber-400/70 text-amber-100 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap truncate focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              Delay & 3D Audit
            </button>
          </div>
        </div>
      </div>

      {/* High-Contrast Control Hint over Sunlit Arena Sand */}
      <div className="self-start text-xs text-amber-100 bg-[#140d07]/80 px-3 py-1.5 rounded-md tracking-wide">
        <span>A / D Move</span>
        <span className="mx-2 text-amber-500/70">·</span>
        <span>Shift Dash</span>
        <span className="mx-2 text-amber-500/70">·</span>
        <span>Space / Click Strike</span>
        <span className="mx-2 text-amber-500/70">·</span>
        <span>E / Right-Click Parry</span>
        <span className="mx-2 text-amber-500/70">·</span>
        <span>Enter / Space to Start</span>
      </div>
    </div>
  );
};
