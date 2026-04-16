/**
 * Audiveris OMR Server — STABLE (Pure Audiveris, No AI)
 * 
 * Simple, reliable pipeline:
 *   1. Light image enhancement (upscale to 3000px, sharpen)
 *   2. Audiveris OMR → MusicXML (direct, unmodified)
 * 
 * NO AI post-processing. NO key signature "fixes". NO theory validation overrides.
 * Audiveris output is the ground truth.
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
const AUDIVERIS_DIR = '/tmp/audiveris-omr';
// Ensure the Audiveris directory exists
if (!fs.existsSync(AUDIVERIS_DIR)) {
  fs.mkdirSync(AUDIVERIS_DIR, { recursive: true });
  console.log('[Setup] Created missing Audiveris folder');
}

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

// ── Image Enhancement ────────────────────────────────────────────────
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
    await pipe.sharpen({ sigma: 1.0 }).normalize().png().toFile(outputPath);
    console.log(`[Enhance] ${w}x${h} → ${Math.round(w * scale)}x${Math.round(h * scale)}`);
    return outputPath;
  } catch (err) {
    console.warn('[Enhance] Skipped:', err.message);
    return inputPath;
  }
}

// ── Audiveris OMR ────────────────────────────────────────────────────
async function runAudiveris(imagePath) {
  const outputDir = path.join(os.tmpdir(), `omr_${Date.now()}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const constants = [
    '-constant', 'org.audiveris.omr.sheet.ProcessingSwitches.smallHeads=true',
  ].join(' ');

  const cmd = `cd ${AUDIVERIS_DIR} && ./gradlew run --args="-batch -export ${constants} -output ${outputDir} ${imagePath}" 2>&1`;
  const { stdout } = await execAsync(cmd, { timeout: 120000 });

  const mxlFile = fs.readdirSync(outputDir).find(f => f.endsWith('.mxl'));
  if (!mxlFile) throw new Error('Audiveris OMR failed');

  const extractDir = path.join(outputDir, 'extracted');
  fs.mkdirSync(extractDir, { recursive: true });
  await execAsync(`unzip -o "${path.join(outputDir, mxlFile)}" -d "${extractDir}"`);

  const findXml = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== 'META-INF') { const f = findXml(full); if (f) return f; }
      else if (e.isFile() && e.name.endsWith('.xml') && !full.includes('META-INF')) return full;
    }
    return null;
  };

  const xmlPath = findXml(extractDir);
  if (!xmlPath) throw new Error('No XML in output');
  const xml = fs.readFileSync(xmlPath, 'utf-8');
  try { fs.rmSync(outputDir, { recursive: true, force: true }); } catch {}
  return xml;
}

// ── API ──────────────────────────────────────────────────────────────
app.post('/omr', upload.single('image'), async (req, res) => {
  const start = Date.now();
  if (!req.file) return res.status(400).json({ error: 'No image' });

  const inputPath = req.file.path;
  let enhancedPath = null;

  try {
    console.log(`\n[OMR] ═══ ${req.file.originalname} (${(req.file.size / 1024).toFixed(0)}KB) ═══`);

    console.log('[OMR] 1/2: Enhancing...');
    enhancedPath = await enhanceImage(inputPath);

    console.log('[OMR] 2/2: Audiveris OMR...');
    const xml = await runAudiveris(enhancedPath);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const notes = (xml.match(/<note/g) || []).length;
    const keySig = xml.match(/<fifths>([-\d]+)<\/fifths>/)?.[1] ?? '?';
    console.log(`[OMR] ✅ ${elapsed}s — ${notes} notes, key=${keySig} fifths\n`);

    res.setHeader('Content-Type', 'text/xml');
    res.send(xml);

  } catch (err) {
    console.error('[OMR] Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    if (enhancedPath && enhancedPath !== inputPath) {
      try { fs.unlinkSync(enhancedPath); } catch {}
    }
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    engine: 'Audiveris 5.10.2 + Gemini Cloud Proxy', 
    version: '2.0.0-stable',
    audiveris_dir: fs.existsSync(AUDIVERIS_DIR) ? 'found' : 'missing'
  });
});

/**
 * [NEURAL CLOUD PROXY] 
 * Bridges local requests to Gemini Vision to avoid CORS issues
 */
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

app.listen(PORT, () => {
  const hasKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  console.log(`\n🎵 Memolody OMR Server — http://localhost:${PORT}`);
  console.log(`   Cloud Proxy: ${hasKey ? '✅ ACTIVE' : '❌ MISSING API KEY'}`);
  console.log(`   Local OMR:   ${fs.existsSync(AUDIVERIS_DIR) ? '✅ READY' : '⚠️ FOLDER MISSING'}`);
  console.log(`\n   Ready for ScoreLens scan requests...\n`);
});
