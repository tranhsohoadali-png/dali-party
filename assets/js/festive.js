/* ============================================================
   DALI PARTY — festive layer (more balloons, decor & motion)
   • site-wide balloons rising up the page edges (real photos)
   • bunting (pennant flags) strung across every hero
   • twinkling sparkles
   • periodic ambient confetti
   • click a floating balloon to POP it (confetti)
   Progressive enhancement — disabled for prefers-reduced-motion.
   ============================================================ */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DALI = window.DALI || (window.DALI = {});

  var BALLOONS = ["rb-cream", "rb-white", "rb-pearl", "rb-gold", "rb-pink", "rb-yellow", "rb-blue"]
    .map(function (n) { return "assets/img/balloons/" + n + ".png"; });
  // cartoon-character foil balloons (appear less often, a bit bigger).
  // GENERIC / non-trademarked only — trademarked characters (Doraemon, Goku) must NOT
  // be used as decoration; they live ONLY as genuine products the shop sells in cua-hang.html.
  var CHAR_FOILS = [
    "assets/img/balloons/fb-dog-blue.png",
    "assets/img/balloons/fb-pig.png",
    "assets/img/balloons/fb-dog-pink.png",
    "assets/img/balloons/fb-dino.png",
    "assets/img/products/foil-astronaut.png",
  ];
  var SPARKS = ["✦", "✧", "⋆", "✨", "·"];
  var SPARK_COLORS = ["#c9a86a", "#e0c478", "#8cc63f", "#ffffff", "#ff9ec9", "#9fd0ff", "#b388ff"];
  var FLAG_COLORS = ["#ff9ec9", "#ffd24c", "#8cc63f", "#9fd0ff", "#c9a86a", "#b388ff", "#5fd6bb"];
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };

  function start() {
    /* ---- bunting on every hero (works even with reduced motion; just won't flutter) ---- */
    document.querySelectorAll(".hero, .page-hero").forEach(function (h) {
      if (h.querySelector(".bunting")) return;
      var bunt = document.createElement("div");
      bunt.className = "bunting"; bunt.setAttribute("aria-hidden", "true");
      var n = Math.max(7, Math.min(18, Math.round(window.innerWidth / 64)));
      for (var i = 0; i < n; i++) {
        var f = document.createElement("i");
        f.style.setProperty("--c", FLAG_COLORS[i % FLAG_COLORS.length]);
        f.style.animationDelay = (i * 0.11).toFixed(2) + "s";
        bunt.appendChild(f);
      }
      h.insertBefore(bunt, h.firstChild);
    });

    if (reduce) return;

    /* ---- site-wide rising balloons (edge-biased so they don't sit on text) ---- */
    var sky = document.createElement("div");
    sky.className = "festive-sky"; sky.setAttribute("aria-hidden", "true");
    document.body.appendChild(sky);

    function rise() {
      if (document.hidden || sky.childElementCount >= 6) return;
      var b = document.createElement("div");
      b.className = "rising-balloon";
      var isChar = Math.random() < 0.42;            // ~2 in 5 is a character foil
      var size = isChar ? rand(74, 122) : rand(42, 96);
      b.style.width = size + "px";
      b.style.left = (Math.random() < 0.5 ? rand(0, 15) : rand(82, 97)) + "%";
      var dur = rand(14, 27);
      b.style.setProperty("--dur", dur + "s");
      b.style.setProperty("--sway", rand(14, 44) + "px");
      b.style.setProperty("--rot", rand(-6, 6) + "deg");
      b.style.opacity = rand(0.42, 0.66).toFixed(2);
      var img = document.createElement("img");
      img.src = isChar ? pick(CHAR_FOILS) : pick(BALLOONS); img.alt = ""; img.draggable = false; img.decoding = "async";
      b.appendChild(img);
      sky.appendChild(b);
      setTimeout(function () { b.remove(); }, dur * 1000 + 600);
    }
    for (var i = 0; i < 5; i++) setTimeout(rise, i * 1500);
    setInterval(rise, 2800);

    /* ---- twinkling sparkles ---- */
    var tw = document.createElement("div");
    tw.className = "twinkle-layer"; tw.setAttribute("aria-hidden", "true");
    document.body.appendChild(tw);
    setInterval(function () {
      if (document.hidden) return;
      var s = document.createElement("span");
      s.className = "twinkle"; s.textContent = pick(SPARKS);
      s.style.left = (Math.random() < 0.5 ? rand(0, 26) : rand(74, 99)) + "vw";
      s.style.top = rand(4, 92) + "vh";
      s.style.fontSize = rand(10, 22) + "px";
      s.style.color = pick(SPARK_COLORS);
      tw.appendChild(s);
      setTimeout(function () { s.remove(); }, 1700);
    }, 650);

    /* ---- periodic ambient confetti ---- */
    setInterval(function () { if (!document.hidden && DALI.confettiSky) DALI.confettiSky(); }, 17000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
