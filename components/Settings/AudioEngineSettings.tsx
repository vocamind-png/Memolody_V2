// AudioEngineSettings.tsx – UI for selecting the audio AI engine and auto‑update
import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
// Added UI for Cloud GPU toggle

// Simple modal component (no external deps)
const Modal: React.FC<{title:string; onClose:()=>void; children:React.ReactNode}> = ({title, onClose, children}) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div className="bg-zinc-900 rounded-xl p-6 w-96 shadow-xl">
      <h2 className="text-lg font-bold mb-4 text-zinc-100">{title}</h2>
      <div className="mb-4 text-zinc-300">{children}</div>
      <button
        onClick={onClose}
        className="mt-2 w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 rounded"
      >Close</button>
    </div>
  </div>
);

// Model definition
interface ModelOption {
  label: string;
  value: string; // matches folder name used by backend (e.g., 'vocalido_v1', 'light_qwen', 'vocalido_v1_cloud')
  minRam: number; // GB required for stable operation (local only)
}

const MODELS: ModelOption[] = [
  { label: 'Heavy – Vocalido (high quality, local GPU/CPU)', value: 'vocalido_v1', minRam: 8 },
  { label: 'Light – Qwen (fast, low RAM)', value: 'light_qwen', minRam: 2 },
  { label: 'Light – Gemma (fast, low RAM)', value: 'light_gemma', minRam: 2 },
  { label: 'Heavy – Vocalido (cloud GPU via Vertex AI)', value: 'vocalido_v1_cloud', minRam: 0 }, // cloud does not depend on local RAM
];

const AudioEngineSettings: React.FC = () => {
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [autoUpdate, setAutoUpdate] = useState<boolean>(false);
  const [deviceRam, setDeviceRam] = useState<number>(0); // GB
  const [showModal, setShowModal] = useState<boolean>(false);
  const [modalMessage, setModalMessage] = useState<string>('');

  // Detect approximate device memory (in GB). navigator.deviceMemory is an approximation.
  useEffect(() => {
    const mem = (navigator as any).deviceMemory as number | undefined;
    const ram = mem ? Math.round(mem) : 0; // round to nearest GB
    setDeviceRam(ram);
    // Choose default based on RAM
    const suitable = MODELS.find(m => ram >= m.minRam) || MODELS[MODELS.length - 1];
    setSelectedModel(suitable.value);
    // Persist auto‑update flag (optional)
    const storedAuto = localStorage.getItem('audioEngineAutoUpdate');
    if (storedAuto !== null) setAutoUpdate(storedAuto === 'true');
  }, []);

  const applyModel = async (model: string) => {
    try {
      const res = await fetch('/model/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error('Failed to switch model');
      setSelectedModel(model);
    } catch (e) {
      console.error(e);
      setModalMessage('Unable to switch AI engine. Please check the server logs.');
      setShowModal(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    const modelInfo = MODELS.find(m => m.value === newModel);
    if (!modelInfo) return;
    // If device RAM is insufficient, warn and fallback to the lowest‑RAM model
    if (deviceRam < modelInfo.minRam) {
      const fallback = MODELS[MODELS.length - 1];
      setModalMessage(
        `Your device has ~${deviceRam} GB RAM, which is insufficient for "${modelInfo.label}".\n` +
        `Switching to the lowest‑RAM model "${fallback.label}" instead.`
      );
      setShowModal(true);
      applyModel(fallback.value);
    } else {
      applyModel(newModel);
    }
  };

  const toggleAutoUpdate = () => {
    const next = !autoUpdate;
    setAutoUpdate(next);
    localStorage.setItem('audioEngineAutoUpdate', String(next));
    // You could call a backend endpoint here to persist the setting if needed.
  };

  return (
    <div className="flex flex-col gap-2 bg-white/5 border border-white/10 rounded-2xl p-4">
      <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
        Audio AI Engine Model
      </span>
      <span className="text-[8px] text-zinc-500">
        เลือกโมเดล AI สำหรับประมวลผลเสียง (Heavy = คุณภาพสูง, Light = เร็ว/ประหยัด RAM)
      </span>
      <div className="flex flex-col gap-2 mt-1">
        <select
          value={selectedModel}
          onChange={handleChange}
          className="w-full bg-[#0c0c0e] border border-white/10 focus:border-cyan-500 rounded-xl px-3 py-2 text-[10px] text-white focus:outline-none transition-all"
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>
              {m.label} {deviceRam && deviceRam < m.minRam ? '(⚠️ may be slow)' : ''}
            </option>
          ))}
        </select>
        <div className="flex items-center space-x-2 mt-1">
          <input
            id="auto-update"
            type="checkbox"
            checked={autoUpdate}
            onChange={toggleAutoUpdate}
            className="w-3 h-3 text-cyan-600 bg-black border-white/20 rounded focus:ring-cyan-500"
          />
          <label htmlFor="auto-update" className="text-[8px] text-zinc-400">
            Auto-update AI model when a newer version is available
          </label>
        </div>
      </div>

      {showModal && (
        <Modal title="AI Engine Notice" onClose={() => setShowModal(false)}>
          <pre className="whitespace-pre-wrap text-sm text-zinc-200 font-mono">{modalMessage}</pre>
        </Modal>
      )}
    </div>
  );
};

export default AudioEngineSettings;
