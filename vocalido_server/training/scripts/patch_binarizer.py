import pathlib

p = pathlib.Path("/workspace/DiffSinger/preprocessing/acoustic_binarizer.py")
code = p.read_text()
code = code.replace(
    """        dec_waveform = DecomposedWaveform(
            workspace=self.binary_data_dir,
            algorithm=hparams['hnsep'],
            model_path=hparams['hnsep_ckpt'],
            device=self.device
        )""",
    """        dec_waveform = None if not hparams['hnsep'] else DecomposedWaveform(
            workspace=self.binary_data_dir,
            algorithm=hparams['hnsep'],
            model_path=hparams['hnsep_ckpt'],
            device=self.device
        )"""
)
code = code.replace(
    "dec_waveform.harmonic(wav, sample_rate)",
    "wav"
)
code = code.replace(
    "dec_waveform.base_harmonic(wav, sample_rate)",
    "wav"
)
code = code.replace(
    "dec_waveform.noise(wav, sample_rate)",
    "wav"
)
p.write_text(code)
print("Patched successfully!")
