#!/bin/bash
# Deploy relay server to GCP VM

set -e

VM_NAME="${GCP_VM_NAME:-instance-20250103-074648}"
ZONE="${GCP_ZONE:-us-central1-a}"
PROJECT="${GCP_PROJECT:-ai-studio-449005}"

echo "Deploying relay server to $VM_NAME in $ZONE..."

# Copy server.js to VM
echo "Uploading relay/server.js..."
gcloud compute scp server.js $VM_NAME:~/relay-server.js \
  --zone=$ZONE \
  --project=$PROJECT

# Start relay server with pm2
echo "Starting relay server..."
gcloud compute ssh $VM_NAME \
  --zone=$ZONE \
  --project=$PROJECT \
  --command="
    # Install pm2 if not present
    if ! command -v pm2 &> /dev/null; then
      echo 'Installing pm2...'
      npm install -g pm2
    fi

    # Stop existing relay if running
    pm2 delete relay 2>/dev/null || true

    # Start relay
    pm2 start ~/relay-server.js --name relay
    pm2 save

    # Setup startup script
    pm2 startup | tail -n 1 | bash || true

    echo 'Relay server deployed successfully!'
    pm2 status
  "

# Test health endpoint
echo ""
echo "Testing relay health endpoint..."
sleep 2
curl -s http://35.224.127.4:8889/health | jq . || echo "Health check failed"

echo ""
echo "Deployment complete! Relay available at http://35.224.127.4:8889"
