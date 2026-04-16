
/**
 * [SCORELENS v2.0] — Gemini Vision-powered Sheet Music Scanner
 * Uses @google/genai SDK directly — no proxy, no CORS issues.
 */

import { useState, useCallback } from 'react';
import { Song } from '../../types';
import { songStorage } from '../../lib/SongStorage';
import { recognizeSheetMusic, recognizePDF, omrWithAudiveris, recognizeVerificationPass, isImageFile, isPDFFile } from '../../lib/SheetMusicOCR';

export interface ScoreLensResult {
  song: Song;
  xmlData: string;
  originalImageUrl?: string;
}

export const useScoreLens = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const processImage = useCallback(async (
    file: File,
    preferredLanguage: 'th' | 'en' = 'th'
  ): Promise<ScoreLensResult | { error: string } | null> => {
    setIsProcessing(true);
    setError(null);

    try {
      const originalImageUrl = URL.createObjectURL(file);

      // ── Step 1: OCR via Audiveris (Primary) ──
      const isPdf = isPDFFile(file);
      setProgress(preferredLanguage === 'th'
        ? `🎵 กำลังใช้ Audiveris อ่านโน้ต${isPdf ? 'จาก PDF' : 'เพลง'}...`
        : `🎵 Using Audiveris to read sheet music${isPdf ? ' from PDF' : ''}...`);

      let xmlContent = '';

      try {
        console.log('[ScoreLens] Using Audiveris OMR (primary)...');
        const result = await omrWithAudiveris(file);
        xmlContent = result.xml;
        console.log('[ScoreLens] ✅ Audiveris:', result.message);
      } catch (audErr: any) {
        console.warn('[ScoreLens] Audiveris failed, trying Gemini Vision...', audErr.message);
        setProgress(preferredLanguage === 'th'
          ? '🔄 Audiveris มีปัญหา กำลังลองใช้ Gemini AI รุ่นพ่นสด...'
          : '🔄 Audiveris failed, trying Gemini AI...');

        try {
          if (isPdf) {
            const result = await recognizePDF(file);
            xmlContent = result.xml;
            console.log('[ScoreLens] ✅ Gemini PDF:', result.message);
          } else {
            const result = await recognizeSheetMusic(file);
            xmlContent = result.xml;
            console.log('[ScoreLens] ✅ Gemini Image:', result.message);
          }
        } catch (geminiErr: any) {
          throw new Error(
            preferredLanguage === 'th'
              ? `ไม่สามารถอ่านโน้ตได้\n\nAudiveris: ${audErr.message}\nGemini: ${geminiErr.message}`
              : `Could not read sheet music\n\nAudiveris: ${audErr.message}\nGemini: ${geminiErr.message}`
          );
        }
      }

      // --- AI Verification & Repair (Iterative Loop) ---
      const MAX_PASSES = 2;
      for (let i = 1; i <= MAX_PASSES; i++) {
        setProgress(preferredLanguage === 'th' 
           ? `✨ Gemini ยกเครื่องตรวจสอบความถูกต้องรอบที่ ${i}/${MAX_PASSES}...` 
           : `✨ Gemini Verification Pass ${i}/${MAX_PASSES}...`);
        
        console.log(`[ScoreLens] Triggering Validation Pass ${i}/${MAX_PASSES}...`);
        const verifiedResult = await recognizeVerificationPass(file, xmlContent);
        xmlContent = verifiedResult.xml;
        console.log(`[ScoreLens] ✅ Verification Pass ${i} complete:`, verifiedResult.message);
      }

      if (!xmlContent.includes('<score-partwise')) {
        throw new Error(preferredLanguage === 'th'
          ? 'ผลลัพธ์ไม่ใช่ MusicXML ที่ถูกต้อง กรุณาลองภาพที่ชัดขึ้น'
          : 'Result is not valid MusicXML. Try a clearer image.');
      }

      // ── Step 2: Parse metadata ──
      setProgress(preferredLanguage === 'th' ? '💾 กำลังบันทึก...' : '💾 Saving...');

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

      const title = xmlDoc.querySelector('work-title')?.textContent
        || xmlDoc.querySelector('movement-title')?.textContent
        || file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')
        || 'Scanned Score';
      const creator = xmlDoc.querySelector('creator')?.textContent || 'ScoreLens AI';

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

      const song: Song = {
        id: `scorelens_${Date.now()}`,
        title,
        artist: creator,
        duration: duration || 120,
        bpm,
        key,
        audioUrl: '',
        coverUrl: '',
        isPremium: false,
        category: 'ScoreLens',
        difficulty: 'Medium',
        origin: 'load',
        createdAt: new Date().toISOString(),
      };

      await songStorage.saveSong(song, xmlContent);

      setProgress(preferredLanguage === 'th' ? '✅ สำเร็จ!' : '✅ Done!');
      setIsProcessing(false);

      return { song, xmlData: xmlContent, originalImageUrl };

    } catch (err: any) {
      const msg = err?.message || 'เกิดข้อผิดพลาดที่ไม่รู้จัก';
      console.error('[ScoreLens Error]', err);
      setError(msg);
      setIsProcessing(false);
      return { error: msg };
    }
  }, []);

  return { processImage, isProcessing, progress, error };
};
