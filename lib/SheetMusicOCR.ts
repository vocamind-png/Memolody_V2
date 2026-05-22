/**
 * SheetMusicOCR — Gemini Vision → MusicXML
 * -----------------------------------------
 * Supports: images (jpg/png/webp) and native PDF (multi-page).
 * Gemini 2.5 Flash natively handles application/pdf via inline_data.
 */

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const PDF_MIME_TYPE = 'application/pdf';

export interface OCRResult {
  xml: string;
  confidence: 'high' | 'medium' | 'low';
  message: string;
  /** [V2] Layout Map + Metadata + Typography bundle from Scorelens-Engine_V2 */
  bundle?: {
    version: string;
    metadata: {
      title: string | null;
      composer: string | null;
      tempo_text: string | null;
      tempo_bpm: number | null;
      integrity_hash: string;
    };
    layout_map: {
      image_width: number;
      image_height: number;
      margin_left: number;
      margin_right: number;
      margin_top: number;
      margin_bottom: number;
      avg_staff_space: number;
      avg_system_distance: number;
      systems: any[];
      system_break_ys: number[];
    };
    typography: any;
  } | null;
}


const OMR_IMAGE_PROMPT = `You are an expert music engraver and OMR specialist. Your task is to transcribe EXACTLY what is printed in the sheet music image into MusicXML 4.0 format.

CRITICAL ACCURACY REQUIREMENTS — READ CAREFULLY:

━━━ 1. TIME SIGNATURE (MOST COMMON ERROR) ━━━
Look at the NUMBER printed immediately after the key signature on the first staff line.
This is a FRACTION-LIKE symbol: top number over bottom number.
- "2" over "4" → 2/4 time → <beats>2</beats><beat-type>4</beat-type>   ← each measure has 2 quarter-note beats
- "4" over "4" → 4/4 time → <beats>4</beats><beat-type>4</beat-type>   ← each measure has 4 quarter-note beats
- "3" over "4" → 3/4 time → <beats>3</beats><beat-type>4</beat-type>   ← each measure has 3 quarter-note beats
- "6" over "8" → 6/8 time → <beats>6</beats><beat-type>8</beat-type>
- "C" symbol → Common time → <beats>4</beats><beat-type>4</beat-type>
- "C|" symbol → Cut time → <beats>2</beats><beat-type>2</beat-type>
DO NOT GUESS. DO NOT DEFAULT TO 4/4. Read the actual printed numbers. DO NOT output 'O' as a time signature.
In 2/4, each measure can only contain 2 quarter notes (or equivalent). Count the notes to verify.

━━━ 2. KEY SIGNATURE (COUNT EVERY SYMBOL) ━━━
Count every sharp (♯) or flat (♭) symbol printed on the staff lines at the beginning.
- 0 symbols = C major, <fifths>0</fifths>
- 1♯ = G major, <fifths>1</fifths>
- 2♯ = D major, <fifths>2</fifths>  
- 3♯ = A major, <fifths>3</fifths>
- 1♭ = F major, <fifths>-1</fifths>
- 2♭ = Bb major, <fifths>-2</fifths>
- 3♭ = Eb major, <fifths>-3</fifths>

━━━ 3. PITCH ACCURACY & CLEF (CRITICAL) ━━━
Identify the clef correctly before reading pitches.
- Treble Clef (G clef): Lines are E4, G4, B4, D5, F5. Spaces are F4, A4, C5, E5.
- Bass Clef (F clef): Lines are G2, B2, D3, F3, A3. Spaces are A2, C3, E3, G3.
Read every note carefully. If a note is on the second line from the bottom in Treble Clef, it is G4.

━━━ 4. ACCIDENTALS IN EACH MEASURE (READ NOTE-BY-NOTE) ━━━
For EVERY note in EVERY measure, check if there is a small ♯, ♭, or ♮ printed IMMEDIATELY to the LEFT of the notehead.
- If you see ♯ next to a note → add <alter>1</alter> AND <accidental>sharp</accidental>
- If you see ♭ next to a note → add <alter>-1</alter> AND <accidental>flat</accidental>
- If you see ♮ next to a note → add <alter>0</alter> AND <accidental>natural</accidental>
NOTE: Accidentals carry through the entire measure. If measure 3 has F♯, ALL F notes in measure 3 are sharp.
Accidentals reset at every barline (new measure).

Example of a note with a flat:
<note>
  <pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch>
  <duration>2</duration><type>quarter</type>
  <accidental>flat</accidental>
</note>

━━━ 5. RESTS ━━━
For every rest symbol in the score, output:
<note><rest/><duration>X</duration><type>quarter/half/whole/eighth</type></note>
Do not skip rests. They count towards the measure duration.

━━━ 6. NOTE BEAMING (Connected note tails) ━━━
For groups of eighth/16th notes connected by a beam (horizontal bar across their stems):
- First note: <beam number="1">begin</beam>
- Middle notes: <beam number="1">continue</beam>
- Last note: <beam number="1">end</beam>
For 16th notes, add <beam number="2"> with same begin/continue/end pattern.

━━━ 7. DO NOT INVENT ━━━
Do NOT add chord symbols (<harmony>) unless they are printed in the score.
Do NOT change key or time signatures.
Do NOT add or remove notes.

━━━ 8. INSTRUMENT PARTS & STAVES ━━━
IMPORTANT: You MUST include a <part-list> before the parts!
- For a solo instrument (e.g. Violin):
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1"> ... </part>
- For Piano (Grand Staff):
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"> (with <staff>1</staff> and <staff>2</staff>, using <backup>) </part>
- For ensembles (e.g. Violin + Piano):
  <part-list>
    <score-part id="P1"><part-name>Violin</part-name></score-part>
    <score-part id="P2"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1"> ... </part>
  <part id="P2"> ... </part>

━━━ 9. TITLES & TEMPO ━━━
- Song title → <work-title>EXACT TITLE</work-title> (DO NOT invent titles. DO NOT append dates. If unclear, leave blank)
- Composer → <creator type="composer">NAME</creator>
- Andantino=76, Andante=72, Moderato=108, Allegro=132 BPM

OUTPUT: Start IMMEDIATELY with <?xml — no markdown, no explanation, no extra text.

Start your response IMMEDIATELY with: <?xml`;

