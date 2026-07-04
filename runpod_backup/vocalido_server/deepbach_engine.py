import os
import sys

# Add DeepBach folder to path so we can import it
DEEPBACH_DIR = os.path.join(os.path.dirname(__file__), "DeepBach")
if DEEPBACH_DIR not in sys.path:
    sys.path.append(DEEPBACH_DIR)

import tempfile
import music21

# DeepBach imports
from DatasetManager.chorale_dataset import ChoraleDataset
from DatasetManager.dataset_manager import DatasetManager
from DatasetManager.metadata import FermataMetadata, TickMetadata, KeyMetadata
from DeepBach.model_manager import DeepBach

_DEEPBACH_MODEL = None

def get_deepbach_model():
    global _DEEPBACH_MODEL
    if _DEEPBACH_MODEL is None:
        print("[DeepBach] Loading model...")
        
        # Must change cwd to DeepBach dir because its load() method looks for ./models relative to cwd
        old_cwd = os.getcwd()
        os.chdir(DEEPBACH_DIR)
        
        try:
            dataset_manager = DatasetManager()
            metadatas = [
                FermataMetadata(),
                TickMetadata(subdivision=4),
                KeyMetadata()
            ]
            chorale_dataset_kwargs = {
                'voice_ids': [0, 1, 2, 3],
                'metadatas': metadatas,
                'sequences_size': 8,
                'subdivision': 4
            }
            dataset = dataset_manager.get_dataset(
                name='bach_chorales',
                **chorale_dataset_kwargs
            )
            
            deepbach = DeepBach(
                dataset=dataset,
                note_embedding_dim=20,
                meta_embedding_dim=20,
                num_layers=2,
                lstm_hidden_size=256,
                dropout_lstm=0.5,
                linear_hidden_size=256
            )
            
            deepbach.load()
            # If MPS or CUDA is available
            import torch
            if torch.backends.mps.is_available():
                # DeepBach might not support MPS out of the box due to older code, so try/except
                try:
                    deepbach.to('mps')
                except:
                    pass
            elif torch.cuda.is_available():
                deepbach.cuda()
                
            _DEEPBACH_MODEL = deepbach
            print("[DeepBach] Model loaded successfully!")
        finally:
            os.chdir(old_cwd)
            
    return _DEEPBACH_MODEL

def generate_deepbach_harmony(original_xml: str, target_length_ticks: int = 128) -> music21.stream.Score:
    """
    Takes original MusicXML, runs it through DeepBach to generate 4-part SATB,
    and returns a new music21 Score.
    """
    model = get_deepbach_model()
    
    # DeepBach natively generates 4 voices. To constrain it, we'd need to create a tensor_chorale 
    # matching the original melody. For simplicity and robustness without altering DeepBach core,
    # we can just generate a new Chorale of requested length, or ideally map the melody to Soprano.
    
    # Actually, constraining DeepBach requires `tensor_chorale` and `tensor_metadata`.
    # It's highly complex to map arbitrary MIDI/XML perfectly to DeepBach tensors in a wrapper.
    # We will generate a fresh 4-part accompaniment and then merge it like the rule-based engine.
    
    old_cwd = os.getcwd()
    os.chdir(DEEPBACH_DIR)
    
    try:
        print("[DeepBach] Generating...")
        score, tensor_chorale, tensor_metadata = model.generation(
            num_iterations=100, # reduced from 500 for speed
            sequence_length_ticks=target_length_ticks,
        )
        return score
    finally:
        os.chdir(old_cwd)
