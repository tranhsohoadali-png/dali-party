#!/usr/bin/env bash
# Idempotent one-shot provisioning for the Dali Party Banner API (+ nginx wiring).
# Run on the VPS as root:
#   tr -d '\r' < /var/www/dalipart/server/setup.sh > /tmp/dali_setup.sh
#   nohup bash /tmp/dali_setup.sh > /tmp/dali_setup.log 2>&1 &
#   tail -f /tmp/dali_setup.log
set -e
export DEBIAN_FRONTEND=noninteractive
SRC=/var/www/dalipart/server
VENV=/opt/dali-api/venv
NGX=/etc/nginx/sites-available/dalipart

echo "[1/8] dirs"
mkdir -p /opt/dali-api/models /opt/dali-api/cache /var/www/dali-banner-data /var/www/dali-banner-data/mockups

echo "[2/8] apt python3-venv"
apt-get install -y python3-venv >/tmp/dali_apt.log 2>&1

echo "[3/8] venv + pip"
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip

echo "[4/8] pip install requirements (heavy: rembg + onnxruntime, a few minutes) ..."
"$VENV/bin/pip" install -q -r "$SRC/requirements.txt"

echo "[5/8] chown + warm u2net_human_seg model"
chown -R www-data:www-data /opt/dali-api/models /opt/dali-api/cache /var/www/dali-banner-data /var/www/dali-banner-data/mockups
sudo -u www-data env U2NET_HOME=/opt/dali-api/models "$VENV/bin/python" \
  -c "from rembg import new_session; new_session('u2net_human_seg'); print('model ready')" \
  || echo "WARN: model warm failed (will lazy-load on first request)"

echo "[6/8] systemd service (restart so re-running redeploys updated app.py)"
cp "$SRC/dali-api.service" /etc/systemd/system/dali-api.service
systemctl daemon-reload
systemctl enable dali-api || true
systemctl restart dali-api || systemctl enable --now dali-api
sleep 2
echo -n "dali-api active? "; systemctl is-active dali-api || true

echo "[7/8] nginx /api proxy + deny /.git,/server"
cp "$NGX" /tmp/dalipart.nginx.bak
python3 - "$NGX" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
block = '''
    location = /api/health { proxy_pass http://127.0.0.1:8019; }
    location /api/admin/ {
        auth_basic "Khu vuc quan tri Dali Party";
        auth_basic_user_file /etc/nginx/.dali_admin;
        client_max_body_size 14m;
        proxy_pass http://127.0.0.1:8019;
        proxy_set_header Host $host;
        proxy_read_timeout 120s;
    }
    location /api/ {
        client_max_body_size 14m;
        proxy_pass http://127.0.0.1:8019;
        proxy_set_header Host $host;
        proxy_read_timeout 120s;
    }
    location ~ ^/(\\.git|server)(/|$) { return 404; }
'''
anchor = '    location ~ ^/(.+)\\.html$ {'
if '127.0.0.1:8019' in s:
    print('NGINX_ALREADY')
elif '127.0.0.1:8000' in s:
    # cập nhật cấu hình cũ (đã trỏ 8000) sang cổng mới 8019
    open(p, 'w', encoding='utf-8').write(s.replace('127.0.0.1:8000', '127.0.0.1:8019'))
    print('NGINX_PORT_UPDATED')
elif anchor in s:
    open(p, 'w', encoding='utf-8').write(s.replace(anchor, block + '\n' + anchor, 1))
    print('NGINX_INSERTED')
else:
    print('NGINX_ANCHOR_NOT_FOUND')
PY
if nginx -t 2>/tmp/dali_ngt; then systemctl reload nginx && echo NGINX_RELOADED; else echo NGINX_FAIL; cat /tmp/dali_ngt; cp /tmp/dalipart.nginx.bak "$NGX" && echo NGINX_RESTORED; fi

echo "[8/8] verify"
echo -n "health(local): "; curl -s http://127.0.0.1:8019/api/health || echo "(no response)"
echo
echo -n "health(public): "; curl -s --resolve dalipart.tranhdali.vn:443:127.0.0.1 https://dalipart.tranhdali.vn/api/health -k 2>/dev/null || echo "(via nginx — check after)"
echo
echo "SETUP_COMPLETE"
