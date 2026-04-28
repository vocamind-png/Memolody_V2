
/**
 * [SCORELENS v4.0] — Gemini Vision (Primary) + Oemer AI (Fallback) + Music Theory Validation
 * 
 * Pipeline:
 *   1. Gemini 2.5 Flash/Pro — OMR transcription
 *   2. Oemer Deep Learning — local fallback if Gemini fails (MIT License)
 *   3. Music Theory Validator — 7-layer validation against music theory rules
 *   4. Auto-Fixer — automatic correction of duration gaps, orphan ties, etc.
 */

import { useState, useCallback } from 'react';
import { Song } from '../../types';
import { songStorage } from '../../lib/SongStorage';
import {
  recognizeSheetMusic,
  recognizePDF,
  omrWithOemer,
  isImageFile,
  isPDFFile,
  extractMetadataWithGemini,
  MetadataResult,
  recognizeVerificationPass,
  recognizeMelodyOnly,
  recognizeCorrectionPass
} from '../../lib/SheetMusicOCR';
import { validateMusicXml, ValidationReport } from '../../lib/MusicXmlValidator';
import { autoFixMusicXml, fixBeaming } from '../../lib/MusicXmlAutoFixer';
import { parseMusicXMLMetadata } from '../../lib/MusicXmlParser';

export interface ScoreLensResult {
  song: Song;
  xmlData: string;
  originalImageUrl?: string;
  validationReport?: ValidationReport;
}

