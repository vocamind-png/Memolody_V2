/**
 * CameraCapture — Full-screen camera for capturing sheet music
 * Features:
 *  - Page frame overlay guide (A4 ratio)
 *  - Blur detection via Laplacian variance
 *  - Glare/reflection detection via overexposed pixel ratio
 *  - Detailed quality feedback
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, RotateCcw, CheckCircle2, AlertTriangle, Loader2, ZoomIn, ZoomOut, FlipHorizontal } from 'lucide-react';

interface CaptureResult {
  dataUrl: string;
  file: File;
}

interface CameraCaptureProps {
  onCapture: (result: CaptureResult) => void;
  onClose: () => void;
}

// ── Image Quality Analysis ───────────────────────────────────────────────────

function analyzeImageQuality(canvas: HTMLCanvasElement): {
  blurScore: number;     // higher = sharper (Laplacian variance)
  glareRatio: number;    // 0-1, how much of image is overexposed
  isBlurry: boolean;
  hasGlare: boolean;
  passed: boolean;
} {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { blurScore: 0, glareRatio: 0, isBlurry: true, hasGlare: false, passed: false };

  // Sample at 1/4 resolution for speed
  const w = Math.floor(canvas.width / 4);
  const h = Math.floor(canvas.height / 4);
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const octx = offscreen.getContext('2d')!;
  octx.drawImage(canvas, 0, 0, w, h);
  const data = octx.getImageData(0, 0, w, h).data;

  // Convert to grayscale
  const gray: number[] = [];
  let overexposedCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    gray.push(lum);
    if (r > 240 && g > 240 && b > 240) overexposedCount++;
  }

  const totalPixels = gray.length;
  const glareRatio = overexposedCount / totalPixels;

  // Laplacian variance for blur
  let laplacianSum = 0;
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const conv =
        gray[idx - w - 1] * kernel[0] + gray[idx - w] * kernel[1] + gray[idx - w + 1] * kernel[2] +
        gray[idx - 1] * kernel[3] + gray[idx] * kernel[4] + gray[idx + 1] * kernel[5] +
        gray[idx + w - 1] * kernel[6] + gray[idx + w] * kernel[7] + gray[idx + w + 1] * kernel[8];
      laplacianSum += conv * conv;
      count++;
    }
  }
  const blurScore = count > 0 ? laplacianSum / count : 0;

  const BLUR_THRESHOLD = 80;   // tune as needed
  const GLARE_THRESHOLD = 0.12; // 12% overexposed = glare

  const isBlurry = blurScore < BLUR_THRESHOLD;
  const hasGlare = glareRatio > GLARE_THRESHOLD;

  return { blurScore, glareRatio, isBlurry, hasGlare, passed: !isBlurry && !hasGlare };
}

// ── Component ────────────────────────────────────────────────────────────────

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<'loading' | 'preview' | 'analyzing' | 'failed' | 'success'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [qualityResult, setQualityResult] = useState<ReturnType<typeof analyzeImageQuality> | null>(null);
  const [torch, setTorch] = useState(false);

  // Start camera
  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    setPhase('loading');
    setErrorMsg('');
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setPhase('preview');
    } catch (e: any) {
      setPhase('failed');
      if (e.name === 'NotAllowedError') {
        setErrorMsg('กรุณาอนุญาตการเข้าถึงกล้องในการตั้งค่าเบราว์เซอร์');
      } else if (e.name === 'NotFoundError') {
        setErrorMsg('ไม่พบกล้องในอุปกรณ์นี้');
      } else {
        setErrorMsg('ไม่สามารถเปิดกล้องได้: ' + e.message);
      }
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [startCamera, facingMode]);

  // Capture photo
  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || phase !== 'preview') return;
    setPhase('analyzing');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    const result = analyzeImageQuality(canvas);
    setQualityResult(result);

    if (result.passed) {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setCapturedUrl(dataUrl);
      setPhase('success');
    } else {
      setCapturedUrl(canvas.toDataURL('image/jpeg', 0.5));
      setPhase('failed');
    }
  }, [phase]);

  const retake = useCallback(() => {
    setCapturedUrl(null);
    setQualityResult(null);
    setPhase('preview');
  }, []);

  const confirmCapture = useCallback(() => {
    if (!capturedUrl) return;
    // Convert dataUrl to File
    const arr = capturedUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
    const file = new File([u8arr], `sheet_capture_${Date.now()}.jpg`, { type: mime });
    onCapture({ dataUrl: capturedUrl, file });
  }, [capturedUrl, onCapture]);

  const flipCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // ── A4 frame dimensions (ratio 1:1.414) ────────────────────────────────
  // We show it as a centered overlay on the live feed
  const frameW = 'min(85vw, 52vh)';  // responsive but keeps A4 ratio
  const frameH = `calc(${frameW} * 1.414)`;

  return (
    <div className="fixed inset-0 z-[50000] bg-black flex flex-col" style={{ touchAction: 'none' }}>

      {/* ── Video / Preview ─────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden bg-black flex items-center justify-center">

        {/* Live camera feed */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
          style={{ display: phase === 'preview' || phase === 'analyzing' ? 'block' : 'none' }}
        />

        {/* Captured image preview */}
        {capturedUrl && (phase === 'failed' || phase === 'success') && (
          <img src={capturedUrl} alt="captured" className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* Dark vignette overlay */}
        {phase === 'preview' && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.75) 100%)',
            }}
          />
        )}

        {/* ── A4 Sheet Frame Guide ───────────────────────────────────────── */}
        {phase === 'preview' && (
          <div
            className="absolute pointer-events-none"
            style={{ width: frameW, height: frameH }}
          >
            {/* Corner markers */}
            {(['tl','tr','bl','br'] as const).map(corner => (
              <div key={corner} className="absolute" style={{
                width: 36, height: 36,
                top: corner.startsWith('t') ? 0 : 'auto',
                bottom: corner.startsWith('b') ? 0 : 'auto',
                left: corner.endsWith('l') ? 0 : 'auto',
                right: corner.endsWith('r') ? 0 : 'auto',
                borderTop: corner.startsWith('t') ? '3px solid #00e5ff' : 'none',
                borderBottom: corner.startsWith('b') ? '3px solid #00e5ff' : 'none',
                borderLeft: corner.endsWith('l') ? '3px solid #00e5ff' : 'none',
                borderRight: corner.endsWith('r') ? '3px solid #00e5ff' : 'none',
                borderRadius: corner === 'tl' ? '4px 0 0 0' : corner === 'tr' ? '0 4px 0 0' : corner === 'bl' ? '0 0 0 4px' : '0 0 4px 0',
                boxShadow: '0 0 8px rgba(0,229,255,0.5)',
              }} />
            ))}

            {/* Center guide lines */}
            <div className="absolute top-1/2 left-4 right-4 h-[1px] -translate-y-1/2 opacity-20" style={{ background: '#00e5ff' }} />
            <div className="absolute left-1/2 top-4 bottom-4 w-[1px] -translate-x-1/2 opacity-20" style={{ background: '#00e5ff' }} />

            {/* Staff line guides (5 lines) */}
            {[25, 37.5, 50, 62.5, 75].map(pct => (
              <div key={pct} className="absolute left-8 right-8 h-[1px] opacity-15" style={{
                background: '#ffd700',
                top: `${pct}%`,
              }} />
            ))}

            {/* Frame border */}
            <div className="absolute inset-0 rounded-sm" style={{
              border: '1.5px solid rgba(0,229,255,0.5)',
              boxShadow: 'inset 0 0 30px rgba(0,229,255,0.05), 0 0 20px rgba(0,229,255,0.15)',
            }} />
          </div>
        )}

        {/* ── Top Instructions ─────────────────────────────────────────── */}
        {phase === 'preview' && (
          <div className="absolute top-0 left-0 right-0 pb-4 pt-safe pt-4 px-4 text-center" style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
          }}>
            <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">
              จัดหน้ากระดาษโน้ตให้ตรงกรอบ
            </p>
            <p className="text-[8px] text-zinc-500 uppercase tracking-wider mt-0.5">
              Align sheet music within the frame · Keep steady & avoid shadows
            </p>
          </div>
        )}

        {/* ── Loading ─────────────────────────────────────────────────── */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-4 text-white">
            <Loader2 size={40} className="animate-spin text-cyan-400" />
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">กำลังเปิดกล้อง...</p>
          </div>
        )}

        {/* ── Analyzing Overlay ────────────────────────────────────────── */}
        {phase === 'analyzing' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4">
            <Loader2 size={40} className="animate-spin text-cyan-400" />
            <p className="text-[11px] font-black uppercase tracking-widest text-white">กำลังวิเคราะห์คุณภาพภาพ...</p>
          </div>
        )}

        {/* ── Quality FAIL Overlay ─────────────────────────────────────── */}
        {phase === 'failed' && qualityResult && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 gap-4">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center border border-rose-500/40">
              <AlertTriangle size={32} className="text-rose-400" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-black text-white uppercase italic tracking-tight">ภาพไม่ผ่านเกณฑ์</h3>
              <p className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Image Quality Failed</p>
            </div>

            {/* Fail reasons */}
            <div className="w-full max-w-sm bg-zinc-900/80 border border-white/10 rounded-3xl p-5 space-y-3">
              {/* Blur */}
              {qualityResult.isBlurry && (
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[9px] text-rose-400 font-black">✕</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-rose-400 uppercase tracking-wide">ภาพเบลอ / Blurry</p>
                    <p className="text-[8px] text-zinc-500 leading-relaxed mt-0.5">
                      ความคมชัด: {Math.round(qualityResult.blurScore)} (ขั้นต่ำ 80)<br/>
                      • ยึดมือให้นิ่ง หรือพิงอุปกรณ์กับพื้นผิวแข็ง<br/>
                      • อย่าเคลื่อนไหวขณะถ่าย<br/>
                      • ใช้แสงสว่างเพียงพอ
                    </p>
                  </div>
                </div>
              )}
              {/* Glare */}
              {qualityResult.hasGlare && (
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[9px] text-amber-400 font-black">☀</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-wide">แสงสะท้อน / Glare Detected</p>
                    <p className="text-[8px] text-zinc-500 leading-relaxed mt-0.5">
                      พื้นที่สว่างเกิน: {Math.round(qualityResult.glareRatio * 100)}% (จำกัด 12%)<br/>
                      • หลีกเลี่ยงแสงไฟฉายตรงหน้ากระดาษ<br/>
                      • วางกระดาษในที่แสงสม่ำเสมอ ไม่มีแสงจ้า<br/>
                      • ถ่ายจากมุมเล็กน้อย เพื่อหลบแสงสะท้อน
                    </p>
                  </div>
                </div>
              )}

              {/* Requirements remind */}
              <div className="border-t border-white/5 pt-3">
                <p className="text-[7px] font-black text-zinc-600 uppercase tracking-widest mb-1.5">เกณฑ์ภาพถ่ายโน้ต</p>
                {[
                  'ภาพคมชัด ไม่สั่น ไม่เบลอ',
                  'ไม่มีแสงสะท้อนบนหน้ากระดาษ',
                  'โน้ตทุกบรรทัดมองเห็นได้ชัดเจน',
                  'จัดกระดาษให้ตรงกรอบ ไม่เอียง',
                  'แสงสม่ำเสมอทั้งแผ่น ไม่มีเงา',
                ].map((req, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    <div className="w-1 h-1 rounded-full bg-cyan-500/50 shrink-0" />
                    <p className="text-[7px] text-zinc-500">{req}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── PASS Overlay ─────────────────────────────────────────────── */}
        {phase === 'success' && (
          <div className="absolute inset-0 flex flex-col items-end justify-end p-6 gap-4 pointer-events-none">
            <div
              className="self-start flex items-center gap-3 px-4 py-2 rounded-2xl pointer-events-auto"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}
            >
              <CheckCircle2 size={18} className="text-emerald-400" />
              <div>
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-wide">ภาพผ่านเกณฑ์</p>
                <p className="text-[7px] text-emerald-700">
                  Sharpness: {qualityResult ? Math.round(qualityResult.blurScore) : '-'} · Glare: {qualityResult ? Math.round(qualityResult.glareRatio * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Camera Error ─────────────────────────────────────────────── */}
        {phase === 'failed' && !qualityResult && (
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <AlertTriangle size={40} className="text-rose-400" />
            <p className="text-[11px] font-black text-white uppercase">{errorMsg || 'ไม่สามารถเปิดกล้องได้'}</p>
          </div>
        )}
      </div>

      {/* ── Bottom Controls ──────────────────────────────────────────────── */}
      <div className="shrink-0 pb-safe" style={{
        background: 'linear-gradient(to top, #000, rgba(0,0,0,0.95) 60%, transparent)',
        paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
      }}>
        <div className="flex items-center justify-between px-8 pt-4">
          {/* Close */}
          <button
            onClick={onClose}
            className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all"
          >
            <X size={20} />
          </button>

          {/* Main action */}
          {phase === 'preview' && (
            <button
              onClick={capturePhoto}
              className="w-20 h-20 rounded-full flex items-center justify-center active:scale-90 transition-all shrink-0"
              style={{
                background: 'white',
                boxShadow: '0 0 0 4px rgba(255,255,255,0.15), 0 0 0 8px rgba(255,255,255,0.05)',
              }}
            >
              <Camera size={32} className="text-black" />
            </button>
          )}

          {(phase === 'failed' || phase === 'success') && (
            <div className="flex-1 flex items-center justify-center gap-4">
              {/* Retake */}
              <button
                onClick={retake}
                className="flex-1 h-14 rounded-2xl bg-white/10 flex items-center justify-center gap-2 text-white border border-white/10 active:scale-95 transition-all"
              >
                <RotateCcw size={16} />
                <span className="text-[9px] font-black uppercase tracking-widest">ถ่ายใหม่</span>
              </button>
              {/* Use photo (only on success) */}
              {phase === 'success' && (
                <button
                  onClick={confirmCapture}
                  className="flex-1 h-14 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
                  style={{ background: 'linear-gradient(135deg, #00e5ff, #0090c8)', color: 'black' }}
                >
                  <CheckCircle2 size={16} />
                  <span className="text-[9px] font-black uppercase tracking-widest">ใช้ภาพนี้</span>
                </button>
              )}
            </div>
          )}

          {(phase === 'loading' || phase === 'analyzing') && <div className="w-20 h-20" />}

          {/* Flip camera */}
          {(phase === 'preview') && (
            <button
              onClick={flipCamera}
              className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all"
            >
              <FlipHorizontal size={18} />
            </button>
          )}

          {(phase === 'failed' || phase === 'success' || phase === 'loading' || phase === 'analyzing') && (
            <div className="w-12 h-12" />
          )}
        </div>
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraCapture;
