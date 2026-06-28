#!/usr/bin/env bash
# Idempotent one-shot provisioning for the Dali Party Banner API.
# Run on the VPS as root:  nohup bash /var/www/dalipart/server/setup.sh > /tmp/dali_setup.log 2>&1 &
set -e
export DEBIAN_FRONTEND=noninteractive
SRC=/var/www/dalipart/server
VENV=/opt/dali-api/venv

echo "[1/6] dirs"
mkdir -p /opt/dali-api/models /opt/dali-api/cache /var/www/dali-banner-data

echo "[2/6] apt python3-venv"
apt-get install -y python3-venv >/tmp/dali_apt.log 2>&1

echo "[3/6] venv + pip"
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip

echo "[4/6] pip install requirements (heavy: rembg + onnxruntime, may take a few minutes) ..."
"$VENV/bin/pip" install -q -r "$SRC/requirements.txt"

echo "[5/6] chown + warm the u2net_human_seg model"
chown -R www-data:www-data /opt/dali-api/models /opt/dali-api/cache /var/www/dali-banner-data
sudo -u www-data env U2NET_HOME=/opt/dali-api/models "$VENV/bin/python" \
  -c "from rembg import new_session; new_session('u2net_human_seg'); print('model ready')" || echo "WARN: model warm failed (will lazy-load on first request)"

echo "[6/6] systemd service"
cp "$SRC/dali-api.service" /etc/systemd/system/dali-api.service
systemctl daemon-reload
systemctl enable --now dali-api
sleep 2
echo -n "dali-api active? "; systemctl is-active dali-api || true
echo -n "health: "; curl -s http://127.0.0.1:8000/api/health || echo "(no response yet)"
echo
echo "SETUP_COMPLETE"