const OMR_PDF_PROMPT = `You are an expert music engraver and OMR specialist. Your task is to transcribe ALL PAGES of this PDF score into one complete MusicXML 4.0 document.

CRITICAL ACCURACY REQUIREMENTS:

━━━ 1. TIME SIGNATURE (READ THE ACTUAL NUMBERS) ━━━
Look at the symbol on the first staff: a number over a number.
- Top number = beats per measure, bottom number = note value of one beat
- 2/4 = <beats>2</beats><beat-type>4</beat-type>  |  3/4 = <beats>3</beats><beat-type>4</beat-type>
- 4/4 = <beats>4</beats><beat-type>4</beat-type>  |  6/8 = <beats>6</beats><beat-type>8</beat-type>
NEVER DEFAULT TO 4/4. Read and output exactly what is printed.

━━━ 2. KEY SIGNATURE ━━━
Count sharps or flats printed at the start of each staff.
1♯=G(1), 2♯=D(2), 3♯=A(3), 1♭=F(-1), 2♭=Bb(-2), 3♭=Eb(-3). Set <fifths> accordingly.

━━━ 3. ACCIDENTALS (CRITICAL — READ EVERY NOTE) ━━━
For EVERY note, check if a ♯, ♭ or ♮ is printed to its left:
- ♯ → <alter>1</alter> + <accidental>sharp</accidental>
- ♭ → <alter>-1</alter> + <accidental>flat</accidental>  
- ♮ → <alter>0</alter> + <accidental>natural</accidental>
Accidentals last for the whole measure, reset at barlines.

━━━ 4. RESTS, TIES, DOTS ━━━
- Rest symbols → <note><rest/>...</note>
- Tied notes → <tie type="start"/> on first, <tie type="stop"/> on second
- Dotted notes → multiply duration by 1.5

━━━ 5. BEAMING ━━━
Connected note groups: first=<beam number="1">begin</beam>, middle=continue, last=end.

━━━ 6. MULTI-PAGE TRANSCRIPTION ━━━
Transcribe ALL pages in order. Maintain consecutive measure numbers. Do NOT stop after page 1.

━━━ 7. INSTRUMENT PARTS & STAVES ━━━
IMPORTANT: You MUST include a <part-list> before the parts!
- For a solo instrument:
  <part-list><score-part id="P1"><part-name>Instrument</part-name></score-part></part-list>
  <part id="P1"> ... </part>
- For ensembles (e.g. Violin + Piano):
  <part-list>
    <score-part id="P1"><part-name>Violin</part-name></score-part>
    <score-part id="P2"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1"> ... </part>
  <part id="P2"> ... </part>

OUTPUT: Raw XML only. Start with: <?xml version="1.0" encoding="UTF-8"?>

Start your response IMMEDIATELY with: <?xml`;

