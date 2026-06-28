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
MOCKUP_DIR = os.path.join(DATA_DIR, "mockups")        # uploads-sibling design store
MOCKUP_INDEX = os.path.join(DATA_DIR, "mockups.jsonl")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(MOCKUP_DIR, exist_ok=True)

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


# ===========================================================================
# MOCKUP API — public design templates for the banner builder.
#   Images are PUBLIC (design templates, no customer photos), so the list and
#   image endpoints are open; write-ops live under /api/admin/ (nginx Basic
#   Auth). Records are stored in mockups.jsonl + mockups/<id>/design.<ext>.
# ===========================================================================

# PIL format -> (file extension, response media type). Anything else rejected.
_MOCKUP_TYPES = {
    "PNG": ("png", "image/png"),
    "JPEG": ("jpg", "image/jpeg"),
    "WEBP": ("webp", "image/webp"),
}


def _frac(v) -> float:
    """Parse a 0..1 fraction from form input, clamped into range."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    if f != f:  # NaN
        return 0.0
    return 0.0 if f < 0.0 else (1.0 if f > 1.0 else f)


def _hex_or(v, default):
    """Validate a #rrggbb hex colour, else fall back to default."""
    s = (v or "").strip()
    if len(s) == 7 and s[0] == "#" and all(c in "0123456789abcdefABCDEF" for c in s[1:]):
        return s
    return default


def _load_mockups():
    items = []
    if os.path.exists(MOCKUP_INDEX):
        with open(MOCKUP_INDEX, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        items.append(json.loads(line))
                    except Exception:
                        pass
    return items


@app.get("/api/mockups")
def mockups_list():
    """PUBLIC: active design templates, oldest -> newest (stable gallery order)."""
    out = []
    for it in _load_mockups():
        if not it.get("active", True):
            continue
        out.append({
            "id": it.get("id"),
            "name": it.get("name", ""),
            "hole": it.get("hole"),
            "showText": bool(it.get("showText")),
            "anchor": it.get("anchor"),
            "ink": it.get("ink"),
            "script": it.get("script"),
            "image": "/api/mockups/%s/image" % it.get("id"),
            "at": it.get("at"),
        })
    return {"items": out}


@app.get("/api/mockups/{mid}/image")
def mockup_image(mid: str):
    """PUBLIC: serve the uploaded design image with its real media type."""
    mid = _safe_id(mid)
    for it in _load_mockups():
        if it.get("id") == mid and it.get("active", True):
            ext = it.get("ext", "png")
            media = _MOCKUP_TYPES.get(
                {"png": "PNG", "jpg": "JPEG", "jpeg": "JPEG", "webp": "WEBP"}.get(ext, "PNG"),
                ("png", "image/png"),
            )[1]
            p = os.path.join(MOCKUP_DIR, mid, "design." + ext)
            if os.path.exists(p):
                return FileResponse(p, media_type=media)
            break
    raise HTTPException(404, "Không tìm thấy mockup.")


@app.post("/api/admin/mockups")
async def mockup_create(
    name: str = Form(...),
    holeX: float = Form(...),
    holeY: float = Form(...),
    holeW: float = Form(...),
    holeH: float = Form(...),
    round: str = Form("1"),
    showText: str = Form("0"),
    titleX: str = Form(""),
    titleY: str = Form(""),
    nameX: str = Form(""),
    nameY: str = Form(""),
    subX: str = Form(""),
    subY: str = Form(""),
    ink: str = Form(""),
    script: str = Form(""),
    image: UploadFile = File(...),
):
    """Create a design-template mockup (multipart). Admin-only via nginx Basic Auth."""
    name = (name or "").strip()[:80]
    if not name:
        raise HTTPException(400, "Thiếu tên mockup.")

    data = await image.read()
    _read_image(data)  # validates size/type (raises on invalid image)
    # NOTE: read the real format from the ORIGINAL bytes — _read_image() runs
    # ImageOps.exif_transpose() which returns an image whose .format is None.
    try:
        fmt = (Image.open(io.BytesIO(data)).format or "").upper()
    except Exception:
        fmt = ""
    if fmt not in _MOCKUP_TYPES:
        raise HTTPException(400, "Ảnh phải là PNG, JPEG hoặc WEBP.")
    ext, _media = _MOCKUP_TYPES[fmt]

    show = showText in ("1", "true", "True", "on", "yes")
    anchor = None
    if show:
        anchor = {
            "title": {"x": _frac(titleX), "y": _frac(titleY)},
            "name": {"x": _frac(nameX), "y": _frac(nameY)},
            "sub": {"x": _frac(subX), "y": _frac(subY)},
        }

    mid = uuid.uuid4().hex[:12]
    folder = os.path.join(MOCKUP_DIR, mid)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "design." + ext), "wb") as f:
        f.write(data)

    rec = {
        "id": mid,
        "name": name,
        "hole": {
            "x": _frac(holeX), "y": _frac(holeY),
            "w": _frac(holeW), "h": _frac(holeH),
            "round": round in ("1", "true", "True", "on", "yes"),
        },
        "showText": show,
        "anchor": anchor,
        "ink": _hex_or(ink, "#3a2a23"),
        "script": _hex_or(script, "#d81b60"),
        "ext": ext,
        "active": True,
        "at": _now(),
    }
    with open(MOCKUP_INDEX, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return {"ok": True, "id": mid}


@app.delete("/api/admin/mockups/{mid}")
def mockup_delete(mid: str):
    """Soft-delete a mockup (active=false) so it drops out of the public list."""
    mid = _safe_id(mid)
    items = _load_mockups()
    found = False
    for it in items:
        if it.get("id") == mid:
            it["active"] = False
            found = True
    if not found:
        raise HTTPException(404, "Không tìm thấy mockup.")
    tmp = MOCKUP_INDEX + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    os.replace(tmp, MOCKUP_INDEX)
    return {"ok": True}
