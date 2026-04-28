# 🎤 Ophelia Voice Samples

วางไฟล์ WAV ของ voice samples ที่นี่เพื่อให้ **Voice Studio Sampler (Layer 1)** ทำงานได้

## ตั้งชื่อไฟล์ตาม MIDI Note

| ตัวอย่างชื่อไฟล์ | Note | MIDI |
|---|---|---|
| `C4.wav` | C4 (Middle C) | 60 |
| `Cs4.wav` | C#4 | 61 |
| `D4.wav` | D4 | 62 |
| `Eb4.wav` หรือ `Ds4.wav` | D#4 / Eb4 | 63 |
| `A4.wav` | A4 | 69 |
| `Bb4.wav` หรือ `As4.wav` | A#4 / Bb4 | 70 |

## ช่วง Note ที่แนะนำ
- **ขั้นต่ำ**: C3 (48) ถึง C5 (72) — ครอบ 2 octave
- **เหมาะสุด**: C2 (36) ถึง G5 (79) — ครอบ soprano/mezzo-soprano
- ทุก note ที่ไม่มี file จะ **pitch-shift อัตโนมัติ** จาก note ที่ใกล้ที่สุด

## Format
- **Sample rate**: 44100 Hz (แนะนำ)
- **Bit depth**: 16-bit หรือ 24-bit
- **Channel**: Mono หรือ Stereo (จะ convert เป็น mono อัตโนมัติ)
- **Duration**: 1–3 วินาที ต่อ note (server จะ loop/trim ให้พอดี)

## ตัวอย่างการ export จาก UTAU
หาก export จาก UTAU VoiceBank:
```
A3.wav, As3.wav, B3.wav, C4.wav, Cs4.wav, ...
```
ใส่มาในโฟลเดอร์นี้ได้เลย ✅
