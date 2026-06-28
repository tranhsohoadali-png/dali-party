/* ============================================================
   DALI PARTY — Banner builder (trang /tao-banner)
   Khách chọn mẫu → tải ảnh bé → AI tách nền (rembg trên VPS) →
   ghép cảnh trên canvas → gửi yêu cầu cho shop.
   Backend: POST /api/banner/remove-bg, POST /api/banner/request.
   Nếu backend chưa sống → tự fallback dùng ảnh gốc (không tách nền).

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
  var SLOT = { x: 0.265, y: 0.415, w: 0.58, h: 0.47 }; // khung ảnh mặc định (tỉ lệ canvas)

  var state = {
    tpl: TEMPLATES[0],
    img: null,            // ảnh đang hiển thị trong khung
    photoBlob: null,      // ảnh gốc (blob) để gửi shop
    cutoutBlob: null,     // ảnh đã tách nền (blob) nếu có
    mode: "full",         // "full" = cả người | "face" = thay mặt (cắt mặt tròn)
    fullImg: null,        // ảnh chế độ "cả người" (cutout nếu có, không thì ảnh gốc)
    faceImg: null,        // canvas mặt tròn (chế độ "thay mặt")
    tf: { scale: 1, dx: 0, dy: 0 },
    name: "", date: "", age: "",
    sent: false
  };

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
  function slotRect(tpl) {
    var hole = tpl && tpl.hole;
    if (hole) return { x: hole.x * W, y: hole.y * H, w: hole.w * W, h: hole.h * H, round: !!hole.round };
    return { x: SLOT.x * W, y: SLOT.y * H, w: SLOT.w * W, h: SLOT.h * H, round: false };
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

  /* ---------- vẽ ảnh/mặt bé vào "lỗ" ---------- */
  function drawPhotoHole(s) {
    ctx.save();
    if (s.round) {
      var cr = Math.min(s.w, s.h) / 2;
      ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h / 2, cr, 0, Math.PI * 2); ctx.clip();
    } else {
      rr(s.x, s.y, s.w, s.h, 28); ctx.clip();
    }
    if (state.img) {
      var iw = state.img.naturalWidth || state.img.width;
      var ih = state.img.naturalHeight || state.img.height;
      var b = Math.max(s.w / iw, s.h / ih);
      var sc = b * state.tf.scale;
      var dw = iw * sc, dh = ih * sc;
      ctx.drawImage(state.img, s.x + s.w / 2 - dw / 2 + state.tf.dx, s.y + s.h / 2 - dh / 2 + state.tf.dy, dw, dh);
    } else {
      ctx.fillStyle = "rgba(0,0,0,.05)"; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = "rgba(0,0,0,.30)"; ctx.font = "600 30px 'Be Vietnam Pro', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("📷 Ảnh bé", s.x + s.w / 2, s.y + s.h / 2);
    }
    ctx.restore();
    // viền trắng
    ctx.save();
    if (s.round) {
      var cr2 = Math.min(s.w, s.h) / 2;
      ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h / 2, cr2, 0, Math.PI * 2);
    } else { rr(s.x, s.y, s.w, s.h, 28); }
    ctx.lineWidth = s.round ? 10 : 6; ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.restore();
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
      var s = slotRect(t);
      // Chế độ "thay mặt": luôn cắt mặt bé thành hình tròn trong lỗ
      // (kể cả khi lỗ vốn vuông). "Cả người": tôn trọng hole.round.
      if (state.mode === "face") s.round = true;
      drawPhotoHole(s);
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

    // 6. khung ảnh / mặt bé
    var sA = slotRect(t);
    sA.round = (state.mode === "face");
    drawPhotoHole(sA);

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
        [].forEach.call(tplWrap.children, function (c) { c.classList.toggle("active", c.dataset.tpl === t.id); });
        render();
      });
      tplWrap.appendChild(b);
    });
  }
  renderGallery();

  /* ---------- nạp mẫu ẢNH NỀN từ kho /api/mockups (degrade gracefully) ---------- */
  function buildTplFromMockup(m) {
    return {
      id: m.id,
      name: m.name || "Mẫu",
      bg: m.image,                       // URL same-origin (vd "/api/mockups/<id>/image")
      hole: m.hole,                      // {x,y,w,h,round} (0..1)
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
        // chỉ lấy mẫu có ảnh + lỗ hợp lệ
        var tpls = items.filter(function (m) { return m && m.image && m.hole; }).map(buildTplFromMockup);
        if (!tpls.length) return; // backend rỗng/down → giữ nguyên mẫu vẽ fallback
        TEMPLATES = tpls;
        state.tpl = TEMPLATES[0]; // mặc định chọn mẫu đầu
        renderGallery();
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

  $("bbPhoto").addEventListener("change", async function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { setStatus("Ảnh quá lớn (tối đa 12MB).", "err"); return; }
    state.photoBlob = file; state.cutoutBlob = null; state.faceImg = null; state.mode = "full";
    state.tf = { scale: 1, dx: 0, dy: 0 }; $("bbZoom").value = 1;
    var fullR = document.querySelector('input[name=bbmode][value=full]'); if (fullR) fullR.checked = true;
    try { state.fullImg = state.img = await loadImg(file); } catch (err) { setStatus("Không đọc được ảnh.", "err"); return; }
    $("bbZoomWrap").hidden = false; $("bbModeWrap").hidden = false;
    $("bbHint").textContent = "Kéo ảnh trong khung để chỉnh vị trí.";
    render();
    if (window.DaliFace && window.DaliFace.ensureMediaPipe) window.DaliFace.ensureMediaPipe().catch(function () {}); // làm nóng model mặt
    // AI tách nền cả người (chế độ "Cả người") — cần backend; không có thì dùng ảnh gốc
    setStatus("🪄 Đang tách nền bằng AI…", "busy");
    try {
      var fd = new FormData(); fd.append("file", file, "photo.png");
      var r = await fetch("/api/banner/remove-bg", { method: "POST", body: fd });
      if (!r.ok) throw new Error("bg " + r.status);
      var cut = await r.blob();
      if (!cut || cut.size < 100) throw new Error("empty");
      state.cutoutBlob = cut; state.fullImg = await loadImg(cut);
      if (state.mode === "full") { state.img = state.fullImg; render(); }
      setStatus("✅ Đã tách nền xong.", "ok");
    } catch (err) {
      setStatus("Dùng ảnh gốc (chưa tách được nền). Bạn vẫn gửi yêu cầu bình thường nhé.", "");
    }
  });

  /* ---- chế độ Cả người / Thay mặt (cắt mặt tròn, chạy trên trình duyệt) ---- */
  function applyMode() {
    state.tf = { scale: 1, dx: 0, dy: 0 }; $("bbZoom").value = 1;
    state.img = (state.mode === "face" && state.faceImg) ? state.faceImg : state.fullImg;
    render();
  }
  [].forEach.call(document.querySelectorAll('input[name=bbmode]'), function (radio) {
    radio.addEventListener("change", async function () {
      if (!this.checked) return;
      if (this.value === "face") {
        state.mode = "face";
        if (!state.faceImg) {
          if (!window.detectFaceCircle || !state.photoBlob) { setStatus("Chưa sẵn sàng cắt mặt.", "err"); return; }
          setStatus("🙂 Đang tự cắt mặt bé…", "busy");
          try {
            var fr = await window.detectFaceCircle(state.photoBlob, { size: 512, padding: 0.85 });
            state.faceImg = fr.canvas;
            setStatus(fr.found ? "✅ Đã cắt mặt tự động (" + fr.engine + ")." : "Chưa thấy mặt rõ — dùng vòng giữa, kéo/phóng để chỉnh.", fr.found ? "ok" : "");
          } catch (e2) {
            setStatus("Chưa cắt được mặt (nên dùng ảnh chụp thẳng, rõ mặt, nền đơn giản).", "err");
            state.mode = "full";
            var fr2 = document.querySelector('input[name=bbmode][value=full]'); if (fr2) fr2.checked = true;
            applyMode(); return;
          }
        }
      } else { state.mode = "full"; }
      applyMode();
    });
  });

  $("bbZoom").addEventListener("input", function () { state.tf.scale = parseFloat(this.value) || 1; render(); });

  /* ---------- kéo ảnh trong khung ---------- */
  var drag = null;
  function pt(e) {
    var r = cv.getBoundingClientRect();
    var src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * (W / r.width), y: (src.clientY - r.top) * (H / r.height) };
  }
  function down(e) {
    if (!state.img) return;
    var p = pt(e); drag = { x: p.x, y: p.y, dx: state.tf.dx, dy: state.tf.dy };
    cv.classList.add("dragging"); e.preventDefault();
  }
  function move(e) {
    if (!drag) return;
    var p = pt(e);
    state.tf.dx = drag.dx + (p.x - drag.x); state.tf.dy = drag.dy + (p.y - drag.y);
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

  $("bbSubmit").addEventListener("click", async function () {
    if (state.sent) return;
    var name = $("bbName").value.trim(), contact = $("bbContact").value.trim();
    if (!name) { result("Vui lòng nhập tên bé.", "err"); $("bbName").focus(); return; }
    if (!state.photoBlob) { result("Vui lòng tải ảnh bé.", "err"); return; }
    if (!contact) { result("Vui lòng nhập SĐT/Zalo để shop liên hệ.", "err"); $("bbContact").focus(); return; }
    this.disabled = true; this.textContent = "Đang gửi…";
    try {
      var comp = await canvasBlob();
      var fd = new FormData();
      fd.append("name", name);
      fd.append("birthday", $("bbDate").value.trim());
      fd.append("age", $("bbAge").value.trim());
      fd.append("template", state.tpl.id);
      fd.append("mockup_id", state.tpl.id);
      fd.append("mockup_name", state.tpl.name || "");
      fd.append("contact", contact);
      fd.append("note", $("bbNote").value.trim());
      fd.append("photo", state.photoBlob, "photo.png");
      if (state.cutoutBlob) fd.append("cutout", state.cutoutBlob, "cutout.png");
      if (comp) fd.append("composite", comp, "composite.png");
      var r = await fetch("/api/banner/request", { method: "POST", body: fd });
      if (!r.ok) throw new Error("req " + r.status);
      var j = await r.json();
      state.sent = true;
      result("🎉 Đã gửi yêu cầu (mã " + (j.id || "") + ")! Dali Party sẽ liên hệ bạn qua " + contact + " để hoàn thiện banner.", "ok");
      this.textContent = "Đã gửi ✓";
    } catch (err) {
      result("Gửi chưa được (có thể máy chủ đang bận). Bạn thử lại, hoặc tải ảnh xem trước rồi gửi shop qua Zalo nhé.", "err");
      this.disabled = false; this.textContent = "Gửi yêu cầu cho shop ✨";
    }
  });

  $("bbDownload").addEventListener("click", async function () {
    var b = await canvasBlob(); if (!b) return;
    var a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "banner-" + (state.name || "dali") + ".png";
    document.body.appendChild(a); a.click(); a.remove();
  });

  /* ---------- khởi tạo ---------- */
  render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
