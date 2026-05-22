# 🏆 The Memolody AI (Ultimate Implementation) - Architecture & System Design

วิสัยทัศน์ของ Memolody AI คือการก้าวข้ามขีดจำกัดของโปรแกรมอ่านโน้ต (Web DAW) ทั่วไป ด้วยการยกระดับคุณภาพเสียงสู่เวที "Singing Voice Synthesis (SVS) ระดับสตูดิโอ" โดยใช้หลักทฤษฎีโคดาย (Kodály Method) เป็นแกนกลางในการประมวลผลความแม่นยำของระยะห่างเสียง (Interval Tonal Accuracy) 

เอกสารฉบับนี้ร่างโครงสร้าง Master Plan สำหรับการพัฒนา Memolody AI สู่ความสมบูรณ์แบบครับ

---

## 1. Technical Architecture (The Cloud AI)

โครงสร้างระบบออกแบบมาเพื่อรองรับ Hybrid System (Web Audio + Cloud SVS) เพื่อบาลานซ์ระหว่างความรวดเร็วในการ Preview และคุณภาพเสียงสูงสุดในการ Export/Teaching

### 1.1 SVS Engine (Google Cloud Platform)
*   **Infrastructure:** GCP Compute Engine (GPU Instances - e.g., NVIDIA L4 หรือ T4) รองรับการ Scale แบบ Auto-scaling เมื่อมีคิว (Queue) เข้ามามาก
*   **Containerization:** ห่อหุ้มโมเดล AI (DiffSinger, SO-VITS-SVC หรือ ACE Studio Headless) ด้วย Docker File เพื่อให้ Deploy ได้รวดเร็ว
*   **API Gateway:** ใช้ Cloud Run หรือ Cloud Functions เป็นตัวรับ Request จากฝั่ง Frontend แล้วนำไปใส่ในระบบ Message Queue (เช่น Google Cloud Pub/Sub) เพื่อไม่ให้ล้น (Overload)
*   **Pitch & Interval Tuning:** ก่อนที่ AI จะ Render ระบบ Backend จะมี Script สำหรับทำ "Micro-tuning" โดยยึดหลักของ Kodály (Intonation adjustments) เช่น ขยับความถี่ (Frequency) ระหว่าง `Mi` กับ `Fa` และ `Ti` กับ `Do` ให้ชิดและชัดเจนกว่า Equal Temperament ทั่วไป ตามหลักอะคูสติกส์ของคนร้องจริง

### 1.2 Data Flow (การไหลของข้อมูล)
1.  **Compose:** ผู้ใช้แต่งเพลงหรือเลือกเพลง ฝึกฝนผ่าน Web (Movable Do / Jianpu)
2.  **Export:** Frontend กดปุ่ม "Render AI Vocal" - ส่งข้อมูล `MusicXML` + `Lyrics (Solfège)` ไปยัง API
3.  **Queue:** API นำเข้า Pub/Sub Queue คิวไหนว่าง GPU Instance จะดึงไป Render
4.  **Synthesis:** AI ประมวลผล ใส่ลมหายใจ (Breath), ลูกคอ (Vibrato), และสไลด์โน้ต (Portamento) ตามอัลกอริทึมโคดาย
5.  **Storage:** เมื่อเสร็จสิ้น ได้ไฟล์ `.wav` หรือ `.mp3` คุณภาพสูง นำไปเก็บที่ Google Cloud Storage (GCS)
6.  **Callback/Polling:** Backend ยิง Webhook หรือ Frontend ใช้ Polling เช็คสถานะ เมื่อเสร็จแล้วแอปพลิเคชันจะดาวน์โหลดเสียงร้องมาเล่นใน Player แทน Sampler เสียงชิป (MIDI)

### 1.3 Hybrid System
*   **Play (Free/Draft Mode):** ใช้ `Tone.js` Sampler หรือ Soundfont เล่นเสียงเครื่องดนตรีและเสียงร้องจำลอง (Midi-based) ทำงานฝั่ง Client 100% ฟรีและเร็วสุดๆ เปลี่ยนแปลงโน้ตได้แบบ Real-time
*   **AI Render (Premium/Final Mode):** ใช้ระบบ Cloud AI Render เมื่อผู้ใช้พอใจกับโน้ตแล้ว ไฟล์เสียงที่ได้จะเป็น Audio Track แยกอิสระ 

