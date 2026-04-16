"""
Vocalido Training Progress Reporter
====================================
ใส่ Code นี้ไว้เป็น Cell แรกใน Colab notebook
แล้วเรียก report_progress() ทุกครั้งที่ขั้นตอนเปลี่ยน

Dashboard จะ poll ไฟล์ progress.json จาก Google Drive
หรือ Colab จะแสดง progress bar ในตัวเอง
"""
import json, time, os
from datetime import datetime

# ── Progress State ──
_progress = {
    "phases": {},
    "losses": [],
    "heartbeat": True,
    "start_time": None,
    "last_update": None,
}

PHASES = [
    ("install",     "📦 Install DiffSinger",      5),
    ("data",        "📂 Upload Dataset",           5),
    ("align",       "🔤 Phoneme Alignment",       10),
    ("preprocess",  "⚙️ Preprocessing",           10),
    ("train_dur",   "⏱️ Train Duration Model",    15),
    ("train_pitch", "🎵 Train Pitch Model",       15),
    ("train_acou",  "🧠 Train Acoustic Model",    25),
    ("vocoder",     "🔊 Setup Vocoder",            5),
    ("export",      "📤 Export ONNX",              5),
    ("verify",      "✅ Verify & Download",        5),
]

PROGRESS_FILE = "/content/drive/MyDrive/vocalido_progress.json"


def init_training():
    """Call this at the start of training"""
    global _progress
    _progress["start_time"] = datetime.now().isoformat()
    for phase_id, name, weight in PHASES:
        _progress["phases"][phase_id] = {
            "status": "pending",
            "progress": 0,
            "detail": "",
            "name": name,
        }
    _save_progress()
    print("=" * 60)
    print("🎤 Vocalido DiffSinger Training — Progress Tracker")
    print("=" * 60)
    print(f"Started: {_progress['start_time']}")
    print(f"Phases: {len(PHASES)}")
    print()


def update_phase(phase_id, status="active", progress=0, detail=""):
    """Update a phase's status and progress
    
    Args:
        phase_id: One of the PHASE IDs
        status: 'pending', 'active', 'completed', 'error'
        progress: 0-100
        detail: Description string
    """
    if phase_id not in _progress["phases"]:
        return
    
    p = _progress["phases"][phase_id]
    p["status"] = status
    p["progress"] = min(100, progress)
    p["detail"] = detail
    _progress["last_update"] = datetime.now().isoformat()
    _progress["heartbeat"] = True
    
    # Calculate overall progress
    total_weight = sum(w for _, _, w in PHASES)
    completed_weight = 0
    for pid, _, w in PHASES:
        ps = _progress["phases"][pid]
        if ps["status"] == "completed":
            completed_weight += w
        elif ps["status"] == "active":
            completed_weight += w * (ps["progress"] / 100)
    overall = int(completed_weight / total_weight * 100)
    
    # Print progress bar
    bar_len = 40
    filled = int(bar_len * overall / 100)
    bar = "█" * filled + "░" * (bar_len - filled)
    
    phase_name = p.get("name", phase_id)
    icon = "✅" if status == "completed" else "🔄" if status == "active" else "❌" if status == "error" else "⏳"
    
    print(f"\r{icon} [{bar}] {overall}% | {phase_name}: {detail}", end="")
    if status in ("completed", "error"):
        print()  # newline after completion
    
    _save_progress()


def add_loss(loss_value):
    """Track training loss values"""
    _progress["losses"].append(float(loss_value))
    _save_progress()


def _save_progress():
    """Save progress to Google Drive (accessible from Dashboard)"""
    try:
        # Try to save to Google Drive
        os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
        with open(PROGRESS_FILE, "w") as f:
            json.dump(_progress, f, indent=2)
    except Exception:
        # Fallback: save locally
        with open("/tmp/vocalido_progress.json", "w") as f:
            json.dump(_progress, f, indent=2)


def get_progress():
    """Get current progress as dict"""
    return _progress.copy()


# ── Training Callback for PyTorch Lightning ──
class VocalidoProgressCallback:
    """Use this as a training callback to auto-report epoch progress"""
    
    def __init__(self, phase_id, total_epochs):
        self.phase_id = phase_id
        self.total_epochs = total_epochs
        self.start_time = time.time()
    
    def on_epoch_end(self, epoch, loss):
        pct = int((epoch + 1) / self.total_epochs * 100)
        elapsed = time.time() - self.start_time
        eta = (elapsed / (epoch + 1)) * (self.total_epochs - epoch - 1)
        eta_str = f"{eta/60:.0f}min" if eta > 60 else f"{eta:.0f}s"
        
        detail = f"Epoch {epoch+1}/{self.total_epochs} — Loss: {loss:.4f} — ETA: {eta_str}"
        update_phase(self.phase_id, "active", pct, detail)
        add_loss(loss)
        
        # Stall detection: if loss hasn't improved in 50 epochs, warn
        if len(_progress["losses"]) > 50:
            recent = _progress["losses"][-50:]
            if min(recent) >= _progress["losses"][-51] * 0.999:
                print(f"\n⚠️ WARNING: Loss hasn't improved in 50 epochs! Consider early stopping.")


# ── Convenience functions ──
def phase_start(phase_id, detail="Starting..."):
    update_phase(phase_id, "active", 0, detail)

def phase_done(phase_id, detail="Done"):
    update_phase(phase_id, "completed", 100, detail)

def phase_error(phase_id, detail="Error"):
    update_phase(phase_id, "error", 0, detail)


# ── Example usage ──
if __name__ == "__main__":
    init_training()
    
    # Simulate
    import time as _t
    phase_start("install", "Installing dependencies...")
    for i in range(0, 101, 20):
        update_phase("install", "active", i, f"Step {i//20}/5")
        _t.sleep(0.3)
    phase_done("install", "All dependencies installed")
    
    phase_start("train_acou", "Starting acoustic training...")
    cb = VocalidoProgressCallback("train_acou", 100)
    for e in range(100):
        loss = 0.8 * (0.97 ** e) + 0.05
        cb.on_epoch_end(e, loss)
        _t.sleep(0.05)
    phase_done("train_acou", f"Final loss: {loss:.4f}")
    
    print("\n✅ Simulation complete!")
