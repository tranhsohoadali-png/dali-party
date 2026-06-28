"""
Dali Party — Banner builder backend (FastAPI).

Endpoints (served behind nginx at https://dalipart.tranhdali.vn/api/):
  GET  /api/health                      -> liveness check
  POST /api/banner/remove-bg            -> AI background removal (rembg), returns PNG cutout
  POST /api/banner/request              -> store a customer banner request (photo + composite + info)
  GET  /api/admin/banner/list           -> list requests (nginx Basic Auth gates /api/admin/)
  GET  /api/admin/banner/{rid}/{which}  -> download an image (photo | composite | cutout)
  POST /api/admin/banner/{rid}/status   -> update a request status

Data is stored OUTSIDE the public web root (DALI_DATA_DIR), so uploaded
children's photos are never directly web-accessible — only via the
Basic-Auth-protected /api/admin/ endpoints.
"""
import io
import os
import json
import uuid
import datetime

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from PIL import Image, ImageOps

DATA_DIR = os.environ.get("DALI_DATA_DIR", "/var/www/dali-banner-data")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
INDEX_FILE = os.path.join(DATA_DIR, "requests.jsonl")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_BYTES = 12 * 1024 * 1024  # 12 MB per image
MAX_SIDE = 1600               # downscale very large uploads for speed/memory

app = FastAPI(title="Dali Party Banner API", docs_url=None, redoc_url=None)

# --- rembg session (lazy; u2net_human_seg is tuned for cutting out people) ---
_session = None


def _get_session():
    global _session
    if _session is None:
        from rembg import new_session
        _session = new_session("u2net_human_seg")
    return _session


def _read_image(data: bytes) -> Image.Image:
    if not data:
        raise HTTPException(400, "Ảnh trống.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Ảnh quá lớn (tối đa 12MB).")
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception:
        raise HTTPException(400, "Tệp không phải ảnh hợp lệ.")
    im = ImageOps.exif_transpose(im)  # honor phone orientation
    return im


def _now():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _safe_id(rid: str) -> str:
    if not rid or not all(c in "0123456789abcdef" for c in rid) or len(rid) > 32:
        raise HTTPException(404, "Không tìm thấy.")
    return rid


@app.get("/api/health")
def health():
    return {"ok": True, "service": "dali-banner", "at": _now()}


@app.post("/api/banner/remove-bg")
async def remove_bg(file: UploadFile = File(...)):
    """Cut the subject (child) out of the uploaded photo and return a PNG cutout."""
    im = _read_image(await file.read()).convert("RGBA")
    if max(im.size) > MAX_SIDE:
        im.thumbnail((MAX_SIDE, MAX_SIDE))
    from rembg import remove
    out = remove(im, session=_get_session())
    buf = io.BytesIO()
    out.save(buf, "PNG")
    return Response(content=buf.getvalue(), media_type="image/png",
                    headers={"Cache-Control": "no-store"})


@app.post("/api/banner/request")
async def banner_request(
    name: str = Form(...),
    birthday: str = Form(""),
    age: str = Form(""),
    template: str = Form(""),
    contact: str = Form(""),
    note: str = Form(""),
    photo: UploadFile = File(...),
    cutout: UploadFile = File(None),
    composite: UploadFile = File(None),
):
    """Store a finished banner request from a customer."""
    name = (name or "").strip()[:80]
    if not name:
        raise HTTPException(400, "Thiếu tên bé.")
    contact = (contact or "").strip()[:120]
    rid = uuid.uuid4().hex[:12]
    folder = os.path.join(UPLOAD_DIR, rid)
    os.makedirs(folder, exist_ok=True)

    # required original photo
    _read_image(await photo.read())  # validate type/size (re-read below)
    await photo.seek(0)
    with open(os.path.join(folder, "photo.png"), "wb") as f:
        f.write(await photo.read())

    for up, fname in ((cutout, "cutout.png"), (composite, "composite.png")):
        if up is not None:
            data = await up.read()
            if data and len(data) <= MAX_BYTES:
                with open(os.path.join(folder, fname), "wb") as f:
                    f.write(data)

    rec = {
        "id": rid, "at": _now(), "status": "Mới",
        "name": name, "birthday": (birthday or "").strip()[:40],
        "age": (age or "").strip()[:20], "template": (template or "").strip()[:60],
        "contact": contact, "note": (note or "").strip()[:500],
        "files": sorted(os.listdir(folder)),
    }
    with open(INDEX_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return {"ok": True, "id": rid}


def _load_index():
    items = []
    if os.path.exists(INDEX_FILE):
        with open(INDEX_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        items.append(json.loads(line))
                    except Exception:
                        pass
    return items


@app.get("/api/admin/banner/list")
def admin_list():
    items = _load_index()
    items.reverse()  # newest first
    return {"items": items, "count": len(items)}


@app.get("/api/admin/banner/{rid}/{which}")
def admin_file(rid: str, which: str):
    rid = _safe_id(rid)
    if which not in ("photo", "cutout", "composite"):
        raise HTTPException(404, "Không tìm thấy.")
    p = os.path.join(UPLOAD_DIR, rid, which + ".png")
    if not os.path.exists(p):
        raise HTTPException(404, "Không có ảnh.")
    return FileResponse(p, media_type="image/png")


@app.post("/api/admin/banner/{rid}/status")
async def admin_status(rid: str, status: str = Form(...)):
    rid = _safe_id(rid)
    allowed = {"Mới", "Đang làm", "Hoàn tất", "Đã huỷ"}
    if status not in allowed:
        raise HTTPException(400, "Trạng thái không hợp lệ.")
    items = _load_index()
    found = False
    for it in items:
        if it.get("id") == rid:
            it["status"] = status
            found = True
    if not found:
        raise HTTPException(404, "Không tìm thấy yêu cầu.")
    tmp = INDEX_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    os.replace(tmp, INDEX_FILE)
    return {"ok": True}
