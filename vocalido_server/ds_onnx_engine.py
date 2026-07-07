import os
import re
import numpy as np

# Auto-configure CUDA/cuDNN library paths for GPU acceleration
# This ensures onnxruntime can find libcudnn.so.9 regardless of how the server was started
_cudnn_paths = [
    '/usr/local/lib/python3.11/dist-packages/nvidia/cudnn/lib',
    '/usr/local/lib/python3.11/dist-packages/nvidia/cublas/lib',
]
for _p in _cudnn_paths:
    if os.path.isdir(_p):
        _ld = os.environ.get('LD_LIBRARY_PATH', '')
        if _p not in _ld:
            os.environ['LD_LIBRARY_PATH'] = _p + ':' + _ld if _ld else _p
            # Also load via ctypes to ensure runtime linker finds them
            import ctypes
            for _lib in sorted(os.listdir(_p)):
                if _lib.endswith('.so') or '.so.' in _lib:
                    try:
                        ctypes.CDLL(os.path.join(_p, _lib), mode=ctypes.RTLD_GLOBAL)
                    except OSError:
                        pass

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
            providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
            import onnxruntime as ort
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            # Add multithreading optimization in case of CPU fallback, but primarily for CPU ops
            sess_options.intra_op_num_threads = 4
            sess_options.inter_op_num_threads = 4
            
            self.sess_acoustic = ort.InferenceSession(self.acoustic_path, sess_options=sess_options, providers=providers)
            actual_providers = self.sess_acoustic.get_providers()
            print(f"[ONNXEngine] Acoustic initialized with providers: {actual_providers}")
            
            self.sess_vocoder = ort.InferenceSession(self.vocoder_path, sess_options=sess_options, providers=providers)
            
            # Look for other ONNX models (linguistic, dur, pitch)
            self.ling_path = None
            self.dur_path = None
            self.pitch_path = None
            
            search_roots = [model_dir, os.path.dirname(model_dir)]
            for sroot in search_roots:
                for root, dirs, files in os.walk(sroot):
                    if "linguistic.onnx" in files and self.ling_path is None:
                        self.ling_path = os.path.join(root, "linguistic.onnx")
                    if "dur.onnx" in files and self.dur_path is None:
                        self.dur_path = os.path.join(root, "dur.onnx")
                    if "pitch.onnx" in files and self.pitch_path is None:
                        self.pitch_path = os.path.join(root, "pitch.onnx")
                        
            self.has_pitch_model = False
            self.sess_ling = None
            self.sess_dur = None
            self.sess_pitch = None
            
            if self.ling_path and self.dur_path and self.pitch_path:
                self.sess_ling = ort.InferenceSession(self.ling_path, sess_options=sess_options, providers=providers)
                self.sess_dur = ort.InferenceSession(self.dur_path, sess_options=sess_options, providers=providers)
                self.sess_pitch = ort.InferenceSession(self.pitch_path, sess_options=sess_options, providers=providers)
                self.has_pitch_model = True
                print(f"[ONNXEngine] Neural Pitch/Duration Models Loaded successfully!")
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

    def _get_spk_embed(self, params):
        requested_mode = params.get("vocal_mode") if params else None
        spk_embed_data = None
        if requested_mode and isinstance(requested_mode, str):
            spk_embed_data = self.spk_embeds.get(requested_mode.lower())
        if spk_embed_data is None:
            spk_embed_data = self.default_spk_embed
        return spk_embed_data

    def _synthesize_track(self, track_notes, params):
        if self.has_pitch_model:
            return self._synthesize_track_neural(track_notes, params)
        else:
            return self._synthesize_track_fallback(track_notes, params)

    def _synthesize_track_neural(self, track_notes, params):
        if len(track_notes) > 10:
            return self._synthesize_track_neural_chunked(track_notes, params)
        else:
            return self._synthesize_track_neural_single(track_notes, params)

    def _synthesize_track_neural_chunked(self, track_notes, params):
        # Group notes into phrases based on silence/gap > 0.8 seconds
        phrases = []
        current_phrase = []
        prev_end = None
        
        for start, dur, note in track_notes:
            if prev_end is not None and (start - prev_end) > 0.8:
                phrases.append(current_phrase)
                current_phrase = []
            current_phrase.append((start, dur, note))
            prev_end = start + dur
        if current_phrase:
            phrases.append(current_phrase)
            
        print(f"[ONNXEngine] 🧩 Chunked track into {len(phrases)} phrases. Rendering in parallel to speed up...")
        
        # Determine total duration and allocate track audio array
        total_dur = track_notes[-1][0] + track_notes[-1][1] + 1.0
        track_audio = np.zeros(int(total_dur * self.sr), dtype=np.float32)
        
        # Render each phrase in parallel using ThreadPoolExecutor
        from concurrent.futures import ThreadPoolExecutor
        
        def render_single_phrase(phrase):
            phrase_start = phrase[0][0]
            offset_phrase = []
            for start, dur, note in phrase:
                offset_phrase.append((start - phrase_start, dur, note))
            phrase_audio = self._synthesize_track_neural_single(offset_phrase, params)
            return phrase_start, phrase_audio

        max_workers = min(len(phrases), 8) # Up to 8 threads in parallel
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            results = list(executor.map(render_single_phrase, phrases))
            
        # Stitch the results back together
        for phrase_start, phrase_audio in results:
            if phrase_audio is not None:
                start_sample = int(max(0.0, phrase_start - 0.02) * self.sr)
                end_sample = start_sample + len(phrase_audio)
                if end_sample > len(track_audio):
                    pad_len = end_sample - len(track_audio)
                    track_audio = np.pad(track_audio, (0, pad_len))
                track_audio[start_sample:end_sample] += phrase_audio
                
        return track_audio

    def _synthesize_track_neural_single(self, track_notes, params):
        hop_size = 512
        frame_sec = hop_size / self.sr
        frame_hz = self.sr / hop_size
        SP_ID = self.phoneme_to_id.get("SP", 2)
        
        # 1. Get Speaker Embedding
        spk_embed_data = self._get_spk_embed(params)
        embed_dim = 256
        spk_embed_node = next((i for i in self.sess_acoustic.get_inputs() if i.name == "spk_embed"), None)
        if spk_embed_node:
            if len(spk_embed_node.shape) >= 3 and isinstance(spk_embed_node.shape[2], int):
                embed_dim = spk_embed_node.shape[2]
            elif len(spk_embed_node.shape) >= 3:
                if spk_embed_data is not None:
                    embed_dim = len(spk_embed_data)
        
        spk256 = np.zeros(embed_dim, dtype=np.float32)
        if spk_embed_data is not None:
            if len(spk_embed_data) == embed_dim:
                spk256 = spk_embed_data
            else:
                if len(spk_embed_data) < embed_dim:
                    spk256[:len(spk_embed_data)] = spk_embed_data
                else:
                    spk256 = spk_embed_data[:embed_dim]

        # 2. Build timing sequences
        all_tok = []
        all_ph_midi = []
        word_div = []
        word_dur_fr = []
        note_midi = []
        note_rest = []
        note_dur_fr = []

        initial_ap_sec = 0.02
        initial_ap_fr = max(1, round(initial_ap_sec * frame_hz))
        
        all_tok.append(SP_ID)
        all_ph_midi.append(0)
        word_div.append(1)
        word_dur_fr.append(initial_ap_fr)
        note_midi.append(0.0)
        note_rest.append(True)
        note_dur_fr.append(initial_ap_fr)
        
        prev_end = -initial_ap_sec

        for i, (start, dur, note) in enumerate(track_notes):
            gap = start - prev_end
            if gap > 0.02:
                gap_fr = max(2, round(gap * frame_hz))
                all_tok.append(SP_ID)
                all_ph_midi.append(0)
                word_div.append(1)
                word_dur_fr.append(gap_fr)
                note_midi.append(0.0)
                note_rest.append(True)
                note_dur_fr.append(gap_fr)

            midi = int(note.get("midi") or note.get("pitch") or 60)
            lyric = note.get("lyric", "a").strip()
            dur_fr = max(2, round(dur * frame_hz))
            is_rest = lyric in ("", "-", "~", "rest", "_")
            
            if self.language == 'zh':
                phonemes = self.lyric_to_phonemes_zh(lyric)
            else:
                phonemes = self.lyric_to_phonemes_en(lyric)
                
            ids = [self.phoneme_to_id.get(p, SP_ID) for p in phonemes]
            if not ids:
                ids = [SP_ID]
                
            all_tok.extend(ids)
            all_ph_midi.extend([midi] * len(ids))
            word_div.append(len(ids))
            word_dur_fr.append(dur_fr)
            note_midi.append(float(midi))
            note_rest.append(is_rest)
            note_dur_fr.append(dur_fr)

            prev_end = start + dur
            
        final_sp_fr = max(2, round(0.4 * frame_hz))
        all_tok.append(SP_ID)
        all_ph_midi.append(0)
        word_div.append(1)
        word_dur_fr.append(final_sp_fr)
        note_midi.append(0.0)
        note_rest.append(True)
        note_dur_fr.append(final_sp_fr)

        n_tok = len(all_tok)
        n_notes = len(note_midi)
        tok_t = np.array([all_tok], dtype=np.int64)
        ph_midi_t = np.array([all_ph_midi], dtype=np.int64)
        wd_t = np.array([word_div], dtype=np.int64)
        wdur_t = np.array([word_dur_fr], dtype=np.int64)
        nm_t = np.array([note_midi], dtype=np.float32)
        nr_t = np.array([note_rest], dtype=bool)
        nd_t = np.array([note_dur_fr], dtype=np.int64)

        # Pre-compute durations/frames before running session since newer sess_ling requires ph_dur
        upd = []
        tok_idx = 0
        vowel_indices_abs = []
        
        zh_vowels = {
            "a", "ai", "an", "ang", "ao",
            "e", "ei", "en", "eng", "er",
            "i", "i0", "ia", "ian", "iang", "iao", "ie", "in", "ing", "iong", "ir", "iu",
            "o", "ong", "ou",
            "u", "ua", "uai", "uan", "uang", "ui", "un", "uo",
            "v", "van", "ve", "vn",
        }
        en_vowels = {"ah","ow","iy","ey","aa","ao","er","uh","uw","ae"}
        vowel_set = zh_vowels if self.language == 'zh' else en_vowels

        id_to_phoneme = {v: k for k, v in self.phoneme_to_id.items()}
        ph_names = [id_to_phoneme.get(t, f"ID_{t}") for t in all_tok]
        
        timing_feel = float(params.get("timing_feel", 50.0)) if params else 50.0
        base_cons_sec = 0.015 + 0.020 * (timing_feel / 100.0)
        base_cons_fr = max(1, round(base_cons_sec * frame_hz))

        last_vowel_upd_idx = -1
        
        for wdur, wdiv in zip(word_dur_fr, word_div):
            if wdiv <= 1:
                upd.append(wdur)
                last_vowel_upd_idx = len(upd) - 1
                vowel_indices_abs.append(tok_idx)
                tok_idx += wdiv
            else:
                word_ph_names = ph_names[tok_idx : tok_idx + wdiv]
                vowel_local_idx = next(
                    (i for i, p in enumerate(word_ph_names)
                     if p in vowel_set or (p and p[0] in "aeiouAEIOU")),
                    wdiv - 1
                )
                
                cons_fr_list = []
                for i in range(wdiv):
                    if i == vowel_local_idx:
                        cons_fr_list.append(0)
                        continue
                    p = word_ph_names[i]
                    if p in ["s", "sh", "f", "h", "z", "v", "th", "dh"]:
                        c_fr = max(3, int(base_cons_fr * 2.0)) # Fricatives
                    elif p in ["ch", "t", "k", "p", "ts", "th"]:
                        c_fr = max(2, int(base_cons_fr * 2.0)) # Aspirated stops & affricates
                    elif p in ["m", "n", "l", "r", "w", "y", "ng"]:
                        c_fr = max(2, int(base_cons_fr * 1.5)) # Liquids/Nasals
                    else:
                        c_fr = max(1, int(base_cons_fr * 1.2)) # Voiced Plosives (b, d, g)
                    cons_fr_list.append(c_fr)
                
                total_cons_fr = sum(cons_fr_list)
                
                # --- PRE-UTTERANCE: Steal time from previous note ---
                stolen = 0
                if total_cons_fr > 0 and last_vowel_upd_idx != -1:
                    max_steal = min(total_cons_fr, max(0, upd[last_vowel_upd_idx] - 2))
                    stolen = max_steal
                    upd[last_vowel_upd_idx] -= stolen
                
                target_word_frames = wdur + stolen
                if total_cons_fr >= target_word_frames:
                    scale = max(0.1, (target_word_frames - 1) / total_cons_fr)
                    cons_fr_list = [int(c * scale) for c in cons_fr_list]
                    total_cons_fr = sum(cons_fr_list)
                
                v_fr = max(1, target_word_frames - total_cons_fr)
                
                diff = target_word_frames - (total_cons_fr + v_fr)
                if diff != 0:
                    v_fr += diff
                
                for i in range(wdiv):
                    if i == vowel_local_idx:
                        upd.append(v_fr)
                        last_vowel_upd_idx = len(upd) - 1
                        vowel_indices_abs.append(tok_idx + i)
                    else:
                        upd.append(cons_fr_list[i])
                
                tok_idx += wdiv
        ph_dur = np.array(upd, dtype=np.int64)
        n_frames = int(ph_dur.sum())
        print(f"[DEBUG] word_dur_fr={word_dur_fr}, sum={sum(word_dur_fr)}")
        pdt = ph_dur[None, :]

        try:
            # 3. Linguistic model - Handle newer DiffSinger models needing ph_dur vs older ones needing word_div
            ling_sess_inputs = [i.name for i in self.sess_ling.get_inputs()]
            ling_inputs = {"tokens": tok_t}
            if "ph_dur" in ling_sess_inputs:
                ling_inputs["ph_dur"] = pdt
            else:
                ling_inputs["word_div"] = wd_t
                ling_inputs["word_dur"] = wdur_t
                
            import time
            t_start = time.time()
            if "languages" in ling_sess_inputs:
                ling_inputs["languages"] = np.zeros_like(tok_t)
                
            enc, masks = self.sess_ling.run(None, ling_inputs)
            t_ling = time.time()
            print(f"[ONNX_TIME] Linguistic model: {t_ling - t_start:.3f}s")
            
            # 4. Duration model
            sk_tok = np.tile(spk256[None, None, :], (1, n_tok, 1))
            dur_inputs = {
                "encoder_out": enc,
                "x_masks": masks,
                "ph_midi": ph_midi_t,
                "spk_embed": sk_tok
            }
            dur_sess_inputs = [i.name for i in self.sess_dur.get_inputs()]
            dur_inputs_filtered = {k: v for k, v in dur_inputs.items() if k in dur_sess_inputs}
            (dpred,) = self.sess_dur.run(None, dur_inputs_filtered)
            t_dur = time.time()
            print(f"[ONNX_TIME] Duration model: {t_dur - t_ling:.3f}s")

            # F0 guide (MIDI scale vs Hz guide)
            # Modern models expect MIDI semitones for the pitch guide input
            f0_midi_list = []
            ti = 0
            ni = 0
            for wdiv_v, wdur_v in zip(word_div, word_dur_fr):
                nr = note_rest[ni] if ni < len(note_rest) else True
                nm = note_midi[ni] if ni < len(note_midi) else 0
                midi_val = 0.0 if nr else nm
                ni += 1
                for k in range(wdiv_v):
                    f0_midi_list.extend([midi_val] * int(ph_dur[ti+k]))
                ti += wdiv_v
            
            f0_midi_arr = np.array(f0_midi_list[:n_frames], dtype=np.float32)
            if len(f0_midi_arr) < n_frames:
                f0_midi_arr = np.pad(f0_midi_arr, (0, n_frames - len(f0_midi_arr)))
            f0i = f0_midi_t = f0_midi_arr[None, :]

            # 5. Pitch model
            sk_fr = np.tile(spk256[None, None, :], (1, n_frames, 1))
            ex = np.ones((1, n_frames), dtype=np.float32)
            rt = np.ones((1, n_frames), dtype=bool)
            steps_val = int(params.get("steps", 20)) if params else 20
            st = np.array(steps_val, dtype=np.int64)

            pitch_inputs = {
                "encoder_out": enc,
                "ph_dur": pdt,
                "note_midi": nm_t,
                "note_rest": nr_t,
                "note_dur": nd_t,
                "pitch": f0i,
                "expr": ex,
                "retake": rt,
                "spk_embed": sk_fr,
                "steps": st,
                "languages": np.zeros((1, tok_t.shape[1]), dtype=np.int64)
            }
            pitch_sess_inputs = [i.name for i in self.sess_pitch.get_inputs()]
            pitch_inputs_filtered = {k: v for k, v in pitch_inputs.items() if k in pitch_sess_inputs}
            (pp,) = self.sess_pitch.run(None, pitch_inputs_filtered)
            t_pitch = time.time()
            print(f"[ONNX_TIME] Pitch model: {t_pitch - t_dur:.3f}s")

            # Convert predicted pitch (pp) to Hz for acoustic session and vocoder
            pp_final = pp.copy()
            voiced_frames = pp_final[pp_final > 2.0]
            v_mean = np.mean(voiced_frames) if len(voiced_frames) > 0 else 0.0
            print(f"[DEBUG] v_mean: {v_mean:.2f}, raw pp median: {np.median(voiced_frames):.2f}, raw pp max: {np.max(voiced_frames):.2f}")
            
            if 0.1 < v_mean < 10.0:
                # Log F0 -> convert to Hz
                voicing_mask = pp_final > 0
                pp_hz = np.zeros_like(pp_final)
                pp_hz[voicing_mask] = np.exp(pp_final[voicing_mask])
                pp_final = pp_hz
            elif 10.0 <= v_mean < 100.0:
                # MIDI semitones -> convert to Hz
                voicing_mask = pp_final > 0
                pp_hz = np.zeros_like(pp_final)
                pp_hz[voicing_mask] = 440.0 * (2.0 ** ((pp_final[voicing_mask] - 69.0) / 12.0))
                pp_final = pp_hz
            # If v_mean >= 100.0, it is already in Hz.

            # ----- HUMANIZED INTONATION BLEND -----
            # Blend: 60% neural pitch (natural glides/intonation) + 40% MIDI ideal pitch
            # Higher neural = more expressive, more human-like singing
            NEURAL_BLEND = 0.0   # ← 0.0 = robot, 1.0 = full neural AI
            
            f0_hz_ideal = np.zeros_like(f0_midi_arr)
            voicing_mask = f0_midi_arr > 0.0
            f0_hz_ideal[voicing_mask] = 440.0 * (2.0 ** ((f0_midi_arr[voicing_mask] - 69.0) / 12.0))
            
            # Mix: where both are voiced, blend neural into ideal
            both_voiced = voicing_mask & (pp_final[0] > 0.0)
            blended = f0_hz_ideal.copy()
            blended[both_voiced] = (
                (1.0 - NEURAL_BLEND) * f0_hz_ideal[both_voiced] +
                NEURAL_BLEND * pp_final[0][both_voiced]
            )
            print(f"[DEBUG] f0_midi_arr unique: {np.unique(f0_midi_arr)}")
            print(f"[DEBUG] f0_hz_ideal median: {np.median(f0_hz_ideal[f0_hz_ideal>0]):.2f}")
            print(f"[DEBUG] blended median: {np.median(blended[blended>0]):.2f}")
            pp_final[0] = blended
            # -----------------------------------------------


            # 6. Acoustic model
            no = pp_final.shape[1]
            sk_o = np.tile(spk256[None, None, :], (1, no, 1))
            formant_val = float(params.get("formant_shift", 0.0)) if params else 0.0
            gender_val = -formant_val / 6.0
            ga = np.full((1, no), gender_val, dtype=np.float32)
            speed_val = float(params.get("speed", 1.0)) if params else 1.0
            va = np.full((1, no), speed_val, dtype=np.float32)
            depth_val = float(params.get("depth", self.max_depth)) if params else self.max_depth
            dp = np.array(depth_val, dtype=np.float32)

            acou_inputs = {
                "tokens": tok_t,
                "durations": pdt,
                "f0": pp_final,
                "gender": ga,
                "velocity": va,
                "spk_embed": sk_o,
                "languages": np.zeros((1, tok_t.shape[1]), dtype=np.int64),
                "depth": dp,
                "steps": st
            }
            acou_sess_inputs = [i.name for i in self.sess_acoustic.get_inputs()]
            if "breathiness" in acou_sess_inputs:
                breath_val = float(params.get("breathiness", 0.0)) / 100.0 if params else 0.0
                acou_inputs["breathiness"] = np.full((1, no), breath_val, dtype=np.float32)
            if "voicing" in acou_sess_inputs:
                acou_inputs["voicing"] = np.zeros((1, no), dtype=np.float32)
            if "tension" in acou_sess_inputs:
                acou_inputs["tension"] = np.zeros((1, no), dtype=np.float32)
            if "languages" in acou_sess_inputs:
                acou_inputs["languages"] = np.zeros_like(tok_t)

            acou_inputs_filtered = {k: v for k, v in acou_inputs.items() if k in acou_sess_inputs}
            mel = self.sess_acoustic.run(["mel"], acou_inputs_filtered)[0]
            t_acou = time.time()
            print(f"[ONNX_TIME] Acoustic model: {t_acou - t_pitch:.3f}s")
            print(f"[DEBUG] mel shape: {mel.shape}, acou frames: {mel.shape[1]}")

            # 7. Vocoder
            print(f"[DEBUG] pp_final passed to vocoder: median={np.median(pp_final[pp_final>0]):.2f} Hz, max={np.max(pp_final):.2f} Hz")
            voc_inputs = {"mel": mel, "f0": pp_final}
            waveform = self.sess_vocoder.run(["waveform"], voc_inputs)[0]
            t_voc = time.time()
            print(f"[ONNX_TIME] Vocoder model: {t_voc - t_acou:.3f}s")
            print(f"[ONNX_TIME] TOTAL INFERENCE: {t_voc - t_start:.3f}s")
            print(f"[DEBUG] waveform shape: {waveform.shape}, vocoder SR equivalent (assuming hop 512): {waveform.shape[1]/mel.shape[1]*44100/512}")
            audio = waveform[0].copy().astype(np.float32)

            # Apply post-processing (EQ, Reverb, Norm)
            return self._apply_post_processing(audio, params)
        except Exception as e:
            print(f"[ONNXEngine] ❌ Neural synthesis failed, falling back to manual pitch mode: {e}")
            import traceback
            traceback.print_exc()
            return self._synthesize_track_fallback(track_notes, params)

    def _synthesize_track_fallback(self, track_notes, params):
        hop_size = 512
        frame_sec = hop_size / self.sr
        
        initial_sp_sec = 0.02
        initial_sp_frames = max(1, round(initial_sp_sec / frame_sec))
        
        ph_list = ["SP"]
        ph_dur_frames = [initial_sp_frames]
        ph_f0 = [0.0]
        
        note_ranges = []
        
        for i, (start, dur, note) in enumerate(track_notes):
            target_frames_total = round((start + initial_sp_sec) / frame_sec)
            current_frames_total = sum(ph_dur_frames)
            if target_frames_total > current_frames_total:
                sil_frames = target_frames_total - current_frames_total
                if sil_frames > 0:
                    ph_list.append("SP")
                    ph_dur_frames.append(sil_frames)
                    ph_f0.append(0.0)
            
            note_start_f = sum(ph_dur_frames)
            
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
            
            note_end_f = sum(ph_dur_frames)
            note_ranges.append((note_start_f, note_end_f, f0_val))
            
        ph_list.append("SP")
        ph_dur_frames.append(int(0.1 / frame_sec))
        ph_f0.append(0.0)
        
        # Expand F0 to per-frame (aligned with durations)
        f0_list = []
        for f0, nf in zip(ph_f0, ph_dur_frames):
            f0_list.extend([f0] * nf)
        
        f0_arr = np.array(f0_list, dtype=np.float32)
        
        # 1. Portamento (pitch glide between adjacent notes) — longer = more human
        PORTA_FRAMES = int(0.14 / frame_sec)   # 0.14s glide (was 0.08)
        frame_idx = 0
        for pi, (nf, hz) in enumerate(zip(ph_dur_frames, ph_f0)):
            if pi > 0 and hz > 0.0 and ph_f0[pi-1] > 0.0 and hz != ph_f0[pi-1]:
                prev_hz = ph_f0[pi-1]
                ramp = min(PORTA_FRAMES, nf)
                f0_arr[frame_idx:frame_idx+ramp] = np.linspace(prev_hz, hz, ramp)
            frame_idx += nf
            
        # 2. Ramp-in and Ramp-out at boundaries
        RAMP = int(0.06 / frame_sec)
        for i in range(1, len(f0_arr)):
            prev, cur = f0_arr[i-1], f0_arr[i]
            if prev == 0.0 and cur > 0.0:
                end = min(i + RAMP, len(f0_arr))
                f0_arr[i:end] = np.linspace(cur * 0.10, cur, end - i)
            elif prev > 0.0 and cur == 0.0:
                start = max(0, i - RAMP)
                f0_arr[start:i] = np.linspace(prev, prev * 0.10, i - start)
                
        # 3. Vibrato — 4.8 Hz / 36 cents = warm, natural, operatic
        VIBRATO_HZ = 4.8
        VIBRATO_CENTS = 36
        VIBRATO_DELAY = int(0.10 / frame_sec)   # start vibrato sooner
        MIN_VIBE_FRAMES = int(0.30 / frame_sec) # apply vibrato to shorter notes too
        
        for (start_f, end_f, hz) in note_ranges:
            nf = end_f - start_f
            if hz > 0.0 and nf > MIN_VIBE_FRAMES:
                onset = start_f + VIBRATO_DELAY
                if onset < end_f:
                    vib_len = end_f - onset
                    t_arr = np.arange(vib_len) * frame_sec
                    cents = VIBRATO_CENTS * np.sin(2 * np.pi * VIBRATO_HZ * t_arr)
                    
                    fade_in_n = min(int(0.10 / frame_sec), vib_len)
                    vib_env = np.ones(vib_len)
                    vib_env[:fade_in_n] = np.linspace(0.0, 1.0, fade_in_n)
                    cents *= vib_env
                    
                    fade_out_n = min(int(0.05 / frame_sec), vib_len)
                    if fade_out_n > 0:
                        cents[-fade_out_n:] *= np.linspace(1.0, 0.0, fade_out_n)
                        
                    ratio = 2.0 ** (cents / 1200.0)
                    f0_arr[onset:end_f] *= ratio.astype(np.float32)
                    
        f0_list = f0_arr.tolist()
        n_frames = len(f0_list)
        f0_np = np.array([f0_list], dtype=np.float32)
        
        # Prepare ONNX Inputs
        tokens = []
        for p in ph_list:
            if p in self.phoneme_to_id:
                tokens.append(self.phoneme_to_id[p])
            else:
                tokens.append(0)
                
        tokens_np = np.array([tokens], dtype=np.int64)
        durations_np = np.array([ph_dur_frames], dtype=np.int64)
        
        formant_val = float(params.get("formant_shift", 0.0)) if params else 0.0
        gender_val = -formant_val / 6.0
        gender_np = np.full((1, n_frames), gender_val, dtype=np.float32)
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
        if "languages" in input_names: inputs["languages"] = np.zeros_like(tokens_np)
        if "breathiness" in input_names:
            breath_val = float(params.get("breathiness", 0.0)) / 100.0 if params else 0.0
            inputs["breathiness"] = np.full((1, n_frames), breath_val, dtype=np.float32)
        if "voicing" in input_names: inputs["voicing"] = np.zeros((1, n_frames), dtype=np.float32)
        if "tension" in input_names: inputs["tension"] = np.zeros((1, n_frames), dtype=np.float32)
        
        if "spk_embed" in input_names:
            spk_embed_data = self._get_spk_embed(params)
            spk_embed_node = next(i for i in self.sess_acoustic.get_inputs() if i.name == "spk_embed")
            embed_dim = 256
            if len(spk_embed_node.shape) >= 3 and isinstance(spk_embed_node.shape[2], int):
                embed_dim = spk_embed_node.shape[2]
            elif len(spk_embed_node.shape) >= 3:
                if spk_embed_data is not None:
                    embed_dim = len(spk_embed_data)
            
            actual_embed = np.zeros(embed_dim, dtype=np.float32)
            if spk_embed_data is not None:
                if len(spk_embed_data) == embed_dim:
                    actual_embed = spk_embed_data
                else:
                    if len(spk_embed_data) < embed_dim:
                        actual_embed[:len(spk_embed_data)] = spk_embed_data
                    else:
                        actual_embed = spk_embed_data[:embed_dim]
            inputs["spk_embed"] = np.tile(actual_embed.reshape(1, 1, embed_dim), (1, n_frames, 1))
            
        if "depth" in input_names:
            depth_val = float(params.get("depth", self.max_depth)) if params else self.max_depth
            inputs["depth"] = np.array(depth_val, dtype=np.float32)
        if "steps" in input_names:
            steps_val = int(params.get("steps", 20)) if params else 20
            inputs["steps"] = np.array(steps_val, dtype=np.int64)

        try:
            mel = self.sess_acoustic.run(["mel"], inputs)[0]
            voc_inputs = { "mel": mel, "f0": f0_np }
            waveform = self.sess_vocoder.run(["waveform"], voc_inputs)[0]
            audio = waveform[0].copy().astype(np.float32)
            return self._apply_post_processing(audio, params)
        except Exception as e:
            print(f"[ONNXEngine] ❌ Fallback acoustic synthesis failed: {e}")
            import traceback
            traceback.print_exc()
            return None
        finally:
            # Force garbage collection and VRAM flush to prevent memory leaks
            import gc
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass

    def _apply_post_processing(self, audio, params):
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


