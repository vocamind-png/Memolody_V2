import fs from 'fs';
let file = fs.readFileSync('lib/MusicEngine.ts', 'utf8');
file = file.replace(
  'const shifter = new PitchShifter(Tone.getContext().rawContext, player.buffer.get(), 1024);',
  `const shifter = new PitchShifter(Tone.getContext().rawContext, player.buffer.get(), 1024);
              const dummy = Tone.getContext().rawContext.createBufferSource();
              dummy.buffer = Tone.getContext().rawContext.createBuffer(1, 1, Tone.getContext().rawContext.sampleRate);
              dummy.loop = true;
              dummy.connect(shifter.node);
              dummy.start();
              (shifter as any)._dummySource = dummy;`
);
file = file.replace(
  'const shifter = new PitchShifter(Tone.getContext().rawContext, player.buffer.get(), 1024);',
  `const shifter = new PitchShifter(Tone.getContext().rawContext, player.buffer.get(), 1024);
                const dummy = Tone.getContext().rawContext.createBufferSource();
                dummy.buffer = Tone.getContext().rawContext.createBuffer(1, 1, Tone.getContext().rawContext.sampleRate);
                dummy.loop = true;
                dummy.connect(shifter.node);
                dummy.start();
                (shifter as any)._dummySource = dummy;`
);
fs.writeFileSync('lib/MusicEngine.ts', file);
