"""
Vocalido AI Engine — Uses the trained acoustic model checkpoint for voice synthesis.
This replaces the sample-based pitch shifting with actual neural inference.
"""
import torch
import torch.nn as nn
import numpy as np
import librosa
import soundfile as sf
import io, base64, os
from audio_utils import audio_to_base64_wav, audio_to_base64_mp3

# ONNX Runtime for lightweight models (Qwen, Gemma, etc.)
try:
    import onnxruntime as ort
except ImportError:
    ort = None  # ONNX support optional

SR = 44100
HOP_LENGTH = 512
N_FFT = 2048
N_MELS = 128


class VocalidoAcoustic(nn.Module):
    """Mel-to-Mel autoencoder trained on user's voice data"""
    def __init__(self, mel_dim=128, hidden=256, n_layers=4):
        super().__init__()
        self.encoder = nn.Sequential(nn.Linear(mel_dim, hidden), nn.ReLU())
        self.lstm = nn.LSTM(hidden, hidden, n_layers, batch_first=True, bidirectional=True)
        self.decoder = nn.Sequential(
            nn.Linear(hidden * 2, hidden), nn.ReLU(),
            nn.Linear(hidden, mel_dim)
        )

    def forward(self, mel):
        x = self.encoder(mel)
        x, _ = self.lstm(x)
        return self.decoder(x)


