import { GoogleGenAI } from '@google/genai';
import { Song, ParsedNote } from '../types';

export interface AIArrangementResult {
  chords: { name: string; measure: number; beat: number }[];
  bassPattern?: string; // Optional rhythm description
}

export class AIArrangerService {
  /**
   * Retrieves reference songs from the user library based on style and prompt.
   */
  public static retrieveReferences(
    library: { metadata: Song, xmlData: string }[],
    style: string,
    prompt: string,
    count: number = 3
  ): { metadata: Song, xmlData: string }[] {
    const query = [style, prompt].filter(Boolean).join(' ').toLowerCase();
    if (!query) return [];

    // Simple keyword scoring
    const scored = library.map(item => {
      const m = item.metadata;
      const textToSearch = [m.title, m.artist, m.genre, m.mood, m.era].filter(Boolean).join(' ').toLowerCase();
      
      let score = 0;
      if (textToSearch.includes(style.toLowerCase())) score += 10;
      if (prompt && textToSearch.includes(prompt.toLowerCase())) score += 5;
      if (item.xmlData && item.xmlData.includes('<harmony>')) score += 20; // Prefer songs with chords
      
      return { item, score };
    });

    return scored
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(x => x.item);
  }

  /**
   * Extracts chords from MusicXML strings. Very simple regex-based extractor to avoid heavy parsing.
   */
  public static extractStylisticFeatures(xmlData: string): string {
    if (!xmlData) return '';
    
    // We try to find <harmony> tags and extract <root-step> and <kind>
    const harmonyRegex = /<harmony[\s\S]*?<\/harmony>/g;
    const rootRegex = /<root-step>(.*?)<\/root-step>/;
    const kindRegex = /<kind[^>]*>(.*?)<\/kind>/;
    
    let chords = [];
    let match;
    while ((match = harmonyRegex.exec(xmlData)) !== null) {
      const hBlock = match[0];
      const rootMatch = rootRegex.exec(hBlock);
      const kindMatch = kindRegex.exec(hBlock);
      if (rootMatch) {
        const root = rootMatch[1];
        const kind = kindMatch ? kindMatch[1] : '';
        // Map common MusicXML kinds to standard text (e.g. 'minor' -> 'm', 'major' -> '')
        let suffix = '';
        if (kind === 'minor') suffix = 'm';
        else if (kind === 'dominant') suffix = '7';
        else if (kind === 'major-seventh') suffix = 'maj7';
        else if (kind === 'minor-seventh') suffix = 'm7';
        else if (kind === 'diminished') suffix = 'dim';
        else if (kind === 'augmented') suffix = 'aug';
        
        chords.push(`${root}${suffix}`);
      }
    }
    
    // Return a condensed progression summary (first 16 chords to save tokens)
    return chords.slice(0, 16).join(' - ');
  }

  /**
   * Calls Gemini to generate an arrangement based on the melody and references.
   */
  public static async generateAIArrangement(
    melodyNotes: ParsedNote[],
    references: { metadata: Song, xmlData: string }[],
    style: string,
    prompt: string,
    key: string,
    beatsPerMeasure: number
  ): Promise<AIArrangementResult | null> {
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof __GEMINI_API_KEY__ !== 'undefined' ? __GEMINI_API_KEY__ : '');
      if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
      const ai = new GoogleGenAI({ apiKey });

      // Build context from references
      let referenceContext = '';
      if (references.length > 0) {
        referenceContext = "Here are structural examples extracted from the user's library for this style:\n";
        references.forEach((ref, idx) => {
          const extractedChords = this.extractStylisticFeatures(ref.xmlData);
          referenceContext += `Reference ${idx + 1} (${ref.metadata.title}): Typical chord progression: ${extractedChords || 'N/A'}\n`;
        });
      } else {
        referenceContext = 'No direct local references found, please use your general knowledge of this style.';
      }

      // Summarize melody (to save tokens, summarize first 32 notes)
      const melodySummary = melodyNotes.slice(0, 32).map(n => 
        `M${Math.floor((n.startTime || 0) / beatsPerMeasure) + 1} B${((n.startTime || 0) % beatsPerMeasure) + 1}: ${n.pitch}`
      ).join(', ');

      const systemPrompt = `You are a master music arranger. 
Your task is to arrange a melody in the requested style.
Key: ${key}
Time Signature: ${beatsPerMeasure}/4
Style requested: ${style} ${prompt}

${referenceContext}

Melody (Measure and Beat: Pitch):
${melodySummary}

Based on the style references and the melody, generate a chord progression that fits perfectly.
Return ONLY a valid JSON object matching this TypeScript interface exactly:
{
  "chords": [
    { "name": "C", "measure": 1, "beat": 1 },
    { "name": "Am", "measure": 2, "beat": 1 }
  ],
  "bassPattern": "optional short description of rhythm"
}`;

      const modelsToTry = ['gemini-3.5-flash', 'gemini-3.1-pro', 'gemini-2.5-flash', 'gemini-1.5-flash'];
      let responseText = '{}';
      
      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({ 
            model: modelName, 
            contents: systemPrompt, 
            config: { responseMimeType: 'application/json', temperature: 0.2 } 
          });
          responseText = response.text || '{}';
          break;
        } catch (modelErr) {
          console.warn(`[AIArrangerService] Model ${modelName} failed, trying next...`);
        }
      }

      const parsed = JSON.parse(responseText);
      if (parsed.chords && Array.isArray(parsed.chords)) {
        return parsed as AIArrangementResult;
      }
      return null;
    } catch (e) {
      console.error('[AIArrangerService] Failed to generate AI arrangement:', e);
      return null;
    }
  }
}
