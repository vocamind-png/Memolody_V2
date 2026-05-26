
import * as Tone from 'tone';
import { TrackState, ParsedNote } from '../types';

import { SoundBankEngine } from '../plugins/soundbank';

export class MusicEngine {
  private trackSamplers: Map<string, Tone.Sampler> = new Map();
  private trackChannels: Map<string, Tone.Channel> = new Map();
  private trackMeters: Map<string, Tone.Meter> = new Map();
  private trackVocalLayers: Map<string, Tone.Player[]> = new Map();
  private trackVocalStems: Map<string, Tone.Player[]> = new Map();
  private trackActiveStem: Map<string, number | null> = new Map();
  private trackModes: Map<string, 'instrument' | 'vocal'> = new Map();
  public vocalAudioElements: Map<string, HTMLAudioElement> = new Map(); // For AI Vocal playback
  private vocalBlobUrls: Map<string, string> = new Map(); // Track pre-fetched local Blob URLs
  public tracks: TrackState[] = [];

  private masterBus: Tone.Gain | null = null;
  private masterGain: Tone.Gain | null = null;
  private masterMeter: Tone.Meter | null = null;

  private metronomeLoop: Tone.Loop | null = null;
  private clickMetronomeEnabled = false;
  private metronomeClickSynth: Tone.MembraneSynth | null = null;
  private vocalLoopId: number | null = null;

  public isInitialized = false;
  public countInDuration = 0;
  public countInTicks = 0;
  public currentNoteId: string = '';      // ID of currently-playing DOM note
  public currentNoteTime: number = 0;     // Unrolled startTime of current note
  public currentMeasure: string = '';     // Measure number of currently-playing note
  private baseStartTime = 0;
  private currentPart: Tone.Part | null = null;
  private loadedSongHash = '';  // Cache to prevent re-loading the same song
  public lastLoadedNotes: ParsedNote[] = []; // Store notes for plugins/rendering

  // ── Loop (Section repeat) ──────────────────────────────────────────────
  private loopStartBeats = 0;
  private loopEndBeats = 0;
  private loopActive = false;

  setLoopEnabled(enabled: boolean) {
    this.loopActive = enabled;
    Tone.Transport.loop = enabled;
    if (enabled && this.loopEndBeats > this.loopStartBeats) {
      this.applyLoop();
    }
  }

  setLoopRange(startBeats: number, endBeats: number) {
    this.loopStartBeats = startBeats;
    this.loopEndBeats = endBeats;
    if (this.loopActive && endBeats > startBeats) {
      this.applyLoop();
    }
  }

  /** Set loop by measure numbers (1-indexed) */
  setLoopPointsByMeasures(startBar: number, endBar: number, beatsPerMeasure: number) {
    const startBeats = (startBar - 1) * beatsPerMeasure + this.countInTicks / Tone.Transport.PPQ;
    const endBeats = endBar * beatsPerMeasure + this.countInTicks / Tone.Transport.PPQ;
    this.setLoopRange(startBeats, endBeats);
  }

  private applyLoop() {
    const bpm = Tone.Transport.bpm.value;
    const startSec = (this.loopStartBeats * 60) / bpm;
    const endSec = (this.loopEndBeats * 60) / bpm;
    Tone.Transport.loopStart = startSec;
    Tone.Transport.loopEnd = endSec;

    // Clear any existing scheduled loop event
    if (this.vocalLoopId !== null) {
      try { Tone.Transport.clear(this.vocalLoopId); } catch (e) {}
      this.vocalLoopId = null;
    }
    
    // Schedule repeating loop event to manually loop the unsynced vocal players
    this.vocalLoopId = Tone.Transport.scheduleRepeat((time) => {
      const songTime = startSec - this.countInDuration;
      const allPlayers: Tone.Player[] = [];
      this.trackVocalLayers.forEach(players => allPlayers.push(...players));
      this.trackVocalStems.forEach(players => allPlayers.push(...players.filter(Boolean)));
      
      allPlayers.forEach(player => {
        if (!player || !player.buffer || !player.buffer.loaded) return;
        player.stop(time);
        const duration = player.buffer.duration;
        if (songTime >= 0 && songTime < duration) {
          player.start(time, songTime);
        }
      });
    }, `${endSec - startSec}`, startSec);
  }

  clearLoop() {
    this.loopActive = false;
    this.loopStartBeats = 0;
    this.loopEndBeats = 0;
    Tone.Transport.loop = false;
    if (this.vocalLoopId !== null) {
      try { Tone.Transport.clear(this.vocalLoopId); } catch (e) {}
      this.vocalLoopId = null;
    }
  }

  constructor() { }

  get transportState() { return Tone.Transport.state; }
  get isSongLoaded() { return this.currentPart !== null; }

  toggleMetronome(enabled: boolean) { this.clickMetronomeEnabled = enabled; }

