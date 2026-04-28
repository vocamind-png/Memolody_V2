
import { MidiWriter } from './MidiWriter';

export interface ConversionResult {
  fileName: string;
  success: boolean;
  xmlData?: string;
  midiData?: Blob;
  error?: string;
}

export class FileConverter {
  /**
   * Attempts to convert a file to MusicXML or MIDI.
   */
  static async convertFile(file: File): Promise<ConversionResult> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    try {
      if (ext === 'emk') {
        return await this.convertEmk(file);
      }
      
      // For now, only .emk is handled as a special case.
      // Other formats like .pdf, .jpg are handled by SheetMusicOCR elsewhere.
      
      return {
        fileName: file.name,
        success: false,
        error: `Unsupported format: .${ext}`
      };
    } catch (err: any) {
      return {
        fileName: file.name,
        success: false,
        error: err.message || "Unknown error during conversion"
      };
    }
  }

  /**
   * Helper to decompress ZLIB/Deflate data using native browser API.
   * Optimised to handle trailing garbage in SFDS containers.
   */
  private static async decompress(data: Uint8Array): Promise<Uint8Array | null> {
    try {
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(data);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      let totalLength = 0;
      while (true) {
        try {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          totalLength += value.length;
        } catch (readErr) {
          // Some browsers throw if there is trailing garbage after the ZLIB stream end
          break;
        }
      }
      if (totalLength === 0) return null;
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    } catch (e) {
      return null;
    }
  }

  /**
   * Proprietary .emk to MIDI conversion (SFDS Deep Extraction V2)
   */
  private static async convertEmk(file: File): Promise<ConversionResult> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // SFDS Master Key
    const key = new Uint8Array([0xAF, 0xF2, 0x4C, 0x9C, 0xE9, 0xEA, 0x99, 0x43]);
    const decrypted = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      decrypted[i] = bytes[i] ^ key[i % 8];
    }
    
    // Verify SFDS Header (.SFD)
    const isSfds = (decrypted[0] === 0x2E && decrypted[1] === 0x53 && decrypted[2] === 0x46 && decrypted[3] === 0x44);
    
    // Find ZLIB candidates (0x78 0x01, 0x78 0x9C, 0x78 0xDA)
    const candidates: number[] = [];
    for (let i = 0; i < decrypted.length - 2; i++) {
      if (decrypted[i] === 0x78 && (decrypted[i+1] === 0x9C || decrypted[i+1] === 0x01 || decrypted[i+1] === 0xDA)) {
        candidates.push(i);
      }
    }

    console.log(`[SFDS] Analyzing ${candidates.length} chunks...`);

    let bestMidi: Uint8Array | null = null;
    let maxMidiSize = 0;

    for (const start of candidates) {
      try {
        const decompressed = await this.decompress(decrypted.slice(start));
        if (!decompressed) continue;

        // Search for MIDI signature in decompressed data
        for (let j = 0; j < Math.min(decompressed.length, 100); j++) {
          if (decompressed[j] === 0x4D && decompressed[j+1] === 0x54 && decompressed[j+2] === 0x68 && decompressed[j+3] === 0x64) {
            if (decompressed.length > maxMidiSize) {
              bestMidi = decompressed.slice(j);
              maxMidiSize = decompressed.length;
              console.log(`[SFDS] Found MIDI candidate at chunk ${start} (size: ${maxMidiSize})`);
            }
            break;
          }
        }
      } catch (e) {}
    }

    if (bestMidi) {
      return {
        fileName: file.name.replace('.emk', '.mid'),
        success: true,
        midiData: new Blob([bestMidi], { type: 'audio/midi' })
      };
    }

    // Fallback: search raw decrypted
    for (let i = 0; i < decrypted.length - 4; i++) {
      if (decrypted[i] === 0x4D && decrypted[i+1] === 0x54 && decrypted[i+2] === 0x68 && decrypted[i+3] === 0x64) {
        return {
          fileName: file.name.replace('.emk', '.mid'),
          success: true,
          midiData: new Blob([decrypted.slice(i)], { type: 'audio/midi' })
        };
      }
    }

    return {
      fileName: file.name,
      success: false,
      error: "No MIDI stream found. Ensure this is a music-containing EMK file."
    };
  }
}
