import os
import sys
import time
import subprocess
import yaml

def print_header():
    print("\n" + "🌟"*25)
    print("    🍏 VOCALIDO M4 - LIVE COMMAND CENTER")
    print("    ระบบรายงานผลการเทรนเสียงแบบ Real-Time")
    print("🌟"*25 + "\n")

def run_step(step_name, cmd, cwd=None):
    print(f"\n{'-'*60}")
    print(f"▶️ สเต็ปปฏิบัติการ: {step_name}")
    print(f"{'-'*60}")
    
    # รันโปรแกรมโดยให้มันแสดงผลไหลออกมาที่หน้าจอโดยตรง (Stream stdout/stderr)
    process = subprocess.Popen(cmd, shell=True, cwd=cwd)
    process.wait()
    
    if process.returncode != 0:
        print(f"\n❌ [ข้อผิดพลาดจังๆ] การทำงานหยุดชะงักที่ขั้นตอน: {step_name}")
        print("💡 โปรดเลื่อนอ่านข้อความแจ้งเตือนสีแดงด้านบนเพื่อหาสาเหตุครับ")
        sys.exit(1)
    print(f"✅ [ผ่านฉลุย] เสร็จสิ้นขั้นตอน: {step_name}\n")

def generate_transcriptions_csv(textgrid_dir, csv_path):
    import glob
    with open(csv_path, 'w', encoding='utf-8') as out:
        out.write("name,ph_seq,ph_dur\n")
        for tg_file in glob.glob(f"{textgrid_dir}/*.TextGrid"):
            name = os.path.basename(tg_file).replace('.TextGrid', '')
            with open(tg_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            phones = []
            durs = []
            in_phones_tier = False
            i = 0
            while i < len(lines):
                line = lines[i].strip()
                if 'name = "phones"' in line:
                    in_phones_tier = True
                elif 'name =' in line and in_phones_tier:
                    break
                if in_phones_tier and line.startswith('text ='):
                    text = line.split('"')[1]
                    xmin = float(lines[i-2].strip().split('=')[1].strip())
                    xmax = float(lines[i-1].strip().split('=')[1].strip())
                    if text == "":
                        text = "SP"
                    phones.append(text)
                    durs.append(f"{xmax - xmin:.3f}")
                i += 1
            out.write(f"{name},{' '.join(phones)},{' '.join(durs)}\n")

def create_config(ds_data):
    config = {
        "base_config": "configs/acoustic.yaml",
        "datasets": [
            {
                "raw_data_dir": ds_data,
                "speaker": "Slora",
                "spk_id": 0,
                "language": "en",
                "test_prefixes": ["song_37", "song_38", "song_39"]
            }
        ],
        "dictionaries": {
            "en": "dictionaries/english.txt"
        },
        "binary_data_dir": f"{ds_data}_bin",
        "hnsep": "world",
        "val_with_vocoder": False,
        "max_batch_size": 16,  # เหมาะกับ RAM 24GB ของ Apple M4
        "max_epochs": 10000,
        "num_ckpt_keep": 5,
        "val_check_interval": 200,
        "accumulate_grad_batches": 1
    }
    os.makedirs("DiffSinger/usr/configs", exist_ok=True)
    with open("DiffSinger/usr/configs/vocalido.yaml", "w") as f:
        yaml.dump(config, f)
    print("✅ สร้างไฟล์คอนฟิกสำเร็จ...")

def main():
    os.environ["PATH"] = f"/Users/paisan/miniconda3/bin:{os.environ.get('PATH', '')}"
    base_dir = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido-server/training"
    os.chdir(base_dir)
    print_header()

    # 1. เปิดกราฟสด (TensorBoard)
    print("📊 1. กำลังเปิดระบบบอร์ดรายงานผล (กราฟ TensorBoard)...")
    os.system("conda run -n vocalido-env tensorboard --logdir=DiffSinger/checkpoints --port=6006 > /dev/null 2>&1 &")
    print("   👉 [สำคัญ] กดลิงก์นี้เพื่อดูบราอัจฉริยภาพได้เลย: http://localhost:6006")
    print("   (คุณสามารถเปิดเว็บนี้ค้างไว้ กราฟจะรีเฟรชทุกๆ ไม่กี่นาทีเพื่อบอกว่ามันแม่นยำขึ้นแค่ไหน)")
    time.sleep(2)

    # 2. โหลดโมเดลตัวแกะคำอัตโนมัติของ MFA
    run_step("2. โหลดเครื่องมือเทียบเสียงวรรณยุกต์ (MFA Models)", 
             "conda run -n vocalido-env mfa model download dictionary english_mfa && conda run -n vocalido-env mfa model download acoustic english_mfa")

    # 3. สกัดหาตำแหน่งช่วงเวลาเสียง
    dataset_dir = "/tmp/diffsinger_dataset"
    textgrids_dir = f"{dataset_dir}/textgrids"
    run_step("3. จับคู่เวลาคลื่นเสียงกับเนื้อร้อง (Alignment)", 
             f"conda run -n vocalido-env mfa align {dataset_dir}/wavs english_mfa english_mfa {textgrids_dir} --clean -j 4")

    # ย้ายไฟล์เตรียมเข้าโฟลเดอร์รัน AI
    ds_data = f"{base_dir}/DiffSinger/data/vocalido"
    os.makedirs(f"{ds_data}/wavs", exist_ok=True)
    os.makedirs(f"{ds_data}/textgrids", exist_ok=True)
    os.system(f"cp -r {dataset_dir}/wavs/* {ds_data}/wavs/ 2>/dev/null || true")
    os.system(f"cp -r {dataset_dir}/textgrids/* {ds_data}/textgrids/ 2>/dev/null || true")
    
    generate_transcriptions_csv(textgrids_dir, f"{ds_data}/transcriptions.csv")
    print(f"✅ สร้างไฟล์ฐานข้อมูล transcriptions.csv สำหรับ DiffSinger สำเร็จ...\n")
    
    create_config(ds_data)

    # 4. แปลงไฟล์เสียงให้เป็นฐานข้อมูลตัวเลข (Binarization)
    run_step("4. ย่อยสลายคลื่นเสียงเป็นฐานข้อมูลดิจิทัล (Binarization)", 
             "cd DiffSinger && conda run -n vocalido-env python scripts/binarize.py --config usr/configs/vocalido.yaml")

    # 5. เทรนโมเดล
    print("\n" + "🔥"*25)
    print("เข้าสู่การเทรน AI (TRAINING PHASE) อย่างเป็นทางการ")
    print("หน้าจอจะเริ่มโชว์แถบเปอร์เซ็นต์ (Progress Bar)")
    print("ถ้าระบบค้าง เปอร์เซ็นต์นี้จะหยุดวิ่ง ให้สังเกตจากตรงนี้ได้เลยครับ!")
    print("🔥"*25 + "\n")
    
    # บังคับให้ใช้การ์ดจอ M4 (MPS) อย่างเต็มสูบ
    os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
    run_step("5. เดินเครื่องเทรน AI 🚀", 
             "cd DiffSinger && conda run -n vocalido-env python scripts/train.py --config usr/configs/vocalido.yaml --exp_name vocalido_v1 --reset")

if __name__ == "__main__":
    main()
