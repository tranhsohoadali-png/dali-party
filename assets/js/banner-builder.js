/* ============================================================
   DALI PARTY — Banner builder (trang /tao-banner)
   Khách chọn mẫu → tải ảnh bé → AI tách nền (rembg trên VPS) →
   ghép cảnh trên canvas → gửi yêu cầu cho shop.
   Backend: POST /api/banner/remove-bg, POST /api/banner/request.
   Nếu backend chưa sống → tự fallback dùng ảnh gốc (không tách nền).
   ============================================================ */
(function () {
  "use strict";
  var cv = document.getElementById("bannerCanvas");
  if (!cv) return;
  var ctx = cv.getContext("2d");
  var W = cv.width, H = cv.height;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s); }

  /* ---------- Mẫu (thiết kế riêng cho Dali Party) ---------- */
  var TEMPLATES = [
    { id: "dino",  name: "Khủng long", emoji: "🦕",
      bg: ["#eef6dd", "#cbe7a0"], card: "#e6f3cf", stroke: "#b6db84",
      ink: "#2f5d12", script: "#5a8f1f", deco: "🦕", deco2: "🌿" },
    { id: "pink",  name: "Hồng thỏ",  emoji: "🐰",
      bg: ["#ffe9f0", "#ffc6dc"], card: "#ffdbe8", stroke: "#ff9fc0",
      ink: "#b03468", script: "#d94f86", deco: "🐰", deco2: "🎀" },
    { id: "blue",  name: "Mây sao",   emoji: "⭐",
      bg: ["#e9f2ff", "#c8ddfb"], card: "#dcecff", stroke: "#a9cdf5",
      ink: "#1d5aa8", script: "#2f6fc0", deco: "⭐", deco2: "☁️" }
  ];
  var SLOT = { x: 0.265, y: 0.415, w: 0.58, h: 0.47 }; // khung ảnh (theo tỉ lệ canvas)

  var state = {
    tpl: TEMPLATES[0],
    img: null,            // ảnh đang hiển thị (cutout nếu có, không thì ảnh gốc)
    photoBlob: null,      // ảnh gốc (blob) để gửi shop
    cutoutBlob: null,     // ảnh đã tách nền (blob) nếu có
    tf: { scale: 1, dx: 0, dy: 0 },
    name: "", date: "", age: "",
    sent: false
  };

  /* ---------- vẽ ---------- */
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
  function slotRect() {
    return { x: SLOT.x * W, y: SLOT.y * H, w: SLOT.w * W, h: SLOT.h * H };
  }
  function fitFont(text, max, weight, family) {
    var size = 130;
    do { ctx.font = weight + " " + size + "px " + family; size -= 2; }
    while (size > 24 && ctx.measureText(text).width > max);
    return size + 2;
  }

  function draw() {
    var t = state.tpl;
    ctx.clearRect(0, 0, W, H);
    // nền gradient
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.bg[0]); g.addColorStop(1, t.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // chấm bi trang trí
    ctx.fillStyle = "rgba(255,255,255,.5)";
    var dots = [[90, 110, 26], [910, 150, 20], [80, 1180, 18], [930, 1120, 24], [120, 640, 12], [880, 720, 14]];
    dots.forEach(function (d) { ctx.beginPath(); ctx.arc(d[0], d[1], d[2], 0, 7); ctx.fill(); });

    // thẻ arch
    var cx = 70, cy = 120, cw = W - 140, ch = H - 220;
    ctx.save();
    ctx.shadowColor = "rgba(40,60,0,.10)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    rr(cx, cy, cw, ch, 200, 46); ctx.fillStyle = t.card; ctx.fill();
    ctx.restore();
    rr(cx, cy, cw, ch, 200, 46); ctx.lineWidth = 5; ctx.strokeStyle = t.stroke; ctx.stroke();

    // Happy Birthday (chữ thư pháp)
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = t.script;
    ctx.font = "700 78px 'Dancing Script', cursive";
    ctx.fillText("Happy Birthday", W / 2, cy + 130);

    // Tên bé
    var name = (state.name || "Tên bé").toUpperCase();
    var fs = fitFont(name, cw - 130, "800", "'Be Vietnam Pro', sans-serif");
    ctx.font = "800 " + fs + "px 'Be Vietnam Pro', sans-serif";
    ctx.fillStyle = t.ink;
    ctx.fillText(name, W / 2, cy + 130 + fs * 0.86 + 18);

    // ngày + tuổi
    var sub = [];
    if (state.age) sub.push("🎂 " + state.age + " tuổi");
    if (state.date) sub.push("📅 " + state.date);
    if (sub.length) {
      ctx.font = "600 34px 'Be Vietnam Pro', sans-serif";
      ctx.fillStyle = t.ink;
      ctx.fillText(sub.join("   "), W / 2, cy + 230 + fs * 0.5);
    }

    // khung ảnh + ảnh
    var s = slotRect();
    ctx.save();
    rr(s.x, s.y, s.w, s.h, 28); ctx.clip();
    if (state.img) {
      var iw = state.img.naturalWidth || state.img.width;
      var ih = state.img.naturalHeight || state.img.height;
      var base = Math.max(s.w / iw, s.h / ih);
      var sc = base * state.tf.scale;
      var dw = iw * sc, dh = ih * sc;
      ctx.drawImage(state.img, s.x + s.w / 2 - dw / 2 + state.tf.dx, s.y + s.h / 2 - dh / 2 + state.tf.dy, dw, dh);
    } else {
      ctx.fillStyle = "rgba(0,0,0,.05)"; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = "rgba(0,0,0,.30)"; ctx.font = "600 30px 'Be Vietnam Pro', sans-serif";
      ctx.fillText("📷 Ảnh bé", s.x + s.w / 2, s.y + s.h / 2);
    }
    ctx.restore();
    rr(s.x, s.y, s.w, s.h, 28); ctx.lineWidth = 6; ctx.strokeStyle = "#fff"; ctx.stroke();

    // số tuổi kiểu bóng foil vàng (nếu là số)
    if (/^\d{1,2}$/.test(state.age)) {
      var nx = W - 150, ny = s.y + 60;
      var gg = ctx.createLinearGradient(nx - 60, ny, nx + 60, ny + 150);
      gg.addColorStop(0, "#ffe27a"); gg.addColorStop(.5, "#f4b21a"); gg.addColorStop(1, "#d98a00");
      ctx.font = "800 200px 'Be Vietnam Pro', sans-serif";
      ctx.fillStyle = gg; ctx.strokeStyle = "rgba(150,90,0,.4)"; ctx.lineWidth = 4;
      ctx.fillText(state.age, nx, ny + 150); ctx.strokeText(state.age, nx, ny + 150);
    }

    // trang trí góc
    ctx.font = "120px serif";
    ctx.fillText(t.deco, cx + cw - 70, cy + 110);
    ctx.font = "64px serif";
    ctx.fillText(t.deco2, cx + 70, cy + ch - 60);
  }

  var raf = 0;
  function render() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); }); }

  /* ---------- gallery mẫu ---------- */
  var tplWrap = $("bbTpls");
  TEMPLATES.forEach(function (t) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "bb-tpl" + (t.id === state.tpl.id ? " active" : "");
    b.dataset.tpl = t.id;
    b.innerHTML = '<span class="sw" style="background:linear-gradient(135deg,' + t.bg[0] + ',' + t.bg[1] + ')">' + t.emoji + '</span><small>' + esc(t.name) + '</small>';
    b.addEventListener("click", function () {
      state.tpl = t;
      [].forEach.call(tplWrap.children, function (c) { c.classList.toggle("active", c.dataset.tpl === t.id); });
      render();
    });
    tplWrap.appendChild(b);
  });

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
    state.photoBlob = file; state.cutoutBlob = null;
    state.tf = { scale: 1, dx: 0, dy: 0 };
    $("bbZoom").value = 1;
    try { state.img = await loadImg(file); } catch (err) { setStatus("Không đọc được ảnh.", "err"); return; }
    $("bbZoomWrap").hidden = false; $("bbHint").textContent = "Kéo ảnh trong khung để chỉnh vị trí.";
    render();
    // gọi AI tách nền (nếu backend sống)
    setStatus("🪄 Đang tách nền bằng AI…", "busy");
    try {
      var fd = new FormData(); fd.append("file", file, "photo.png");
      var r = await fetch("/api/banner/remove-bg", { method: "POST", body: fd });
      if (!r.ok) throw new Error("bg " + r.status);
      var cut = await r.blob();
      if (!cut || cut.size < 100) throw new Error("empty");
      state.cutoutBlob = cut; state.img = await loadImg(cut);
      setStatus("✅ Đã tách nền xong.", "ok"); render();
    } catch (err) {
      setStatus("Dùng ảnh gốc (chưa tách được nền). Bạn vẫn gửi yêu cầu bình thường nhé.", "");
    }
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
