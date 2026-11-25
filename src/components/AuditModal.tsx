import React from 'react';

interface AuditModalProps {
  onClose: () => void;
}

export const AuditModal: React.FC<AuditModalProps> = ({ onClose }) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-[#0b1221] border border-slate-700 rounded-lg p-6 md:p-8 text-slate-200">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 id="audit-modal-title" className="font-display text-2xl font-bold text-slate-50">
              Root-Cause Audit: Delay & 3D Upgrades
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Technical diagnosis of the original HTML prototype vs. the upgraded 3D engine
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close audit modal"
            className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-cyan-400 text-xs font-semibold text-slate-200 cursor-pointer"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 text-sm leading-relaxed">
          <section className="border-b border-slate-800 pb-4">
            <h3 className="font-display text-base font-bold text-amber-400 mb-2">
              1. Why Movement & Hits Felt Delayed / Desynchronized
            </h3>
            <ul className="space-y-2 text-slate-300 list-disc pl-5">
              <li>
                <strong>Premature Hit at t = 0ms vs. Lagging Arm Lerp:</strong> The original{' '}
                <code className="text-cyan-300">triggerPlayerAttack()</code> subtracted HP and played{' '}
                <code className="text-cyan-300">sfx.hit()</code> immediately on frame 0, while the sword arm used a
                frame-rate-dependent <code className="text-cyan-300">* 0.15</code> lerp that took ~250ms to swing down,
                paired with a raw <code className="text-cyan-300">setTimeout(380)</code>.
              </li>
              <li>
                <strong>Sequential MediaPipe Blocking:</strong> Running{' '}
                <code className="text-cyan-300">await hands.send()</code> followed sequentially by{' '}
                <code className="text-cyan-300">await pose.send()</code> at complexity 1 added 100–180ms of vision lag per frame.
              </li>
              <li>
                <strong>OS Key-Repeat Delay on Movement:</strong> Reading <code className="text-cyan-300">keydown</code> events
                directly caused a ~400ms stutter before continuous stepping began.
              </li>
            </ul>
          </section>

          <section className="border-b border-slate-800 pb-4">
            <h3 className="font-display text-base font-bold text-cyan-400 mb-2">
              2. How This Build Fixes Hit Synchronization
            </h3>
            <ul className="space-y-2 text-slate-300 list-disc pl-5">
              <li>
                <strong>Phase-Locked Hitboxes:</strong> Every strike runs through deterministic{' '}
                <code className="text-cyan-300">WINDUP (85ms) → ACTIVE (100ms) → RECOVERY (175ms)</code> phases. Damage,
                sparks, and audio fire at the exact frame the blade crosses the opponent&apos;s chest.
              </li>
              <li>
                <strong>Continuous Held-Input Polling & Input Buffering:</strong> Smooth velocity integration with
                exponential damping, 130ms attack buffering, and a 260ms timed parry window.
              </li>
              <li>
                <strong>Parallel Lite Vision Pipeline:</strong> Uses <code className="text-cyan-300">modelComplexity: 0</code>,
                parallel <code className="text-cyan-300">Promise.all</code> inference, and edge-triggered fist closure.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-display text-base font-bold text-emerald-400 mb-2">
              3. 3D Visual & Kinematic Upgrades
            </h3>
            <ul className="space-y-2 text-slate-300 list-disc pl-5">
              <li>
                <strong>14-Part Articulated Cyber-Knights:</strong> Grounded bottom-center legs, knee bends synced to
                stride distance, beveled extruded chest armor, helmet visors, multi-part energy katanas, and hexagonal parry shields.
              </li>
              <li>
                <strong>Combat VFX & Studio PBR:</strong> Dynamic 3D slash arc ribbons, pooled 64-particle spark ring buffer,
                hitstop freeze frames, trauma-squared camera shake, and PMREM studio lighting over an octagonal arena.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};
