import * as Tone from 'tone';
const player = new Tone.GrainPlayer();
console.log("Mute property:", typeof player.mute, player.mute);
player.mute = true;
console.log("Mute after set:", player.mute);
