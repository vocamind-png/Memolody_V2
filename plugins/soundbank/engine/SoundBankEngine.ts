import * as Tone from 'tone';
import { SoundBankSettings } from '../types';

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

            const nameL = trackName.toLowerCase();
            const instrument = settings?.instrument || 'HD Grand Piano';
            const isOrchestra = nameL.includes('orchestr') || nameL.includes('string') || instrument.includes('String');
            const isSynth = instrument.includes('Wave') || instrument.includes('Pluck');

            if (isOrchestra || isSynth) {
                const synthType = isSynth ? (instrument.includes('Pluck') ? "square" : "sine") : "sine";
                const polySynth = new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: synthType },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 1.5 }
                });

                const channel = new Tone.Channel(0, 0).connect(masterBus);
                const meter = new Tone.Meter().connect(channel);
                polySynth.connect(channel);

                trackSamplers.set(trackId, polySynth as any);
                trackChannels.set(trackId, channel);
                trackMeters.set(trackId, meter);
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

                    // console.log("[SoundBank] Generating High-Quality Reverb IR...");
                    await this.sharedReverb.generate();
                    this.reverbReady = true;
                } catch (e) {
                    console.warn("Reverb failed, connecting directly to masterBus");
                    this.sharedReverb = null;
                }
            }

            // On mobile, we use masterBus directly (Dry) to save CPU
            const connectTarget = (isMobile ? masterBus : (this.sharedReverb || masterBus));

            // Piano Sampler Engine — use fewer samples for faster loading
            console.log(`[SoundBankEngine] Creating Tone.Sampler for trackId=${trackId}...`);
            let resolved = false;

            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn(`[SoundBankEngine] ⚠️ Sampler loading timed out (8s) for trackId=${trackId}, falling back to basic Synth`);
                    try {
                        sampler.dispose();
                    } catch (err) {
                        console.warn("[SoundBankEngine] Failed to dispose timed-out sampler:", err);
                    }

                    const channel = new Tone.Channel(0, 0).connect(connectTarget);
                    const meter = new Tone.Meter().connect(channel);
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
            }, 8000);

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
                baseUrl: "https://tonejs.github.io/audio/salamander/",
                onload: () => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeoutId);
                    console.log(`[SoundBankEngine] Tone.Sampler loaded successfully for trackId=${trackId}`);
                    const channel = new Tone.Channel(0, 0).connect(connectTarget);
                    const meter = new Tone.Meter().connect(channel);
                    sampler.connect(channel);

                    trackSamplers.set(trackId, sampler);
                    trackChannels.set(trackId, channel);
                    trackMeters.set(trackId, meter);
                    resolve();
                },
                onerror: (e) => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeoutId);
                    console.error(`[SoundBankEngine] Sampler loading failed for trackId=${trackId}, falling back to basic Synth:`, e);
                    const channel = new Tone.Channel(0, 0).connect(connectTarget);
                    const meter = new Tone.Meter().connect(channel);
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
        });
    }
}