const OMR_VERIFY_PROMPT = `You are an expert music proofreader. You will be given:
1. A sheet music image/PDF
2. A draft MusicXML

Your job: Fix ALL errors. Output the corrected, complete MusicXML. Follow this checklist:

✅ STEP 1 — TIME SIGNATURE
Look at the score image. What number is on top of the time signature symbol?
What number is on the bottom? Compare to <beats> and <beat-type> in the draft.
IF WRONG → fix ALL occurrences to match the image EXACTLY.
Common error: draft says 4/4 but image clearly shows 2/4 or 3/4.

✅ STEP 2 — KEY SIGNATURE (CRITICAL)
Count exactly how many ♯ or ♭ are printed right after the clef at the start of EVERY staff line.
- If 1 Sharp → <fifths>1</fifths>
- If 2 Sharps → <fifths>2</fifths>
- If 3 Sharps → <fifths>3</fifths>
Compare to <fifths> in the draft. Fix if wrong.

✅ STEP 2.5 — MEASURE COUNT
Count the total number of measures (barlines) in the original image page.
Ensure your MusicXML output produces exactly the same number of <measure> tags. Do not skip any measures.

✅ STEP 3 — ACCIDENTALS (MOST IMPORTANT — CHECK EVERY MEASURE)
For each measure in the image, scan every notehead:
- Is there a small ♯, ♭, or ♮ to the LEFT of any notehead?
- If yes, does the corresponding note in the XML have <alter> and <accidental> tags?
- ADD any missing accidentals. REMOVE any invented ones.
Remember: accidentals carry within a measure but reset at each barline.

✅ STEP 4 — RESTS
Is every rest symbol in the image represented by <note><rest/></note> in the XML?
Add any missing rests. They must be included to keep measure durations correct.

✅ STEP 5 — MEASURE DURATIONS
For the current time signature (beats/beat-type), every measure must sum to exactly:
  total_duration = beats × (divisions × 4 / beat-type)
Fix any measures that overflow or underflow.

✅ STEP 6 — NOTE PITCHES, STEMS, AND RHYTHMS (CRITICAL 100% MATCH)
- Verify each note's pitch (step + octave) matches the staff line perfectly. Look carefully at ledger lines.
- Look at the stem (the vertical line attached to the notehead). Is it pointing UP or DOWN?
  - If UP: add <stem>up</stem>
  - If DOWN: add <stem>down</stem>
- Beaming (Eighth notes = ชั้น 1, Sixteenth notes = ชั้น 2):
  If notes are connected by a thick black line (beam), you MUST add <beam> tags:
  <beam number="1">begin</beam>, <beam number="1">continue</beam>, <beam number="1">end</beam>
  If connected by TWO thick lines (sixteenth notes), add:
  <beam number="1">begin</beam><beam number="2">begin</beam> and so on.

✅ STEP 7 — INVENTED HARMONIES
Delete ALL <harmony> elements that are NOT printed in the score image.

✅ STEP 8 — TITLE & COMPOSER
Verify <work-title> matches the printed title. Verify <creator> matches the composer.

OUTPUT: Complete, corrected MusicXML only. Start with <?xml. No explanation, no markdown. You MUST return the FULL score, do not truncate.`;

// ─────────────────────── melody-only prompt ───────────────────────────────

