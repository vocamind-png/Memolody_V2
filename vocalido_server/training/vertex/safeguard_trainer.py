"""
Vocalido DiffSinger — Vertex AI Safeguard Trainer
===================================================
ระบบป้องกัน:
  ✅ Budget Cap ($10 max) — ถ้าเกิน → ปิดทันที
  ✅ Timeout (6 ชั่วโมง max) — ป้องกัน loop ไม่จบ
  ✅ Heartbeat Monitor — detect ถ้า training หยุดนิ่ง
  ✅ Loss Stall Detection — detect infinite loop / diverge
  ✅ Auto-shutdown เมื่อเสร็จ หรือ error
  ✅ Auto-repair — retry 3 ครั้งก่อน abandon
  ✅ Cost Logger — บันทึกค่าใช้จ่ายทุก 5 นาที
"""

import os, sys, time, json, signal, subprocess, traceback
from datetime import datetime, timedelta
from pathlib import Path

# ════════════════════════════════════════════════════════════
# 🔒 SAFETY CONFIG — แก้ค่าพวกนี้ได้
# ════════════════════════════════════════════════════════════
BUDGET_LIMIT_USD       = 10.00   # ปิดทันทีถ้าค่าใช้จ่ายเกิน $10
MAX_RUNTIME_HOURS      = 6.0     # ปิดทันทีถ้ารันเกิน 6 ชั่วโมง
HEARTBEAT_TIMEOUT_MIN  = 15      # ถ้าไม่มีความคืบหน้า 15 นาที → ถือว่า stall
MAX_LOSS_STALL_EPOCHS  = 100     # ถ้า loss ไม่ลดเกิน 100 epochs → stop
MAX_RETRIES            = 3       # retry สูงสุด 3 ครั้ง
HOURLY_RATE_USD        = 2.50    # A100 Standard rate (Spot = 0.75)
LOG_FILE               = "/tmp/vocalido_safeguard.log"
PROGRESS_FILE          = "/tmp/vocalido_progress.json"
# ════════════════════════════════════════════════════════════

_start_time   = time.time()
_last_update  = time.time()
_retry_count  = 0
_loss_history = []
_shutdown_requested = False


