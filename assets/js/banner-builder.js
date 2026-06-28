/* ============================================================
   DALI PARTY — Banner builder (trang /tao-banner)
   Khách chọn mẫu → mỗi mẫu có 1 HOẶC NHIỀU lỗ ảnh → tải ảnh riêng cho từng ô
   (Ảnh 1 → ô 1, Ảnh 2 → ô 2…) → ảnh tự cắt mặt tròn cho lỗ mặt → ghép cảnh
   trên canvas → gửi tất cả ảnh kèm chỉ số lỗ cho shop.
   Backend: POST /api/banner/request (photos[] + photoSlots).
   Ô để trống → giữ nguyên mặt mẫu gốc. Backend chưa sống → giữ mẫu vẽ fallback.

   v3 — Mockup "thay mặt bé": garland bóng bay pastel+vàng, phông arch
   màu nước, sao/lấp lánh, số tuổi foil vàng, nhân vật dễ thương.
   Hỗ trợ thêm "mẫu ảnh nền" (bg: "...png") để chèn thiết kế thật sau này.
   ============================================================ */
(function () {
  "use strict";
  var cv = document.getElementById("bannerCanvas");
  if (!cv) return;
  var ctx = cv.getContext("2d");
  var W = cv.width, H = cv.height;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s); }
  // HTML-escape for values injected via innerHTML (deposit modal). `esc` above is a
  // no-op stringifier kept for canvas fillText; do NOT use it for markup.
  function escH(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ============================================================
     MẪU (TEMPLATES)
     -- Mẫu "vẽ" (programmatic): không có `bg` → canvas tự vẽ cảnh
        (garland, arch, sao, foil, nhân vật) theo palette dưới đây.
     -- Mẫu "ảnh nền" (image backdrop): có `bg` = đường dẫn PNG thiết kế
        thật. Khi đó canvas vẽ ảnh đó FULL trước, rồi ghép ảnh/mặt bé vào
        `hole` và phủ "Happy Birthday" + tên + ngày tại các `anchor`.

     CHO CHỦ SHOP — PNG mẫu cần gì:
       • Kích thước dọc tỉ lệ ~1000×1300 (sẽ co giãn cho khít canvas).
       • Chừa sẵn một "lỗ" trống để gắn ảnh bé → khai báo `hole`
         theo PHẦN TRĂM (0..1) của canvas: { x, y, w, h }.
       • (Tuỳ chọn) vị trí chữ `anchor` (0..1): title / name / sub,
         mỗi cái { x, y } là tâm dòng chữ. Bỏ trống → dùng mặc định.
       • (Tuỳ chọn) `holeRound: true` để bo tròn lỗ thành hình tròn
         (đẹp cho chế độ "thay mặt").
     ============================================================ */
  // Mẫu "vẽ" mặc định (fallback khi backend /api/mockups chưa sống hoặc rỗng).
  var FALLBACK_TEMPLATES = [
    { id: "dino",  name: "Khủng long", emoji: "🦕",
      bg: ["#eef6dd", "#cbe7a0"], card: "#eef7d6", stroke: "#b6db84",
      ink: "#2f5d12", script: "#5a8f1f", deco: "🦕", deco2: "🌿",
      pal: ["#a7d06a", "#7fb53e", "#cfe9a0", "#e9f4cf"] },
    { id: "pink",  name: "Hồng thỏ",  emoji: "🐰",
      bg: ["#ffe9f0", "#ffc6dc"], card: "#ffe2ec", stroke: "#ff9fc0",
      ink: "#b03468", script: "#d94f86", deco: "🐰", deco2: "🎀",
      pal: ["#ff9fc0", "#ff7aa8", "#ffd0e0", "#ffe6f0"] },
    { id: "blue",  name: "Mây sao",   emoji: "⭐",
      bg: ["#e9f2ff", "#c8ddfb"], card: "#e2eeff", stroke: "#a9cdf5",
      ink: "#1d5aa8", script: "#2f6fc0", deco: "⭐", deco2: "☁️",
      pal: ["#9cc4f5", "#6ba6ef", "#c6dcfb", "#e3eeff"] },
    { id: "cream", name: "Kem vàng",  emoji: "🧸",
      bg: ["#fdf3e3", "#f6dcb4"], card: "#fdeedb", stroke: "#e9c489",
      ink: "#8a5a1c", script: "#c08a2e", deco: "🧸", deco2: "🌼",
      pal: ["#f3cf8e", "#e7b15a", "#fae3bd", "#fdf1dc"] }

    /* ---- VÍ DỤ MẪU ẢNH NỀN (để sẵn, đang TẮT) ------------------
       Khi có file PNG thật, bỏ chú thích & sửa path. Nếu file thiếu
       thì code tự bỏ qua an toàn (vẽ nền mờ + "đang tải mẫu…").
    ,{ id: "real1", name: "Mẫu thật", emoji: "🖼️",
       bg: "assets/img/mockups/dino-arch.png",   // đường dẫn PNG thiết kế
       hole: { x: 0.27, y: 0.42, w: 0.56, h: 0.45, round: false },
       anchor: { title: { x: 0.5, y: 0.20 },     // tâm "Happy Birthday"
                 name:  { x: 0.5, y: 0.30 },     // tâm TÊN BÉ
                 sub:   { x: 0.5, y: 0.37 } },    // tâm dòng ngày/tuổi
       ink: "#2f5d12", script: "#5a8f1f" }
    -------------------------------------------------------------- */
  ];
  // TEMPLATES = bộ mẫu ĐANG dùng cho gallery. Mặc định = mẫu vẽ fallback;
  // sẽ được thay bằng mẫu ẢNH NỀN lấy từ /api/mockups nếu backend có dữ liệu.
  var TEMPLATES = FALLBACK_TEMPLATES;
  var SLOT = { x: 0.265, y: 0.415, w: 0.58, h: 0.47, round: false }; // khung ảnh mặc định (tỉ lệ canvas)

  var state = {
    tpl: TEMPLATES[0],
    slots: [],            // 1 entry / lỗ của mẫu hiện tại — xem makeSlots()
    active: -1,           // chỉ số ô đang chỉnh (-1 = chưa chọn)
    name: "", date: "", age: "",
    sent: false,
    sentId: null,         // mã đơn trả về sau khi gửi (dùng cho nội dung CK)
    cfg: null,            // cấu hình đặt cọc từ /api/banner/config (null = chưa tải / tắt)
    depositOk: false,     // khách đã bấm "Tôi đã chuyển cọc" (gate-at-start mở khoá)
    depositShot: null     // ảnh CK khách đính kèm ở bước cọc (gate-at-start)
  };

  // Danh sách lỗ của 1 mẫu: ảnh nền (holes[]) hoặc mẫu vẽ (1 lỗ = tpl.hole | SLOT).
  function holesOf(tpl) {
    if (tpl && tpl.holes && tpl.holes.length) return tpl.holes;
    if (tpl && tpl.hole) return [tpl.hole];
    return [{ x: SLOT.x, y: SLOT.y, w: SLOT.w, h: SLOT.h, round: false }];
  }
  // Tạo lại state.slots khi đổi mẫu (mỗi lỗ 1 entry rỗng).
  function makeSlots(tpl) {
    var hs = holesOf(tpl), arr = [], i;
    for (i = 0; i < hs.length; i++) {
      arr.push({ photoBlob: null, faceImg: null, fullImg: null, img: null,
                 tf: { scale: 1, dx: 0, dy: 0 }, status: "", statusCls: "" });
    }
    state.slots = arr;
    state.active = -1;
  }

  /* ---------- ảnh nền mẫu: nạp lười + cache ---------- */
  var bgCache = {}; // path -> { img, ok, loading }
  function getBg(path) {
    var e = bgCache[path];
    if (e) return e;
    e = bgCache[path] = { img: null, ok: false, loading: true };
    var im = new Image();
    im.onload = function () { e.img = im; e.ok = true; e.loading = false; render(); };
    im.onerror = function () { e.ok = false; e.loading = false; render(); };
    im.src = path;
    return e;
  }

  /* ============================================================
     HELPERS VẼ
     ============================================================ */
  function rr(x, y, w, h, rTop, rBot) {
    rBot = rBot == null ? rTop : rBot;
    ctx.beginPath();
    ctx.moveTo(x + rTop, y);
    ctx.lineTo(x + w - rTop, y);
    ctx.arcTo(x + w, y, x + w, y + rTop, rTop);
    ctx.lineTo(x + w, y + h - rBot);
    ctx.arcTo(x + w, y + h, x + w - rBot, y + h, rBot);
    ctx.lineTo(x + rBot, y + h);
    ctx.arcTo(x, y + h, x, y + h - rBot, rBot);
    ctx.lineTo(x, y + rTop);
    ctx.arcTo(x, y, x + rTop, y, rTop);
    ctx.closePath();
  }
  function holeRect(hole) {
    return { x: hole.x * W, y: hole.y * H, w: hole.w * W, h: hole.h * H, round: !!hole.round };
  }
  function fitFont(text, max, weight, family) {
    var size = 130;
    do { ctx.font = weight + " " + size + "px " + family; size -= 2; }
    while (size > 24 && ctx.measureText(text).width > max);
    return size + 2;
  }
  // chấm tròn có highlight nhẹ (dùng cho bóng bay)
  function balloon(x, y, r, color, opts) {
    opts = opts || {};
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, opts.hi || "rgba(255,255,255,.85)");
    g.addColorStop(0.28, color);
    g.addColorStop(1, opts.dark || color);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    if (opts.stroke) { ctx.lineWidth = 1.5; ctx.strokeStyle = opts.stroke; ctx.stroke(); }
    // đốm sáng nhỏ
    ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.36, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fill();
    if (opts.confetti) { // bóng confetti: rắc chấm vàng li ti
      for (var i = 0; i < 7; i++) {
        var a = i * 0.9 + (x % 5), rr2 = r * (0.25 + (i % 3) * 0.2);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * rr2, y + Math.sin(a * 1.3) * rr2, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = "#d4af37"; ctx.fill();
      }
    }
  }
  // bóng vàng foil (kim loại + highlight)
  function goldBalloon(x, y, r) {
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, "#fff4c0"); g.addColorStop(0.35, "#f4cf52");
    g.addColorStop(0.75, "#d4af37"); g.addColorStop(1, "#b8860b");
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.65)"; ctx.fill();
  }
  // sao 4 cánh (lấp lánh)
  function sparkle(x, y, r, color) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var a = i * Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.32, Math.sin(a + Math.PI / 4) * r * 0.32);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  // sao 5 cánh đặc
  function star5(x, y, r, color) {
    ctx.save(); ctx.translate(x, y); ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rad = (i % 2 === 0) ? r : r * 0.45;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore();
  }

  /* ---------- garland bóng bay: arch quét từ trái-trên qua đỉnh ---------- */
  function drawGarland(pal) {
    // chuỗi điểm theo một đường arch: đi lên cạnh trái rồi vòng qua đỉnh sang phải
    var pts = [];
    var i, t, x, y;
    // cạnh trái (dưới → lên)
    for (i = 0; i <= 9; i++) {
      t = i / 9;
      x = 70 + t * 40 - Math.sin(t * Math.PI) * 26;
      y = 760 - t * 660;
      pts.push([x, y, 1 - t * 0.25]);
    }
    // vòng cung trên (trái → phải)
    for (i = 1; i <= 16; i++) {
      t = i / 16;
      x = 110 + t * 800;
      y = 90 + Math.sin(t * Math.PI) * -36 + Math.cos(t * Math.PI) * 10 + 18;
      pts.push([x, y, 0.78 + Math.sin(t * Math.PI) * 0.22]);
    }
    // một nhánh ngắn đổ xuống phải
    for (i = 1; i <= 5; i++) {
      t = i / 5;
      x = 912 + Math.sin(t * Math.PI) * 18;
      y = 120 + t * 230;
      pts.push([x, y, 0.85 - t * 0.2]);
    }
    var colors = pal.concat(["#ffffff", "#fff6e6", "__gold__", "__confetti__"]);
    for (i = 0; i < pts.length; i++) {
      var p = pts[i];
      var base = 30 + ((i * 7) % 18); // bán kính biến thiên đều đặn
      var r = base * (0.7 + p[2] * 0.5);
      var c = colors[i % colors.length];
      if (c === "__gold__") { goldBalloon(p[0], p[1], r); }
      else if (c === "__confetti__") {
        balloon(p[0], p[1], r, "rgba(255,255,255,.92)", { confetti: true, stroke: "rgba(0,0,0,.05)" });
      } else {
        balloon(p[0], p[1], r, c, { stroke: "rgba(0,0,0,.04)" });
      }
    }
  }

  /* ---------- nền màu nước + blob mờ ---------- */
  function drawWatercolor(t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.bg[0]); g.addColorStop(1, t.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 3 blob màu mờ cho cảm giác màu nước
    var blobs = [
      [220, 300, 360, t.pal[0]],
      [820, 520, 420, t.pal[1]],
      [500, 1080, 480, t.pal[2]]
    ];
    ctx.save(); ctx.globalAlpha = 0.35;
    blobs.forEach(function (b) {
      var rg = ctx.createRadialGradient(b[0], b[1], 10, b[0], b[1], b[2]);
      rg.addColorStop(0, b[3]); rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  /* ---------- vẽ ảnh/mặt bé vào "lỗ" ----------
     s = hình chữ nhật của lỗ (px) + round; slot = entry state.slots[i] (img + tf).
     slot == null hoặc slot.img == null → KHÔNG vẽ gì (giữ nguyên mặt mẫu gốc),
     trừ placeholder gợi ý cho mẫu vẽ programmatic (showPlaceholder=true).            */
  function drawPhotoHole(s, slot, showPlaceholder) {
    if (slot && slot.img) {
      ctx.save();
      if (s.round) {
        var cr = Math.min(s.w, s.h) / 2;
        ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h / 2, cr, 0, Math.PI * 2); ctx.clip();
      } else {
        rr(s.x, s.y, s.w, s.h, 28); ctx.clip();
      }
      var iw = slot.img.naturalWidth || slot.img.width;
      var ih = slot.img.naturalHeight || slot.img.height;
      var b = Math.max(s.w / iw, s.h / ih);
      var sc = b * slot.tf.scale;
      var dw = iw * sc, dh = ih * sc;
      ctx.drawImage(slot.img, s.x + s.w / 2 - dw / 2 + slot.tf.dx, s.y + s.h / 2 - dh / 2 + slot.tf.dy, dw, dh);
      ctx.restore();
      // viền trắng
      ctx.save();
      if (s.round) {
        var cr2 = Math.min(s.w, s.h) / 2;
        ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h / 2, cr2, 0, Math.PI * 2);
      } else { rr(s.x, s.y, s.w, s.h, 28); }
      ctx.lineWidth = s.round ? 10 : 6; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.restore();
    } else if (showPlaceholder) {
      ctx.save();
      if (s.round) {
        var cr3 = Math.min(s.w, s.h) / 2;
        ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h / 2, cr3, 0, Math.PI * 2); ctx.clip();
      } else { rr(s.x, s.y, s.w, s.h, 28); ctx.clip(); }
      ctx.fillStyle = "rgba(0,0,0,.05)"; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = "rgba(0,0,0,.30)"; ctx.font = "600 30px 'Be Vietnam Pro', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("📷 Ảnh bé", s.x + s.w / 2, s.y + s.h / 2);
      ctx.restore();
      ctx.save();
      if (s.round) {
        var cr4 = Math.min(s.w, s.h) / 2;
        ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h / 2, cr4, 0, Math.PI * 2);
      } else { rr(s.x, s.y, s.w, s.h, 28); }
      ctx.lineWidth = s.round ? 10 : 6; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- số tuổi foil vàng ---------- */
  function drawGoldNumber(x, y, size) {
    var n = state.age;
    var gg = ctx.createLinearGradient(x - 60, y - size, x + 60, y);
    gg.addColorStop(0, "#fff2b0"); gg.addColorStop(.35, "#f4cf52");
    gg.addColorStop(.7, "#e0a92a"); gg.addColorStop(1, "#b8860b");
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.font = "800 " + size + "px 'Be Vietnam Pro', sans-serif";
    ctx.shadowColor = "rgba(150,90,0,.28)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    ctx.fillStyle = gg; ctx.fillText(n, x, y);
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(120,70,0,.45)"; ctx.strokeText(n, x, y);
    // highlight kim loại phía trên
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.font = "800 " + size + "px 'Be Vietnam Pro', sans-serif";
    ctx.restore();
  }

  /* ---------- chữ Happy Birthday + tên + ngày/tuổi ---------- */
  function drawTexts(t, anchor) {
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    // Happy Birthday (thư pháp)
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.12)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = t.script;
    ctx.font = "700 82px 'Dancing Script', cursive";
    ctx.fillText("Happy Birthday", anchor.title.x * W, anchor.title.y * H);
    ctx.restore();

    // Tên bé
    var name = (esc(state.name).trim() || "Tên bé").toUpperCase();
    var maxW = W - 220;
    var fs = fitFont(name, maxW, "800", "'Be Vietnam Pro', sans-serif");
    ctx.font = "800 " + fs + "px 'Be Vietnam Pro', sans-serif";
    ctx.fillStyle = t.ink;
    ctx.fillText(name, anchor.name.x * W, anchor.name.y * H + fs * 0.34);

    // ngày + tuổi
    var sub = [];
    var age = esc(state.age).trim(), date = esc(state.date).trim();
    if (age) sub.push("🎂 " + age + " tuổi");
    if (date) sub.push("📅 " + date);
    if (sub.length) {
      ctx.font = "600 36px 'Be Vietnam Pro', sans-serif";
      ctx.fillStyle = t.ink;
      ctx.fillText(sub.join("    "), anchor.sub.x * W, anchor.sub.y * H);
    }
  }

  /* ---------- nhân vật dễ thương ---------- */
  function drawCharacter(t, cx, cw, cy, ch) {
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // nhân vật chính lớn + bóng đổ mềm
    ctx.shadowColor = "rgba(0,0,0,.18)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 10;
    ctx.font = "150px serif";
    var hx = cx + cw - 96, hy = cy + ch - 96;
    ctx.fillText(t.deco, hx, hy);
    ctx.shadowColor = "transparent";
    // chấm "mũ tiệc" nhỏ trên đầu nhân vật
    star5(hx + 8, hy - 86, 16, "#d4af37");
    // nhân vật phụ nhỏ ở góc kia
    ctx.font = "72px serif";
    ctx.fillText(t.deco2, cx + 86, cy + ch - 70);
    ctx.restore();
  }

  /* ============================================================
     DRAW chính
     ============================================================ */
  function draw() {
    var t = state.tpl;
    ctx.clearRect(0, 0, W, H);

    /* ---- (B) mẫu ẢNH NỀN: có t.bg là chuỗi đường dẫn ---- */
    if (typeof t.bg === "string") {
      var be = getBg(t.bg);
      if (be.ok && be.img) {
        ctx.drawImage(be.img, 0, 0, W, H);
      } else {
        // chưa tải xong / lỗi → nền mờ + thông báo nhẹ
        ctx.fillStyle = "#f4eee6"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "600 30px 'Be Vietnam Pro', sans-serif";
        ctx.fillText(be.loading ? "đang tải mẫu…" : "(thiếu ảnh mẫu)", W / 2, H / 2 - 40);
      }
      // LOOP các lỗ: mỗi lỗ vẽ ảnh của slot tương ứng (nếu có). Lỗ trống → để
      // nguyên mặt mẫu gốc (không vẽ gì).
      var hs = holesOf(t), hi;
      for (hi = 0; hi < hs.length; hi++) {
        drawPhotoHole(holeRect(hs[hi]), state.slots[hi], false);
      }
      // showText !== false → vẽ chữ; cần có anchor (item.anchor có thể null).
      if (t.showText !== false) {
        var anchor = t.anchor || { title: { x: .5, y: .20 }, name: { x: .5, y: .30 }, sub: { x: .5, y: .37 } };
        drawTexts({ ink: t.ink || "#333", script: t.script || "#c08a2e" }, anchor);
      }
      return;
    }

    /* ---- (A) mẫu VẼ (programmatic) ---- */
    // 1. nền màu nước + blob
    drawWatercolor(t);
    // 2. garland bóng bay (sau arch về mặt thị giác, nhưng vẽ trước để arch nổi lên)
    drawGarland(t.pal);

    // 3. thẻ arch (phông nền chữ + ảnh)
    var cx = 110, cy = 150, cw = W - 220, ch = H - 270;
    ctx.save();
    ctx.shadowColor = "rgba(40,40,20,.14)"; ctx.shadowBlur = 34; ctx.shadowOffsetY = 14;
    rr(cx, cy, cw, ch, 220, 50); ctx.fillStyle = t.card; ctx.fill();
    ctx.restore();
    rr(cx, cy, cw, ch, 220, 50); ctx.lineWidth = 5; ctx.strokeStyle = t.stroke; ctx.stroke();

    // 4. sao + lấp lánh trong arch
    sparkle(cx + 70, cy + 220, 18, t.script);
    sparkle(cx + cw - 80, cy + 260, 14, "#d4af37");
    sparkle(cx + cw - 130, cy + 120, 10, t.script);
    star5(cx + 120, cy + 90, 12, "#d4af37");
    [[cx + 60, cy + 360], [cx + cw - 56, cy + 430], [cx + 90, cy + ch - 220]].forEach(function (d) {
      ctx.beginPath(); ctx.arc(d[0], d[1], 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(212,175,55,.7)"; ctx.fill();
    });

    // 5. chữ
    var anchorA = { title: { x: .5, y: (cy + 130) / H }, name: { x: .5, y: (cy + 250) / H }, sub: { x: .5, y: (cy + 322) / H } };
    drawTexts(t, anchorA);

    // 6. khung ảnh / mặt bé (mẫu vẽ = 1 lỗ duy nhất, có placeholder gợi ý)
    var sA = holeRect(holesOf(t)[0]);
    drawPhotoHole(sA, state.slots[0], true);

    // 7. số tuổi foil vàng (nếu là số)
    if (/^\d{1,2}$/.test(esc(state.age).trim())) {
      drawGoldNumber(W - 138, sA.y + 188, 200);
    }

    // 8. nhân vật dễ thương
    drawCharacter(t, cx, cw, cy, ch);
  }

  var raf = 0;
  function render() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); }); }

  /* ---------- gallery mẫu (render lại được sau khi nạp mockup) ---------- */
  var tplWrap = $("bbTpls");
  function renderGallery() {
    if (!tplWrap) return;
    tplWrap.innerHTML = "";
    TEMPLATES.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "bb-tpl" + (t.id === state.tpl.id ? " active" : "");
      b.dataset.tpl = t.id;
      var sw;
      if (typeof t.bg === "string") {
        // mẫu ẢNH NỀN: swatch = thumbnail nhỏ của ảnh thiết kế, fallback nền đặc.
        sw = '<span class="sw" style="background:#efe7da center/cover no-repeat url(\'' +
             esc(t.bg).replace(/'/g, "%27") + "');\"></span>";
      } else {
        // mẫu VẼ: swatch gradient + emoji.
        var grad = "linear-gradient(135deg," + t.bg[0] + "," + t.bg[1] + ")";
        sw = '<span class="sw" style="background:' + grad + '">' + (t.emoji || "") + "</span>";
      }
      b.innerHTML = sw + "<small>" + esc(t.name) + "</small>";
      b.addEventListener("click", function () {
        state.tpl = t;
        makeSlots(t);
        [].forEach.call(tplWrap.children, function (c) { c.classList.toggle("active", c.dataset.tpl === t.id); });
        renderSlots();
        updateZoomUI();
        render();
      });
      tplWrap.appendChild(b);
    });
  }
  renderGallery();

  /* ---------- nạp mẫu ẢNH NỀN từ kho /api/mockups (degrade gracefully) ---------- */
  function buildTplFromMockup(m) {
    var holes = (m.holes && m.holes.length) ? m.holes : (m.hole ? [m.hole] : []);
    return {
      id: m.id,
      name: m.name || "Mẫu",
      bg: m.image,                       // URL same-origin (vd "/api/mockups/<id>/image")
      holes: holes,                      // [{x,y,w,h,round,label}, ...] (0..1) — theo thứ tự Ảnh 1, 2…
      hole: holes[0],                    // tương thích ngược (lỗ đầu tiên)
      anchor: m.anchor || null,          // {title,name,sub} (0..1) hoặc null
      showText: m.showText !== false,    // mặc định hiện chữ
      ink: m.ink || "#333",
      script: m.script || "#c08a2e"
    };
  }
  (function loadMockups() {
    fetch("/api/mockups", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var items = j && Array.isArray(j.items) ? j.items : [];
        // chỉ lấy mẫu có ảnh + ÍT NHẤT một lỗ hợp lệ
        var tpls = items.filter(function (m) {
          return m && m.image && ((m.holes && m.holes.length) || m.hole);
        }).map(buildTplFromMockup);
        if (!tpls.length) return; // backend rỗng/down → giữ nguyên mẫu vẽ fallback
        TEMPLATES = tpls;
        state.tpl = TEMPLATES[0]; // mặc định chọn mẫu đầu
        makeSlots(state.tpl);
        renderGallery();
        renderSlots();
        render();
      })
      .catch(function () { /* backend chưa sống → im lặng, giữ mẫu fallback */ });
  })();

  /* ---------- tải ảnh + tách nền ---------- */
  function loadImg(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob);
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("img")); };
      im.src = url;
    });
  }
  function setStatus(msg, cls) { var el = $("bbPhotoStatus"); el.textContent = msg || ""; el.className = "bb-status" + (cls ? " " + cls : ""); }

  /* ============================================================
     UI Ô ẢNH (mỗi lỗ = 1 hàng "Ảnh n")
     ============================================================ */
  var slotsWrap = $("bbSlots");
  var faceWarmed = false;
  // nhãn 1 lỗ: ưu tiên hole.label; mẫu vẽ 1 lỗ → "Ảnh bé".
  function slotLabel(tpl, hole, i, n) {
    if (n === 1 && typeof tpl.bg !== "string") return "Ảnh bé";
    return "Ảnh " + (i + 1) + " · " + (hole.label || ("Ô " + (i + 1)));
  }
  function renderSlots() {
    if (!slotsWrap) return;
    slotsWrap.innerHTML = "";
    var tpl = state.tpl, hs = holesOf(tpl), n = hs.length, i;
    for (i = 0; i < n; i++) {
      (function (idx) {
        var hole = hs[idx], slot = state.slots[idx] || {};
        var row = document.createElement("div");
        row.className = "bb-slot" + (idx === state.active ? " active" : "") + (slot.img ? " filled" : "");
        var thumbBg = "";
        if (slot.photoBlob) {
          // create the thumbnail object URL ONCE per slot photo (revoked in clearSlot /
          // on re-upload) — don't leak a new URL on every renderSlots() call.
          if (!slot.thumbUrl) { try { slot.thumbUrl = URL.createObjectURL(slot.photoBlob); } catch (e) {} }
          if (slot.thumbUrl) thumbBg = "background-image:url('" + slot.thumbUrl + "')";
        }
        var sub = slot.status
          ? '<span class="bb-slot-sub ' + (slot.statusCls || "") + '">' + esc(slot.status) + "</span>"
          : '<span class="bb-slot-sub">' + (slot.img ? "✓ đã có ảnh"
              : (hole && hole.round ? "chưa có ảnh — AI sẽ tự cắt mặt"
                                    : "chưa có ảnh — dùng nguyên ảnh (nên chọn ảnh đã chỉnh sẵn)")) + "</span>";
        row.innerHTML =
          '<span class="bb-thumb" style="' + thumbBg + '">' + (slot.img ? "" : "📷") + "</span>" +
          '<span class="bb-slot-body">' +
            '<span class="bb-slot-label">' + esc(slotLabel(tpl, hole, idx, n)) + "</span>" + sub +
          "</span>" +
          '<label class="bb-slot-pick">Tải ảnh<input type="file" accept="image/*" hidden></label>' +
          (slot.img ? '<button type="button" class="bb-slot-del">✕ xoá</button>' : "");
        // chọn ô (highlight + hiện zoom)
        row.addEventListener("click", function (ev) {
          if (ev.target.tagName === "INPUT" || ev.target.closest(".bb-slot-pick") || ev.target.closest(".bb-slot-del")) return;
          setActive(idx);
        });
        // tải ảnh cho ô
        var input = row.querySelector(".bb-slot-pick input");
        input.addEventListener("change", function (e) {
          var file = e.target.files && e.target.files[0];
          if (file) uploadSlot(idx, file);
        });
        // xoá ảnh ô
        var del = row.querySelector(".bb-slot-del");
        if (del) del.addEventListener("click", function () { clearSlot(idx); });
        slotsWrap.appendChild(row);
      })(i);
    }
  }

  function setActive(idx) {
    state.active = idx;
    renderSlots();
    updateZoomUI();
  }
  function updateZoomUI() {
    var slot = state.active >= 0 ? state.slots[state.active] : null;
    var show = !!(slot && slot.img);
    $("bbZoomWrap").hidden = !show;
    if (show) $("bbZoom").value = slot.tf.scale;
    $("bbHint").textContent = show ? "Kéo ảnh trong khung để chỉnh vị trí ô đang chọn." :
      ($("bbSlots").querySelector(".bb-slot.filled") ? "Bấm vào một ô để chỉnh ảnh." : "Chọn mẫu & tải ảnh bé để xem trước…");
  }

  function clearSlot(idx) {
    var slot = state.slots[idx];
    if (!slot) return;
    if (slot.thumbUrl) { URL.revokeObjectURL(slot.thumbUrl); slot.thumbUrl = null; }
    slot.photoBlob = null; slot.faceImg = null; slot.fullImg = null; slot.img = null;
    slot.tf = { scale: 1, dx: 0, dy: 0 }; slot.status = ""; slot.statusCls = "";
    if (state.active === idx) state.active = -1;
    renderSlots(); updateZoomUI(); render();
  }

  // tải + auto face-crop ảnh cho 1 ô
  function uploadSlot(idx, file) {
    var slot = state.slots[idx];
    if (!slot) return;
    if (file.size > 12 * 1024 * 1024) { slot.status = "Ảnh quá lớn (tối đa 12MB)."; slot.statusCls = "err"; renderSlots(); return; }
    var hole = holesOf(state.tpl)[idx];
    if (slot.thumbUrl) { URL.revokeObjectURL(slot.thumbUrl); slot.thumbUrl = null; }
    slot.photoBlob = file; slot.faceImg = null; slot.fullImg = null; slot.img = null;
    slot.tf = { scale: 1, dx: 0, dy: 0 };
    state.active = idx;
    // làm nóng model mặt lần đầu
    if (!faceWarmed && window.DaliFace && window.DaliFace.ensureMediaPipe) {
      faceWarmed = true; window.DaliFace.ensureMediaPipe().catch(function () {});
    }
    loadImg(file).then(function (im) {
      slot.fullImg = im;
      if (hole && hole.round && window.detectFaceCircle) {
        // lỗ mặt → tự cắt mặt tròn
        slot.status = "🙂 Đang tự cắt mặt bé…"; slot.statusCls = "busy"; renderSlots();
        window.detectFaceCircle(file, { size: 512, padding: 0.85 }).then(function (fr) {
          slot.faceImg = fr.canvas; slot.img = fr.canvas;
          slot.status = fr.found ? "✅ Đã cắt mặt tự động (" + fr.engine + ")." : "Chưa thấy mặt rõ — kéo/phóng để chỉnh.";
          slot.statusCls = fr.found ? "ok" : "";
          renderSlots(); updateZoomUI(); render();
        }).catch(function () {
          // không cắt được → dùng ảnh gốc
          slot.img = slot.fullImg;
          slot.status = "Dùng ảnh gốc (chưa cắt được mặt) — kéo/phóng để chỉnh."; slot.statusCls = "";
          renderSlots(); updateZoomUI(); render();
        });
      } else {
        // lỗ thường → dùng ảnh đầy đủ
        slot.img = slot.fullImg;
        slot.status = "✅ Đã tải ảnh."; slot.statusCls = "ok";
        renderSlots(); updateZoomUI(); render();
      }
    }).catch(function () {
      slot.photoBlob = null;
      slot.status = "Không đọc được ảnh."; slot.statusCls = "err";
      renderSlots();
    });
  }

  $("bbZoom").addEventListener("input", function () {
    var slot = state.active >= 0 ? state.slots[state.active] : null;
    if (!slot || !slot.img) return;
    slot.tf.scale = parseFloat(this.value) || 1; render();
  });

  /* ---------- kéo ảnh trong khung (tác động ô đang chọn) ---------- */
  var drag = null;
  function activeSlot() { return state.active >= 0 ? state.slots[state.active] : null; }
  function pt(e) {
    var r = cv.getBoundingClientRect();
    var src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * (W / r.width), y: (src.clientY - r.top) * (H / r.height) };
  }
  function down(e) {
    var slot = activeSlot();
    if (!slot || !slot.img) return;
    var p = pt(e); drag = { x: p.x, y: p.y, dx: slot.tf.dx, dy: slot.tf.dy };
    cv.classList.add("dragging"); e.preventDefault();
  }
  function move(e) {
    if (!drag) return;
    var slot = activeSlot();
    if (!slot) { drag = null; return; }
    var p = pt(e);
    slot.tf.dx = drag.dx + (p.x - drag.x); slot.tf.dy = drag.dy + (p.y - drag.y);
    render(); e.preventDefault();
  }
  function up() { drag = null; cv.classList.remove("dragging"); }
  cv.addEventListener("mousedown", down); window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  cv.addEventListener("touchstart", down, { passive: false }); cv.addEventListener("touchmove", move, { passive: false }); window.addEventListener("touchend", up);

  /* ---------- inputs ---------- */
  function bind(id, key) { $(id).addEventListener("input", function () { state[key] = this.value.trim(); render(); }); }
  bind("bbName", "name"); bind("bbDate", "date"); bind("bbAge", "age");

  /* ---------- gửi yêu cầu ---------- */
  function result(msg, cls) { var el = $("bbResult"); el.textContent = msg; el.className = "bb-result show " + cls; }
  function canvasBlob() { return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, "image/png", 0.92); }); }

  /* Kiểm tra dữ liệu tối thiểu trước khi gửi (tên + ≥1 ảnh + liên hệ). */
  function validateForm() {
    var name = $("bbName").value.trim(), contact = $("bbContact").value.trim();
    if (!name) { result("Vui lòng nhập tên bé.", "err"); $("bbName").focus(); return null; }
    var hasPhoto = false, k;
    for (k = 0; k < state.slots.length; k++) { if (state.slots[k] && state.slots[k].photoBlob) { hasPhoto = true; break; } }
    if (!hasPhoto) { result("Vui lòng tải ít nhất một ảnh bé.", "err"); return null; }
    // chống đua: ô đã có ảnh nhưng AI chưa dựng xong (slot.img null / đang "busy")
    // → composite sẽ thiếu mặt vừa tải. Bắt khách đợi 1-2 giây rồi gửi lại.
    for (k = 0; k < state.slots.length; k++) {
      var sb = state.slots[k];
      if (sb && sb.photoBlob && (!sb.img || sb.statusCls === "busy")) {
        result("Đang tự cắt mặt bé, chờ 1–2 giây rồi gửi lại nhé.", "err"); return null;
      }
    }
    if (!contact) { result("Vui lòng nhập SĐT/Zalo để shop liên hệ.", "err"); $("bbContact").focus(); return null; }
    return { name: name, contact: contact };
  }

  /* Gửi yêu cầu lên backend. opts.deposit (tuỳ chọn) = {claimed, ref, blob}
     để đính kèm thông tin đã chuyển cọc. Trả về Promise<json|throw>. */
  async function sendRequest(form, opts) {
    opts = opts || {};
    var comp = await canvasBlob();
    var fd = new FormData();
    fd.append("name", form.name);
    fd.append("birthday", $("bbDate").value.trim());
    fd.append("age", $("bbAge").value.trim());
    fd.append("template", state.tpl.id);
    fd.append("mockup_id", state.tpl.id);
    fd.append("mockup_name", state.tpl.name || "");
    fd.append("contact", form.contact);
    fd.append("note", $("bbNote").value.trim());
    // mỗi ô có ảnh → append "photos" (ẢNH GỐC) theo thứ tự + thu chỉ số lỗ (1-based)
    var slotsArr = [], si;
    for (si = 0; si < state.slots.length; si++) {
      var sl = state.slots[si];
      if (sl && sl.photoBlob) {
        fd.append("photos", sl.photoBlob, "photo-" + (si + 1) + ".png");
        slotsArr.push(si + 1);
      }
    }
    fd.append("photoSlots", JSON.stringify(slotsArr));
    if (comp) fd.append("composite", comp, "composite.png");
    if (opts.deposit) {
      fd.append("depositClaimed", opts.deposit.claimed ? "1" : "0");
      if (opts.deposit.ref) fd.append("depositRef", opts.deposit.ref);
      if (opts.deposit.blob) fd.append("deposit", opts.deposit.blob, "deposit.png");
    }
    var r = await fetch("/api/banner/request", { method: "POST", body: fd });
    if (!r.ok) throw new Error("req " + r.status);
    return r.json();
  }

  /* Hoàn tất sau khi gửi thành công: khoá nút + báo cho khách. */
  function onSent(j, contact, claimedDeposit) {
    state.sent = true;
    var extra = claimedDeposit ? " Cọc của bạn đã được ghi nhận — shop sẽ xác nhận sớm." : "";
    result("🎉 Đã gửi yêu cầu (mã " + (j.id || "") + ")! Dali Party sẽ liên hệ bạn qua " + contact + " để hoàn thiện banner." + extra, "ok");
    var b = $("bbSubmit"); b.disabled = true; b.textContent = "Đã gửi ✓";
    var soft = $("bbSubmitSoft"); if (soft) soft.hidden = true;
  }

  // gửi yêu cầu (nút chính khi tắt cọc / đã qua gate-at-start, hoặc nút phụ "shop liên hệ sau").
  // Nếu khách đã xác nhận cọc ở bước đầu (gate-at-start) → đính kèm thông tin cọc.
  function submitNoDeposit() {
    if (state.sent) return;
    var form = validateForm(); if (!form) return;
    var b = $("bbSubmit"); b.disabled = true; b.textContent = "Đang gửi…";
    var soft = $("bbSubmitSoft"); if (soft) soft.disabled = true;
    var dep = null, claimed = false;
    if (state.depositOk) {  // chỉ bật ở luồng gate-at-start sau khi khách bấm "đã chuyển"
      claimed = true;
      dep = { deposit: { claimed: true, ref: depositRef(), blob: state.depositShot || null } };
    }
    sendRequest(form, dep).then(function (j) {
      state.sentId = j.id || null;
      onSent(j, form.contact, claimed);
    }).catch(function () {
      result("Gửi chưa được (có thể máy chủ đang bận). Bạn thử lại, hoặc tải ảnh xem trước rồi gửi shop qua Zalo nhé.", "err");
      b.disabled = false; b.textContent = "Gửi yêu cầu cho shop ✨";
      if (soft) soft.disabled = false;
    });
  }

  $("bbSubmit").addEventListener("click", function () {
    if (state.sent) return;
    var dep = state.cfg;
    // Cọc bật + chặn-khi-gửi + chưa cọc → mở modal cọc (gửi kèm cọc bên trong).
    if (dep && dep.depositEnabled && dep.depositGate !== "start" && !state.depositOk) {
      var form = validateForm(); if (!form) return;
      openDeposit("submit", form);
      return;
    }
    submitNoDeposit();
  });
  var bbSoft = $("bbSubmitSoft");
  if (bbSoft) bbSoft.addEventListener("click", submitNoDeposit);

  $("bbDownload").addEventListener("click", async function () {
    var b = await canvasBlob(); if (!b) return;
    var a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "banner-" + (state.name || "dali") + ".png";
    document.body.appendChild(a); a.click(); a.remove();
  });

  /* ============================================================
     ĐẶT CỌC (deposit) — cấu hình từ máy chủ + modal chuyển khoản thủ công.
     Chỉ là VietQR/Momo: KHÔNG thẻ, KHÔNG cổng thanh toán, KHÔNG tự trừ tiền.
     Khách tự chuyển → bấm "Tôi đã chuyển cọc" → shop xác nhận tay.
     ============================================================ */
  function vnd(n) { return (Number(n) || 0).toLocaleString("vi-VN") + "₫"; }
  // Mã chuyển khoản gợi ý: ưu tiên mã đơn (sau khi gửi), nếu chưa có thì theo SĐT.
  function depositRef() {
    if (state.sentId) return "DALI-" + state.sentId;
    var c = ($("bbContact").value || "").replace(/[^0-9a-zA-Z]/g, "").slice(-8);
    return "DALI-" + (c || "MOI");
  }
  // URL ảnh VietQR (API ảnh công khai, miễn phí). Trả "" nếu thiếu cấu hình.
  function vietqrUrl(cfg, amount, addInfo) {
    if (!cfg.bankCode || !cfg.bankAccount) return "";
    var u = "https://img.vietqr.io/image/" + encodeURIComponent(cfg.bankCode) + "-" +
      encodeURIComponent(cfg.bankAccount) + "-compact2.png";
    var qs = [];
    if (amount) qs.push("amount=" + encodeURIComponent(amount));
    if (addInfo) qs.push("addInfo=" + encodeURIComponent(addInfo));
    if (cfg.accountName) qs.push("accountName=" + encodeURIComponent(cfg.accountName));
    return qs.length ? (u + "?" + qs.join("&")) : u;
  }
  function depOverlay() { return $("depOverlay"); }
  function closeDeposit() { var o = depOverlay(); if (o) o.classList.remove("open"); }
  function depMsg(el, msg, cls) { if (!el) return; el.textContent = msg || ""; el.className = "dep-msg" + (cls ? " show " + cls : ""); }
  // nút copy mã chuyển khoản
  function copyText(txt, btn) {
    function done() { if (btn) { var t = btn.textContent; btn.textContent = "Đã chép ✓"; setTimeout(function () { btn.textContent = t; }, 1400); } }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () {});
    } else {
      try { var ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done(); } catch (e) {}
    }
  }

  /* Mở modal cọc.
     mode "submit": gửi yêu cầu KÈM cọc khi khách bấm "Tôi đã chuyển cọc".
     mode "start" : chỉ MỞ KHOÁ trình tạo (chưa gửi gì) — gửi ở bước cuối như thường. */
  function openDeposit(mode, form) {
    var cfg = state.cfg; if (!cfg) return;
    var o = depOverlay(); if (!o) return;
    var body = $("depBody"), foot = $("depFoot");
    var amt = Number(cfg.depositAmount) || 0;
    var ref = depositRef();
    var configured = (cfg.method !== "manual") &&
      ((cfg.method === "momo" && cfg.momoPhone) || (cfg.bankCode && cfg.bankAccount));

    var html = "";
    // tóm tắt đơn
    var nSlots = 0, kk; for (kk = 0; kk < state.slots.length; kk++) { if (state.slots[kk] && state.slots[kk].photoBlob) nSlots++; }
    html += '<div class="dep-sum">Mẫu: <b>' + escH(state.tpl.name || "—") + "</b> · Số ảnh: <b>" + nSlots + "</b></div>";

    if (configured) {
      if (amt) html += '<div class="dep-amt-big">' + vnd(amt) + "</div>";
      var frame = cfg.note ? escH(cfg.note)
        : "Cọc được TRỪ vào tổng tiền banner, HOÀN LẠI nếu shop không nhận làm.";
      html += '<div class="dep-frame">' + frame + "</div>";

      if (cfg.method === "momo") {
        html += '<div class="dep-rows">' +
          '<div class="dep-kv"><span class="k">Ví Momo</span><span class="v">' + escH(cfg.momoPhone) + "</span>" +
            '<button class="dep-copy" type="button" data-copy="' + escH(cfg.momoPhone) + '">Chép</button></div>' +
          (cfg.accountName ? '<div class="dep-kv"><span class="k">Tên</span><span class="v">' + escH(cfg.accountName) + "</span></div>" : "") +
          '<div class="dep-kv"><span class="k">Nội dung</span><span class="v">' + escH(ref) + "</span>" +
            '<button class="dep-copy" type="button" data-copy="' + escH(ref) + '">Chép</button></div>' +
        "</div>";
      } else {
        var qr = vietqrUrl(cfg, amt, ref);
        if (qr) html += '<img class="dep-qr" src="' + escH(qr) + '" alt="Mã VietQR chuyển cọc" loading="lazy">';
        html += '<div class="dep-rows">' +
          '<div class="dep-kv"><span class="k">Ngân hàng</span><span class="v">' + escH(cfg.bankCode) + "</span></div>" +
          '<div class="dep-kv"><span class="k">Số TK</span><span class="v">' + escH(cfg.bankAccount) + "</span>" +
            '<button class="dep-copy" type="button" data-copy="' + escH(cfg.bankAccount) + '">Chép</button></div>' +
          (cfg.accountName ? '<div class="dep-kv"><span class="k">Chủ TK</span><span class="v">' + escH(cfg.accountName) + "</span></div>" : "") +
          '<div class="dep-kv"><span class="k">Nội dung</span><span class="v">' + escH(ref) + "</span>" +
            '<button class="dep-copy" type="button" data-copy="' + escH(ref) + '">Chép</button></div>' +
        "</div>";
      }
      html += '<label class="dep-proof">Ảnh chụp màn hình đã chuyển (tuỳ chọn):' +
        '<input type="file" id="depShot" accept="image/*"></label>';
    } else {
      // chưa cấu hình ngân hàng → fallback liên hệ shop
      var zalo = cfg.shopZalo || "";
      html += '<div class="dep-fallback">Vui lòng <b>liên hệ shop để đặt cọc</b>.' +
        (zalo ? '<br>Zalo/SĐT: <a href="tel:' + escH(zalo.replace(/[^0-9+]/g, "")) + '">' + escH(zalo) + "</a>" : "") +
        "<br>Bạn vẫn có thể tải ảnh xem trước rồi gửi cho shop nhé.</div>";
    }
    html += '<div class="dep-msg" id="depMsg" role="status"></div>';
    body.innerHTML = html;

    // chân modal — nút hành động tuỳ mode
    var fhtml = "";
    if (configured) {
      fhtml += '<button class="btn btn--block btn--lg" id="depConfirm" type="button">Tôi đã chuyển cọc ✓</button>';
    }
    if (mode === "submit") {
      fhtml += '<button class="btn btn--block btn--soft" id="depLater" type="button">Gửi yêu cầu (shop liên hệ sau)</button>';
    } else if (configured) {
      fhtml += '<button class="btn btn--block btn--soft" id="depLater" type="button">Để sau, xem mẫu trước</button>';
    } else {
      fhtml += '<button class="btn btn--block btn--soft" id="depLater" type="button">Tiếp tục</button>';
    }
    foot.innerHTML = fhtml;

    // chép nội dung
    [].forEach.call(body.querySelectorAll(".dep-copy"), function (btn) {
      btn.addEventListener("click", function () { copyText(btn.getAttribute("data-copy"), btn); });
    });

    var msgEl = $("depMsg");
    var confirmBtn = $("depConfirm");
    if (confirmBtn) confirmBtn.addEventListener("click", function () {
      var shotEl = $("depShot");
      var blob = (shotEl && shotEl.files && shotEl.files[0]) ? shotEl.files[0] : null;
      if (mode === "submit") {
        // GỬI yêu cầu kèm cọc
        confirmBtn.disabled = true; confirmBtn.textContent = "Đang gửi…";
        sendRequest(form, { deposit: { claimed: true, ref: ref, blob: blob } }).then(function (j) {
          state.sentId = j.id || null;
          closeDeposit();
          onSent(j, form.contact, true);
        }).catch(function () {
          depMsg(msgEl, "Gửi chưa được — máy chủ đang bận. Bạn thử lại nhé.", "err");
          confirmBtn.disabled = false; confirmBtn.textContent = "Tôi đã chuyển cọc ✓";
        });
      } else {
        // gate-at-start: mở khoá builder (chưa gửi). Lưu ảnh CK để đính kèm khi gửi.
        state.depositOk = true;
        if (blob) state.depositShot = blob;
        closeDeposit();
        result("✅ Đã ghi nhận bạn sẽ chuyển cọc. Mời chọn mẫu & tải ảnh bé.", "ok");
      }
    });
    var laterBtn = $("depLater");
    if (laterBtn) laterBtn.addEventListener("click", function () {
      if (mode === "submit") {
        // nút mềm: gửi yêu cầu KHÔNG cọc (vẫn giữ lead)
        closeDeposit();
        submitNoDeposit();
      } else {
        // gate-at-start "để sau": vẫn mở khoá để khách trải nghiệm (giữ funnel)
        state.depositOk = true;
        closeDeposit();
      }
    });

    o.classList.add("open");
  }

  // đóng modal: nút X / bấm nền
  (function wireDepClose() {
    var x = $("depClose"); if (x) x.addEventListener("click", closeDeposit);
    var o = depOverlay();
    if (o) o.addEventListener("click", function (e) { if (e.target === o) closeDeposit(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDeposit(); });
  })();

  // nạp cấu hình cọc; nếu chặn-từ-đầu thì mở modal ngay
  (function loadConfig() {
    fetch("/api/banner/config", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) {
        if (!c || !c.depositEnabled) return; // tắt cọc → giữ luồng gửi thường
        state.cfg = c;
        var soft = $("bbSubmitSoft");
        if (c.depositGate === "start") {
          // chặn từ đầu: hiện modal cọc trước khi khách dùng builder
          openDeposit("start", null);
        } else {
          // chặn khi gửi: lộ nút mềm "shop liên hệ sau" để không mất lead
          if (soft) soft.hidden = false;
        }
      })
      .catch(function () { /* backend down → im lặng, luồng gửi thường vẫn chạy */ });
  })();

  /* ---------- khởi tạo ---------- */
  makeSlots(state.tpl);
  renderSlots();
  updateZoomUI();
  render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
