import os
import re
import numpy as np
import onnxruntime as ort
from typing import Optional, List
try:
    import yaml
except ImportError:
    yaml = None

# Try importing the dictionaries from the main ds_engine
try:
    from ds_engine import SOLFEGE_MAP, JIANPU_NUM_PHONEMES, PINYIN_MAP, _VALID_PHONEMES, _arpabet_to_phoneme, _get_g2p
except ImportError:
    # Fallback or stub if needed, but it should be available
    pass

class DiffSingerONNXEngine:
    def __init__(self, model_dir, language='en'):
        self.model_dir = model_dir
        self.language = language
        self._ready = False
        self.sr = 44100
        
        # Look for acoustic.onnx
        self.acoustic_path = None
        for root, dirs, files in os.walk(model_dir):
            if "acoustic.onnx" in files:
                self.acoustic_path = os.path.join(root, "acoustic.onnx")
                break
                
        # Look for vocoder (.onnx) — search dsvocoder/ for any .onnx file
        self.vocoder_path = None
        search_dirs = [model_dir, os.path.dirname(model_dir)]
        for sdir in search_dirs:
            for root, dirs, files in os.walk(sdir):
                # Prefer files in a dsvocoder directory
                if os.path.basename(root) == 'dsvocoder':
                    for f in files:
                        if f.endswith('.onnx'):
                            self.vocoder_path = os.path.join(root, f)
                            break
                if self.vocoder_path:
                    break
            if self.vocoder_path:
                break
        # Fallback: look for vocoder.onnx or aidolgan.onnx anywhere
        if not self.vocoder_path:
            for sdir in search_dirs:
                for root, dirs, files in os.walk(sdir):
                    for fname in ['aidolgan.onnx', 'vocoder.onnx']:
                        if fname in files:
                            self.vocoder_path = os.path.join(root, fname)
                            break
                    if self.vocoder_path:
                        break
                if self.vocoder_path:
                    break
                
        if not self.acoustic_path or not self.vocoder_path:
            print(f"[ONNXEngine] ❌ Missing acoustic or vocoder ONNX in {model_dir}")
            return
            
        print(f"[ONNXEngine] Loading acoustic: {self.acoustic_path}")
        print(f"[ONNXEngine] Loading vocoder: {self.vocoder_path}")
        try:
            # Prioritize CUDA Execution Provider for GPU acceleration (RunPod)
            providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
            self.sess_acoustic = ort.InferenceSession(self.acoustic_path, providers=providers)
            self.sess_vocoder = ort.InferenceSession(self.vocoder_path, providers=providers)
        except Exception as e:
            print(f"[ONNXEngine] ❌ Failed to load ONNX session: {e}")
            return
            
        # Load phonemes.txt (Token map)
        self.phoneme_to_id = {}
        ph_path = os.path.join(os.path.dirname(self.acoustic_path), "phonemes.txt")
        if os.path.exists(ph_path):
            with open(ph_path, "r", encoding="utf-8") as f:
                for i, line in enumerate(f):
                    parts = line.strip().split()
                    if not parts:
                        continue
                    if len(parts) >= 2:
                        self.phoneme_to_id[parts[0]] = int(parts[1])
                    else:
                        self.phoneme_to_id[parts[0]] = i
        else:
            print(f"[ONNXEngine] ⚠️ Warning: phonemes.txt not found in {os.path.dirname(self.acoustic_path)}")
            # Fallback simple list? Hard to guess.
            
        # Load dictionary.txt (Word to Phonemes)
        self.dict_map = {}
        dict_path = os.path.join(os.path.dirname(self.acoustic_path), "dictionary.txt")
        if not os.path.exists(dict_path):
            dict_path = os.path.join(model_dir, "dictionary.txt")
        if os.path.exists(dict_path):
            with open(dict_path, "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 2:
                        word = parts[0].lower()
                        self.dict_map[word] = parts[1:]
        
        # Load speaker embeddings
        self.spk_embeds = {}
        self.default_spk_embed = None
        search_embed_dirs = [
            os.path.join(os.path.dirname(self.acoustic_path), "embeds", "acoustic"),  # Lotte V layout
            os.path.join(model_dir, "embeds", "acoustic"),
            os.path.dirname(self.acoustic_path),  # Flat layout (CANARY, TIGER — .emb next to acoustic.onnx)
        ]
        for embeds_dir in search_embed_dirs:
            if os.path.exists(embeds_dir):
                for f in os.listdir(embeds_dir):
                    if f.endswith(".emb"):
                        name = f[:-4].lower()
                        emb_path = os.path.join(embeds_dir, f)
                        try:
                            emb_data = np.fromfile(emb_path, dtype=np.float32)
                            self.spk_embeds[name] = emb_data
                            print(f"[ONNXEngine] Loaded speaker embed '{name}': {emb_path}")
                        except Exception as e:
                            print(f"[ONNXEngine] Failed to load {emb_path}: {e}")
                            
        # Set default_spk_embed (prefer 'root' if exists, otherwise first loaded)
        if "root" in self.spk_embeds:
            self.default_spk_embed = self.spk_embeds["root"]
        elif self.spk_embeds:
            self.default_spk_embed = list(self.spk_embeds.values())[0]
        # Load dsconfig.yaml for model parameters (depth, sample_rate, etc.)
        self.max_depth = 1.0  # default
        self.diffusion_steps = 100
        for config_name in ['dsconfig.yaml', 'config.yaml']:
            for search_root in [model_dir, os.path.dirname(model_dir)]:
                cfg_path = os.path.join(search_root, config_name)
                if os.path.exists(cfg_path) and yaml:
                    try:
                        with open(cfg_path, 'r') as cf:
                            cfg = yaml.safe_load(cf)
                        if cfg:
                            if 'max_depth' in cfg:
                                self.max_depth = float(cfg['max_depth'])
                            if 'sample_rate' in cfg:
                                self.sr = int(cfg['sample_rate'])
                            print(f"[ONNXEngine] 📋 Config: max_depth={self.max_depth}, sr={self.sr} (from {cfg_path})")
                            break
                    except Exception as e:
                        print(f"[ONNXEngine] ⚠️ Failed to load config {cfg_path}: {e}")

        self._ready = True
        print(f"[ONNXEngine] ✅ Engine Loaded Successfully!")

    @property
    def is_ready(self):
        return self._ready

    def lyric_to_phonemes_en(self, lyric: str) -> List[str]:
        word = lyric.lower().strip()
        clean_word = re.sub(r'[.,?!:;\-\(\)\[\]"\']', '', word)
        
        thai_map = {
            "โด": "do", "เร": "re", "มี": "mi", "ฟา": "fa", 
            "ซอล": "sol", "โซล": "sol", "ลา": "la", "ที": "ti"
        }
        if clean_word in thai_map:
            clean_word = thai_map[clean_word]

        if clean_word in self.dict_map:
            return self.dict_map[clean_word]

        if clean_word in SOLFEGE_MAP:
            return SOLFEGE_MAP[clean_word].split()

        g2p = _get_g2p()
        if g2p is not None:
            try:
                tokens = g2p(clean_word)
                phonemes = []
                for t in tokens:
                    if t == " ":
                        continue
                    ph = _arpabet_to_phoneme(t)
                    if ph:
                        phonemes.append(ph)
                if phonemes:
                    return phonemes
            except Exception:
                pass
                
        return ["ah"]

    def lyric_to_phonemes_zh(self, lyric: str) -> List[str]:
        word = lyric.strip().lower()
        if word.upper() in ("SP", "AP"):
            return [word.upper()]
        # Supports chromatically altered numerals like #1, b2, etc.
        digit_match = re.search(r"[1-7]", word)
        if digit_match:
            digit = digit_match.group(0)
            if digit in JIANPU_NUM_PHONEMES:
                return JIANPU_NUM_PHONEMES[digit]
        if word in PINYIN_MAP:
            return PINYIN_MAP[word].split()
        for k in sorted(PINYIN_MAP.keys(), key=len, reverse=True):
            if word.startswith(k):
                return PINYIN_MAP[k].split()
        return ["a"]

    def synthesize_phrase(self, notes, params=None):
        if not self._ready:
            return None

        params = params or {}
        bpm = float(params.get("bpm", 120.0))
        beat_sec = 60.0 / bpm
        return_stems = str(params.get("return_stems", "false")).lower() == "true"
        
        # Sort notes chronologically by startTime to ensure voice allocation works correctly
        sorted_notes = sorted(notes, key=lambda x: float(x.get("startTime", 0.0)))
        tracks = []
        for n in sorted_notes:
            start = float(n.get("startTime", 0.0)) * beat_sec
            dur   = max(0.05, float(n.get("duration", 0.5)) * beat_sec)
            
            placed = False
            for track in tracks:
                if not track:
                    track.append((start, dur, n))
                    placed = True
                    break
                last_end = track[-1][0] + track[-1][1]
                if start >= last_end - 0.01:
                    track.append((start, dur, n))
                    placed = True
                    break
            if not placed:
                tracks.append([(start, dur, n)])

        all_audio = []
        for track in tracks:
            audio = self._synthesize_track(track, params)
            if audio is not None:
                all_audio.append(audio)

        if not all_audio:
            if return_stems:
                return None, []
            return None

        max_len = max(len(a) for a in all_audio)
        out_mixed = np.zeros(max_len, dtype=np.float32)
        for a in all_audio:
            out_mixed[:len(a)] += a

        if len(tracks) > 1:
            peak = np.max(np.abs(out_mixed))
            if peak > 1.0:
                out_mixed = out_mixed / peak * 0.95

        if return_stems:
            return out_mixed, all_audio
        return out_mixed

    def _synthesize_track(self, track_notes, params):
        hop_size = 512
        frame_sec = hop_size / self.sr
        
        # Minimal initial SP for clean DiffSinger onset — kept as small as possible
        # to minimize timing offset between vocal audio and MIDI playback
        initial_sp_sec = 0.02  # 20ms — just enough for onset, was 100ms causing delay
        initial_sp_frames = max(1, round(initial_sp_sec / frame_sec))
        
        ph_list = ["SP"]
        ph_dur_frames = [initial_sp_frames]
        ph_f0 = [0.0]  # one F0 per phoneme slot, expanded later
        
        for i, (start, dur, note) in enumerate(track_notes):
            # Silence before note — compute from absolute target position to avoid drift
            # Account for initial SP offset: audio sample 0 = time -initial_sp_sec
            # so the note at time `start` should appear at frame (start + initial_sp_sec) / frame_sec
            target_frames_total = round((start + initial_sp_sec) / frame_sec)
            current_frames_total = sum(ph_dur_frames)
            if target_frames_total > current_frames_total:
                sil_frames = target_frames_total - current_frames_total
                if sil_frames > 0:
                    ph_list.append("SP")
                    ph_dur_frames.append(sil_frames)
                    ph_f0.append(0.0)
            
            # Phonemes
            lyric = note.get("lyric", "doh")
            if self.language == 'zh':
                phonemes = self.lyric_to_phonemes_zh(lyric)
            else:
                phonemes = self.lyric_to_phonemes_en(lyric)
                
            note_frames = round(dur / frame_sec)
            if note_frames < 2:
                note_frames = 2
                
            midi = float(note.get("midi") or note.get("pitch", 60))
            f0_val = 440.0 * (2.0 ** ((midi - 69.0) / 12.0))
            
            if i < 5 or i == len(track_notes) - 1:
                print(f"[ONNXEngine] Note {i}: lyric='{lyric}' midi={midi} f0={f0_val:.1f}Hz ph={phonemes} frames={note_frames}")
            
            if len(phonemes) == 1:
                ph_list.append(phonemes[0])
                ph_dur_frames.append(note_frames)
                ph_f0.append(f0_val)
            else:
                consonant_frames = min(int(0.05 / frame_sec), note_frames // 2)
                vowel_frames = note_frames - consonant_frames * (len(phonemes) - 1)
                if consonant_frames < 1: consonant_frames = 1
                if vowel_frames < 1: vowel_frames = 1
                
                for pi, p in enumerate(phonemes):
                    ph_list.append(p)
                    if pi < len(phonemes) - 1:
                        ph_dur_frames.append(consonant_frames)
                    else:
                        ph_dur_frames.append(vowel_frames)
                    ph_f0.append(f0_val)
            
        ph_list.append("SP")
        ph_dur_frames.append(int(0.1 / frame_sec))
        ph_f0.append(0.0)
        
        # Expand F0 to per-frame (aligned with durations)
        f0_list = []
        for f0, nf in zip(ph_f0, ph_dur_frames):
            f0_list.extend([f0] * nf)
        
        n_frames = len(f0_list)
        
        # Debug summary
        unique_f0 = sorted(set(f for f in f0_list if f > 0))
        print(f"[ONNXEngine] Track: {len(ph_list)} phonemes, {n_frames} frames, {len(unique_f0)} unique pitches: {[f'{f:.0f}Hz' for f in unique_f0[:8]]}")
        
        # Prepare ONNX Inputs
        tokens = []
        for p in ph_list:
            if p in self.phoneme_to_id:
                tokens.append(self.phoneme_to_id[p])
            else:
                print(f"[ONNXEngine] ⚠️ Unknown phoneme '{p}', using 0")
                tokens.append(0)
                
        tokens_np = np.array([tokens], dtype=np.int64)
        durations_np = np.array([ph_dur_frames], dtype=np.int64)
        f0_np = np.array([f0_list], dtype=np.float32)
        # Formant shift / Gender control: UI goes from -6 to 6
        # A positive formant_shift in UI means lighter/more feminine voice, which translates to a negative gender in DiffSinger
        formant_val = float(params.get("formant_shift", 0.0)) if params else 0.0
        gender_val = -formant_val / 6.0  # Scale -6..6 to -1.0..1.0 range
        gender_np = np.full((1, n_frames), gender_val, dtype=np.float32)
        
        # Speed / Velocity control: UI speed ranges from 0.5 to 2.0
        speed_val = float(params.get("speed", 1.0)) if params else 1.0
        velocity_np = np.full((1, n_frames), speed_val, dtype=np.float32)
        
        input_names = [i.name for i in self.sess_acoustic.get_inputs()]
        
        inputs = {
            "tokens": tokens_np,
            "durations": durations_np,
            "f0": f0_np,
        }
        
        if "gender" in input_names: inputs["gender"] = gender_np
        if "velocity" in input_names: inputs["velocity"] = velocity_np
        if "languages" in input_names:
            inputs["languages"] = np.zeros_like(tokens_np)
        if "breathiness" in input_names:
            breath_val = float(params.get("breathiness", 0.0)) / 100.0 if params else 0.0
            inputs["breathiness"] = np.full((1, n_frames), breath_val, dtype=np.float32)
        if "voicing" in input_names:
            inputs["voicing"] = np.zeros((1, n_frames), dtype=np.float32)
        if "tension" in input_names:
            inputs["tension"] = np.zeros((1, n_frames), dtype=np.float32)
            
        if "spk_embed" in input_names: 
            # Find the input shape dim for spk_embed
            spk_embed_node = next(i for i in self.sess_acoustic.get_inputs() if i.name == "spk_embed")
            embed_dim = 256  # fallback default
            if len(spk_embed_node.shape) >= 3 and isinstance(spk_embed_node.shape[2], int):
                embed_dim = spk_embed_node.shape[2]
            elif len(spk_embed_node.shape) >= 3:
                # If shape has dynamic dimension or string representation, check loaded embedding length
                if hasattr(self, 'default_spk_embed') and self.default_spk_embed is not None:
                    embed_dim = len(self.default_spk_embed)
            
            # Retrieve from params, fallback to default
            requested_mode = params.get("vocal_mode") if params else None
            spk_embed_data = None
            if requested_mode and isinstance(requested_mode, str):
                spk_embed_data = self.spk_embeds.get(requested_mode.lower())
                if spk_embed_data is not None:
                    print(f"[ONNXEngine] Using requested vocal mode: '{requested_mode}'")
            
            if spk_embed_data is None:
                spk_embed_data = self.default_spk_embed
                
            actual_embed = np.zeros(embed_dim, dtype=np.float32)
            if spk_embed_data is not None:
                if len(spk_embed_data) == embed_dim:
                    actual_embed = spk_embed_data
                else:
                    print(f"[ONNXEngine] ⚠️ Speaker embed size mismatch: model expects {embed_dim}, got {len(spk_embed_data)}")
                    if len(spk_embed_data) < embed_dim:
                        actual_embed[:len(spk_embed_data)] = spk_embed_data
                    else:
                        actual_embed = spk_embed_data[:embed_dim]
            inputs["spk_embed"] = np.tile(actual_embed.reshape(1, 1, embed_dim), (1, n_frames, 1))
            
        if "depth" in input_names:
            depth_val = float(params.get("depth", self.max_depth)) if params else self.max_depth
            inputs["depth"] = np.array(depth_val, dtype=np.float32)
        if "steps" in input_names:
            steps_val = int(params.get("steps", 100)) if params else 100
            inputs["steps"] = np.array(steps_val, dtype=np.int64)

        try:
            mel = self.sess_acoustic.run(["mel"], inputs)[0]
            voc_inputs = { "mel": mel, "f0": f0_np }
            waveform = self.sess_vocoder.run(["waveform"], voc_inputs)[0]
            print(f"[ONNXEngine] ✅ Audio generated: {len(waveform[0])} samples, peak={np.max(np.abs(waveform[0])):.3f}")
            
            # Post-processing EQ and Reverb
            audio = waveform[0].copy().astype(np.float32)
            
            # 1. Warmth (low shelf) & Brightness (high shelf)
            warmth = float(params.get('warmth', 0.0)) if params else 0.0
            brightness = float(params.get('brightness', 0.0)) if params else 0.0
            
            from scipy import signal
            if abs(warmth) > 0.05:
                sos = signal.butter(2, 300 / (self.sr/2), btype='low', output='sos')
                low_band = signal.sosfilt(sos, audio)
                audio = audio + low_band * warmth * 0.5
                
            if abs(brightness) > 0.05:
                sos = signal.butter(2, 4000 / (self.sr/2), btype='high', output='sos')
                hi_band = signal.sosfilt(sos, audio)
                audio = audio + hi_band * brightness * 0.5
                
            # 2. Reverb
            reverb = float(params.get('reverb', 0.0)) if params else 0.0
            if reverb > 0.01:
                delays = [int(self.sr * d) for d in [0.030, 0.037, 0.041, 0.043]]
                out = audio.copy()
                for d in delays:
                    if d < len(audio):
                        padded = np.pad(audio, (d, 0))[:len(audio)]
                        out = out + padded * reverb * 0.3
                audio = out
                
            # Normalize
            peak = np.max(np.abs(audio))
            if peak > 0.001:
                audio = audio / peak * 0.90
                
            return audio
        except Exception as e:
            print(f"[ONNXEngine] ❌ Inference failed: {e}")
            import traceback
            traceback.print_exc()
            return None
