# Vocal AI Recording Brief & Tracklist
**(English Dataset Exclusive Edition)**

This guide is intended for the vocalist and recording engineer to prepare an Acoustic Model dataset for Singing Voice Synthesis (SVS). This English-only workflow requires maximum phonetic clarity, entirely discarding foreign tones or semantics in favor of pure English articulation.

---

## 1. Studio & Technical Requirements
The paramount objective is to harvest a "100% pure, natural human timbre."
* **Audio Format:** `.wav` (PCM), 44.1 kHz or 48 kHz, 24-bit, Mono.
* **Microphone Processing (STRICT DRY):**
  * **ABSOLUTELY NO EFFECTS:** Zero Reverb, Zero Delay, Zero Chorus, and Zero Autotune/Melodyne.
  * **NO DYNAMICS PROCESSING:** No Compressors, Limiters, or Exciters active on the vocal chain during print.
  * **NO EQ:** Except for a high-pass / low-cut filter below 50Hz to mitigate rumbling.
* **Acoustic Environment:** Must be fundamentally dead/dry. Background noise and early reflections must be minimized (Noise Floor < -60dB).
* **Zero Bleed:** The vocalist must use closed-back headphones or In-Ear Monitors. **No Metronome clicks or Backing Tracks bleeding into the microphone.**

## 2. Singing Delivery Guidelines
* **Pronunciation (Articulation):** Over-enunciate all words by 20%. Especially emphasize Ending Consonants (like t, d, k, p) and Fricatives (s, th, v). 
* **Legato & Slurring:** Maintain a smooth, natural connection between vowels when singing phrases, unless a sharp Staccato is explicitly requested.
* **Sustain and Vibrato:** When sustaining a long note, start with a "Straight Tone" for 1-2 seconds, then smoothly transition into your natural Vibrato at the tail. This teaches the AI where to bridge the two.
* **Breaths / Quirks:** Natural inhales and vocal fry are perfectly fine!

---

## 3. Recording Tracklist Script (53 Tracks Total)

### Phase 1: Basic Timbre and Vowels (Tracks 01 - 10)
*Instruction: Sing slowly along an improvised musical scale (e.g., sliding up and down C4 to C5 to C4).*
* **Track 01 - Vowel_Ah:** Long sustain "Ahhhhh"
* **Track 02 - Vowel_Ee:** Long sustain "Eeeeeee"
* **Track 03 - Vowel_Oo:** Long sustain "Ooooooo"
* **Track 04 - Vowel_Eh:** Long sustain "Ehhhhhh"
* **Track 05 - Vowel_Oh:** Long sustain "Ohhhhhh"
* **Track 06 - Vowel_Diphthong:** "Aye - Owe - Oye" (slur between them natively)
* **Track 07 - Tech_Falsetto_Slide:** Sing "Ah", starting from a heavy chest voice and sliding up as high as possible into a pure falsetto.
* **Track 08 - Tech_Breathiness:** Sing with a heavy, soft, breathy tone: *"Why is it to be like this... Ahhhh..."*
* **Track 09 - Tech_Belting:** High-energy belt (power): *"Hey! Let's go right now... Woah!"*
* **Track 10 - Tech_Vibrato:** Sustained note. Straight tone for 2 seconds, then intense vibrato: *"Foreveeeerrrr~~"*

### Phase 2: English Phonetically Balanced Sensences (Tracks 11 - 25)
*Instruction: Improvise a gentle, steady melody for these sentences. Pronounce consonants perfectly.*
* **Track 11 - Eng_PB_Plosives:** (P, B, T, D, K, G) "Peter baked a big cake. Take the dog to the golden gate."
* **Track 12 - Eng_PB_Fricatives1:** (S, Z, F, V) "Seven zebras saw five flying vines."
* **Track 13 - Eng_PB_Fricatives2:** (TH - voiced/unvoiced) "I think that this thing is the best theme they ever threw."
* **Track 14 - Eng_PB_Fricatives3:** (SH, ZH, CH, J) "She sells fresh cheese, and gently jumps across the ocean."
* **Track 15 - Eng_PB_Liquids:** (L, R, W, Y) "Red river rolls freely. Will you yield the yellow lily?"
* **Track 16 - Eng_PB_Nasals:** (M, N, NG) "Many monkeys are singing a morning song under the moon."
* **Track 17 - Eng_PB_HarshEndings:** (Staccato stops) "Look around! Stop that cat! Good night, sweet heart."

*(Harvard sentences: Standard linguistic test phrases to capture hidden phoneme connections)*
* **Track 18 - Eng_Harv_01:** "The birch canoe slid on the smooth planks."
* **Track 19 - Eng_Harv_02:** "Glue the sheet to the dark blue background."
* **Track 20 - Eng_Harv_03:** "It's easy to tell the depth of a well."
* **Track 21 - Eng_Harv_04:** "These days a chicken leg is a rare dish."
* **Track 22 - Eng_Harv_05:** "Rice is often served in round bowls."
* **Track 23 - Eng_Harv_06:** "The juice of lemons makes fine punch."
* **Track 24 - Eng_Harv_07:** "The box was thrown beside the parked truck."
* **Track 25 - Eng_Harv_08:** "The hogs were fed chopped corn and garbage."

### Phase 3: English Song Repertoire Dataset (Tracks 26 - 45)
*Instruction: Prepare 20 full-length or half-length English songs (Covers). These should capture a wide variety of tempos and articulations (Pop, Ballads, R&B, Acoustic).*
* **Track 26 to 45:** Save individual files as **Track X - EngSong_[TitleName]**. Sing cleanly with genuine emotion. Provide a balanced mix of soft whispers in verses and full-belted notes in choruses.

### Phase 4: Boundary & Emotion Testing (Tracks 46 - 53)
*Instruction: This phase isolates and maps vocal quirks unique to the singer.*
* **Track 46 - Emo_Laughing_Sighing:** Fake crying, musical sighing, gentle chuckles in pitch.
* **Track 47 - Emo_Nasal_Tone:** Sing a run "in the mask" (Nasal resonance): "Mmmmm Hmmmm Yeah Aye..."
* **Track 48 - Emo_Growl_Rock:** Insert slight vocal distortion / vocal fry / growl at the edges of phrases.
* **Track 49 to 53 - Free_Adlibs:** Save as **Track X - Free_Adlib_[Style]**. Show off your most impressive vocal runs, riffs, and signature stylistic choices using random vowels (Vocalizing without lyrics).

---
**DELIVERY / FILE EXPORT INSTRUCTIONS:**
Please bounce the audio and name the `.wav` files exactly matching the Bolded Track Titles above (e.g., `Track 01 - Vowel_Ah.wav`). **Do NOT send a single continuous 3-hour audio file.** Pre-sliced segmented audio is mandated for the Montreal Forced Aligner (MFA) logic to parse the dataset correctly.
