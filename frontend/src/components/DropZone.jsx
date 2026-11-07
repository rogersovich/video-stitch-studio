import React, { useState } from 'react';
import { UploadCloud, FolderOpen, FileText, Loader2, AlertCircle } from 'lucide-react';

export default function DropZone({
  onFilesSelected,
  multiple = false,
  title = "Tarik & Lepas File Video di Sini",
  subtitle = "Mendukung file .mp4, .mov, .mkv hasil ekspor CapCut atau video editor lainnya",
  disabled = false
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [locateError, setLocateError] = useState(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setLocateError(null);
    if (disabled) return;

    // 1. Check if text/plain or uri-list has file path (e.g. dragged from Finder or Terminal)
    const textData = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
    if (textData) {
      const lines = textData
        .split('\n')
        .map((l) => l.trim())
        .map((l) => (l.startsWith('file://') ? decodeURIComponent(l.replace('file://', '')) : l))
        .filter((l) => l.startsWith('/') || /^[a-zA-Z]:[\\\/]/.test(l));

      if (lines.length > 0) {
        onFilesSelected(multiple ? lines : [lines[0]]);
        return;
      }
    }

    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    // 2. Check if browser exposes file.path (in Electron or certain environments)
    const directPaths = files
      .map((f) => f.path)
      .filter((p) => p && (p.startsWith('/') || /^[a-zA-Z]:[\\\/]/.test(p)));

    if (directPaths.length === files.length) {
      onFilesSelected(multiple ? directPaths : [directPaths[0]]);
      return;
    }

    // 3. In web browsers (Chrome/Safari), browser security conceals full host path.
    // Automatically resolve the absolute path in milliseconds via backend system index/Spotlight!
    setIsLocating(true);
    try {
      const payload = {
        files: files.map((f) => ({
          name: f.name,
          size: f.size,
          last_modified: f.lastModified
        }))
      };

      const res = await fetch('/api/locate-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      const foundPaths = (data.results || [])
        .filter((r) => r.found && r.path)
        .map((r) => r.path);

      if (foundPaths.length > 0) {
        // Successfully resolved absolute path without opening file dialog!
        onFilesSelected(multiple ? foundPaths : [foundPaths[0]]);
      } else {
        // File not indexed or on external volume
        setLocateError(
          `File "${files[0].name}" tidak ditemukan di folder umum/Spotlight. Silakan gunakan tombol "Pilih File" di bawah untuk memilih file.`
        );
      }
    } catch (err) {
      console.error('Locate file error:', err);
      setLocateError('Gagal mendeteksi lokasi file secara otomatis. Silakan klik tombol "Pilih File".');
    } finally {
      setIsLocating(false);
    }
  };

  const handleNativeBrowse = async () => {
    if (disabled || isBrowsing) return;
    setIsBrowsing(true);
    setLocateError(null);
    try {
      const res = await fetch('/api/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: multiple ? 'multiple_files' : 'file',
          prompt: multiple ? 'Pilih Video Batch/Part' : 'Pilih Video Mentah'
        })
      });
      const data = await res.json();
      if (data.paths && data.paths.length > 0) {
        onFilesSelected(multiple ? data.paths : [data.paths[0]]);
      }
    } catch (err) {
      console.error('Failed to trigger native browse dialog:', err);
      setShowManualInput(true);
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualPath.trim()) return;
    const paths = manualPath
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (paths.length > 0) {
      onFilesSelected(multiple ? paths : [paths[0]]);
      setManualPath('');
      setShowManualInput(false);
      setLocateError(null);
    }
  };

  return (
    <div className="w-full space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-8 transition-all duration-200 flex flex-col items-center justify-center text-center group ${
          isDragging
            ? 'border-indigo-400 bg-indigo-950/40 scale-[1.005] shadow-lg shadow-indigo-500/10'
            : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80'
        } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
      >
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:scale-105 group-hover:bg-indigo-500/20 transition-transform">
          {isLocating ? (
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          ) : (
            <UploadCloud className="w-8 h-8 text-indigo-400" />
          )}
        </div>

        <h3 className="text-base font-bold text-slate-100 mb-1 tracking-tight">
          {isLocating ? 'Mendeteksi Path File...' : title}
        </h3>
        <p className="text-xs text-slate-400 max-w-md mb-4 leading-relaxed">
          {isLocating
            ? 'Membaca metadata dan direktori file lokal...'
            : subtitle}
        </p>

        {locateError && (
          <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2 max-w-md text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span>{locateError}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isBrowsing || isLocating}
            onClick={handleNativeBrowse}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            <span>{isBrowsing ? 'Membuka Finder/Explorer...' : 'Pilih File (Finder / Explorer)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowManualInput(!showManualInput)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700/60 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Ketik / Tempel Path</span>
          </button>
        </div>
      </div>

      {showManualInput && (
        <form onSubmit={handleManualSubmit} className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="font-semibold flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              Masukkan Path File Absolut (satu per baris jika batch):
            </span>
            <button
              type="button"
              onClick={() => setShowManualInput(false)}
              className="text-slate-500 hover:text-slate-300 text-xs"
            >
              Tutup
            </button>
          </div>
          <textarea
            rows={multiple ? 3 : 2}
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            placeholder={
              multiple
                ? "/Users/name/Movies/Ch01-06.mp4\n/Users/name/Movies/Ch07-12.mp4"
                : "/Users/name/Movies/CapCut_Ch01-06_Export.mp4"
            }
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow"
            >
              Muat File
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
