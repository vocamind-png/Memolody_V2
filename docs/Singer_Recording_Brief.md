# 🎙️ AI Vocal Dataset Recording Brief
*(คู่มือการบันทึกเสียงสำหรับนักร้องทำ AI Dataset)*

---

## 1. Project Overview & Scope
* **Goal:** To collect highly clean, dry vocal stems to train a private AI voice model.
* **Scope of Work (2 Parts - Totaling 60-90 minutes of pure vocals):**
  * **Part 1 (New Recording based on Guide):** Record the 70-track scale and technique script (`Vocal_Recording_Score`). This captures your vocal range across registers and pure vowels (Approx. 15-30 minutes of singing).
  * **Part 2 (Provide Existing Vocals OR Record New Songs):** Provide raw, dry vocal stems for songs as follows:
    * 🟢 **Recommended:** 15-20 songs (~45-60 minutes of pure singing) — Best quality model
    * 🟡 **Acceptable Minimum:** 8-10 songs (~25-35 minutes) — Good quality, minor trade-offs in word transitions
    * 🔴 **Below 8 songs is NOT acceptable** — Insufficient data for natural AI voice synthesis
  * You can use your past recording sessions (Covers, Originals). **If you do not have enough clean, unprocessed stems, you may simply choose any songs and record new covers to meet the quota.** These will NEVER be published anywhere; they are used strictly internally to teach the AI natural word transitions.

## 2. Language Requirements (ภาษาที่ใช้ร้อง)
* **Primary Language:** Thai (ภาษาไทย)
* **Secondary Language:** English (ภาษาอังกฤษ) — if comfortable
* Please inform our team in advance which language(s) you will be singing in, as this affects phoneme mapping during AI training.
* If you can sing in both languages, we strongly encourage recording in **both Thai and English** for a more versatile AI model.

## 3. License & Rights (ลิขสิทธิ์)
* **Commercial Buyout:** The recorded vocals will be used to train a private AI Voice Model (Vocal Clone). By accepting this gig, the singer grants full buyout and commercial rights for the vocal data to be used in AI training. The data will not be redistributed as raw stems.

## 4. Technical Requirements
* **Format:** `.WAV` format only.
* **Quality:** 44.1kHz or 48kHz, 24-bit, Mono channel.
* **Gain Level:** Record at a comfortable level with peaks **no higher than -6dBFS**. This provides headroom and prevents clipping. Check your meter before and during each take.
* **100% DRY AUDIO:** **(CRITICAL FOR BOTH NEW RECORDINGS AND EXISTING STEMS!)** Do absolutely NO processing. 
  * ❌ NO EQ
  * ❌ NO Compression
  * ❌ NO Reverb or Delay
  * ❌ NO Auto-Tune or Pitch Correction
  * **🚨 DO NOT apply any compression, limiting, or de-essing during or after recording.**
* **Clean Recording:** Please ensure zero background noise, no air conditioning hum, and no plosives (mic bumps) or clipping.
* **Pop Filter / Windscreen:** 🛡️ **A pop filter (or foam windscreen) is REQUIRED** in front of the microphone to minimize plosive sounds (P, B, T) and breath bursts.

## 5. Recording Guidelines (ข้อปฏิบัติในการร้อง)
To ensure the AI learns the voice correctly, please adhere to these rules:

1. **Mic Distance:** Maintain a consistent distance (approximately 15-20 cm / 6-8 inches) from the microphone throughout all recording sessions to keep the timbre stable.
2. **Consistency:** Sing with a consistent energy level and tone. Do not drastically change your vocal style between songs (unless specifically directed).
3. **Articulation:** Pronounce consonants and vowels slightly clearer than you normally would. 
4. **Pitch & Rhythm:** Sing strictly on beat with the click track and accurately follow the pitch of the provided MIDI guide. 
   * **Click Track BPM:** Use the BPM specified in each guide track. If no BPM is specified, use **BPM 100** as the default tempo for scale exercises.
