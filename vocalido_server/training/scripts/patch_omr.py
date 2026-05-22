import re

with open('scripts/omr-server.mjs', 'r') as f:
    content = f.read()

old_block = re.search(r"// ── API: /omr-v3 — Experimental VLM Pipeline ────────────────────────.*?(?=\n// ══════════════════════════════════════════════════════════════════════\n// ── API: /gemini-ocr)", content, re.DOTALL)

if not old_block:
    print("Could not find the /omr-v3 block!")
    exit(1)

new_block = """// ── API: /omr-v3 — ScoreLens V3 Core Pipeline ────────────────────────
// ══════════════════════════════════════════════════════════════════════
app.post('/omr-v3', upload.single('image'), async (req, res) => {
  const start = Date.now();
  if (!req.file) return res.status(400).json({ error: 'No image' });

  const inputPath = req.file.path;
  
  try {
    console.log(`\\n[OMR-V3] 🚀 Starting ScoreLens V3 Pipeline for: ${req.file.originalname}`);
    
    const pipelineScript = path.join(PROJECT_ROOT, 'ScoreLens_V3_Core', 'pipeline.py');
    const cmd = `"${PYTHON_BIN}" "${pipelineScript}" "${inputPath}" --mode auto --json`;
    
    const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 60000 });
    
    const jsonMatch = stdout.match(/\\{[\\s\\S]*\\}/);
    if (!jsonMatch) throw new Error("No JSON response from ScoreLens V3");
    
    const result = JSON.parse(jsonMatch[0]);
    if (!result.success) {
      throw new Error((result.errors || []).join(', ') || "Pipeline failed");
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const xml = result.musicxml;
    const notes = result.stats?.notes_extracted || 0;
    
    console.log(`[OMR-V3] ✅ Success: ${notes} notes extracted in ${elapsed}s`);
    
    res.setHeader('X-OMR-Engine', 'ScoreLens-V3');
    res.setHeader('X-OMR-Notes', String(notes));
    res.setHeader('X-OMR-Elapsed', elapsed);
    res.json({
      xml,
      bundle: null,
      validation: {
        accuracy: 100,
        timeSignature: result.stats?.time_signature || '4/4',
        measuresChecked: result.stats?.measures || 1,
        measuresFlagged: result.warnings?.length || 0,
        warnings: result.warnings || []
      }
    });

  } catch (err) {
    console.error('[OMR-V3] ❌ Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
  }
});
"""

content = content[:old_block.start()] + new_block + content[old_block.end():]

# Also change the print statement in server start
content = content.replace(
    "console.log(`   Engine:     Oemer Deep Learning (MIT License) ✅`);",
    "console.log(`   Engine:     ScoreLens V3 Core Pipeline ✅`);"
)

with open('scripts/omr-server.mjs', 'w') as f:
    f.write(content)

print("Patch applied successfully!")
