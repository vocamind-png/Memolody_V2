import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Maximize, ScanLine } from 'lucide-react';

interface ScoreSelectionModalProps {
  file: File;
  onConfirm: (croppedBlob: Blob | File, startPage?: number, endPage?: number) => void;
  onCancel: () => void;
}

const ScoreSelectionModal: React.FC<ScoreSelectionModalProps> = ({ file, onConfirm, onCancel }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isCropMode, setIsCropMode] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 5, y: 15, width: 90, height: 25 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'move' | 'resize-br' | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0, rect: { x: 0, y: 0, w: 0, h: 0 } });
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setRenderError(null);
    setImageSrc(null);

    if (!isPdf) {
      // For images: plain FileReader (works on all devices, no library needed)
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!cancelled) {
          setImageSrc(e.target?.result as string);
          setIsLoading(false);
        }
      };
      reader.onerror = () => {
        if (!cancelled) {
          setRenderError('Cannot read image file.');
          setIsLoading(false);
        }
      };
      reader.readAsDataURL(file);
      return () => { cancelled = true; };
    }

    // For PDFs: use pdf.js loaded from CDN
    const renderPdf = async () => {
      try {
        // Step 1: Ensure pdf.js is loaded
        if (!(window as any).pdfjsLib) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load pdf.js from CDN'));
            document.head.appendChild(script);
          });
        }

        if (cancelled) return;

        const pdfjs = (window as any).pdfjsLib;
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

        // Step 2: Load the PDF from file bytes
        const bytes = await file.arrayBuffer();
        if (cancelled) return;

        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        
        if (!cancelled) {
          setNumPages(pdf.numPages);
        }

        // Step 3: Render current page into an offscreen canvas
        const page = await pdf.getPage(currentPage);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (!cancelled) {
          setImageSrc(canvas.toDataURL('image/jpeg', 0.92));
        }
      } catch (err: any) {
        console.error('[ScoreSelectionModal] PDF render error:', err);
        if (!cancelled) {
          setRenderError(err.message || 'Failed to render PDF preview');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    renderPdf();
    return () => { cancelled = true; };
  }, [file, isPdf, currentPage]);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'resize-br') => {
    if (!imageSrc) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragType(type);
    setStartPos({ x: e.clientX, y: e.clientY,
      rect: { x: cropRect.x, y: cropRect.y, w: cropRect.width, h: cropRect.height } });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const cw = containerRef.current.offsetWidth;
    const ch = containerRef.current.offsetHeight;
    const dx = ((e.clientX - startPos.x) / cw) * 100;
    const dy = ((e.clientY - startPos.y) / ch) * 100;

    if (dragType === 'move') {
      setCropRect(r => ({
        ...r,
        x: Math.max(0, Math.min(100 - r.width, startPos.rect.x + dx)),
        y: Math.max(0, Math.min(100 - r.height, startPos.rect.y + dy)),
      }));
    } else if (dragType === 'resize-br') {
      setCropRect(r => ({
        ...r,
        width: Math.max(10, Math.min(100 - r.x, startPos.rect.w + dx)),
        height: Math.max(5, Math.min(100 - r.y, startPos.rect.h + dy)),
      }));
    }
  };

  const handleMouseUp = () => { setIsDragging(false); setDragType(null); };

  // ── Process crop ───────────────────────────────────────────────────────────
  const handleProcess = (fullPage = false) => {
    // If scanning full page, ask for confirmation to prevent accidental long scans
    if (fullPage) {
      if (!window.confirm("คุณต้องการสแกนโน้ต 'ทั้งไฟล์' ใช่หรือไม่?\n\n(หากไฟล์มีหลายหน้า การสแกนทั้งหมดอาจใช้เวลานาน แนะนำให้เลือกสแกนเฉพาะหน้าที่ต้องการทีละหน้า)")) {
        return;
      }
      console.log('[ScoreSelection] Processing FULL PAGE scan...');
      onConfirm(file);
      return;
    }

    if (!imageSrc || !imageRef.current) {
      console.warn('[ScoreSelection] imageRef not ready for cropping');
      return;
    }

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sx = img.naturalWidth / 100;
    const sy = img.naturalHeight / 100;
    canvas.width = cropRect.width * sx;
    canvas.height = cropRect.height * sy;
    ctx.drawImage(img,
      cropRect.x * sx, cropRect.y * sy, canvas.width, canvas.height,
      0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (!blob) return;
      // ✅ Wrap as File so isImageFile() recognizes it as JPEG for Gemini Vision OMR
      const croppedFile = new File(
        [blob],
        `cropped_${file.name.replace(/\.[^/.]+$/, '')}_selection.jpg`,
        { type: 'image/jpeg' }
      );
      onConfirm(croppedFile);
    }, 'image/jpeg', 0.95);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const renderWorkspace = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 border-4 border-white/10 border-t-indigo-500 rounded-full animate-spin" />
          <div className="text-center">
            <p className="text-white font-black uppercase text-xs tracking-widest mb-1">
              {isPdf ? 'Rendering PDF...' : 'Loading Image...'}
            </p>
            <p className="text-zinc-600 text-[10px] italic">pdf.js · Universal Standard</p>
          </div>
        </div>
      );
    }

    if (renderError) {
      return (
        <div className="flex flex-col items-center gap-6 text-center max-w-sm">
          <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/20">
            <X className="text-rose-400" size={28} />
          </div>
          <div>
            <h3 className="text-white font-black uppercase text-base italic">Preview Unavailable</h3>
            <p className="text-zinc-500 text-xs mt-2 leading-relaxed">{renderError}</p>
          </div>
          <button
            onClick={() => onConfirm(file)}
            className="bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
          >
            Process Full File Instead
          </button>
        </div>
      );
    }

    if (imageSrc) {
      return (
        <div className="relative shadow-2xl" style={{ display: 'inline-block', maxWidth: '100%' }}>
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Score preview"
            className="block rounded-sm"
            style={{ 
              maxWidth: '100%', 
              maxHeight: 'calc(min(85vh, 700px) - 200px)', 
              opacity: isCropMode ? 0.55 : 1 
            }}
            draggable={false}
          />

          {/* Crop box */}
          {isCropMode && (
            <div
              className={`absolute border-2 border-indigo-400 bg-indigo-400/10 cursor-move ${isDragging ? 'shadow-[0_0_60px_rgba(99,102,241,0.5)]' : 'shadow-[0_0_30px_rgba(99,102,241,0.25)]'}`}
              style={{ left: `${cropRect.x}%`, top: `${cropRect.y}%`, width: `${cropRect.width}%`, height: `${cropRect.height}%` }}
              onMouseDown={(e) => handleMouseDown(e, 'move')}
            >
              {/* Label */}
              <span className="absolute -top-6 left-0 bg-indigo-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap">
                Selected Region
              </span>
              {/* Resize handle */}
              <div
                className="absolute -right-2.5 -bottom-2.5 w-5 h-5 bg-indigo-500 rounded-md flex items-center justify-center cursor-nwse-resize shadow-lg"
                onMouseDown={(e) => handleMouseDown(e, 'resize-br')}
              >
                <Maximize size={10} className="text-white" />
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/85 backdrop-blur-lg p-4">
      <div className="bg-[#121217] w-full max-w-4xl rounded-[32px] border border-white/10 shadow-2xl flex flex-col overflow-hidden"
        style={{ height: 'min(85vh, 700px)' }}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.015] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
              <ScanLine className="text-indigo-400" size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-tight">Score Scan Mode</h2>
              <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-widest">
                เลือก: สแกนทั้งหน้า หรือ ลากเลือกเฉพาะบรรทัด
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Workspace */}
        <div
          ref={containerRef}
          className="flex-1 bg-[#0a0a0c] flex items-center justify-center p-6 overflow-hidden select-none"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {renderWorkspace()}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 bg-white/[0.015] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 text-xs">
            {isPdf && numPages > 1 && (
              <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-7 h-7 rounded-full hover:bg-white/10 disabled:opacity-30 flex items-center justify-center text-white font-black"
                >
                  &larr;
                </button>
                <span className="text-white text-[10px] font-black uppercase tracking-widest">
                  Page {currentPage} / {numPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                  disabled={currentPage === numPages}
                  className="w-7 h-7 rounded-full hover:bg-white/10 disabled:opacity-30 flex items-center justify-center text-white font-black"
                >
                  &rarr;
                </button>
              </div>
            )}
            {isCropMode && (
              <>
                <span className="text-zinc-600 uppercase tracking-widest font-bold text-[9px]">Selection</span>
                <span className="text-white font-bold">
                  {Math.round(cropRect.width)}% × {Math.round(cropRect.height)}%
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => {
              if (isCropMode) {
                setIsCropMode(false);
              } else {
                onCancel();
              }
            }} className="px-5 py-2.5 rounded-xl text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:text-white transition-all">
              {isCropMode ? 'Cancel Crop' : 'Cancel'}
            </button>
            {!isCropMode && (
              <>
                {isPdf && numPages > 1 && (
                  <button
                    onClick={() => onConfirm(file, currentPage, currentPage)}
                    disabled={!imageSrc}
                    className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-indigo-500/30 transition-all active:scale-95"
                  >
                    <Maximize size={14} />
                    <span className="flex flex-col items-start leading-none gap-0.5">
                      <span>Scan Page {currentPage}</span>
                      <span className="text-[7px] text-indigo-400 font-bold normal-case tracking-normal">สแกนเฉพาะหน้านี้</span>
                    </span>
                  </button>
                )}
                <button
                  onClick={() => handleProcess(true)}
                  disabled={!imageSrc}
                  title="สแกนภาพทั้งหน้า (Full Page) — ส่งไฟล์ต้นฉบับทั้งหมดให้ AI"
                  className="bg-white/5 hover:bg-white/10 text-zinc-300 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-white/10 transition-all active:scale-95"
                >
                  <Maximize size={14} />
                  <span className="flex flex-col items-start leading-none gap-0.5">
                    <span>{isPdf && numPages > 1 ? 'Scan All Pages' : 'Scan Full Page'}</span>
                    <span className="text-[7px] text-zinc-600 font-bold normal-case tracking-normal">ส่ง{isPdf && numPages > 1 ? 'ทุกหน้า' : 'ทั้งหน้า'}ให้ AI อ่าน</span>
                  </span>
                </button>
              </>
            )}
            <button
              onClick={() => {
                if (!isCropMode) {
                  setIsCropMode(true);
                } else {
                  handleProcess(false);
                }
              }}
              disabled={!imageSrc}
              title={isCropMode ? "ยืนยันการสแกนส่วนที่เลือก" : "สแกนเฉพาะส่วนที่เลือก (Selection) — Crop ตาม Box แล้วส่ง AI"}
              className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed text-white px-7 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-[0_8px_24px_rgba(99,102,241,0.3)] transition-all active:scale-95"
            >
              <Check size={14} />
              <span className="flex flex-col items-start leading-none gap-0.5">
                <span>{isCropMode ? 'Confirm Crop' : 'Scan Selection'}</span>
                <span className="text-[7px] text-indigo-200/60 font-bold normal-case tracking-normal">
                  {isCropMode ? 'ยืนยันและส่งสแกน' : 'เลือกเฉพาะส่วนที่ต้องการ'}
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoreSelectionModal;