const OMR_MELODY_ONLY_PROMPT = `You are an expert music transcriber. Look at this sheet music and extract ONLY the TOP STAFF (melody/solo instrument line).

If there are multiple staves (e.g., violin + piano, or treble + bass clef), ONLY transcribe the UPPERMOST staff — the solo or melody line.

FOLLOW THESE RULES EXACTLY:

1. TIME SIGNATURE — look at the numbers printed right after the clef sign on the first staff:
   - If you see "2" over "4" → beats=2, beat-type=4
   - If you see "3" over "4" → beats=3, beat-type=4
   - If you see "4" over "4" → beats=4, beat-type=4
   - "C" symbol → beats=4, beat-type=4
   DO NOT default to 4/4. Read the ACTUAL printed numbers. DO NOT output 'O'.

2. KEY SIGNATURE — count ♯ or ♭ symbols at the start of each staff line:
   - 0 symbols → <fifths>0</fifths>
   - 1 ♯ → <fifths>1</fifths>, 2 ♯ → <fifths>2</fifths>, 3 ♯ → <fifths>3</fifths>
   - 1 ♭ → <fifths>-1</fifths>, 2 ♭ → <fifths>-2</fifths>

3. ACCIDENTALS — for EVERY note, check if ♯, ♭, or ♮ is printed immediately to its LEFT:
   - ♯ → <alter>1</alter> AND <accidental>sharp</accidental>
   - ♭ → <alter>-1</alter> AND <accidental>flat</accidental>
   - ♮ → <alter>0</alter> AND <accidental>natural</accidental>

4. BEAMING — eighth notes joined by a horizontal bar:
   - First note: <beam number="1">begin</beam>
   - Middle notes: <beam number="1">continue</beam>
   - Last note: <beam number="1">end</beam>

5. RESTS — only add rests that are ACTUALLY PRINTED in the score. Do not add rests to fill up measures.

6. MEASURE COMPLETENESS — each measure must have exactly the right total duration for the time signature.
   For 2/4: exactly 2 quarter-note beats. For 3/4: exactly 3. For 4/4: exactly 4.

Output a COMPLETE, VALID MusicXML document containing ONLY this single <part> element.
Do NOT include piano/bass/accompaniment staves.
Output IMMEDIATELY with <?xml. Your output MUST include <score-partwise> and <part-list> wrappers. No explanation, no markdown.

Start your response with: <?xml`;

// ─────────────────────────────── helpers ───────────────────────────────

/** Convert File to base64 data string (strips the data:...;base64, prefix) */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Get Gemini API key — vite.config.ts injects via define{} as process.env.* */
function getApiKey(): string {
  // vite.config.ts defines these at build time:
  //   'process.env.API_KEY': JSON.stringify(GEMINI_KEY)
  //   'process.env.GEMINI_API_KEY': JSON.stringify(GEMINI_KEY)
  // @ts-ignore
  const key = (process.env.GEMINI_API_KEY || process.env.API_KEY || '') as string;
  if (!key) throw new Error('GEMINI_API_KEY ไม่ได้ตั้งค่า กรุณาตรวจสอบไฟล์ .env');
  return key;
}

/** Call Gemini generateContent with the given content parts */
// Simple in‑memory cache for Gemini responses
const geminiCache = new Map<string, string>();
let lastGeminiCall = 0;
/**
 * Rate‑limited wrapper around the real Gemini call.
 * Guarantees at least 1500 ms between successive requests.
 */
async function rateLimitedCallGemini(parts: object[]): Promise<string> {
  const now = Date.now();
  const elapsed = now - lastGeminiCall;
  if (elapsed < 1500) {
    await new Promise(res => setTimeout(res, 1500 - elapsed));
  }
  lastGeminiCall = Date.now();
  return callGeminiVision(parts);
}

async function callGeminiVision(parts: object[]): Promise<string> {
  const cacheKey = JSON.stringify(parts);
  if (geminiCache.has(cacheKey)) {
    return geminiCache.get(cacheKey)!;
  }
  const apiKey = getApiKey();
  const modelsToTry = [
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ];
  let errors: string[] = [];

  for (const modelName of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      try {
        console.log(`[Gemini] Attempting ${modelName} (Attempt ${retries + 1})...`);
        const isThinkingModel = modelName.includes('2.5');
        const body: any = {
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.05,
            maxOutputTokens: 65536,
          },
        };
        if (isThinkingModel) {
          body.generationConfig.thinkingConfig = {
            thinkingBudget: 2048
          };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(240000),
        });

        if (res.ok) {
          const data = await res.json();
          const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (!rawText) throw new Error('Empty response from AI');
          geminiCache.set(cacheKey, rawText);
          return rawText;
        }

        const errorStatus = res.status;
        const isRetryable = errorStatus === 429 || errorStatus === 503 || errorStatus === 500;
        
        if (isRetryable && retries < maxRetries) {
          const waitTime = (retries + 1) * 3000;
          await new Promise(r => setTimeout(r, waitTime));
          retries++;
          continue;
        }

        const errData = await res.json().catch(() => ({ error: { message: res?.statusText } }));
        const currentErr = `${modelName}: ${errData?.error?.message || res.statusText}`;
        console.warn(`[Gemini] ${modelName} failed: ${currentErr}`);
        errors.push(currentErr);
        break; // Try next model
      } catch (err: any) {
        if (err.name === 'AbortError' && retries < maxRetries) {
          retries++;
          continue;
        }
        console.warn(`[Gemini] Exception on ${modelName}:`, err.message);
        errors.push(`${modelName}: ${err.message}`);
        break; // Try next model
      }
    }
  }

  throw new Error(
    `Gemini AI ไม่สามารถอ่านโน้ตได้ในขณะนี้\n\nสาเหตุ:\n${errors.join('\\n')}\n\nแนะนำ: ลองใหม่อีกครั้ง หรือตรวจสอบ GEMINI_API_KEY ใน .env`
  );
}

