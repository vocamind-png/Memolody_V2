import React from 'react';
import { X, Sliders, Volume2, Waves } from 'lucide-react';
import { SoundBankSettings } from '../types';

interface SoundBankModuleProps {
    trackId: string;
    settings: Partial<SoundBankSettings>;
    onUpdateSettings: (settings: SoundBankSettings) => void;
    onClose: () => void;
}

const DEFAULT_SETTINGS: SoundBankSettings = {
    instrument: 'HD Grand Piano',
    reverbWet: 0.25
};

export const SoundBankModule: React.FC<SoundBankModuleProps> = ({ trackId, settings: initialSettings, onUpdateSettings, onClose }) => {
    const settings = { ...DEFAULT_SETTINGS, ...initialSettings } as SoundBankSettings;

    const handleInstrumentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onUpdateSettings({ ...settings, instrument: e.target.value });
    };

    const handleReverbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onUpdateSettings({ ...settings, reverbWet: parseFloat(e.target.value) });
    };

    return (
        <div className="absolute inset-0 z-[6000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#1a1a1f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header (Hardware Style) */}
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-inner shadow-white/20">
                            <Waves size={16} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold leading-non tracking-wider">SOUNDBANK</h2>
                            <p className="text-blue-300 text-[10px] font-mono tracking-widest uppercase mt-0.5">Studio Instrument Module</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col gap-6">
                    {/* Instrument Matrix */}
                    <div className="flex flex-col gap-2">
                        <label className="text-white/60 text-xs font-mono uppercase tracking-wider flex items-center gap-2">
                            <Sliders size={12} />
                            Loaded Instrument
                        </label>
                        <div className="relative">
                            <select
                                value={settings.instrument}
                                onChange={handleInstrumentChange}
                                className="w-full bg-[#0c0c0f] border border-blue-500/20 text-white p-3 rounded-lg appearance-none font-sans font-semibold focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all shadow-inner"
                            >
                                <optgroup label="HD Acoustic Series">
                                    <option value="HD Grand Piano">Yamaha C7 Grand Piano (48kHz)</option>
                                    <option value="LoFi Upright">LoFi Upright Piano</option>
                                    <option value="Rhodes EP">Rhodes Electric Piano</option>
                                </optgroup>
                                <optgroup label="Orchestral Engine">
                                    <option value="Chamber Strings">Chamber Strings Ensemble</option>
                                    <option value="Pizzicato">Pizzicato Strings</option>
                                    <option value="Solo Violin">Solo Violin (Legato)</option>
                                </optgroup>
                                <optgroup label="Synthesizers">
                                    <option value="Analog Pluck">Analog Pluck</option>
                                    <option value="Sine Wave">Pure Sine Wave</option>
                                </optgroup>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                                ▼
                            </div>
                        </div>
                    </div>

                    {/* FX Rack */}
                    <div className="bg-black/30 p-5 rounded-xl border border-blue-500/10 flex flex-col gap-4 shadow-[inset_0_2px_15px_rgba(0,0,0,0.5)]">
                        <h3 className="text-white/40 text-[10px] font-mono tracking-widest uppercase mb-1 border-b border-white/5 pb-2">Spatial FX Rack</h3>

                        <div className="flex flex-col gap-2 pt-1">
                            <div className="flex items-center justify-between">
                                <label className="text-white/80 text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                                    <Volume2 size={12} className="text-indigo-400" />
                                    Concert Hall Reverb
                                </label>
                                <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-1.5 rounded">
                                    {Math.round(settings.reverbWet * 100)} %
                                </span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={settings.reverbWet}
                                onChange={handleReverbChange}
                                className="w-full accent-indigo-500 h-1 bg-white/10 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                            />
                        </div>
                    </div>

                    {/* Info LCD */}
                    <div className="bg-[#0a0a0c] border border-blue-900/40 font-mono text-[10px] p-2.5 rounded-lg text-blue-400 flex flex-col gap-1.5 shadow-inner shadow-blue-900/20">
                        <div className="flex justify-between items-center px-2">
                            <span className="opacity-60">SAMPLE RATE ENGINE</span>
                            <span className="text-white">48 kHz (24-bit HD)</span>
                        </div>
                        <div className="flex justify-between items-center px-2">
                            <span className="opacity-60">MEMORY CACHE</span>
                            <span className="text-blue-200">OPTIMIZED</span>
                        </div>
                        <div className="flex justify-between items-center px-2">
                            <span className="opacity-60">ASSIGNED TRACK UUID</span>
                            <span className="text-blue-200">{trackId}</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
