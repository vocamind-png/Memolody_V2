import os
import sys
import time
import subprocess
import yaml

# ── Force vocalido-env onto PATH so all subprocesses find fstcompile, mfa, etc. ──
VOCALIDO_BIN = "/Users/paisan/miniconda3/envs/vocalido-env/bin"
os.environ["PATH"] = f"{VOCALIDO_BIN}:{os.environ.get('PATH', '')}"
os.environ["CONDA_PREFIX"] = "/Users/paisan/miniconda3/envs/vocalido-env"

def print_header():
    print("\n" + "🌟"*25)
    print("    🍏 VOCALIDO M4 - LIVE COMMAND CENTER")
    print("    ระบบรายงานผลการเทรนเสียงแบบ Real-Time")
    print("🌟"*25 + "\n")

def get_env_cmd(cmd):
    # Force use of vocalido-env binaries
    env_path = "/Users/paisan/miniconda3/envs/vocalido-env/bin"
    if cmd.startswith("python"):
        return f"{env_path}/{cmd}"
    if cmd.startswith("mfa"):
        return f"{env_path}/{cmd}"
    if cmd.startswith("tensorboard"):
        return f"{env_path}/{cmd}"
    return cmd

def run_step(step_name, cmd, cwd=None):
    print(f"\n{'-'*60}")
    print(f"▶️ สเต็ปปฏิบัติการ: {step_name}")
    print(f"{'-'*60}")
    
    # Process the command to use absolute paths
    parts = cmd.split(" && ")
    new_parts = []
    for p in parts:
        if p.strip().startswith("cd "):
            new_parts.append(p)
        else:
            # Handle commands like 'python scripts/...'
            cmd_parts = p.strip().split(" ", 1)
            executable = get_env_cmd(cmd_parts[0])
            args = cmd_parts[1] if len(cmd_parts) > 1 else ""
            new_parts.append(f"{executable} {args}")
    
    final_cmd = " && ".join(new_parts)
    
    process = subprocess.Popen(final_cmd, shell=True, cwd=cwd)
    process.wait()
    
    if process.returncode != 0:
        print(f"\n❌ [ข้อผิดพลาดจังๆ] การทำงานหยุดชะงักที่ขั้นตอน: {step_name}")
        print(f"💡 คำสั่งที่รัน: {final_cmd}")
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
                "speaker": "vocalido",
                "spk_id": 0,
                "language": "en",
                "test_prefixes": ["song_01"]
            }
        ],
        "dictionaries": {
            "en": "dictionaries/english.txt"
        },
        "binary_data_dir": f"{ds_data}_bin",
        "hnsep": "world",
        "val_with_vocoder": False,
        "max_batch_size": 16,
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
    base_dir = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/training"
    os.chdir(base_dir)
    print_header()

    # 1. TensorBoard
    tb_cmd = get_env_cmd("tensorboard")
    print("📊 1. กำลังเปิดระบบบอร์ดรายงานผล (กราฟ TensorBoard)...")
    os.system(f"{tb_cmd} --logdir=DiffSinger/checkpoints --port=6006 > /dev/null 2>&1 &")
    print("   👉 ดูความคืบหน้าได้ที่: http://localhost:6006")
    time.sleep(1)

    ds_data = f"{base_dir}/DiffSinger/data/vocalido"
    bin_data = f"{base_dir}/DiffSinger/data/vocalido_bin"
    
    if os.path.exists(bin_data) and len(os.listdir(bin_data)) > 0:
        print("✅ พบฐานข้อมูลเดิม (Binarized Data) แล้ว! ข้ามขั้นตอนเตรียมข้อมูล...")
    else:
        dataset_dir = f"{ds_data}/wavs"
        if not os.path.exists(dataset_dir):
            print(f"❌ ไม่พบโฟลเดอร์ Dataset ที่ {dataset_dir}")
            sys.exit(1)
            
        print(f"🎤 ตรวจพบไฟล์เสียงต้นฉบับที่: {dataset_dir}")
        
        run_step("2. โหลด MFA Models", 
                 "mfa model download dictionary english_mfa && mfa model download acoustic english_mfa")

        textgrids_dir = f"{ds_data}/textgrids"
        os.makedirs(textgrids_dir, exist_ok=True)
        run_step("3. Alignment", 
                 f"mfa align {dataset_dir} english_mfa english_mfa {textgrids_dir} --clean -j 4")
        
        generate_transcriptions_csv(textgrids_dir, f"{ds_data}/transcriptions.csv")
        create_config(ds_data)
        
        run_step("4. Binarization", 
                 "cd DiffSinger && python scripts/binarize.py --config usr/configs/vocalido.yaml")

    create_config(ds_data)

    # 5. Train
    print("\n" + "🔥"*25)
    print("เข้าสู่การเทรน AI 🚀")
    print("🔥"*25 + "\n")
    
    os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
    run_step("5. เริ่มการเทรน AI", 
             "cd DiffSinger && python scripts/train.py --config usr/configs/vocalido.yaml --exp_name vocalido_v1")

if __name__ == "__main__":
    main()