/** Strip markdown fences and extract clean MusicXML block from Gemini response */
function extractXmlFromGeminiResponse(rawText: string): string {
  // Strip markdown code fences
  let text = rawText
    .replace(/^```(?:xml|musicxml)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  // Strip <?xml... if present so we can standardize it
  text = text.replace(/<\?xml[^>]*\?>\s*/, '').trim();

  // If Gemini only output <part>, we MUST wrap it in <score-partwise> to make it valid MusicXML
  if (!text.includes('<score-partwise') && text.includes('<part')) {
    const partIdMatch = text.match(/<part[^>]*id="([^"]+)"/);
    const partId = partIdMatch ? partIdMatch[1] : 'P1';
    text = `<score-partwise version="3.1">\n  <part-list>\n    <score-part id="${partId}">\n      <part-name>Part 1</part-name>\n    </score-part>\n  </part-list>\n` + text + `\n</score-partwise>`;
  }

  const xmlStart = text.indexOf('<score-partwise');
  if (xmlStart !== -1) {
    let xml = text.slice(xmlStart);
    // Remove anything after the closing tag, unless it's truncated
    const xmlEnd = xml.lastIndexOf('</score-partwise>');
    if (xmlEnd !== -1) {
      xml = xml.slice(0, xmlEnd + '</score-partwise>'.length);
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
  }

  // If Gemini returned text but no XML, it probably couldn't read the image
  const snippet = rawText.substring(0, 200).trim();
  throw new Error(
    `Gemini ไม่พบ MusicXML ในผลลัพธ์\n\nGemini ตอบว่า: "${snippet}..."\n\nกรุณาตรวจสอบว่าภาพเป็นโน้ตดนตรีที่ชัดเจน`
  );
}

/** Auto-repair truncated XML when Gemini hits max tokens mid-document */
function repairTruncatedXml(xml: string): string {
  if (xml.includes('</score-partwise>')) return xml;
  const noteCount = (xml.match(/<note/g) || []).length;
  if (noteCount === 0) return xml;
  console.warn('[SheetMusicOCR] XML truncated — auto-repairing...');
  if (!xml.includes('</measure>') || xml.lastIndexOf('<measure') > xml.lastIndexOf('</measure>')) xml += '\n    </measure>';
  if (!xml.includes('</part>') || xml.lastIndexOf('<part') > xml.lastIndexOf('</part>')) xml += '\n  </part>';
  xml += '\n</score-partwise>';
  return xml;
}

// ─────────────────────────── public API ────────────────────────────────

/**
 * Recognize sheet music from an IMAGE file via Gemini Vision (single-pass, enhanced prompt)
 */
export async function recognizeSheetMusic(file: File): Promise<OCRResult> {
  if (!IMAGE_MIME_TYPES.includes(file.type) && !/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
    throw new Error(`ไม่รองรับไฟล์ประเภทนี้: ${file.type}. กรุณาใช้ JPG, PNG, หรือ WebP`);
  }

  console.log('[SheetMusicOCR] Image → Gemini Vision:', file.name, `(${(file.size / 1024).toFixed(0)}KB)`);

  const base64Data = await fileToBase64(file);
  const mimeType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';

  // ── PASS 1: Transcription ──
  const rawText = await rateLimitedCallGemini([
    { text: OMR_IMAGE_PROMPT },
    { inline_data: { mime_type: mimeType, data: base64Data } },
  ]);

  let xml = extractXmlFromGeminiResponse(rawText);
  xml = repairTruncatedXml(xml);

  const noteCount = (xml.match(/<note/g) || []).length;
  const confidence: OCRResult['confidence'] = noteCount > 20 ? 'high' : noteCount > 5 ? 'medium' : 'low';
  console.log(`[SheetMusicOCR] ✅ Gemini OMR Success: ${noteCount} notes`);

  return { xml: xml, confidence, message: `Gemini อ่านได้ ${noteCount} โน้ต` };
}

/**
 * Recognize sheet music from a PDF file via Gemini Vision (single-pass, enhanced prompt)
 * Gemini 2.5 Flash natively supports application/pdf — no page conversion needed.
 */
export async function recognizePDF(file: File): Promise<OCRResult> {
  if (!isPDFFile(file)) throw new Error('File is not a PDF');

  const sizeMB = file.size / (1024 * 1024);
  console.log(`[SheetMusicOCR] PDF → Gemini Vision: ${file.name} (${sizeMB.toFixed(1)}MB)`);

  if (sizeMB > 20) {
    throw new Error(
      `PDF ขนาด ${sizeMB.toFixed(1)}MB ใหญ่เกินไป (สูงสุด 20MB)\n` +
      `กรุณาลด resolution หรือตัดเฉพาะส่วนที่ต้องการครับ`
    );
  }

  const base64Data = await fileToBase64(file);

  const rawText = await rateLimitedCallGemini([
    { text: OMR_PDF_PROMPT },
    { inline_data: { mime_type: PDF_MIME_TYPE, data: base64Data } },
  ]);

  let xml = extractXmlFromGeminiResponse(rawText);
  xml = repairTruncatedXml(xml);

  const noteCount = (xml.match(/<note/g) || []).length;
  const confidence: OCRResult['confidence'] = noteCount > 50 ? 'high' : noteCount > 10 ? 'medium' : 'low';
  console.log(`[SheetMusicOCR] ✅ PDF: ${noteCount} notes`);

  return { xml, confidence, message: `Gemini อ่าน PDF ได้ ${noteCount} โน้ต` };
}

/**
 * Melody-Only extraction — Gemini Vision focused on TOP STAFF only.
 * Use this when full-score Gemini fails (complex multi-part score).
 * Much more reliable than Oemer for time sig, accidentals, and beaming.
 */
export async function recognizeMelodyOnly(file: File): Promise<OCRResult> {
  const isPdf = isPDFFile(file);
  const base64Data = await fileToBase64(file);
  const mimeType = isPdf ? PDF_MIME_TYPE : (file.type || 'image/jpeg');

  console.log(`[SheetMusicOCR] Melody-Only fallback: ${file.name}`);

  const rawText = await rateLimitedCallGemini([
    { text: OMR_MELODY_ONLY_PROMPT },
    { inline_data: { mime_type: mimeType, data: base64Data } },
  ]);

  // Wrap single <part> in a full score-partwise if needed
  let xml = rawText.trim();
  if (xml.startsWith('```')) {
    xml = xml.replace(/^```(?:xml|musicxml)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();
  }

  // If response is a raw <part> without score wrapper, wrap it
  if (!xml.includes('<score-partwise') && xml.includes('<part')) {
    const partStart = xml.indexOf('<part');
    const partContent = xml.slice(partStart);
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Melody</part-name></score-part>
  </part-list>
  ${partContent}
</score-partwise>`;
  } else {
    try {
      xml = extractXmlFromGeminiResponse(rawText);
    } catch {
      xml = repairTruncatedXml(xml);
    }
  }

  xml = repairTruncatedXml(xml);

  const noteCount = (xml.match(/<note/g) || []).length;
  console.log(`[SheetMusicOCR] ✅ Melody-Only: ${noteCount} notes`);

  return {
    xml,
    confidence: noteCount > 5 ? 'medium' : 'low',
    message: `Gemini อ่านทำนองหลักได้ ${noteCount} โน้ต`
  };
}

/**
 * Local ScoreLens V3 OMR server (port 3003) — MIT License, commercial-safe
 * Returns MusicXML + LayoutMap bundle from Scorelens-Engine_V2
 */
export async function omrWithOemer(file: File, startPage?: number, endPage?: number): Promise<OCRResult> {
  const formData = new FormData();
  formData.append('image', file);
  if (startPage) formData.append('startPage', startPage.toString());
  if (endPage) formData.append('endPage', endPage.toString());

  // Send to local Memolody OMR Node.js Server (ScoreLens V3 Core Pipeline)
  const res = await fetch('http://localhost:3003/omr-v3', {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(1800000), // 1800s (30m): DL inference on CPU
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'OMR error' }));
    throw new Error(err.error || `OMR error ${res.status}`);
  }

  // ── [V2] Parse JSON bundle response ─────────────────────────────────────
  let data: { xml: string; bundle?: any; validation?: any };
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    // Fallback: old server sends raw XML text
    const rawXml = await res.text();
    data = { xml: rawXml };
  }

  const { xml, bundle } = data;

  if (!xml || !xml.includes('<score-partwise')) {
    throw new Error('Invalid MusicXML from ScoreLens V3');
  }

  // 🧪 Validation: Ensure we actually have measures
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, 'text/xml');
  const measures = xmlDoc.getElementsByTagName('measure');
  if (measures.length === 0) {
    throw new Error('ScoreLens V3 อ่านภาพสำเร็จแต่ไม่พบตัวโน้ตดนตรี กรุณาลองใช้ภาพที่ชัดเจนกว่านี้');
  }

  const noteCount = (xml.match(/<note/g) || []).length;
  if (noteCount < 5) throw new Error(`ScoreLens V3 found only ${noteCount} notes`);

  // Log bundle info if available
  if (bundle?.layout_map) {
    const lm = bundle.layout_map;
    console.log(
      `[ScoreLens V3] 📐 Layout: ${lm.systems?.length || 0} systems | ` +
      `staff_space=${lm.avg_staff_space}px | system_dist=${lm.avg_system_distance}px`
    );
  }
  if (bundle?.metadata?.title) {
    console.log(`[ScoreLens V3] 🎼 Detected title: "${bundle.metadata.title}"`);
  }

  return {
    xml,
    confidence: noteCount > 20 ? 'high' : 'medium',
    message: `ScoreLens V3 อ่านได้ ${noteCount} โน้ต`,
    bundle: bundle || null,
  };
}