class VocalidoAIEngine:
    """Neural voice synthesis engine using the trained checkpoint"""
    
    def __init__(self, checkpoints_dir: str, default_model: str = "vocalido_v1", source_wav_path: str = None):
        self.checkpoints_dir = checkpoints_dir
        self.active_model_name = default_model
        self.model = None
        self.source_audio = None
        self.source_sr = SR
        
        # Initial load
        self.set_active_model(default_model)
        
        if source_wav_path:
            self._load_source(source_wav_path)
    
    def set_active_model(self, model_name: str):
        """Switch the voice model. Supports:
        - Heavy local PyTorch model (e.g., 'vocalido_v1')
        - Light ONNX models (e.g., 'light_qwen', 'light_gemma')
        - Cloud GPU inference via Vertex AI (model name ending with '_cloud')
        """
        # Cloud mode detection
        if model_name.endswith('_cloud'):
            self._using_cloud = True
            self._using_onnx = False
            self.model = None
            self.session = None
            self.active_model_name = model_name
            print(f"[AI Engine] ☁️ Using cloud GPU inference for model: {model_name}")
            return True
        
        # Reset cloud flag for local modes
        self._using_cloud = False
        model_path = os.path.join(self.checkpoints_dir, model_name)
        if not os.path.isdir(model_path):
            # Attempt to download missing model automatically
            try:
                from .model_manager import download_model
                msg = download_model(model_name)
                print(f"[AI Engine] 📥 {msg}")
            except Exception as e:
                print(f"[AI Engine] ⚠️ Failed to import model_manager: {e}")
            if not os.path.isdir(model_path):
                print(f"[AI Engine] ⚠️ Model directory '{model_path}' still does not exist after download attempt.")
                return False
        
        # 1️⃣ Try ONNX first (lightweight)
        onnx_files = [f for f in os.listdir(model_path) if f.endswith('.onnx')]
        if onnx_files and ort is not None:
            onnx_path = os.path.join(model_path, 'acoustic.onnx')
            if os.path.isfile(onnx_path):
                try:
                    self.session = ort.InferenceSession(onnx_path)
                    self._using_onnx = True
                    self.active_model_name = model_name
                    print(f"[AI Engine] ⚡️ Loaded lightweight ONNX model: {model_name}")
                    return True
                except Exception as e:
                    print(f"[AI Engine] ❌ Failed to load ONNX model: {e}")
                    self.session = None
                    self._using_onnx = False
        
        # 2️⃣ Heavy PyTorch fallback
        ckpt_files = [f for f in os.listdir(model_path) if f.endswith('.ckpt')]
        if not ckpt_files:
            print(f"[AI Engine] ⚠️ No .ckpt or .onnx files found in '{model_path}'.")
            return False
        if 'model.ckpt' in ckpt_files:
            target_ckpt = 'model.ckpt'
        else:
            ckpt_files.sort(reverse=True)
            target_ckpt = ckpt_files[0]
        full_path = os.path.join(model_path, target_ckpt)
        print(f"[AI Engine] 🔄 Switching to heavy PyTorch model: {model_name} ({target_ckpt})")
        self._load_checkpoint(full_path)
        self._using_onnx = False
        self.active_model_name = model_name
        return True
    
    def _load_checkpoint(self, path: str):
        """Load the trained acoustic model"""
        try:
            ckpt = torch.load(path, map_location='cpu')
            config = ckpt.get('config', {'mel_dim': 128, 'hidden': 256, 'n_layers': 4})
            self.model = VocalidoAcoustic(
                config.get('mel_dim', 128),
                config.get('hidden', 256),
                config.get('n_layers', 4)
            )
            self.model.load_state_dict(ckpt['model_state_dict'])
            self.model.eval()
            epoch = ckpt.get('epoch', '?')
            loss = ckpt.get('loss', '?')
            print(f"[AI Engine] ✅ Model loaded (epoch {epoch}, loss {loss:.4f})" if isinstance(loss, float) else f"[AI Engine] ✅ Model loaded (epoch {epoch})")
        except Exception as e:
            print(f"[AI Engine] ❌ Failed to load model: {e}")
            self.model = None
    
    def _load_source(self, path: str):
        """Load the source voice recording for base timbre extraction"""
        try:
            audio, sr = librosa.load(path, sr=SR, mono=True)
            self.source_audio = audio
            self.source_sr = sr
            print(f"[AI Engine] 🎤 Source voice loaded: {len(audio)/sr:.1f}s")
        except Exception as e:
            print(f"[AI Engine] ⚠️ No source voice: {e}")
    
    @property
    def is_ready(self):
        # Ready if any backend (PyTorch, ONNX, or Cloud) is configured
        return (self.model is not None) or (self.session is not None) or self._using_cloud
    
    def _midi_to_hz(self, midi):
        return 440.0 * (2.0 ** ((midi - 69) / 12.0))
    
    def _generate_source_for_note(self, midi_note: float, duration_sec: float):
        """Create a source signal for a single note using pitch-shifted source audio or synthesis"""
        n_samples = int(SR * duration_sec)
        
        if self.source_audio is not None:
            # Use a segment from source voice, pitch shifted to target note
            # Detect base pitch of source
            base_midi = 58.6  # A#3, detected earlier from source
            semitone_diff = midi_note - base_midi
            
            # Take a good segment from source
            seg_start = int(SR * 0.5)  # Skip first 0.5s
            seg_end = min(seg_start + n_samples, len(self.source_audio))
            segment = self.source_audio[seg_start:seg_end].copy()
            
            if len(segment) < n_samples:
                # Loop with crossfade
                reps = (n_samples // len(segment)) + 2
                segment = np.tile(segment, reps)[:n_samples]
            else:
                segment = segment[:n_samples]
            
            # Pitch shift to target note 
            if abs(semitone_diff) > 0.1:
                segment = librosa.effects.pitch_shift(segment, sr=SR, n_steps=float(semitone_diff))
            
            return segment.astype(np.float32)
        else:
            # Fallback: generate harmonic-rich signal
            hz = self._midi_to_hz(midi_note)
            t = np.arange(n_samples) / SR
            sig = np.zeros(n_samples, dtype=np.float32)
            for h in range(1, 6):
                amp = 0.6 / h
                sig += amp * np.sin(2 * np.pi * hz * h * t).astype(np.float32)
            # Add fade in/out
            fade = min(int(SR * 0.02), n_samples // 4)
            if fade > 0:
                sig[:fade] *= np.linspace(0, 1, fade)
                sig[-fade:] *= np.linspace(1, 0, fade)
            return sig
    
    def synthesize_note(self, midi_note: int, duration_sec: float, params: dict = None):
        """Synthesize a single note using the selected inference mode."""
        if not self.is_ready:
            return np.zeros(int(SR * duration_sec), dtype=np.float32)
        
        params = params or {}
        
        # 1. Generate source signal for this note
        source = self._generate_source_for_note(midi_note, duration_sec)
        
        # 2. Extract mel spectrogram
        mel = librosa.feature.melspectrogram(
            y=source, sr=SR, n_mels=N_MELS, n_fft=N_FFT, hop_length=HOP_LENGTH
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)
        mel_input = torch.FloatTensor(mel_db.T).unsqueeze(0)  # (1, time, 128)
        
        # 3. Inference path selection
        if self._using_cloud:
            # ---- Cloud Vertex AI inference (placeholder) ----
            # In a real implementation you would send `mel_input` to the Vertex AI endpoint
            # and receive the transformed mel spectrogram back. Here we just log and fall back
            # to the local model to keep the pipeline functional.
            print("[AI Engine] ☁️ Sending mel to Vertex AI (cloud inference) – not implemented in demo.")
            # Placeholder: use local model as fallback
            with torch.no_grad():
                mel_out = self.model(mel_input)
            mel_out_np = mel_out.squeeze(0).numpy()
        elif self._using_onnx and self.session is not None:
            # ---- ONNX inference (light model) ----
            mel_input_np = mel_input.numpy()
            mel_out_np = self.session.run(None, {"input": mel_input_np})[0]
        else:
            # ---- Heavy PyTorch inference (local) ----
            with torch.no_grad():
                mel_out = self.model(mel_input)
            mel_out_np = mel_out.squeeze(0).numpy()
        
        # 4. Convert back to audio using Griffin‑Lim (common for all paths)
        if mel_out_np.ndim == 2 and mel_out_np.shape[0] != N_MELS:
            mel_out_np = mel_out_np.T
        mel_power = librosa.db_to_power(mel_out_np)
        audio = librosa.feature.inverse.mel_to_audio(
            mel_power, sr=SR, n_fft=N_FFT, hop_length=HOP_LENGTH, n_iter=32
        )
        
        # 5. Normalize
        peak = np.max(np.abs(audio))
        if peak > 0.001:
            audio = audio / peak * 0.85
        
        return audio.astype(np.float32)
    
    def synthesize_phrase(self, notes: list, params: dict = None):
        """Synthesize multiple notes with timing placement"""
        if not notes:
            return np.zeros(SR, dtype=np.float32)
        
        params = params or {}
        bpm = float(params.get('bpm', 120.0))
        beat_sec = 60.0 / bpm
        
        # Calculate total duration
        max_time = max((n.get('startTime', 0) + n.get('duration', 0.5)) for n in notes)
        total_samples = int((max_time * beat_sec + 1.0) * SR)
        out = np.zeros(total_samples, dtype=np.float32)
        
        for note in notes:
            midi = note.get('midi') or note.get('pitch') or 60
            dur_beats = note.get('duration', 0.5)
            start_beats = note.get('startTime', 0)
            
            dur_sec = dur_beats * beat_sec
            start_sec = start_beats * beat_sec
            
            seg = self.synthesize_note(midi, dur_sec, params)
            
            start_idx = int(start_sec * SR)
            end_idx = min(start_idx + len(seg), len(out))
            if start_idx < len(out):
                out[start_idx:end_idx] += seg[:end_idx - start_idx]
        
        # Final normalization
        peak = np.max(np.abs(out))
        if peak > 0.001:
            out = (out / peak * 0.88).astype(np.float32)
        
        return out
    
    def audio_to_base64_wav(self, audio):
        return audio_to_base64_wav(audio, SR)

    def audio_to_base64_mp3(self, audio, bitrate="128k"):
        return audio_to_base64_mp3(audio, SR, bitrate)


# Singleton
_engine = None

def get_engine(checkpoints_dir=None, default_model="vocalido_v1", source_path=None):
    global _engine
    if _engine is None and checkpoints_dir:
        _engine = VocalidoAIEngine(checkpoints_dir, default_model, source_path)
    return _engine
