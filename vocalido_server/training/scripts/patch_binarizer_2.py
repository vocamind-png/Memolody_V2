import pathlib

p = pathlib.Path("/workspace/DiffSinger/preprocessing/acoustic_binarizer.py")
code = p.read_text()
old_code = """        dec_waveform = DecomposedWaveform(
            waveform, samplerate=hparams['audio_sample_rate'], f0=gt_f0 * ~uv,
            hop_size=hparams['hop_size'], fft_size=hparams['fft_size'], win_size=hparams['win_size'],
            algorithm=hparams['hnsep']
        )"""
new_code = """        dec_waveform = None"""
if old_code in code:
    code = code.replace(old_code, new_code)
    
code = code.replace("dec_waveform.harmonic()", "waveform")
code = code.replace("dec_waveform.base_harmonic()", "waveform")
code = code.replace("dec_waveform.noise()", "waveform")
p.write_text(code)
print("Patched successfully!")
