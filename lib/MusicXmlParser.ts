
import { Song } from '../types';
import { getChromaticSolfege } from './SolfegeLogic';
import { CoverGenerator } from './CoverGenerator';
import { MidiParser } from './MidiParser';
import { recognizeSheetMusic, recognizePDF, recognizeVerificationPass, omrWithOemer, isImageFile, isPDFFile } from './SheetMusicOCR';
import { validateMusicXml } from './MusicXmlValidator';
import { autoFixMusicXml } from './MusicXmlAutoFixer';
import JSZip from 'jszip';
import { FileConverter } from './FileConverter';

export const detectEra = (composer: string): string => {
  const c = composer.toLowerCase();
  if (c.includes("bach") || c.includes("vivaldi") || c.includes("handel") || c.includes("pachelbel")) return "Baroque";
  if (c.includes("mozart") || c.includes("beethoven") || c.includes("haydn") || c.includes("clementi")) return "Classical";
  if (c.includes("chopin") || c.includes("liszt") || c.includes("schumann") || c.includes("tchaikovsky") || c.includes("brahms")) return "Romantic";
  if (c.includes("debussy") || c.includes("stravinsky") || c.includes("ravel")) return "Impressionist/Modern";
  return "Modern";
};

export const extractXmlString = async (
  input: File | Blob | string,
  onProgress?: (msg: string) => void,
  startPage?: number,
  endPage?: number
): Promise<{ xml: string; bundle?: any | null }> => {
  if (typeof input === 'string') return { xml: input, bundle: null };
  try {
    // ── IMAGE file ──────────────────
    if (input instanceof File && isImageFile(input)) {
      console.log('[OMR] 🖼️ Image file:', input.name, 'type:', input.type, 'size:', (input.size/1024).toFixed(0)+'KB');
      try {
        if (input.name.startsWith('cropped_')) {
          onProgress?.('🧠 ส่งเข้า Gemini Vision OMR (Cropped)...');
          const result = await recognizeSheetMusic(input);
          return { xml: result.xml, bundle: null };
        } else {
          onProgress?.('🧠 ส่งเข้า ScoreLens V3 OMR...');
          const result = await omrWithOemer(input);
          console.log(`[OMR] ✅ ScoreLens V3 Transcribe Success: ${input.name}`);
          return { xml: result.xml, bundle: result.bundle ?? null };
        }
      } catch (err: any) {
        throw new Error(`การอ่านโน้ตด้วย AI ล้มเหลว: ${err.message}`);
      }
    }

    // ── PDF file → Local AI OMR (Scorelens V3) ──────────────────
    if (input instanceof File && isPDFFile(input)) {
      console.log(`[OMR] 📄 PDF file: ${input.name} size: ${(input.size/1024/1024).toFixed(1)}MB (Pages: ${startPage || 1} to ${endPage || 'end'})`);
      try {
        onProgress?.('🧠 กำลังอ่าน PDF ด้วย ScoreLens V3 OMR...');
        const result = await omrWithOemer(input, startPage, endPage);
        return { xml: result.xml, bundle: result.bundle ?? null };
      } catch (err: any) {
        throw new Error(`ไม่สามารถแปลง PDF เป็นโน้ตได้: ${err.message}`);
      }
    }

    // ── EMK Proprietary Karaoke file ──────────────────
    if (input instanceof File && input.name.toLowerCase().endsWith('.emk')) {
      console.log('[Converter] 🎤 EMK file:', input.name);
      onProgress?.('🎤 กำลังถอดรหัสไฟล์ EMK Karaoke...');
      const result = await FileConverter.convertFile(input);
      if (result.success && result.midiData) {
        // Continue processing as MIDI
        input = new File([result.midiData], result.fileName, { type: 'audio/midi' });
      } else {
        throw new Error(result.error || "ไม่สามารถถอดรหัสไฟล์ EMK ได้");
      }
    }

    const arrayBuffer = await input.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes[0] === 0x4D && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64) {
      const fileName = (input as File).name || "MIDI_IMPORT";
      const generatedXml = await MidiParser.convertToMusicXml(arrayBuffer, fileName);
      return { xml: injectSolfegeToXml(generatedXml, 'Ju Solfege Movable Doh'), bundle: null };
    }

    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B;
    if (isZip) {
      const zip = await JSZip.loadAsync(arrayBuffer);
      let rootFilePath = '';
      const containerFile = zip.file("META-INF/container.xml");
      if (containerFile) {
        const containerXml = await containerFile.async("string");
        const containerDoc = new DOMParser().parseFromString(containerXml, "text/xml");
        rootFilePath = containerDoc.getElementsByTagName("rootfile")[0]?.getAttribute("full-path") || '';
      }
      if (!rootFilePath) {
        const xmlFiles = Object.keys(zip.files).filter(n => n.endsWith('.xml') && !n.includes('container.xml') && !n.startsWith('__MACOSX'));
        rootFilePath = xmlFiles.sort((a, b) => a.length - b.length)[0];
      }
      if (!rootFilePath || !zip.file(rootFilePath)) throw new Error("No valid MusicXML content found");
      const mxlXml = await zip.file(rootFilePath)!.async('string');
      return { xml: mxlXml, bundle: null };
    }
    return { xml: new TextDecoder().decode(arrayBuffer), bundle: null };
  } catch (err: any) {
    // Re-throw with original message so callers can show it to user
    throw new Error(err?.message || "Failed to process file.");
  }
};

