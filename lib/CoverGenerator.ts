import { GoogleGenAI } from "@google/genai";
import { Song } from "../types";
import { storage } from "./firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

export class CoverGenerator {
  private static getPromptForSong(song: Song, lyrics?: string): string {
    const { title, artist, category, key, bpm } = song;
    
    // Define era-specific artistic styles
    let styleDescription = "Modern digital art";
    if (category === "Baroque") {
      styleDescription = "Ornate Baroque aesthetic, theatrical chiaroscuro, intricate gold and deep crimson patterns, oil painting textures";
    } else if (category === "Classical") {
      styleDescription = "Neoclassical balance, beautiful scenery, structural elegance";
    } else if (category === "Romantic") {
      styleDescription = "Romanticism, emotional turbulent landscapes, misty mountains, deep moody blues and violets";
    } else if (category === "Impressionist/Modern") {
      styleDescription = "Impressionist brushstrokes, vibrant dabs of color, light play";
    } else if (bpm > 130) {
      styleDescription = "Dynamic, energetic, sharp lines, cinematic lighting, modern aesthetic";
    }

    const mood = bpm > 100 ? "energetic and bright" : "calm and introspective";
    
    let storyPrompt = `Visually interpret the meaning and story behind the title "${title}".`;
    
    const isClassical = ["Baroque", "Classical", "Romantic", "Impressionist/Modern"].includes(category || "");
    if (isClassical) {
      storyPrompt = `Analyze the title "${title}" and artist "${artist}":
- If the title or artist names a composer, depict the composer in an interesting, expressive pose.
- If the title names a musical instrument, feature that instrument prominently.
- If the title implies a landscape, children, animals, nature, or specific objects, depict a vivid scene with those elements.
- If the title is purely generic (e.g., Symphony, Sonata, Concerto, Opus, Minuet) with no specific visual meaning, create a beautiful, purely abstract composition.`;
    }

    if (lyrics && lyrics.trim().length > 0) {
      storyPrompt = `Visually interpret the story, mood, and deeper meaning behind the title "${title}" and these lyrics: "${lyrics.substring(0, 400)}...".`;
    }

    return `Professional cinematic album cover art for a musical piece titled "${title}" by "${artist}". 
    Theme: ${storyPrompt} 
    Style: ${styleDescription}. 
    Atmosphere: ${mood}, reflecting the musical key of ${key}. 
    Visual elements: Highly detailed, vivid, meaningful illustration or photography representing the song's core concept. No text, no letters, no typography. 
    Composition: Widescreen 16:9, high-end studio quality, artistic masterpiece.`;
  }

  private static getFallbackUrl(song: Song): string {
    const category = song.category?.toLowerCase() || "";
    const seed = Math.abs(song.id.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0));
    
    // Fallback images categorized by style
    if (category.includes("baroque")) return `https://images.unsplash.com/photo-1515516089376-88db1e26e9c0?w=800&q=80&sig=${seed}`;
    if (category.includes("classical")) return `https://images.unsplash.com/photo-1520529611471-3cb3c20c0211?w=800&q=80&sig=${seed}`;
    if (category.includes("romantic")) return `https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80&sig=${seed}`;
    if (song.bpm > 130) return `https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=800&q=80&sig=${seed}`;
    
    return `https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80&sig=${seed}`;
  }

  public static async generateCover(song: Song, lyricsText?: string, retryCount = 0): Promise<string | null> {
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof __GEMINI_API_KEY__ !== 'undefined' ? __GEMINI_API_KEY__ : '');
      const ai = new GoogleGenAI({ apiKey });
      const prompt = this.getPromptForSong(song, lyricsText);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9"
          }
        }
      });

      // Find the image part in the response candidates
      const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (part?.inlineData) {
        const base64Data = part.inlineData.data;
        const dataUrl = `data:image/png;base64,${base64Data}`;
        
        try {
          // Upload to Firebase Storage
          const coverRef = ref(storage, `covers/${song.id || Date.now()}.png`);
          await uploadString(coverRef, dataUrl, 'data_url');
          const downloadUrl = await getDownloadURL(coverRef);
          return downloadUrl;
        } catch (uploadError) {
          console.error("Failed to upload cover to storage, falling back to base64", uploadError);
          return dataUrl;
        }
      }
      
      return this.getFallbackUrl(song);
    } catch (error: any) {
      const isQuotaError = error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED' || JSON.stringify(error).includes('429');
      
      if (isQuotaError && retryCount < 2) {
        const delay = Math.pow(2, retryCount) * 2000;
        console.warn(`Cover API Quota hit. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        return this.generateCover(song, lyricsText, retryCount + 1);
      }

      if (isQuotaError) {
        console.warn("Cover API Quota exhausted. Using themed fallback.");
      } else {
        console.error("Cover Generation Failed:", error);
      }
      
      return this.getFallbackUrl(song);
    }
  }
}
