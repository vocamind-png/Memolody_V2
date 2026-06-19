
import { Song } from './types';

export const COLORS = {
  bg: '#050507',
  accent: '#00e5ff',
  secondary: '#111115',
  lcd: '#10b981',
};

/**
 * [NEURAL IDENTITY CORE - NIMO v1.5]
 * รูปลักษณ์อย่างเป็นทางการของ "นีโม" 
 * อัปเดตลิงก์รูปภาพเป็นเวอร์ชันล่าสุดค่ะ
 */
export const NIMO_IDENTITY_IMAGE = "/Nimo.png"; 

const createStandardXml = (title: string, composer: string) => `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${title}</work-title></work>
  <identification>
    <creator type="composer">${composer}</creator>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <key><fifths>0</fifths></key>
        <time><beats:4></beats><beat-type:4></beat-type></time>
        <clef><sign>G</sign><line:2></line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>256</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>256</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>256</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>256</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`.trim();

export const MUSICXML_TEMPLATES = [
  { name: "Ode to Joy", composer: "Beethoven", era: "Classic", bpm: 120, cover: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=400", xml: createStandardXml("Ode to Joy", "Beethoven") },
  { name: "Canon in D", composer: "Pachelbel", era: "Classic", bpm: 80, cover: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400", xml: createStandardXml("Canon in D", "Pachelbel") },
  { name: "Clair de Lune", composer: "Debussy", era: "Classic", bpm: 72, cover: "https://images.unsplash.com/photo-1520529611471-3cb3c20c0211?w=400", xml: createStandardXml("Clair de Lune", "Debussy") }
];
