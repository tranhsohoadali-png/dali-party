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
    sent: false
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
          : '<span class="bb-slot-sub">' + (slot.img ? "✓ đã có ảnh" : "chưa có ảnh") + "</span>";
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

  $("bbSubmit").addEventListener("click", async function () {
    if (state.sent) return;
    var name = $("bbName").value.trim(), contact = $("bbContact").value.trim();
    if (!name) { result("Vui lòng nhập tên bé.", "err"); $("bbName").focus(); return; }
    // cần ÍT NHẤT một ô có ảnh
    var hasPhoto = false, k;
    for (k = 0; k < state.slots.length; k++) { if (state.slots[k] && state.slots[k].photoBlob) { hasPhoto = true; break; } }
    if (!hasPhoto) { result("Vui lòng tải ít nhất một ảnh bé.", "err"); return; }
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
  makeSlots(state.tpl);
  renderSlots();
  updateZoomUI();
  render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
