import os
import sys
import pathlib
import uuid
import tempfile
import re
from typing import Optional, List

import numpy as np
import librosa

# ── Phoneme Vocabulary ────────────────────────────────────────────────────────
# English ARPABET phonemes
_VALID_PHONEMES_EN = {
    "a", "aa", "ae", "ah", "ao", "aw", "ay",
    "b", "ch", "d", "dh", "eh", "er", "ey",
    "f", "g", "hh", "ih", "iy", "jh", "k",
    "l", "m", "n", "ng", "ow", "oy", "p",
    "r", "s", "sh", "t", "th", "uh", "uw",
    "v", "w", "y", "z", "zh", "SP", "AP"
}

# Chinese phonemes (from dictionary-zh.txt used in M4Singer training)
_VALID_PHONEMES_ZH = {
    "SP", "AP",
    # Finals / vowels
    "a", "ai", "an", "ang", "ao",
    "e", "ei", "en", "eng", "er",
    "i", "i0", "ia", "ian", "iang", "iao", "ie", "in", "ing", "iong", "ir", "iu",
    "o", "ong", "ou",
    "u", "ua", "uai", "uan", "uang", "ui", "un", "uo",
    "v", "van", "ve", "vn",
    "E", "En",
    # Initials / consonants
    "b", "p", "m", "f",
    "d", "t", "n", "l",
    "g", "k", "h",
    "j", "q", "x",
    "zh", "ch", "sh", "r",
    "z", "c", "s",
    "y", "w",
}

# Combined (for backward compat)
_VALID_PHONEMES = _VALID_PHONEMES_EN | _VALID_PHONEMES_ZH


# ── Solfège syllable → phoneme string ─────────────────────────────────────────
SOLFEGE_MAP = {
    # Standard diatonic (Ju / American / British)
    "do":  "d ow",   "doh": "d ow",
    "re":  "r ey",   "ray": "r ey",
    "mi":  "m iy",   "me":  "m iy",
    "fa":  "f aa",   "fah": "f aa",
    "sol": "s ow l", "soh": "s ow",
    "la":  "l aa",   "lah": "l aa",
    "ti":  "th iy",   "si":  "s iy",
    # Chromatic SHARP side
    "di":  "d iy",   # C#  (all systems)
    "ri":  "r iy",   # D#
    "fi":  "f iy",   # F#
    "li":  "l iy",   # A#
    # Chromatic FLAT side — American (Ra, Me, Se, Le, Te)
    "ra":  "r aa",   # Db
    "se":  "s ey",   # Gb
    "le":  "l ey",   # Ab
    "te":  "t ey",   # Bb
    # Chromatic FLAT side — British Curwen (Raw, Maw, Saw, Law, Taw)
    "raw": "r ao",   "maw": "m ao",
    "saw": "s ao",   "law": "l ao",
    "taw": "t ao",
    # Chromatic FLAT side — Ju (Ru, Mu, Su, Lu, Tu)
    "ru":  "r uw",   "mu":  "m uw",
    "su":  "s uw",   "lu":  "l uw",
    "tu":  "t uw",
    # Pure vowels
    "ah":  "aa",     "oh":  "ow",    "ee":  "iy",
    # Kodaly single-letter
    "d": "d ow", "r": "r ey", "m": "m iy",
    "f": "f aa", "s": "s ow l", "l": "l aa", "t": "th iy",
    # Kodaly flat & Sargam missing syllables
    "ma": "m aa", "sa": "s aa", "ta": "t aa",
    "ga": "g aa", "pa": "p aa", "dha": "dh aa", "ni": "n iy",

    # ── Jianpu 简谱 Chinese numerals (唱名 chàng míng) ────────────────────────
    # Numbers 1–7 sung as Mandarin: Yi Er San Si Wu Liu Qi
    # Phoneme approximation uses ARPABET (current model vocab)
    # For authentic Chinese output: use Chinese DiffSinger model (see roadmap)
    "1":   "iy",          # 一 (yī)  — pure "ee" vowel
    "2":   "er",          # 二 (èr)  — rhotic vowel
    "3":   "s ae n",      # 三 (sān) — "san"
    "4":   "s iy",        # 四 (sì)  — "sz" + "ee"
    "5":   "w uw",        # 五 (wǔ)  — "woo"
    "6":   "l iy uw",     # 六 (liù) — "lee-oh"
    "7":   "ch iy",       # 七 (qī)  — "chee"
    # Chromatic sharps for Jianpu (#1=#C#, #2=D#, etc.)
    "#1":  "sh ae n g iy",  # 升一 (shēng yī)
    "#2":  "sh ae n g er",  # 升二
    "#4":  "sh ae n g s iy",# 升四
    "#5":  "sh ae n g w uw",# 升五
    "#6":  "sh ae n g l iy",# 升六
    # Flat variants for Jianpu (b2=Db, b3=Eb, etc.)
    "b2":  "j y ae n er",   # 降二 (jiàng èr)
    "b3":  "j y ae n s ae n",
    "b5":  "j y ae n w uw",
    "b6":  "j y ae n l iy",
    "b7":  "j y ae n ch iy",
}

