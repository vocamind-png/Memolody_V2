import * as fs from 'fs';

const filePath = 'lib/MusicEngine.ts';
let content = fs.readFileSync(filePath, 'utf-8');

const targetStr = `
              } else {
                // k === 1: Single note — assign to the voice with closest previous pitch
                // NO UNISON CLONING — only one voice sings
                const midi = toMidi(concurrentNotes[0]);
                let bestVoice = 0;
                let bestDist = Infinity;
                
                for (const v of availableVoices) {
                  const lastP = lastPitchForTrack[v];
                  if (lastP !== undefined) {
                    const dist = Math.abs(lastP - midi);
                    if (dist < bestDist) {
                      bestDist = dist;
                      bestVoice = v;
                    }
                  }
                }
                assignment[0] = bestVoice;
              }
`;

const replacementStr = `
              } else {
                // k === 1: Single note
                // Use the XML voice to assign to the correct local track.
                // Voice 1,3,5 -> Voice 0 (Soprano/Tenor)
                // Voice 2,4,6 -> Voice 1 (Alto/Bass)
                const xmlVoice = concurrentNotes[0].voice || 1;
                const mappedVoiceIdx = (xmlVoice % 2 === 1) ? 0 : 1;
                
                if (availableVoices.includes(mappedVoiceIdx)) {
                  assignment[0] = mappedVoiceIdx;
                } else {
                  // Fallback: assign to voice with closest previous pitch
                  const midi = toMidi(concurrentNotes[0]);
                  let bestVoice = 0;
                  let bestDist = Infinity;
                  
                  for (const v of availableVoices) {
                    const lastP = lastPitchForTrack[v];
                    if (lastP !== undefined) {
                      const dist = Math.abs(lastP - midi);
                      if (dist < bestDist) {
                        bestDist = dist;
                        bestVoice = v;
                      }
                    }
                  }
                  assignment[0] = bestVoice;
                }
              }
`;

content = content.replace(targetStr, replacementStr);

fs.writeFileSync(filePath, content, 'utf-8');
console.log("Patch applied successfully!");
