# Dali Party — Banner builder backend

FastAPI service that powers the customer banner builder:
- `POST /api/banner/remove-bg` — AI background removal (rembg `u2net_human_seg`).
- `POST /api/banner/request` — store a customer request (photo + cutout + composite + info).
- `GET  /api/admin/banner/list` and `/api/admin/banner/{id}/{photo|cutout|composite}` — admin (behind nginx Basic Auth).
- `POST /api/admin/banner/{id}/status` — update status.

Runs on the VPS at `127.0.0.1:8000`, reverse-proxied by nginx under `/api/`.
Code lives in the repo (`server/`) and is auto-deployed to `/var/www/dalipart/server`; the
`dali-deploy` timer restarts `dali-api` when `server/` changes.

## One-time VPS setup
```bash
# venv + deps (separate from the web root so git reset --hard never touches it)
sudo mkdir -p /opt/dali-api/models /opt/dali-api/cache /var/www/dali-banner-data
sudo python3 -m venv /opt/dali-api/venv
sudo /opt/dali-api/venv/bin/pip install --upgrade pip
sudo /opt/dali-api/venv/bin/pip install -r /var/www/dalipart/server/requirements.txt
sudo chown -R www-data:www-data /opt/dali-api/models /opt/dali-api/cache /var/www/dali-banner-data

# systemd service
sudo cp /var/www/dalipart/server/dali-api.service /etc/systemd/system/dali-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now dali-api

# nginx: add inside the HTTPS server block (handled separately) —
#   location = /api/health, location /api/admin/ (auth_basic), location /api/ (limits) -> proxy 127.0.0.1:8000
```

Data (uploaded children's photos) is stored in `/var/www/dali-banner-data` — OUTSIDE the
public web root, reachable only through the Basic-Auth `/api/admin/` endpoints.
