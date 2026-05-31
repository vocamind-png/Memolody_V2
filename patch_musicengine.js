const fs = require('fs');
let file = fs.readFileSync('lib/MusicEngine.ts', 'utf8');

// Change PitchShifter initialization to find the real native context
const initReplacement = `
              const rawCtx = Tone.getContext().rawContext;
              // Try to find native context if standard-audio-context hides createScriptProcessor
              const nativeCtx = rawCtx._nativeContext || rawCtx.nativeContext || rawCtx;
              
              if (typeof nativeCtx.createScriptProcessor !== 'function') {
                console.error('[MusicEngine] 🚨 NATIVE CONTEXT DOES NOT HAVE createScriptProcessor!', nativeCtx);
                // Fallback: inject createScriptProcessor if it's a wrapper
                if (rawCtx._nativeAudioContext) {
                    nativeCtx.createScriptProcessor = rawCtx._nativeAudioContext.createScriptProcessor.bind(rawCtx._nativeAudioContext);
                }
              }

              const shifter = new PitchShifter(nativeCtx, player.buffer.get(), 1024);
`;

file = file.replace(
  'const shifter = new PitchShifter(Tone.getContext().rawContext, player.buffer.get(), 1024);',
  initReplacement
);

fs.writeFileSync('lib/MusicEngine.ts', file);