# ── Chinese Pinyin → Phoneme Map (matches dictionary-zh.txt) ──────────────
# Maps common Mandarin pinyin syllables to the phoneme sequences
# used in the M4Singer training data (zh phoneme set)
PINYIN_MAP = {
    # Vowels / finals
    "a": "a", "o": "o", "e": "e", "i": "i", "u": "u", "v": "v",
    "ai": "ai", "ei": "ei", "ui": "ui", "ao": "ao", "ou": "ou", "iu": "iu",
    "ie": "ie", "ve": "ve", "er": "er",
    "an": "an", "en": "en", "in": "in", "un": "un", "vn": "vn",
    "ang": "ang", "eng": "eng", "ing": "ing", "ong": "ong",
    "ian": "ian", "uan": "uan", "van": "van",
    "iang": "iang", "uang": "uang", "iong": "iong",
    "iao": "iao", "uai": "uai", "ua": "ua",
    # Initials + finals (common syllables)
    "ba": "b a", "bo": "b o", "bi": "b i", "bu": "b u",
    "pa": "p a", "po": "p o", "pi": "p i", "pu": "p u",
    "ma": "m a", "mo": "m o", "mi": "m i", "mu": "m u",
    "fa": "f a", "fo": "f o", "fu": "f u",
    "da": "d a", "de": "d e", "di": "d i", "du": "d u",
    "ta": "t a", "te": "t e", "ti": "t i", "tu": "t u",
    "na": "n a", "ne": "n e", "ni": "n i", "nu": "n u",
    "la": "l a", "le": "l e", "li": "l i", "lu": "l u",
    "ga": "g a", "ge": "g e", "gu": "g u",
    "ka": "k a", "ke": "k e", "ku": "k u",
    "ha": "h a", "he": "h e", "hu": "h u",
    "ji": "j i", "ju": "j v", "jia": "j ia", "jie": "j ie",
    "qi": "q i", "qu": "q v", "qia": "q ia", "qie": "q ie",
    "xi": "x i", "xu": "x v", "xia": "x ia", "xie": "x ie",
    "zhi": "zh ir", "chi": "ch ir", "shi": "sh ir", "ri": "r ir",
    "zi": "z i0", "ci": "c i0", "si": "s i0",
    "ya": "y a", "ye": "y e", "yi": "y i", "yu": "y v",
    "wa": "w a", "wo": "w o", "wu": "w u",
    "yin": "y in", "yang": "y ang", "ying": "y ing",
    "yuan": "y van", "yue": "y ve", "yun": "y vn",
    "wen": "w en", "wang": "w ang", "weng": "w eng",
    "xian": "x ian", "xing": "x ing", "xiao": "x iao",
    "jian": "j ian", "jing": "j ing", "jiao": "j iao",
    "qian": "q ian", "qing": "q ing", "qiao": "q iao",
    "nian": "n ian", "niang": "n iang", "niao": "n iao",
    "lian": "l ian", "liang": "l iang", "liao": "l iao",
    "dian": "d ian", "tian": "t ian",
    "shan": "sh an", "shang": "sh ang", "shao": "sh ao",
    "zhan": "zh an", "zhang": "zh ang", "zhao": "zh ao",
    "chan": "ch an", "chang": "ch ang", "chao": "ch ao",
    "SP": "SP", "AP": "AP",
}

