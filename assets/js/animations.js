/* ============================================================
   DALI PARTY — animation engine
   confetti · floating balloons · parallax · reveals · counters
   testimonials · cursor sparkles · headline reveal
   ============================================================ */
(function () {
  "use strict";
  window.DALI = window.DALI || {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  // refined confetti + cursor sparkles (boutique gold / sage / cream + a pop of brand green)
  const PALETTE = ["#c9a86a", "#e0c478", "#efe7d2", "#8aa676", "#6f8a5a", "#8cc63f", "#ffffff"];
  // premium floating balloons (sage / olive / cream / gold) to match the hero photo
  const BALLOON_PALETTE = ["#7d9b6a", "#9bae89", "#e8e2d0", "#c9a86a", "#d8c89a", "#52643d", "#b9cd9e"];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  /* ============================================================
     1) CONFETTI  (single shared canvas)
     ============================================================ */
  let cvs, ctx, parts = [], raf = null, dpr = Math.min(devicePixelRatio || 1, 2);
  function ensureCanvas() {
    if (cvs) return;
    cvs = document.createElement("canvas");
    cvs.className = "fx-canvas";
    document.body.appendChild(cvs);
    ctx = cvs.getContext("2d");
    resize();
    window.addEventListener("resize", resize, { passive: true });
  }
  function resize() {
    if (!cvs) return;
    cvs.width = innerWidth * dpr; cvs.height = innerHeight * dpr;
    cvs.style.width = innerWidth + "px"; cvs.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function spawn(x, y, n, spread) {
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2), sp = rand(3, 11) * (spread || 1);
      parts.push({
        x, y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - rand(4, 9),
        g: rand(0.18, 0.32), w: rand(6, 11), h: rand(8, 15),
        rot: rand(0, Math.PI), vr: rand(-0.25, 0.25),
        color: pick(PALETTE), life: 1, fade: rand(0.008, 0.016),
        shape: Math.random() < 0.35 ? "circle" : "rect",
      });
    }
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function loop() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr; p.life -= p.fade;
      if (p.life <= 0 || p.y > innerHeight + 40) { parts.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
      if (p.shape === "circle") { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 7); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (parts.length) raf = requestAnimationFrame(loop);
    else { raf = null; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  DALI.confettiBurst = function (el) {
    if (reduce) return;
    ensureCanvas();
    let x = innerWidth / 2, y = innerHeight / 2;
    if (el && el.getBoundingClientRect) { const r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
    spawn(x, y, 70, 1);
  };
  DALI.confettiSky = function () {
    if (reduce) return;
    ensureCanvas();
    let count = 0;
    const iv = setInterval(() => { spawn(rand(0, innerWidth), -10, 14, 0.4); if (++count > 6) clearInterval(iv); }, 140);
  };

  /* ============================================================
     2) FLOATING DECORATIVE BALLOONS
     ============================================================ */
  function balloonSVG(color) {
    return `<svg viewBox="0 0 60 86" xmlns="http://www.w3.org/2000/svg">
      <path d="M30 4 C45 4 54 18 54 32 C54 50 38 62 31 64 L29 64 C22 62 6 50 6 32 C6 18 15 4 30 4 Z" fill="${color}"/>
      <path d="M28 64 l4 0 -2 6 z" fill="${color}"/>
      <path d="M30 70 C26 74 34 78 30 84" stroke="${color}" stroke-width="1.5" fill="none" opacity=".6" stroke-linecap="round"/>
      <ellipse cx="22" cy="24" rx="6" ry="9" fill="#fff" opacity=".45"/>
    </svg>`;
  }
  DALI.balloonSVG = balloonSVG;

  // real (photographic) balloon cutouts — Adobe Stock photos, AI background-removed (transparent PNG)
  const REAL_BALLOONS = ["rb-cream", "rb-white", "rb-pearl", "rb-gold"].map(function (n) { return "assets/img/balloons/" + n + ".png"; });

  function populateLayer(layer) {
    if (reduce) return;
    const n = parseInt(layer.dataset.balloons || "5", 10);
    for (let i = 0; i < n; i++) {
      const b = document.createElement("div");
      b.className = "balloon balloon--real";
      const size = rand(78, 150);
      b.style.setProperty("--bw", size + "px");
      b.style.setProperty("--dur", rand(6.5, 11) + "s");
      b.style.setProperty("--delay", rand(-6, 0) + "s");
      b.style.setProperty("--rot", rand(-5, 5) + "deg");
      b.style.left = rand(0, 88) + "%";
      b.style.top = rand(0, 80) + "%";
      b.style.opacity = rand(0.7, 0.96).toFixed(2);
      b.dataset.depth = (size / 150).toFixed(2);
      const img = document.createElement("img");
      img.src = pick(REAL_BALLOONS);
      img.alt = "";
      img.loading = "lazy";
      b.appendChild(img);
      layer.appendChild(b);
    }
  }

  /* ============================================================
     3) PARALLAX  (scroll + mouse on hero)
     ============================================================ */
  function initParallax() {
    if (reduce) return;
    const layers = [...document.querySelectorAll(".balloon-layer")];
    const items = [...document.querySelectorAll("[data-parallax]")];
    let mx = 0, my = 0, ty = 0;
    window.addEventListener("scroll", () => { ty = window.scrollY; }, { passive: true });
    if (finePointer) {
      const hero = document.querySelector(".hero");
      hero?.addEventListener("mousemove", (e) => {
        const r = hero.getBoundingClientRect();
        mx = (e.clientX - r.left) / r.width - 0.5;
        my = (e.clientY - r.top) / r.height - 0.5;
      });
    }
    if (!layers.length && !items.length) return;          // nothing to move — don't spin a loop
    let px = NaN, py = NaN, pt = NaN;                       // last-applied values (dirty check)
    function frame() {
      if (document.hidden) { requestAnimationFrame(frame); return; }
      if (mx !== px || my !== py || ty !== pt) {            // only touch the DOM when something changed
        px = mx; py = my; pt = ty;
        layers.forEach((layer) => {
          [...layer.children].forEach((b) => {
            const d = parseFloat(b.dataset.depth || 0.6);
            b.style.translate = `${mx * 26 * d}px ${my * 22 * d - ty * 0.04 * d}px`;
          });
        });
        items.forEach((el) => {
          const sp = parseFloat(el.dataset.parallax || 0.2);
          el.style.transform = `translateY(${ty * sp}px)`;
        });
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ============================================================
     4) SCROLL REVEAL + STAGGER + COUNTERS
     ============================================================ */
  function initReveal() {
    const els = document.querySelectorAll("[data-reveal], [data-stagger], [data-count]");
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        if (el.hasAttribute("data-stagger")) {
          [...el.children].forEach((c, i) => { c.style.transitionDelay = i * 90 + "ms"; });
        }
        el.classList.add("in");
        if (el.hasAttribute("data-count")) countUp(el);
        io.unobserve(el);
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => io.observe(e));
  }
  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const dec = (el.dataset.count.split(".")[1] || "").length;
    const suffix = el.dataset.suffix || "";
    const dur = 1500; const t0 = performance.now();
    function step(t) {
      const k = Math.min((t - t0) / dur, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const val = target * e;
      el.textContent = (dec ? val.toFixed(dec) : Math.round(val).toLocaleString("vi-VN")) + suffix;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ============================================================
     5) TESTIMONIAL CAROUSEL
     ============================================================ */
  function initTesti() {
    const wrap = document.querySelector("[data-testi]");
    if (!wrap) return;
    const slides = [...wrap.querySelectorAll(".testi")];
    const dots = [...wrap.querySelectorAll(".testi-dots button")];
    let i = 0, timer;
    function go(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle("active", k === i));
      dots.forEach((d, k) => d.classList.toggle("active", k === i));
    }
    function auto() { timer = setInterval(() => go(i + 1), 4500); }
    dots.forEach((d, k) => d.addEventListener("click", () => { go(k); clearInterval(timer); auto(); }));
    wrap.addEventListener("mouseenter", () => clearInterval(timer));
    wrap.addEventListener("mouseleave", auto);
    go(0); auto();
  }

  /* ============================================================
     6) CURSOR SPARKLE TRAIL (hero only)
     ============================================================ */
  function initCursor() {
    if (reduce || !finePointer) return;
    const hero = document.querySelector("[data-cursor]");
    if (!hero) return;
    let last = 0;
    hero.addEventListener("mousemove", (e) => {
      const now = performance.now();
      if (now - last < 55) return; last = now;
      const s = document.createElement("span");
      s.textContent = pick(["✦", "✧", "·", "✺", "❋"]);
      s.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;pointer-events:none;z-index:65;
        color:${pick(PALETTE)};font-size:${rand(10, 20)}px;transform:translate(-50%,-50%);transition:all .8s ease-out;opacity:1`;
      document.body.appendChild(s);
      requestAnimationFrame(() => {
        s.style.top = e.clientY - rand(24, 60) + "px";
        s.style.opacity = "0";
        s.style.transform = `translate(-50%,-50%) scale(.3) rotate(${rand(-60, 60)}deg)`;
      });
      setTimeout(() => s.remove(), 820);
    });
  }

  /* ============================================================
     7) HERO HEADLINE word reveal
     ============================================================ */
  function initHeadline() {
    const h = document.querySelector("[data-words]");
    if (!h) return;
    const words = h.querySelectorAll(".word");
    words.forEach((w, i) => {
      w.style.opacity = "0";
      w.style.display = "inline-block";
      w.style.transform = "translateY(28px) rotate(3deg)";
      w.style.transition = "opacity .6s var(--ease), transform .6s var(--ease-back)";
      if (reduce) { w.style.opacity = "1"; w.style.transform = "none"; return; }
      setTimeout(() => { w.style.opacity = "1"; w.style.transform = "none"; }, 250 + i * 110);
    });
  }

  /* ============================================================
     INIT
     ============================================================ */
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".balloon-layer").forEach(populateLayer);
    initParallax();
    initReveal();
    initTesti();
    initCursor();

    /* Tiêu đề hero + confetti chào mừng: nếu intro mở màn đang chạy, đợi nó kết
       thúc rồi mới diễn (tránh "diễn" phí phía sau lớp overlay che màn hình). */
    let entranceDone = false;
    const heroEntrance = () => {
      if (entranceDone) return; entranceDone = true;
      if (document.querySelector("[data-cursor]")) DALI.confettiSky();
    };
    if (document.documentElement.classList.contains("intro-first") && !reduce) {
      /* lần đầu: tiêu đề + các mảng hero hiện bằng CSS (@keyframes gắn .intro-go);
         JS chỉ bắn confetti chào mừng đúng lúc intro tan */
      window.addEventListener("dali:intro-done", heroEntrance, { once: true });
      setTimeout(heroEntrance, 13000);   /* an toàn */
    } else {
      /* không có intro, hoặc reduced-motion (intro đã bị tắt) → diễn ngay (tiêu đề từng chữ) */
      initHeadline();
      if (document.querySelector("[data-cursor]")) setTimeout(() => DALI.confettiSky(), 500);
    }
  });
})();
