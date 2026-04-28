# --------------------------------------------------------------
# Dockerfile for Vocalido training on Vertex AI (A100)
# --------------------------------------------------------------
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# ---- basic utilities -------------------------------------------------
RUN apt-get update && apt-get install -y \
    git curl wget ca-certificates vim && \
    rm -rf /var/lib/apt/lists/*

# ---- Miniconda --------------------------------------------------------
ENV CONDA_DIR=/opt/conda
RUN curl -sSL https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -o miniconda.sh && \
    bash miniconda.sh -b -p $CONDA_DIR && rm miniconda.sh
ENV PATH=$CONDA_DIR/bin:$PATH

# ---- environment -------------------------------------------------------
COPY environment.yml /tmp/environment.yml
RUN conda env create -f /tmp/environment.yml && conda clean -afy

# ---- set default env ---------------------------------------------------
ENV CONDA_DEFAULT_ENV=vocalido-env
ENV PATH=$CONDA_DIR/envs/vocalido-env/bin:$PATH

# ---- copy source code --------------------------------------------------
COPY . /app
WORKDIR /app

# ---- entrypoint (optional) --------------------------------------------
# ENTRYPOINT ["python", "mac_m4_live_dashboard.py"]