  /**
   * [NEURAL XML ANALYZER]
   * วิเคราะห์ไฟล์ MusicXML และส่งค่า Metadata พื้นฐานกลับไปเพื่อให้ UI แสดงผลได้ทันที
   */
  parseMusicXml(xmlString: string): {
    notes: ParsedNote[],
    timeSignature: { beats: number, beatType: number },
    partNames: Record<string, string>,
    trackClefs: Record<string, string>,
    metadata: { title: string, artist: string, bpm: number, key: string, fifths?: number }
  } {
    // Default values if XML is missing or empty
    const defaultMeta = { title: 'UNTITLED MATRIX', artist: 'UNKNOWN MAESTRO', bpm: 120, key: 'C', fifths: 0 };

    if (!xmlString || xmlString.trim().length < 10) return {
      notes: [] as ParsedNote[],
      timeSignature: { beats: 4, beatType: 4 },
      partNames: {} as Record<string, string>,
      trackClefs: {} as Record<string, string>,
      metadata: defaultMeta
    };

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // Extract Metadata
    const title = xmlDoc.querySelector("work-title")?.textContent ||
      xmlDoc.querySelector("movement-title")?.textContent ||
      xmlDoc.querySelector("credit-words[type='title']")?.textContent ||
      defaultMeta.title;

    const artist = xmlDoc.querySelector("creator[type='composer']")?.textContent ||
      xmlDoc.querySelector("creator")?.textContent ||
      xmlDoc.querySelector("credit-words[type='composer']")?.textContent ||
      defaultMeta.artist;

    const perMinuteEl = xmlDoc.querySelector("per-minute");
    const soundEl = xmlDoc.querySelector("sound[tempo]");
    let bpm = defaultMeta.bpm;
    if (perMinuteEl) {
      const val = parseFloat(perMinuteEl.textContent || "");
      if (!isNaN(val) && val > 0) bpm = Math.round(val);
    } else if (soundEl) {
      const tempoAttr = soundEl.getAttribute("tempo");
      if (tempoAttr) {
        const val = parseFloat(tempoAttr);
        if (!isNaN(val) && val > 0) bpm = Math.round(val);
      }
    }

    const fifthsNode = xmlDoc.querySelector("fifths");
    const fifths = fifthsNode ? parseInt(fifthsNode.textContent || "0") : 0;
    const modeNode = xmlDoc.querySelector("key mode");
    const isMinor = modeNode?.textContent?.toLowerCase() === 'minor';

    const FIFTHS_TO_MAJOR: Record<number, string> = {
      [-7]: "Cb", [-6]: "Gb", [-5]: "Db", [-4]: "Ab", [-3]: "Eb", [-2]: "Bb", [-1]: "F",
      0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#"
    };
    const FIFTHS_TO_MINOR: Record<number, string> = {
      [-7]: "Abm", [-6]: "Ebm", [-5]: "Bbm", [-4]: "Fm", [-3]: "Cm", [-2]: "Gm", [-1]: "Dm",
      0: "Am", 1: "Em", 2: "Bm", 3: "F#m", 4: "C#m", 5: "G#m", 6: "D#m", 7: "A#m"
    };
    const key = isMinor
      ? (FIFTHS_TO_MINOR[fifths] || defaultMeta.key)
      : (FIFTHS_TO_MAJOR[fifths] || defaultMeta.key);

    // Parse Notes
    const notes: ParsedNote[] = [];
    const partNames: Record<string, string> = {};
    const trackClefs: Record<string, string> = {};
    let beats = 4;
    let beatType = 4;

    try {
      const parts = xmlDoc.querySelectorAll("part");
      parts.forEach((part) => {
        const partId = part.getAttribute("id") || "P1";
        // Escape partId for safe use in selector
        const safePartId = partId.replace(/"/g, '\\"');
        const basePartName = xmlDoc.querySelector(`score-part[id="${safePartId}"] part-name`)?.textContent || "Part";
        let currentTime = 0;
        let divisions = 1; // persists across measures — most MusicXML only declares this in measure 1
        // --- [UNROLL REPEATS — STACK-BASED SIMULATOR] ---
        //
        //  Rules implemented (standard Western music notation):
        //  1.  |:   (forward repeat)  → push current measure onto repeatStack
        //  2.  :|   (backward repeat) → first time: jump back to top of stack, increment pass
        //                               second time: pop stack, continue
        //  3.  [1]  (volta 1)         → play only on pass 1; skip on all subsequent passes
        //  4.  [2]  (volta 2)         → skip on pass 1; play on pass 2
        //  5.  [1,2](combined)        → play on both passes
        //  6. Nested repeats          → each :| goes back to its own matching |: via stack
        //  7. Implicit start          → :| with empty stack repeats from measure 0

        const physicalMeasures = Array.from(part.querySelectorAll("measure"));
        const measureOrder: number[] = [];

        // ── Helpers ──────────────────────────────────────────────────────────
        /** Returns ending numbers (e.g. "1,2" → [1,2]) for all barline endings */
        const getEndingNums = (m: Element): number[] => {
          const nums: number[] = [];
          m.querySelectorAll('barline ending').forEach(e => {
            (e.getAttribute('number') || '').split(',').forEach(s => {
              const n = parseInt(s.trim());
              if (!isNaN(n)) nums.push(n);
            });
          });
          return nums;
        };

        /** True if this measure starts a repeated section |: */
        const hasFwdRepeat = (m: Element) =>
          !!m.querySelector('barline repeat[direction="forward"]');

        /** True if this measure ends a repeated section :| */
        const hasBwdRepeat = (m: Element) =>
          !!m.querySelector('barline repeat[direction="backward"]');

        // ── Simulator state ───────────────────────────────────────────────────
        const repeatStack: number[] = [];          // indices of |: measures
        const passCount = new Map<number, number>(); // repeatStart → current pass (1-based)
        const repeatInited = new Set<number>();    // which |: have been initialized
        const bwdDone = new Set<number>();         // which :| have been taken once

        let cursor = 0;
        const MAX_ITER = physicalMeasures.length * 8; // safety guard
        let iter = 0;

        while (cursor < physicalMeasures.length && iter < MAX_ITER) {
          iter++;
          const m = physicalMeasures[cursor];

          // ── Push |: onto stack (only on first encounter) ──────────────────
          if (hasFwdRepeat(m) && !repeatInited.has(cursor)) {
            repeatInited.add(cursor);
            repeatStack.push(cursor);
            passCount.set(cursor, 1);
          }

          // ── Determine current pass for the inner-most repeat ──────────────
          const innerStart = repeatStack.length > 0 ? repeatStack[repeatStack.length - 1] : -1;
          const currentPass = innerStart >= 0 ? (passCount.get(innerStart) ?? 1) : 1;

          // ── Check volta: should we skip this measure? ─────────────────────
          const endings = getEndingNums(m);
          const shouldSkip = endings.length > 0 && !endings.includes(currentPass);

          if (!shouldSkip) {
            measureOrder.push(cursor);
          }

          // ── Handle :| (backward repeat) ──────────────────────────────────
          if (hasBwdRepeat(m) && !shouldSkip) {
            // Determine where to jump back
            let repeatStart: number;
            if (repeatStack.length > 0) {
              repeatStart = repeatStack[repeatStack.length - 1];
            } else {
              // No explicit |: → treat measure 0 as the implicit start
              repeatStart = 0;
              if (!repeatInited.has(0)) {
                repeatInited.add(0);
                repeatStack.push(0);
                passCount.set(0, 1);
              }
            }

            if (!bwdDone.has(cursor)) {
              // First time hitting this :| → take the repeat
              bwdDone.add(cursor);
              passCount.set(repeatStart, (passCount.get(repeatStart) ?? 1) + 1);
              cursor = repeatStart;
              continue; // jump to top of loop
            } else {
              // Already taken this repeat → pop the stack, continue forward
              if (repeatStack.length > 0 && repeatStack[repeatStack.length - 1] === repeatStart) {
                repeatStack.pop();
                passCount.delete(repeatStart);
              }
            }
          }

          cursor++;
        }

        if (iter >= MAX_ITER) {
          console.warn('[MusicEngine] ⚠️ Repeat unrolling hit safety limit — possible notation error in XML');
        }

        // Process measures in unrolled order
        measureOrder.forEach((mIdx) => {
          const measure = physicalMeasures[mIdx];
          const measureNum = measure.getAttribute("number") || "1";
          const timeNode = measure.querySelector("time");
          if (timeNode) {
            beats = parseInt(timeNode.querySelector("beats")?.textContent || "4");
            beatType = parseInt(timeNode.querySelector("beat-type")?.textContent || "4");
          }
          const divNode = measure.querySelector("attributes divisions");
          if (divNode) {
            divisions = parseInt(divNode.textContent || "1") || 1;
          }

          // Detect Clefs
          const clefNodes = measure.querySelectorAll("attributes clef");
          clefNodes.forEach(clef => {
            const staffNum = clef.getAttribute("number") || "1";
            const sign = clef.querySelector("sign")?.textContent || "G";
            trackClefs[`${partId}-S${staffNum}`] = sign;
          });

          Array.from(measure.children).forEach((child) => {
            if (child.tagName === "backup") {
              const duration = (parseInt(child.querySelector("duration")?.textContent || "0") / divisions);
              currentTime -= duration;
            } else if (child.tagName === "forward") {
              const duration = (parseInt(child.querySelector("duration")?.textContent || "0") / divisions);
              currentTime += duration;
            } else if (child.tagName === "note") {
              const isRest = child.querySelector("rest");
              const isChord = child.querySelector("chord");
              const duration = (parseInt(child.querySelector("duration")?.textContent || "0") / divisions);
              const staff = parseInt(child.querySelector("staff")?.textContent || "1");
              const voice = parseInt(child.querySelector("voice")?.textContent || "1");

              const currentTrackId = `${partId}-S${staff}`;
              if (!partNames[currentTrackId]) {
                const staffSuffix = staff === 1 ? ' (Treble)' : staff === 2 ? ' (Bass)' : ` (Staff ${staff})`;
                partNames[currentTrackId] = `${basePartName}${staffSuffix}`;
              }

              if (!isRest) {
                const step = child.querySelector("step")?.textContent || "C";
                const octaveVal = child.querySelector("octave")?.textContent;
                const octave = octaveVal ? parseInt(octaveVal) : 4;
                const alterVal = child.querySelector("alter")?.textContent;
                const alter = alterVal ? parseInt(alterVal) : 0;

                const safeOctave = isNaN(octave) ? 4 : octave;
                const safeAlter = isNaN(alter) ? 0 : alter;

                // Detect ties: <tie type="stop"/> or <tied type="stop"/>
                const tieElements = child.querySelectorAll("tie");
                const tiedElements = child.querySelectorAll("tied");
                let isTieStop = false;
                tieElements.forEach(t => { if (t.getAttribute("type") === "stop") isTieStop = true; });
                if (!isTieStop) {
                  tiedElements.forEach(t => { if (t.getAttribute("type") === "stop") isTieStop = true; });
                }

                // If this note is tied from the previous note (tie stop),
                // merge by extending the previous note's duration instead of creating a new note.
                if (isTieStop) {
                  // Find the matching previous note with the same pitch in the same track
                  for (let j = notes.length - 1; j >= 0; j--) {
                    const prev = notes[j];
                    if (prev.trackId === currentTrackId && prev.step === step && prev.octave === safeOctave && prev.alter === safeAlter) {
                      prev.duration += isNaN(duration) ? 0.5 : duration;
                      break;
                    }
                  }
                  if (!isChord) currentTime += duration;
                  return; // skip creating a new note for the tied continuation
                }

                // Extract Lyric/Solfege from XML
                let solfegeVal = "";
                const lyricTextNode = child.querySelector("lyric text");
                if (lyricTextNode) {
                  solfegeVal = lyricTextNode.textContent?.trim() || "";
                }

                notes.push({
                  trackId: currentTrackId, step, octave: safeOctave, alter: safeAlter, duration: isNaN(duration) ? 0.5 : duration,
                  startTime: isChord ? (currentTime - (isNaN(duration) ? 0.5 : duration)) : currentTime,
                  solfege: solfegeVal, staff: isNaN(staff) ? 1 : staff, voice: isNaN(voice) ? 1 : voice, measure: measureNum
                });
              }
              if (!isChord) currentTime += duration;
            }
          });
        });

        // Clean up part names if a part only ever had one staff
        const usedStaves = Object.keys(partNames).filter(k => k.startsWith(`${partId}-S`));
        if (usedStaves.length === 1) {
          partNames[usedStaves[0]] = basePartName;
        }
      });
    } catch (e) {
      console.warn('[MusicEngine] Error parsing notes from XML:', e);
    }

    this.lastLoadedNotes = notes;

    return {
      notes,
      timeSignature: { beats, beatType },
      partNames,
      trackClefs,
      metadata: { title: title.trim(), artist: artist.trim(), bpm, key, fifths }
    };
  }

  async ensureInitialized() {
    try {
      if (Tone.getContext().state !== 'running') {
        console.log("[MusicEngine] ensureInitialized: Context state is not running. Resuming with timeout...");
        await Promise.race([
          Promise.all([
            Tone.start(),
            Tone.getContext().resume()
          ]),
          new Promise((resolve) => setTimeout(resolve, 2000))
        ]);
        console.log("[MusicEngine] ensureInitialized: Context state now:", Tone.getContext().state);
      }

      if (!this.isInitialized) {
        // [PERFORMANCE ENGINE TUNING]
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const context = Tone.getContext();

        // Use a higher lookAhead for smoother scheduling on mobile/laggy devices
        // This gives the browser more buffer time to schedule events ahead of processing
        context.lookAhead = isMobile ? 0.6 : 0.2;

        // Slower update interval on mobile saves CPU cycles
        (context as any).updateInterval = isMobile ? 0.1 : 0.03;

        this.masterGain = new Tone.Gain(0.8).toDestination();
        this.masterBus = new Tone.Gain(1).connect(this.masterGain);
        this.masterMeter = new Tone.Meter().connect(this.masterBus);
        await this.initMetronomeClickSynth();
        this.initMetronomeLoop();
        this.isInitialized = true;
      }
      return true;
    } catch (e) {
      console.error("MusicEngine Initialization Failed:", e);
      return false;
    }
  }

  // Generation counter to prevent overlapping vocal players from race conditions
  private _vocalGeneration = 0;

  unlockVocalAudio(trackId: string) {
    let audio = this.vocalAudioElements.get(trackId);
    if (!audio) {
      audio = new Audio();
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      this.vocalAudioElements.set(trackId, audio);
    }
    
    // If it already has a real source, do NOT play/pause it to "unlock" it.
    // We will play it for real when start() or resume() is called synchronously.
    const hasRealSource = audio.src && !audio.src.startsWith('data:');
    if (hasRealSource) {
      console.log(`[MusicEngine] 🔓 HTMLAudio for ${trackId} already has a real source, skipping dummy unlock`);
      return;
    }
    
    if (!audio.src) {
      audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
    }
    
    // Save original mute state
    const originalMuted = audio.muted;
    audio.muted = true; // Mute during unlock to prevent short audio burst/glitch
    
    console.log(`[MusicEngine] 🔓 Synchronously unlocking vocal HTMLAudio for ${trackId}`);
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        audio.pause();
        audio.muted = originalMuted; // Restore original mute state after pause
        console.log(`[MusicEngine] 🔓 HTMLAudio unlocked successfully for ${trackId}`);
      }).catch(e => {
        audio.muted = originalMuted; // Restore on error
        console.warn(`[MusicEngine] ⚠️ HTMLAudio unlock failed/deferred for ${trackId}:`, e);
      });
    }
  }

  async addVocalLayer(trackId: string, audioUrl: string, stemUrls?: string[]) {
    // Increment generation — any previous in-flight loads become stale
    const myGeneration = ++this._vocalGeneration;
    console.log(`[MusicEngine] 🎤 addVocalLayer gen=${myGeneration} track=${trackId}, url=${audioUrl.substring(0, 60)}...`);

    // Ensure Tone.js context and masterBus are initialized
    await this.ensureInitialized();

    // ── Clean up old vocal resources ──
    this.clearVocalLayers(trackId);

    // Ensure track channel exists so the volume/pan/meter routing works
    if (!this.trackChannels.has(trackId) && this.masterBus) {
      const channel = new Tone.Channel(0, 0).connect(this.masterBus);
      const meter = new Tone.Meter();
      channel.connect(meter);
      this.trackChannels.set(trackId, channel);
      this.trackMeters.set(trackId, meter);
    }
    const channel = this.trackChannels.get(trackId)!;

    // Reset/clear any active HTMLAudioElement for this track to prevent duplicate playing
    const oldAudio = this.vocalAudioElements.get(trackId);
    if (oldAudio) {
      oldAudio.pause();
      oldAudio.src = '';
    }

    // Load the main mix layer and any stems in parallel using Tone.Player
    const loadPromises: Promise<void>[] = [];

    // 1. Load Main Mix Player
    let mainPlayer: Tone.Player | null = null;
    if (audioUrl) {
      loadPromises.push(new Promise<void>((resolve) => {
        let resolved = false;
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            console.warn(`[MusicEngine] ⚠️ Tone.Player load timeout (10s) for url=${audioUrl.substring(0, 40)}...`);
            resolve();
          }
        }, 10000);

        const player = new Tone.Player({
          url: audioUrl,
          autostart: false,
          onload: () => {
            clearTimeout(timeoutId);
            if (!resolved) {
              resolved = true;
              if (myGeneration === this._vocalGeneration) {
                mainPlayer = player;
                console.log(`[MusicEngine] ✅ mainPlayer loaded successfully. url=${audioUrl.substring(0, 60)}..., duration: ${player.buffer.duration}s`);
              } else {
                player.dispose();
              }
              resolve();
            }
          },
          onerror: (err) => {
            clearTimeout(timeoutId);
            if (!resolved) {
              resolved = true;
              console.error(`[MusicEngine] ❌ Main mix Tone.Player load error for ${trackId}:`, err);
              resolve(); // Resolve to prevent blocking the user
            }
          }
        }).connect(channel);
      }));
    }

    // 2. Load Stems Players
    const loadedStems: (Tone.Player | null)[] = [];
    if (stemUrls && stemUrls.length > 0) {
      stemUrls.forEach((url, index) => {
        loadPromises.push(new Promise<void>((resolve) => {
          let resolved = false;
          const timeoutId = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.warn(`[MusicEngine] ⚠️ Stem ${index} Tone.Player load timeout (10s)`);
              resolve();
            }
          }, 10000);

          const player = new Tone.Player({
            url: url,
            autostart: false,
            onload: () => {
              clearTimeout(timeoutId);
              if (!resolved) {
                resolved = true;
                if (myGeneration === this._vocalGeneration) {
                  loadedStems[index] = player;
                } else {
                  player.dispose();
                }
                resolve();
              }
            },
            onerror: (err) => {
              clearTimeout(timeoutId);
              if (!resolved) {
                resolved = true;
                console.error(`[MusicEngine] ❌ Stem ${index} Tone.Player load error for ${trackId}:`, err);
                resolve();
              }
            }
          }).connect(channel);
        }));
      });
    }

    await Promise.all(loadPromises);

    // If generation changed during load, discard new nodes
    if (myGeneration !== this._vocalGeneration) {
      console.log(`[MusicEngine] 🗑️ Stale gen=${myGeneration} after loading — discarding players`);
      if (mainPlayer) (mainPlayer as Tone.Player).dispose();
      loadedStems.forEach(p => p?.dispose());
      return;
    }

    if (mainPlayer) {
      this.trackVocalLayers.set(trackId, [mainPlayer]);
    }
    if (loadedStems.length > 0) {
      this.trackVocalStems.set(trackId, loadedStems.filter(Boolean) as Tone.Player[]);
    }

    this.trackModes.set(trackId, 'vocal');
    console.log(`[MusicEngine] 🎤 Vocal layers loaded for track=${trackId}. Main mix: ${!!mainPlayer}, Stems count: ${loadedStems.filter(Boolean).length}`);
  }

  clearVocalLayers(trackId: string) {
    const layers = this.trackVocalLayers.get(trackId);
    if (layers) {
      layers.forEach(p => {
        p.unsync();
        p.dispose();
      });
      this.trackVocalLayers.delete(trackId);
    }
    const stems = this.trackVocalStems.get(trackId);
    if (stems) {
      stems.forEach(p => {
        if (p) {
          p.unsync();
          p.dispose();
        }
      });
      this.trackVocalStems.delete(trackId);
    }
    this.trackActiveStem.set(trackId, null);

    // Revoke and clear blob URLs
    const oldUrl = this.vocalBlobUrls.get(trackId);
    if (oldUrl) {
      try { URL.revokeObjectURL(oldUrl); } catch(e){}
      this.vocalBlobUrls.delete(trackId);
    }
  }

  public soloStem(trackId: string, stemIndex: number | null) {
    this.trackActiveStem.set(trackId, stemIndex);
    const layers = this.trackVocalLayers.get(trackId);
    const stems = this.trackVocalStems.get(trackId);
    
    if (stemIndex === null) {
      // Un-solo: mute stems, unmute main mix
      if (layers) layers.forEach(p => p.volume.value = 0);
      if (stems) stems.forEach(p => { if (p) p.volume.value = -100; });
    } else {
      // Solo a stem: mute main mix and other stems, unmute active stem
      if (layers) layers.forEach(p => p.volume.value = -100);
      if (stems) {
        stems.forEach((p, i) => {
          if (p) p.volume.value = (i === stemIndex) ? 0 : -100;
        });
      }
    }
  }
  
  public getAvailableStems(trackId: string): number {
    return this.trackVocalStems.get(trackId)?.length || 0;
  }
  
  public getActiveStem(trackId: string): number | null {
    return this.trackActiveStem.get(trackId) ?? null;
  }

  async initSampler(trackId: string, trackName: string = "Piano", pluginSettings?: any, trackMode?: 'instrument' | 'vocal'): Promise<void> {
    console.log(`[MusicEngine] [initSampler] starting for trackId=${trackId} trackName=${trackName} mode=${trackMode}`);
    await this.ensureInitialized();

    const currentMode = this.trackModes.get(trackId);
    const requestedMode = trackMode || 'instrument';
    console.log(`[MusicEngine] [initSampler] trackId=${trackId} currentMode=${currentMode} requestedMode=${requestedMode}`);

    // If requested mode is vocal AND we already have a vocal layer loaded, we don't need a sampler
    if (requestedMode === 'vocal' && this.trackVocalLayers.has(trackId)) {
      if (this.trackSamplers.has(trackId)) {
        console.log(`[MusicEngine] [initSampler] disposing sampler for trackId=${trackId} because vocal layer is active`);
        // Only dispose the sampler, NOT the channel — the vocal Tone.Player routes through the channel
        const sampler = this.trackSamplers.get(trackId);
        if (sampler) {
          try { (sampler as any).releaseAll?.(); } catch (e) { }
          try { sampler.disconnect(); sampler.dispose(); } catch (e) { }
          this.trackSamplers.delete(trackId);
        }
      }
      this.trackModes.set(trackId, 'vocal');
      
      // Ensure channel and meter exist for this vocal track
      if (!this.trackChannels.has(trackId) && this.masterBus) {
        console.log(`[MusicEngine] [initSampler] creating channel/meter for vocal trackId=${trackId}`);
        const channel = new Tone.Channel(0, 0).connect(this.masterBus);
        const meter = new Tone.Meter();
        channel.connect(meter);
        this.trackChannels.set(trackId, channel);
        this.trackMeters.set(trackId, meter);
      }
      return;
    }

    // Skip if already initialized for the SAME mode
    if (this.trackSamplers.has(trackId) && currentMode === requestedMode) {
      console.log(`[MusicEngine] [initSampler] skipping already initialized trackId=${trackId}`);
      return;
    }

    // If mode changed, dispose old sampler first
    if (this.trackSamplers.has(trackId) && currentMode !== requestedMode) {
      console.log(`[MusicEngine] [initSampler] disposing old sampler for trackId=${trackId} due to mode change`);
      this.disposeSampler(trackId);
    }

    try {
      console.log(`[MusicEngine] [initSampler] calling SoundBankEngine.createInstrumentChannel for trackId=${trackId}`);
      // 🎹 SoundBank Instrument Engine
      await SoundBankEngine.createInstrumentChannel(
        trackId,
        trackName,
        pluginSettings,
        this.masterBus,
        this.trackSamplers,
        this.trackChannels,
        this.trackMeters
      );
      console.log(`[MusicEngine] [initSampler] channel created for trackId=${trackId}`);
      this.trackModes.set(trackId, requestedMode);
    } catch (e) {
      console.error(`[MusicEngine] ❌ [initSampler] Failed for track ${trackId}:`, e);
    }
  }

  /**
   * Dispose a single track's audio nodes (sampler, channel, meter)
   */
  private disposeSampler(trackId: string) {
    const sampler = this.trackSamplers.get(trackId);
    if (sampler) {
      try { (sampler as any).releaseAll?.(); } catch (e) { }
      try { sampler.disconnect(); sampler.dispose(); } catch (e) { }
      this.trackSamplers.delete(trackId);
    }
    const channel = this.trackChannels.get(trackId);
    if (channel) {
      try { channel.disconnect(); channel.dispose(); } catch (e) { }
      this.trackChannels.delete(trackId);
    }
    const meter = this.trackMeters.get(trackId);
    if (meter) {
      try { meter.disconnect(); meter.dispose(); } catch (e) { }
      this.trackMeters.delete(trackId);
    }
  }

  /**
   * Switch a track between instrument and vocal mode during playback.
   * This disposes the old sampler and creates a new one.
   */
  async switchTrackMode(trackId: string, trackName: string, newMode: 'instrument' | 'vocal', pluginSettings?: any): Promise<void> {
    await this.initSampler(trackId, trackName, pluginSettings, newMode);
    // Invalidate song cache so notes are re-scheduled to the new sampler
    this.loadedSongHash = '';
  }

  private async initMetronomeClickSynth() {
    // 🪵 Small Wood box sound simulation using MembraneSynth
    // High pitch + short decay = "Tok" sound
    this.metronomeClickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.005,
      octaves: 1,
      envelope: {
        attack: 0.001,
        decay: 0.05,
        sustain: 0
      },
      volume: -10
    }).toDestination();
  }

  private initMetronomeLoop() {
    if (this.metronomeLoop) return;
    this.metronomeLoop = new Tone.Loop((time) => {
      if (this.clickMetronomeEnabled && this.metronomeClickSynth) {
        const pos = Tone.Transport.position.toString().split(':');
        const isDownbeat = parseInt(pos[1]) === 0;
        this.metronomeClickSynth.triggerAttackRelease(isDownbeat ? "C6" : "G5", "32n", time);
      }
    }, "4n").start(0);
  }

  setMasterVolume(vol: number) { if (this.masterGain) this.masterGain.gain.rampTo(vol, 0.1); }
  setBpm(bpm: number) { if (bpm >= 20 && bpm <= 400) Tone.Transport.bpm.rampTo(bpm, 0.05); }

  updateTrackStates(tracks: TrackState[]) {
    this.tracks = tracks;
    const hasSolo = tracks.some(tr => tr.isSolo);
    tracks.forEach(t => {
      const channel = this.trackChannels.get(t.id);
      if (channel) {
        const vol = typeof t.volume === 'number' ? t.volume : 0.8;
        const pan = typeof t.pan === 'number' ? t.pan : 0;
        const db = vol <= 0 ? -100 : 20 * Math.log10(vol);
        channel.volume.rampTo(db, 0.1);
        channel.pan.rampTo(pan, 0.1);
        channel.mute = t.isMuted || (hasSolo && !t.isSolo);

        // If in vocal mode and we actually have a vocal layer loaded, instrument sampler should be silent
        const sampler = this.trackSamplers.get(t.id);
        if (sampler && sampler.volume) {
          const audio = this.vocalAudioElements.get(t.id);
          const hasRealVocal = (audio && audio.src && !audio.src.startsWith('data:')) || this.trackVocalLayers.has(t.id);
          sampler.volume.value = (t.mode === 'vocal' && hasRealVocal) ? -100 : 0;
        }
      }

      const activeStemIdx = this.trackActiveStem.get(t.id) ?? null;
      const isVocalPlaying = t.mode === 'vocal' && !t.isMuted && (!hasSolo || t.isSolo);
      console.log(`[MusicEngine] updateTrackStates t.id=${t.id}: mode=${t.mode}, isMuted=${t.isMuted}, isVocalPlaying=${isVocalPlaying}, activeStemIdx=${activeStemIdx}, vocalPlayersCount=${this.trackVocalLayers.get(t.id)?.length || 0}`);

      // Sync vocal layer volume and mute states dynamically
      const vocalPlayers = this.trackVocalLayers.get(t.id);
      if (vocalPlayers) {
        vocalPlayers.forEach((p, idx) => {
          const isMainLayerActive = isVocalPlaying && (activeStemIdx === null);
          p.volume.value = isMainLayerActive ? 0 : -100;
          console.log(`[MusicEngine] vocalPlayer #${idx} (main): isMainLayerActive=${isMainLayerActive}, volume=${p.volume.value}`);
        });
      }

      // Sync HTMLAudio vocal element volume and mute states dynamically
      const audio = this.vocalAudioElements.get(t.id);
      if (audio) {
        const isMainLayerActive = isVocalPlaying && (activeStemIdx === null);
        const vol = typeof t.volume === 'number' ? t.volume : 0.8;
        audio.volume = isMainLayerActive ? vol : 0.0;
        audio.muted = !isMainLayerActive;
        console.log(`[MusicEngine] HTMLAudio vocal element: isMainLayerActive=${isMainLayerActive}, volume=${audio.volume}, muted=${audio.muted}`);
      }

      const vocalStems = this.trackVocalStems.get(t.id);
      if (vocalStems) {
        vocalStems.forEach((p, i) => {
          if (p) {
            const isStemActive = isVocalPlaying && (activeStemIdx === i);
            p.volume.value = isStemActive ? 0 : -100;
            console.log(`[MusicEngine] vocalStem #${i}: isStemActive=${isStemActive}, volume=${p.volume.value}`);
          }
        });
      }


      if (t.mode) this.trackModes.set(t.id, t.mode);
    });
  }

  public updateVocalPlaybackState(time?: number) {
    const transportState = Tone.Transport.state;
    const transportSeconds = Tone.Transport.seconds;
    const countIn = this.countInDuration || 0;
    const songTime = transportSeconds - countIn;
    const triggerTime = time !== undefined ? time : Tone.now();

    const allPlayers: Tone.Player[] = [];
    this.trackVocalLayers.forEach(players => allPlayers.push(...players));
    this.trackVocalStems.forEach(players => allPlayers.push(...players.filter(Boolean)));

    console.log(`[MusicEngine] updateVocalPlaybackState: transportState=${transportState}, transportSeconds=${transportSeconds}, songTime=${songTime}, playersCount=${allPlayers.length}`);

    if (transportState === 'started') {
      allPlayers.forEach((player, idx) => {
        const isLoaded = player && player.buffer && player.buffer.loaded;
        console.log(`[MusicEngine] player #${idx} play check: loaded=${isLoaded}`);
        if (!player || !player.buffer || !player.buffer.loaded) return;
        
        try { player.stop(triggerTime); } catch (e) {}

        // Enforce correct volume level robustly right before starting to play
        const track = this.tracks.find(t => 
          (this.trackVocalLayers.get(t.id) || []).includes(player) || 
          (this.trackVocalStems.get(t.id) || []).includes(player)
        );
        
        const hasSolo = this.tracks.some(tr => tr.isSolo);
        const isTrackPlaying = track ? (!track.isMuted && (!hasSolo || track.isSolo)) : true;
        
        let isPlayerActive = isTrackPlaying;
        if (track) {
          const activeStemIdx = this.trackActiveStem.get(track.id) ?? null;
          const layers = this.trackVocalLayers.get(track.id) || [];
          if (layers.includes(player)) {
            isPlayerActive = isTrackPlaying && (activeStemIdx === null);
          } else {
            const stems = this.trackVocalStems.get(track.id) || [];
            const stemIdx = stems.indexOf(player);
            isPlayerActive = isTrackPlaying && (activeStemIdx === stemIdx);
          }
        }

        player.volume.value = isPlayerActive ? 0 : -100;
        console.log(`[MusicEngine] player #${idx}: isPlayerActive=${isPlayerActive}, volume enforced=${player.volume.value}`);

        const offsetInAudio = Math.max(0, songTime);
        const duration = player.buffer.duration;
        console.log(`[MusicEngine] player #${idx}: offsetInAudio=${offsetInAudio}, duration=${duration}`);
        if (offsetInAudio < duration) {
          if (songTime < 0) {
            const delay = -songTime;
            player.start(triggerTime + delay, 0);
            console.log(`[MusicEngine] player #${idx}: started with count-in delay ${delay}`);
          } else {
            player.start(triggerTime, offsetInAudio);
            console.log(`[MusicEngine] player #${idx}: started at offset ${offsetInAudio}`);
          }
        }
      });
    } else {
      allPlayers.forEach((player, idx) => {
        console.log(`[MusicEngine] player #${idx}: stopping`);
        try { player.stop(triggerTime); } catch (e) {}
      });
    }
  }

  getTrackLevel(trackId: string): number {
    const isVocalMode = this.trackModes.get(trackId) === 'vocal';
    if (isVocalMode) {
      const audio = this.vocalAudioElements.get(trackId);
      if (audio && !audio.paused && !audio.muted && audio.volume > 0) {
        // Return a randomized level between 0.15 and 0.65 to animate the meter
        return 0.15 + Math.random() * 0.5;
      }
    }
    const meter = this.trackMeters.get(trackId);
    if (!meter) return 0;
    const val = meter.getValue();
    const db = Array.isArray(val) ? val[0] : val;
    return Math.pow(10, db / 20);
  }

  get transportSeconds() { return Math.max(0, Tone.Transport.seconds - this.countInDuration); }

  get transportMusicalTime() {
    return Math.max(0, Tone.Transport.ticks - this.countInTicks) / Tone.Transport.PPQ;
  }

  setTransportSeconds(s: number) {
    this.baseStartTime = Math.max(0, s);
    Tone.Transport.seconds = this.baseStartTime + this.countInDuration;
    // 🎤 Sync HTMLAudio vocal elements to new position
    this.vocalAudioElements.forEach(audio => {
      audio.currentTime = s;
      if (Tone.Transport.state === 'started') {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    });
    this.updateVocalPlaybackState();
  }

  async loadSong(notes: ParsedNote[], tracks: TrackState[] = [], transpose = 0, timeSignature: { beats: number } = { beats: 4 }, isMetronomeOn = false) {
    this.tracks = tracks;
    console.log("[MusicEngine] [loadSong] starting...", { notesCount: notes.length, tracksCount: tracks.length });
    await this.ensureInitialized();
    console.log("[MusicEngine] [loadSong] ensureInitialized done");
    
    // Filter out invalid or corrupted notes before processing or scheduling
    const validNotes = (notes || []).filter(n => 
      n && 
      typeof n.startTime === 'number' && isFinite(n.startTime) && n.startTime >= 0 &&
      typeof n.duration === 'number' && isFinite(n.duration) && n.duration > 0 &&
      typeof n.step === 'string' && n.step.trim().length > 0
    );

    this.lastLoadedNotes = validNotes; // Cache for plugins/rendering
    if (validNotes.length === 0) {
      console.warn("[MusicEngine] [loadSong] No valid notes found after filtering, returning");
      return;
    }

    // Generate a hash to check if data actually changed
    const hash = `${validNotes.length}-${transpose}-${isMetronomeOn}-${tracks.map(t => t.id + t.mode).join(',')}`;

    // — If it's the same data, just update track states and skip the heavy Part rebuild
    // DISABLED: Always rebuild to ensure latest event schema (measure field etc.)
    // if (hash === this.loadedSongHash && this.currentPart) {
    //   this.updateTrackStates(tracks);
    //   return;
    // }

    // Dispose old part first
    if (this.currentPart) {
      console.log("[MusicEngine] [loadSong] Disposing old Tone.Part");
      this.currentPart.dispose();
      this.currentPart = null;
    }

    // Initialize samplers only for tracks that don't already have one
    console.log("[MusicEngine] [loadSong] Initializing samplers...");
    const initPromises = tracks.map(t => {
      return this.initSampler(t.id, t.name, t.pluginSettings, t.mode);
    });
    await Promise.all(initPromises);
    console.log("[MusicEngine] [loadSong] Samplers initialized!");

    const beatDuration = 60 / Tone.Transport.bpm.value;
    // Count-in = 2 bars (gives musician time to prepare)
    this.countInDuration = isMetronomeOn ? (timeSignature.beats * 2 * beatDuration) : 0;
    this.countInTicks = isMetronomeOn ? (timeSignature.beats * 2 * Tone.Transport.PPQ) : 0;

    // Pre-calculate seconds instead of using tick string for smoother scheduling
    const ppq = Tone.Transport.PPQ;
    const bpmVal = Tone.Transport.bpm.value;
    const ticksToSeconds = (ticks: number) => (ticks / ppq) * (60 / bpmVal);

    const events = validNotes.map(n => {
      const startTicks = n.startTime * ppq + this.countInTicks;
      const durTicks = n.duration * ppq;
      return {
        time: ticksToSeconds(startTicks),
        duration: ticksToSeconds(durTicks),
        trackId: n.trackId,
        freq: this.calculateNoteFrequency(n, transpose),
        noteId: (n as any).id || '',          // DOM note ID from svgNoteMap
        unrolledTime: n.startTime,            // Unrolled position in beats
        measure: n.measure || ''              // Measure number string (e.g. "5")
      };
    });

    this.currentPart = new Tone.Part((time, event) => {
      // Play the sampler if:
      // 1. The track mode is NOT 'vocal'
      // 2. OR the track mode is 'vocal' but NO vocal layer is currently loaded for it
      //    (either via Tone.Player or HTMLAudioElement)
      const isVocalMode = this.trackModes.get(event.trackId) === 'vocal';
      const audioEl = this.vocalAudioElements.get(event.trackId);
      const hasRealAudio = audioEl && audioEl.src && !audioEl.src.startsWith('data:');
      const hasVocalLayer = this.trackVocalLayers.has(event.trackId) || hasRealAudio;
      
      if (!isVocalMode || !hasVocalLayer) {
        const sampler = this.trackSamplers.get(event.trackId);
        if (sampler) {
          sampler.triggerAttackRelease(event.freq, event.duration, time, 0.75);
        }
      }

      // Always track which note is currently active for laser sync (even in vocal mode)
      this.currentNoteId = event.noteId || '';
      this.currentNoteTime = event.unrolledTime;
      this.currentMeasure = event.measure || '';
    }, events).start(0);

    // Cache the hash
    this.loadedSongHash = hash;

    // Ensure initial volumes/pan/mute are set
    this.updateTrackStates(tracks);

    // Sync vocal players to the updated transport position/state
    this.updateVocalPlaybackState();

    Tone.Transport.seconds = this.baseStartTime + this.countInDuration;
  }

  private calculateNoteFrequency(n: ParsedNote, transpose: number): number {
    if (!n || typeof n.step !== 'string') return 261.63; // Default to Middle C
    const stepIdx = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(n.step.toUpperCase());
    const octave = typeof n.octave === 'number' && isFinite(n.octave) ? n.octave : 4;
    const alter = typeof n.alter === 'number' && isFinite(n.alter) ? n.alter : 0;
    const midi = (octave + 1) * 12 + (stepIdx === -1 ? 0 : stepIdx) + alter + transpose;
    return Tone.Frequency(midi, "midi").toFrequency();
  }

  start() {
    console.log("[MusicEngine] start() called");
    
    const runStart = () => {
      if (Tone.Transport.state !== 'started') {
        const songOffset = Math.max(0, Tone.Transport.seconds - this.countInDuration);
        console.log("[MusicEngine] starting Tone.Transport, songOffset=", songOffset);
        
        // Start HTMLAudio vocal layers synchronously at the correct song position
        this.vocalAudioElements.forEach((audio, trackId) => {
          try {
            // Check if track is vocal and not muted
            const track = this.tracks.find(t => t.id === trackId);
            const isVocalPlaying = track && track.mode === 'vocal' && !track.isMuted;
            
            if (isVocalPlaying && audio.src && !audio.src.startsWith('data:')) {
              // Bypasses HTMLAudioElement play if a working Tone.Player layer already handles the audio
              const hasTonePlayer = this.trackVocalLayers.has(trackId) && this.trackVocalLayers.get(trackId)!.some(p => p.buffer && p.buffer.loaded);
              if (hasTonePlayer) {
                console.log(`[MusicEngine] Skipping HTMLAudio play for track ${trackId} because Tone.Player fallback is loaded.`);
                return;
              }

              audio.currentTime = Math.min(songOffset, Math.max(0, (isFinite(audio.duration) ? audio.duration - 0.01 : 0)));
              audio.play().catch(e => {
                console.warn('[MusicEngine] Vocal audio.play() failed:', e);
                window.dispatchEvent(new CustomEvent('vocal-playback-blocked', { detail: { error: e } }));
              });
            }
          } catch (e) { console.warn('[MusicEngine] Vocal start error:', e); }
        });

        // Start Tone.Transport immediately
        Tone.Transport.start();
        console.log("[MusicEngine] Tone.Transport started!");

        // Start unsynced vocal players (stems)
        this.updateVocalPlaybackState(Tone.now());
      }
    };

    try {
      if (Tone.getContext().state !== 'running') {
        Tone.start();
        Tone.getContext().resume();
      }
    } catch (e) {}

    if (this.isInitialized) {
      runStart();
    } else {
      this.ensureInitialized().then(() => {
        runStart();
      });
    }
  }

  // Resume from paused position (synchronous version for user gesture compliance)
  resume() {
    this.ensureInitialized().catch(e => console.error('[MusicEngine] resume init failed:', e));
    if (Tone.Transport.state === 'paused') {
      const offset = Math.max(0, Tone.Transport.seconds - this.countInDuration);

      this.vocalAudioElements.forEach((audio, trackId) => {
        try {
          // Check if track is vocal and not muted
          const track = this.tracks.find(t => t.id === trackId);
          const isVocalPlaying = track && track.mode === 'vocal' && !track.isMuted;
          
          if (isVocalPlaying && audio.src && !audio.src.startsWith('data:')) {
            const hasTonePlayer = this.trackVocalLayers.has(trackId) && this.trackVocalLayers.get(trackId)!.some(p => p.buffer && p.buffer.loaded);
            if (hasTonePlayer) {
              console.log(`[MusicEngine] Skipping HTMLAudio resume for track ${trackId} because Tone.Player fallback is loaded.`);
              return;
            }

            audio.currentTime = offset;
            audio.play().catch(e => {
              console.warn('[MusicEngine] Vocal audio.play() resume failed:', e);
              window.dispatchEvent(new CustomEvent('vocal-playback-blocked', { detail: { error: e } }));
            });
          }
        } catch (e) { console.warn('[MusicEngine] Vocal resume error:', e); }
      });

      Tone.Transport.start();

      // Resume unsynced vocal players (stems)
      this.updateVocalPlaybackState(Tone.now());
    }
  }

  pause() {
    Tone.Transport.pause();
    this.vocalAudioElements.forEach(audio => {
      audio.pause();
    });
    // Stop unsynced vocal players
    this.updateVocalPlaybackState();
  }

  /**
   * FULL RESET — stops transport, disposes Part + all samplers,
   * clears caches. Call this when switching to a different song.
   */
  stopAndClear() {
    // 1. Stop transport completely
    Tone.Transport.stop();
    Tone.Transport.cancel(); // Cancel all scheduled events

    // 2. Dispose the current Part (scheduled note events)
    if (this.currentPart) {
      this.currentPart.dispose();
      this.currentPart = null;
    }

    // 3. Dispose all track samplers, channels, meters
    this.trackSamplers.forEach((sampler, id) => {
      try { (sampler as any).releaseAll?.(); } catch (e) { }
      try { sampler.disconnect(); sampler.dispose(); } catch (e) { }
    });
    this.trackSamplers.clear();

    this.trackChannels.forEach((channel) => {
      try { channel.disconnect(); channel.dispose(); } catch (e) { }
    });
    this.trackChannels.clear();

    this.trackMeters.forEach((meter) => {
      try { meter.disconnect(); meter.dispose(); } catch (e) { }
    });
    this.trackMeters.clear();

    // 4. Dispose all vocal layers and stems (unsync from Transport first)
    this.trackVocalLayers.forEach(layers => {
      layers.forEach(player => {
        try { player.unsync(); } catch (e) {}
        try { if (player.state === 'started') player.stop(); } catch (e) {}
        try { player.dispose(); } catch (e) { }
      });
    });
    this.trackVocalLayers.clear();
    
    this.trackVocalStems.forEach(stems => {
      stems.forEach(player => {
        if (!player) return;
        try { player.unsync(); } catch (e) {}
        try { if (player.state === 'started') player.stop(); } catch (e) {}
        try { player.dispose(); } catch (e) { }
      });
    });
    this.trackVocalStems.clear();
    this.trackActiveStem.clear();
    
    this.trackModes.clear();

    // 5. Clear cache hash so next loadSong will rebuild everything
    this.loadedSongHash = '';

    // 6. Reset position trackers
    this.baseStartTime = 0;
    this.currentNoteId = '';
    this.currentNoteTime = 0;
    this.currentMeasure = '';
    this.countInDuration = 0;
    this.countInTicks = 0;

    // 7. Clear loop
    this.clearLoop();

    // 8. Clear vocal audio elements
    this.vocalAudioElements.forEach(audio => {
      audio.pause();
      audio.src = '';
    });
    this.vocalAudioElements.clear();

    // Revoke and clear all blob URLs
    this.vocalBlobUrls.forEach(url => {
      try { URL.revokeObjectURL(url); } catch(e){}
    });
    this.vocalBlobUrls.clear();

    // Removed vocalAudioSourceNodes cleanup

    // 9. Reset transport position
    Tone.Transport.seconds = 0;

    console.log('[MusicEngine] 🧹 stopAndClear — all song data purged');
  }
}
export const musicEngine = new MusicEngine();
