/**
 * Memolody OMR Server v3.0 — Oemer AI Engine (MIT License)
 * 
 * Commercial-safe OMR pipeline:
 *   1. Image enhancement (upscale to 3000px, sharpen, normalize)
 *   2. Oemer Deep Learning OMR → MusicXML
 *   3. Music Theory Validator — auto-detect & flag rhythm errors
 * 
 * License: All engines used are MIT/Apache — safe for commercial use.
 * No AGPL (Audiveris) dependencies.
 */

import express from 'express';
import multer from 'multer';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import cors from 'cors';
import sharp from 'sharp';

const execAsync = promisify(exec);
const app = express();
const PORT = 3003;

// ── Manual .env Loader ────────────────────────────────────────────────
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    });
    console.log('[Setup] Loaded .env configuration');
  }
} catch (err) { console.warn('[Setup] Failed to load .env:', err.message); }

app.use(cors());

const upload = multer({ 
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ══════════════════════════════════════════════════════════════════════
// ── Image Enhancement ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
async function enhanceImage(inputPath) {
  const outputPath = inputPath + '_enhanced.png';
  try {
    const { width: w = 1000, height: h = 1400 } = await sharp(inputPath).metadata();
    const targetWidth = Math.max(w, 3000);
    const scale = targetWidth / w;

    let pipe = sharp(inputPath);
    if (scale > 1.05) {
      pipe = pipe.resize(Math.round(w * scale), Math.round(h * scale), {
        kernel: sharp.kernel.lanczos3,
        fit: 'fill'
      });
    }
    // Binarize: convert to pure black & white for better staffline detection
    // This dramatically helps Oemer's staffline extraction on scanned/photo images
    await pipe
      .sharpen({ sigma: 1.0 })
      .normalize()
      .threshold(128)  // Pure B&W binarization
      .png()
      .toFile(outputPath);
    console.log(`[Enhance] ${w}x${h} → ${Math.round(w * scale)}x${Math.round(h * scale)} (binarized)`);
    return outputPath;
  } catch (err) {
    console.warn('[Enhance] Skipped:', err.message);
    return inputPath;
  }
}

// ══════════════════════════════════════════════════════════════════════
// ── ScoreLens Deep Learning OMR (Scorelens-Engine V2) ─────────────────
// ══════════════════════════════════════════════════════════════════════
const PYTHON_BIN = '/Users/paisan/miniconda3/envs/memolody/bin/python';
const PROJECT_ROOT = '/Users/paisan/vocamind-projects/Memolody_V2';

async function runOemer(imagePath) {
  const outputDir = path.join(os.tmpdir(), `scorelens_${Date.now()}`);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`[ScoreLens V2] Processing: ${path.basename(imagePath)}`);
  // ── Use Scorelens-Engine_V2 (improved engine with Layout Map + Typography) ──
  const cmd = `cd "${PROJECT_ROOT}" && "${PYTHON_BIN}" -m Scorelens_Engine_V2.ete "${imagePath}" -o "${outputDir}" --without-deskew 2>&1`;

  try {
    const { stdout } = await execAsync(cmd, { timeout: 600000 }); // 10min — DL inference on CPU
    console.log('[ScoreLens V2] Done:', stdout.slice(-200).trim());
  } catch (err) {
    console.error('SCORE_LENS_V2_FULL_ERROR:\n', err.stdout);
    const detail = (err.stderr || err.stdout || err.message || '').slice(-2000);
    try { fs.rmSync(outputDir, { recursive: true, force: true }); } catch {}
    throw new Error(`ScoreLens V2 failed: ${detail}`);
  }

  const xmlFile = fs.readdirSync(outputDir).find(f => f.endsWith('.musicxml') || f.endsWith('.xml'));
  if (!xmlFile) throw new Error('ScoreLens V2 produced no MusicXML output');

  const xml = fs.readFileSync(path.join(outputDir, xmlFile), 'utf-8');

  // ── [V2] Read JSON Bundle (Layout Map + Metadata + Typography) ──────────
  let bundle = null;
  const jsonFile = fs.readdirSync(outputDir).find(f => f.endsWith('_bundle.json'));
  if (jsonFile) {
    try {
      bundle = JSON.parse(fs.readFileSync(path.join(outputDir, jsonFile), 'utf-8'));
      console.log(`[ScoreLens V2] 📦 Bundle loaded: ${bundle.metadata?.title || 'untitled'}`);
    } catch (jsonErr) {
      console.warn('[ScoreLens V2] Bundle JSON parse error:', jsonErr.message);
    }
  }

  try { fs.rmSync(outputDir, { recursive: true, force: true }); } catch {}
  console.log(`[ScoreLens V2] ✅ ${(xml.match(/<note/g) || []).length} notes | Layout: ${bundle?.layout_map?.systems?.length || 0} systems`);
  return { xml, bundle };
}

// ══════════════════════════════════════════════════════════════════════
// ── PDF → PNG via macOS sips ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
async function pdfToPngPages(pdfPath, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  const namedPdf = path.join(outputDir, 'input.pdf');
  fs.copyFileSync(pdfPath, namedPdf);

  // Use pdftoppm (poppler) for high-quality PDF→PNG at 300 DPI
  // Much better than macOS sips for music score rendering
  try {
    const { stdout } = await execAsync(
      `pdftoppm -png -r 300 "${namedPdf}" "${path.join(outputDir, 'page')}"`,
      { timeout: 60000 }
    );
    console.log('[PDF→PNG] pdftoppm 300DPI done');
  } catch (err) {
    // Fallback to sips if pdftoppm not available
    console.warn('[PDF→PNG] pdftoppm failed, trying sips fallback:', err.message.substring(0, 100));
    try {
      await execAsync(
        `sips -s format png -z 3508 2480 "${namedPdf}" --out "${outputDir}"`,
        { timeout: 60000 }
      );
      console.log('[PDF→PNG] sips fallback done');
    } catch (sipsErr) {
      console.error('[PDF→PNG] Both pdftoppm and sips failed');
      throw new Error(`PDF to PNG conversion failed. pdftoppm error: ${err.message}. sips error: ${sipsErr.message}`);
    }
  }

  const pngs = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.png'))
    .map(f => path.join(outputDir, f))
    .sort();

  if (pngs.length === 0) throw new Error('No PNG pages produced from PDF');
  console.log(`[PDF→PNG] Converted ${pngs.length} page(s):`, pngs.map(p => path.basename(p)));
  return pngs;
}

// ══════════════════════════════════════════════════════════════════════
// ── Music Theory Validator ───────────────────────────────────────────
// Post-processing: checks rhythm math per measure against time signature
// Flags measures where total note durations don't match expected beats
// ══════════════════════════════════════════════════════════════════════

/** Duration map: MusicXML <type> → fraction of a whole note */
const DURATION_MAP = {
  'whole': 1,
  'half': 0.5,
  'quarter': 0.25,
  'eighth': 0.125,
  '16th': 0.0625,
  '32nd': 0.03125,
  '64th': 0.015625,
};

/**
 * Validates MusicXML rhythm integrity.
 * Returns { valid, issues[], stats } 
 */
function validateMusicTheory(xml) {
  const issues = [];
  const stats = { measuresChecked: 0, measuresOk: 0, measuresFlagged: 0, totalNotes: 0 };

  // Extract time signature (beats/beat-type)
  const beatsMatch = xml.match(/<beats>(\d+)<\/beats>/);
  const beatTypeMatch = xml.match(/<beat-type>(\d+)<\/beat-type>/);
  const beats = beatsMatch ? parseInt(beatsMatch[1]) : 4;
  const beatType = beatTypeMatch ? parseInt(beatTypeMatch[1]) : 4;
  const expectedDuration = beats / beatType; // fraction of whole note per measure

  // Split into measures
  const measureBlocks = xml.split(/<measure\s/);
  
  for (let i = 1; i < measureBlocks.length; i++) {
    const block = measureBlocks[i];
    stats.measuresChecked++;

    // Extract measure number
    const numMatch = block.match(/number="(\d+)"/);
    const measureNum = numMatch ? parseInt(numMatch[1]) : i;

    // Count note durations in this measure
    let totalDuration = 0;
    let noteCount = 0;
    const noteRegex = /<note\b[^>]*>([\s\S]*?)<\/note>/g;
    let noteMatch;

    while ((noteMatch = noteRegex.exec(block)) !== null) {
      const noteContent = noteMatch[1];
      
      // Skip rests in duration counting for validation
      const isChord = noteContent.includes('<chord/>');
      if (isChord) continue; // chord notes share time with previous note

      // Get duration from <type> element
      const typeMatch = noteContent.match(/<type>([^<]+)<\/type>/);
      if (typeMatch) {
        const noteType = typeMatch[1];
        let dur = DURATION_MAP[noteType] || 0;

        // Check for dotted notes
        if (noteContent.includes('<dot/>')) {
          dur *= 1.5;
        }

        totalDuration += dur;
        noteCount++;
        stats.totalNotes++;
      }
    }

    if (noteCount === 0) continue; // empty measure, skip

    // Allow 5% tolerance for rounding in complex rhythms
    const tolerance = expectedDuration * 0.05;
    const diff = Math.abs(totalDuration - expectedDuration);

    if (diff > tolerance) {
      stats.measuresFlagged++;
      issues.push({
        measure: measureNum,
        expected: expectedDuration,
        actual: totalDuration.toFixed(4),
        notes: noteCount,
        severity: diff > expectedDuration * 0.2 ? 'error' : 'warning'
      });
    } else {
      stats.measuresOk++;
    }
  }

  const accuracy = stats.measuresChecked > 0 
    ? ((stats.measuresOk / stats.measuresChecked) * 100).toFixed(1) 
    : '0.0';

  return {
    valid: issues.length === 0,
    accuracy: parseFloat(accuracy),
    timeSignature: `${beats}/${beatType}`,
    issues,
    stats
  };
}

// ══════════════════════════════════════════════════════════════════════
// ── API: /omr — Main OMR endpoint ───────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
app.post('/omr', upload.single('image'), async (req, res) => {
  const start = Date.now();
  if (!req.file) return res.status(400).json({ error: 'No image' });

  const inputPath = req.file.path;
  const workDir = path.join(os.tmpdir(), `omr_work_${Date.now()}`);
  let enhancedPath = null;

  try {
    const isPdf = req.file.mimetype === 'application/pdf' ||
                  (req.file.originalname || '').toLowerCase().endsWith('.pdf');

    console.log(`\n[OMR] ═══ ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)}KB) isPDF=${isPdf} ═══`);

    let xml = '';
    let bundle = null;
    let detail = '';

    if (isPdf) {
      console.log('[OMR] 📄 PDF → PNG (all pages) → ScoreLens V2...');
      const pngPages = await pdfToPngPages(inputPath, path.join(workDir, 'pages'));
      console.log(`[OMR] 📄 Processing ${pngPages.length} PDF page(s) with ScoreLens V2`);

      const pageXmls = [];
      let lastBundle = null;

      for (let pageIdx = 0; pageIdx < pngPages.length; pageIdx++) {
        const pngPath = pngPages[pageIdx];
        try {
          const enhanced = await enhanceImage(pngPath);
          console.log(`[OMR] 🧠 ScoreLens V2 — Page ${pageIdx + 1}/${pngPages.length}...`);
          const result = await runOemer(enhanced);
          pageXmls.push(result.xml);
          if (pageIdx === 0) lastBundle = result.bundle; // Use page 1 layout as primary
          console.log(`[OMR] ✅ Page ${pageIdx + 1} done`);
        } catch (e) {
          const errMsg = e.message.substring(0, 500);
          console.warn(`[OMR] ⚠️ Page ${pageIdx + 1} failed:`, errMsg);
          detail += ` | Page ${pageIdx + 1}: ${errMsg}`;
        }
      }

      if (pageXmls.length === 0) {
        detail += ' | All PDF pages failed';
      } else if (pageXmls.length === 1) {
        xml = pageXmls[0];
        bundle = lastBundle;
      } else {
        // ── [V2] Cross-Page Stitching ──────────────────────────────────
        console.log(`[OMR] 🔗 Stitching ${pageXmls.length} pages...`);
        try {
          // Call Python stitcher directly
          const stitchInput = JSON.stringify(pageXmls);
          const stitchTmpIn = path.join(workDir, 'stitch_input.json');
          const stitchTmpOut = path.join(workDir, 'stitched.xml');
          fs.writeFileSync(stitchTmpIn, stitchInput, 'utf-8');

          const stitchCmd = `"${PYTHON_BIN}" -c "
import json, sys
sys.path.insert(0, '${PROJECT_ROOT}')
from Scorelens_Engine_V2.cross_page_stitcher import stitch_pages
pages = json.load(open('${stitchTmpIn}'))
result = stitch_pages(pages)
with open('${stitchTmpOut}', 'w', encoding='utf-8') as f:
    f.write(result)
"`;
          const { execSync } = await import('child_process');
          execSync(stitchCmd, { timeout: 30000 });
          xml = fs.readFileSync(stitchTmpOut, 'utf-8');
          bundle = lastBundle; // carry first-page layout
          console.log(`[OMR] ✅ Cross-page stitching done: ${pageXmls.length} pages merged`);
        } catch (stitchErr) {
          console.warn('[OMR] ⚠️ Stitcher failed, using page 1 only:', stitchErr.message.substring(0, 200));
          xml = pageXmls[0];
          bundle = lastBundle;
        }
      }

    } else {
      // ══ IMAGE → ScoreLens V2 ══
      const label = req.file.originalname;
      console.log(`[OMR] 🖼️ Image → ScoreLens V2: ${label}`);
      enhancedPath = await enhanceImage(inputPath);

      try {
        console.log(`[OMR] 🧠 ScoreLens V2 DL: ${label}...`);
        const result = await runOemer(enhancedPath);
        xml = result.xml;
        bundle = result.bundle;
        console.log(`[OMR] ✅ ScoreLens V2 success`);
      } catch (oemerErr) {
        console.warn(`[OMR] ⚠️ ScoreLens V2 failed:`, oemerErr.message.substring(0, 500));
        detail += ` | ScoreLens V2: ${oemerErr.message.substring(0, 500)}`;
      }
    }
    if (!xml) throw new Error(`ไม่สามารถอ่านโน้ตได้ กรุณาตรวจสอบว่าไฟล์เป็นโน้ตดนตรีที่ชัดเจน (Error: ${detail})`);

    // ── Music Theory Validation ──
    const validation = validateMusicTheory(xml);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const notes = (xml.match(/<note/g) || []).length;
    const keySig = xml.match(/<fifths>([-\d]+)<\/fifths>/)?.[1] ?? '?';

    console.log(`[OMR] ✅ ${elapsed}s — ${notes} notes, key=${keySig} fifths`);
    console.log(`[Theory] 📊 Accuracy: ${validation.accuracy}% | Time: ${validation.timeSignature} | Measures: ${validation.stats.measuresChecked} checked, ${validation.stats.measuresFlagged} flagged`);
    
    if (validation.issues.length > 0) {
      console.log(`[Theory] ⚠️ Flagged measures: ${validation.issues.map(i => `m${i.measure}(${i.severity})`).join(', ')}`);
    }

    // Strip DOCTYPE — external DTD URLs cause Verovio to silently fail
    xml = xml.replace(/<!DOCTYPE[^>]*>/gi, '').trim();
    // Ensure clean XML declaration at top
    if (!xml.startsWith('<?xml')) {
      xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
    }

    // ── [V2] Return JSON bundle with XML + Layout Map + Metadata ───────────
    res.setHeader('X-OMR-Engine', 'ScoreLens-V2');
    res.setHeader('X-OMR-Notes', String(notes));
    res.setHeader('X-OMR-Accuracy', String(validation.accuracy));
    res.setHeader('X-OMR-Elapsed', elapsed);
    res.setHeader('X-OMR-Flagged-Measures', String(validation.stats.measuresFlagged));
    res.json({
      xml,
      bundle: bundle || null,
      validation: {
        accuracy: validation.accuracy,
        timeSignature: validation.timeSignature,
        measuresChecked: validation.stats.measuresChecked,
        measuresFlagged: validation.stats.measuresFlagged,
      }
    });

  } catch (err) {
    console.error('[OMR] Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    if (enhancedPath && enhancedPath !== inputPath) try { fs.unlinkSync(enhancedPath); } catch {}
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
});

// ── API: /health ─────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    engine: 'ScoreLens-Engine V2 (MIT License)', 
    version: '2.0.0',
    features: ['image-enhancement', 'scorelens-v2-dl', 'layout-map', 'typography-ocr', 'music-theory-validator'],
    commercial: true
  });
});

