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

  // Continuous scanning logic
  useEffect(() => {
    if (isContinuous && isCapturing && !isAnalyzing) {
      continuousTimerRef.current = setTimeout(() => {
        autoCaptureAndAnalyze();
      }, 3000); // Scan every 3 seconds
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCapturing(true);
        setResult(null);
        setSelectedImage(null);
      }
    } catch (err) {
      console.error(err);
      setError("Could not access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
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
    <div className="min-h-screen bg-[#F5F5F0] font-sans text-[#141414] selection:bg-[#141414] selection:text-[#F5F5F0]">
      <header className="sticky top-0 z-50 border-b border-[#141414]/10 bg-[#F5F5F0]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#141414] text-[#F5F5F0]">
              <Scan className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Vision AI</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-[#141414]/20 font-mono text-[10px] uppercase tracking-wider">
              Gemini 1.5 Flash
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Main Workspace */}
          <div className="lg:col-span-8">
            <Card className="overflow-hidden border-[#141414]/10 bg-white shadow-xl shadow-black/5">
              <CardContent className="p-0">
                <div 
                  ref={containerRef}
                  className="relative aspect-video w-full overflow-hidden bg-[#141414]/5 md:aspect-[4/3] lg:aspect-[16/10]"
                >
                  {!selectedImage && !isCapturing && (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8 text-center">
                      <div className="relative">
                        <div className="absolute -inset-4 rounded-full bg-[#141414]/5" />
                        <Camera className="relative h-12 w-12 opacity-40" />
                      </div>
                      <div className="max-w-sm space-y-2">
                        <h3 className="text-lg font-medium">Point & Detect</h3>
                        <p className="text-sm text-[#141414]/60">
                          Show me some objects. I will identify them using real-time scene analysis.
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-4">
                        <Button 
                          onClick={() => fileInputRef.current?.click()}
                          variant="outline"
                          className="border-[#141414]/20 hover:bg-[#141414] hover:text-[#F5F5F0]"
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Upload Photo
                        </Button>
                        <Button 
                          onClick={startCamera}
                          className="bg-[#141414] text-[#F5F5F0] hover:bg-[#141414]/90"
                        >
                          <Camera className="mr-2 h-4 w-4" />
                          Launch Live Camera
                        </Button>
                      </div>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept="image/*" 
                        className="hidden" 
                      />
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

                      {/* Overlays on Live Video */}
                      <AnimatePresence>
                        {result?.detections.map((detection, idx) => (
                          <motion.div
                            key={`${detection.label}-${idx}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute border-2 border-[#141414] transition-all hover:bg-[#141414]/10"
                            style={getBoxStyles(detection.box_2d)}
                          >
                            <div className="absolute -top-6 left-0 flex items-center gap-1.5 whitespace-nowrap bg-[#141414] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#F5F5F0]">
                              {detection.label}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>

                      {isAnalyzing && (
                        <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-[#141414] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#F5F5F0]">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Scanning Scene...
                        </div>
                      )}

                      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-4">
                        <div className="flex items-center gap-4 rounded-full bg-black/20 p-2 backdrop-blur-xl">
                          <Button 
                            size="icon" 
                            onClick={stopCamera}
                            variant="ghost"
                            className="h-12 w-12 rounded-full text-white hover:bg-white/10"
                          >
                            <CameraOff className="h-5 w-5" />
                          </Button>
                          
                          <div className="h-12 w-px bg-white/10" />

                          <Button 
                            size="lg" 
                            onClick={capturePhoto}
                            className="h-14 w-14 rounded-full bg-white text-black hover:bg-white/90"
                          >
                            <div className="h-10 w-10 rounded-full border-2 border-black" />
                          </Button>

                          <div className="h-12 w-px bg-white/10" />

                          <Button 
                            onClick={() => setIsContinuous(!isContinuous)}
                            variant={isContinuous ? "default" : "ghost"}
                            className={cn(
                              "h-12 px-6 rounded-full text-xs font-bold uppercase tracking-widest transition-all",
                              isContinuous ? "bg-white text-black" : "text-white hover:bg-white/10"
                            )}
                          >
                            {isContinuous ? (
                              <div className="flex items-center gap-2">
                                <span className="flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
                                Continuous ON
                              </div>
                            ) : (
                              "Auto Scan"
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedImage && (
                    <div className="relative h-full w-full transition-all">
                      <img 
                        src={selectedImage} 
                        alt="Selected" 
                        className="h-full w-full object-contain" 
                      />
                      
                      {/* Bounding Boxes */}
                      {!isAnalyzing && result?.detections.map((detection, idx) => (
                        <motion.div
                          key={`${detection.label}-${idx}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="absolute border-2 border-[#141414] transition-all hover:bg-[#141414]/5"
                          style={getBoxStyles(detection.box_2d)}
                        >
                          <div className="absolute -top-6 left-0 flex items-center gap-1.5 whitespace-nowrap bg-[#141414] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#F5F5F0]">
                            {detection.label}
                          </div>
                        </motion.div>
                      ))}

                      <div className="absolute top-4 right-4 flex gap-2">
                        <Button 
                          size="icon" 
                          variant="outline" 
                          onClick={reset}
                          className="h-10 w-10 border-white/20 bg-black/20 text-white backdrop-blur-md hover:bg-black/40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {isAnalyzing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-[2px]">
                          <Loader2 className="h-8 w-8 animate-spin text-[#141414]" />
                          <p className="mt-4 text-sm font-medium uppercase tracking-widest text-[#141414]">Analyzing Post-Capture...</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-full border border-[#141414]/10 bg-white px-4 py-2 text-xs font-medium">
                <Info className="h-3.5 w-3.5 text-[#141414]/40" />
                <span>Status: {isContinuous ? 'Auto-Scanning' : isCapturing ? 'Live Feed' : 'Idle'}</span>
              </div>
              {selectedImage && !isAnalyzing && (
                <Button 
                  onClick={() => analyzeImage(selectedImage)} 
                  variant="ghost" 
                  size="sm"
                  className="gap-2 text-xs font-medium hover:bg-[#141414]/5"
                >
                  <RefreshCw className="h-3 w-3" />
                  Request Deep Scan
                </Button>
              )}
            </div>
          </div>

          {/* Side Panel: Results */}
          <div className="lg:col-span-4">
            <Card className="h-fit border-[#141414]/10 bg-white shadow-xl shadow-black/5">
              <CardHeader className="p-6">
                <CardTitle className="text-xl font-semibold italic text-[#141414]/90 font-serif">Results & Insights</CardTitle>
                <CardDescription className="font-mono text-[11px] uppercase tracking-tighter">
                  Scene Analysis Engine
                </CardDescription>
              </CardHeader>
              <Separator className="bg-[#141414]/5" />
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="p-6">
                    {error && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                        {error}
                      </div>
                    )}

                    {!result && !isAnalyzing && !error && (
                      <div className="flex h-[300px] flex-col items-center justify-center gap-4 text-center opacity-40">
                        <Search className="h-8 w-8" />
                        <p className="text-sm">Analysis results will appear here after scanning.</p>
                      </div>
                    )}

                    {isAnalyzing && (
                      <div className="space-y-4">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className="animate-pulse space-y-2">
                            <div className="h-4 w-2/3 rounded bg-[#141414]/5" />
                            <div className="h-8 w-full rounded bg-[#141414]/5" />
                          </div>
                        ))}
                      </div>
                    )}

                    {result && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <section>
                          <h4 className="mb-3 font-serif text-sm font-medium italic opacity-60">Overview</h4>
                          <p className="text-sm leading-relaxed text-[#141414]/80">
                            {result.description}
                          </p>
                        </section>

                        <Separator className="bg-[#141414]/5" />

                        <section>
                          <div className="mb-4 flex items-center justify-between">
                            <h4 className="font-serif text-sm font-medium italic opacity-60">Detected Objects</h4>
                            <Badge variant="secondary" className="bg-[#141414]/5 text-[10px] text-[#141414]/60">
                              {result.detections.length} IDENTIFIED
                            </Badge>
                          </div>
                          <div className="grid gap-2">
                            {result.detections.map((d, index) => (
                              <div 
                                key={index} 
                                className="group flex items-center justify-between rounded-lg border border-[#141414]/5 bg-white p-3 transition-all hover:border-[#141414]/20 hover:bg-[#141414]/5"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#141414] text-[#F5F5F0] text-[10px] font-bold">
                                    {String(index + 1).padStart(2, '0')}
                                  </div>
                                  <span className="text-sm font-medium tracking-tight uppercase">{d.label}</span>
                                </div>
                                <ChevronRight className="h-4 w-4 opacity-0 transition-all group-hover:opacity-40" />
                              </div>
                            ))}
                          </div>
                        </section>

                        {result.detections.length === 0 && (
                          <p className="py-8 text-center text-sm text-[#141414]/40 italic">
                            No distinct objects were confidentially identified.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
              <Separator className="bg-[#141414]/5" />
              <CardFooter className="p-4 bg-[#141414]/5">
                <Button 
                  disabled={!result}
                  variant="ghost" 
                  className="w-full justify-between text-xs font-semibold uppercase tracking-widest hover:bg-white"
                >
                  Export Data
                  <Maximize2 className="h-3 w-3" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </main>

      {/* Hidden Canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
