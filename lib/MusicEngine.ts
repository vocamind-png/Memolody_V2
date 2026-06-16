
import * as Tone from 'tone';

import { TrackState, ParsedNote } from '../types';

import { SoundBankEngine } from '../plugins/soundbank';

// Debug overlay disabled for production
const debugOverlay = (_msg: string) => { /* no-op */ };


export class MusicEngine {
  private trackSamplers: Map<string, Tone.Sampler> = new Map();
  private trackChannels: Map<string, Tone.Channel> = new Map();
  private trackMeters: Map<string, Tone.Meter> = new Map();
  private trackVocalLayers: Map<string, Tone.Player[]> = new Map();
  private trackVocalStems: Map<string, Tone.Player[]> = new Map();
  private trackActiveStem: Map<string, Set<number>> = new Map();
  private trackVocalRenderBpm: Map<string, number> = new Map();
  private trackModes: Map<string, 'instrument' | 'vocal'> = new Map();
  // Vocal pitch shifting states
  public vocalPitchShiftSemitones: Map<string, number> = new Map();
  public vocalAudioElements: Map<string, HTMLAudioElement> = new Map(); // For AI Vocal playback
  public vocalStemAudioElements: Map<string, HTMLAudioElement[]> = new Map(); // For AI Vocal Stems fallback playback
  private vocalBlobUrls: Map<string, string> = new Map(); // Track pre-fetched local Blob URLs
  public tracks: TrackState[] = [];

  private masterBus: Tone.Gain | null = null;
  private masterGain: Tone.Gain | null = null;
  private masterMeter: Tone.Meter | null = null;
  public masterRecorder: Tone.Recorder | null = null;
  public masterRecordingUrl: string | null = null;

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
  public unrolledMeasures: { measureId: string; startTime: number; duration: number }[] = [];

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
      if (!this.loopActive) return;
      
      const songTime = startSec - this.countInDuration;
      const allPlayers: Tone.Player[] = [];
      this.trackVocalLayers.forEach(players => allPlayers.push(...players));
      this.trackVocalStems.forEach(players => allPlayers.push(...players.filter(Boolean)));
      
      const currentBpm = Tone.Transport.bpm.value;
      allPlayers.forEach(player => {
        if (!player || !player.buffer || !player.buffer.loaded) return;
        player.stop(time);
        
        const renderBpm = (player as any).renderBpm || currentBpm;
        const ratio = currentBpm / renderBpm;
        if (typeof player.playbackRate === 'number') {
          player.playbackRate = ratio;
        } else if (player.playbackRate && (player.playbackRate as any).value !== undefined) {
          (player.playbackRate as any).value = ratio;
        }

        const offsetInAudio = Math.max(0, songTime * ratio);
        const duration = player.buffer.duration;
        if (offsetInAudio < duration) {
          player.start(time, offsetInAudio);
        }
      });
      
      // Also loop HTMLAudioElements
      Tone.Draw.schedule(() => {
        this.vocalAudioElements.forEach(audio => {
          if (!audio || !audio.src || audio.src.startsWith('data:')) return;
          const ratio = currentBpm / ((audio as any).renderBpm || currentBpm);
          const offsetInAudio = Math.max(0, songTime * ratio);
          audio.currentTime = offsetInAudio;
          if (Tone.Transport.state === 'started') {
            audio.play().catch(() => {});
          }
        });
        
        // Loop Stem HTMLAudioElements
        this.vocalStemAudioElements.forEach((audios) => {
          audios.forEach((audio) => {
            if (!audio || !audio.src || audio.src.startsWith('data:')) return;
            const ratio = currentBpm / ((audio as any).renderBpm || currentBpm);
            const offsetInAudio = Math.max(0, songTime * ratio);
            audio.currentTime = offsetInAudio;
            if (Tone.Transport.state === 'started') {
              audio.play().catch(() => {});
            }
          });
        });
      }, time);
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

  get isSongLoaded(): boolean {
    return this.currentPart !== null;
  }

  hasVocalLayer(trackId: string): boolean {
    const audioEl = this.vocalAudioElements.get(trackId);
    const hasRealAudio = audioEl && audioEl.src && !audioEl.src.startsWith('data:');
    return this.trackVocalLayers.has(trackId) || !!hasRealAudio;
  }

  toggleMetronome(enabled: boolean) { this.clickMetronomeEnabled = enabled; }

  async startMasterRecording() {
    if (!this.masterBus) return;
    if (!this.masterRecorder) {
      this.masterRecorder = new Tone.Recorder();
      this.masterBus.connect(this.masterRecorder);
    }
    try { await this.masterRecorder.start(); } catch (e) {}
  }

  async stopMasterRecording(): Promise<string> {
    if (!this.masterRecorder) return '';
    try {
      const recording = await this.masterRecorder.stop();
      const url = URL.createObjectURL(recording);
      this.masterRecordingUrl = url;
      return url;
    } catch (e) {
      return '';
    }
  }

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
    let notes: ParsedNote[] = [];
    let partNames: Record<string, string> = {};
    const trackClefs: Record<string, string> = {};
    let beats = 4;
    let beatType = 4;