---

## 2. Business Logic (Active AI Slots & Profitability)

การบริหารทรัพยากร GPU (ซึ่งมีราคาแพง) เป็นเรื่องสำคัญ ระบบจะใช้หลักการ "จำกัดโควตา" (Slots) และ "ลดการทำงานซ้ำซ้อน" (Caching)

### 2.1 Active AI Slots System
*   **Free Tier:** ไม่มีสิทธิ์ใช้งาน Cloud SVS (ใช้ได้แค่ Web Audio Sampler) หรือได้ลองฟรี 1 Track (30 วินาที)
*   **Premium User (Student/Creator):** ได้รับ "Active AI Slots" เช่น 3 Slots/เดือน 
    *   1 Slot หมายถึง 1 เพลง (Mastered Track) ที่ระบบ AI เรนเดอร์เสร็จแล้วและถูกนำไปพักบน Cloud Storage
    *   ถ้าโควตา Slot เต็ม ผู้ใช้จะไม่สามารถสั่ง Render เพลงใหม่ได้ เว้นแต่จะสั่งลบไฟล์เก่าทิ้ง (Free up slot) หรือซื้อ Slot เพิ่ม
    *   ผู้ใช้สามารถอัปเดต/แก้ไขโน้ตใน Slot เดิมและสั่ง Re-render ได้ (อาจมีจำกัดจำนวนครั้งการแก้ไขต่อ Slot เพื่อประหยัด GPU)

### 2.2 Caching Strategy (One-time Inference, Unlimited Playback)
*   **No Re-computation:** เพลงที่ถูก Render เสร็จแล้ว 1 ครั้ง จะสร้างเป็น `hash` ของ `MusicXML` 
*   **Cloud Storage:** ไฟล์ Audio ไปฝังตัวอยู่บน Cloud Storage พร้อมแจกแจงผ่าน CDN
*   เมื่อผู้เรียนหรือคุณครูกดฟังเพลงเดิมอีกครั้งนับร้อยรอบ ระบบจะโหลดไฟล์ `.wav` จาก Storage มาเล่นเลย โดย **ไม่มีการบูท GPU ขึ้นมารันโมเดล AI ใหม่** ทำให้ต้นทุนต่อการกดฟังเพลง 1 ครั้ง (หลังจากเรนเดอร์เสร็จ) แทบจะเป็น $0.0001
*   **Profitability:** ระบบจะกำไรสูงสุดเพราะเราเก็บค่าบริการรายเดือน (Subscription base) หรือแบบขายขาด Slot ล่วงหน้า แต่ผู้ใช้ใช้งาน GPU จริงแค่หลักวินาทีในขั้นตอน Render

### 2.3 Teacher Dashboard & Classroom Sharing
*   **Assign & Share:** ครูสามารถนำเพลงที่ตนเองแต่งและ Render AI เสร็จแล้ว (เสีย Slot โควตาของครู 1 ช่อง) สร้างเป็น Classroom Link แบ่งปันให้นักเรียน
*   **Student Practice:** นักเรียนเปิด Link มาฟัง Practice Mode ตามมาตรฐาน Kodály ได้ทันที โดยที่ AI ร้องสเกลชัดเจนและแม่นยำ (ระบบใช้วิธีโหลด Cached Audio ของครูเท่านั้น ไม่เสียเครดิต GPU)

---

## 3. User Interface & Experience (UI/UX)

เป้าหมายของ UI คือความโปร่งใสและดูเป็นสตูดิโอระดับโปร ผู้ใช้ต้องรับรู้ได้ชัดเจนเวลาพวกเขากำลัง "ใช้พลังประมวลผลมหาศาล" 

### 3.1 AI Dashboard (Queue Management)
*   มีการแสดงผล "Active Slots" ให้เห็นว่าใช้ชิป AI ไปแล้วกี่ตัว (x/3 Slots)
*   หลอดพลังงานแสดงสถานะ Queue (Waiting -> Synthesizing -> Mastering -> Ready)
*   **ปุ่ม Trigger Bypass:** เมื่อเล่นเพลงในหน้า Player สามารถกดสลับ (A/B Test) ระหว่างเสียง MIDI ธรรมดา กับ เสียง AI สตูดิโอ ได้ทันที

---
END OF MASTER PLAN
