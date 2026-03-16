
import { GoogleGenAI } from "@google/genai";
import { Song } from "../types";

export class CoverGenerator {
  private static getPromptForSong(song: Song): string {
    const { title, artist, category, key, bpm } = song;
    
    // Define era-specific artistic styles
    let styleDescription = "Modern abstract digital art";
    if (category === "Baroque") {
      styleDescription = "Ornate Baroque aesthetic, theatrical chiaroscuro, intricate gold and deep crimson patterns, oil painting textures";
    } else if (category === "Classical") {
      styleDescription = "Neoclassical balance, marble textures, symmetrical geometric shapes, light airy pastels, structural elegance";
    } else if (category === "Romantic") {
      styleDescription = "Romanticism, emotional turbulent landscapes, misty mountains, high contrast, deep moody blues and violets";
    } else if (category === "Impressionist/Modern") {
      styleDescription = "Impressionist brushstrokes, vibrant dabs of color, light play, or early 20th century avant-garde geometry";
    } else if (bpm > 130) {
      styleDescription = "Futuristic neon glitch art, sharp energetic lines, high-speed motion blur, cyberpunk aesthetic";
    }

    const mood = bpm > 100 ? "energetic and bright" : "calm and introspective";
    
    return `Professional cinematic album cover art for a musical piece titled "${title}" by "${artist}". 
    Style: ${styleDescription}. 
    Atmosphere: ${mood}, reflecting the musical key of ${key}. 
    Visual elements: Abstract shapes and textures only, no human faces, no text, no letters. 
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

  public static async generateCover(song: Song, retryCount = 0): Promise<string | null> {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = this.getPromptForSong(song);

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
        return `data:image/png;base64,${part.inlineData.data}`;
      }
      
      return this.getFallbackUrl(song);
    } catch (error: any) {
      const isQuotaError = error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED' || JSON.stringify(error).includes('429');
      
      if (isQuotaError && retryCount < 2) {
        const delay = Math.pow(2, retryCount) * 2000;
        console.warn(`Cover API Quota hit. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        return this.generateCover(song, retryCount + 1);
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
