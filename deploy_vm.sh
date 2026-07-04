#!/bin/bash
set -e

echo "=== 1. Installing Cloudflared ==="
if ! command -v cloudflared &> /dev/null; then
  wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i cloudflared-linux-amd64.deb
  rm cloudflared-linux-amd64.deb
else
  echo "Cloudflared already installed."
fi

echo "=== 2. Cloning/Updating Repository ==="
REPO_DIR="/home/maqso/FractalSwarm-SRE"
if [ ! -d "$REPO_DIR" ]; then
  git clone https://github.com/Maqsood32595/FractalSwarm-SRE.git "$REPO_DIR"
else
  cd "$REPO_DIR"
  git fetch --all
  git reset --hard origin/main
fi

echo "=== 3. Installing Dependencies ==="
cd "$REPO_DIR"
npm install

echo "=== 4. Setting up Systemd Services ==="
sudo tee /etc/systemd/system/fractalswarm.service > /dev/null << 'INNER_EOF'
[Unit]
Description=FractalSwarm Control Plane Service
After=network.target

[Service]
Type=simple
User=maqso
WorkingDirectory=/home/maqso/FractalSwarm-SRE
ExecStart=/usr/bin/npm run dev
Restart=always
Environment=PORT=3002

[Install]
WantedBy=multi-user.target
INNER_EOF

sudo tee /etc/systemd/system/fractalswarm-tunnel.service > /dev/null << 'INNER_EOF'
[Unit]
Description=FractalSwarm Cloudflare Tunnel
After=fractalswarm.service

[Service]
Type=simple
User=maqso
ExecStart=/usr/bin/cloudflared tunnel --url http://127.0.0.1:3002
Restart=always

[Install]
WantedBy=multi-user.target
INNER_EOF

echo "=== 5. Enabling and Starting Services ==="
sudo systemctl daemon-reload
sudo systemctl enable fractalswarm.service
sudo systemctl restart fractalswarm.service
sudo systemctl enable fractalswarm-tunnel.service
sudo systemctl restart fractalswarm-tunnel.service

echo "=== 6. Extracting Tunnel URL ==="
sleep 15
TUNNEL_URL=$(sudo journalctl -u fractalswarm-tunnel.service -n 50 | grep -o -E "https://[a-zA-Z0-9.-]+\.trycloudflare\.com" | head -n 1)

if [ -n "$TUNNEL_URL" ]; then
  echo "=========================================================="
  echo "🚀 DEPLOYMENT SUCCESSFUL!"
  echo "Your application is hosted at: $TUNNEL_URL"
  echo "=========================================================="
else
  echo "⚠️ Tunnel started but URL not found in logs yet. Run this command to see the URL:"
  echo "sudo journalctl -u fractalswarm-tunnel.service -n 100"
fi
