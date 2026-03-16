
import { Song } from '../types';
import { getChromaticSolfege } from './SolfegeLogic';
import { CoverGenerator } from './CoverGenerator';
import { MidiParser } from './MidiParser';
import JSZip from 'jszip';

export const detectEra = (composer: string): string => {
  const c = composer.toLowerCase();
  if (c.includes("bach") || c.includes("vivaldi") || c.includes("handel") || c.includes("pachelbel")) return "Baroque";
  if (c.includes("mozart") || c.includes("beethoven") || c.includes("haydn") || c.includes("clementi")) return "Classical";
  if (c.includes("chopin") || c.includes("liszt") || c.includes("schumann") || c.includes("tchaikovsky") || c.includes("brahms")) return "Romantic";
  if (c.includes("debussy") || c.includes("stravinsky") || c.includes("ravel")) return "Impressionist/Modern";
  return "Modern";
};

export const extractXmlString = async (input: File | Blob | string): Promise<string> => {
  if (typeof input === "string") return input;
  try {
    const arrayBuffer = await input.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes[0] === 0x4D && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64) {
      const fileName = (input as File).name || "MIDI_IMPORT";
      const generatedXml = await MidiParser.convertToMusicXml(arrayBuffer, fileName);
      return injectSolfegeToXml(generatedXml, 'Movable Do');
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
      return await zip.file(rootFilePath)!.async('string');
    }
    return new TextDecoder().decode(arrayBuffer);
  } catch (err) {
    throw new Error("Failed to process file.");
  }
};

const FIFTHS_TO_KEY: Record<number, string> = {
  [-6]: "Gb", [-5]: "Db", [-4]: "Ab", [-3]: "Eb", [-2]: "Bb", [-1]: "F",
  0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#"
};

export const parseMusicXMLMetadata = async (input: File | Blob | string, generateCover: boolean = false): Promise<{ metadata: Song, xmlData: string }> => {
  const xmlText = await extractXmlString(input);
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

  const isGenericTitle = !title || title.toUpperCase() === "NEURAL PROJECT" || title.toUpperCase() === "UNTITLED";
  if (isGenericTitle && typeof input !== 'string' && 'name' in input) {
    finalTitle = (input as File).name.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  }

  if (!finalTitle) finalTitle = "NEURAL MASTERPIECE";
  if (finalComposer.toUpperCase() === "MAESTRO") finalComposer = "UNKNOWN MAESTRO";

  const metronomeNode = xmlDoc.querySelector("per-minute");
  const bpmValue = metronomeNode ? parseInt(metronomeNode.textContent || "120") : 120;

  const fifthsNode = xmlDoc.querySelector("fifths");
  const fifths = fifthsNode ? parseInt(fifthsNode.textContent || "0") : 0;

  const metadata: Song = {
    id: `song-${Math.random().toString(36).substring(2, 11)}`,
    title: finalTitle,
    artist: finalComposer,
    bpm: isNaN(bpmValue) ? 120 : bpmValue,
    key: FIFTHS_TO_KEY[fifths] || "C",
    duration: 300,
    audioUrl: '',
    coverUrl: `https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400`,
    isPremium: false,
    category: detectEra(finalComposer),
    difficulty: 'Intermediate'
  };

  if (generateCover) {
    const neuralCover = await CoverGenerator.generateCover(metadata);
    if (neuralCover) metadata.coverUrl = neuralCover;
  }

  return { metadata, xmlData: xmlText };
};

