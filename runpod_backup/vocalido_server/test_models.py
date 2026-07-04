import os
import sys

# Change to vocalido_server directory
current_dir = os.path.dirname(__file__)
if os.getcwd() != current_dir:
    os.chdir(current_dir)

def test_deepbach():
    try:
        from deepbach_engine import generate_deepbach_harmony
        print("Testing DeepBach Engine...")
        # Since we just generate 4 parts and DeepBach doesn't strictly depend on input XML for generation,
        # we provide a dummy XML just to test the integration execution path.
        dummy_xml = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Melody</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>"""
        
        score = generate_deepbach_harmony(dummy_xml, target_length_ticks=32)
        print("DeepBach generation successful. Output parts:")
        for p in score.parts:
            print("  -", p.partName)
    except Exception as e:
        print("DeepBach test failed:", e)

def test_transformer():
    try:
        from transformer_engine import generate_transformer_harmony
        print("\nTesting Transformer Engine...")
        dummy_xml = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Melody</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>"""
        # Testing short generation (5 seconds) to see if it works
        score = generate_transformer_harmony(dummy_xml, target_length_seconds=5)
        print("Transformer generation successful. Output parts:")
        for p in score.parts:
            print("  -", p.partName)
    except Exception as e:
        print("Transformer test failed:", e)

if __name__ == "__main__":
    test_deepbach()
    test_transformer()
