/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Upload, 
  X, 
  Search, 
  Scan, 
  Info, 
  Loader2, 
  ChevronRight,
  Maximize2,
  Trash2,
  RefreshCw,
  Volume2,
  VolumeX,
  CameraOff
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { detectObjects, Detection, DetectionResult } from './services/geminiService';
import { cn } from '@/lib/utils';

interface TrackedObject extends Detection {
  id: string;
  color: string;
  firstSeen: number;
  lastSeen: number;
}

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
];

export default function App() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isContinuous, setIsContinuous] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [trackedObjects, setTrackedObjects] = useState<TrackedObject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isApiOperational, setIsApiOperational] = useState<boolean | null>(null);
  const [lastUpdateAttempt, setLastUpdateAttempt] = useState<number>(0);
  const lastSpokenRef = useRef<string>("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const continuousTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Sync stream to video element whenever it changes or capture starts
  useEffect(() => {
    if (isCapturing && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(e => console.error("Video play failed", e));
      };
    }
  }, [isCapturing, cameraStream]);

  // Continuous scanning logic
  useEffect(() => {
    if (isContinuous && isCapturing && !isAnalyzing) {
      continuousTimerRef.current = setTimeout(() => {
        autoCaptureAndAnalyze();
      }, 2000); // Scan more frequently (every 2 seconds)
    } else if (!isContinuous) {
      if (continuousTimerRef.current) clearTimeout(continuousTimerRef.current);
    }
    return () => {
      if (continuousTimerRef.current) clearTimeout(continuousTimerRef.current);
    };
  }, [isContinuous, isCapturing, isAnalyzing]);

  // Voice Feedback logic
  useEffect(() => {
    if (isVoiceEnabled && result?.description && result.description !== lastSpokenRef.current) {
      const utterance = new SpeechSynthesisUtterance(result.description);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.cancel(); // Stop current speech
      window.speechSynthesis.speak(utterance);
      lastSpokenRef.current = result.description;
    }
  }, [result, isVoiceEnabled]);

  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false 
      });
      
      setCameraStream(stream);
      setIsCapturing(true);
      setIsContinuous(true); // START SCANNING IMMEDIATELY
      setResult(null);
      setSelectedImage(null);
    } catch (err) {
      console.error(err);
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError("Camera permission denied. Please allow camera access in your browser settings.");
      } else {
        setError("Could not access camera. Ensure you are on a secure connection and have a camera connected.");
      }
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCapturing(false);
    setIsContinuous(false);
    if (continuousTimerRef.current) clearTimeout(continuousTimerRef.current);
  };

  const autoCaptureAndAnalyze = () => {
    if (videoRef.current && canvasRef.current && isCapturing) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Resize for faster processing while maintaining aspect ratio
      const maxWidth = 800;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        analyzeImage(dataUrl, true);
      }
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setSelectedImage(dataUrl);
        stopCamera();
        analyzeImage(dataUrl);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setSelectedImage(dataUrl);
        setResult(null);
        setError(null);
        analyzeImage(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async (dataUrl: string, isFromContinuous = false) => {
    setLastUpdateAttempt(Date.now());
    if (!isFromContinuous) setIsAnalyzing(true);
    else setIsAnalyzing(true); // Still show analysis state for UI feedback
    
    setError(null);
    try {
      const base64 = dataUrl.split(',')[1];
      const mimeType = dataUrl.split(';')[0].split(':')[1];
      const detectionResult = await detectObjects(base64, mimeType);
      
      setResult(detectionResult);
      setIsApiOperational(true);
      
// TRACKING LOGIC: Match new detections with existing tracked objects
      setTrackedObjects(prev => {
        const now = Date.now();
        const updatedTracked: TrackedObject[] = [];
        const currentDetectionIndices = new Set<number>();

        // 1. Proximity Match (High Confidence)
        const trackers = [...prev];
        
        // Find best proximity matches first
        trackers.forEach(tracked => {
          let bestMatchIdx = -1;
          let minDistance = 150; // Tighter threshold for proximity

          detectionResult.detections.forEach((det, idx) => {
            if (currentDetectionIndices.has(idx)) return;
            if (det.label.toLowerCase() !== tracked.label.toLowerCase()) return;

            const detCenter = [(det.box_2d[0] + det.box_2d[2]) / 2, (det.box_2d[1] + det.box_2d[3]) / 2];
            const trackCenter = [(tracked.box_2d[0] + tracked.box_2d[2]) / 2, (tracked.box_2d[1] + tracked.box_2d[3]) / 2];
            const dist = Math.sqrt(Math.pow(detCenter[0] - trackCenter[0], 2) + Math.pow(detCenter[1] - trackCenter[1], 2));

            if (dist < minDistance) {
              minDistance = dist;
              bestMatchIdx = idx;
            }
          });

          if (bestMatchIdx !== -1) {
            currentDetectionIndices.add(bestMatchIdx);
            updatedTracked.push({
              ...tracked,
              box_2d: detectionResult.detections[bestMatchIdx].box_2d,
              lastSeen: now
            });
          }
        });

        // 2. Re-Identification Match (Visual Similarity Heuristics: Size & Ratio)
        // Check unmatched detections against "lost" objects
        detectionResult.detections.forEach((det, detIdx) => {
          if (currentDetectionIndices.has(detIdx)) return;

          let bestReidIdx = -1;
          let minScore = 0.4; // Similarity Threshold

          trackers.forEach((tracked, trackIdx) => {
            // Skip if already updated this turn or if it was just seen (proximity should have caught it)
            if (updatedTracked.some(ut => ut.id === tracked.id)) return;
            if (det.label.toLowerCase() !== tracked.label.toLowerCase()) return;

            // Attribute comparison
            const detW = det.box_2d[3] - det.box_2d[1];
            const detH = det.box_2d[2] - det.box_2d[0];
            const trackW = tracked.box_2d[3] - tracked.box_2d[1];
            const trackH = tracked.box_2d[2] - tracked.box_2d[0];

            const detArea = detW * detH;
            const trackArea = trackW * trackH;
            const detRatio = detW / (detH || 1);
            const trackRatio = trackW / (trackH || 1);

            const areaDiff = Math.abs(detArea - trackArea) / Math.max(detArea, trackArea);
            const ratioDiff = Math.abs(detRatio - trackRatio) / Math.max(detRatio, trackRatio);

            const similarityScore = areaDiff + ratioDiff;

            if (similarityScore < minScore) {
              minScore = similarityScore;
              bestReidIdx = trackIdx;
            }
          });

          if (bestReidIdx !== -1) {
            currentDetectionIndices.add(detIdx);
            const reconciled = trackers[bestReidIdx];
            updatedTracked.push({
              ...reconciled,
              box_2d: det.box_2d,
              lastSeen: now
            });
          }
        });

        // 3. New Objects
        detectionResult.detections.forEach((det, idx) => {
          if (currentDetectionIndices.has(idx)) return;
          
          updatedTracked.push({
            ...det,
            id: `obj-${Math.random().toString(36).substr(2, 9)}`,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            firstSeen: now,
            lastSeen: now
          });
        });

        // Final cleanup: Keep seen or recently lost trackers (TTL: 15 seconds for Re-ID bank)
        // Objects not in current frame are preserved in state but not rendered if they are "old"
        return updatedTracked.concat(
          trackers.filter(t => !updatedTracked.find(ut => ut.id === t.id) && (now - t.lastSeen < 15000))
        );
      });

    } catch (err) {
      console.error(err);
      setIsApiOperational(false);
      if (!isFromContinuous) setError("Analysis service unavailable. Check API Key configuration.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setSelectedImage(null);
    setResult(null);
    setError(null);
    setIsContinuous(false);
    stopCamera();
  };

  // Helper to convert normalized coordinates [ymin, xmin, ymax, xmax] to pixels
  const getBoxStyles = (box: [number, number, number, number]) => {
    const [ymin, xmin, ymax, xmax] = box;
    return {
      top: `${ymin / 10}%`,
      left: `${xmin / 10}%`,
      width: `${(xmax - xmin) / 10}%`,
      height: `${(ymax - ymin) / 10}%`,
    };
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans mask-lines relative overflow-x-hidden">
      {/* Decorative Blur */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen flex-col p-6 lg:p-12">
        <header className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-start lg:mb-20">
          <div className="flex flex-col">
            <span className="mb-1 font-mono text-[10px] tracking-[0.3em] text-blue-500 uppercase">
              Edge-Native Inference
            </span>
            <div className="text-4xl font-black italic tracking-tighter uppercase sm:text-5xl">
              Vision<span className="text-blue-500">.</span>AI
            </div>
          </div>
          <nav className="flex gap-6 pt-2 font-mono text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase sm:gap-8">
            <div 
              className={cn("flex items-center gap-2 cursor-pointer transition-colors hover:text-white", isVoiceEnabled ? "text-blue-500" : "text-zinc-500")}
              onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
            >
              {isVoiceEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
              <span>Voice {isVoiceEnabled ? "On" : "Off"}</span>
            </div>
            <span className="cursor-pointer transition-colors hover:text-white">Metrics</span>
            <span className="text-white">Live-Feed</span>
          </nav>
        </header>

        <main className="grid flex-grow gap-12 lg:grid-cols-12 lg:items-start">
          {/* Main Title & Action (Left/Upper) */}
          <div className="flex flex-col lg:col-span-12 xl:col-span-4">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 text-[60px] font-black leading-[0.85] tracking-tighter uppercase sm:text-[90px] xl:text-[110px]"
            >
              Identify <br />
              <span className="text-blue-500">Fast.</span> <br />
              Analyze.
            </motion.h1>
            <p className="max-w-md font-medium leading-snug text-zinc-400 sm:text-lg">
              Low-latency AI scene analysis powered by Gemini 1.5 Flash. Real-time identification of complex environments.
            </p>
            
            <div className="mt-8 flex flex-wrap gap-4">
              {!isCapturing && (
                <Button 
                  onClick={startCamera}
                  className="h-auto rounded-none bg-white px-8 py-5 text-sm font-black text-black uppercase tracking-widest hover:bg-zinc-200"
                >
                  <Camera className="mr-3 h-5 w-5" />
                  Launch Scanner
                </Button>
              )}
              <Button 
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="h-auto rounded-none border-zinc-800 bg-transparent px-8 py-5 text-sm font-black uppercase tracking-widest text-white hover:bg-zinc-900"
              >
                <Upload className="mr-3 h-5 w-5" />
                Upload Data
              </Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="image/*" 
                className="hidden" 
              />
            </div>

            {/* Inference Metadata (Hidden on small) */}
            <footer className="mt-16 hidden border-t border-zinc-900 pt-8 xl:block">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col">
                  <span className="mb-2 text-[10px] font-bold text-zinc-600 uppercase">Engine Architecture</span>
                  <div className="text-sm font-bold tracking-tight uppercase">YOLO-GEMINI-FLASH v1.5</div>
                </div>
                <div className="flex flex-col">
                  <span className="mb-2 text-[10px] font-bold text-zinc-600 uppercase">Detection Status</span>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-2 w-2 rounded-full", 
                      isContinuous ? "bg-red-500 animate-pulse" : "bg-emerald-500",
                      isApiOperational === false && "bg-amber-500"
                    )} />
                    <span className="text-sm font-bold tracking-tight">
                      {isApiOperational === false ? "CONNECTION_ERROR" : isContinuous ? "STREAMING_MODE" : "STANDBY"}
                    </span>
                  </div>
                </div>
              </div>
            </footer>
          </div>

          {/* Visual Workspace (Middle/Right) */}
          <div className="lg:col-span-7 xl:col-span-5">
            <div className="glow-border relative aspect-square overflow-hidden border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sm:rounded-2xl">
              {!selectedImage && !isCapturing && (
                <div className="flex h-full w-full items-center justify-center border-2 border-dashed border-zinc-800">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <Scan className="h-12 w-12 text-zinc-700" />
                    <span className="font-mono text-[10px] tracking-widest text-zinc-600 uppercase">Awaiting Visual Input</span>
                  </div>
                </div>
              )}

              {isCapturing && (
                <div className="relative h-full w-full">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="h-full w-full object-cover" 
                  />
                  
                  {/* Bounding Boxes Over Video - Using Tracked Objects (only those recently seen) */}
                  <AnimatePresence mode="popLayout">
                    {trackedObjects
                      .filter(obj => Date.now() - obj.lastSeen < 2500) // Only show if recently detected
                      .map((obj) => {
                        const isReidentified = Date.now() - obj.firstSeen > 10000;
                        return (
                          <motion.div
                            key={obj.id}
                            layoutId={isContinuous ? obj.id : undefined}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ 
                              opacity: 1, 
                              scale: 1,
                              ...getBoxStyles(obj.box_2d)
                            }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="absolute border-2"
                            style={{ borderColor: obj.color }}
                          >
                            <div 
                              className="absolute -top-6 left-0 flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5 font-mono text-[10px] font-black text-white uppercase shadow-lg transition-colors"
                              style={{ backgroundColor: obj.color }}
                            >
                              <div className={cn("h-1.5 w-1.5 rounded-full bg-white", isReidentified ? "animate-ping" : "animate-pulse")} />
                              {obj.label}
                              <span className="opacity-60">#{obj.id.slice(-4)}</span>
                              {isReidentified && (
                                <span className="ml-1 rounded-sm bg-white/20 px-1 text-[8px] font-bold">RE-ID</span>
                              )}
                            </div>
                            
                            {/* Target Corner Decorators */}
                            <div className="absolute top-0 left-0 h-2 w-2 border-t-2 border-l-2" style={{ borderColor: 'white' }} />
                            <div className="absolute top-0 right-0 h-2 w-2 border-t-2 border-r-2" style={{ borderColor: 'white' }} />
                            <div className="absolute bottom-0 left-0 h-2 w-2 border-b-2 border-l-2" style={{ borderColor: 'white' }} />
                            <div className="absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2" style={{ borderColor: 'white' }} />
                          </motion.div>
                        );
                      })}
                  </AnimatePresence>

                  <div className="absolute top-4 left-4 flex items-center gap-2 border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-md">
                    <div className={cn("h-2 w-2 rounded-full", isContinuous ? "bg-red-500 animate-pulse" : "bg-blue-500")} />
                    <span className="font-mono text-[10px] tracking-wider uppercase">Live: {isContinuous ? "Stream Analysis" : "Camera Active"}</span>
                  </div>
                </div>
              )}

              {selectedImage && (
                <div className="relative h-full w-full">
                  <img src={selectedImage} alt="Analysis Target" className="h-full w-full object-contain" />
                  
                  {!isAnalyzing && trackedObjects.map((obj) => (
                    <motion.div
                      key={obj.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ 
                        opacity: 1, 
                        scale: 1,
                        ...getBoxStyles(obj.box_2d)
                      }}
                      className="absolute border-2"
                      style={{ borderColor: obj.color }}
                    >
                      <div 
                        className="absolute -top-6 left-0 px-2 py-0.5 font-mono text-[10px] font-black text-white uppercase shadow-lg"
                        style={{ backgroundColor: obj.color }}
                      >
                        {obj.label}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {isAnalyzing && !isContinuous && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="h-12 w-12 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  <span className="mt-4 font-mono text-[10px] font-bold tracking-[0.3em] text-white uppercase">Analyzing Frame</span>
                </div>
              )}

              {/* Bottom Analysis Stats Card */}
              <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-white/10 bg-black/80 p-4 backdrop-blur-md">
                <div className="mb-2 flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">Detection_Status</span>
                  <span className="font-mono text-[10px] text-blue-400">
                    {isAnalyzing ? "Processing..." : result ? "Analysis Complete" : "Standby"}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: isAnalyzing ? "100%" : result ? "94%" : "0%" }}
                    transition={{ duration: isAnalyzing ? 1.5 : 0.5 }}
                    className={cn("h-full", isAnalyzing ? "bg-blue-600" : "bg-blue-500")}
                  />
                </div>
              </div>
            </div>

            {/* Controls Row */}
            {isCapturing && (
              <div className="mt-4 flex gap-2">
                <Button 
                  onClick={capturePhoto}
                  className="flex-grow rounded-none bg-white py-6 font-black text-black uppercase tracking-widest hover:bg-zinc-200"
                >
                  Capture Frame
                </Button>
                <Button 
                  onClick={() => setIsContinuous(!isContinuous)}
                  className={cn(
                    "flex-grow rounded-none py-6 font-black uppercase tracking-widest transition-all",
                    isContinuous ? "bg-red-600 text-white" : "border-zinc-800 bg-transparent text-white hover:bg-zinc-900 border"
                  )}
                >
                  {isContinuous ? "Stop Stream" : "Continuous Mode"}
                </Button>
                <Button 
                  onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                  variant="outline"
                  className={cn(
                    "rounded-none border-zinc-800 py-6 px-4 transition-all",
                    isVoiceEnabled ? "bg-blue-600/10 text-blue-500" : "text-zinc-500"
                  )}
                >
                  {isVoiceEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </Button>
                <Button 
                  onClick={stopCamera}
                  variant="outline"
                  className="rounded-none border-zinc-800 py-6 text-zinc-500 hover:bg-zinc-900 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            )}
            
            {selectedImage && !isAnalyzing && (
              <Button 
                onClick={reset}
                variant="outline"
                className="mt-4 w-full rounded-none border-zinc-800 py-6 font-black uppercase tracking-widest text-zinc-500 hover:bg-zinc-900 hover:text-white"
              >
                Clear Scene
              </Button>
            )}
          </div>

          {/* Detailed Results (Right) */}
          <div className="lg:col-span-5 xl:col-span-3">
            <div className="space-y-8 rounded-2xl border border-zinc-800 bg-black p-8">
              <header className="flex items-center justify-between">
                <h3 className="font-mono text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Scene_Summary</h3>
                {result && (
                  <Badge className="rounded-none bg-blue-600/10 text-blue-500 hover:bg-blue-600/10">
                    {result.detections.length} objects
                  </Badge>
                )}
              </header>

              <div className="space-y-6">
                {(isAnalyzing && !result) ? (
                  <div className="space-y-4 py-12 opacity-20">
                    <div className="h-4 w-full bg-zinc-800" />
                    <div className="h-4 w-3/4 bg-zinc-800" />
                    <div className="h-4 w-5/6 bg-zinc-800" />
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex items-center justify-between border-b border-zinc-900 pb-2">
                      <span className="font-mono text-[9px] text-zinc-600 uppercase">Latency Verification</span>
                      <span className="font-mono text-[9px] text-zinc-500">
                        {lastUpdateAttempt > 0 ? `Synced ${Math.floor((Date.now() - lastUpdateAttempt) / 1000)}s ago` : "Waiting for stream..."}
                      </span>
                    </div>

                    {isApiOperational === false && (
                      <div className="mb-6 border-l-2 border-amber-500 bg-amber-500/5 p-4 text-xs font-bold text-amber-500">
                        API CONNECTION FAILED. <br/>
                        <span className="text-[10px] font-normal opacity-80 uppercase tracking-tighter">Please ensure GEMINI_API_KEY is configured in the environment settings.</span>
                      </div>
                    )}

                    <p className="text-sm font-medium leading-relaxed text-zinc-300">
                      {result?.description || "Awaiting first analysis frame to describe the scene..."}
                    </p>
                    
                    <div className="space-y-3">
                      {trackedObjects
                        .filter(obj => Date.now() - obj.lastSeen < 4000) // Relaxed filter for smoother list presentation
                        .map((obj, i) => {
                          const isReidentified = Date.now() - obj.firstSeen > 10000;
                          return (
                            <div key={obj.id} className="group flex items-center justify-between border-b border-zinc-900 pb-3 transition-colors hover:border-zinc-700">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-[10px] text-zinc-700 uppercase">Obj_{i+1}</span>
                                <div className="flex flex-col">
                                  <span className="font-medium uppercase tracking-tight text-white">{obj.label}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[9px] text-zinc-500">#{obj.id.slice(-4)}</span>
                                    {isReidentified && (
                                      <span className="rounded-[2px] bg-blue-500/10 px-1 font-mono text-[8px] text-blue-400">MEMORY_RESTORED</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div 
                                className="h-2 w-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" 
                                style={{ backgroundColor: obj.color }} 
                              />
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Hidden Canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