    try {
      const parts = xmlDoc.querySelectorAll("part");
      this.unrolledMeasures = [];

      // ── SIMULATE REPEATS ONCE USING THE FIRST PART ──
      const globalMeasureOrder: number[] = [];
      const globalMeasureStartTimes: number[] = [];
      const globalMeasureDurations: number[] = [];

      if (parts.length > 0) {
        const primaryPart = parts[0];
        const physicalMeasures = Array.from(primaryPart.querySelectorAll("measure"));
        
        const repeatStack: number[] = [];          // indices of |: measures
        const passCount = new Map<number, number>(); // repeatStart → current pass (1-based)
        const repeatInited = new Set<number>();    // which |: have been initialized
        const bwdDone = new Set<number>();         // which :| have been taken once

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

        const hasFwdRepeat = (m: Element) =>
          !!m.querySelector('barline repeat[direction="forward"]');

        const hasBwdRepeat = (m: Element) =>
          !!m.querySelector('barline repeat[direction="backward"]');

        let cursor = 0;
        const MAX_ITER = physicalMeasures.length * 8; // safety guard
        let iter = 0;

        while (cursor < physicalMeasures.length && iter < MAX_ITER) {
          iter++;
          const m = physicalMeasures[cursor];

          // Push |: onto stack (only on first encounter)
          if (hasFwdRepeat(m) && !repeatInited.has(cursor)) {
            repeatInited.add(cursor);
            repeatStack.push(cursor);
            passCount.set(cursor, 1);
          }

          const innerStart = repeatStack.length > 0 ? repeatStack[repeatStack.length - 1] : -1;
          const currentPass = innerStart >= 0 ? (passCount.get(innerStart) ?? 1) : 1;

          const endings = getEndingNums(m);
          const shouldSkip = endings.length > 0 && !endings.includes(currentPass);

          if (!shouldSkip) {
            globalMeasureOrder.push(cursor);
          }

          if (hasBwdRepeat(m) && !shouldSkip) {
            let repeatStart: number;
            if (repeatStack.length > 0) {
              repeatStart = repeatStack[repeatStack.length - 1];
            } else {
              repeatStart = 0;
              if (!repeatInited.has(0)) {
                repeatInited.add(0);
                repeatStack.push(0);
                passCount.set(0, 1);
              }
            }

            if (!bwdDone.has(cursor)) {
              bwdDone.add(cursor);
              passCount.set(repeatStart, (passCount.get(repeatStart) ?? 1) + 1);
              cursor = repeatStart;
              continue;
            } else {
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

        // Calculate step durations and start times globally based on the primary part's measures
        let runningBeats = 4;
        let runningBeatType = 4;
        let runningDivisions = 1;
        let accumulatedBeat = 0;

        for (let i = 0; i < globalMeasureOrder.length; i++) {
          const mIdx = globalMeasureOrder[i];
          const measure = physicalMeasures[mIdx];

          // Update time signature if present
          const timeNode = measure.querySelector("time");
          if (timeNode) {
            runningBeats = parseInt(timeNode.querySelector("beats")?.textContent || "4") || 4;
            runningBeatType = parseInt(timeNode.querySelector("beat-type")?.textContent || "4") || 4;
          }

          const divNode = measure.querySelector("attributes divisions");
          if (divNode) {
            runningDivisions = parseInt(divNode.textContent || "1") || 1;
          }

          const nominalDuration = runningBeats * (4 / runningBeatType);

          // Calculate actual note duration in this measure
          let measurePlayTime = 0;
          Array.from(measure.children).forEach((child) => {
            if (child.tagName === "backup") {
              const durParsed = parseInt(child.querySelector("duration")?.textContent?.trim() || "0");
              const duration = (isNaN(durParsed) ? 0 : durParsed) / runningDivisions;
              measurePlayTime = Math.round((measurePlayTime - duration) * 100000) / 100000;
            } else if (child.tagName === "forward") {
              const durParsed = parseInt(child.querySelector("duration")?.textContent?.trim() || "0");
              const duration = (isNaN(durParsed) ? 0 : durParsed) / runningDivisions;
              measurePlayTime = Math.round((measurePlayTime + duration) * 100000) / 100000;
            } else if (child.tagName === "note") {
              const isChord = child.querySelector("chord");
              const durParsed = parseInt(child.querySelector("duration")?.textContent?.trim() || "0");
              const duration = (isNaN(durParsed) ? 0 : durParsed) / runningDivisions;
              if (!isChord) {
                measurePlayTime = Math.round((measurePlayTime + duration) * 100000) / 100000;
              }
            }
          });

          let stepDuration = nominalDuration;
          if (measurePlayTime > 0 && measurePlayTime < nominalDuration) {
            // Support incomplete measures anywhere (pickups, repeat boundaries)
            stepDuration = measurePlayTime;
          } else {
            // Keep nominal duration, but if actual notes overflow it, expand it to fit them
            stepDuration = Math.max(nominalDuration, measurePlayTime);
          }
          stepDuration = Math.round(stepDuration * 100000) / 100000;

          globalMeasureStartTimes.push(Math.round(accumulatedBeat * 100000) / 100000);
          globalMeasureDurations.push(stepDuration);
          accumulatedBeat = Math.round((accumulatedBeat + stepDuration) * 100000) / 100000;
        }
      }

      // Now iterate through each part using globalMeasureOrder
      parts.forEach((part, partIdx) => {
        const partId = part.getAttribute("id") || "P1";
        // Escape partId for safe use in selector
        const safePartId = partId.replace(/"/g, '\\"');
        const basePartName = xmlDoc.querySelector(`score-part[id="${safePartId}"] part-name`)?.textContent || "Part";
        let currentTime = 0;
        let divisions = 1; // persists across measures — most MusicXML only declares this in measure 1

        const physicalMeasures = Array.from(part.querySelectorAll("measure"));
        // Align this part's measure order with the global measure order computed from the first part
        const measureOrder = globalMeasureOrder.filter(idx => idx < physicalMeasures.length);

        // Process measures in unrolled order
        measureOrder.forEach((mIdx, stepIdx) => {
          const measure = physicalMeasures[mIdx];
          const measureNum = measure.getAttribute("number") || "1";
          
          // Force align to global measure start time
          currentTime = globalMeasureStartTimes[stepIdx] ?? currentTime;
          const startBeat = currentTime;

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

          let prevNoteStartTime = currentTime;
          let graceOffset = 0;

          Array.from(measure.children).forEach((child) => {
            if (child.tagName === "backup") {
              const durParsed = parseInt(child.querySelector("duration")?.textContent?.trim() || "0");
              const duration = (isNaN(durParsed) ? 0 : durParsed) / divisions;
              currentTime = Math.round((currentTime - duration) * 100000) / 100000;
            } else if (child.tagName === "forward") {
              const durParsed = parseInt(child.querySelector("duration")?.textContent?.trim() || "0");
              const duration = (isNaN(durParsed) ? 0 : durParsed) / divisions;
              currentTime = Math.round((currentTime + duration) * 100000) / 100000;
            } else if (child.tagName === "note") {
              const isRest = child.querySelector("rest") !== null;
              const isChord = child.querySelector("chord") !== null;
              const isGrace = child.querySelector("grace") !== null;
              const durParsed = parseInt(child.querySelector("duration")?.textContent?.trim() || "0");
              const rawDuration = isGrace ? 0 : ((isNaN(durParsed) ? 0 : durParsed) / divisions);
              const duration = Math.round((rawDuration === 0 && !isGrace ? 0.5 : rawDuration) * 100000) / 100000;
              const staff = parseInt(child.querySelector("staff")?.textContent || "1");
              const voice = parseInt(child.querySelector("voice")?.textContent || "1");

              let startTimeVal = isChord ? prevNoteStartTime : currentTime;
              if (isGrace) {
                graceOffset += 0.005;
                startTimeVal = Math.max(0, currentTime - 0.05 + graceOffset);
              } else if (!isChord) {
                graceOffset = 0;
              }

              const currentTrackId = `${partId}-S${staff}-V${voice}`;
              if (!partNames[currentTrackId]) {
                const staffSuffix = staff === 1 ? ' (Treble)' : staff === 2 ? ' (Bass)' : ` (Staff ${staff})`;
                const voiceSuffix = ` V${voice}`;
                partNames[currentTrackId] = `${basePartName}${staffSuffix}${voiceSuffix}`;
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
                  // Find the matching previous note with the same pitch in the same track that ends exactly at currentTime
                  let merged = false;
                  for (let j = notes.length - 1; j >= 0; j--) {
                    const prev = notes[j];
                    if (prev.trackId === currentTrackId && prev.step === step && prev.octave === safeOctave && prev.alter === safeAlter) {
                      const prevEnd = Math.round((prev.startTime + prev.duration) * 100000) / 100000;
                      if (Math.abs(prevEnd - currentTime) < 0.02) {
                        prev.duration = Math.round((prev.duration + duration) * 100000) / 100000;
                        merged = true;
                        break;
                      }
                    }
                  }
                  if (merged) {
                    if (!isChord) currentTime = Math.round((currentTime + duration) * 100000) / 100000;
                    return; // skip creating a new note for the tied continuation
                  }
                  // If merge failed, fall through and add it as a new note.
                }

                // Extract Lyric/Solfege from XML
                let solfegeVal = "";
                const lyricTextNode = child.querySelector("lyric text");
                if (lyricTextNode) {
                  solfegeVal = lyricTextNode.textContent?.trim() || "";
                }

                notes.push({
                  trackId: currentTrackId, step, octave: safeOctave, alter: safeAlter, duration: duration,
                  startTime: Math.round(startTimeVal * 100000) / 100000,
                  solfege: solfegeVal, staff: isNaN(staff) ? 1 : staff, voice: isNaN(voice) ? 1 : voice, measure: measureNum
                });
              }
              if (!isChord) {
                currentTime = Math.round((currentTime + duration) * 100000) / 100000;
              }
              prevNoteStartTime = startTimeVal;
            }
          });

          const stepDuration = globalMeasureDurations[stepIdx] ?? (beats * (4 / beatType));
          if (partIdx === 0) {
            this.unrolledMeasures.push({
              measureId: measureNum,
              startTime: startBeat,
              duration: stepDuration
            });
          }
        });

        // Clean up part names if a part only ever had one staff
        const usedStaves = Object.keys(partNames).filter(k => k.startsWith(`${partId}-S`));
        if (usedStaves.length === 1) {
          partNames[usedStaves[0]] = basePartName;
        }
      });

      // Post-processing: Split polyphonic tracks (chords) into completely separate monophonic tracks
      const trackGroups: Record<string, ParsedNote[]> = {};
      for (const n of notes) {
        if (!trackGroups[n.trackId]) trackGroups[n.trackId] = [];
        trackGroups[n.trackId].push(n);
      }

      const finalNotes: ParsedNote[] = [];
      const finalPartNames: Record<string, string> = {};

      for (const [originalTrackId, trackNotes] of Object.entries(trackGroups)) {
        // Group notes by exactly their startTime
        const timeGroups: Record<number, ParsedNote[]> = {};
        for (const n of trackNotes) {
          const t = n.startTime;
          if (!timeGroups[t]) timeGroups[t] = [];
          timeGroups[t].push(n);
        }

        const times = Object.keys(timeGroups).map(Number).sort((a, b) => a - b);
        
        const STEP_SEMI = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const toMidi = (n: ParsedNote) => n.octave * 12 + STEP_SEMI.indexOf(n.step.toUpperCase()) + n.alter;
        
        // Find max concurrent unique notes to determine how many sub-tracks we really need
        let maxVoices = 1;
        for (const t of times) {
          const seenPitches = new Set<number>();
          for (const n of timeGroups[t]) {
            seenPitches.add(toMidi(n));
          }
          if (seenPitches.size > maxVoices) {
            maxVoices = seenPitches.size;
          }
        }

        if (maxVoices > 1) {
          // ── Polyphonic Voice Splitter: Strict Top-Down ──
          // To prevent missing notes in the Melody track (Voice 0),
          // we always assign the highest note of any chord (or the only note) to Voice 0.
          // Remaining notes are assigned to Voice 1, Voice 2, etc. in descending pitch order.
          
          // Ensure all voice track names exist upfront
          for (let v = 0; v < maxVoices; v++) {
            const tid = `${originalTrackId}_V${v + 1}`;
            if (!finalPartNames[tid]) {
              finalPartNames[tid] = `${partNames[originalTrackId] || originalTrackId} (Voice ${v + 1})`;
            }
          }
          
          for (const t of times) {
            const concurrentNotes = timeGroups[t];
            
            // Deduplicate notes with exact same pitch to avoid phantom duplicate voices
            const uniqueNotes: typeof concurrentNotes = [];
            const seenPitches = new Set<number>();
            for (const n of concurrentNotes) {
              const midi = toMidi(n);
              if (!seenPitches.has(midi)) {
                seenPitches.add(midi);
                uniqueNotes.push(n);
              }
            }
            
            // Sort highest to lowest pitch
            uniqueNotes.sort((a, b) => toMidi(b) - toMidi(a));

            // Assign top-down
            for (let i = 0; i < uniqueNotes.length; i++) {
              const targetVoice = Math.min(i, maxVoices - 1);
              const originalNote = uniqueNotes[i];
              const n = { ...originalNote }; // Clone to avoid overwriting properties
              
              const newTrackId = `${originalTrackId}_V${targetVoice + 1}`;
              n.trackId = newTrackId;
              n.voiceIdx = targetVoice; // Store for ProScoreEditor lyric colorizing
              n.voice = targetVoice + 1; // Assign explicitly to prevent stems merging
              finalNotes.push(n);
            }
          }
          
          delete partNames[originalTrackId];
          
        } else {
          // Strictly monophonic already
          finalPartNames[originalTrackId] = partNames[originalTrackId] || originalTrackId;
          for (const n of trackNotes) {
            n.voiceIdx = 0;
            finalNotes.push(n);
          }
        }
      }

      notes = finalNotes;
      partNames = finalPartNames;

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
        try {
          await Promise.race([
            Tone.start(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Tone.start() timeout')), 1000))
          ]);
          await Promise.race([
            Tone.getContext().resume(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Tone.getContext().resume() timeout')), 1000))
          ]);
        } catch (e) {
          console.warn('[MusicEngine] Audio context resume timed out or failed (likely mobile background restriction). Continuing anyway:', e);
        }
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
      audio.preservesPitch = true;
      this.vocalAudioElements.set(trackId, audio);
    }
    
    // If it has a real source, do not run the dummy unlock sequence to prevent the async pause() race condition!
    // Since start() or resume() will play it synchronously inside the click handler anyway.
    const hasRealSource = audio.src && !audio.src.startsWith('data:');
    if (hasRealSource) {
      console.log(`[MusicEngine] 🔓 Skipping dummy unlock for ${trackId} because it has a real source URL.`);
      return;
    }
    
    if (!audio.src) {
      audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
    }
    
    console.log(`[MusicEngine] 🔓 Synchronously unlocking vocal HTMLAudio for ${trackId} (hasRealSource=false)`);
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        audio.pause();
        console.log(`[MusicEngine] 🔓 HTMLAudio unlocked successfully for ${trackId}`);
      }).catch(e => {
        console.warn(`[MusicEngine] ⚠️ HTMLAudio unlock failed/deferred for ${trackId}:`, e);
      });
    }
  }

  async addVocalLayer(trackId: string, audioUrl: string, stemUrls?: string[], renderBpm?: number) {
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
    if (audioUrl) {
      loadPromises.push(new Promise<void>((resolve) => {
        let isResolved = false;
        const doResolve = () => { if (!isResolved) { isResolved = true; resolve(); } };
        
        // Timeout to prevent hanging at 95% if fetch/decode stalls
        setTimeout(() => {
          if (!isResolved) {
            console.warn('[MusicEngine] ⚠️ Timeout loading main vocal audio, falling back to HTMLAudioElement');
            doResolve();
          }
        }, 8000);

        const player = new Tone.Player({
          url: audioUrl,
          fadeIn: 0,
          fadeOut: 0,
          onload: () => {
            if (myGeneration === this._vocalGeneration) {
              const players = this.trackVocalLayers.get(trackId) || [];
              players.push(player);
              this.trackVocalLayers.set(trackId, players);
              if (renderBpm) (player as any).renderBpm = renderBpm;
              player.connect(channel);
            } else {
              player.dispose();
            }
            doResolve();
          },
          onerror: (err) => {
            console.error('[MusicEngine] ❌ Error loading main vocal audio:', err);
            doResolve(); // Resolve anyway so it doesn't hang
          }
        });
      }));
    }

    // 2. Load Stems Players
    const loadedStems: (Tone.Player | null)[] = [];
    const stemAudios: HTMLAudioElement[] = [];
    if (stemUrls && stemUrls.length > 0) {
      stemUrls.forEach((url, index) => {
        // Fallback for stems
        // Fallback for stems
        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.preservesPitch = true;
        audio.preload = 'auto'; // CRITICAL: Force Android Chrome to buffer
        audio.src = url;
        audio.load();
        
        // CRITICAL: Unlock the audio element immediately within the current user gesture
        audio.play().then(() => audio.pause()).catch(e => console.warn(`[MusicEngine] Stem ${index} unlock fallback failed:`, e));
        
        stemAudios.push(audio);

        loadPromises.push(new Promise<void>((resolve) => {
          let isResolved = false;
          const doResolve = () => { if (!isResolved) { isResolved = true; resolve(); } };
          
          // Shorter timeout for stems — they are optional, don't block the main flow
          const stemTimeout = url.startsWith('blob:') ? 8000 : 5000;
          setTimeout(() => {
            if (!isResolved) {
              console.warn(`[MusicEngine] ⚠️ Timeout loading stem audio ${index} (${stemTimeout}ms)`);
              doResolve();
            }
          }, stemTimeout);

          const player = new Tone.Player({
            url: url,
            fadeIn: 0,
            fadeOut: 0,
            onload: () => {
              if (myGeneration === this._vocalGeneration) {
                loadedStems[index] = player;
                if (renderBpm) (player as any).renderBpm = renderBpm;
                player.connect(channel);
              } else {
                player.dispose();
              }
              doResolve();
            },
            onerror: (err) => {
              console.error(`[MusicEngine] ❌ Error loading stem audio ${index}:`, err);
              loadedStems[index] = null;
              doResolve(); // Resolve anyway so it doesn't hang
            }
          });
        }));
      });
    }

    await Promise.all(loadPromises);

    // If generation changed during load, discard new nodes
    if (myGeneration !== this._vocalGeneration) {
      console.log(`[MusicEngine] 🗑️ Stale gen=${myGeneration} after loading — discarding players`);
      this.trackVocalLayers.get(trackId)?.forEach(p => p.dispose());
      loadedStems.forEach(p => p?.dispose());
      return;
    }

    if (loadedStems.length > 0 || stemAudios.length > 0) {
      this.trackVocalStems.set(trackId, loadedStems.filter(Boolean) as Tone.Player[]);
      this.vocalStemAudioElements.set(trackId, stemAudios);
    }

    this.trackModes.set(trackId, 'vocal');
    const toneStems = loadedStems.filter(Boolean).length;
    const htmlStems = stemAudios.length;
    debugOverlay(`🎤 addVocalLayer(${trackId}): ToneStems=${toneStems}, HTMLStems=${htmlStems}`);
  }

  clearVocalLayers(trackId: string) {
    const players = this.trackVocalLayers.get(trackId);
    if (players) {
      players.forEach(p => p && p.dispose());
      this.trackVocalLayers.delete(trackId);
    }
    const stemAudios = this.vocalStemAudioElements.get(trackId);
    if (stemAudios) {
      stemAudios.forEach(a => { a.pause(); a.src = ''; });
      this.vocalStemAudioElements.delete(trackId);
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
    
    this.trackActiveStem.set(trackId, new Set());
    
    // Revoke and clear blob URLs
    const oldUrl = this.vocalBlobUrls.get(trackId);
    if (oldUrl) {
      try { URL.revokeObjectURL(oldUrl); } catch(e){}
      this.vocalBlobUrls.delete(trackId);
    }
    this.trackVocalRenderBpm.delete(trackId);

    // Reset/clear any active HTMLAudioElement for this track to prevent phantom playing after deletion
    const oldAudio = this.vocalAudioElements.get(trackId);
    if (oldAudio) {
      oldAudio.pause();
      oldAudio.src = '';
    }
  }

  public soloStem(trackId: string, stemIndices: Set<number>) {
    this.trackActiveStem.set(trackId, stemIndices);
    const toneStems = this.trackVocalStems.get(trackId)?.length || 0;
    const htmlStems = this.vocalStemAudioElements.get(trackId)?.length || 0;
    const transportState = Tone.Transport.state;
    debugOverlay(`🎯 soloStem(${trackId}, count=${stemIndices.size}) — ToneStems: ${toneStems}, HTMLStems: ${htmlStems}, Transport: ${transportState}`);

    // 1. Check if ANY stem is soloed globally across all tracks
    let isAnySoloedGlobally = false;
    this.trackActiveStem.forEach((indices) => {
      if (indices.size > 0) isAnySoloedGlobally = true;
    });

    // 2. Mute ALL main mixes globally if anything is soloed
    this.trackVocalLayers.forEach((layers, tId) => {
      layers.forEach(p => {
        if (p) p.volume.value = isAnySoloedGlobally ? -100 : 0;
      });
    });
    
    this.vocalAudioElements.forEach((audio, tId) => {
      if (audio) {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const hasTonePlayer = !isMobile && this.trackVocalLayers.has(tId) && 
          this.trackVocalLayers.get(tId)!.some(p => p.buffer && p.buffer.loaded);

        const isMainLayerActive = !isAnySoloedGlobally;
        audio.volume = isMainLayerActive && !hasTonePlayer ? 1 : 0;
        audio.muted = !(isMainLayerActive && !hasTonePlayer);
      }
    });

    // 3. Handle stems for ALL tracks based on their individual activeStem
    const isMobileSolo = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (!isMobileSolo) {
      this.trackVocalStems.forEach((stems, tId) => {
        const activeIndices = this.trackActiveStem.get(tId) || new Set();
        if (stems) {
          stems.forEach((p, i) => {
            if (p) {
              p.volume.value = (activeIndices.size > 0 && activeIndices.has(i)) ? 0 : -100;
            }
          });
        }
      });
    }

    // HTMLAudioElement stems — used as primary on mobile, fallback on desktop
    this.vocalStemAudioElements.forEach((audios, tId) => {
      const hasToneStems = !isMobileSolo && this.trackVocalStems.has(tId) && 
        this.trackVocalStems.get(tId)!.some(p => p.buffer && p.buffer.loaded);

      const activeIndices = this.trackActiveStem.get(tId) || new Set();
      debugOverlay(`🔊 tId=${tId}: activeIndices=${Array.from(activeIndices)}, hasToneStems=${hasToneStems}, stems=${audios.length}`);
      
      audios.forEach((audio, i) => {
        if (audio) {
          const isStemActive = (activeIndices.size > 0 && activeIndices.has(i));
          
          if (isStemActive && !hasToneStems) {
            // ACTIVE STEM: force unmute, but do NOT auto-play. Let updateVocalPlaybackState or transport handle playing.
            audio.volume = 1.0;
            audio.muted = false;
          } else {
            // INACTIVE STEM: mute, but keep it playing silently so it stays synced
            audio.volume = 0.0;
            audio.muted = true;
          }
        }
      });
    });

    // Refresh playback state to ensure everything is correctly synced
    this.updateVocalPlaybackState();
  }
  
  public getAvailableStems(trackId: string): number {
    const toneStems = this.trackVocalStems.get(trackId)?.length || 0;
    const audioStems = this.vocalStemAudioElements.get(trackId)?.length || 0;
    return Math.max(toneStems, audioStems);
  }
  
  public getSoloStem(trackId: string): Set<number> {
    return this.trackActiveStem.get(trackId) || new Set();
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
        // Only dispose the sampler, NOT the channel — the vocal Tone.GrainPlayer routes through the channel
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

    const requestedInstrument = pluginSettings?.instrument || 'HD Grand Piano';
    const currentInstrument = (this.trackSamplers.get(trackId) as any)?._instrumentName || 'HD Grand Piano';

    // Skip if already initialized for the SAME mode AND the SAME instrument
    if (this.trackSamplers.has(trackId) && currentMode === requestedMode && currentInstrument === requestedInstrument) {
      console.log(`[MusicEngine] [initSampler] skipping already initialized trackId=${trackId} with instrument=${currentInstrument}`);
      return;
    }

    // If mode OR instrument changed, dispose old sampler first
    if (this.trackSamplers.has(trackId) && (currentMode !== requestedMode || currentInstrument !== requestedInstrument)) {
      console.log(`[MusicEngine] [initSampler] disposing old sampler for trackId=${trackId} due to mode or instrument change`);
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
      
      // Tag the sampler with its instrument name for future cache checks
      const sampler = this.trackSamplers.get(trackId);
      if (sampler) {
        (sampler as any)._instrumentName = requestedInstrument;
      }
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
    // We intentionally DO NOT dispose trackChannels or trackMeters here, 
    // because Tone.GrainPlayer (Vocal AI Stems) might still be connected to them!
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
  setBpm(bpm: number) {
    if (bpm >= 20 && bpm <= 400) {
      Tone.Transport.bpm.rampTo(bpm, 0.05);
      
      // Update playbackRate of all vocal players to match the BPM ratio
      this.trackVocalRenderBpm.forEach((renderBpm, trackId) => {
        const ratio = bpm / renderBpm;
        const layers = this.trackVocalLayers.get(trackId);
        if (layers) {
          layers.forEach(p => {
            if (p) {
              if (typeof p.playbackRate === 'number') {
                p.playbackRate = ratio;
              } else if (p.playbackRate && (p.playbackRate as any).value !== undefined) {
                (p.playbackRate as any).value = ratio;
              }
            }
          });
        }
        const stems = this.trackVocalStems.get(trackId);
        if (stems) {
          stems.forEach(p => {
            if (p) {
              if (typeof p.playbackRate === 'number') {
                p.playbackRate = ratio;
              } else if (p.playbackRate && (p.playbackRate as any).value !== undefined) {
                (p.playbackRate as any).value = ratio;
              }
            }
          });
        }
      });
    }
  }

  updateTrackStates(tracks: TrackState[]) {
    this.tracks = tracks;
    const hasSolo = tracks.some(tr => tr.isSolo);
    
    // Check if any stem is soloed globally
    let isAnyStemSoloedGlobally = false;
    this.trackActiveStem.forEach((indices) => {
      if (indices.size > 0) isAnyStemSoloedGlobally = true;
    });

    tracks.forEach(t => {
      const channel = this.trackChannels.get(t.id);
      if (channel) {
        const vol = typeof t.volume === 'number' ? t.volume : 0.8;
        const pan = typeof t.pan === 'number' ? t.pan : 0;
        const db = vol <= 0 ? -100 : 20 * Math.log10(vol);
        channel.volume.rampTo(db, 0.1);
        channel.pan.rampTo(pan, 0.1);
        channel.mute = t.isMuted || (hasSolo && !t.isSolo);

        // If in vocal mode, the instrument sampler should be completely silent (strict separation)
        const sampler = this.trackSamplers.get(t.id);
        if (sampler && sampler.volume) {
          sampler.volume.value = (t.mode === 'vocal') ? -100 : 4;
        }
      }

      const activeStemIndices = this.trackActiveStem.get(t.id) || new Set();
      const isVocalPlaying = t.mode === 'vocal' && !t.isMuted && (!hasSolo || t.isSolo);

      // Sync vocal layer volume and mute states dynamically
      const vocalPlayers = this.trackVocalLayers.get(t.id);
      if (vocalPlayers) {
        vocalPlayers.forEach(p => {
          const isMainLayerActive = isVocalPlaying && (activeStemIndices.size === 0) && !isAnyStemSoloedGlobally;
          p.volume.value = isMainLayerActive ? 0 : -100;
        });
      }

      // Sync HTMLAudio vocal element volume and mute states dynamically
      const audio = this.vocalAudioElements.get(t.id);
      if (audio) {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const hasTonePlayer = !isMobile && this.trackVocalLayers.has(t.id) && 
          this.trackVocalLayers.get(t.id)!.some(p => p.buffer && p.buffer.loaded);

        const isMainLayerActive = isVocalPlaying && (activeStemIndices.size === 0) && !isAnyStemSoloedGlobally;
        const vol = typeof t.volume === 'number' ? t.volume : 0.8;
        audio.volume = isMainLayerActive && !hasTonePlayer ? vol : 0.0;
        audio.muted = !(isMainLayerActive && !hasTonePlayer);

        if (!hasTonePlayer && Tone.Transport.state === 'started' && audio.paused) {
          const currentBpm = Tone.Transport.bpm.value;
          const ratio = currentBpm / ((audio as any).renderBpm || currentBpm);
          const songTime = Tone.Transport.seconds - this.countInDuration;
          
          // Android User Gesture Fix: Call play() on ALL tracks, relying purely on mute/volume to hide inactive ones.
          const playPromise = audio.play().catch(e => console.warn('[MusicEngine] main mix play failed:', e));
          
          try {
            audio.currentTime = Math.max(0, songTime * ratio);
          } catch(e) {
            console.warn('[MusicEngine] main sync audio.currentTime seek failed:', e);
          }
        }
        // We removed the 'else if' that pauses the audio when not active.
        // It must keep playing silently so it stays synced and doesn't require a new user gesture to unmute.
      }

      const vocalStems = this.trackVocalStems.get(t.id);
      const isMobileTrack = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // On desktop: set Tone.Player stem volumes
      // On mobile: skip (they're never started, HTMLAudioElement handles it)
      if (vocalStems && !isMobileTrack) {
        vocalStems.forEach((p, i) => {
          if (p) {
            const isStemActive = isVocalPlaying && activeStemIndices.has(i);
            p.volume.value = isStemActive ? 0 : -100;
          }
        });
      }

      const stemAudios = this.vocalStemAudioElements.get(t.id);
      if (stemAudios) {
        // On mobile, always use HTMLAudioElement (Tone.Player stems are never started)
        const hasToneStems = !isMobileTrack && this.trackVocalStems.has(t.id) && 
          this.trackVocalStems.get(t.id)!.some(p => p.buffer && p.buffer.loaded);

        stemAudios.forEach((audio, i) => {
          const isStemActive = isVocalPlaying && activeStemIndices.has(i);
          const vol = typeof t.volume === 'number' ? t.volume : 0.8;
          audio.volume = isStemActive && !hasToneStems ? vol : 0.0;
          audio.muted = !(isStemActive && !hasToneStems);

          if (!hasToneStems && Tone.Transport.state === 'started' && audio.paused) {
             const currentBpm = Tone.Transport.bpm.value;
             const ratio = currentBpm / ((audio as any).renderBpm || currentBpm);
             const songTime = Tone.Transport.seconds - this.countInDuration;
             
             // TIMING FIX: Seek BEFORE play() to avoid jitter.
             // Add 30ms lookahead to compensate for JS→audio scheduling delay.
             const LOOKAHEAD = 0.03;
             const targetTime = Math.max(0, songTime * ratio + LOOKAHEAD);
             try {
               if (isFinite(audio.duration) && audio.duration > 0) {
                 audio.currentTime = Math.min(targetTime, audio.duration - 0.1);
               } else {
                 audio.currentTime = targetTime;
               }
             } catch(e) {
               console.warn(`[MusicEngine] stem ${i} seek failed:`, e);
             }
             
             // Play AFTER seek
             audio.play().catch(e => console.warn(`[MusicEngine] stem ${i} play failed:`, e));
          }
          // Removed else if audio.pause() so it plays silently in sync
        });
      }


      if (t.mode) this.trackModes.set(t.id, t.mode);
    });
  }

public setVocalTranspose(trackId: string, diffSemitones: number) {
    this.vocalPitchShiftSemitones.set(trackId, diffSemitones);
    console.log(`[MusicEngine] setVocalTranspose: ${trackId} diff=${diffSemitones}`);
    this.updateVocalPlaybackState();
  }

  public updateVocalPlaybackState(time?: number) {
    const transportState = Tone.Transport.state;
    const transportSeconds = Tone.Transport.seconds;
    const countIn = this.countInDuration || 0;
    const songTime = transportSeconds - countIn;
    // Use 50ms lookahead: gives the audio scheduler time between JS scheduling and actual playback
    const SCHED_LOOKAHEAD = 0.05;
    const triggerTime = time !== undefined ? time : Tone.now() + SCHED_LOOKAHEAD;

    const currentBpm = Tone.Transport.bpm.value;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const processPlayers = (players: Tone.Player[], trackId: string) => {
      if (isMobile) return; // Completely disable Tone.Player playback on mobile to prevent echo and rely on HTMLAudioElement
      const diffSemitones = this.vocalPitchShiftSemitones.get(trackId) || 0;
      players.forEach((player) => {
        if (!player || !player.buffer || !player.buffer.loaded) return;
        
        try { player.stop(triggerTime); } catch (e) {}

        const renderBpm = (player as any).renderBpm || currentBpm;
        const ratio = currentBpm / renderBpm;
        const duration = player.buffer.duration;
        // Adjust offset to account for the scheduling lookahead
        const offsetInAudio = Math.max(0, songTime * ratio + SCHED_LOOKAHEAD);
        if (offsetInAudio >= duration) return;

        player.playbackRate = ratio * Math.pow(2, diffSemitones / 12);

        if (transportState === 'started') {
          if (songTime < 0) {
            player.start(triggerTime + (-songTime), 0);
          } else {
            player.start(triggerTime, offsetInAudio);
          }
        }
      });
    };

    this.trackVocalLayers.forEach((players, trackId) => {
      processPlayers(players, trackId);
    });

    this.trackVocalStems.forEach((players, trackId) => {
      processPlayers(players, trackId);
    });
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
    if (!isFinite(s) || s < 0) {
      console.warn('[MusicEngine] setTransportSeconds: invalid value', s);
      return;
    }
    this.baseStartTime = Math.max(0, s);
    Tone.Transport.seconds = this.baseStartTime + this.countInDuration;
    // 🎤 Sync HTMLAudio vocal elements to new position
    this.vocalAudioElements.forEach((audio, trackId) => {
      // Check if Tone.GrainPlayer is loaded
      const hasTonePlayer = this.trackVocalLayers.has(trackId) && 
        this.trackVocalLayers.get(trackId)!.some(p => p.buffer && p.buffer.loaded);

      if (hasTonePlayer) {
        audio.pause();
        return;
      }

      // Guard against NaN/Infinity from failed renders
      if (isFinite(s) && s >= 0) {
        try { audio.currentTime = s; } catch (e) {}
      }
    });
    
    // Sync stems too
    this.vocalStemAudioElements.forEach((stemAudios, trackId) => {
      const hasToneStems = this.trackVocalStems.has(trackId) && 
        this.trackVocalStems.get(trackId)!.some(p => p.buffer && p.buffer.loaded);
        
      if (hasToneStems) {
        stemAudios.forEach(a => a.pause());
        return;
      }
      
      stemAudios.forEach(audio => {
        if (isFinite(s) && s >= 0) {
          try { audio.currentTime = s; } catch (e) {}
        }
      });
    });

    this.updateVocalPlaybackState();
    // Force sync of HTMLAudio play/pause states based on current solo/mute rules
    if (this.tracks && this.tracks.length > 0) {
      this.updateTrackStates(this.tracks);
    }
  }

  async loadSong(notes: ParsedNote[], tracks: TrackState[] = [], transpose = 0, timeSignature: { beats: number } = { beats: 4 }, isMetronomeOn = false) {
    this.tracks = tracks;
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
      const settings = { instrument: t.instrument, ...(t.pluginSettings || {}) };
      return this.initSampler(t.id, t.name, settings, t.mode);
    });
    await Promise.all(initPromises);
    console.log("[MusicEngine] [loadSong] Samplers initialized!");

    const beatDuration = 60 / Tone.Transport.bpm.value;
    // Count-in = 2 bars (gives musician time to prepare)
    this.countInDuration = isMetronomeOn ? (timeSignature.beats * 2 * beatDuration) : 0;
    this.countInTicks = isMetronomeOn ? (timeSignature.beats * 2 * Tone.Transport.PPQ) : 0;

    const ppq = Tone.Transport.PPQ;

    const events = notes.map(n => {
      const startTicks = n.startTime * ppq + this.countInTicks;
      const durTicks = n.duration * ppq;
      return {
        time: `${startTicks}i`,
        duration: `${durTicks}i`,
        trackId: n.trackId,
        freq: this.calculateNoteFrequency(n, transpose),
        noteId: (n as any).id || '',          // DOM note ID from svgNoteMap
        unrolledTime: n.startTime,            // Unrolled position in beats
        measure: n.measure || '',             // Measure number string (e.g. "5")
        voice: n.voice || 1
      };
    });

    this.currentPart = new Tone.Part((time, event) => {
      // Always track which note is currently active for laser sync (even in vocal mode)
      this.currentNoteId = event.noteId || '';
      this.currentNoteTime = event.unrolledTime;
      this.currentMeasure = event.measure || '';

      // Play the sampler only if the track mode is NOT 'vocal' (strict separation)
      const hasVocalLayer = this.trackVocalLayers.has(event.trackId);
      const isVocalMode = this.trackModes.get(event.trackId) === 'vocal';
      const playMidi = !isVocalMode || !hasVocalLayer;
      
      if (playMidi) {
        const activeStem = this.trackActiveStem.get(event.trackId) ?? null;
        if (activeStem !== null) {
          const trackNotes = this.lastLoadedNotes.filter(n => n.trackId === event.trackId);
          const uniqueVoices = Array.from(new Set(trackNotes.map(n => n.voice || 1))).sort((a, b) => a - b);
          const allowedVoice = uniqueVoices[activeStem];
          if (event.voice !== allowedVoice) {
            return;
          }
        }

        const sampler = this.trackSamplers.get(event.trackId);
        // console.log(`[MusicEngine] Playing note: freq=${event.freq}, trackId=${event.trackId}, hasSampler=${!!sampler}`);
        if (sampler) {
          sampler.triggerAttackRelease(event.freq, event.duration, time, 0.75);
        } else {
          console.warn(`[MusicEngine] No sampler found for trackId=${event.trackId}`);
        }
      }
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
    const stepIdx = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(n.step.toUpperCase());
    const midi = (n.octave + 1) * 12 + (stepIdx === -1 ? 0 : stepIdx) + n.alter + transpose;
    return Tone.Frequency(midi, "midi").toFrequency();
  }

  start() {
    console.log("[MusicEngine] start() called");
    
    const runStart = () => {
      if (Tone.Transport.state !== 'started') {
        const songOffset = Math.max(0, Tone.Transport.seconds - this.countInDuration);
        console.log("[MusicEngine] starting Tone.Transport, songOffset=", songOffset);
        
        // HTMLAudioElements are now elegantly handled by updateTrackStates called below
        // This prevents iOS Safari restrictions by ensuring ONLY the active layer receives a .play() call

        // Start Tone.Transport immediately
        Tone.Transport.start();
        console.log("[MusicEngine] Tone.Transport started!");

        // Start unsynced vocal players (stems)
        this.updateVocalPlaybackState(Tone.now());

        // Sync HTMLAudio playback using our consolidated logic
        this.updateTrackStates(this.tracks);
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
      Tone.Transport.start();

      // Resume unsynced vocal players (stems)
      this.updateVocalPlaybackState(Tone.now());

      // Sync HTMLAudio playback using our consolidated logic
      this.updateTrackStates(this.tracks);
    }
  }

  pause() {
    Tone.Transport.pause();
    this.vocalAudioElements.forEach(audio => {
      audio.pause();
    });
    this.vocalStemAudioElements.forEach(audios => {
      audios.forEach(audio => audio.pause());
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

    this.vocalStemAudioElements.forEach(audios => {
      audios.forEach(a => { a.pause(); a.src = ''; });
    });
    this.vocalStemAudioElements.clear();

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

  // ── Live MIDI Playback ──────────────────────────────────────────────────
  public playLiveNote(trackId: string, freq: number, velocity: number = 0.8) {
    if (!this.isInitialized) return;
    const sampler = this.trackSamplers.get(trackId);
    if (sampler) {
      if ((sampler as any).triggerAttack) {
        (sampler as any).triggerAttack(freq, Tone.now(), velocity);
      }
    }
  }

  public stopLiveNote(trackId: string, freq: number) {
    if (!this.isInitialized) return;
    const sampler = this.trackSamplers.get(trackId);
    if (sampler) {
      if ((sampler as any).triggerRelease) {
        (sampler as any).triggerRelease(freq, Tone.now());
      }
    }
  }
}
export const musicEngine = new MusicEngine();
