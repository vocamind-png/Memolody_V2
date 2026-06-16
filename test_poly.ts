const allNotes = [
  { startTime: 1.0, duration: 2.0, pitch: 70, trackId: 'T1' },
  { startTime: 1.0, duration: 2.0, pitch: 65, trackId: 'T1' },
  { startTime: 1.0, duration: 2.0, pitch: 60, trackId: 'T2' },
  { startTime: 2.0, duration: 1.0, pitch: 72, trackId: 'T1' },
  { startTime: 2.0, duration: 1.0, pitch: 67, trackId: 'T2' },
];

allNotes.sort((a, b) => {
  const timeDiff = a.startTime - b.startTime;
  if (Math.abs(timeDiff) > 0.005) return timeDiff;
  return (b.pitch) - (a.pitch);
});

let maxVertical = 1;
const events = [];
for (const note of allNotes) {
  events.push({ time: note.startTime, type: 'start' });
  events.push({ time: note.startTime + note.duration - 0.005, type: 'end' });
}
events.sort((a, b) => {
  if (Math.abs(a.time - b.time) < 0.001) return a.type === 'end' ? -1 : 1;
  return a.time - b.time;
});

let currentActive = 0;
for (const ev of events) {
  if (ev.type === 'start') {
    currentActive++;
    if (currentActive > maxVertical) maxVertical = currentActive;
  } else {
    currentActive--;
  }
}
console.log('maxVertical:', maxVertical);

const monoTracks = Array.from({ length: maxVertical }, () => []);
const timeGroups = [];
let currentGroup = [];
for (const note of allNotes) {
  if (currentGroup.length === 0) {
    currentGroup.push(note);
  } else {
    const diff = note.startTime - currentGroup[0].startTime;
    if (Math.abs(diff) <= 0.01) {
      currentGroup.push(note);
    } else {
      timeGroups.push(currentGroup);
      currentGroup = [note];
    }
  }
}
if (currentGroup.length > 0) timeGroups.push(currentGroup);

for (const group of timeGroups) {
  const startTime = group[0].startTime;
  group.sort((a, b) => b.pitch - a.pitch);
  
  let groupIdx = 0;
  for (let t = 0; t < maxVertical && groupIdx < group.length; t++) {
    const track = monoTracks[t];
    const lastNote = track.length > 0 ? track[track.length - 1] : null;
    if (!lastNote || startTime >= lastNote.startTime + lastNote.duration - 0.005) {
      track.push(group[groupIdx]);
      groupIdx++;
    }
  }
}

monoTracks.forEach((trk, i) => {
  console.log(`Track ${i}:`);
  trk.forEach(n => console.log(`  ${n.startTime}-${n.startTime+n.duration} (Pitch: ${n.pitch})`));
});