# Jianpu number → correct phoneme sequence (from dictionary-zh.txt)
# Now mapped to authentic Chinese Solfège syllables (1=duo, 2=lai, 3=mi, etc.)
JIANPU_NUM_PHONEMES = {
    "1":  ["d", "uo"],  # duo (多)
    "#1": ["d", "i"],   # di (迪)
    "b2": ["l", "ai"],  # ra / lai (来)
    "2":  ["l", "ai"],  # lai (来)
    "#2": ["r", "ir"],  # ri (瑞)
    "b3": ["m", "i"],   # ma / mi (咪)
    "3":  ["m", "i"],   # mi (咪)
    "4":  ["f", "a"],   # fa (发)
    "#4": ["f", "ei"],  # fi (菲)
    "b5": ["s", "uo"],  # se / suo (唆)
    "5":  ["s", "uo"],  # suo (梭/索)
    "#5": ["s", "i0"],  # si (丝)
    "b6": ["l", "a"],   # le / la (拉)
    "6":  ["l", "a"],   # la (拉)
    "#6": ["l", "i"],   # li (莉)
    "b7": ["x", "i"],   # te / xi (西)
    "7":  ["x", "i"],   # xi / ti (西)
}

# Jianpu number → Mandarin pinyin (for number-based Jianpu input, kept for fallback)
JIANPU_NUM_MAP = {
    "1": "duo", "#1": "di", "b2": "lai", "2": "lai", "#2": "ri",
    "b3": "mi", "3": "mi", "4": "fa", "#4": "fi", "b5": "suo",
    "5": "suo", "#5": "si", "b6": "la", "6": "la", "#6": "li",
    "b7": "xi", "7": "xi",
}

# ── Lazy-loaded G2P instance ───────────────────────────────────────────────────
_g2p = None

def _get_g2p():
    global _g2p
    if _g2p is None:
        try:
            from g2p_en import G2p
            _g2p = G2p()
            print("[DiffSingerEngine] ✅ G2P engine loaded")
        except Exception as e:
            print(f"[DiffSingerEngine] ⚠️  G2P unavailable: {e}")
    return _g2p


def _arpabet_to_phoneme(token: str) -> Optional[str]:
    """Convert ARPAbet token (e.g. 'AH0', 'HH') → lowercase dict phoneme."""
    # Strip stress digit
    base = re.sub(r"[012]$", "", token).lower()
    if base in _VALID_PHONEMES:
        return base
    return None  # unknown → skip


# ── Chinese Solfège to Phonemes Map ──────────────────────────────────────────
SOLFEGE_MAP_ZH = {
    # Diatonic
    "do":   ["d", "uo"],    # 多 duo
    "doh":  ["d", "uo"],
    "re":   ["l", "ai"],    # 来 lai
    "ray":  ["l", "ai"],
    "mi":   ["m", "i"],     # 咪 mi
    "me":   ["m", "i"],
    "fa":   ["f", "a"],     # 发 fa
    "fah":  ["f", "a"],
    "sol":  ["s", "uo"],    # 索 suo
    "soh":  ["s", "uo"],
    "la":   ["l", "a"],     # 拉 la
    "lah":  ["l", "a"],
    "ti":   ["x", "i"],     # 西 xi
    "si":   ["s", "i0"],    # si
    
    # Sharp chromatic (sung as simplified base/close syllables to match note length)
    "di":   ["d", "i"],
    "ri":   ["r", "ir"],
    "fi":   ["f", "ei"],
    "li":   ["l", "i"],
    
    # Flat chromatic
    "ra":   ["l", "ai"],
    "raw":  ["l", "ai"],
    "ru":   ["l", "ai"],
    "se":   ["s", "uo"],
    "saw":  ["s", "uo"],
    "su":   ["s", "uo"],
    "le":   ["l", "a"],
    "law":  ["l", "a"],
    "lu":   ["l", "a"],
    "te":   ["x", "i"],
    "taw":  ["x", "i"],
    "tu":   ["x", "i"],
    "maw":  ["m", "i"],
    "mu":   ["m", "i"],
    
    # Kodaly single-letter
    "d":    ["d", "uo"],
    "r":    ["l", "ai"],
    "m":    ["m", "i"],
    "f":    ["f", "a"],
    "s":    ["s", "uo"],
    "l":    ["l", "a"],
    "t":    ["x", "i"],
    
    # Thai solfege phoneme support (mapped directly to Chinese pronunciation)
    "โด":   ["d", "uo"],
    "เร":   ["l", "ai"],
    "มี":   ["m", "i"],
    "ฟา":   ["f", "a"],
    "ซอล":  ["s", "uo"],
    "โซล":  ["s", "uo"],
    "ลา":   ["l", "a"],
    "ที":   ["x", "i"],
}


