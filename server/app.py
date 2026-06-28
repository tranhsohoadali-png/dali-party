"""
Dali Party — Banner builder backend (FastAPI).

Endpoints (served behind nginx at https://dalipart.tranhdali.vn/api/):
  GET  /api/health                      -> liveness check
  POST /api/banner/remove-bg            -> AI background removal (rembg), returns PNG cutout
  POST /api/banner/request              -> store a customer banner request (photo + composite + info)
  GET  /api/banner/config               -> PUBLIC deposit config (đặt cọc) for the builder
  POST /api/banner/request/{rid}/deposit-> customer "Tôi đã chuyển cọc" claim (+ optional proof)
  GET  /api/admin/banner/list           -> list requests (nginx Basic Auth gates /api/admin/)
  GET  /api/admin/banner/{rid}/{which}  -> download an image (photo | composite | cutout | deposit)
  POST /api/admin/banner/{rid}/status   -> update a request status
  POST /api/admin/banner/{rid}/deposit  -> mark a request's deposit as confirmed (đã nhận cọc)
  POST /api/admin/banner/config         -> save deposit config (owner-entered bank/Momo, no secrets)

The deposit flow is bank-transfer-by-hand only: the customer scans a VietQR image
(or copies the bank/Momo details), transfers manually, taps "đã chuyển", and the
shop confirms by hand. NO card data, NO payment gateway, NO automated settlement.

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
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")   # deposit / commercial config (owner-editable)
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


# ===========================================================================
# DEPOSIT CONFIG (đặt cọc) — owner-editable commercial config, stored SERVER-SIDE.
#   Lives in config.json under DALI_DATA_DIR (NOT browser localStorage, which is
#   per-browser and cannot reach customers). Bank account / Momo phone are
#   PUBLIC-by-design (needed to receive a transfer) — there are no secrets here:
#   no card numbers, no API keys, no gateway credentials. If nothing is
#   configured the builder degrades to a "liên hệ shop" contact card.
# ===========================================================================

# Defaults are intentionally EMPTY for bank/account — never hardcode a real number.
_CONFIG_DEFAULTS = {
    "depositEnabled": False,          # master switch; off → builder skips the gate
    "depositGate": "submit",          # "submit" (after free preview) | "start" (up front)
    "depositAmount": 50000,           # flat cọc in VND (deductible + refundable framing)
    "method": "vietqr",               # "vietqr" | "momo" | "manual"
    "bankCode": "",                   # VietQR bank code/BIN (e.g. "VCB", "970436") — owner-entered
    "bankAccount": "",                # receiving account number — owner-entered, public
    "accountName": "",                # account holder name shown on the QR
    "momoPhone": "",                  # Momo phone (method=momo)
    "shopZalo": "",                   # fallback contact when unconfigured/down
    "note": "",                       # extra note shown under the QR (policy/instructions)
}

_CONFIG_STR_KEYS = ("depositGate", "method", "bankCode", "bankAccount",
                    "accountName", "momoPhone", "shopZalo", "note")
_CONFIG_STR_MAX = 160
_GATES = ("submit", "start")
_METHODS = ("vietqr", "momo", "manual")


def _read_config():
    """Load config.json merged over defaults (missing/corrupt file → defaults)."""
    cfg = dict(_CONFIG_DEFAULTS)
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                for k in _CONFIG_DEFAULTS:
                    if k in data and data[k] is not None:
                        cfg[k] = data[k]
        except Exception:
            pass
    return cfg


def _sanitize_config(data):
    """Coerce incoming admin config into the validated, safe shape (no secrets)."""
    if not isinstance(data, dict):
        data = {}
    out = dict(_CONFIG_DEFAULTS)
    out["depositEnabled"] = bool(data.get("depositEnabled"))
    gate = str(data.get("depositGate") or "submit").strip()
    out["depositGate"] = gate if gate in _GATES else "submit"
    method = str(data.get("method") or "vietqr").strip()
    out["method"] = method if method in _METHODS else "vietqr"
    try:
        amt = int(float(data.get("depositAmount")))
    except (TypeError, ValueError):
        amt = _CONFIG_DEFAULTS["depositAmount"]
    out["depositAmount"] = max(0, min(amt, 100000000))  # clamp 0..100M VND
    for k in ("bankCode", "bankAccount", "accountName", "momoPhone", "shopZalo", "note"):
        out[k] = str(data.get(k) or "").strip()[:_CONFIG_STR_MAX]
    return out


@app.get("/api/banner/config")
def banner_config():
    """PUBLIC: deposit config the builder reads to decide the gate + show the QR."""
    return _read_config()


@app.post("/api/admin/banner/config")
async def admin_save_config(
    depositEnabled: str = Form("0"),
    depositGate: str = Form("submit"),
    depositAmount: str = Form("50000"),
    method: str = Form("vietqr"),
    bankCode: str = Form(""),
    bankAccount: str = Form(""),
    accountName: str = Form(""),
    momoPhone: str = Form(""),
    shopZalo: str = Form(""),
    note: str = Form(""),
):
    """ADMIN (nginx Basic Auth): persist deposit config to config.json.

    Inputs are owner-entered and PUBLIC-by-design (a bank account exists to
    receive money). We sanitise + clamp everything; nothing here is a secret.
    """
    cfg = _sanitize_config({
        "depositEnabled": depositEnabled in ("1", "true", "True", "on", "yes"),
        "depositGate": depositGate, "depositAmount": depositAmount,
        "method": method, "bankCode": bankCode, "bankAccount": bankAccount,
        "accountName": accountName, "momoPhone": momoPhone,
        "shopZalo": shopZalo, "note": note,
    })
    tmp = CONFIG_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG_FILE)
    return {"ok": True, "config": cfg}


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
    mockup_id: str = Form(""),
    mockup_name: str = Form(""),
    contact: str = Form(""),
    note: str = Form(""),
    photoSlots: str = Form(""),
    depositClaimed: str = Form("0"),
    depositRef: str = Form(""),
    photo: UploadFile = File(None),
    photos: list[UploadFile] = File(None),
    cutout: UploadFile = File(None),
    composite: UploadFile = File(None),
    deposit: UploadFile = File(None),
):
    """Store a finished banner request from a customer.

    Multi-hole aware: the builder sends `photos` (ordered, one per filled hole)
    plus `photoSlots` = JSON array of the 1-based hole index each photo belongs to.
    Legacy single-photo clients still send `photo` and keep working.
    """
    name = (name or "").strip()[:80]
    if not name:
        raise HTTPException(400, "Thiếu tên bé.")
    contact = (contact or "").strip()[:120]
    rid = uuid.uuid4().hex[:12]
    folder = os.path.join(UPLOAD_DIR, rid)
    os.makedirs(folder, exist_ok=True)

    # gather customer photos in order: new multi `photos[]`, else legacy single `photo`
    incoming = [p for p in (photos or []) if p is not None]
    if not incoming and photo is not None:
        incoming = [photo]
    if not incoming:
        raise HTTPException(400, "Thiếu ảnh bé.")

    saved = 0
    for up in incoming:
        data = await up.read()
        try:
            _read_image(data)  # validate type/size
        except Exception:
            continue
        saved += 1
        with open(os.path.join(folder, "photo-%d.png" % saved), "wb") as f:
            f.write(data)
        if saved == 1:  # also keep photo.png (back-compat + quick thumbnail)
            with open(os.path.join(folder, "photo.png"), "wb") as f:
                f.write(data)
    if saved == 0:
        raise HTTPException(400, "Ảnh bé không hợp lệ.")

    for up, fname in ((cutout, "cutout.png"), (composite, "composite.png"),
                      (deposit, "deposit.png")):
        if up is not None:
            data = await up.read()
            if data and len(data) <= MAX_BYTES:
                with open(os.path.join(folder, fname), "wb") as f:
                    f.write(data)

    # which hole (1-based) each saved photo maps to, parallel to photo-1..N
    slots = []
    try:
        arr = json.loads(photoSlots) if photoSlots else []
        if isinstance(arr, list):
            slots = [int(x) for x in arr][:saved]
    except Exception:
        slots = []

    # deposit (đặt cọc) snapshot — taken from the live config at request time so
    # the record remembers what was asked even if the owner changes config later.
    cfg = _read_config()
    claimed = depositClaimed in ("1", "true", "True", "on", "yes")
    has_proof = os.path.exists(os.path.join(folder, "deposit.png"))
    dep = {
        "required": bool(cfg.get("depositEnabled")),
        "amount": int(cfg.get("depositAmount") or 0),
        "method": cfg.get("method") or "vietqr",
        "claimed": claimed,
        "ref": (depositRef or "").strip()[:60] or ("DALI-" + rid),
        "proof": has_proof,
        "confirmed": False,
    }

    rec = {
        "id": rid, "at": _now(), "status": "Mới",
        "name": name, "birthday": (birthday or "").strip()[:40],
        "age": (age or "").strip()[:20], "template": (template or "").strip()[:60],
        "mockup_id": (mockup_id or "").strip()[:40],
        "mockup_name": (mockup_name or "").strip()[:80],
        "contact": contact, "note": (note or "").strip()[:500],
        "photoCount": saved, "photoSlots": slots,
        "deposit": dep,
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


def _save_index(items):
    """Atomically rewrite the whole request index (tmp file + os.replace)."""
    tmp = INDEX_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    os.replace(tmp, INDEX_FILE)


@app.get("/api/admin/banner/list")
def admin_list():
    items = _load_index()
    items.reverse()  # newest first
    return {"items": items, "count": len(items)}


@app.get("/api/admin/banner/{rid}/{which}")
def admin_file(rid: str, which: str):
    rid = _safe_id(rid)
    ok = which in ("photo", "cutout", "composite", "deposit") or (
        which.startswith("photo-") and which[6:].isdigit() and len(which) <= 12)
    if not ok:
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
    _save_index(items)
    return {"ok": True}


@app.post("/api/banner/request/{rid}/deposit")
async def banner_deposit_claim(
    rid: str,
    depositRef: str = Form(""),
    deposit: UploadFile = File(None),
):
    """PUBLIC (by request id): the customer's "Tôi đã chuyển cọc" claim.

    Records claimed=True + an optional transfer-screenshot proof. Used when the
    request was already created (e.g. confirming the deposit on the success
    screen). The shop still verifies the money by hand via the admin confirm.
    Manual bank transfer only — no card data, no gateway.
    """
    rid = _safe_id(rid)
    items = _load_index()
    rec = None
    for it in items:
        if it.get("id") == rid:
            rec = it
            break
    if rec is None:
        raise HTTPException(404, "Không tìm thấy yêu cầu.")

    folder = os.path.join(UPLOAD_DIR, rid)
    os.makedirs(folder, exist_ok=True)
    has_proof = False
    if deposit is not None:
        data = await deposit.read()
        if data and len(data) <= MAX_BYTES:
            with open(os.path.join(folder, "deposit.png"), "wb") as f:
                f.write(data)
            has_proof = True

    dep = rec.get("deposit") or {}
    dep["claimed"] = True
    ref = (depositRef or "").strip()[:60]
    if ref:
        dep["ref"] = ref
    elif not dep.get("ref"):
        dep["ref"] = "DALI-" + rid
    if has_proof:
        dep["proof"] = True
    dep.setdefault("confirmed", False)
    rec["deposit"] = dep
    if os.path.isdir(folder):
        rec["files"] = sorted(os.listdir(folder))
    _save_index(items)
    return {"ok": True, "id": rid, "deposit": dep}


@app.post("/api/admin/banner/{rid}/deposit")
async def admin_deposit_confirm(rid: str, confirmed: str = Form("1")):
    """ADMIN (nginx Basic Auth): mark a request's deposit as received/confirmed.

    Default confirms; pass confirmed=0 to undo (e.g. mis-click)."""
    rid = _safe_id(rid)
    is_confirmed = confirmed in ("1", "true", "True", "on", "yes")
    items = _load_index()
    found = False
    for it in items:
        if it.get("id") == rid:
            dep = it.get("deposit") or {}
            dep["confirmed"] = is_confirmed
            if is_confirmed:
                dep["claimed"] = True  # confirming implies a claim was made
            it["deposit"] = dep
            found = True
    if not found:
        raise HTTPException(404, "Không tìm thấy yêu cầu.")
    _save_index(items)
    return {"ok": True, "confirmed": is_confirmed}


@app.delete("/api/admin/banner/{rid}")
def banner_delete(rid: str):
    """Delete a banner request (its index record + uploaded files). Admin-only."""
    rid = _safe_id(rid)
    items = _load_index()
    keep = [it for it in items if it.get("id") != rid]
    if len(keep) == len(items):
        raise HTTPException(404, "Không tìm thấy yêu cầu.")
    _save_index(keep)
    folder = os.path.join(UPLOAD_DIR, rid)
    if os.path.isdir(folder):
        import shutil
        shutil.rmtree(folder, ignore_errors=True)
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


def _parse_holes(holes_json, fallback):
    """Parse the multi-hole JSON (array of {x,y,w,h,round,label}) into validated
    fraction dicts. Falls back to [fallback] when empty/invalid (fallback may be None)."""
    out = []
    try:
        arr = json.loads(holes_json) if holes_json else []
    except Exception:
        arr = []
    if isinstance(arr, list):
        for h in arr[:12]:
            if not isinstance(h, dict):
                continue
            x, y = _frac(h.get("x")), _frac(h.get("y"))
            w, hh = _frac(h.get("w")), _frac(h.get("h"))
            if w <= 0 or hh <= 0:
                continue
            out.append({
                "x": x, "y": y,
                "w": min(w, 1.0 - x), "h": min(hh, 1.0 - y),
                "round": bool(h.get("round")),
                "label": str(h.get("label") or "").strip()[:40],
            })
    if not out and fallback:
        out = [fallback]
    return out


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
        holes = it.get("holes")
        if not holes:
            holes = [it["hole"]] if it.get("hole") else []
        out.append({
            "id": it.get("id"),
            "name": it.get("name", ""),
            "holes": holes,
            "hole": (holes[0] if holes else it.get("hole")),
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
    holes: str = Form(""),
    image: UploadFile = File(...),
):
    """Create a design-template mockup (multipart). Admin-only via nginx Basic Auth.

    `holes` = JSON array of {x,y,w,h,round,label} (0..1 fractions) for MULTIPLE
    face/photo regions in one design. If absent, the legacy single holeX/Y/W/H is used.
    """
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

    # holes: prefer the multi-hole JSON; fall back to the legacy single holeX/Y/W/H
    single = {
        "x": _frac(holeX), "y": _frac(holeY),
        "w": min(_frac(holeW), 1.0 - _frac(holeX)),
        "h": min(_frac(holeH), 1.0 - _frac(holeY)),
        "round": round in ("1", "true", "True", "on", "yes"),
        "label": "",
    }
    has_single = single["w"] > 0 and single["h"] > 0
    holes_list = _parse_holes(holes, single if has_single else None)
    if not holes_list:
        raise HTTPException(400, "Thiếu vùng đặt ảnh — hãy khoanh ít nhất 1 ô.")

    mid = uuid.uuid4().hex[:12]
    folder = os.path.join(MOCKUP_DIR, mid)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "design." + ext), "wb") as f:
        f.write(data)

    rec = {
        "id": mid,
        "name": name,
        "holes": holes_list,
        "hole": holes_list[0],  # back-compat: first hole
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
