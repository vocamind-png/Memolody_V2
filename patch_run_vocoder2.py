import os

file_path = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py"
with open(file_path, "r") as f:
    content = f.read()

old_code = """    def _run_vocoder(self, audio_mel, f0_midi_arr=None):
        try:
            if getattr(self, 'vocos_pt', None) is not None:
                import torch
                with torch.no_grad():
                    mel_tensor = torch.from_numpy(audio_mel).unsqueeze(0).to(self.vocos_pt.device)
                    audio_out = self.vocos_pt(mel_tensor)"""

new_code = """    def _run_vocoder(self, audio_mel, f0_midi_arr=None):
        try:
            if getattr(self, 'vocos_pt', None) is not None:
                import torch
                with torch.no_grad():
                    # Ensure mel is exactly [1, frames, mel_bins]
                    mel_tensor = torch.from_numpy(audio_mel).squeeze().unsqueeze(0).to(self.vocos_pt.device)
                    audio_out = self.vocos_pt(mel_tensor)"""

content = content.replace(old_code, new_code)

with open(file_path, "w") as f:
    f.write(content)
