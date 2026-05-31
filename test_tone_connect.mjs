import * as Tone from 'tone';
import 'web-audio-api'; // node fallback? No, Tone doesn't need native if we use Tone.setContext
Tone.setContext(new Tone.Context());
const channel = new Tone.Channel();
console.log("Channel input:", channel.input);
const context = Tone.getContext().rawContext;
const sp = context.createScriptProcessor(1024, 2, 2);
try {
  Tone.connect(sp, channel);
  console.log("Connect successful");
} catch(e) {
  console.error("Connect failed", e);
}
