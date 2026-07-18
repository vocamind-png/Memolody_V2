import os

file_path = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py"
with open(file_path, "r") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "def _apply_post_processing(self, audio, params):" in line:
        new_lines.append("""
    def _run_vocoder(self, audio_mel, f0_midi_arr=None):
        try:
            if getattr(self, 'vocos_pt', None) is not None:
                import torch
                with torch.no_grad():
                    mel_tensor = torch.from_numpy(audio_mel).unsqueeze(0).to(self.vocos_pt.device)
                    audio_out = self.vocos_pt(mel_tensor)
                    return audio_out.cpu().numpy().flatten()
            elif getattr(self, 'sess_vocoder', None) is not None:
                if self.vocoder_needs_f0 and f0_midi_arr is not None:
                    f0_padded = np.zeros((1, audio_mel.shape[1]), dtype=np.float32)
                    min_len = min(audio_mel.shape[1], len(f0_midi_arr))
                    f0_padded[0, :min_len] = f0_midi_arr[:min_len]
                    voc_inputs = {'mel': audio_mel, 'f0': f0_padded}
                else:
                    voc_inputs = {'mel': audio_mel}
                
                audio_out = self.sess_vocoder.run([self.vocoder_output_name], voc_inputs)[0]
                return audio_out.flatten()
            else:
                return None
        except Exception as e:
            print(f"[ONNXEngine] Vocoder inference failed: {e}")
            import traceback
            traceback.print_exc()
            return None

""")
    new_lines.append(line)

with open(file_path, "w") as f:
    f.writelines(new_lines)
