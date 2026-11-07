import React from 'react';
import { CheckCircle2, AlertTriangle, AlertOctagon, Zap, RefreshCw, Clock, HardDrive } from 'lucide-react';

export default function PreCheckAlert({ validation }) {
  if (!validation) return null;

  const isReady = validation.badge === 'ready';
  const isWarning = validation.badge === 'warning';
  const isError = validation.badge === 'error';

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isReady
          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
          : isWarning
          ? 'bg-amber-950/25 border-amber-500/40 text-amber-200'
          : 'bg-rose-950/25 border-rose-500/40 text-rose-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {isReady && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400" />}
          {isError && <AlertOctagon className="w-5 h-5 text-rose-400" />}
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm tracking-wide flex items-center gap-2">
              {validation.badge_label}
              {isReady && (
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-extrabold bg-emerald-500/20 text-emerald-300 tracking-wider">
                  ⚡ 10–30s
                </span>
              )}
              {isWarning && (
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-extrabold bg-amber-500/20 text-amber-300 tracking-wider">
                  Re-encode Mode
                </span>
              )}
            </span>

            {/* Total Duration and Combined Size */}
            {validation.total_duration_formatted && (
              <div className="flex items-center gap-3 text-xs text-slate-300 font-mono">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {validation.total_duration_formatted}
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                  {validation.total_size_formatted}
                </span>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {validation.message}
          </p>

          {validation.issues && validation.issues.length > 0 && (
            <div className="mt-2 pt-2 border-t border-amber-500/20 space-y-1">
              <span className="text-[11px] font-semibold text-amber-300 block">Detail Ketidaksesuaian:</span>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/90 font-mono">
                {validation.issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
