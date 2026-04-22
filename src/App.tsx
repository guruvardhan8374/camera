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
  CameraOff
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { detectObjects, Detection, DetectionResult } from './services/geminiService';
import { cn } from '@/lib/utils';

export default function App() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isContinuous, setIsContinuous] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
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
    if (!isFromContinuous) setIsAnalyzing(true);
    else setIsAnalyzing(true); // Still show analysis state for UI feedback
    
    setError(null);
    try {
      const base64 = dataUrl.split(',')[1];
      const mimeType = dataUrl.split(';')[0].split(':')[1];
      const detectionResult = await detectObjects(base64, mimeType);
      setResult(detectionResult);
    } catch (err) {
      console.error(err);
      if (!isFromContinuous) setError("Failed to analyze image. Please try again.");
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
            <span className="cursor-pointer transition-colors hover:text-white">Active</span>
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
                    <div className={cn("h-2 w-2 rounded-full", isContinuous ? "bg-red-500 animate-pulse" : "bg-emerald-500")} />
                    <span className="text-sm font-bold tracking-tight">{isContinuous ? "STREAMING_MODE" : "STANDBY"}</span>
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
                  
                  {/* Bounding Boxes Over Video */}
                  <AnimatePresence>
                    {result?.detections.map((detection, idx) => (
                      <motion.div
                        key={`${detection.label}-${idx}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute border-2 border-blue-500"
                        style={getBoxStyles(detection.box_2d)}
                      >
                        <div className="absolute -top-6 left-0 bg-blue-500 px-2 py-0.5 font-mono text-[10px] font-black text-white uppercase">
                          {detection.label}
                        </div>
                      </motion.div>
                    ))}
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
                  
                  {!isAnalyzing && result?.detections.map((detection, idx) => (
                    <motion.div
                      key={`${detection.label}-${idx}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute border-2 border-blue-500"
                      style={getBoxStyles(detection.box_2d)}
                    >
                      <div className="absolute -top-6 left-0 bg-blue-500 px-2 py-0.5 font-mono text-[10px] font-black text-white uppercase">
                        {detection.label}
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
                {(isAnalyzing || !result) ? (
                  <div className="space-y-4 py-12 opacity-20">
                    <div className="h-4 w-full bg-zinc-800" />
                    <div className="h-4 w-3/4 bg-zinc-800" />
                    <div className="h-4 w-5/6 bg-zinc-800" />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium leading-relaxed text-zinc-300">
                      {result.description}
                    </p>
                    
                    <div className="space-y-3">
                      {result.detections.map((d, i) => (
                        <div key={i} className="group flex items-center justify-between border-b border-zinc-900 pb-3 transition-colors hover:border-zinc-700">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-[10px] text-zinc-700 uppercase">Obj_{i+1}</span>
                            <span className="font-medium uppercase tracking-tight text-white">{d.label}</span>
                          </div>
                          <div className="h-1.5 w-1.5 rounded-full bg-blue-500 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      ))}
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
