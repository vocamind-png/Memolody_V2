import * as Tone from 'tone';
import { Soundfont } from 'smplr';
import { SoundBankSettings } from '../types';

class SmplrWrapper {
    private sf: Soundfont;

    constructor(sf: Soundfont) {
        this.sf = sf;
    }

    triggerAttackRelease(note: string | number, duration: number, time: number, velocity?: number) {
        // MusicEngine passes frequencies (Hz) as numbers, e.g., 493.883
        // Tone.Frequency(note) converts both strings ("C4") and Hz (440) to frequency objects.
        let midiNote = Math.round(Tone.Frequency(note).toMidi());
        // console.log(`[SmplrWrapper] PLAYING NOTE: ${note}Hz -> MIDI: ${midiNote}`);
        this.sf.start({
            note: midiNote,
            velocity: velocity ? velocity * 127 : 100,
            time: time,
            duration: duration
        });
    }

    connect(destination: any) {
        // smplr's output is connected at initialization to the Tone.js context
        return this;
    }

    dispose() {
        if (this.sf && typeof this.sf.dispose === 'function') {
            this.sf.dispose();
        }
    }
}

class ToneDrumWrapper {
    private kick: any;
    private snare: any;
    private hihat: any;

    constructor() {
        // Basic synthesized drum kit
        this.kick = new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 4,
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" }
        });
        
        this.snare = new Tone.NoiseSynth({
            noise: { type: "pink" },
            envelope: { attack: 0.005, decay: 0.2, sustain: 0 }
        });
        
        this.hihat = new Tone.MetalSynth({
            envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
            harmonicity: 5.1,
            modulationIndex: 32,
            resonance: 4000,
            octaves: 1.5
        } as any);
        // Make hihat volume lower relative to kick/snare
        this.hihat.volume.value = -10;
    }

    triggerAttackRelease(note: string | number, duration: number, time: number, velocity?: number) {
        let midiNote = typeof note === 'number' ? note : Tone.Midi(note).toMidi();
        const vel = velocity || 0.8;
        
        if (midiNote === 36 || midiNote === 35) {
            this.kick.triggerAttackRelease("C1", "8n", time, vel);
        } else if (midiNote === 38 || midiNote === 40) {
            this.snare.triggerAttackRelease("16n", time, vel);
        } else if (midiNote === 42 || midiNote === 44 || midiNote === 46) {
            this.hihat.triggerAttackRelease("32n", time, vel * 0.5);
        } else {
            // fallback percussion to hihat
            this.hihat.triggerAttackRelease("32n", time, vel * 0.5);
        }
    }

    connect(destination: any) {
        this.kick.connect(destination);
        this.snare.connect(destination);
        this.hihat.connect(destination);
        return this;
    }

    dispose() {
        this.kick.dispose();
        this.snare.dispose();
        this.hihat.dispose();
    }
}

export class SoundBankEngine {
    // Cache the reverb instance so it's only created once
    private static sharedReverb: Tone.Reverb | null = null;
    private static reverbReady = false;

