/* ============================================================
   DALI PARTY — In-browser face → circular cutout (no build step)
   Drop-in for assets/js/banner-builder.js. Vanilla JS, CDN ESM.
   Primary: MediaPipe Tasks FaceDetector (blaze_face_short_range).
   Fallback: @vladmandic/face-api tinyFaceDetector (TF.js).
   All processing client-side; nothing uploaded.
   ============================================================ */
(function (global) {
  "use strict";

  // ---- CDN endpoints (all verified 200, same-origin-safe via CORS) ----
  var MP_BUNDLE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs";
  var MP_WASM   = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
  var MP_MODEL  = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
  var FA_LIB    = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js";
  var FA_MODELS = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

  var _mpDetector = null;   // cached MediaPipe detector
  var _faReady = false;     // face-api models loaded?
  var _engine = null;       // "mediapipe" | "faceapi" | null

  // -------- helpers --------
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.crossOrigin = "anonymous";
      s.onload = res; s.onerror = function () { rej(new Error("script " + src)); };
      document.head.appendChild(s);
    });
  }

  // Normalize any input (HTMLImageElement | Blob/File | canvas) -> drawable image + dims
  function toImage(input) {
    return new Promise(function (res, rej) {
      if (input && (input.naturalWidth || input.width) &&
          (input.tagName === "IMG" || input.tagName === "CANVAS")) {
        if (input.tagName === "IMG" && !input.complete) {
          input.onload = function () { res(input); };
          input.onerror = function () { rej(new Error("img load")); };
        } else { res(input); }
        return;
      }
      // Blob/File
      var url = URL.createObjectURL(input);
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("blob img")); };
      im.src = url;
    });
  }

  // -------- engine: MediaPipe --------
  async function ensureMediaPipe() {
    if (_mpDetector) return _mpDetector;
    var vision = await import(MP_BUNDLE);
    var fileset = await vision.FilesetResolver.forVisionTasks(MP_WASM);
    _mpDetector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MP_MODEL },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.4
    });
    _engine = "mediapipe";
    return _mpDetector;
  }

  function mpDetect(img) {
    var r = _mpDetector.detect(img);
    var ds = (r && r.detections) || [];
    return ds.map(function (d) {
      var b = d.boundingBox;
      return { x: b.originX, y: b.originY, w: b.width, h: b.height,
               score: (d.categories && d.categories[0] && d.categories[0].score) || 0 };
    });
  }

  // -------- engine: face-api fallback --------
  async function ensureFaceApi() {
    if (_faReady) return;
    if (!global.faceapi) await loadScript(FA_LIB);
    var faceapi = global.faceapi;
    await faceapi.nets.tinyFaceDetector.loadFromUri(FA_MODELS);
    _faReady = true;
    _engine = "faceapi";
  }

  async function faDetect(img) {
    var faceapi = global.faceapi;
    var opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 });
    var dets = await faceapi.detectAllFaces(img, opts);
    return dets.map(function (d) {
      var box = d.box || d;
      return { x: box.x, y: box.y, w: box.width, h: box.height, score: d.score || 0 };
    });
  }

  // pick largest face by area
  function largest(faces) {
    if (!faces || !faces.length) return null;
    return faces.reduce(function (a, b) { return (b.w * b.h > a.w * a.h) ? b : a; });
  }

  /**
   * detectFaceCircle(input, [opts]) -> { blob, canvas, box, circle, engine, found }
   *   input  : HTMLImageElement | HTMLCanvasElement | Blob | File
   *   opts.size    : output PNG size in px (default 512)
   *   opts.padding : head padding factor around the face box (default 0.85 = generous,
   *                  fits hair/forehead/chin for the "thay mặt bé" face hole)
   *   opts.feather : edge anti-alias softness in px (default 2)
   *
   * Returns a circular cutout (transparent outside circle). If no face is found,
   *   found=false and box=null — caller should fall back to manual positioning.
   */
  async function detectFaceCircle(input, opts) {
    opts = opts || {};
    var size = opts.size || 512;
    var pad = (opts.padding == null ? 0.85 : opts.padding);
    var feather = (opts.feather == null ? 2 : opts.feather);

    var img = await toImage(input);
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;

    // --- detect (MediaPipe → face-api) ---
    var faces = [];
    try {
      await ensureMediaPipe();
      faces = mpDetect(img);
    } catch (e1) {
      try {
        await ensureFaceApi();
        faces = await faDetect(img);
      } catch (e2) {
        faces = [];
      }
    }

    var face = largest(faces);

    // --- build circle geometry (expand face box into a head circle) ---
    var circle, found = !!face;
    if (face) {
      var cx = face.x + face.w / 2;
      // bias center upward a touch: face box usually excludes top of hair/forehead
      var cy = face.y + face.h * 0.42;
      var r = Math.max(face.w, face.h) * (0.5 + pad);
      circle = { cx: cx, cy: cy, r: r };
    } else {
      // fallback: centered circle covering ~70% of the shorter side
      var rr = Math.min(iw, ih) * 0.35;
      circle = { cx: iw / 2, cy: ih / 2, r: rr };
    }

    // --- render circular cutout to transparent canvas ---
    var canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    var ctx = canvas.getContext("2d");

    // source square around circle (clamped into image bounds proportionally)
    var srcX = circle.cx - circle.r;
    var srcY = circle.cy - circle.r;
    var srcS = circle.r * 2;

    // draw source region scaled to output, then mask to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - feather, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, srcX, srcY, srcS, srcS, 0, 0, size, size);
    ctx.restore();

    // feather the edge (soft alpha ring) so it sits cleanly in the template hole
    if (feather > 0) {
      ctx.globalCompositeOperation = "destination-in";
      var g = ctx.createRadialGradient(size / 2, size / 2, size / 2 - feather - 1,
                                       size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "source-over";
    }

    var blob = await new Promise(function (res) {
      canvas.toBlob(function (b) { res(b); }, "image/png");
    });

    return {
      blob: blob,
      canvas: canvas,
      box: face ? { x: face.x, y: face.y, width: face.w, height: face.h, score: face.score } : null,
      circle: circle,
      engine: _engine,
      found: found
    };
  }

  global.detectFaceCircle = detectFaceCircle;
  global.DaliFace = { detectFaceCircle: detectFaceCircle, ensureMediaPipe: ensureMediaPipe };
})(window);