// ── API: /gemini-ocr — Cloud Vision Proxy ────────────────────────────
app.post('/gemini-ocr', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set on OMR Server' });

  try {
    const imageData = fs.readFileSync(req.file.path).toString('base64');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    console.log(`[CloudProxy] Sending ${req.file.originalname} to Gemini Vision...`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Convert this sheet music image to a valid MusicXML 4.0 string. Output ONLY the XML." },
            { inline_data: { mime_type: req.file.mimetype, data: imageData } }
          ]
        }]
      })
    });

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!rawText) throw new Error('Empty response from Gemini');

    const xmlStart = rawText.indexOf('<?xml');
    const xmlEnd = rawText.lastIndexOf('</score-partwise>');
    let xml = '';
    
    if (xmlStart !== -1 && xmlEnd !== -1) {
      xml = rawText.slice(xmlStart, xmlEnd + '</score-partwise>'.length);
    } else {
      xml = rawText.trim();
    }

    res.header('Content-Type', 'text/xml');
    res.send(xml);
    console.log(`[CloudProxy] ✅ Success! XML Length: ${xml.length}`);
  } catch (err) {
    console.error('[CloudProxy] Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch {}
  }
});

// ── Start Server ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  const hasKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  console.log(`\n🎵 Memolody OMR Server v3.0 — http://localhost:${PORT}`);
  console.log(`   Engine:     Oemer Deep Learning (MIT License) ✅`);
  console.log(`   Validator:  Music Theory Auto-Check ✅`);
  console.log(`   Cloud Proxy: ${hasKey ? '✅ ACTIVE' : '❌ MISSING API KEY'}`);
  console.log(`   Commercial: ✅ All engines are MIT/Apache licensed`);
  console.log(`\n   Ready for ScoreLens scan requests...\n`);
});
