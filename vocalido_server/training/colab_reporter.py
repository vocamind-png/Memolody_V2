"""
Vocalido Colab Reporter — ใส่ cell นี้ใน Google Colab Notebook
แล้วเรียก reporter.start_training() ก่อนเริ่มเทรน

วิธีใช้:
1. รัน server ที่บ้านก่อน: python main.py (port 5001)
2. ติดตั้ง ngrok หรือใช้ ngrok ใน Colab  
3. ใส่ SERVER_URL = URL จาก ngrok เช่น https://xxxx.ngrok-free.app
4. เรียก reporter.update(...) ในแต่ละ training callback
"""

import requests
import time
import threading
import os

# ════════════════════════════════════════════════════════════════════════
# CONFIG — แก้ตรงนี้เท่านั้น!
# ════════════════════════════════════════════════════════════════════════
SERVER_URL = "https://YOUR_NGROK_URL_HERE"  # ← เอา URL จาก ngrok มาใส่
# หรือถ้าเปิด port forward ไปยัง IP บ้าน:
# SERVER_URL = "http://YOUR_HOME_IP:5001"
# ════════════════════════════════════════════════════════════════════════


class ColabReporter:
    """Push training progress from Colab → Memolody Server"""

    def __init__(self, server_url=SERVER_URL):
        self.url = server_url.rstrip("/")
        self._hb_thread = None
        self._running = False

    def _post(self, endpoint, payload):
        try:
            r = requests.post(f"{self.url}{endpoint}", json=payload, timeout=10)
            return r.ok
        except Exception as e:
            print(f"[Reporter] ⚠️ Could not reach server: {e}")
            return False

    def update(self,
               status=None, project_pct=None, training_pct=None,
               phase_id=None, phase_status=None, phase_pct=None, phase_detail=None,
               gpu_active=None, est_cost=None, log=None):
        """Send a single update to the server"""
        payload = {}
        if status:           payload["status"] = status
        if project_pct is not None: payload["projectPct"] = project_pct
        if training_pct is not None: payload["trainingPct"] = training_pct
        if gpu_active is not None: payload["gpu_active"] = gpu_active
        if est_cost is not None: payload["est_cost_usd"] = est_cost
        if log: payload["log_line"] = log

        # Phase update
        if phase_id:
            payload["phases"] = {
                phase_id: {
                    "s": phase_status or "active",
                    "p": phase_pct or 0,
                    "d": phase_detail or ""
                }
            }

        ok = self._post("/training/update", payload)
        if ok:
            print(f"[Reporter] 📡 Pushed: {status or 'heartbeat'} — {training_pct or 0:.0f}%")

    def start_heartbeat(self, interval=30):
        """Background thread sends heartbeat every N seconds"""
        self._running = True
        def _hb():
            while self._running:
                self._post("/training/update", {"log_line": "❤️ Colab heartbeat"})
                time.sleep(interval)
        self._hb_thread = threading.Thread(target=_hb, daemon=True)
        self._hb_thread.start()
        print(f"[Reporter] 💓 Heartbeat started (every {interval}s)")

    def stop_heartbeat(self):
        self._running = False

    # ── Pre-built phase helpers ──────────────────────────────────────────

    def phase_install(self, pct, detail=""):
        self.update(status="preparing", phase_id="install", phase_status="active" if pct < 100 else "completed", phase_pct=pct, phase_detail=detail, training_pct=pct * 0.05, project_pct=25 + pct * 0.05)

    def phase_data(self, pct, detail=""):
        self.update(status="preparing", phase_id="data", phase_status="active" if pct < 100 else "completed", phase_pct=pct, phase_detail=detail, training_pct=5 + pct * 0.05, project_pct=26 + pct * 0.05)

    def phase_align(self, pct, detail=""):
        self.update(status="training", phase_id="align", phase_status="active" if pct < 100 else "completed", phase_pct=pct, phase_detail=detail, training_pct=10 + pct * 0.10, project_pct=27 + pct * 0.10)

    def phase_preprocess(self, pct, detail=""):
        self.update(status="training", phase_id="preprocess", phase_status="active" if pct < 100 else "completed", phase_pct=pct, phase_detail=detail, training_pct=20 + pct * 0.10, project_pct=31 + pct * 0.10)

    def phase_train_dur(self, epoch, total_epoch, loss):
        pct = int(epoch / total_epoch * 100)
        self.update(status="training", phase_id="train_dur", phase_status="active" if pct < 100 else "completed",
                    phase_pct=pct, phase_detail=f"Epoch {epoch}/{total_epoch} — Loss: {loss:.4f}",
                    training_pct=30 + pct * 0.15, project_pct=36 + pct * 0.10, gpu_active=True)

    def phase_train_pitch(self, epoch, total_epoch, loss):
        pct = int(epoch / total_epoch * 100)
        self.update(status="training", phase_id="train_pitch", phase_status="active" if pct < 100 else "completed",
                    phase_pct=pct, phase_detail=f"Epoch {epoch}/{total_epoch} — Loss: {loss:.4f}",
                    training_pct=45 + pct * 0.15, project_pct=46 + pct * 0.10, gpu_active=True)

    def phase_train_acoustic(self, epoch, total_epoch, loss):
        pct = int(epoch / total_epoch * 100)
        self.update(status="training", phase_id="train_acou", phase_status="active" if pct < 100 else "completed",
                    phase_pct=pct, phase_detail=f"Epoch {epoch}/{total_epoch} — Loss: {loss:.4f}",
                    training_pct=60 + pct * 0.25, project_pct=56 + pct * 0.20, gpu_active=True)

    def phase_export(self, pct, detail="Exporting ONNX..."):
        self.update(status="exporting", phase_id="export", phase_status="active" if pct < 100 else "completed",
                    phase_pct=pct, phase_detail=detail, training_pct=90 + pct * 0.05, project_pct=90 + pct * 0.05)

    def done(self):
        self.update(status="done", project_pct=100, training_pct=100, gpu_active=False,
                    phase_id="verify", phase_status="completed", phase_pct=100, phase_detail="🎉 All done!",
                    log="✅ Training completed successfully!")
        self.stop_heartbeat()
        print("[Reporter] 🎉 Training complete! Dashboard updated.")


# ── Global instance ──────────────────────────────────────────────────────────
reporter = ColabReporter()


# ════════════════════════════════════════════════════════════════════════════════
# USAGE EXAMPLE FOR COLAB NOTEBOOK CELLS:
# ════════════════════════════════════════════════════════════════════════════════
"""
# Cell 1 — Setup Reporter
SERVER_URL = "https://xxxx.ngrok-free.app"  # จาก ngrok
reporter.url = SERVER_URL
reporter.start_heartbeat(interval=30)

# Cell 2 — After MFA alignment
reporter.phase_align(100, "78/78 files aligned ✓")

# Cell 3 — During DiffSinger training loop (ใส่ใน training callback)
for epoch in range(1, 1001):
    # ... your training code ...
    if epoch % 10 == 0:
        reporter.phase_train_acoustic(epoch, 1000, loss=current_loss)

# Cell 4 — After export
reporter.phase_export(100, "5 ONNX models exported")
reporter.done()
"""