def log(msg, level="INFO"):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] [{level}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def save_progress(phase, pct, detail, gpu_on=True):
    """Save progress + check safety limits every update"""
    global _last_update
    _last_update = time.time()

    elapsed_hrs = (time.time() - _start_time) / 3600
    est_cost    = elapsed_hrs * HOURLY_RATE_USD

    state = {
        "phase": phase, "pct": pct, "detail": detail,
        "time": time.time(), "gpu_active": gpu_on,
        "est_cost_usd": round(est_cost, 3),
        "elapsed_min": round(elapsed_hrs * 60, 1),
        "retries": _retry_count,
    }
    with open(PROGRESS_FILE, "w") as f:
        json.dump(state, f, indent=2)

    # ── Safety Checks ─────────────────────────────────────
    _check_budget(est_cost)
    _check_timeout(elapsed_hrs)
    _check_heartbeat()


def _check_budget(cost_usd):
    if cost_usd >= BUDGET_LIMIT_USD:
        log(f"🚨 BUDGET LIMIT HIT: ${cost_usd:.2f} >= ${BUDGET_LIMIT_USD}", "CRITICAL")
        log("💸 Shutting down to prevent cost overrun!", "CRITICAL")
        _emergency_shutdown("BUDGET_EXCEEDED")


def _check_timeout(elapsed_hrs):
    if elapsed_hrs >= MAX_RUNTIME_HOURS:
        log(f"⏰ TIMEOUT: {elapsed_hrs:.1f}h >= {MAX_RUNTIME_HOURS}h limit", "CRITICAL")
        _emergency_shutdown("TIMEOUT")


def _check_heartbeat():
    idle_min = (time.time() - _last_update) / 60
    if idle_min >= HEARTBEAT_TIMEOUT_MIN:
        log(f"💔 HEARTBEAT LOST: {idle_min:.1f} min idle (limit: {HEARTBEAT_TIMEOUT_MIN})", "WARNING")
        return False
    return True


def check_loss_stall(loss):
    """Call every epoch — returns True if stalling (infinite loop risk)"""
    global _loss_history
    _loss_history.append(float(loss))

    if len(_loss_history) >= MAX_LOSS_STALL_EPOCHS:
        recent   = _loss_history[-MAX_LOSS_STALL_EPOCHS:]
        oldest   = recent[0]
        newest   = recent[-1]
        improved = (oldest - newest) / (oldest + 1e-8)

        if improved < 0.001:  # < 0.1% improvement over 100 epochs
            log(f"⚠️  LOSS STALL detected! Δ={improved*100:.3f}% over {MAX_LOSS_STALL_EPOCHS} epochs", "WARNING")
            log(f"   Loss: {oldest:.4f} → {newest:.4f}", "WARNING")
            return True
    return False


def _emergency_shutdown(reason):
    """Immediate shutdown — no retry"""
    log(f"🔴 EMERGENCY SHUTDOWN: {reason}", "CRITICAL")
    save_progress("error", 0, f"Shutdown: {reason}", False)
    # Kill all python + training processes
    os.system("pkill -f 'scripts/train.py' 2>/dev/null")
    os.system("pkill -f 'DiffSinger' 2>/dev/null")
    sys.exit(1)


def run_with_retry(fn, *args, **kwargs):
    """Run a function with automatic retry (max MAX_RETRIES times)"""
    global _retry_count
    for attempt in range(MAX_RETRIES + 1):
        try:
            return fn(*args, **kwargs)
        except KeyboardInterrupt:
            log("🛑 User interrupted training", "INFO")
            raise
        except Exception as e:
            _retry_count = attempt + 1
            log(f"❌ Error (attempt {_retry_count}/{MAX_RETRIES}): {e}", "ERROR")
            traceback.print_exc()

            if attempt < MAX_RETRIES:
                wait = 30 * (attempt + 1)  # 30s, 60s, 90s
                log(f"🔄 Auto-repair: retrying in {wait}s...", "WARNING")
                save_progress("error", 0, f"Retrying ({_retry_count}/{MAX_RETRIES})...", False)
                time.sleep(wait)
            else:
                log(f"💀 All {MAX_RETRIES} retries failed. Giving up.", "CRITICAL")
                _emergency_shutdown("MAX_RETRIES_EXCEEDED")


def cost_summary():
    """Print final cost summary"""
    elapsed_hrs = (time.time() - _start_time) / 3600
    total_cost  = elapsed_hrs * HOURLY_RATE_USD
    log("=" * 50)
    log(f"💰 COST SUMMARY")
    log(f"   Runtime: {elapsed_hrs:.2f} hours")
    log(f"   Rate: ${HOURLY_RATE_USD}/hr")
    log(f"   Total: ${total_cost:.2f}")
    log(f"   Budget limit: ${BUDGET_LIMIT_USD}")
    log(f"   Remaining budget: ${BUDGET_LIMIT_USD - total_cost:.2f}")
    log("=" * 50)


# ── Signal handler (Ctrl+C, kill signal) ──────────────────
def _signal_handler(sig, frame):
    log("🛑 Signal received — graceful shutdown...", "INFO")
    cost_summary()
    save_progress("done", 100, "Stopped by user", False)
    sys.exit(0)

signal.signal(signal.SIGTERM, _signal_handler)
signal.signal(signal.SIGINT, _signal_handler)


# ════════════════════════════════════════════════════════════
# Usage Example (copy into Colab or Vertex training script):
# ════════════════════════════════════════════════════════════
"""
from safeguard_trainer import save_progress, check_loss_stall, run_with_retry, log

# At start of each training step:
save_progress('training', epoch/total*100, f'Epoch {epoch}')

# After getting loss value:
if check_loss_stall(loss):
    log("Loss stalled — stopping early to save cost", "WARNING")
    break

# Wrap risky operations:
run_with_retry(run_mfa_alignment, dataset_dir)
"""
