/* ============================================================
   DALI PARTY — shared store/distribution-point data layer
   Used by diem-ban.html (storefront locator) and admin.html.
   Persists to localStorage so the admin can edit points and the
   public locator reflects them (single-origin demo; swap getStores/
   saveStores for a real API/backend in production).
   ============================================================ */
(function () {
  "use strict";
  var KEY = "dali_stores_v1";

  // Default partner bookstores / stores that distribute Dali Party products.
  // Coordinates are approximate real locations (good enough for the demo).
  var DEFAULTS = [
    { id: "flagship-hn", name: "Dali Party Flagship", tag: "Cửa hàng chính hãng",
      address: "123 Đường Hoa Mai, Q. Hoàn Kiếm", city: "Hà Nội",
      hours: "8:00 – 21:00", phone: "090 123 4567", lat: 21.0285, lng: 105.8542 },
    { id: "fahasa-tandinh", name: "Nhà sách Fahasa Tân Định", tag: "Nhà sách đối tác",
      address: "387 Hai Bà Trưng, Q.3", city: "TP.HCM",
      hours: "8:00 – 22:00", phone: "028 3820 1234", lat: 10.7905, lng: 106.6902 },
    { id: "fahasa-nguyenhue", name: "Nhà sách Fahasa Nguyễn Huệ", tag: "Nhà sách đối tác",
      address: "40 Nguyễn Huệ, Q.1", city: "TP.HCM",
      hours: "8:00 – 22:00", phone: "028 3822 5678", lat: 10.7740, lng: 106.7040 },
    { id: "phuongnam-govap", name: "Nhà sách Phương Nam Gò Vấp", tag: "Nhà sách đối tác",
      address: "123 Nguyễn Thái Sơn, Q. Gò Vấp", city: "TP.HCM",
      hours: "8:30 – 21:30", phone: "028 3989 4321", lat: 10.8320, lng: 106.6770 },
    { id: "kimdong-hn", name: "Nhà sách Kim Đồng Hà Nội", tag: "Nhà sách đối tác",
      address: "55 Quang Trung, Q. Hai Bà Trưng", city: "Hà Nội",
      hours: "8:00 – 21:00", phone: "024 3943 8765", lat: 21.0130, lng: 105.8460 },
    { id: "tienphong-dn", name: "Nhà sách Tiền Phong Đà Nẵng", tag: "Nhà sách đối tác",
      address: "290 Lê Duẩn, Q. Thanh Khê", city: "Đà Nẵng",
      hours: "8:00 – 21:00", phone: "0236 3751 246", lat: 16.0690, lng: 108.2140 },
  ];

  function clone(a) { return JSON.parse(JSON.stringify(a)); }

  function getStores() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(s) && s.length) return s;
    } catch (e) {}
    return clone(DEFAULTS);
  }
  function saveStores(arr) {
    if (!Array.isArray(arr)) return false;
    try { localStorage.setItem(KEY, JSON.stringify(arr)); return true; }
    catch (e) { return false; }
  }
  function resetStores() { localStorage.removeItem(KEY); }
  function isCustomized() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } }

  // Haversine distance in kilometres
  function distanceKm(lat1, lng1, lat2, lng2) {
    if ([lat1, lng1, lat2, lng2].some(function (v) { return typeof v !== "number" || isNaN(v); })) return Infinity;
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad, dLng = (lng2 - lng1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function fmtDistance(km) {
    if (!isFinite(km)) return "";
    return km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(km < 10 ? 1 : 0) + " km";
  }

  // Stores annotated with distance from (lat,lng) and sorted nearest-first
  function withDistance(lat, lng) {
    return getStores()
      .map(function (s) { return Object.assign({}, s, { distanceKm: distanceKm(lat, lng, s.lat, s.lng) }); })
      .sort(function (a, b) { return a.distanceKm - b.distanceKm; });
  }

  function uid() {
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ------------------------------------------------------------
     Chủ quyền: ghi rõ quần đảo Hoàng Sa & Trường Sa thuộc Việt Nam.
     Bắt buộc đối với bản đồ hiển thị tại Việt Nam. Thêm nhãn không
     tương tác lên 2 quần đảo. Truyền tham chiếu Leaflet (window.L,
     hoặc ref đã giữ vì Lenis có thể ghi đè window.L ở trang storefront).
     ------------------------------------------------------------ */
  var VN_ISLANDS = [
    { name: "Quần đảo Hoàng Sa", lat: 16.5, lng: 112.0 },
    { name: "Quần đảo Trường Sa", lat: 9.5, lng: 114.0 }
  ];
  function addVNIslands(map, L) {
    L = L || window.L;
    if (!map || !L || map.__vnIslands) return;
    map.__vnIslands = [];
    VN_ISLANDS.forEach(function (it) {
      var icon = L.divIcon({
        className: "vn-island",
        html: '<span class="vn-island__lbl"><i class="vn-island__dot"></i>' +
              it.name + ' <b>(Việt&nbsp;Nam)</b></span>',
        iconSize: [0, 0], iconAnchor: [0, 0]
      });
      var m = L.marker([it.lat, it.lng], { icon: icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      map.__vnIslands.push(m);
    });
  }

  window.DaliStores = {
    KEY: KEY, DEFAULTS: DEFAULTS, VN_ISLANDS: VN_ISLANDS,
    getStores: getStores, saveStores: saveStores, resetStores: resetStores, isCustomized: isCustomized,
    distanceKm: distanceKm, fmtDistance: fmtDistance, withDistance: withDistance, uid: uid,
    addVNIslands: addVNIslands,
  };
})();
