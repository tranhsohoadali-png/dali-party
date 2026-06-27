/* ============================================================
   DALI PARTY — premium motion layer (progressive enhancement)
   Lenis smooth-scroll + GSAP ScrollTrigger parallax + magnetic CTAs.
   If GSAP/Lenis are unavailable (offline) or the user prefers reduced
   motion, this does nothing and the built-in vanilla animations remain.
   ============================================================ */
(function () {
  "use strict";

  function start() {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !window.gsap || !window.Lenis || !window.ScrollTrigger) return;

    var gsap = window.gsap;
    gsap.registerPlugin(window.ScrollTrigger);

    /* ---- 1) Lenis smooth scroll, synced to GSAP ticker + ScrollTrigger ---- */
    var lenis = new window.Lenis({
      duration: 1.45,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      smoothTouch: false,
      wheelMultiplier: 0.92,
      touchMultiplier: 1.4,
    });
    window.lenis = lenis;
    lenis.on("scroll", window.ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
    document.documentElement.classList.add("lenis-on");

    /* pause smooth scroll while the cart drawer / mobile menu is open */
    var mo = new MutationObserver(function () {
      var locked = document.body.style.overflow === "hidden";
      if (locked) lenis.stop(); else lenis.start();
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ["style"] });

    /* smooth in-page anchors + back-to-top through Lenis */
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute("href");
      if (!id || id.length < 2) return;
      a.addEventListener("click", function (e) {
        var t = document.querySelector(id);
        if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: -84 }); }
      });
    });
    var toTop = document.getElementById("toTop");
    if (toTop) toTop.addEventListener("click", function () { lenis.scrollTo(0); }, true);

    /* ---- 2) subtle hero scroll parallax (depth) ---- */
    var hero = document.querySelector(".hero");
    if (hero) {
      var st = { trigger: hero, start: "top top", end: "bottom top", scrub: true };
      if (document.querySelector(".hero__stage")) gsap.to(".hero__stage", { yPercent: -10, ease: "none", scrollTrigger: st });
      if (document.querySelector(".hero__copy")) gsap.to(".hero__copy", { yPercent: 7, ease: "none", scrollTrigger: st });
      /* balloons drift upward as you scroll (Balloons Hive vibe) */
      document.querySelectorAll(".hero .balloon-layer").forEach(function (layer) {
        gsap.to(layer, { yPercent: -24, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
      });
    }
    /* gentle parallax on sub-page heroes too */
    document.querySelectorAll(".page-hero .container").forEach(function (el) {
      gsap.to(el, { yPercent: 6, ease: "none", scrollTrigger: { trigger: el.closest(".page-hero"), start: "top top", end: "bottom top", scrub: true } });
    });

    /* ---- 3) magnetic primary CTAs ---- */
    if (window.matchMedia("(pointer: fine)").matches) {
      var s = document.createElement("style");
      s.textContent = ".magnetic{transition: box-shadow .3s ease, background .25s ease !important;}";
      document.head.appendChild(s);
      document.querySelectorAll(".btn--lg").forEach(function (btn) {
        btn.classList.add("magnetic");
        btn.addEventListener("mousemove", function (e) {
          var r = btn.getBoundingClientRect();
          gsap.to(btn, {
            x: (e.clientX - r.left - r.width / 2) * 0.3,
            y: (e.clientY - r.top - r.height / 2) * 0.5,
            duration: 0.4, ease: "power3.out",
          });
        });
        btn.addEventListener("mouseleave", function () {
          gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.4)" });
        });
      });
    }

    /* recompute trigger positions once fonts/images have settled */
    window.addEventListener("load", function () { window.ScrollTrigger.refresh(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