/** Returns true if this file should go through image OMR */
export function isImageFile(file: File): boolean {
  return IMAGE_MIME_TYPES.includes(file.type) || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
}

/** Returns true if this file is a PDF */
export function isPDFFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}




export async function recognizeVerificationPass(file: File, draftXml: string): Promise<OCRResult> {
  const isPdf = isPDFFile(file);
  console.log(`[SheetMusicOCR] 🔍 Verification Pass: ${file.name} (${file.type}) | draftXml: ${draftXml.length} chars`);
  
  const base64Data = await fileToBase64(file);
  const mimeType = isPdf ? PDF_MIME_TYPE : ((file.type || 'image/jpeg') as string);

  // Truncate draftXml to prevent exceeding context window
  // Send only first 8000 chars (covers ~2-4 pages of music)
  const MAX_DRAFT_CHARS = 8000;
  const safeDraft = draftXml.length > MAX_DRAFT_CHARS
    ? draftXml.substring(0, MAX_DRAFT_CHARS) + '\n<!-- [TRUNCATED] -->\n</part></score-partwise>'
    : draftXml;

  const rawText = await rateLimitedCallGemini([
    { text: OMR_VERIFY_PROMPT + '\n\n=== DRAFT MUSICXML TO VERIFY ===\n' + safeDraft },
    { inline_data: { mime_type: mimeType, data: base64Data } },
  ]);

  let xml = rawText.trim();
  // strip markdown fences
  if (xml.startsWith('```')) {
    xml = xml.replace(/^```(?:xml|musicxml)?\s*/im, '').replace(/\s*```\s*$/m, '');
  }
  xml = extractXmlFromGeminiResponse(rawText);
  xml = repairTruncatedXml(xml);

  const noteCount = (xml.match(/<note/g) || []).length;
  console.log(`[SheetMusicOCR] ✅ Verification Pass: ${noteCount} notes in corrected XML`);
  return { xml, confidence: 'high', message: `ตรวจสอบและแก้ไขได้ ${noteCount} โน้ต` };
}

