import React from 'react';
import { ArrowUp, ArrowDown, Trash2, Film, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function VideoList({ files, onReorder, onRemove }) {
  if (!files || files.length === 0) return null;

  const moveItem = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= files.length) return;
    const newFiles = [...files];
    const [moved] = newFiles.splice(fromIdx, 1);
    newFiles.splice(toIdx, 0, moved);
    onReorder(newFiles);
  };

  // Base parameters from first file
  const base = files[0];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
        <span>URUTAN PART VIDEO ({files.length} File)</span>
        <span>Gunakan Panah untuk Mengatur Urutan Marathon</span>
      </div>

      <div className="space-y-2">
        {files.map((file, idx) => {
          const isBase = idx === 0;
          const isMatch =
            isBase ||
            (file.resolution === base.resolution &&
              Math.abs(file.fps - base.fps) <= 0.5 &&
              file.video_codec === base.video_codec);

          return (
            <div
              key={file.file_path || idx}
              className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                isMatch
                  ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  : 'bg-amber-950/20 border-amber-600/40 hover:border-amber-500/60'
              }`}
            >
              {/* Left: Index badge & Filename info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center font-mono">
                  #{idx + 1}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-slate-100 truncate max-w-sm" title={file.filename}>
                      {file.filename}
                    </span>
                    {!isMatch && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 font-medium">
                        Beda Spec
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono truncate block max-w-md" title={file.file_path}>
                    {file.file_path}
                  </span>
                </div>
              </div>

              {/* Middle: Badges (Resolution, FPS, Codec, Duration, Size) */}
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 font-semibold">
                  {file.resolution || 'Unknown'}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                  {file.fps ? `${file.fps} fps` : '-'}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700/60 uppercase">
                  {file.video_codec || '-'}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                  {file.duration_formatted || '-'}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                  {file.size_formatted || '-'}
                </span>
              </div>

              {/* Right: Reorder actions and remove */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveItem(idx, idx - 1)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition-colors"
                  title="Pindah ke Atas"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === files.length - 1}
                  onClick={() => moveItem(idx, idx + 1)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition-colors"
                  title="Pindah ke Bawah"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 transition-colors ml-1"
                  title="Hapus dari Daftar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
