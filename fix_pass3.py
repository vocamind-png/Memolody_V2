with open('vocalido_server/ds_engine.py', 'r') as f:
    content = f.read()

old_pass3 = """        # ── Pass 3: build f0_seq ALIGNED to ph_dur + smooth boundaries ────────
        f0_seq = []
        ph_frames = []
        for d, hz in zip(ph_dur, ph_hz):
            n_frames = max(1, round(d / f0_timestep))
            f0_seq.extend([hz] * n_frames)
            ph_frames.append(n_frames)

        PORTA_FRAMES = 4
        f0_arr = np.array(f0_seq, dtype=np.float32)
        frame_idx = 0
        for pi, (nf, hz) in enumerate(zip(ph_frames, ph_hz)):
            if pi > 0 and hz > 0.0 and ph_hz[pi-1] > 0.0 and hz != ph_hz[pi-1]:
                prev_hz = ph_hz[pi-1]
                ramp = min(PORTA_FRAMES, nf)
                f0_arr[frame_idx:frame_idx+ramp] = np.linspace(prev_hz, hz, ramp)
            frame_idx += nf

        RAMP = 5
        for i in range(1, len(f0_arr)):
            prev, cur = f0_arr[i-1], f0_arr[i]
            if prev == 0.0 and cur > 0.0:
                end = min(i + RAMP, len(f0_arr))
                f0_arr[i:end] = np.linspace(cur * 0.15, cur, end - i)
            elif prev > 0.0 and cur == 0.0:
                start = max(0, i - RAMP)
                f0_arr[start:i] = np.linspace(prev, prev * 0.15, i - start)"""

new_pass3 = """        # ── Pass 3: build f0_seq ALIGNED to ph_dur_frames + smooth boundaries ────────
        f0_seq = []
        ph_frames = []
        for n_frames, hz in zip(ph_dur_frames, ph_hz):
            f0_seq.extend([hz] * n_frames)
            ph_frames.append(n_frames)

        # The user wants almost 0 pitch sliding (no gliss/bender)
        PORTA_FRAMES = 1
        f0_arr = np.array(f0_seq, dtype=np.float32)
        frame_idx = 0
        for pi, (nf, hz) in enumerate(zip(ph_frames, ph_hz)):
            if pi > 0 and hz > 0.0 and ph_hz[pi-1] > 0.0 and hz != ph_hz[pi-1]:
                prev_hz = ph_hz[pi-1]
                ramp = min(PORTA_FRAMES, nf)
                if ramp > 0:
                    f0_arr[frame_idx:frame_idx+ramp] = np.linspace(prev_hz, hz, ramp)
            frame_idx += nf

        # Removed the RAMP logic completely to eliminate the pitch bender from silence.
        # RAMP = 0 effectively"""

import re
start_idx = content.find('# ── Pass 3:')
end_idx = content.find('# ── Note-Level')
if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + new_pass3 + "\n\n        " + content[end_idx:]
    with open('vocalido_server/ds_engine.py', 'w') as f:
        f.write(new_content)
    print("Fixed Pass 3")
else:
    print("Could not find Pass 3 boundaries.")
