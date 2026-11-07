import React, { useState } from 'react';
import { Cpu, Zap, CheckCircle2, AlertTriangle, Info, ChevronDown } from 'lucide-react';

export default function HardwareBadge({ hardware }) {
  const [showDetails, setShowDetails] = useState(false);

  if (!hardware) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs text-slate-400 animate-pulse">
        <Cpu className="w-3.5 h-3.5 animate-spin" />
        <span>Detecting hardware...</span>
      </div>
    );
  }

  const isHw = hardware.has_hardware_acceleration;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 ${
          isHw
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40 hover:border-emerald-500/50'
            : 'bg-amber-950/40 border-amber-500/30 text-amber-300 hover:bg-amber-900/40'
        }`}
        title="Click to view hardware acceleration details"
      >
        <span className="relative flex h-2 w-2">
          {isHw && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isHw ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          ></span>
        </span>
        <Zap className={`w-3.5 h-3.5 ${isHw ? 'text-emerald-400' : 'text-amber-400'}`} />
        <span className="font-semibold tracking-wide">{hardware.badge_text || 'Hardware'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
      </button>

      {showDetails && (
        <div className="absolute right-0 mt-2 w-80 p-4 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-2xl z-50 text-xs text-slate-300 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-100 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Hardware Profile
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                isHw ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {isHw ? 'Accelerated' : 'CPU Fallback'}
            </span>
          </div>

          <div className="space-y-1.5 text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Device:</span>
              <span className="font-semibold text-slate-200">{hardware.device_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Platform:</span>
              <span className="font-mono text-slate-200">{hardware.os}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Recommended Codec:</span>
              <span className="font-mono text-indigo-300 font-bold">{hardware.recommended_codec}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Audio Profile:</span>
              <span className="text-slate-200">AAC 192 kbps (Standard)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">FFmpeg Ready:</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Yes
              </span>
            </div>
          </div>

          {hardware.supported_codecs && hardware.supported_codecs.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Available Hardware Codecs:</span>
              <div className="flex flex-wrap gap-1">
                {hardware.supported_codecs.map((codec) => (
                  <span
                    key={codec}
                    className="px-2 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-slate-300 border border-slate-700"
                  >
                    {codec}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
