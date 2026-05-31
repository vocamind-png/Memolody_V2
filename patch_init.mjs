import fs from 'fs';

let content = fs.readFileSync('lib/MusicEngine.ts', 'utf8');

const main_mix_replace = `if (myGeneration === this._vocalGeneration) {
              mainPlayer = player;
              if (renderBpm) (mainPlayer as any).renderBpm = renderBpm;
              // Initialize PitchShifter
              if (!this.vocalPitchShifters.has(trackId)) this.vocalPitchShifters.set(trackId, []);
              const shifter = new PitchShifter(Tone.getContext().rawContext, player.buffer.get(), 1024);
              const dummy = Tone.getContext().rawContext.createBufferSource();
              dummy.buffer = Tone.getContext().rawContext.createBuffer(1, 1, Tone.getContext().rawContext.sampleRate);
              dummy.loop = true;
              dummy.connect(shifter.node);
              dummy.start();
              (shifter as any)._dummySource = dummy;
              this.vocalPitchShifters.get(trackId).push(shifter);
            } else {`;

content = content.replace(
    /if \(myGeneration === this\._vocalGeneration\) \{\s*mainPlayer = player;\s*if \(renderBpm\) \(mainPlayer as any\)\.renderBpm = renderBpm;\s*\} else \{/g,
    main_mix_replace
);

const stems_replace = `if (myGeneration === this._vocalGeneration) {
                loadedStems[index] = player;
                if (renderBpm) (player as any).renderBpm = renderBpm;
                // Initialize Stem PitchShifter
                if (!this.vocalPitchStems.has(trackId)) this.vocalPitchStems.set(trackId, []);
                const shifter = new PitchShifter(Tone.getContext().rawContext, player.buffer.get(), 1024);
                const dummy2 = Tone.getContext().rawContext.createBufferSource();
                dummy2.buffer = Tone.getContext().rawContext.createBuffer(1, 1, Tone.getContext().rawContext.sampleRate);
                dummy2.loop = true;
                dummy2.connect(shifter.node);
                dummy2.start();
                (shifter as any)._dummySource = dummy2;
                this.vocalPitchStems.get(trackId)[index] = shifter;
              } else {`;

content = content.replace(
    /if \(myGeneration === this\._vocalGeneration\) \{\s*loadedStems\[index\] = player;\s*if \(renderBpm\) \(player as any\)\.renderBpm = renderBpm;\s*\} else \{/g,
    stems_replace
);

fs.writeFileSync('lib/MusicEngine.ts', content);
