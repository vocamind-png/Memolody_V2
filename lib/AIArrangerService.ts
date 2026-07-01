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
  /**
   * Calls Gemini to generate an arrangement based on the melody and references.
   */
  public static async generateAIArrangement(
    melodyNotes: ParsedNote[],
    references: { metadata: Song, xmlData: string }[],
    style: string,
    prompt: string,
    key: string,
    beatsPerMeasure: number,
    previousOptions?: any[]
  ): Promise<any | null> {
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof __GEMINI_API_KEY__ !== 'undefined' ? __GEMINI_API_KEY__ : '');
      if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
      const ai = new GoogleGenAI({ apiKey });

      let referenceContext = '';
      if (references.length > 0) {
        referenceContext = "Here are structural examples extracted from the user's library for this style:\n";
        references.forEach((ref, idx) => {
          const extractedChords = this.extractStylisticFeatures(ref.xmlData);
          referenceContext += `Reference ${idx + 1} (${ref.metadata.title}): Typical chord progression: ${extractedChords || 'N/A'}\n`;
        });
      }

      const melodySummary = melodyNotes.slice(0, 32).map(n => 
        `M${Math.floor((n.startTime || 0) / beatsPerMeasure) + 1} B${((n.startTime || 0) % beatsPerMeasure) + 1}: ${n.pitch}`
      ).join(', ');

      let historyContext = '';
      if (previousOptions && previousOptions.length > 0) {
        historyContext = `\nPREVIOUS GENERATED OPTIONS (For Context):
The user may have asked to mix and match or modify these previous options.
Here are the previous 4 options (P1 to P4):
${previousOptions.map((opt, i) => `P${i+1}:\nChords: ${JSON.stringify(opt.chords)}\nTracks: ${JSON.stringify(opt.tracksConfig)}\n`).join('\n')}\n
Please consider the user's instructions regarding these previous options if applicable.`;
      }

      const systemPrompt = `You are a master music arranger, similar to Suno or ACE Studio.
Your task is to arrange a multi-instrument backing track in the requested style.
CRITICAL INSTRUCTION FOR KEY: The original song is in the key of ${key}. 
You MUST generate chords strictly belonging to or harmonically appropriate for the key of ${key}. Do not output chords for C Major if the key is not C Major!
Time Signature: ${beatsPerMeasure}/4
Style requested: ${style} ${prompt}
${historyContext}
Melody (Measure and Beat: Pitch):
${melodySummary}

Based on the style and melody (and any specific user instructions in the prompt), generate exactly 4 DIFFERENT highly musical chord progressions (and matching track configs) for this melody. 
Provide 4 distinct variations (e.g. Option 1: Standard pop, Option 2: Syncopated, Option 3: Jazz-infused, Option 4: Alternative/Rhythmic).
ALSO, for each option, choose 3-4 instruments (e.g., piano, bass, drums, strings) and assign a specific rhythmic "pattern" to each.
Valid patterns for melodic instruments (Piano, Strings, Guitar): 'block_chords', 'arpeggio_8ths', 'arpeggio_16ths', 'comping_syncopated'.
Valid patterns for Bass: 'walking_quarter', 'root_8ths', 'root_fifth_8ths'. (CRITICAL: DO NOT use 'block_chords' for Bass!).
Valid patterns for Drums: 'rock_basic', 'pop_groove', 'jazz_swing'.

Return ONLY a valid JSON object matching this TypeScript interface exactly:
{
  "options": [
    {
      "chords": [
        { "name": "Cmaj7", "measure": 1, "beat": 1 },
        { "name": "Dm7", "measure": 2, "beat": 1 },
        { "name": "G7", "measure": 3, "beat": 1 }
      ],
      "tracksConfig": [
        { "instrument": "piano", "pattern": "comping_syncopated", "octaveOffset": 0, "velocity": 85 },
        { "instrument": "bass", "pattern": "walking_quarter", "octaveOffset": -2, "velocity": 90 },
        { "instrument": "drums", "pattern": "pop_groove", "octaveOffset": 0, "velocity": 100 }
      ]
    }
    // IMPORTANT: Generate EXACTLY 4 distinct option objects in this array.
  ]
}`;

      const modelsToTry = ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];
      let responseText = '{}';
      
      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({ 
            model: modelName, 
            contents: systemPrompt, 
            config: { responseMimeType: 'application/json', temperature: 0.4 } 
          });
          responseText = response.text || '{}';
          break;
        } catch (modelErr) {
          console.warn(`[AIArrangerService] Model ${modelName} failed, trying next...`);
        }
      }
      // Clean up potential markdown formatting from Gemini
      let cleanText = responseText.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
      if (!cleanText.startsWith('{') && !cleanText.startsWith('[')) {
        const match = cleanText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (match) cleanText = match[0];
      }

      const parsed = JSON.parse(cleanText);
      if (parsed.options && Array.isArray(parsed.options) && parsed.options.length > 0) {
        return parsed.options; // Returns an array of options
      } else if (parsed.chords && parsed.tracksConfig) {
        // Fallback if the AI returned a single option
        return [parsed];
      }
      return null;
    } catch (e) {
      console.error('[AIArrangerService] Failed to generate AI arrangement:', e);
      return null;
    }
  }
}
