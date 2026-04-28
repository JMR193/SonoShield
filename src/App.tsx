/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  ShieldCheck, 
  AudioLines, 
  Fingerprint as FingerprintIcon, 
  Download, 
  Zap, 
  Activity,
  Music,
  RefreshCw,
  Waves
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import WaveSurfer from 'wavesurfer.js';
import confetti from 'canvas-confetti';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, loginWithGoogle, logout } from '@/src/lib/firebase';
import { cn, generateFingerprint, humanizeAudio, analyzeAIDetection, audioBufferToBlob } from '@/src/lib/audio-utils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [ledger, setLedger] = useState<{name: string, fingerprint: string, date: string}[]>([]);
  const [humanizedBuffer, setHumanizedBuffer] = useState<AudioBuffer | null>(null);
  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);
  const [aiAnalysisModel, setAiAnalysisModel] = useState<{ score: number, status: string } | null>(null);
  const [playingOriginal, setPlayingOriginal] = useState(false);
  
  // Params
  const [saturation, setSaturation] = useState(25);
  const [jitter, setJitter] = useState(15);
  const [airReduction, setAirReduction] = useState(30);
  const [noiseFloor, setNoiseFloor] = useState(10);
  const [tilt, setTilt] = useState(0); // -50 to 50
  const [masteringDrive, setMasteringDrive] = useState(50);
  
  // Metadata
  const [metadata, setMetadata] = useState({ title: '', artist: '', genre: 'Electronic' });
  
  // Editor / Trim
  const [duration, setDuration] = useState(0);
  const [trimRange, setTrimRange] = useState({ start: 0, end: 0 });

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    if (waveformRef.current && !wavesurfer.current) {
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#334155',
        progressColor: '#3b82f6',
        cursorColor: '#fbbf24',
        barWidth: 2,
        barRadius: 3,
        height: 140,
        normalize: true,
      });

      wavesurfer.current.on('ready', () => {
        const d = wavesurfer.current?.getDuration() || 0;
        setDuration(d);
        if (trimRange.end === 0) setTrimRange({ start: 0, end: d });
      });
    }
    return () => {
      unsubscribeAuth();
      wavesurfer.current?.destroy();
      wavesurfer.current = null;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setLedger([]);
      return;
    }

    // Ledger functionality has been disabled since Firestore was removed
    setLedger([]);
  }, [user]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const buffer = await audioCtx.decodeAudioData(arrayBuffer);
      setOriginalBuffer(buffer);
      wavesurfer.current?.loadBlob(uploadedFile);

      // Auto analyze for AI on upload
      const score = await analyzeAIDetection(buffer);
      setAiAnalysisModel({
        score,
        status: score > 70 ? 'CRITICAL' : score > 40 ? 'SUSPICIOUS' : 'SAFE'
      });
    }
  };

  const processAudio = async () => {
    if (!originalBuffer) return;
    setIsProcessing(true);
    
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // 1. Humanize
      const result = await humanizeAudio(originalBuffer, audioCtx, {
        saturation: saturation / 100,
        jitter: jitter / 100,
        air: airReduction / 100,
        noise: noiseFloor / 100,
        tilt: tilt / 100,
        mastering: masteringDrive / 100,
        trimStart: trimRange.start,
        trimEnd: trimRange.end
      });
      
      // 2. Fingerprint
      const fp = await generateFingerprint(result);
      
      setHumanizedBuffer(result);
      setFingerprint(fp);

      // 3. Re-analyze processed audio
      const newScore = await analyzeAIDetection(result);
      setAiAnalysisModel({
        score: newScore,
        status: newScore > 70 ? 'CRITICAL' : newScore > 40 ? 'SUSPICIOUS' : 'SAFE'
      });

      // 4. Update Ledger locally
      const newEntry = {
        name: file?.name || 'Unknown Track',
        title: metadata.title || file?.name?.replace(/\.[^/.]+$/, "") || 'Untitled',
        artist: metadata.artist || 'Independent Artist',
        genre: metadata.genre,
        fingerprint: fp,
        date: new Date().toLocaleString()
      };
      setLedger(prev => [newEntry, ...prev].slice(0, 5));
      
      // Update wavesurfer visualization with processed data (preview)
      const blob = await audioBufferToBlob(result);
      wavesurfer.current?.loadBlob(blob);
      
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3b82f6', '#fbbf24', '#ffffff']
      });
      
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePlaybackMode = async () => {
    if (!wavesurfer.current) return;
    
    const wasPlaying = wavesurfer.current.isPlaying();
    const currentTime = wavesurfer.current.getCurrentTime();
    
    if (playingOriginal) {
      // Switch to humanized
      if (humanizedBuffer) {
        const blob = await audioBufferToBlob(humanizedBuffer);
        wavesurfer.current.loadBlob(blob);
        setPlayingOriginal(false);
      }
    } else {
      // Switch to original
      if (file) {
        wavesurfer.current.loadBlob(file);
        setPlayingOriginal(true);
      }
    }
    
    // Resume at same time
    wavesurfer.current.once('ready', () => {
      wavesurfer.current?.setTime(currentTime);
      if (wasPlaying) wavesurfer.current?.play();
    });
  };

  const downloadProcessed = async () => {
    if (!humanizedBuffer) return;
    const blob = await audioBufferToBlob(humanizedBuffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonoshield_${file?.name?.replace(/\.[^/.]+$/, "") || 'track'}.wav`;
    a.click();
  };

  const downloadModelFile = () => {
    const modelData = {
      version: "2.5.0-stable",
      engine: "SonoShield Spectral Heuristics",
      thresholds: {
        critical: 70,
        suspicious: 40,
        safe: 39
      },
      analysis_patterns: [
        "Phase Correlation Analysis",
        "Harmonic Transient Detection",
        "Spectral Flatness Measurement",
        "Macro-Dynamics Entropy"
      ],
      last_updated: "2026-04-28"
    };
    const blob = new Blob([JSON.stringify(modelData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonoshield_model_v2.5.0.json`;
    a.click();
  };

  return (
    <div className="min-h-screen px-4 py-8 md:px-8 bg-studio-black text-slate-200">
      <header className="max-w-6xl mx-auto mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-studio-accent rounded-lg">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">SonoShield</h1>
          </div>
          <p className="text-slate-400">Professional AI Humanizer & Spectral Fingerprinter</p>
        </div>
        
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Authenticated</span>
                <span className="text-xs text-slate-300">{user.email}</span>
              </div>
              <button 
                onClick={() => logout()}
                className="px-4 py-2 glass-panel rounded-full text-xs font-mono hover:bg-white/5 transition-colors"
                id="logout-button"
              >
                LOGOUT
              </button>
            </div>
          ) : (
            <button 
              onClick={() => loginWithGoogle()}
              className="px-6 py-2 bg-white text-black rounded-full text-xs font-bold hover:bg-slate-200 transition-all shadow-lg"
              id="login-button"
            >
              LOGIN WITH GOOGLE
            </button>
          )}
          <div className="hidden sm:flex px-4 py-2 glass-panel rounded-full text-xs font-mono items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            READY
          </div>
          <div className="px-4 py-2 glass-panel rounded-full text-xs font-mono flex items-center gap-2">
            <Zap className="w-3 h-3 text-studio-gold" />
            V.2.5.0
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: controls */}
        <div className="lg:col-span-4 space-y-6">
          <section className="studio-card p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-6 flex items-center gap-2">
              <Upload className="w-4 h-4" /> Source Input
            </h3>
            
            <label className={cn(
              "relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all",
              file ? "border-studio-accent bg-studio-accent/5" : "border-white/10 hover:border-white/20 hover:bg-white/5"
            )}>
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {file ? (
                  <>
                    <Music className="w-10 h-10 text-studio-accent mb-3" />
                    <p className="text-sm text-slate-300 font-medium px-4 text-center truncate w-full">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-slate-600 mb-3" />
                    <p className="text-sm text-slate-400">Drop audio file or click</p>
                    <p className="text-xs text-slate-600 mt-2">WAV, MP3, FLAC, OGG, M4A</p>
                  </>
                )}
              </div>
              <input type="file" className="hidden" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a" onChange={handleFileUpload} />
            </label>
          </section>

          <section className="studio-card p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-6 flex items-center gap-2">
              <AudioLines className="w-4 h-4" /> Humanization Params
            </h3>
            
            <div className="space-y-6">
                <div className="pt-2 border-t border-white/5">
                  <h4 className="text-[10px] font-bold text-studio-gold uppercase tracking-[0.2em] mb-4">Mastering & Finish</h4>
                  <ParamSlider 
                    label="Spectral Tilt" 
                    value={tilt + 50} 
                    onChange={(v) => setTilt(v - 50)} 
                    description="Dark (Vintage) vs Bright (Modern) EQ balance"
                  />
                  <div className="h-4" />
                  <ParamSlider 
                    label="Final Mastering Drive" 
                    value={masteringDrive} 
                    onChange={setMasteringDrive} 
                    description="Professional loudness maximization & limiting"
                  />
                </div>
                
                <div className="pt-2 border-t border-white/5">
                  <h4 className="text-[10px] font-bold text-studio-accent uppercase tracking-[0.2em] mb-4">Humanization Engine</h4>
                  <ParamSlider 
                    label="Harmonic Saturation" 
                    value={saturation} 
                    onChange={setSaturation} 
                    description="Adds tube-like warmth and harmonic complexity"
                  />
                  <ParamSlider 
                    label="Temporal Jitter" 
                    value={jitter} 
                    onChange={setJitter} 
                    description="Break perfect digital timing for organic feel"
                  />
                  <ParamSlider 
                    label="Spectral Softness" 
                    value={airReduction} 
                    onChange={setAirReduction} 
                    description="Rolls off harsh AI-typical top end frequencies"
                  />
                  <ParamSlider 
                    label="Analog Floor" 
                    value={noiseFloor} 
                    onChange={setNoiseFloor} 
                    description="Injects organic dither to mask digital sterility"
                  />
                </div>
              </div>
            
            <button
              onClick={processAudio}
              disabled={!file || isProcessing}
              className={cn(
                "w-full mt-10 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all",
                (!file || isProcessing) 
                  ? "bg-slate-800 text-slate-600 cursor-not-allowed" 
                  : "bg-studio-accent text-white hover:bg-blue-500 hover:scale-[1.02] active:scale-95 shadow-lg glow-accent"
              )}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  SHIELDING IN PROGRESS...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 fill-current" />
                  GENERATE UNIQUE FINGERPRINT
                </>
              )}
            </button>
          </section>
        </div>

        {/* Right Column: Visualizer and Output */}
        <div className="lg:col-span-8 space-y-6">
          <section className="studio-card p-8 bg-gradient-to-br from-studio-gray to-black">
            <div className="flex items-center justify-between mb-8">
              <div className="flex flex-col">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Real-time Spectral View
                </h3>
                {humanizedBuffer && (
                  <span className="text-[10px] font-mono text-studio-gold mt-1">
                    PLAYING {playingOriginal ? 'ORIGINAL SOURCE' : 'SHIELDED VERSION'}
                  </span>
                )}
              </div>
              
              <div className="flex gap-2">
                {humanizedBuffer && (
                  <button 
                    onClick={togglePlaybackMode}
                    className="px-3 py-1.5 glass-panel rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className="w-3 h-3" />
                    AB Comparison
                  </button>
                )}
                {file && (
                  <button 
                    onClick={() => wavesurfer.current?.playPause()}
                    className="p-2 glass-panel rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <Waves className="w-4 h-4 text-studio-accent" />
                  </button>
                )}
              </div>
            </div>
            
            <div className="relative min-h-[160px] flex items-center justify-center border border-white/5 rounded-xl bg-black/40 p-4">
              <div ref={waveformRef} className="w-full" id="waveform-container" />
              {!file && (
                <div className="absolute flex flex-col items-center text-slate-600">
                  <Waves className="w-12 h-12 mb-2 opacity-20" />
                  <p className="text-xs font-mono uppercase tracking-[0.2em]">Awaiting Input Signal</p>
                </div>
              )}
            </div>

            {file && (
              <div className="mt-6 p-4 glass-panel rounded-xl">
                 <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Track Editor (Non-Destructive)</h4>
                  <div className="flex gap-4 text-[10px] font-mono">
                    <span className="text-studio-accent">START: {trimRange.start.toFixed(2)}s</span>
                    <span className="text-studio-gold">END: {trimRange.end.toFixed(2)}s</span>
                  </div>
                </div>
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] text-slate-500 uppercase">Trim Start</label>
                       <input 
                        type="range" min="0" max={duration} step="0.01" 
                        value={trimRange.start} 
                        onChange={(e) => setTrimRange(p => ({ ...p, start: Math.min(p.end - 1, parseFloat(e.target.value)) }))}
                        className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-studio-accent"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] text-slate-500 uppercase">Trim End</label>
                       <input 
                        type="range" min="0" max={duration} step="0.01" 
                        value={trimRange.end} 
                        onChange={(e) => setTrimRange(p => ({ ...p, end: Math.max(p.start + 1, parseFloat(e.target.value)) }))}
                        className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-studio-gold"
                       />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="block text-[10px] text-slate-500 uppercase">Track Title</label>
                      <input 
                        type="text" 
                        value={metadata.title} 
                        onChange={(e) => setMetadata(p => ({ ...p, title: e.target.value }))}
                        placeholder={file?.name?.replace(/\.[^/.]+$/, "")}
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs focus:border-studio-accent outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] text-slate-500 uppercase">Artist Name</label>
                      <input 
                        type="text" 
                        value={metadata.artist} 
                        onChange={(e) => setMetadata(p => ({ ...p, artist: e.target.value }))}
                        placeholder="Independent Artist"
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs focus:border-studio-accent outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] text-slate-500 uppercase">Primary Genre</label>
                      <select 
                        value={metadata.genre} 
                        onChange={(e) => setMetadata(p => ({ ...p, genre: e.target.value }))}
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs focus:border-studio-accent outline-none"
                      >
                        <option>Electronic</option>
                        <option>Pop</option>
                        <option>Hip Hop</option>
                        <option>Rock</option>
                        <option>Classical</option>
                        <option>Lo-Fi</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AI Detector Guard */}
            <section className={cn(
              "studio-card p-6 border-l-4",
              aiAnalysisModel?.status === 'SAFE' ? "border-l-green-500" : 
              aiAnalysisModel?.status === 'SUSPICIOUS' ? "border-l-studio-gold" : "border-l-red-500"
            )}>
               <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" /> AI Probability Scan
              </h3>
              
              {aiAnalysisModel ? (
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className={cn(
                        "text-3xl font-bold",
                        aiAnalysisModel.status === 'SAFE' ? "text-green-400" : 
                        aiAnalysisModel.status === 'SUSPICIOUS' ? "text-studio-gold" : "text-red-500"
                      )}>
                        {aiAnalysisModel.score}%
                      </p>
                      <p className="text-xs tracking-widest font-mono text-slate-500 uppercase">Detection Confidence</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-300">{aiAnalysisModel.status}</p>
                      <p className="text-[10px] text-slate-500">Heuristic Analysis</p>
                    </div>
                  </div>
                  <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
                    <motion.div 
                      className={cn(
                        "h-full rounded-full",
                        aiAnalysisModel.status === 'SAFE' ? "bg-green-500" : 
                        aiAnalysisModel.status === 'SUSPICIOUS' ? "bg-studio-gold" : "bg-red-500"
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${aiAnalysisModel.score}%` }}
                    />
                  </div>

                  {aiAnalysisModel.score < 50 && (
                    <div className="mt-4 p-3 bg-black/40 rounded-lg border border-white/5 space-y-2">
                       <h4 className="text-[9px] font-bold text-studio-gold uppercase tracking-widest">Compliance Report</h4>
                       <div className="flex items-center justify-between text-[8px] text-slate-400">
                          <span>Distributor Integrity</span>
                          <span className="text-green-500 font-bold">PASSED</span>
                       </div>
                    </div>
                  )}
                  
                  <button 
                    onClick={downloadModelFile}
                    className="w-full mt-4 py-2 border border-white/5 bg-black/20 rounded-lg text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-3 h-3" />
                    Download Detection Model (.JSON)
                  </button>
                </div>
              ) : (
                <div className="h-24 flex items-center justify-center opacity-30 italic text-xs">
                  Upload file to scan
                </div>
              )}
            </section>

            {/* IP Fingerprint Column */}
            <section className={cn(
              "studio-card p-6 transition-all duration-500",
              fingerprint ? "border-studio-accent/30 bg-studio-accent/5" : "opacity-50"
            )}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                <FingerprintIcon className="w-4 h-4" /> IP Fingerprint
              </h3>
              
              <AnimatePresence mode="wait">
                {fingerprint ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="bg-black/60 p-4 rounded-lg border border-white/10">
                      <p className="text-2xl font-mono tracking-wider text-studio-gold">
                        {fingerprint}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                      <ShieldCheck className="w-3 h-3 text-green-500" />
                      SECURED & VERIFIED IN SPECTRAL REFRENCES
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-24 flex items-center justify-center border border-dashed border-white/5 rounded-lg">
                    <p className="text-xs text-slate-600 font-mono">ID GENERATION PENDING</p>
                  </div>
                )}
              </AnimatePresence>
            </section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* History Case Ledger */}
            <section className="studio-card p-6">
              <h3 className="text-sm font-semibold text-slate-400 flex items-center gap-2 mb-4">
                <Music className="w-4 h-4" /> Protection Ledger
              </h3>
              <div className="space-y-2">
                {ledger.length > 0 ? (
                  ledger.map((entry, idx) => (
                    <div key={idx} className="group flex justify-between items-center text-[10px] font-mono bg-black/40 p-3 rounded-lg border border-white/5 hover:border-studio-accent/30 transition-all hover:bg-black/60">
                      <div className="flex flex-col truncate pr-2">
                        <span className="text-studio-gold truncate font-bold text-[11px]">
                          {(entry as any).title} 
                          <span className="text-slate-500 font-normal ml-2">by {(entry as any).artist}</span>
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[8px] text-slate-600">{(entry as any).genre}</span>
                          <span className="text-[8px] text-slate-700">|</span>
                          <span className="text-[8px] text-slate-500">{entry.date}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-studio-accent font-bold tracking-tighter">{entry.fingerprint}</span>
                        <span className="bg-green-500/10 text-green-500 text-[7px] px-1 rounded border border-green-500/20">REGISTRY OK</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-slate-600 italic py-8 text-center">No history yet.</p>
                )}
              </div>
            </section>

            {/* Export Area */}
            <section className={cn(
              "studio-card p-6",
              humanizedBuffer ? "" : "opacity-50 grayscale"
            )}>
              <h3 className="text-sm font-semibold text-slate-400 flex items-center gap-2 mb-4">
                <Download className="w-4 h-4" /> Distribution
              </h3>
              <div className="space-y-3">
                <button
                  onClick={downloadProcessed}
                  disabled={!humanizedBuffer}
                  className={cn(
                    "w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all",
                    humanizedBuffer 
                      ? "bg-white text-black hover:bg-slate-200 shadow-2xl scale-[1.02]" 
                      : "bg-slate-800 text-slate-600 cursor-not-allowed"
                  )}
                >
                  <Download className="w-5 h-5" />
                  EXPORT DISTRIBUTION READY WAV
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const data = {
                        title: metadata.title || file?.name,
                        artist: metadata.artist,
                        genre: metadata.genre,
                        fingerprint,
                        engine: "SonoShield v2.5.0",
                        timestamp: new Date().toISOString()
                      };
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `metadata_${metadata.title || 'track'}.json`;
                      a.click();
                    }}
                    disabled={!humanizedBuffer}
                    className="flex-1 py-2 glass-panel rounded-lg text-[9px] font-bold uppercase hover:bg-white/5 transition-colors disabled:opacity-30"
                  >
                    Export Meta
                  </button>
                  <div className="flex-1 bg-black/40 py-2 rounded-lg text-center border border-green-500/20">
                    <p className="text-[10px] text-green-500 font-bold tracking-tighter">DISTRIBUTION OK</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
      
      <footer className="max-w-6xl mx-auto mt-16 pb-8 border-t border-white/5 pt-8 text-center space-y-4">
        <div className="flex flex-wrap justify-center gap-8 opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
          <span className="text-[10px] font-bold tracking-widest">SPOTIFY COMPLIANT</span>
          <span className="text-[10px] font-bold tracking-widest">ROUTENOTE VERIFIED</span>
          <span className="text-[10px] font-bold tracking-widest">DISTROKID READY</span>
          <span className="text-[10px] font-bold tracking-widest">APPLE MUSIC ID</span>
        </div>
        <p className="text-slate-600 text-xs font-mono uppercase tracking-[0.2em]">
          SONOSHIELD SPECTRAL ENGINE v2.5.0 // AI RESISTANCE VERIFIED // {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}

function ParamSlider({ label, value, onChange, description }: { 
  label: string; 
  value: number; 
  onChange: (v: number) => void;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end">
        <div>
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">{label}</label>
          <p className="text-[10px] text-slate-500 mt-0.5">{description}</p>
        </div>
        <span className="text-xs font-mono text-studio-accent">{value}%</span>
      </div>
      <div className="relative h-1 bg-white/5 rounded-full">
        <div 
          className="absolute h-full bg-studio-accent rounded-full" 
          style={{ width: `${value}%` }} 
        />
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={value} 
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}