def _lyric_to_phonemes_zh(lyric: str) -> List[str]:
    """Convert a lyric to phonemes using Chinese pinyin map (matches dictionary-zh.txt)."""
    word = lyric.strip()
    # Pass through silence markers as-is
    if word.upper() in ("SP", "AP"):
        return [word.upper()]
    word = word.lower()

    # ── 1. Check Chinese Solfège Map first ───────────────────────────────────
    if word in SOLFEGE_MAP_ZH:
        result = SOLFEGE_MAP_ZH[word]
        print(f"[DiffSingerEngine-ZH] Solfege match '{lyric}' -> {result}")
        return result

    # ── 2. Jianpu numbers (1-7): use pre-built phoneme sequences directly ──────
    # Supports chromatically altered numerals like #1, b2, etc.
    clean_word = word.replace("♯", "#").replace("♭", "b").strip()
    if clean_word in JIANPU_NUM_PHONEMES:
        result = JIANPU_NUM_PHONEMES[clean_word]
        print(f"[DiffSingerEngine-ZH] Jianpu match '{lyric}' -> '{clean_word}' -> {result}")
        return result

    digit_match = re.search(r"[1-7]", clean_word)
    if digit_match:
        digit = digit_match.group(0)
        if digit in JIANPU_NUM_PHONEMES:
            result = JIANPU_NUM_PHONEMES[digit]
            print(f"[DiffSingerEngine-ZH] Jianpu digit fallback match '{lyric}' -> digit '{digit}' -> {result}")
            return result

    # ── 3. Chinese Characters G2P (pypinyin) ─────────────────────────────────
    if re.search(r"[\u4e00-\u9fff]", lyric):
        try:
            from pypinyin import pinyin, Style
            pys = pinyin(lyric, style=Style.NORMAL)
            phonemes = []
            for py_item in pys:
                py = py_item[0].lower().strip()
                if py in PINYIN_MAP:
                    phonemes.extend(PINYIN_MAP[py].split())
                else:
                    # Try partial prefix match
                    matched = False
                    for k in sorted(PINYIN_MAP.keys(), key=len, reverse=True):
                        if py.startswith(k):
                            phonemes.extend(PINYIN_MAP[k].split())
                            matched = True
                            break
                    if not matched:
                        phonemes.append("a")
            if phonemes:
                print(f"[DiffSingerEngine-ZH] G2P Chinese character '{lyric}' -> pinyin {pys} -> phonemes {phonemes}")
                return phonemes
        except Exception as e:
            print(f"[DiffSingerEngine-ZH] pypinyin conversion error: {e}")

    # ── 4. Pinyin word: look up in PINYIN_MAP ──────────────────────────────────
    if word in PINYIN_MAP:
        result = PINYIN_MAP[word].split()
        print(f"[DiffSingerEngine-ZH] Pinyin match '{lyric}' -> {result}")
        return result

    # ── 5. Partial prefix match (longest first) ────────────────────────────────
    for k in sorted(PINYIN_MAP.keys(), key=len, reverse=True):
        if word.startswith(k):
            result = PINYIN_MAP[k].split()
            print(f"[DiffSingerEngine-ZH] Prefix match '{lyric}' -> '{k}' -> {result}")
            return result

    print(f"[DiffSingerEngine-ZH] Fallback 'a' for '{lyric}'")
    return ["a"]


