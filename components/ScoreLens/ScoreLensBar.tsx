
/**
 * [SCORELENS v2.0] — OMR Camera + File Upload + Music Import Bar
 * Provides camera capture for OMR, file picker for images/PDF, 
 * and music file import buttons for the Nimo AI chat input area.
 */

import React, { useRef } from 'react';
import { Camera, Paperclip, X, Loader2, PlusCircle } from 'lucide-react';

interface ScoreLensBarProps {
  onFileSelected: (file: File) => void;
  isProcessing: boolean;
  previewUrl: string | null;
  onClearPreview: () => void;
  onMusicFileImported?: (file: File) => void;
}

const ScoreLensBar: React.FC<ScoreLensBarProps> = ({
  onFileSelected,
  isProcessing,
  previewUrl,
  onClearPreview,
  onMusicFileImported
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelected(file);
      e.target.value = ''; // reset for re-selection
    }
  };

  const handleMusicFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (onMusicFileImported) {
        onMusicFileImported(file);
      } else {
        // Fallback: treat as regular file selection so ScoreLens can handle it
        onFileSelected(file);
      }
      e.target.value = '';
    }
  };

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,.heic,.heif,application/pdf,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={musicInputRef}
        type="file"
        accept=".emk,.mid,.midi,.xml,.musicxml,.mxl"
        className="hidden"
        onChange={handleMusicFileChange}
      />

      {/* Image Preview (shown above the input bar when an image is selected) */}
      {previewUrl && (
        <div className="shrink-0 mx-2 mb-2 relative inline-block">
          <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-[0_0_20px_rgba(0,229,255,0.15)]">
            <img src={previewUrl} alt="Score preview" className="w-full h-full object-cover" />
            {isProcessing && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 size={20} className="text-cyan-400 animate-spin" />
              </div>
            )}
          </div>
          {!isProcessing && (
            <button
              onClick={onClearPreview}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-rose-500/80 transition-colors"
            >
              <X size={10} />
            </button>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-0">
        {/* Import Music File (+) Button */}
        <button
          onClick={() => musicInputRef.current?.click()}
          disabled={isProcessing}
          className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all disabled:opacity-30 disabled:hover:text-zinc-600 disabled:hover:bg-transparent"
          title="📥 Import: นำเข้าไฟล์เพลง (.emk, .mid, .musicxml)"
        >
          <PlusCircle size={18} />
        </button>

        {/* OMR Camera Button - Opens device camera for sheet music scanning */}
        <button
          onClick={() => cameraInputRef.current?.click()}
          disabled={isProcessing}
          className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-zinc-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all disabled:opacity-30 disabled:hover:text-zinc-600 disabled:hover:bg-transparent"
          title="📷 OMR: ถ่ายภาพโน้ตเพลง / Take Photo of Sheet Music"
        >
          <Camera size={18} />
        </button>
      </div>
    </>
  );
};

export default ScoreLensBar;
