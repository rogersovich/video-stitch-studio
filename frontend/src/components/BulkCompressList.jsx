import React from 'react';
import {
  Film,
  Clock,
  HardDrive,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Folder,
  Loader2,
  Check,
  Edit2
} from 'lucide-react';

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

export default function BulkCompressList({
  items,
  onUpdateOutputName,
  onRemoveItem,
  onClearAll,
  activeItemIndex,
  isBatchRunning,
  currentJobProgress,
  onRevealPath
}) {
  if (!items || items.length === 0) return null;

  const completedCount = items.filter((it) => it.status === 'completed').length;
  const totalDurationSec = items.reduce((acc, it) => acc + (it.duration_sec || 0), 0);
  const totalSizeBytes = items.reduce((acc, it) => acc + (it.size_bytes || 0), 0);

  // Format total duration
  const formatTotalDuration = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h} jam ${m} mnt` : `${m} menit`;
  };

  // Format total size
  const formatTotalSize = (bytes) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Top Batch Header Bar */}
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-slate-100 tracking-wide flex items-center gap-2">
            <Film className="w-4 h-4 text-indigo-400" />
            ANTREAN BATCH: {items.length} VIDEO
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Mode: 1-by-1 (Maksimum Hardware Speed)
          </span>
          <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px] ml-2">
            <span>Total Durasi: <b className="text-slate-200">{formatTotalDuration(totalDurationSec)}</b></span>
            <span>•</span>
            <span>Total Ukuran Asli: <b className="text-rose-300">{formatTotalSize(totalSizeBytes)}</b></span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {completedCount > 0 && (
            <span className="text-emerald-400 font-semibold font-mono text-[11px]">
              {completedCount} / {items.length} Selesai
            </span>
          )}
          {!isBatchRunning && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-slate-500 hover:text-rose-400 text-xs font-medium transition-colors"
            >
              Hapus Semua
            </button>
          )}
        </div>
      </div>

      {/* Global Batch Progress Indicator if running */}
      {isBatchRunning && (
        <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-2 text-xs animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-indigo-200">
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              <span>
                Sedang Memproses Video {activeItemIndex + 1} dari {items.length} ({(
                  ((completedCount + (currentJobProgress?.percentage || 0) / 100) / items.length) * 100
                ).toFixed(1)}% Total Batch)
              </span>
            </div>
            {currentJobProgress?.eta_formatted && (
              <span className="font-mono text-emerald-400">
                ETA Video Saat Ini: {currentJobProgress.eta_formatted}
              </span>
            )}
          </div>

          {/* Overall progress bar */}
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 transition-all duration-300"
              style={{
                width: `${(((completedCount + (currentJobProgress?.percentage || 0) / 100) / items.length) * 100).toFixed(1)}%`
              }}
            />
          </div>
        </div>
      )}

      {/* List of Batch Queue Items */}
      <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
        {items.map((item, idx) => {
          const isActive = idx === activeItemIndex && isBatchRunning;
          const isDone = item.status === 'completed';
          const isFail = item.status === 'failed';
          const isPending = !isActive && !isDone && !isFail;

          return (
            <div
              key={item.file_path || idx}
              className={`p-4 rounded-xl border transition-all space-y-3 ${
                isActive
                  ? 'bg-indigo-950/30 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                  : isDone
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : isFail
                  ? 'bg-rose-950/25 border-rose-500/30'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Row 1: Item Index, Source info, and Badges */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-lg font-bold text-xs flex items-center justify-center font-mono ${
                      isActive
                        ? 'bg-indigo-600 text-white animate-pulse'
                        : isDone
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : isFail
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : `#${idx + 1}`}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-100 truncate max-w-md" title={item.filename}>
                        {item.filename}
                      </span>
                      {/* Status Badge */}
                      {isActive && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-bold uppercase animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" /> Sedang Diproses
                        </span>
                      )}
                      {isDone && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-bold uppercase">
                          <CheckCircle2 className="w-3 h-3" /> Selesai
                        </span>
                      )}
                      {isFail && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-bold uppercase">
                          <AlertCircle className="w-3 h-3" /> Gagal
                        </span>
                      )}
                      {isPending && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-semibold uppercase">
                          <Clock className="w-3 h-3" /> Antrean
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono truncate block max-w-lg mt-0.5" title={item.file_path}>
                      {item.file_path}
                    </span>
                  </div>
                </div>

                {/* Specs Badges */}
                <div className="flex items-center gap-1.5 text-[11px] font-mono flex-shrink-0">
                  <span className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700/60 font-semibold">
                    {item.resolution || '-'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700/60">
                    {item.fps ? `${item.fps} fps` : '-'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700/60">
                    {item.duration_formatted || '-'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800/90 text-rose-300 border border-slate-700/60">
                    {item.size_formatted || '-'}
                  </span>

                  {!isBatchRunning && !isDone && (
                    <button
                      type="button"
                      onClick={() => onRemoveItem(idx)}
                      className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 ml-1 transition-colors"
                      title="Hapus dari antrean"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isDone && item.output_path && (
                    <button
                      type="button"
                      onClick={() => onRevealPath(item.output_path)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold transition-colors shadow"
                      title="Buka di Finder"
                    >
                      <Folder className="w-3 h-3" />
                      <span>Buka</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Editable Output Name */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60 text-xs">
                <span className="text-[11px] text-slate-400 font-semibold flex-shrink-0 flex items-center gap-1">
                  <Edit2 className="w-3 h-3 text-indigo-400" />
                  Saran Nama File:
                </span>
                <input
                  type="text"
                  disabled={isBatchRunning || isDone}
                  value={item.output_name}
                  onChange={(e) => onUpdateOutputName(idx, e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 disabled:opacity-60 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                {isDone && item.compressed_size_formatted && (
                  <span className="text-[11px] font-mono font-bold text-emerald-300 flex-shrink-0">
                    Hasil: {item.compressed_size_formatted}
                  </span>
                )}
              </div>

              {/* Row 3: Active progress metrics if this item is currently running */}
              {isActive && currentJobProgress && (
                <div className="pt-2 space-y-1.5 animate-in fade-in">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-slate-400">
                      {currentJobProgress.current_time_formatted || '00:00'} / {item.duration_formatted}
                    </span>
                    <span className="text-slate-300">
                      FPS: <b className="text-slate-100">{currentJobProgress.fps || '0.0'}</b> • Speed: <b className="text-indigo-400">{currentJobProgress.speed || '1.0x'}</b> • Elapsed: <b className="text-slate-200">{formatElapsed(currentJobProgress.elapsed_sec)}</b>
                    </span>
                    <span className="font-bold text-indigo-400">
                      {currentJobProgress.percentage ? `${currentJobProgress.percentage.toFixed(1)}%` : '0%'}
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-200"
                      style={{ width: `${currentJobProgress.percentage || 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Row 4: Error message if failed */}
              {isFail && item.error && (
                <div className="pt-2 text-rose-400 text-[11px] font-mono flex items-center gap-1.5 bg-rose-950/40 p-2 rounded-lg border border-rose-500/30">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate" title={item.error}>
                    Error: {item.error}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