export const useScoreLens = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);

  const processImage = useCallback(async (
    file: File,
    preferredLanguage: 'th' | 'en' = 'th'
  ): Promise<ScoreLensResult | { error: string } | null> => {
    setIsProcessing(true);
    setError(null);

    try {
      // Store the original file as an object URL, prefix with 'pdf:' if it's a PDF
      const originalImageUrl = file.type === 'application/pdf' 
        ? 'pdf:' + URL.createObjectURL(file) 
        : URL.createObjectURL(file);
      const isPdf = isPDFFile(file);
      const isImg = isImageFile(file);
      const isMusic = file.name.toLowerCase().endsWith('.emk') || 
                      file.name.toLowerCase().endsWith('.mid') || 
                      file.name.toLowerCase().endsWith('.midi') ||
                      file.name.toLowerCase().endsWith('.xml') ||
                      file.name.toLowerCase().endsWith('.musicxml') ||
                      file.name.toLowerCase().endsWith('.mxl');

      if (isMusic) {
        setProgress(preferredLanguage === 'th' ? '🎵 กำลังประมวลผลไฟล์ดนตรี...' : '🎵 Processing music file...');
        const { metadata, xmlData } = await parseMusicXMLMetadata(file);
        await songStorage.saveSong(metadata, xmlData);
        setIsProcessing(false);
        return { song: metadata, xmlData, originalImageUrl: undefined };
      }

      // ══ Step 1: Gemini Vision (Primary — Dual-Pass) ══
      let xmlContent = '';

      if (isPdf) {
        setProgress('📄 กำลังให้ Gemini AI อ่านโน้ตจาก PDF... (รอสักครู่)');
        console.log('[ScoreLens] PDF → Gemini Vision...');
        try {
          const result = await recognizePDF(file);
          xmlContent = result.xml;
          console.log('[ScoreLens] ✅ Gemini PDF:', result.message);
          setProgress(`✨ Gemini อ่าน PDF สำเร็จ — ${result.message}`);
        } catch (geminiErr: any) {
          console.warn('[ScoreLens] ⚠️ Gemini PDF failed:', geminiErr.message);
          // ── Fallback 1: Gemini Melody-Only (more reliable for complex multi-part scores) ──
          try {
            setProgress('🎵 Gemini อ่านทำนองหลัก...');
            const melodyResult = await recognizeMelodyOnly(file);
            xmlContent = melodyResult.xml;
            console.log('[ScoreLens] ✅ Melody-Only:', melodyResult.message);
            setProgress(`✨ ${melodyResult.message}`);
          } catch (melodyErr: any) {
            console.warn('[ScoreLens] Melody-Only failed:', melodyErr.message);
            // ── Fallback 2: Oemer (last resort) + verification pass ──
            setProgress('⚠️ กำลังลอง Oemer AI...');
            const oemerResult = await omrWithOemer(file);
            xmlContent = oemerResult.xml;
            try {
              setProgress('🔍 ตรวจสอบโน้ตด้วย Gemini AI...');
              const verified = await recognizeVerificationPass(file, xmlContent);
              xmlContent = verified.xml;
              setProgress(`✨ ตรวจสอบแล้ว — ${verified.message}`);
            } catch (verifyErr: any) {
              console.warn('[ScoreLens] Verification failed, using Oemer XML:', verifyErr.message);
              setProgress(`🧠 Oemer: ${oemerResult.message} (ไม่สามารถตรวจสอบ)`);
            }
          }
        }
      } else if (isImg) {
        setProgress('🎵 กำลังให้ Gemini AI วิเคราะห์โน้ตเพลง (Pass 1/2)...');
        console.log('[ScoreLens] Image → Gemini Vision Dual-Pass...');
        try {
          const result = await recognizeSheetMusic(file);
          xmlContent = result.xml;
          console.log('[ScoreLens] ✅ Gemini Image:', result.message);
          setProgress(`✨ ${result.message} — กำลังตรวจสอบและแก้ไขความแม่นยำ...`);
          
          // ── Force Correction Pass Loop (Iterative Fix) ──
          for (let iter = 1; iter <= 2; iter++) {
            const report = validateMusicXml(xmlContent);
            if (report.score === 100) {
              console.log(`[ScoreLens] ✅ Perfect score at iteration ${iter}`);
              break;
            }
            
            setProgress(`✨ ตรวจพบข้อผิดพลาด ${report.errors.length} จุด... สั่ง AI ให้แก้ไข (รอบที่ ${iter}/2)`);
            try {
              const corrected = await recognizeCorrectionPass(file, xmlContent, report.errors.map(e => e.message));
              xmlContent = corrected.xml;
              console.log(`[ScoreLens] ✅ Correction Pass ${iter} successful`);
              setProgress(`✨ ตรวจสอบและแก้ไขโน้ตให้ตรงต้นฉบับสำเร็จ`);
            } catch (err: any) {
              console.warn(`[ScoreLens] Correction Pass ${iter} failed:`, err.message);
              break; // Stop loop on API failure
            }
          }
          
          // ── Final Confidence Check ──
          const finalReport = validateMusicXml(xmlContent);
          if (finalReport.score < 60) {
             throw new Error(`Gemini ไม่สามารถอ่านโน้ตนี้ได้อย่างถูกต้อง (Score: ${finalReport.score}) ขอสลับไปใช้ Oemer AI แทนครับ`);
          }
          
        } catch (geminiErr: any) {
          console.warn('[ScoreLens] ⚠️ Gemini Image failed:', geminiErr.message);
          // ── Fallback 1: Gemini Melody-Only ──
          try {
            setProgress('🎵 Gemini อ่านทำนองหลัก (ไม่รวมเปียโน)...');
            const melodyResult = await recognizeMelodyOnly(file);
            xmlContent = melodyResult.xml;
            console.log('[ScoreLens] ✅ Melody-Only:', melodyResult.message);
            setProgress(`✨ ${melodyResult.message}`);
          } catch (melodyErr: any) {
            console.warn('[ScoreLens] Melody-Only failed:', melodyErr.message);
            // ── Fallback 2: Oemer + verification ──
            try {
              setProgress('⚠️ กำลังลอง Oemer AI...');
              const oemerResult = await omrWithOemer(file);
              xmlContent = oemerResult.xml;
              try {
                setProgress('🔍 ตรวจสอบและแก้ไขโน้ตด้วย Gemini AI...');
                const verified = await recognizeVerificationPass(file, oemerResult.xml);
                xmlContent = verified.xml;
                setProgress(`✨ Gemini ตรวจสอบภาพสำเร็จ — ${verified.message}`);
              } catch (verifyErr: any) {
                console.warn('[ScoreLens] Verification failed, using Oemer XML:', verifyErr.message);
                setProgress(`🧠 Oemer สำเร็จ (ไม่สามารถตรวจสอบด้วย Gemini)`);
              }
            } catch (oemerErr: any) {
              throw new Error(
                preferredLanguage === 'th'
                  ? `ไม่สามารถอ่านโน้ตได้จากทุก engine:\n• Gemini: ${geminiErr.message}\n• Gemini Melody: ${melodyErr.message}\n• Oemer: ${oemerErr.message}\n\nกรุณาใช้ภาพที่ชัดเจนกว่านี้ครับ`
                  : `All OMR engines failed:\n• Gemini: ${geminiErr.message}\n• Gemini Melody: ${melodyErr.message}\n• Oemer: ${oemerErr.message}`
              );
            }
          }
        }
      } else {
        throw new Error(
          preferredLanguage === 'th'
            ? `ไม่รองรับไฟล์ประเภทนี้: ${file.type}\nกรุณาใช้ JPG, PNG, WebP หรือ PDF`
            : `Unsupported file type: ${file.type}. Please use JPG, PNG, WebP or PDF.`
        );
      }

      if (!xmlContent.includes('<score-partwise')) {
        throw new Error(
          preferredLanguage === 'th'
            ? 'ผลลัพธ์ไม่ใช่ MusicXML ที่ถูกต้อง กรุณาลองภาพที่ชัดขึ้น'
            : 'Result is not valid MusicXML. Try a clearer image.'
        );
      }

      // ══ Step 1.5: Music Theory Validation & Auto-Fix ══
      setProgress(
        preferredLanguage === 'th'
          ? '🔬 กำลังตรวจสอบและปรับปรุงโน้ต...'
          : '🔬 Validating and refining notation...'
      );

      const report = validateMusicXml(xmlContent);
      console.log(`[ScoreLens] 🔬 Validation Score: ${report.score}%`);
      
      // Always attempt fix if there are errors or if we want to enforce standard beaming/metadata
      const fixResult = autoFixMusicXml(xmlContent, report.errors);
      if (fixResult.fixCount > 0) {
        xmlContent = fixResult.xml;
        const postFixReport = validateMusicXml(xmlContent);
        setValidationReport(postFixReport);
        console.log(`[ScoreLens] ✅ Applied ${fixResult.fixCount} fixes. New Score: ${postFixReport.score}%`);
        fixResult.fixLog.forEach(log => console.log(`  → ${log}`));
      } else {
        setValidationReport(report);
      }

      // ══ Step 2: Parse metadata from XML ══
      setProgress(preferredLanguage === 'th' ? '💾 กำลังบันทึก...' : '💾 Saving...');

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

      let title = xmlDoc.querySelector('work-title')?.textContent || 
                  xmlDoc.querySelector('movement-title')?.textContent || '';
      let creator = xmlDoc.querySelector('creator')?.textContent || '';

      // Ignore generic/filename titles
      const isGeneric = (t: string) => {
        if (!t) return true;
        const lower = t.toLowerCase().trim();
        return lower === 'untitled' || lower === 'new score' || 
               lower.includes('music21') || lower.includes('enhanced');
      };

      if (isGeneric(title)) title = '';
      if (!creator || creator.toLowerCase() === 'unknown') creator = '';
      
      let extractedText = '';

      // Extract metadata using Gemini OCR (Highest priority for real title)
      let metadata: MetadataResult = { title: '', artist: '', text: '', timeSignature: '', fifths: undefined };
      try {
        setProgress('🔍 Gemini อ่านข้อมูลไล่เพลง...');
        metadata = await extractMetadataWithGemini(file);
        console.log('[ScoreLens] Gemini Metadata:', metadata);

        if (metadata.title && metadata.title.length > 2) {
          title = metadata.title;
          // Inject title into XML
          let work = xmlDoc.querySelector('work');
          if (!work) {
            work = xmlDoc.createElement('work');
            xmlDoc.documentElement.insertBefore(work, xmlDoc.documentElement.firstChild);
          }
          let wt = work.querySelector('work-title');
          if (!wt) {
            wt = xmlDoc.createElement('work-title');
            work.appendChild(wt);
          }
          wt.textContent = title;
        }
        if (metadata.artist) {
          creator = metadata.artist;
          // Inject creator into XML
          let work = xmlDoc.querySelector('work');
          if (!work) {
            work = xmlDoc.createElement('work');
            xmlDoc.documentElement.insertBefore(work, xmlDoc.documentElement.firstChild);
          }
          let creatorEl = xmlDoc.querySelector('creator');
          if (!creatorEl) {
            creatorEl = xmlDoc.createElement('creator');
            creatorEl.setAttribute('type', 'composer');
            let ident = xmlDoc.querySelector('identification');
            if (!ident) {
              ident = xmlDoc.createElement('identification');
              xmlDoc.documentElement.insertBefore(ident, work.nextSibling);
            }
            ident.appendChild(creatorEl);
          }
          creatorEl.textContent = creator;
        }

        // ══ Inject Time Signature (CRITICAL FIX) ══
        if (metadata.timeSignature && metadata.timeSignature.includes('/')) {
          const [beatsStr, beatTypeStr] = metadata.timeSignature.split('/');
          const timeEls = xmlDoc.querySelectorAll('time');
          console.log(`[ScoreLens] Injecting Time Signature: ${metadata.timeSignature} into ${timeEls.length} time elements`);
          timeEls.forEach(time => {
            const b = time.querySelector('beats');
            const bt = time.querySelector('beat-type');
            if (b) b.textContent = beatsStr;
            if (bt) bt.textContent = beatTypeStr;
          });
        } else {
          console.log('[ScoreLens] No time signature from Gemini metadata, skipping injection');
        }

        // ══ Inject Key Signature ══
        if (metadata.fifths !== undefined) {
          const fifthsValue = metadata.fifths;
          const fifthsEls = xmlDoc.querySelectorAll('fifths');
          console.log(`[ScoreLens] Injecting Key Signature: fifths=${fifthsValue}`);
          fifthsEls.forEach(f => { f.textContent = String(fifthsValue); });
        }

        if (metadata.text) extractedText = metadata.text;
      } catch (e) {
        console.warn('[ScoreLens] Metadata extraction failed:', e);
      }

      // ══ Re-run Beaming with FINAL time signature (after Gemini injection) ══
      // Gemini may have corrected the time sig AFTER AutoFixer ran fixBeaming.
      // So we must re-beam here to ensure groupings match the real time signature.
      // [DISABLED]: User requested to keep native visual beaming from Oemer.
      // if (metadata.timeSignature && metadata.timeSignature.includes('/')) {
      //   const rebeamLog: string[] = [];
      //   const rebeamed = fixBeaming(xmlDoc, rebeamLog);
      //   if (rebeamed > 0) {
      //     console.log(`[ScoreLens] Re-beamed ${rebeamed} groups after time sig correction (${metadata.timeSignature})`);
      //   }
      // }

      // Insert extracted text as a direction in the first measure so the user can see it
      if (extractedText) {
        const firstMeasure = xmlDoc.querySelector('measure');
        if (firstMeasure) {
          const direction = xmlDoc.createElement('direction');
          direction.setAttribute('placement', 'above');
          const directionType = xmlDoc.createElement('direction-type');
          const words = xmlDoc.createElement('words');
          words.textContent = `[Lyrics/Text]: ${extractedText}`;
          directionType.appendChild(words);
          direction.appendChild(directionType);
          firstMeasure.insertBefore(direction, firstMeasure.firstChild);
        }
      }

      // ══ Step 3: Serialize updated XML and calculate metrics ══
      const serializer = new XMLSerializer();
      let updatedXmlContent = serializer.serializeToString(xmlDoc);
      if (!updatedXmlContent.startsWith('<?xml')) {
        updatedXmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + updatedXmlContent;
      }
      // Remove any empty xmlns added by serializer
      updatedXmlContent = updatedXmlContent.replace(/ xmlns=""/g, '');
      xmlContent = updatedXmlContent;

      // ✨ FALLBACK: If still no title, use "New Score" instead of filename
      if (!title || isGeneric(title)) title = 'New Score';
      if (!creator) creator = 'ScoreLens AI';

      const measures = xmlDoc.querySelectorAll('measure');
      const tempoEl = xmlDoc.querySelector('sound[tempo]');
      const bpm = tempoEl ? parseInt(tempoEl.getAttribute('tempo') || '120') : 120;
      const beatsEl = xmlDoc.querySelector('beats');
      const beats = beatsEl ? parseInt(beatsEl.textContent || '4') : 4;
      const duration = Math.round((measures.length * beats * 60) / bpm);

      const fifthsEl = xmlDoc.querySelector('fifths');
      const fifths = fifthsEl ? parseInt(fifthsEl.textContent || '0') : 0;
      const FIFTHS_MAP: Record<number, string> = {
        [-7]: 'Cb', [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F',
        0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#'
      };
      const key = FIFTHS_MAP[fifths] || 'C';

      const noteCount = (xmlContent.match(/<note/g) || []).length;

      const song: Song = {
        id: `scorelens_${Date.now()}`,
        title,
        artist: creator,
        duration: duration || 120,
        bpm,
        key,
        audioUrl: '',
        coverUrl: originalImageUrl, // Store original image here for comparison view
        isPremium: false,
        category: 'ScoreLens',
        difficulty: 'Medium',
        origin: 'load',
        createdAt: new Date().toISOString(),
      };

      await songStorage.saveSong(song, xmlContent);

      const finalReport = validationReport;
      const scoreEmoji = (finalReport?.score ?? 100) >= 90 ? '🏆' : (finalReport?.score ?? 100) >= 70 ? '✅' : '⚠️';
      setProgress(
        preferredLanguage === 'th'
          ? `${scoreEmoji} สำเร็จ! อ่านได้ ${noteCount} โน้ต ใน ${measures.length} ห้อง | คะแนนทฤษฎี: ${finalReport?.score ?? '?'}%`
          : `${scoreEmoji} Done! ${noteCount} notes in ${measures.length} measures | Theory score: ${finalReport?.score ?? '?'}%`
      );
      setIsProcessing(false);

      return { song, xmlData: xmlContent, originalImageUrl, validationReport: finalReport ?? undefined };

    } catch (err: any) {
      const msg = err?.message || 'เกิดข้อผิดพลาดที่ไม่รู้จัก';
      console.error('[ScoreLens Error]', err);
      setError(msg);
      setIsProcessing(false);
      return { error: msg };
    }
  }, []);

  return { processImage, isProcessing, progress, error, validationReport };
};
