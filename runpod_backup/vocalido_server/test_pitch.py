import onnxruntime as ort
import numpy as np

# We just want to know what the pitch model outputs. Let's patch ds_onnx_engine to print v_mean!