    /**
     * Bootstraps the audio engine for an instrument track, 
     * completely decoupled from the main app's MusicEngine.
     */
    static async createInstrumentChannel(
        trackId: string,
        trackName: string,
        settings: Partial<SoundBankSettings> | undefined,
        masterBus: Tone.Gain | null,
        trackSamplers: Map<string, any>,
        trackChannels: Map<string, Tone.Channel>,
        trackMeters: Map<string, Tone.Meter>
    ): Promise<void> {
        return new Promise<void>(async (resolve) => {
            if (!masterBus) {
                resolve();
                return;
            }

            // Mobile Optimization: Bypass expensive convolution reverb on mobile
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            // Prepare shared reverb ONCE (async, cached) - ONLY ON DESKTOP
            if (!isMobile && (!this.sharedReverb || !this.reverbReady)) {
                try {
                    const wetAmount = settings?.reverbWet !== undefined ? settings.reverbWet : 0.2;
                    this.sharedReverb = new Tone.Reverb({
                        decay: 2.0,
                        preDelay: 0.04,
                        wet: wetAmount
                     }).connect(masterBus);

                    await this.sharedReverb.generate();
                    this.reverbReady = true;
                } catch (e) {
                    console.warn("Reverb failed, connecting directly to masterBus");
                    this.sharedReverb = null;
                }
            }

            // On mobile, we use masterBus directly (Dry) to save CPU
            const connectTarget = (isMobile ? masterBus : (this.sharedReverb || masterBus));

            const channel = new Tone.Channel(0, 0).connect(connectTarget);
            const meter = new Tone.Meter().connect(channel);

            let instrumentName = settings?.instrument || 'acoustic_grand_piano';
            
            // Map legacy/invalid/lowercase names to valid smplr GM names
            const instrumentMap: Record<string, string> = {
                'HD Grand Piano': 'acoustic_grand_piano',
                'Piano': 'acoustic_grand_piano',
                'piano': 'acoustic_grand_piano',
                'Electric Piano': 'electric_piano_1',
                'Acoustic Guitar': 'acoustic_guitar_nylon',
                'guitar': 'acoustic_guitar_nylon',
                'Electric Guitar': 'electric_guitar_clean',
                'Bass': 'electric_bass_finger',
                'bass': 'electric_bass_finger',
                'Strings': 'string_ensemble_1',
                'strings': 'string_ensemble_1',
                'Synth': 'lead_1_square',
                'synth': 'lead_1_square',
                'Drums': 'synth_drum',
                'drums': 'synth_drum',
                'flute': 'flute',
                'violin': 'violin',
                'cello': 'cello',
                'saxophone': 'alto_sax',
                'trumpet': 'trumpet',
                'Auto': 'acoustic_grand_piano',
                'auto': 'acoustic_grand_piano'
            };
            // Apply map, or fall back to acoustic_grand_piano for unknown names
            if (instrumentMap[instrumentName]) {
                instrumentName = instrumentMap[instrumentName];
            } else if (!instrumentName || instrumentName.trim() === '') {
                instrumentName = 'acoustic_grand_piano';
            }

            console.log(`[SoundBankEngine] Loading smplr instrument: ${instrumentName} for trackId=${trackId}...`);

            let resolved = false;

            const LOAD_TIMEOUT_MS = 3000; // 3s timeout — fallback to basic synth on slow networks

            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn(`[SoundBankEngine] ⚠️ Sampler loading timed out (${LOAD_TIMEOUT_MS}ms) for trackId=${trackId}, falling back to basic Synth`);
                    
                    const fallbackSynth = new Tone.PolySynth(Tone.Synth, {
                        oscillator: { type: "triangle" },
                        envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 1.0 }
                    });
                    fallbackSynth.connect(channel);

                    trackSamplers.set(trackId, fallbackSynth);
                    trackChannels.set(trackId, channel);
                    trackMeters.set(trackId, meter);
                    resolve();
                }
            }, LOAD_TIMEOUT_MS);

            try {
                const ctx = Tone.getContext().rawContext as AudioContext;
                
                // --- CUSTOM SAMPLERS INTERCEPT ---
                
                // 1. Drum check
                if (instrumentName === 'synth_drum' || instrumentName === 'drums') {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeoutId);

                    const drumWrapper = new ToneDrumWrapper();
                    drumWrapper.connect(channel);
                    
                    trackSamplers.set(trackId, drumWrapper);
                    trackChannels.set(trackId, channel);
                    trackMeters.set(trackId, meter);
                    
                    console.log(`[SoundBankEngine] Successfully loaded custom ToneDrumWrapper for trackId=${trackId}`);
                    resolve();
                    return;
                }

                // 2. Salamander Grand Piano (The old realistic piano the user prefers)
                if (instrumentName === 'acoustic_grand_piano') {
                    console.log(`[SoundBankEngine] Preloading Salamander piano samples for trackId=${trackId}...`);
                    const baseUrl = "https://tonejs.github.io/audio/salamander/";
                    
                    const sampler = new Tone.Sampler({
                        urls: {
                            A0: "A0.mp3",
                            C1: "C1.mp3",
                            "F#1": "Fs1.mp3",
                            A1: "A1.mp3",
                            C2: "C2.mp3",
                            "F#2": "Fs2.mp3",
                            A2: "A2.mp3",
                            C3: "C3.mp3",
                            "F#3": "Fs3.mp3",
                            A3: "A3.mp3",
                            C4: "C4.mp3",
                            "F#4": "Fs4.mp3",
                            A4: "A4.mp3",
                            C5: "C5.mp3",
                            "F#5": "Fs5.mp3",
                            A5: "A5.mp3",
                            C6: "C6.mp3",
                            A6: "A6.mp3",
                            C7: "C7.mp3",
                        },
                        release: 1.2,
                        baseUrl: baseUrl,
                        onload: () => {
                            if (resolved) return;
                            resolved = true;
                            clearTimeout(timeoutId);
                            
                            sampler.connect(channel);
                            trackSamplers.set(trackId, sampler);
                            trackChannels.set(trackId, channel);
                            trackMeters.set(trackId, meter);
                            
                            console.log(`[SoundBankEngine] Successfully loaded Salamander Piano for trackId=${trackId}`);
                            resolve();
                        },
                        onerror: (e) => {
                            console.error(`[SoundBankEngine] Salamander piano failed to load:`, e);
                            // We don't resolve here, we let the timeout fallback handle it
                        }
                    });
                    return;
                }

                // --- SMPLR FALLBACK FOR ALL OTHER INSTRUMENTS ---
                // We use a native GainNode to bridge smplr's native AudioNode output into Tone.js's channel
                const nativeGain = ctx.createGain();
                Tone.connect(nativeGain, channel);

                const sf = new Soundfont(ctx, { 
                    instrument: instrumentName as any,
                    destination: nativeGain
                });

                // smplr v0.26+ uses sf.ready (Promise<void>) to wait for load completion
                const loadStartTime = performance.now();
                await Promise.race([
                    sf.ready,
                    new Promise<void>((_, reject) => setTimeout(() => reject(new Error('sf.ready timeout')), LOAD_TIMEOUT_MS + 500))
                ]);
                console.log(`[SoundBankEngine] ✅ sf.ready resolved in ${Math.round(performance.now() - loadStartTime)}ms for ${instrumentName}`);

                if (resolved) return;
                clearTimeout(timeoutId);

                const wrapper = new SmplrWrapper(sf);
                
                trackSamplers.set(trackId, wrapper);
                trackChannels.set(trackId, channel);
                trackMeters.set(trackId, meter);
                
                console.log(`[SoundBankEngine] Successfully loaded and connected smplr instrument: ${instrumentName}`);
                resolved = true;
                resolve();

            } catch (err) {
                if (resolved) {
                    console.error(`[SoundBankEngine] Late error after resolve:`, err);
                    return;
                }
                resolved = true;
                clearTimeout(timeoutId);
                console.error(`[SoundBankEngine] Failed to load smplr instrument ${instrumentName}:`, err);
                
                const fallbackSynth = new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: "triangle" },
                    envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 1.0 }
                });
                fallbackSynth.connect(channel);

                trackSamplers.set(trackId, fallbackSynth);
                trackChannels.set(trackId, channel);
                trackMeters.set(trackId, meter);
                resolve();
            }
        });
    }
}
