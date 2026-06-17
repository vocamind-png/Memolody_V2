
import { Song } from '../types';
import { songStorage } from './SongStorage';
import { parseMusicXMLMetadata } from './MusicXmlParser';

/**
 * MASTER SEED LIST: รายชื่อเพลงเริ่มต้นสำหรับผู้ใช้
 */
export const MASTER_SEED_LIST: any[] = [
  { 
    name: "Canon in D", 
    composer: "Johann Pachelbel", 
    era: "Classic", 
    bpm: 75, 
    key: "D"
  },
  { 
    name: "Moonlight Sonata (1st Mov)", 
    composer: "Ludwig van Beethoven", 
    era: "Classic", 
    bpm: 54, 
    key: "C#m"
  },
  { 
    name: "Für Elise", 
    composer: "Ludwig van Beethoven", 
    era: "Classic", 
    bpm: 126, 
    key: "Am"
  },
  { 
    name: "Minuet in G Major", 
    composer: "J.S. Bach", 
    era: "Classic", 
    bpm: 100, 
    key: "G"
  }
];

const generateBlankTemplateXml = (title: string, composer: string, bpm: number, key: string) => {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${title}</work-title></work>
  <identification><creator type="composer">${composer}</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note>
        <rest/><duration>1024</duration><voice>1</voice><type>whole</type><staff>1</staff>
      </note>
      <backup><duration>1024</duration></backup>
      <note>
        <rest/><duration>1024</duration><voice>2</voice><type>whole</type><staff>2</staff>
      </note>
    </measure>
  </part>
</score-partwise>`.trim();
};

export const seedMemory = {
  async syncMasterSeed(onProgress?: (count: number) => void) {
    // Clear existing
    await songStorage.deleteAllSongs();
    
    let syncedCount = 0;
    let firstMetadata: Song | null = null;
    let firstXml: string | null = null;
    
    for (let i = 0; i < MASTER_SEED_LIST.length; i++) {
      const item = MASTER_SEED_LIST[i];
      const targetId = `masterpiece-${i}`;
      
      const xml = generateBlankTemplateXml(item.name, item.composer, item.bpm, item.key);
      // Pass 'true' to trigger AI Cover Generation
      const { metadata, xmlData } = await parseMusicXMLMetadata(xml, true);
      
      metadata.id = targetId;
      metadata.title = item.name;
      metadata.artist = item.composer;
      metadata.bpm = item.bpm;
      metadata.key = item.key;
      metadata.category = item.era;
      metadata.duration = 60;
      
      await songStorage.saveSong(metadata, xmlData);
      
      if (i === 0) {
        firstMetadata = metadata;
        firstXml = xmlData;
      }
      
      syncedCount++;
      if (onProgress) onProgress(syncedCount);
      // Brief delay to prevent rate limiting
      await new Promise(r => setTimeout(r, 200));
    }
    return { count: syncedCount, firstMetadata, firstXml };
  }
};
