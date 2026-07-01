export type NoteType = 'crotchet' | 'quaver' | 'rest';

export interface RhythmSequence {
  notes: NoteType[];
  bpm: number;
  timeSignature: [number, number]; // e.g., [4, 4]
}

export interface LevelDefinition {
  id: number;
  grade: string;
  name: string;
  characterImage: string;
  sequences: RhythmSequence[];
}

export const LEVELS: LevelDefinition[] = [
  {
    id: 1,
    grade: "Grade 1",
    name: "Tactical Shark Beat",
    characterImage: "/images/brainrot/shark.png",
    sequences: [
      {
        notes: ['crotchet', 'crotchet', 'crotchet', 'crotchet'],
        bpm: 100,
        timeSignature: [4, 4]
      }
    ]
  },
  {
    id: 2,
    grade: "Grade 2",
    name: "Espresso Breaker",
    characterImage: "/images/brainrot/espresso.png",
    sequences: [
      {
        notes: ['crotchet', 'quaver', 'quaver', 'crotchet', 'crotchet'],
        bpm: 110,
        timeSignature: [4, 4]
      }
    ]
  },
  {
    id: 3,
    grade: "Grade 3",
    name: "Jet-igator Chaos",
    characterImage: "/images/brainrot/alligator.png",
    sequences: [
      {
        notes: ['quaver', 'quaver', 'rest', 'crotchet', 'crotchet'],
        bpm: 120,
        timeSignature: [4, 4]
      }
    ]
  },
  {
    id: 4,
    grade: "Grade 4",
    name: "King of the Sea",
    characterImage: "/images/brainrot/dolphin.png",
    sequences: [
      {
        notes: ['quaver', 'quaver', 'quaver', 'quaver', 'crotchet', 'rest'],
        bpm: 130,
        timeSignature: [4, 4]
      }
    ]
  },
  {
    id: 5,
    grade: "Grade 5",
    name: "Bamboo Smash",
    characterImage: "/images/brainrot/bamboo.png",
    sequences: [
      {
        notes: ['quaver', 'crotchet', 'quaver', 'crotchet', 'crotchet'],
        bpm: 140,
        timeSignature: [4, 4]
      }
    ]
  }
];
