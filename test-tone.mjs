import * as Tone from 'tone';
const ctx = Tone.getContext().rawContext;
const gain = ctx.createGain();
const channel = new Tone.Channel();
try {
  Tone.connect(gain, channel);
  console.log("Tone.connect worked");
} catch(e) {
  console.log("Tone.connect failed", e.message);
}
