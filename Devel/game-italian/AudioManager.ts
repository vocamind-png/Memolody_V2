import * as Tone from 'tone';

export class AudioManager {
  private static instance: AudioManager;
  private isInitialized = false;

  private slideSynth: Tone.Synth;
  private tromboneSynth: Tone.FMSynth;
  private noiseSynth: Tone.NoiseSynth;

  private constructor() {
    this.slideSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 1 }
    }).toDestination();

    this.tromboneSynth = new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 5,
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.1, decay: 0.3, sustain: 0.4, release: 1.2 },
      modulation: { type: 'square' },
      modulationEnvelope: { attack: 0.1, decay: 0.2, sustain: 0.2, release: 0.5 }
    }).toDestination();

    this.noiseSynth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.5, decay: 0.5, sustain: 1, release: 2 }
    }).toDestination();
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  public async init() {
    if (!this.isInitialized) {
      await Tone.start();
      this.isInitialized = true;
    }
  }

  public playMistakeComedySound() {
    // Randomize between slide and trombone
    const choice = Math.random();
    if (choice > 0.5) {
      // Slide down (like a slide whistle)
      const now = Tone.now();
      this.slideSynth.triggerAttack('C5', now);
      this.slideSynth.frequency.rampTo('C2', 0.5, now);
      this.slideSynth.triggerRelease(now + 0.5);
    } else {
      // Sad trombone (wa wa wa waaa)
      const now = Tone.now();
      this.tromboneSynth.triggerAttackRelease('Eb2', '8n', now);
      this.tromboneSynth.triggerAttackRelease('D2', '8n', now + 0.3);
      this.tromboneSynth.triggerAttackRelease('Db2', '8n', now + 0.6);
      this.tromboneSynth.triggerAttackRelease('C2', '2n', now + 0.9);
    }
  }

  public playSuccessCheer() {
    // Simulate cheering with noise synth
    const now = Tone.now();
    this.noiseSynth.triggerAttackRelease('2n', now);
  }
}
