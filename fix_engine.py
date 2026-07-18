import os

file_path = "/Users/paisan/vocamind-projects/Memolody_V2/vocalido_server/ds_onnx_engine.py"
with open(file_path, "r") as f:
    lines = f.readlines()

# Find where synthesize_mel_fallback ends
idx = 0
for i, line in enumerate(lines):
    if "def _apply_post_processing(self, audio, params):" in line:
        idx = i
        break

# The lines before _apply_post_processing should be the synthesize_mel_fallback and _run_vocoder
# Let's completely rewrite synthesize_mel_fallback and _run_vocoder

# We will just read up to "def synthesize_mel_fallback"
idx_synth = 0
for i, line in enumerate(lines):
    if "def synthesize_mel_fallback" in line:
        idx_synth = i
        break

with open(file_path, "w") as f:
    f.writelines(lines[:idx_synth])
    
    f.write('''    def synthesize_mel_fallback(self, f0_list, phonemes, ph_durations, params=None):
        try:
            n_frames = sum(ph_durations)
            inputs = {
                "tokens": np.array([phonemes], dtype=np.int64),
                "durations": np.array([ph_durations], dtype=np.int64),
            }
            if self.has_f0:
                f0_np = np.array(f0_list, dtype=np.float32).reshape(1, -1)
                inputs["f0"] = f0_np
            
            input_names = [inp.name for inp in self.sess_acoustic.get_inputs()]
            
            if "spk_embed" in input_names:
                spk_embed_data = None
                if params and "spk_embed" in params:
                    spk_embed_data = np.array(params["spk_embed"], dtype=np.float32)
                
                spk_embed_node = [inp for inp in self.sess_acoustic.get_inputs() if inp.name == "spk_embed"][0]
                embed_dim = 256
                if len(spk_embed_node.shape) == 2:
                    embed_dim = spk_embed_node.shape[1]
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

            mel = self.sess_acoustic.run(["mel"], inputs)[0]
            audio = self._run_vocoder(mel, f0_list)
            return self._apply_post_processing(audio, params)
        except Exception as e:
            print(f"[ONNXEngine] ❌ Fallback acoustic synthesis failed: {e}")
            import traceback
            traceback.print_exc()
            return None
        finally:
            import gc
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass

    def _run_vocoder(self, audio_mel, f0_midi_arr=None):
        try:
            if getattr(self, "vocos_pt", None) is not None:
                import torch
                with torch.no_grad():
                    mel_tensor = torch.from_numpy(audio_mel).unsqueeze(0).to(self.vocos_pt.device)
                    audio_out = self.vocos_pt(mel_tensor)
                    return audio_out.cpu().numpy().flatten()
            elif getattr(self, "sess_vocoder", None) is not None:
                if self.vocoder_needs_f0 and f0_midi_arr is not None:
                    f0_padded = np.zeros((1, audio_mel.shape[1]), dtype=np.float32)
                    min_len = min(audio_mel.shape[1], len(f0_midi_arr))
                    f0_padded[0, :min_len] = f0_midi_arr[:min_len]
                    voc_inputs = {"mel": audio_mel, "f0": f0_padded}
                else:
                    voc_inputs = {"mel": audio_mel}
                
                audio_out = self.sess_vocoder.run([self.vocoder_output_name], voc_inputs)[0]
                return audio_out.flatten()
            else:
                print("[ONNXEngine] No valid vocoder found!")
                return None
        except Exception as e:
            print(f"[ONNXEngine] Vocoder inference failed: {e}")
            import traceback
            traceback.print_exc()
            return None

''')
    
    # Write the remaining lines from _apply_post_processing to the end
    f.writelines(lines[idx:])
    