# ── Engine ───────────────────────────────────────────────────────────────────
class DiffSingerEngine:
    def __init__(self, checkpoint_path, config_path=None, language='en'):
        self.checkpoint_path = checkpoint_path
        self.language = language  # 'en' or 'zh'
        self.config_path = config_path or os.path.join(
            os.path.dirname(checkpoint_path), "config.yaml"
        )
        self._ready = False
        self.sr = 44100
        self.DS_ROOT = os.path.join(os.path.dirname(__file__), "training", "DiffSinger")

        if self.DS_ROOT not in sys.path:
            sys.path.insert(0, self.DS_ROOT)

        try:
            from utils.hparams import set_hparams, hparams
            from inference.ds_acoustic import DiffSingerAcousticInfer

            # Extract exp_name from the checkpoint path (e.g. 'vocalido_v1_runpod')
            exp_name = os.path.basename(os.path.dirname(self.checkpoint_path))
            
            sys.argv = [sys.argv[0], "--exp_name", exp_name, "--infer"]
            set_hparams(config=self.config_path, exp_name=exp_name)
            hparams['infer_ckpt'] = self.checkpoint_path

            # Load dictionary (OpenCpop or standard OpenUtau format)
            self.dict_map = {}
            dict_path = os.path.join(os.path.dirname(checkpoint_path), "dictionary.txt")
            if not os.path.exists(dict_path):
                dict_path = os.path.join(os.path.dirname(checkpoint_path), "opencpop-strict.txt")
            if os.path.exists(dict_path):
                with open(dict_path, "r", encoding="utf-8") as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) >= 2:
                            word = parts[0].lower()
                            self.dict_map[word] = parts[1:]
                print(f"[DiffSingerEngine] 📖 Loaded custom dictionary from {dict_path} ({len(self.dict_map)} entries)")

            old_cwd = os.getcwd()
            os.chdir(self.DS_ROOT)
            try:
                self.infer_ins = DiffSingerAcousticInfer(load_vocoder=True)
                self.sr = hparams.get("audio_sample_rate", 44100)
                self._ready = True
            finally:
                os.chdir(old_cwd)

        except Exception as e:
            print(f"[DiffSingerEngine] ❌ Failed to initialize: {e}")
            import traceback
            traceback.print_exc()

    def lyric_to_phonemes_en(self, lyric: str) -> list[str]:
        word = lyric.lower().strip()
        original_word = lyric
        import re
        clean_word = re.sub(r'[.,?!:;\-\(\)\[\]"\']', '', word)
        
        # Translate Thai solfege to English
        thai_map = {
            "โด": "do", "เร": "re", "มี": "mi", "ฟา": "fa", 
            "ซอล": "sol", "โซล": "sol", "ลา": "la", "ที": "ti"
        }
        if clean_word in thai_map:
            clean_word = thai_map[clean_word]

        # 0. Check loaded custom dictionary (Opencpop / Lotte V / etc.)
        if clean_word in getattr(self, 'dict_map', {}):
            ph = self.dict_map[clean_word]
            print(f"[DiffSingerEngine] Custom Dict match for '{clean_word}': {ph}")
            return ph

        # 1. Solfège (fallback)
        if clean_word in SOLFEGE_MAP:
            ph = SOLFEGE_MAP[clean_word].split()
            print(f"[DiffSingerEngine] Solfege match for '{clean_word}': {ph}")
            return ph

        # 2. G2P – real English word
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
            except Exception as e:
                print(f"[DiffSingerEngine] G2P error for '{clean_word}': {e}")
                
        return ["ah"]

    @property
    def is_ready(self):
        return self._ready

    def synthesize_phrase(self, notes, params=None):
        if not self._ready:
            return None

        params = params or {}
        bpm = float(params.get("bpm", 120.0))
        beat_sec = 60.0 / bpm
        return_stems = str(params.get("return_stems", "false")).lower() == "true"

        # Sort notes by startTime first to ensure voice allocation works correctly
        sorted_notes = sorted(notes, key=lambda x: float(x.get("startTime", 0.0)))
        tracks = []
        for n in sorted_notes:
            start = float(n.get("startTime", 0.0)) * beat_sec
            dur   = max(0.05, float(n.get("duration", 0.5)) * beat_sec)
            
            placed = False
            for track in tracks:
                if not track:
                    continue
                last_start, last_dur, _ = track[-1]
                last_end = last_start + last_dur
                if start >= last_end - 0.005:
                    track.append((start, dur, n))
                    placed = True
                    break
            
            if not placed:
                tracks.append([(start, dur, n)])

        if not tracks:
            print("[DiffSingerEngine] ⚠️  No notes after filtering.")
            if return_stems: return None, []
            return None
            
        print(f"[DiffSingerEngine] 🎼 Polyphony detected: Split into {len(tracks)} independent tracks.")

        mixed_audio = None
        stems_audio = []
        for i, track in enumerate(tracks):
            print(f"[DiffSingerEngine] 🎙️ Rendering Track {i+1}/{len(tracks)} ({len(track)} notes)...")
            track_audio = self._synthesize_single_track(track, bpm)
            if track_audio is not None:
                stems_audio.append(track_audio.copy())
                if mixed_audio is None:
                    mixed_audio = track_audio.copy()
                else:
                    # Pad to match lengths
                    max_len = max(len(mixed_audio), len(track_audio))
                    if len(mixed_audio) < max_len:
                        mixed_audio = np.pad(mixed_audio, (0, max_len - len(mixed_audio)))
                    if len(track_audio) < max_len:
                        track_audio = np.pad(track_audio, (0, max_len - len(track_audio)))
                    mixed_audio += track_audio
            else:
                stems_audio.append(np.zeros(1024, dtype=np.float32))

        if mixed_audio is not None:
            # Normalize the mix to avoid clipping if there are multiple tracks
            if len(tracks) > 1:
                peak = np.max(np.abs(mixed_audio))
                if peak > 0.001:
                    mixed_audio = np.tanh(mixed_audio / peak * 1.3) * 0.85
            if return_stems:
                return mixed_audio, stems_audio
            return mixed_audio
            
        if return_stems: return None, []
        return None

    def _synthesize_single_track(self, filtered, bpm):
        try:
            from utils.hparams import hparams
            hop_size = hparams.get("hop_size", 512)
            f0_timestep = hop_size / self.sr
        except:
            f0_timestep = 512 / 44100.0

        # ── Pass 2: build ph_seq + ph_dur + per-phoneme Hz list ──────────────
        ph_seq  = []   # phoneme tokens
        ph_dur  = []   # duration in seconds (float)
        ph_hz   = []   # F0 in Hz per phoneme (0.0 for SP)
        note_ranges = [] # list of (start_frame, end_frame, hz) for each note

        prev_end = 0.0
        # ── AP (Attack Pause) at start — minimal for clean DiffSinger onset ──
        # Reduced from 80ms to 20ms to minimize timing offset vs MIDI playback
        initial_ap_sec = 0.02
        ph_seq.append("AP")
        ph_dur.append(initial_ap_sec)
        ph_hz.append(0.0)
        current_frame = max(1, round(initial_ap_sec / f0_timestep))
        # Offset prev_end backward to compensate for initial AP padding
        # This ensures the gap calculation for the first note accounts for the AP
        prev_end = -initial_ap_sec

        F0_MIN, F0_MAX = 65.0, 1100.0
        for (start, dur, n) in filtered:
            midi  = int(n.get("midi") or n.get("pitch") or 60)
            hz    = float(librosa.midi_to_hz(midi))
            
            orig_hz = hz
            while hz < F0_MIN and hz > 0:
                hz *= 2.0
            while hz > F0_MAX:
                hz /= 2.0
                
            lyric = str(n.get("lyric") or ("a" if self.language == "zh" else "ah"))
            if self.language == "zh":
                phonemes = _lyric_to_phonemes_zh(lyric)
            else:
                phonemes = self.lyric_to_phonemes_en(lyric)

            gap = start - prev_end
            if gap > 0.02:
                ph_seq.append("SP")
                gap_d = round(gap, 4)
                ph_dur.append(gap_d)
                ph_hz.append(0.0)
                current_frame += max(1, round(gap_d / f0_timestep))

            p_len = len(phonemes)
            note_start_f = current_frame
            if p_len == 1:
                ph_seq.extend(phonemes)
                note_d = round(dur, 4)
                ph_dur.append(note_d)
                ph_hz.append(hz)
                current_frame += max(1, round(note_d / f0_timestep))
            else:
                if self.language == "zh":
                    cons_dur = min(0.12, dur * 0.28 / max(1, p_len - 1))
                else:
                    cons_dur = min(0.10, dur * 0.28 / max(1, p_len - 1))
                vowel_dur = max(dur - cons_dur * (p_len - 1), dur * 0.55)

                zh_vowels = {
                    "a", "ai", "an", "ang", "ao",
                    "e", "ei", "en", "eng", "er",
                    "i", "i0", "ia", "ian", "iang", "iao", "ie",
                    "in", "ing", "iong", "ir", "iu",
                    "o", "ong", "ou",
                    "u", "ua", "uai", "uan", "uang", "ui", "un", "uo",
                    "v", "van", "ve", "vn",
                }
                en_vowels = {"ah","ow","iy","ey","aa","ao","er","uh","uw","ae"}
                vowel_set = zh_vowels if self.language == "zh" else en_vowels
                vowel_idx = next(
                    (i for i, p in enumerate(phonemes)
                     if p in vowel_set or (p and p[0] in "aeiouAEIOU")),
                    p_len - 1
                )
                for i, p in enumerate(phonemes):
                    d = vowel_dur if i == vowel_idx else cons_dur
                    ph_seq.append(p)
                    d_val = round(d, 4)
                    ph_dur.append(d_val)
                    ph_hz.append(hz)
                    current_frame += max(1, round(d_val / f0_timestep))
            
            note_end_f = current_frame
            note_ranges.append((note_start_f, note_end_f, hz))

            prev_end = start + dur

        if not ph_seq:
            return None

        # ── Pass 3: build f0_seq ALIGNED to ph_dur + smooth boundaries ────────
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
                f0_arr[start:i] = np.linspace(prev, prev * 0.15, i - start)

        # ── Note-Level Continuous Vibrato with soft fade-in/out ───────────────
        VIBRATO_HZ    = 5.5
        VIBRATO_CENTS = 20
        VIBRATO_DELAY = int(0.12 / f0_timestep)    # 120ms delay before vibrato begins
        MIN_VIBE_FRAMES = int(0.35 / f0_timestep)  # Note must be at least 350ms to have vibrato

        for (start_f, end_f, hz) in note_ranges:
            nf = end_f - start_f
            if hz > 0.0 and nf > MIN_VIBE_FRAMES:
                onset = start_f + VIBRATO_DELAY
                if onset < end_f:
                    vib_len = end_f - onset
                    t = np.arange(vib_len) * f0_timestep
                    cents = VIBRATO_CENTS * np.sin(2 * np.pi * VIBRATO_HZ * t)
                    
                    # Fade in vibrato over 100ms
                    fade_in_n = min(int(0.10 / f0_timestep), vib_len)
                    vib_env = np.ones(vib_len)
                    vib_env[:fade_in_n] = np.linspace(0.0, 1.0, fade_in_n)
                    cents *= vib_env
                    
                    # Fade out vibrato over 50ms at the end of the note for smooth transition
                    fade_out_n = min(int(0.05 / f0_timestep), vib_len)
                    if fade_out_n > 0:
                        cents[-fade_out_n:] *= np.linspace(1.0, 0.0, fade_out_n)
                        
                    ratio = 2.0 ** (cents / 1200.0)
                    f0_arr[onset:end_f] *= ratio.astype(np.float32)

        f0_seq = f0_arr.tolist()

        ds_item = {
            "text":        " ".join(ph_seq),
            "ph_seq":      " ".join(ph_seq),
            "ph_dur":      " ".join(f"{d:.4f}" for d in ph_dur),
            "f0_seq":      " ".join(f"{f:.2f}"  for f in f0_seq),
            "f0_timestep": str(f0_timestep),
        }

        try:
            temp_name = f"ds_out_{uuid.uuid4().hex}"
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = pathlib.Path(tmpdir)
                
                old_cwd = os.getcwd()
                os.chdir(self.DS_ROOT)
                try:
                    self.infer_ins.run_inference(
                        [ds_item],
                        out_dir=tmp_path,
                        title=temp_name,
                        save_mel=False,
                    )
                finally:
                    os.chdir(old_cwd)

                out_path = tmp_path / f"{temp_name}.wav"
                if out_path.exists():
                    audio, _ = librosa.load(str(out_path), sr=self.sr, mono=True)

                    try:
                        from scipy.signal import butter, sosfilt
                        sos_hp = butter(2, 80 / (self.sr / 2), btype='high', output='sos')
                        audio = sosfilt(sos_hp, audio).astype(np.float32)
                    except Exception:
                        pass

                    # Apply fade first to eliminate boundary clicks that ruin peak calculation
                    fade_n = min(int(0.010 * self.sr), len(audio) // 8)  # 10ms fade
                    if fade_n > 0:
                        fade = np.linspace(0.0, 1.0, fade_n)
                        audio[:fade_n]  *= fade
                        audio[-fade_n:] *= fade[::-1]

                    # Normalize and warm up the signal with soft tanh compression
                    peak = np.max(np.abs(audio))
                    if peak > 0.001:
                        # Increased saturation multiplier from 1.3 to 1.6 for more warmth and body, peak to 0.95
                        audio = np.tanh(audio / peak * 1.6) * 0.95

                    return audio
                else:
                    return None
        except Exception as e:
            import traceback
            traceback.print_exc()
            return None
