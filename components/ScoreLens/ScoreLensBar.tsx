
/**
 * [SCORELENS v1.0] — Camera & File Upload Bar
 * Provides camera capture and file picker buttons for the Nimo AI chat input area.
 */

import React, { useRef } from 'react';
import { Camera, Paperclip, X, Loader2 } from 'lucide-react';

interface ScoreLensBarProps {
  onFileSelected: (file: File) => void;
  isProcessing: boolean;
  previewUrl: string | null;
  onClearPreview: () => void;
}

const ScoreLensBar: React.FC<ScoreLensBarProps> = ({
  onFileSelected,
  isProcessing,
  previewUrl,
  onClearPreview
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelected(file);
      e.target.value = ''; // reset for re-selection
    }
  };

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
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
      <div className="flex items-center gap-1">
        {/* Camera Button */}
        <button
          onClick={() => cameraInputRef.current?.click()}
          disabled={isProcessing}
          className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all disabled:opacity-30 disabled:hover:text-zinc-600 disabled:hover:bg-transparent"
          title="Take Photo of Sheet Music"
        >
          <Camera size={18} />
        </button>

        {/* File Attach Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10 transition-all disabled:opacity-30 disabled:hover:text-zinc-600 disabled:hover:bg-transparent"
          title="Attach Image / PDF"
        >
          <Paperclip size={16} />
        </button>
      </div>
    </>
  );
};

export default ScoreLensBar;