export async function recognizeCorrectionPass(file: File, draftXml: string, errors: string[]): Promise<OCRResult> {
  const isPdf = isPDFFile(file);
  console.log(`[SheetMusicOCR] 🔄 Correction Pass: ${errors.length} errors to fix`);
  
  const base64Data = await fileToBase64(file);
  const mimeType = isPdf ? PDF_MIME_TYPE : ((file.type || 'image/jpeg') as string);

  const MAX_DRAFT_CHARS = 8000;
  const safeDraft = draftXml.length > MAX_DRAFT_CHARS
    ? draftXml.substring(0, MAX_DRAFT_CHARS) + '\n<!-- [TRUNCATED] -->\n</part></score-partwise>'
    : draftXml;

  const correctionPrompt = `
You are an expert MusicXML editor. I have a draft MusicXML generated from the attached score image.
The validator found the following errors in this draft:
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

INSTRUCTIONS:
1. Look at the attached image carefully.
2. Fix ALL the errors listed above in the draft MusicXML.
3. Pay strict attention to the exact notes in the first measure and ensure the correct starting rests and pitches are present.
4. Verify the Key Signature (how many Sharps/Flats). Ensure <fifths> matches the image perfectly.
5. Check all Eighth (1-beam) and Sixteenth (2-beams) notes. Ensure stem directions (<stem>up</stem> or <stem>down</stem>) and <beam> tags match the image exactly.
6. Count the total number of measures per page in the image. Ensure the XML has the exact same number of measures.
7. Make sure the total duration of notes in each measure matches the time signature.

OUTPUT: Return the FULL corrected MusicXML. Start with <?xml. No markdown fences.
=== DRAFT MUSICXML ===
${safeDraft}
`;

  const rawText = await rateLimitedCallGemini([
    { text: correctionPrompt },
    { inline_data: { mime_type: mimeType, data: base64Data } },
  ]);

  let xml = rawText.trim();
  if (xml.startsWith('```')) {
    xml = xml.replace(/^```(?:xml|musicxml)?\s*/im, '').replace(/\s*```\s*$/m, '');
  }
  xml = extractXmlFromGeminiResponse(rawText);
  xml = repairTruncatedXml(xml);

  const noteCount = (xml.match(/<note/g) || []).length;
  return { xml, confidence: 'high', message: `แก้ไขข้อผิดพลาดสำเร็จ (${noteCount} โน้ต)` };
}

