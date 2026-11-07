import React, { useState, useEffect, useRef } from 'react';
import {
  Layers,
  Scissors,
  Zap,
  FolderOpen,
  Film,
  Sparkles,
  Play,
  RotateCcw,
  Sliders,
  CheckCircle,
  Clock,
  HardDrive,
  Settings2,
  ChevronRight,
  ExternalLink,
  Plus,
  Square
} from 'lucide-react';

import HardwareBadge from './components/HardwareBadge';
import DropZone from './components/DropZone';
import VideoList from './components/VideoList';
import PreCheckAlert from './components/PreCheckAlert';
import ProgressBar from './components/ProgressBar';
import BulkCompressList from './components/BulkCompressList';

export default function App() {
  const [activeTab, setActiveTab] = useState('compress'); // 'compress' | 'merge'
  const [hardware, setHardware] = useState(null);

  // Tab 1: Bulk / Batch Compress State
  const [compressItems, setCompressItems] = useState([]);
  const [activeItemIndex, setActiveItemIndex] = useState(-1);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchOutputDir, setBatchOutputDir] = useState('');
  const [compressPreset, setCompressPreset] = useState('best_2k'); // 'best_2k' | 'best_1080p' | 'max_compression' | 'custom'
  const [customFps, setCustomFps] = useState(30);
  const [customRes, setCustomRes] = useState('2560x1440');
  const [customQuality, setCustomQuality] = useState(65);

  const cancelBatchRef = useRef(false);
  const activeJobResolverRef = useRef(null);
  const activeJobIdRef = useRef(null);

  // Tab 2: Merge / Marathon State
  const [mergeFiles, setMergeFiles] = useState([]);
  const [mergeValidation, setMergeValidation] = useState(null);
  const [mergeOutputName, setMergeOutputName] = useState('');
  const [mergeOutputDir, setMergeOutputDir] = useState('');
  const [mergeMode, setMergeMode] = useState('auto'); // 'auto' | 'instant_copy' | 'reencode'

  // Job / Progress State (for Tab 2 or single progress modals)
  const [activeJobProgress, setActiveJobProgress] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const wsRef = useRef(null);

  // Load hardware detection on boot
  useEffect(() => {
    fetch('/api/hardware')
      .then((res) => res.json())
      .then((data) => {
        setHardware(data);
        if (data.chip_type === 'apple_silicon') {
          setCustomQuality(65);
        } else if (data.chip_type === 'nvidia') {
          setCustomQuality(20);
        } else {
          setCustomQuality(22);
        }
      })
      .catch((err) => console.error('Failed to fetch hardware:', err));
  }, []);

  // Setup WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connectWs() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'job_progress' && msg.data) {
            setActiveJobProgress(msg.data);

            // If a batch runner is actively waiting for this job ID to finish
            if (
              activeJobResolverRef.current &&
              msg.data.job_id === activeJobResolverRef.current.jobId
            ) {
              if (['completed', 'failed', 'cancelled'].includes(msg.data.status)) {
                activeJobResolverRef.current.resolve(msg.data);
                activeJobResolverRef.current = null;
              }
            }
          }
        } catch (e) {
          // ignore non-json
        }
      };

      ws.onclose = () => {
        // Reconnect after 2s
        setTimeout(connectWs, 2000);
      };
    }

    connectWs();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // --- Handlers for Tab 1 (Bulk / Batch Compress) ---
  const handleCompressFilesSelected = async (paths) => {
    if (!paths || !paths.length) return;

    // Filter out paths already in compressItems
    const existingPaths = compressItems.map((it) => it.file_path);
    const newPaths = paths.filter((p) => !existingPaths.includes(p));
    if (!newPaths.length) return;

    // Set default output dir from first item if not set yet
    if (!batchOutputDir) {
      const first = newPaths[0];
      const lastSlash = Math.max(first.lastIndexOf('/'), first.lastIndexOf('\\'));
      if (lastSlash !== -1) setBatchOutputDir(first.substring(0, lastSlash));
    }

    try {
      // 1. Probe all new files
      const probeRes = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: newPaths })
      });
      const probeData = await probeRes.json();
      const validFiles = (probeData.files || []).filter((f) => f.is_valid);

      // 2. Get auto-names for all files
      const allPathsToName = [...existingPaths, ...validFiles.map((f) => f.file_path)];
      const nameRes = await fetch('/api/suggest-naming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: allPathsToName.length > 1 ? 'batch' : 'single',
          paths: allPathsToName,
          preset_label: 'compressed'
        })
      });
      const nameData = await nameRes.json();
      const suggestedList =
        nameData.suggested_filenames ||
        (nameData.suggested_filename ? [nameData.suggested_filename] : []);

      // Build new items
      const newItems = validFiles.map((vf, idx) => {
        const nameIdx = existingPaths.length + idx;
        const suggestedName =
          suggestedList[nameIdx] ||
          `${vf.filename.replace(/\.[^/.]+$/, '')}(compressed).mp4`;
        return {
          file_path: vf.file_path,
          filename: vf.filename,
          resolution: vf.resolution,
          fps: vf.fps,
          duration_sec: vf.duration_sec,
          duration_formatted: vf.duration_formatted,
          size_bytes: vf.size_bytes,
          size_formatted: vf.size_formatted,
          video_codec: vf.video_codec,
          output_name: suggestedName,
          status: 'pending',
          output_path: null,
          compressed_size_formatted: null,
          error: null
        };
      });

      setCompressItems((prev) => [...prev, ...newItems]);
    } catch (e) {
      console.error('Failed to load compress batch files:', e);
    }
  };

  const handleUpdateItemOutputName = (index, newName) => {
    setCompressItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, output_name: newName } : it))
    );
  };

  const handleRemoveCompressItem = (index) => {
    if (isBatchRunning) return;
    setCompressItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleClearAllCompress = () => {
    if (isBatchRunning) return;
    setCompressItems([]);
    setActiveItemIndex(-1);
  };

  // Start sequential (1-by-1) batch compression runner
  const handleStartBatchCompress = async () => {
    if (!compressItems.length || isBatchRunning) return;
    setIsBatchRunning(true);
    cancelBatchRef.current = false;

    for (let i = 0; i < compressItems.length; i++) {
      if (cancelBatchRef.current) break;
      const item = compressItems[i];
      if (item.status === 'completed') continue;

      setActiveItemIndex(i);
      setCompressItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: 'running' } : it))
      );

      const sep = item.file_path.includes('\\') ? '\\' : '/';
      const lastSlash = Math.max(item.file_path.lastIndexOf('/'), item.file_path.lastIndexOf('\\'));
      const parentDir = lastSlash !== -1 ? item.file_path.substring(0, lastSlash) : '';
      const outDir = batchOutputDir || parentDir;
      const outPath = `${outDir}${sep}${item.output_name}`;

      const payload = {
        input_path: item.file_path,
        output_path: outPath,
        preset: compressPreset,
        custom_opts:
          compressPreset === 'custom'
            ? {
                fps: customFps,
                resolution: customRes,
                quality: customQuality
              }
            : undefined
      };

      try {
        const res = await fetch('/api/compress/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          setCompressItems((prev) =>
            prev.map((it, idx) =>
              idx === i ? { ...it, status: 'failed', error: data.detail } : it
            )
          );
          continue;
        }

        const jobId = data.job_id;
        activeJobIdRef.current = jobId;

        // Wait for this specific job to complete via WebSocket callback with safety polling fallback
        const jobResult = await new Promise((resolve) => {
          let pollTimer = null;
          const done = (result) => {
            if (pollTimer) clearInterval(pollTimer);
            resolve(result);
          };

          activeJobResolverRef.current = { jobId, resolve: done };

          // Safety net: in case WebSocket disconnects, poll status every 2 seconds
          pollTimer = setInterval(async () => {
            if (cancelBatchRef.current) {
              if (pollTimer) clearInterval(pollTimer);
              return;
            }
            try {
              const checkRes = await fetch(`/api/job/${jobId}/status`);
              if (checkRes.ok) {
                const statusData = await checkRes.json();
                if (['completed', 'failed', 'cancelled'].includes(statusData.status)) {
                  if (activeJobResolverRef.current && activeJobResolverRef.current.jobId === jobId) {
                    activeJobResolverRef.current = null;
                    done(statusData);
                  }
                }
              }
            } catch (e) {
              // ignore temporary fetch error
            }
          }, 2000);
        });

        if (jobResult.status === 'completed') {
          setCompressItems((prev) =>
            prev.map((it, idx) =>
              idx === i
                ? {
                    ...it,
                    status: 'completed',
                    output_path: jobResult.output_path || outPath,
                    compressed_size_formatted: jobResult.output_size_formatted
                  }
                : it
            )
          );
        } else if (jobResult.status === 'cancelled') {
          setCompressItems((prev) =>
            prev.map((it, idx) => (idx === i ? { ...it, status: 'cancelled' } : it))
          );
          break; // Stop queue
        } else {
          setCompressItems((prev) =>
            prev.map((it, idx) =>
              idx === i ? { ...it, status: 'failed', error: jobResult.error } : it
            )
          );
        }
      } catch (err) {
        setCompressItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: 'failed', error: String(err) } : it
          )
        );
      }
    }

    setIsBatchRunning(false);
    setActiveItemIndex(-1);
    activeJobIdRef.current = null;
    activeJobResolverRef.current = null;
  };

  const handleCancelBatch = async () => {
    cancelBatchRef.current = true;
    if (activeJobIdRef.current) {
      try {
        await fetch('/api/job/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: activeJobIdRef.current })
        });
      } catch (e) {}
    }
    if (activeJobResolverRef.current) {
      activeJobResolverRef.current.resolve({ status: 'cancelled' });
      activeJobResolverRef.current = null;
    }
    setIsBatchRunning(false);
    setActiveItemIndex(-1);
  };

  // --- Handlers for Tab 2 (Merge) ---
  const handleMergeFilesSelected = async (paths) => {
    if (!paths || !paths.length) return;

    // Combine with existing files avoiding exact duplicates
    const existingPaths = mergeFiles.map((f) => f.file_path);
    const newPaths = paths.filter((p) => !existingPaths.includes(p));
    const allPaths = [...existingPaths, ...newPaths];

    if (!mergeOutputDir && allPaths.length > 0) {
      const first = allPaths[0];
      const lastSlash = Math.max(first.lastIndexOf('/'), first.lastIndexOf('\\'));
      if (lastSlash !== -1) setMergeOutputDir(first.substring(0, lastSlash));
    }

    // Probe all files
    try {
      const probeRes = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: allPaths })
      });
      const data = await probeRes.json();
      if (data.files) {
        setMergeFiles(data.files);
        setMergeValidation(data.merge_validation);
      }
    } catch (e) {
      console.error('Probe merge files error:', e);
    }

    // Auto naming for merge
    try {
      const nameRes = await fetch('/api/suggest-naming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'merge', paths: allPaths, preset_label: '2K' })
      });
      const nameData = await nameRes.json();
      if (nameData.suggested_filename) {
        setMergeOutputName(nameData.suggested_filename);
      }
    } catch (e) {
      console.error('Naming suggest merge error:', e);
    }
  };

  const handleReorderMergeFiles = async (newFiles) => {
    setMergeFiles(newFiles);
    const paths = newFiles.map((f) => f.file_path);

    // Revalidate compatibility
    try {
      const probeRes = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths })
      });
      const data = await probeRes.json();
      if (data.merge_validation) {
        setMergeValidation(data.merge_validation);
      }
    } catch (e) {}

    // Update naming
    try {
      const nameRes = await fetch('/api/suggest-naming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'merge', paths, preset_label: '2K' })
      });
      const nameData = await nameRes.json();
      if (nameData.suggested_filename) {
        setMergeOutputName(nameData.suggested_filename);
      }
    } catch (e) {}
  };

  const handleRemoveMergeFile = (index) => {
    const updated = mergeFiles.filter((_, idx) => idx !== index);
    handleReorderMergeFiles(updated);
  };

  const handleStartMerge = async () => {
    if (mergeFiles.length === 0 || !mergeOutputName) return;
    const paths = mergeFiles.map((f) => f.file_path);
    const sep = paths[0].includes('\\') ? '\\' : '/';
    const outPath = mergeOutputDir
      ? `${mergeOutputDir}${sep}${mergeOutputName}`
      : mergeOutputName;

    const payload = {
      file_paths: paths,
      output_path: outPath,
      mode: mergeMode
    };

    try {
      setActiveJobProgress({ status: 'queued', percentage: 0 });
      setShowProgressModal(true);

      const res = await fetch('/api/merge/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        setActiveJobProgress({
          status: 'failed',
          error: data.detail || 'Gagal memulai penggabungan marathon.'
        });
      } else if (data.job_id) {
        setActiveJobProgress((prev) => ({
          ...prev,
          job_id: data.job_id,
          status: 'running',
          output_path: data.output_path
        }));
      }
    } catch (e) {
      console.error('Start merge error:', e);
      setActiveJobProgress({ status: 'failed', error: String(e) });
    }
  };

  const handleChooseOutputDir = async (targetSetter) => {
    try {
      const res = await fetch('/api/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'directory', prompt: 'Pilih Folder Tujuan Penyimpanan' })
      });
      const data = await res.json();
      if (data.paths && data.paths.length > 0) {
        targetSetter(data.paths[0]);
      }
    } catch (e) {
      console.error('Browse dir error:', e);
    }
  };

  const handleCancelMergeJob = async () => {
    setActiveJobProgress((prev) => ({
      ...prev,
      status: 'cancelled'
    }));

    if (!activeJobProgress || !activeJobProgress.job_id) return;
    try {
      await fetch('/api/job/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: activeJobProgress.job_id })
      });
    } catch (e) {
      console.error('Cancel request error:', e);
    }
  };

  const handleRevealPath = async (path) => {
    if (!path) return;
    try {
      await fetch('/api/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
    } catch (err) {
      console.error('Reveal error:', err);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Header */}
      <header className="flex items-center justify-between pb-6 border-b border-slate-800/80">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-600/25">
            <Film className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Video Stitch Studio
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                Desktop v0.1
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Kompresi 2K Visually Lossless & Penggabungan Instan (Stream Copy Concat)
            </p>
          </div>
        </div>

        {/* Hardware Acceleration Indicator Badge */}
        <HardwareBadge hardware={hardware} />
      </header>

      {/* Navigation Tabs */}
      <nav className="flex space-x-2 p-1.5 rounded-2xl bg-slate-900/80 border border-slate-800">
        <button
          onClick={() => setActiveTab('compress')}
          className={`flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'compress'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Scissors className="w-4 h-4" />
          <span>MODUL 1: KOMPRESI PART VIDEO (SINGLE & BATCH 2K)</span>
        </button>

        <button
          onClick={() => setActiveTab('merge')}
          className={`flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'merge'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>MODUL 2: PENGGABUNGAN INSTAN (MARATHON CONCAT ~15s)</span>
        </button>
      </nav>

      {/* TAB 1: COMPRESS SINGLE & BATCH QUEUE */}
      {activeTab === 'compress' && (
        <div className="space-y-6">
          {/* File Picker Zone */}
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-6 space-y-4">
            <DropZone
              multiple={true}
              title="Pilih atau Tarik Video Mentah (Bisa Banyak File Sekaligus)"
              subtitle="Tarik satu atau beberapa video mentah CapCut sekaligus. Sistem akan memasukkannya ke antrean batch dan memproses 1-by-1 dengan kecepatan maksimal."
              disabled={isBatchRunning}
              onFilesSelected={handleCompressFilesSelected}
            />

            {/* Bulk Queue Table if files are present */}
            {compressItems.length > 0 && (
              <BulkCompressList
                items={compressItems}
                onUpdateOutputName={handleUpdateItemOutputName}
                onRemoveItem={handleRemoveCompressItem}
                onClearAll={handleClearAllCompress}
                activeItemIndex={activeItemIndex}
                isBatchRunning={isBatchRunning}
                currentJobProgress={activeJobProgress}
                onRevealPath={handleRevealPath}
              />
            )}
          </div>

          {/* Batch Configuration & Output Card */}
          {compressItems.length > 0 && (
            <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-6 space-y-6">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-400" />
                Konfigurasi Preset & Folder Penyimpanan Batch
              </h3>

              {/* Preset Selector */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <button
                  type="button"
                  disabled={isBatchRunning}
                  onClick={() => setCompressPreset('best_2k')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    compressPreset === 'best_2k'
                      ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-100 shadow-md shadow-indigo-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  } ${isBatchRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Best for 2K Recap (Default)</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-extrabold uppercase">
                      Rekomendasi
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    2560x1440 @ 30 FPS CFR. Visual lossless, teks manhwa tajam, hemat ~75% disk. Sumber lebih kecil tidak di-upscale.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={isBatchRunning}
                  onClick={() => setCompressPreset('best_1080p')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    compressPreset === 'best_1080p'
                      ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-100 shadow-md shadow-indigo-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  } ${isBatchRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Best for 1080p</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    1920x1080 @ 30 FPS CFR. Kualitas sama dengan preset 2K, cocok untuk export CapCut 1080p.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={isBatchRunning}
                  onClick={() => setCompressPreset('max_compression')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    compressPreset === 'max_compression'
                      ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-100 shadow-md shadow-indigo-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  } ${isBatchRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Max Compression</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Kompresi ekstra hemat storage (~1.2 GB/jam) untuk arsip jangka panjang.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={isBatchRunning}
                  onClick={() => setCompressPreset('custom')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    compressPreset === 'custom'
                      ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-100 shadow-md shadow-indigo-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  } ${isBatchRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Custom Mode</span>
                    <Sliders className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Atur manual resolusi, FPS, dan slider quality/CRF sesuai kebutuhan khusus.
                  </p>
                </button>
              </div>

              {/* Custom Sliders if Custom Preset Selected */}
              {compressPreset === 'custom' && (
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1 font-semibold">Target Resolusi:</label>
                    <select
                      disabled={isBatchRunning}
                      value={customRes}
                      onChange={(e) => setCustomRes(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                    >
                      <option value="2560x1440">2K (2560x1440)</option>
                      <option value="1920x1080">1080p (1920x1080)</option>
                      <option value="3840x2160">4K (3840x2160)</option>
                      <option value="original">Original (Tanpa Resize)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-semibold">Framerate (FPS):</label>
                    <select
                      disabled={isBatchRunning}
                      value={customFps}
                      onChange={(e) => setCustomFps(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                    >
                      <option value={30}>30 FPS (Standar Rekap)</option>
                      <option value={60}>60 FPS</option>
                      <option value={24}>24 FPS (Cinematic)</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span className="font-semibold">Quality Level:</span>
                      <span className="font-mono text-indigo-400 font-bold">{customQuality}</span>
                    </div>
                    <input
                      type="range"
                      disabled={isBatchRunning}
                      min={10}
                      max={90}
                      value={customQuality}
                      onChange={(e) => setCustomQuality(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Destination Folder Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Folder Penyimpanan Hasil Batch:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    disabled={isBatchRunning}
                    value={batchOutputDir}
                    onChange={(e) => setBatchOutputDir(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    disabled={isBatchRunning}
                    onClick={() => handleChooseOutputDir(setBatchOutputDir)}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700/60 transition-colors flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Ubah Folder</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-3">
                {isBatchRunning ? (
                  <button
                    type="button"
                    onClick={handleCancelBatch}
                    className="w-full py-4 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 text-rose-200 font-extrabold text-sm tracking-wide shadow-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>HENTIKAN / BATALKAN ANTREAN BATCH</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartBatchCompress}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold text-sm tracking-wide shadow-xl shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 group"
                  >
                    <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
                    <span>
                      {compressItems.length > 1
                        ? `MULAI KOMPRESI BATCH (${compressItems.length} VIDEO BERURUTAN)`
                        : 'START COMPRESS 2K (VISUALLY LOSSLESS)'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INSTANT VIDEO MERGER (MARATHON CONCAT) */}
      {activeTab === 'merge' && (
        <div className="space-y-6">
          {/* Multi-file Drop Zone */}
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-6 space-y-4">
            <DropZone
              multiple={true}
              title="Pilih atau Tarik File Part Video untuk Digabung"
              subtitle="Pilih Part 1, Part 2, Part 3, dst. Sistem akan otomatis memvalidasi kesesuaian parameter untuk Instant Stream Copy Concat (~15 detik)"
              onFilesSelected={handleMergeFilesSelected}
            />

            {/* Pre-Check Validator Status Bar */}
            {mergeFiles.length > 0 && <PreCheckAlert validation={mergeValidation} />}

            {/* Sortable Video List */}
            {mergeFiles.length > 0 && (
              <VideoList
                files={mergeFiles}
                onReorder={handleReorderMergeFiles}
                onRemove={handleRemoveMergeFile}
              />
            )}
          </div>

          {/* Merge Output & Mode Card */}
          {mergeFiles.length > 0 && (
            <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-6 space-y-6">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-emerald-400" />
                Target Marathon & Mode Penggabungan
              </h3>

              {/* Mode Selection */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setMergeMode('auto')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    mergeMode === 'auto'
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-100 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Otomatis (Rekomendasi)</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-extrabold uppercase">
                      Smart
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Otomatis memilih Instant Copy jika spec sama, atau Re-encode jika ada perbedaan.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMergeMode('instant_copy')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    mergeMode === 'instant_copy'
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-100 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">⚡ Paksa Instant Copy (-c copy)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Selesai 10–30 detik! 0% beban render GPU. Hanya bisa berjalan jika spec antar file cocok.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMergeMode('reencode')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    mergeMode === 'reencode'
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-100 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Re-encode Standardized 2K</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Meratakan semua video ke resolusi 2560x1440 30 FPS via hardware encoder.
                  </p>
                </button>
              </div>

              {/* Destination Folder & Output Filename */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Saran Nama File Marathon (Auto-Naming):
                    </label>
                    <button
                      type="button"
                      onClick={() => handleReorderMergeFiles(mergeFiles)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset Auto-Name
                    </button>
                  </div>
                  <input
                    type="text"
                    value={mergeOutputName}
                    onChange={(e) => setMergeOutputName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    Folder Penyimpanan:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mergeOutputDir}
                      onChange={(e) => setMergeOutputDir(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleChooseOutputDir(setMergeOutputDir)}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700/60 transition-colors flex items-center gap-1.5"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Ubah</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={mergeFiles.length < 2}
                  onClick={handleStartMerge}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-sm tracking-wide shadow-xl shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 group"
                >
                  <Zap className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
                  <span>
                    {mergeValidation?.can_instant_copy
                      ? '⚡ MERGE INSTAN (LOSSLESS STREAM COPY - ~15s)'
                      : 'MULAI GABUNG MARATHON VIDEO'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress Modal (Used for Tab 2 Marathon Merge) */}
      {showProgressModal && (
        <ProgressBar
          progress={activeJobProgress}
          onCancel={handleCancelMergeJob}
          onClose={() => setShowProgressModal(false)}
          title="Menggabungkan Marathon Video..."
        />
      )}
    </div>
  );
}
