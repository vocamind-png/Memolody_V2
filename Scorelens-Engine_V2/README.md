# 🎼 [Master Blueprint] Scorelens-Engine & Memolody API v2

**ชื่อโครงการ:** Scorelens-Engine (Integrated with Memolody Ecosystem)  
**เป้าหมาย:** สร้างระบบ OMR (Optical Music Recognition) ที่รักษา "จิตวิญญาณ" ของต้นฉบับ ทั้งตำแหน่ง พิกัด ฟอนต์ และตรรกะทางดนตรีแบบ Pixel-to-Pixel

---

## 📂 1. โครงสร้างการจัดเก็บ (Storage & Organization)
- **Root Folder:** `/Scorelens-Engine_V2/`
- **API Path:** `https://api.memolody.com/v2/scorelens/`
- **Cloud Storage:** `gs://memolody-vault/v2-scores/`

## 🟢 2. ขั้นตอนการวิเคราะห์โครงสร้าง (Structural Analysis)
- **System Mapping:** นับจำนวนบรรทัด (Staves) ทั้งหมดในหน้านั้น และระบุการเชื่อมโยง Barline ระหว่างบรรทัด (เช่น Grand Staff ของเปียโน)
- **Measurement:** คำนวณค่า staff-space (ระยะระหว่างเส้น) และ system-distance (ระยะระหว่างกลุ่มบรรทัด) เพื่อใช้ในการจัดหน้าใหม่ให้เหมือนต้นฉบับเป๊ะ
- **Layout Fidelity:** เก็บค่าพิกัด Margin (ขอบกระดาษ) และ Padding ทั้งหมดในรูปแบบ Relative Coordinates (X, Y)

## 🟡 3. การสกัดรายละเอียดระดับพิกเซล (Precision Extraction)
- **Semantic Segmentation:** ใช้ U-Net แยกพิกเซล "หัวโน้ต" (กลม/ขาว/ดำ), "หาง" (Stem), "ตัวหยุด" (Rests) และ "สัญลักษณ์พิเศษ"
- **Note-on-Staff Location:** วิเคราะห์ว่าหัวโน้ต "คาบเส้น" หรือ "อยู่ในช่อง" ที่เท่าไหร่ โดยอิงจากสมการเส้นบรรทัด (Polynomial Staff Tracking)
- **Stem Direction & Beaming:** บันทึกทิศทางหาง (ขึ้น/ลง) และการรวบหาง (Beaming) เพื่อรักษา Logic การอ่านจังหวะต้นฉบับ
- **Multi-Voice Logic:** แยกแนวประสาน (Voices) ในบรรทัดเดียวกันโดยดูจากทิศทางหางและการวางซ้อนของจังหวะ

## 🟠 4. อักขระและสัญลักษณ์ทางกราฟิก (Typography & Graphics)
- **Semantic OCR:** สกัด Title, Composer, และ Lyrics โดยบันทึก Font Style (Bold/Italic) และ Point Size
- **Expression Marks:** เก็บพิกัดคำศัพท์ดนตรี (p, f, rit., accel.) และเครื่องหมาย Articulation (Staccato, Accent) โดยผูกกับ Anchor Point ของตัวโน้ต
- **Curved Line Pathing:** สกัดเส้น Tie และ Slur ด้วยระบบ Path Following เพื่อหาจุดเริ่มและจุดจบที่แม่นยำ

## 🔴 5. ระบบตรวจสอบและส่งออก (Validation & API Response)
- **Measure Integrity Check:** รวมค่า Duration ของโน้ตและตัวหยุดในแต่ละห้อง หากไม่ตรงกับ Time Signature จะให้ค่า Confidence Score ต่ำเพื่อให้ระบบแจ้งเตือน
- **Cross-Page Stitching:** เชื่อมโยงข้อมูล Key/Time Signature และเส้น Tie ที่ลากข้ามหน้ากระดาษ
- **API Response (JSON Bundle):** ส่งค่ากลับเป็นชุดข้อมูลที่ประกอบด้วย:
  - `MusicXML`: ข้อมูลดนตรีเชิงลึก
  - `Layout Map`: JSON พิกัด Bounding Box สำหรับการ Render ทับรูปภาพ
  - `Metadata`: Copyright, Publisher และ Integrity Hash สำหรับ Content Protection