const FIFTHS_TO_KEY: Record<number, string> = {
  [-6]: "Gb", [-5]: "Db", [-4]: "Ab", [-3]: "Eb", [-2]: "Bb", [-1]: "F",
  0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#"
};

export const parseMusicXMLMetadata = async (
  input: File | Blob | string,
  generateCover: boolean = false,
  onProgress?: (msg: string) => void,
  startPage?: number,
  endPage?: number
): Promise<{ metadata: Song; xmlData: string; layoutBundle?: any | null }> => {
  const { xml: rawXml, bundle } = await extractXmlString(input, onProgress, startPage, endPage);
  let xmlText = rawXml;
  console.log(`[MusicXmlParser] Raw XML received length: ${xmlText.length}`);
  console.log(`[MusicXmlParser] First 500 chars of XML:\n${xmlText.substring(0, 500)}`);

  // ── Music Theory Validation & Auto-Fix ──
  try {
    const report = validateMusicXml(xmlText);
    console.log(`[MusicXmlParser] 🔬 Validation: ${report.summary}`);
    if (report.score < 80 && report.autoFixable) {
      onProgress?.('🔧 กำลังซ่อมโน้ตอัตโนมัติ...');
      const fixResult = autoFixMusicXml(xmlText, report.errors);
      xmlText = fixResult.xml;
      console.log(`[MusicXmlParser] ✅ Auto-fix: ${fixResult.fixCount} fixes`);
    }
  } catch (valErr) {
    console.warn('[MusicXmlParser] Validation skipped:', valErr);
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");

  let title = xmlDoc.querySelector("work-title")?.textContent?.trim() ||
    xmlDoc.querySelector("movement-title")?.textContent?.trim();

  if (!title) {
    const credits = Array.from(xmlDoc.querySelectorAll("credit-words"));
    const titleCredit = credits.find(c => c.getAttribute("type") === "title") || credits[0];
    title = titleCredit?.textContent?.trim() || "";
  }

  let composer = xmlDoc.querySelector("creator[type='composer']")?.textContent?.trim() ||
    xmlDoc.querySelector("creator")?.textContent?.trim();

  if (!composer) {
    const credits = Array.from(xmlDoc.querySelectorAll("credit-words"));
    const composerCredit = credits.find(c => {
      const type = c.getAttribute("type")?.toLowerCase();
      return type === "composer" || type === "arranger";
    });
    composer = composerCredit?.textContent?.trim() || "Unknown Composer";
  }

  let finalTitle = title;
  let finalComposer = composer;

  const isGeneric = (t: string) => {
    const l = (t || '').toLowerCase().trim();
    return !l || l === 'untitled' || l === 'neural project' || l === 'score' || l === 'new score' || l === 'ore';
  };

  // ── [V2] Prefer AI-detected title/composer from typography bundle ───────────
  if (bundle?.metadata?.title && bundle.metadata.title.length > 1 && !isGeneric(bundle.metadata.title)) {
    finalTitle = bundle.metadata.title;
  } else {
    // If XML title is generic or empty, use filename
    if (isGeneric(title) && typeof input !== 'string' && 'name' in input) {
      let rawName = (input as File).name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      // Capitalize first letter of each word
      finalTitle = rawName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }
  
  if (bundle?.metadata?.composer && bundle.metadata.composer !== 'T=') {
    finalComposer = bundle.metadata.composer;
  } else if (bundle?.metadata?.composer === 'T=') {
    finalComposer = 'Unknown';
  }

  if (isGeneric(finalTitle)) finalTitle = 'NEURAL MASTERPIECE';
  if (finalComposer.toUpperCase() === 'MAESTRO') finalComposer = 'UNKNOWN MAESTRO';

  const perMinuteEl = xmlDoc.querySelector("per-minute");
  const soundEl = xmlDoc.querySelector("sound[tempo]");
  let bpmValue = 120;
  if (perMinuteEl) {
    const val = parseFloat(perMinuteEl.textContent || "");
    if (!isNaN(val) && val > 0) bpmValue = Math.round(val);
  } else if (soundEl) {
    const tempoAttr = soundEl.getAttribute("tempo");
    if (tempoAttr) {
      const val = parseFloat(tempoAttr);
      if (!isNaN(val) && val > 0) bpmValue = Math.round(val);
    }
  }

  const fifthsNode = xmlDoc.querySelector("fifths");
  const fifths = fifthsNode ? parseInt(fifthsNode.textContent || "0") : 0;

  // Check if input is a File (Image or PDF) to use as the cover image
  let finalCoverUrl = `https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400`;
  if (input instanceof File) {
    if (isPDFFile(input) || input.type === 'application/pdf' || input.name.toLowerCase().endsWith('.pdf')) {
      finalCoverUrl = 'pdf:' + URL.createObjectURL(input);
    } else if (isImageFile(input) || input.type.startsWith('image/')) {
      finalCoverUrl = URL.createObjectURL(input);
    }
  }

  // Removed the date append logic from the display title to keep it clean.
  const displayTitle = finalTitle;

  const metadata: Song = {
    id: `song-${Math.random().toString(36).substring(2, 11)}`,
    title: displayTitle,
    artist: finalComposer,
    bpm: isNaN(bpmValue) ? 120 : bpmValue,
    key: FIFTHS_TO_KEY[fifths] || "C",
    duration: 300,
    audioUrl: '',
    coverUrl: finalCoverUrl,
    isPremium: false,
    category: detectEra(finalComposer),
    difficulty: 'Intermediate',
    composer: finalComposer,
    era: detectEra(finalComposer),
    year: xmlDoc.querySelector("encoding-date")?.textContent?.split("-")[0] || 
          xmlDoc.querySelector("copyright")?.textContent?.match(/\d{4}/)?.[0] || "",
    instruments: Array.from(xmlDoc.querySelectorAll("part-name")).map(p => p.textContent?.trim() || "").filter(Boolean)
  };

  if (generateCover) {
    const neuralCover = await CoverGenerator.generateCover(metadata);
    if (neuralCover) metadata.coverUrl = neuralCover;
  }

  // 🧪 Validation: Ensure we actually have notes/measures
  const measures = xmlDoc.getElementsByTagName("measure");
  if (measures.length === 0) {
    throw new Error("AI อ่านภาพนี้สำเร็จแต่ไม่พบตัวโน้ตดนตรี กรุณาลองใช้ภาพที่ชัดเจนกว่านี้ หรือใช้ปุ่ม Scan Full Page ครับ");
  }

  return { metadata, xmlData: xmlText, layoutBundle: bundle ?? null };
};

export const transposeMusicXml = (xmlString: string, transpose: number): string => {
  if (transpose === 0) return xmlString;
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const stepMap = { "C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11 };

  // Sharp-side spelling (used when target key has sharps or is C major)
  const invStepMapSharp: Record<number, { step: string, alter: number }> = {
    0: { step: "C", alter: 0 }, 1: { step: "C", alter: 1 }, 2: { step: "D", alter: 0 },
    3: { step: "D", alter: 1 }, 4: { step: "E", alter: 0 }, 5: { step: "F", alter: 0 },
    6: { step: "F", alter: 1 }, 7: { step: "G", alter: 0 }, 8: { step: "G", alter: 1 },
    9: { step: "A", alter: 0 }, 10: { step: "A", alter: 1 }, 11: { step: "B", alter: 0 }
  };

  // Flat-side spelling (used when target key has flats)
  const invStepMapFlat: Record<number, { step: string, alter: number }> = {
    0: { step: "C", alter: 0 }, 1: { step: "D", alter: -1 }, 2: { step: "D", alter: 0 },
    3: { step: "E", alter: -1 }, 4: { step: "E", alter: 0 }, 5: { step: "F", alter: 0 },
    6: { step: "G", alter: -1 }, 7: { step: "G", alter: 0 }, 8: { step: "A", alter: -1 },
    9: { step: "A", alter: 0 }, 10: { step: "B", alter: -1 }, 11: { step: "B", alter: 0 }
  };

  const pcToFifths: Record<number, number> = {
    0: 0, 1: -5, 2: 2, 3: -3, 4: 4, 5: -1, 6: -6, 7: 1, 8: -4, 9: 3, 10: -2, 11: 5
  };

  // First pass: update key signatures and determine if target key is flat
  let targetFifths = 0;
  const keyNodes = xmlDoc.querySelectorAll("key");
  keyNodes.forEach(kn => {
    const fifthsNode = kn.querySelector("fifths");
    if (fifthsNode) {
      const currentFifths = parseInt(fifthsNode.textContent || "0");
      const currentPc = (currentFifths * 7 + 120) % 12;
      const targetPc = (currentPc + transpose + 120) % 12;
      if (pcToFifths[targetPc] !== undefined) {
        targetFifths = pcToFifths[targetPc];
        fifthsNode.textContent = targetFifths.toString();
      }
    }
  });

  // Choose spelling table based on whether target key is flat or sharp
  const invStepMap = targetFifths < 0 ? invStepMapFlat : invStepMapSharp;

  const notes = xmlDoc.querySelectorAll("note");
  notes.forEach(note => {
    const pitch = note.querySelector("pitch");
    if (pitch) {
      const stepNode = pitch.querySelector("step");
      const octaveNode = pitch.querySelector("octave");
      const alterNode = pitch.querySelector("alter");
      if (stepNode && octaveNode) {
        const step = stepNode.textContent || "C";
        const octave = parseInt(octaveNode.textContent || "4");
        const alter = alterNode ? parseInt(alterNode.textContent || "0") : 0;
        const baseMidi = (octave + 1) * 12 + (stepMap[step as keyof typeof stepMap] || 0) + alter;
        const newMidi = baseMidi + transpose;
        const newOctave = Math.floor(newMidi / 12) - 1;
        const newPitchIdx = ((newMidi % 12) + 12) % 12;
        const result = invStepMap[newPitchIdx];
        stepNode.textContent = result.step;
        octaveNode.textContent = newOctave.toString();
        if (result.alter !== 0) {
          if (alterNode) alterNode.textContent = result.alter.toString();
          else {
            const newAlter = xmlDoc.createElement("alter");
            newAlter.textContent = result.alter.toString();
            pitch.appendChild(newAlter);
          }
        } else if (alterNode) {
          alterNode.remove();
        }
      }
    }
  });
  let transposed = new XMLSerializer().serializeToString(xmlDoc);
  transposed = transposed.replace(/xmlns="[^"]*"/g, '');
  return transposed;
};

/**
 * [NEURAL LYRIC INJECTOR V3.1]
 * ฉีด Solfege, Jianpu, หรือ Kodaly ลงใน MusicXML 
 * ปรับปรุง: ใช้ voice number เป็น lyric number เพื่อให้ Verovio เรียงคำร้องแนวตั้งตามแนวโน้ต
 */
export const injectSolfegeToXml = (xmlString: string, mode: string): string => {
  if (!xmlString || xmlString.length < 50 || mode === 'Close' || mode === 'Lyric') return xmlString;

  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const parts = xmlDoc.querySelectorAll("part");

    parts.forEach(part => {
      let currentFifths = 0;
      let divisions = 1;
      const measures = part.querySelectorAll("measure");

      measures.forEach(measure => {
        const fifthsNode = measure.querySelector("key fifths");
        if (fifthsNode) currentFifths = parseInt(fifthsNode.textContent || "0");
        const divNode = measure.querySelector("attributes divisions");
        if (divNode) divisions = parseInt(divNode.textContent || "1");

        const isFixedMode = mode.includes('Fixed');
        const currentKey = isFixedMode ? 'C' : (FIFTHS_TO_KEY[currentFifths] || 'C');
        const allNotes = Array.from(measure.querySelectorAll("note"));

        // ── Collect notes into chord groups ──
        // Each group = [primaryNote, ...chordNotes] sharing the same beat
        const chordGroups: Element[][] = [];
        for (const note of allNotes) {
          const isChord = note.querySelector("chord") !== null;
          if (!isChord) {
            chordGroups.push([note]);
          } else if (chordGroups.length > 0) {
            chordGroups[chordGroups.length - 1].push(note);
          }
        }

        const stepToSemitone: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

        // ── Process each chord group ──
        for (const group of chordGroups) {
          // Remove any pre-existing lyrics from ALL notes in this group
          for (const note of group) {
            note.querySelectorAll("lyric").forEach(l => l.remove());
          }

          // Collect pitched note info with MIDI value for sorting
          const pitchedInfos: Array<{
            note: Element; step: string; effectiveAlter: number; midi: number; ratio: number;
          }> = [];

          for (const note of group) {
            const isRest = note.querySelector("rest");
            const pitch = note.querySelector("pitch");
            if (isRest || !pitch) continue;

            const step = pitch.querySelector("step")?.textContent || "C";
            const octave = parseInt(pitch.querySelector("octave")?.textContent || "4");
            const explicitAlter = pitch.querySelector("alter")?.textContent;
            const xmlAlter = explicitAlter !== null && explicitAlter !== undefined
              ? parseInt(explicitAlter || "0")
              : null;

            let effectiveAlter = xmlAlter ?? 0;
            if (xmlAlter === null) {
              const flatOrder = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
              const sharpOrder = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
              if (currentFifths < 0) {
                const flattedNotes = flatOrder.slice(0, Math.abs(currentFifths));
                if (flattedNotes.includes(step)) effectiveAlter = -1;
              } else if (currentFifths > 0) {
                const sharpedNotes = sharpOrder.slice(0, currentFifths);
                if (sharpedNotes.includes(step)) effectiveAlter = 1;
              }
            }

            const duration = parseInt(note.querySelector("duration")?.textContent || "0");
            const ratio = duration / divisions;
            const midi = (octave + 1) * 12 + (stepToSemitone[step] || 0) + effectiveAlter;

            pitchedInfos.push({ note, step, effectiveAlter, midi, ratio });
          }

          if (pitchedInfos.length === 0) continue;

          // ── Sort by MIDI pitch DESCENDING ──
          // Highest pitch → lyric number 1 (closest to staff in Verovio)
          pitchedInfos.sort((a, b) => b.midi - a.midi);

          // ── Assign solfege lyrics with correct vertical ordering ──
          pitchedInfos.forEach((info, idx) => {
            const solfegeText = getChromaticSolfege(
              info.step, info.effectiveAlter, currentKey, mode, info.ratio, currentFifths
            );
            if (!solfegeText) return;

            const lyric = xmlDoc.createElement("lyric");
            lyric.setAttribute("number", (idx + 1).toString());
            lyric.setAttribute("placement", "below");

            const textElement = xmlDoc.createElement("text");
            textElement.textContent = solfegeText;

            if (mode === 'Jianpu') {
              textElement.setAttribute("font-weight", "bold");
              textElement.setAttribute("font-size", "6.0");
            } else if (mode.includes('Kodaly')) {
              textElement.setAttribute("font-style", "italic");
              textElement.setAttribute("font-size", "5.4");
            }

            lyric.appendChild(textElement);
            info.note.appendChild(lyric);
          });
        }
      });
    });

    let serialized = new XMLSerializer().serializeToString(xmlDoc);
    // Verovio can fail silently if XMLSerializer injects xhtml namespaces for new elements
    serialized = serialized.replace(/xmlns="[^"]*"/g, '');
    return serialized;
  } catch (err) {
    console.error("Lyric Injection Failed:", err);
    return xmlString;
  }
};
