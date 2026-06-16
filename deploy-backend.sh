#!/bin/bash
# Deployment script for Google Cloud Run
# Usage: ./deploy-backend.sh [PROJECT_ID]

PROJECT_ID=$1
REGION="asia-southeast1" # Or your preferred region

if [ -z "$PROJECT_ID" ]; then
  echo "Error: Please provide your Google Cloud Project ID."
  echo "Usage: ./deploy-backend.sh <gcp-project-id>"
  exit 1
fi

echo "Deploying Vocalido Server (Python) to Google Cloud Run..."
gcloud run deploy vocalido-server \
  --source ./vocalido_server \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --port 5001 \
  --memory 2Gi \
  --cpu 1

echo "Deploying OMR Server (Node.js) to Google Cloud Run..."
gcloud run deploy omr-server \
  --source . \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --port 3003 \
  --memory 2Gi \
  --cpu 1

echo "Deployment complete! Please note the Service URLs above and update your vite.config.ts accordingly."
