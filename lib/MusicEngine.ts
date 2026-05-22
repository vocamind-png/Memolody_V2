
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

  private masterBus: Tone.Gain | null = null;
  private masterGain: Tone.Gain | null = null;
  private masterMeter: Tone.Meter | null = null;

  private metronomeLoop: Tone.Loop | null = null;
  private clickMetronomeEnabled = false;
  private metronomeClickSynth: Tone.MembraneSynth | null = null;

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
    const ppq = Tone.Transport.PPQ;
    const bpm = Tone.Transport.bpm.value;
    const toSec = (beats: number) => (beats / ppq) * (60 / bpm) * ppq; // beats → ticks → seconds
    // Tone.Transport.loopStart/End accept seconds or "bars:beats:16ths"
    Tone.Transport.loopStart = (this.loopStartBeats * 60) / Tone.Transport.bpm.value;
    Tone.Transport.loopEnd = (this.loopEndBeats * 60) / Tone.Transport.bpm.value;
  }

  clearLoop() {
    this.loopActive = false;
    this.loopStartBeats = 0;
    this.loopEndBeats = 0;
    Tone.Transport.loop = false;
  }

  constructor() { }

  get transportState() { return Tone.Transport.state; }

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

    const metronomeNode = xmlDoc.querySelector("per-minute");
    const bpm = metronomeNode ? parseInt(metronomeNode.textContent || "120") : defaultMeta.bpm;

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
        await Tone.start();
        await Tone.getContext().resume();
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

  async addVocalLayer(trackId: string, audioUrl: string, stemUrls?: string[]) {
    // Increment generation — any previous in-flight loads become stale
    const myGeneration = ++this._vocalGeneration;
    console.log(`[MusicEngine] 🎤 addVocalLayer gen=${myGeneration} track=${trackId}, url=${audioUrl.substring(0, 60)}..., stems=${stemUrls?.length || 0}`);

    // Ensure Tone.js context and masterBus are initialized
    await this.ensureInitialized();

    // Clean up old Tone.Player layers
    this.clearVocalLayers(trackId);

    // Ensure track channel exists so the players can connect to it immediately
    if (!this.trackChannels.has(trackId) && this.masterBus) {
      console.log(`[MusicEngine] 🎤 creating channel/meter for vocal trackId=${trackId} inside addVocalLayer`);
      const channel = new Tone.Channel(0, 0).connect(this.masterBus);
      const meter = new Tone.Meter().connect(channel);
      this.trackChannels.set(trackId, channel);
      this.trackMeters.set(trackId, meter);
    }

    // Wrap in a timeout to prevent hanging forever
    const LOAD_TIMEOUT_MS = 30000;
    
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.warn(`[MusicEngine] ⚠️ addVocalLayer gen=${myGeneration} timed out — resolving anyway`);
        resolve();
      }, LOAD_TIMEOUT_MS);

      const player = new Tone.Player({
        url: audioUrl,
        onload: () => {
          // Check if this generation is still current
          if (myGeneration !== this._vocalGeneration) {
            console.log(`[MusicEngine] 🗑️ Stale gen=${myGeneration} (current=${this._vocalGeneration}) — disposing player`);
            player.dispose();
            clearTimeout(timeoutId);
            resolve();
            return;
          }

          // Connect to track channel to inherit track volume, pan, and effects
          const channel = this.trackChannels.get(trackId);
          if (channel) {
            player.connect(channel);
          } else if (this.masterBus) {
            player.connect(this.masterBus);
          } else {
            player.toDestination();
          }
          
          // Sync to transport timeline precisely at countInDuration
          player.sync().start(this.countInDuration || 0);
          
          this.trackVocalLayers.set(trackId, [player]);
          // Mute the MIDI sampler — vocal replaces instrument playback
          this.trackModes.set(trackId, 'vocal');
          
          // Load individual stems if provided (only if > 1 stem — single stem is same as main)
          if (stemUrls && stemUrls.length > 1) {
            const stems: Tone.Player[] = [];
            let loadedStems = 0;
            stemUrls.forEach((sUrl, idx) => {
              const stemPlayer = new Tone.Player({
                url: sUrl,
                onload: () => {
                  if (myGeneration !== this._vocalGeneration) {
                    stemPlayer.dispose();
                    loadedStems++;
                    if (loadedStems === stemUrls.length) { clearTimeout(timeoutId); resolve(); }
                    return;
                  }
                  const stemChannel = this.trackChannels.get(trackId);
                  if (stemChannel) stemPlayer.connect(stemChannel);
                  else if (this.masterBus) stemPlayer.connect(this.masterBus);
                  else stemPlayer.toDestination();
                  stemPlayer.volume.value = -100; // Muted by default
                  stemPlayer.sync().start(this.countInDuration || 0);
                  stems[idx] = stemPlayer;
                  loadedStems++;
                  if (loadedStems === stemUrls.length) {
                    this.trackVocalStems.set(trackId, stems);
                    console.log(`[MusicEngine] ✅ Vocal synced gen=${myGeneration} for ${trackId} with ${stemUrls.length} stems`);
                    clearTimeout(timeoutId);
                    resolve();
                  }
                },
                onerror: (e) => {
                  console.error(`[MusicEngine] ❌ Stem ${idx} load error:`, e);
                  loadedStems++;
                  if (loadedStems === stemUrls.length) { clearTimeout(timeoutId); resolve(); }
                }
              });
            });
          } else {
            console.log(`[MusicEngine] ✅ Vocal synced gen=${myGeneration} for ${trackId} (no multi-stems)`);
            clearTimeout(timeoutId);
            resolve();
          }
        },
        onerror: (e) => {
          console.error(`[MusicEngine] ❌ Vocal audio load error for ${trackId}:`, e);
          clearTimeout(timeoutId);
          reject(e);
        }
      });
    });
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
        const meter = new Tone.Meter().connect(channel);
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
          const hasVocal = this.trackVocalLayers.has(t.id);
          sampler.volume.value = (t.mode === 'vocal' && hasVocal) ? -100 : 0;
        }
      }

      const activeStemIdx = this.trackActiveStem.get(t.id) ?? null;
      const isVocalPlaying = t.mode === 'vocal' && !t.isMuted && (!hasSolo || t.isSolo);

      // Sync vocal layer volume and mute states dynamically
      const vocalPlayers = this.trackVocalLayers.get(t.id);
      if (vocalPlayers) {
        vocalPlayers.forEach(p => {
          const isMainLayerActive = isVocalPlaying && (activeStemIdx === null);
          p.volume.value = isMainLayerActive ? 0 : -100;
        });
      }

      const vocalStems = this.trackVocalStems.get(t.id);
      if (vocalStems) {
        vocalStems.forEach((p, i) => {
          if (p) {
            const isStemActive = isVocalPlaying && (activeStemIdx === i);
            p.volume.value = isStemActive ? 0 : -100;
          }
        });
      }

      // Sync HTMLAudio vocal element volume dynamically (legacy fallback)
      const audio = this.vocalAudioElements.get(t.id);
      if (audio) {
        const isVocalPlaying = t.mode === 'vocal' && !t.isMuted && (!hasSolo || t.isSolo);
        audio.volume = isVocalPlaying ? Math.max(0, Math.min(1, t.volume)) : 0;
      }

      if (t.mode) this.trackModes.set(t.id, t.mode);
    });
  }

  getTrackLevel(trackId: string): number {
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
  }

  async loadSong(notes: ParsedNote[], tracks: TrackState[] = [], transpose = 0, timeSignature: { beats: number } = { beats: 4 }, isMetronomeOn = false) {
    console.log("[MusicEngine] [loadSong] starting...", { notesCount: notes.length, tracksCount: tracks.length });
    await this.ensureInitialized();
    console.log("[MusicEngine] [loadSong] ensureInitialized done");
    this.lastLoadedNotes = notes; // Cache for plugins/rendering
    if (notes.length === 0) {
      console.log("[MusicEngine] [loadSong] notes list is empty, returning");
      return;
    }

    // Generate a hash to check if data actually changed
    const hash = `${notes.length}-${transpose}-${isMetronomeOn}-${tracks.map(t => t.id + t.mode).join(',')}`;

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

    const events = notes.map(n => {
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
      const isVocalMode = this.trackModes.get(event.trackId) === 'vocal';
      const hasVocalLayer = this.trackVocalLayers.has(event.trackId);
      
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

    // Re-sync any existing vocal Tone.Player layers to the updated countInDuration
    for (const [tid, layers] of this.trackVocalLayers.entries()) {
      for (const player of layers) {
        try {
          player.unsync();
          player.sync().start(this.countInDuration || 0);
        } catch (e) {
          console.warn(`[MusicEngine] ⚠️ Failed to re-sync vocal layer for ${tid}:`, e);
        }
      }
    }
    // Also re-sync vocal stems
    for (const [tid, stems] of this.trackVocalStems.entries()) {
      for (const stemPlayer of stems) {
        if (stemPlayer) {
          try {
            stemPlayer.unsync();
            stemPlayer.sync().start(this.countInDuration || 0);
          } catch (e) {
            console.warn(`[MusicEngine] ⚠️ Failed to re-sync vocal stem for ${tid}:`, e);
          }
        }
      }
    }

    Tone.Transport.seconds = this.baseStartTime + this.countInDuration;
  }

  private calculateNoteFrequency(n: ParsedNote, transpose: number): number {
    const stepIdx = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(n.step.toUpperCase());
    const midi = (n.octave + 1) * 12 + (stepIdx === -1 ? 0 : stepIdx) + n.alter + transpose;
    return Tone.Frequency(midi, "midi").toFrequency();
  }

  async start() {
    console.log("[MusicEngine] start() called");
    await this.ensureInitialized();
    console.log("[MusicEngine] start() ensureInitialized done, transport state:", Tone.Transport.state);
    if (Tone.Transport.state !== 'started') {
      const startOffset = Math.max(0, (this.baseStartTime || 0));
      const TRANSPORT_DELAY_MS = 100; // Must match Tone.Transport.start(Tone.now() + 0.1)
      const startTime = Tone.now() + (TRANSPORT_DELAY_MS / 1000);
      console.log("[MusicEngine] starting Tone.Transport at", startTime, "offset", startOffset);
      Tone.Transport.start(startTime);
      console.log("[MusicEngine] Tone.Transport started!");

      // ── Start HTMLAudio vocal layers (delayed by same amount as Transport) ──
      this.vocalAudioElements.forEach(audio => {
        try {
          audio.currentTime = startOffset;
          // Delay play() by the same TRANSPORT_DELAY_MS so vocal is in sync with piano
          setTimeout(() => {
            audio.play().catch(e => console.warn('[MusicEngine] Vocal audio.play() failed:', e));
          }, TRANSPORT_DELAY_MS);
        } catch (e) { console.warn('[MusicEngine] Vocal start error:', e); }
      });
    }
  }

  // Resume from paused position
  async resume() {
    await this.ensureInitialized();
    if (Tone.Transport.state === 'paused') {
      const offset = Math.max(0, Tone.Transport.seconds - this.countInDuration);
      Tone.Transport.start(Tone.now() + 0.05);

      // ── Resume HTMLAudio vocal layers ─────────────────────────────
      this.vocalAudioElements.forEach(audio => {
        try {
          audio.currentTime = offset;
          audio.play().catch(e => console.warn('[MusicEngine] Vocal audio.play() resume failed:', e));
        } catch (e) { console.warn('[MusicEngine] Vocal resume error:', e); }
      });
    }
  }

  pause() {
    Tone.Transport.pause();
    // 🎤 Sync HTML Audio Vocal Elements
    this.vocalAudioElements.forEach(audio => {
      audio.pause();
    });
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

    // 4. Dispose all vocal layers and stems
    this.trackVocalLayers.forEach(layers => {
      layers.forEach(player => {
        if (player.state === 'started') player.stop();
        try { player.dispose(); } catch (e) { }
      });
    });
    this.trackVocalLayers.clear();
    
    this.trackVocalStems.forEach(stems => {
      stems.forEach(player => {
        if (player && player.state === 'started') player.stop();
        try { if(player) player.dispose(); } catch (e) { }
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

    // 9. Reset transport position
    Tone.Transport.seconds = 0;

    console.log('[MusicEngine] 🧹 stopAndClear — all song data purged');
  }
}
export const musicEngine = new MusicEngine();
