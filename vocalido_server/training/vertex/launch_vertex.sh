#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Vocalido SVS — Vertex AI Training Launcher (A100 Optimized)
# ═══════════════════════════════════════════════════════════════════

# ── Configuration (EDIT THESE) ──────────────────────────────────────
PROJECT_ID="memolody-v2-project"
REGION="us-central1"
BUCKET="vocalido-master-corpus-v1"
IMAGE_NAME="vocalido-trainer-a100"
MACHINE_TYPE="a2-highgpu-1g"  # 1x NVIDIA A100
# ───────────────────────────────────────────────────────────────────

echo "🚀 Preparing Vocalido Training Deployment for Vertex AI in ${REGION}..."

# 1. Check if authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
    echo "❌ Error: Not logged in to gcloud. Run 'gcloud auth login' first."
    exit 1
fi

# 2. Build and Push Docker Image using Cloud Build (No local Docker needed!)
echo "📦 Building Docker image on Google Cloud..."
IMAGE_TAG="gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest"

# Ensure Cloud Build API is ready
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable aiplatform.googleapis.com

# Submit to Cloud Build
gcloud builds submit --tag ${IMAGE_TAG} ./vocalido_server/training/vertex/


# 3. Launch Vertex AI Custom Job
echo "🎯 Launching Custom Training Job on Vertex AI..."
echo "   Machine: ${MACHINE_TYPE} (${REGION})"
echo "   Target: 60,000 steps"

gcloud ai custom-jobs create \
    --region=${REGION} \
    --display-name="vocalido-singing-60k-a100" \
    --config=- <<EOF
workerPoolSpecs:
  machineSpec:
    machineType: ${MACHINE_TYPE}
    acceleratorType: NVIDIA_TESLA_T4
    acceleratorCount: 1
  replicaCount: 1
  containerSpec:
    imageUri: ${IMAGE_TAG}
EOF

echo ""
echo "✅ Job Submitted Successfully!"
echo "🔗 Check progress here: https://console.cloud.google.com/vertex-ai/training/custom-jobs?project=${PROJECT_ID}"
echo "💡 You can now safely close your computer. The AI will stop automatically at 60k steps."