export interface MetadataResult {
  title: string;
  artist: string;
  text: string;
  timeSignature: string;
  fifths: number | undefined;
}

export async function extractMetadataWithGemini(file: File): Promise<MetadataResult> {
  const emptyResult: MetadataResult = { title: '', artist: '', text: '', timeSignature: '', fifths: undefined };
  try {
    const isPdf = isPDFFile(file);
    const base64Data = await fileToBase64(file);
    const mimeType = isPdf ? PDF_MIME_TYPE : (file.type || 'image/jpeg');

    const prompt = `Look at this sheet music image and extract ONLY the following information.
Respond in JSON format ONLY — no explanation, no markdown fences.

{
  "title": "Song title printed at the top (exact text)",
  "artist": "Composer or arranger name if printed",
  "text": "Any lyrics or annotations visible",
  "timeSignature": "The time signature printed after the clef (e.g. '2/4', '3/4', '4/4', '6/8')",
  "fifths": 0
}

For 'fifths': count sharps or flats in the key signature at the start of the staff.
- 0 sharps/flats = 0
- 1 sharp = 1, 2 sharps = 2, 3 sharps = 3
- 1 flat = -1, 2 flats = -2, 3 flats = -3

IMPORTANT FOR TITLE: DO NOT invent a title. DO NOT append dates. If the title is just a single letter like "Ef" or "F", or if it is illegible, leave it blank "". 

IMPORTANT FOR TIME SIGNATURE: Look for the fraction-like symbol right after the clef and key signature.
If you see a large 'C', it means '4/4'. If you see 'C|', it means '2/2'.
DO NOT output 'O' as a time signature.
Read BOTH numbers carefully. Do NOT assume 4/4. Report exactly what you see.`;

    // NOTE: Do NOT cache metadata calls — always fetch fresh from API
    const cacheKey = `metadata_${file.name}_${file.size}`;
    if (geminiCache.has(cacheKey)) {
      geminiCache.delete(cacheKey); // Force fresh call every time
    }

    const rawText = await rateLimitedCallGemini([
      { text: prompt },
      { inline_data: { mime_type: mimeType, data: base64Data } }
    ]);

    console.log('[extractMetadataWithGemini] Raw response:', rawText.substring(0, 200));

    let jsonStr = rawText.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json\n/, '').replace(/\n```$/, '');
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```.*\n/, '').replace(/\n```$/, '');

    // Find JSON object in response
    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
    }

    const data = JSON.parse(jsonStr);
    
    // ── [V3] Robust Metadata Normalization ───────────────────────────
    let title = (data.title || '').trim();
    let artist = (data.artist || '').trim();

    // If Gemini returns "Score" or similar as title, try to find something better
    const isGeneric = (t: string) => {
      const l = t.toLowerCase();
      return l === 'score' || l === 'untitled' || l === 'new score' || l.length < 2;
    };

    const result: MetadataResult = {
      title: isGeneric(title) ? '' : title,
      artist: isGeneric(artist) ? '' : artist,
      text: (data.text || '').trim(),
      timeSignature: data.timeSignature || '',
      fifths: data.fifths !== undefined ? parseInt(String(data.fifths)) : undefined
    };
    console.log('[extractMetadataWithGemini] Parsed:', result);
    return result;
  } catch (err) {
    console.warn('[extractMetadataWithGemini] Failed:', err);
    return emptyResult;
  }
}