export const transposeMusicXml = (xmlString: string, transpose: number): string => {
  if (transpose === 0) return xmlString;
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const stepMap = { "C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11 };
  const invStepMap: Record<number, { step: string, alter: number }> = {
    0: { step: "C", alter: 0 }, 1: { step: "C", alter: 1 }, 2: { step: "D", alter: 0 },
    3: { step: "D", alter: 1 }, 4: { step: "E", alter: 0 }, 5: { step: "F", alter: 0 },
    6: { step: "F", alter: 1 }, 7: { step: "G", alter: 0 }, 8: { step: "G", alter: 1 },
    9: { step: "A", alter: 0 }, 10: { step: "A", alter: 1 }, 11: { step: "B", alter: 0 }
  };
  const pcToFifths: Record<number, number> = {
    0: 0, 1: -5, 2: 2, 3: -3, 4: 4, 5: -1, 6: -6, 7: 1, 8: -4, 9: 3, 10: -2, 11: 5
  };
  const keyNodes = xmlDoc.querySelectorAll("key");
  keyNodes.forEach(kn => {
    const fifthsNode = kn.querySelector("fifths");
    if (fifthsNode) {
      const currentFifths = parseInt(fifthsNode.textContent || "0");
      const currentPc = (currentFifths * 7 + 120) % 12;
      const targetPc = (currentPc + transpose + 120) % 12;
      if (pcToFifths[targetPc] !== undefined) {
        fifthsNode.textContent = pcToFifths[targetPc].toString();
      }
    }
  });
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
        const newPitchIdx = newMidi % 12;
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
  return new XMLSerializer().serializeToString(xmlDoc);
};

/**
 * [NEURAL LYRIC INJECTOR V3.1]
 * ฉีด Solfege, Jianpu, หรือ Kodaly ลงใน MusicXML 
 * ปรับปรุง: ใช้ voice number เป็น lyric number เพื่อให้ Verovio เรียงคำร้องแนวตั้งตามแนวโน้ต
 */
export const injectSolfegeToXml = (xmlString: string, mode: 'Fixed Do' | 'Movable Do' | 'Words' | 'Closed' | 'Jianpu' | 'Kodaly' | 'Kodaly Rhythm'): string => {
  if (!xmlString || xmlString.length < 50 || mode === 'Closed' || mode === 'Words') return xmlString;

  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const parts = xmlDoc.querySelectorAll("part");

    parts.forEach(part => {
      let currentFifths = 0;
      let divisions = 1;
      const measures = part.querySelectorAll("measure");

      measures.forEach(measure => {
        let currentChordIndex = 1;

        const fifthsNode = measure.querySelector("key fifths");
        if (fifthsNode) currentFifths = parseInt(fifthsNode.textContent || "0");
        const divNode = measure.querySelector("attributes divisions");
        if (divNode) divisions = parseInt(divNode.textContent || "1");

        const currentKey = (mode === 'Fixed Do') ? 'C' : (FIFTHS_TO_KEY[currentFifths] || 'C');
        const notes = measure.querySelectorAll("note");

        notes.forEach(note => {
          const isRest = note.querySelector("rest");
          const isChord = note.querySelector("chord") !== null;
          const pitch = note.querySelector("pitch");
          const duration = parseInt(note.querySelector("duration")?.textContent || "0");
          const voice = note.querySelector("voice")?.textContent || "1";
          const ratio = duration / divisions;

          if (isChord) {
            currentChordIndex++;
          } else {
            currentChordIndex = 1;
          }

          if (!isRest && pitch) {
            const step = pitch.querySelector("step")?.textContent || "C";
            const alter = parseInt(pitch.querySelector("alter")?.textContent || "0");

            // คำนวณคำร้องตามโหมด
            const solfegeText = getChromaticSolfege(step, alter, currentKey, mode as any, ratio);

            // ล้าง Lyric เดิม (ถ้ามี)
            note.querySelectorAll("lyric").forEach(l => l.remove());

            // สร้าง Lyric ใหม่
            const lyric = xmlDoc.createElement("lyric");

            // ให้ใช้ currentChordIndex ไปเลย โดยไม่ต้องนำ Voice Number มาคูณ
            // เพราะ Voice ในบรรทัดเบสอาจเป็นเลข 5 ทำให้เนื้อร้องถูกดันลงไปบรรทัดที่ 17 จนห่างเกินไป!
            // เนื้อร้องมันจะไปอยู่ใต้ Staff ของตัวมันเองอยู่แล้ว
            const safeLyricNumber = currentChordIndex.toString();
            lyric.setAttribute("number", safeLyricNumber);
            lyric.setAttribute("placement", "below");

            const textElement = xmlDoc.createElement("text");
            textElement.textContent = solfegeText;

            // ปรับ Style เฉพาะของโหมด
            if (mode === 'Jianpu') {
              textElement.setAttribute("font-weight", "bold");
              textElement.setAttribute("font-size", "6.0");
            } else if (mode.includes('Kodaly')) {
              textElement.setAttribute("font-style", "italic");
              textElement.setAttribute("font-size", "5.4");
            }

            lyric.appendChild(textElement);
            note.appendChild(lyric);
          }
        });
      });
    });

    return new XMLSerializer().serializeToString(xmlDoc);
  } catch (err) {
    console.error("Lyric Injection Failed:", err);
    return xmlString;
  }
};
