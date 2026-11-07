import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, Folder, Clock, Zap, Activity } from 'lucide-react';

// Chime sound generator using Web Audio API
function playCompletionChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.25); // D6

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start(now);
    osc2.start(now + 0.08);
    osc1.stop(now + 0.6);
    osc2.stop(now + 0.6);
  } catch (e) {
    console.error('Audio chime error:', e);
  }
}

// Format elapsed seconds into human readable e.g. '1m 30s' or '45s'
function formatElapsed(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  const totalSec = Math.round(seconds);
  if (totalSec < 60) {
    return `${totalSec}s`;
  }
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) {
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m ${s}s` : `${h}h ${s}s`;
}

export default function ProgressBar({
  progress,
  onCancel,
  onClose,
  title = "Memproses Video..."
}) {
  if (!progress) return null;

  const isCompleted = progress.status === 'completed';
  const isFailed = progress.status === 'failed';
  const isCancelled = progress.status === 'cancelled';
  const isRunning = progress.status === 'running' || progress.status === 'queued';

  // Play audio chime upon completion
  useEffect(() => {
    if (isCompleted) {
      playCompletionChime();
    }
  }, [isCompleted]);

  // Lock background scroll while modal is active to prevent any page shift
  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, []);

  const handleReveal = async () => {
    if (!progress.output_path) return;
    try {
      await fetch('/api/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: progress.output_path })
      });
    } catch (err) {
      console.error('Reveal error:', err);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 w-screen h-screen bg-black/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#111420] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 relative">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {isRunning && (
              <div className="w-3 h-3 rounded-full bg-indigo-500 animate-ping" />
            )}
            {isCompleted && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            {isFailed && <AlertCircle className="w-5 h-5 text-rose-400" />}
            {isCancelled && <AlertCircle className="w-5 h-5 text-amber-400" />}
            <h3 className="font-bold text-sm text-slate-100">
              {isCompleted
                ? 'Proses Selesai!'
                : isFailed
                ? 'Gagal Memproses'
                : isCancelled
                ? 'Proses Dibatalkan'
                : title}
            </h3>
          </div>
          {(isCompleted || isFailed || isCancelled) && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">
              {isRunning
                ? `${progress.current_time_formatted || '00:00'} / ${progress.total_duration_formatted || '00:00'}`
                : isCompleted
                ? '100% Selesai'
                : 'Dihentikan'}
            </span>
            <span className="font-bold text-indigo-400">
              {progress.percentage ? `${progress.percentage.toFixed(1)}%` : isCompleted ? '100%' : '0%'}
            </span>
          </div>

          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                isCompleted
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-lg shadow-emerald-500/20'
                  : isFailed
                  ? 'bg-rose-500'
                  : isCancelled
                  ? 'bg-amber-500'
                  : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 shadow-lg shadow-indigo-500/20'
              }`}
              style={{ width: `${progress.percentage || (isCompleted ? 100 : 0)}%` }}
            />
          </div>
        </div>

        {/* Real-time Metrics */}
        {isRunning && (
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block mb-0.5">FPS</span>
              <span className="font-bold text-slate-200">{progress.fps || '0.0'}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block mb-0.5">SPEED</span>
              <span className="font-bold text-indigo-300">{progress.speed || '1.0x'}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block mb-0.5">ELAPSED</span>
              <span className="font-bold text-slate-200">
                {formatElapsed(progress.elapsed_sec)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block mb-0.5">ETA</span>
              <span className="font-bold text-emerald-400">
                {progress.eta_formatted || '00:00'}
              </span>
            </div>
          </div>
        )}

        {/* Error message if failed */}
        {isFailed && (
          <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-xs text-rose-300 font-mono break-words max-h-32 overflow-y-auto">
            {progress.error || 'Terjadi kesalahan saat rendering.'}
          </div>
        )}

        {/* Completed Output Summary */}
        {isCompleted && (
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Ukuran Akhir:</span>
              <span className="font-mono font-bold text-emerald-300">
                {progress.output_size_formatted || 'Tersimpan'}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Waktu Render:</span>
              <span className="font-mono font-bold text-slate-200">
                {formatElapsed(progress.elapsed_sec)}
              </span>
            </div>
            <div className="pt-2 border-t border-emerald-500/20">
              <span className="text-[10px] text-slate-400 block mb-1">File Output:</span>
              <span className="font-mono text-[11px] text-slate-200 break-all select-all block bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                {progress.output_path}
              </span>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {isRunning && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors"
            >
              Batalkan Proses
            </button>
          )}

          {isCompleted && (
            <>
              <button
                type="button"
                onClick={handleReveal}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-colors"
              >
                <Folder className="w-4 h-4" />
                <span>Buka di Folder (Finder/Explorer)</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
              >
                Tutup
              </button>
            </>
          )}

          {(isFailed || isCancelled) && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Tutup
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
