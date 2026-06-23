import * as Tone from 'tone';
import { Soundfont } from 'smplr';
import { SoundBankSettings } from '../types';

class SmplrWrapper {
    constructor(private sf: any) {}

    triggerAttackRelease(freq: string | number, duration: number, time: number, velocity: number = 0.75) {
        const noteStr = typeof freq === 'number' ? Tone.Frequency(freq).toNote() : freq;
        this.sf.start({
            note: noteStr,
            time: time,
            duration: duration,
            velocity: Math.max(1, Math.floor(velocity * 127))
        });
    }

    dispose() {
        try {
            // Optional: Handle cleanup if smplr exposes it
        } catch (e) {}
    }
}

export class SoundBankEngine {
    // Cache the reverb instance so it's only created once
    private static sharedReverb: Tone.Reverb | null = null;
    private static reverbReady = false;
    private static soundfontCache = new Map<string, any>();

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

            const instrumentName = settings?.instrument || 'acoustic_grand_piano';
            console.log(`[SoundBankEngine] Loading smplr instrument: ${instrumentName} for trackId=${trackId}...`);

            let resolved = false;

            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn(`[SoundBankEngine] ⚠️ Sampler loading timed out (8s) for trackId=${trackId}, falling back to basic Synth`);
                    
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

            try {
                const ctx = Tone.getContext().rawContext as AudioContext;
                
                // We use a native GainNode to bridge smplr's native AudioNode output into Tone.js's channel
                const nativeGain = ctx.createGain();
                Tone.connect(nativeGain, channel);

                let sf = this.soundfontCache.get(instrumentName);
                if (!sf) {
                    sf = new Soundfont(ctx, { instrument: instrumentName as any });
                    this.soundfontCache.set(instrumentName, sf);
                }

                await sf.loaded();

                if (resolved) return;
                resolved = true;
                clearTimeout(timeoutId);

                // Add the nativeGain to smplr's output destinations
                sf.output.addAudioNode(nativeGain);

                const wrapper = new SmplrWrapper(sf);
                
                trackSamplers.set(trackId, wrapper);
                trackChannels.set(trackId, channel);
                trackMeters.set(trackId, meter);
                
                console.log(`[SoundBankEngine] Successfully loaded and connected smplr instrument: ${instrumentName}`);
                resolve();

            } catch (err) {
                if (resolved) return;
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
