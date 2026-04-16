import os

wav_dir = "/tmp/diffsinger_dataset/wavs"

# คำศัพท์ดิกชันนารีที่ MFA (english_mfa) จับได้ง่ายๆ
vowel_map = {
    "ah": "ah",
    "oh": "oh",
    "ee": "ee",
    "eh": "eh",
    "u": "oo",
    "i": "ee",
    "sol": "soul",
    "legato": "la"
}

def generate_labs():
    wav_files = [f for f in os.listdir(wav_dir) if f.endswith(".wav")]
    count = 0
    
    for wav_file in wav_files:
        base_name = wav_file.replace(".wav", "")
        # พยายามเดาเนื้อร้องจากชื่อไฟล์
        text = "la la la" # ค่าเริ่มต้นถ้าเดาไม่ออก
        
        for key, word in vowel_map.items():
            if f"_{key}_" in wav_file or f"_{key}." in wav_file or f"_{key}" in wav_file:
                text = f"{word} {word} {word} {word}"
                break
                
        # สร้างไฟล์ .lab ชื่อเดียวกับไฟล์เสียง
        lab_path = os.path.join(wav_dir, f"{base_name}.lab")
        with open(lab_path, "w") as f:
            f.write(text)
        count += 1
        
    print(f"✅ สร้างไฟล์ป้ายกำกับเนื้อร้อง (.lab) อัตโนมัติสำเร็จ {count} ไฟล์!")

if __name__ == "__main__":
    generate_labs()
