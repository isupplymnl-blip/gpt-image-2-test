#!/bin/bash
# Deploy relay server to GCP VM
# Run this from Git Bash or WSL on Windows

set -e

VM_NAME="instance-20250103-074648"
ZONE="us-central1-a"
PROJECT="ai-studio-449005"
VM_IP="35.224.127.4"

echo "=== Deploying Relay Server to GCP VM ==="
echo "VM: $VM_NAME"
echo "Zone: $ZONE"
echo "IP: $VM_IP"
echo ""

# Step 1: Upload server.js
echo "[1/3] Uploading relay/server.js..."
gcloud compute scp relay/server.js $VM_NAME:~/relay-server.js \
  --zone=$ZONE \
  --project=$PROJECT

# Step 2: Install pm2 and start relay
echo "[2/3] Starting relay server with pm2..."
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

    # Start relay on port 8889
    PORT=8889 pm2 start ~/relay-server.js --name relay

    # Save pm2 config
    pm2 save

    # Setup auto-start on reboot
    sudo env PATH=\$PATH:/usr/bin pm2 startup systemd -u \$USER --hp \$HOME || true

    echo ''
    echo 'Relay server started!'
    pm2 list
  "

# Step 3: Test health endpoint
echo "[3/3] Testing relay health endpoint..."
sleep 2
curl -s http://$VM_IP:8889/health

echo ""
echo "✓ Deployment complete!"
echo "✓ Relay available at: http://$VM_IP:8889"
echo ""
echo "Next: Restart your Next.js dev server to pick up RELAY_URL env var"
