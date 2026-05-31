import * as Tone from 'tone';
import { AudioContext } from 'standardized-audio-context-mock';
Tone.setContext(new AudioContext());
const channel = new Tone.Channel();
console.log("channel", channel.constructor.name);
console.log("channel.input", channel.input.constructor.name);
console.log("channel.get()", typeof channel.get === 'function' ? "has get()" : "no get()");