5. **Vocal Range Coverage (CRITICAL!):** The provided guide tracks/MIDI are just baseline starting keys. You MUST sing these scales while transposing them up and down to cover your ENTIRE vocal range. Please allocate your recording time clearly as follows:
   * **Chest Voice:** Approximately 20-30 minutes
   * **Mix Voice:** Approximately 20-30 minutes
   * **Head Voice / Falsetto:** Approximately 20-30 minutes
   This ensures the AI can synthesize high and low notes seamlessly across all registers.
6. **Syllable Continuity:** Please sing Legato (connected) and Staccato (short, detached) styles clearly and separately in each category. This helps the AI learn natural human-like transitions between words.
7. **Emotion & Dynamics:** 
   * Record the majority of Part 1 (scales) with a **neutral, stable tone**.
   * For Part 2 (songs), sing with **natural emotion** as you normally would. Variety in dynamics (soft vs. strong) across different songs is welcome — this teaches the AI expressive singing.
   * Avoid extreme screaming, whispering, or spoken-word sections unless directed.
8. **Breathing is OK:** You can leave natural breaths in the recording! The AI learns from them. Just avoid harsh mic-bumping plosives.
9. **No Overlaps:** Only ONE main vocal line per track. Do not record harmonies or overlapping doubles in the same file.

## 6. File Naming Convention (การตั้งชื่อไฟล์)
Please name all files using the following format to help our team organize and label the data efficiently:

**Part 1 (Scales & Technique):**
```
[SingerName]_P1_[Register]_[Number].wav
```
Examples:
* `Nida_P1_Chest_01.wav`
* `Nida_P1_Mix_05.wav`
* `Nida_P1_Head_03.wav`

**Part 2 (Songs):**
```
[SingerName]_P2_[SongTitle]_vocal.wav
```
Examples:
* `Nida_P2_LoveStory_vocal.wav`
* `Nida_P2_คิดถึง_vocal.wav`

## 7. Deliverables
* **Part 1 (New Recordings):** Render the continuous stems for the 70-track script.
  * *Sync:* All files must start exactly at 0:00.
* **Part 2 (Song Stems — 8-20 Songs):** Provide the dry vocal stems.
  * *Note:* Please **provide the lyrics (text files) or the song titles** so our team can accurately transcribe the phonemes for AI training.

## 8. File Delivery Method (วิธีส่งไฟล์)
* **Preferred:** Upload all files to **Google Drive** and share the link with our team.
* **Alternative:** Use **WeTransfer** or any file-sharing service that supports large files.
* **⚠️ Do NOT compress files to .mp3 or .aac.** Keep all files as `.WAV`.
* Organize files into two folders:
  ```
  📁 [YourName]_AI_Vocal_Dataset/
  ├── 📁 Part1_Scales/
  │   ├── Name_P1_Chest_01.wav
  │   ├── Name_P1_Mix_01.wav
  │   └── ...
  └── 📁 Part2_Songs/
      ├── Name_P2_SongTitle_vocal.wav
      ├── Name_P2_SongTitle_lyrics.txt
      └── ...
  ```

## 9. Timeline & Deadline (กำหนดส่ง)
* **Deadline:** Please deliver all files within **14 days** from the date of agreement signing.
* If you need more time, please inform our team at least 3 days before the deadline.
* Partial submissions are welcome — you can upload files as you complete them.

---

## ✅ Pre-Recording Checklist
Before you start recording, please confirm the following:
- [ ] Pop filter / windscreen is in place
- [ ] Room is quiet (AC off, no background noise)
- [ ] DAW is set to: 48kHz, 24-bit, Mono
- [ ] Input gain is set so peaks stay below **-6dBFS**
- [ ] All effects/plugins on the recording channel are **bypassed/off**
- [ ] You have reviewed the `Vocal_Recording_Score` guide tracks

---
*Thank you for being a part of this project! If you have any questions, please ask before starting.*
*สอบถามรายละเอียดเพิ่มเติม: vocamind@gmail.com*
