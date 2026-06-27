/* ============================================================
   DALI PARTY — shop data layer (window.DaliShop)
   Products · Orders · Bookings · Messages · Settings
   Persisted in localStorage. Storefront reads via this layer;
   admin.html writes through it. Falls back to built-in defaults
   so the shop always works even with an empty store.
   NOTE: per-browser localStorage — swap read/write for a real
   API/backend in production.
   ============================================================ */
(function () {
  "use strict";

  var K = {
    products: "dali_products_v1",
    orders:   "dali_orders_v1",
    bookings: "dali_bookings_v1",
    messages: "dali_messages_v1",
    settings: "dali_settings_v1"
  };

  function read(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function drop(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(p) { return (p || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nowISO() { return new Date().toISOString(); }
  function money(n) { return (Number(n) || 0).toLocaleString("vi-VN") + "₫"; }

  /* ---------- DEFAULT PRODUCTS (mirror of the original catalog) ---------- */
  var IMG = "assets/img/products/";
  var DEFAULT_PRODUCTS = [
    { id:"foil-doraemon",     name:"Bóng foil Doraemon",                 cat:"Nhân vật", price:120000,  old:0,       img:IMG+"foil-doraemon.png",       badge:"Hot",      rating:4.9, reviews:86,  char:true,  featured:false, active:true, desc:"Bóng foil nhân vật Doraemon — hàng cửa hàng nhập, dùng trang trí sinh nhật bé." },
    { id:"foil-goku",         name:"Bóng foil Son Goku",                 cat:"Nhân vật", price:150000,  old:0,       img:IMG+"foil-goku.png",           badge:"Hot",      rating:4.9, reviews:74,  char:true,  featured:false, active:true, desc:"Bóng foil Son Goku — phụ kiện tiệc cho fan nhí." },
    { id:"foil-astronaut",    name:"Bóng foil Phi hành gia",             cat:"Nhân vật", price:110000,  old:0,       img:IMG+"foil-astronaut.png",      badge:"Mới",      rating:4.8, reviews:52,  char:true,  featured:false, active:true, desc:"Bóng foil phi hành gia — chủ đề không gian, vũ trụ." },
    { id:"combo-ky-lan",      name:"Combo Sinh nhật Kỳ Lân",             cat:"Sinh nhật", price:350000, old:420000,  img:IMG+"combo-ky-lan.svg",        badge:"Bán chạy", rating:4.9, reviews:128, char:false, featured:true,  active:true, desc:"Combo bóng bay sinh nhật chủ đề kỳ lân pastel — đủ phụ kiện trang trí." },
    { id:"vong-hoa-pastel",   name:"Vòng hoa bóng bay pastel",           cat:"Trang trí", price:550000, old:0,       img:IMG+"vong-hoa-pastel.svg",     badge:"",         rating:4.8, reviews:96,  char:false, featured:true,  active:true, desc:"Vòng hoa bóng bay tông pastel — backdrop chụp ảnh sang trọng." },
    { id:"hop-qua-anniv",     name:"Hộp quà bóng \"Happy Anniversary\"", cat:"Kỷ niệm",   price:280000, old:0,       img:IMG+"hop-qua-anniversary.svg", badge:"Mới",      rating:5.0, reviews:74,  char:false, featured:true,  active:true, desc:"Hộp quà bất ngờ bung bóng — món quà kỷ niệm độc đáo." },
    { id:"bong-tha-tran-sao", name:"Bóng bay thả trần ngôi sao",         cat:"Trang trí", price:420000, old:0,       img:IMG+"bong-tha-tran-sao.svg",   badge:"",         rating:4.7, reviews:61,  char:false, featured:true,  active:true, desc:"Set bóng thả trần phối ngôi sao — lung linh cho không gian tiệc." },
    { id:"cong-khai-truong",  name:"Cổng bóng bay Khai trương",          cat:"Sự kiện",   price:1250000,old:1500000, img:IMG+"cong-khai-truong.svg",    badge:"Hot",      rating:4.9, reviews:102, char:false, featured:false, active:true, desc:"Cổng bóng bay khai trương rực rỡ — lắp đặt tận nơi." },
    { id:"bo-bong-so",        name:"Bó bóng bay số sinh nhật",           cat:"Sinh nhật", price:320000, old:0,       img:IMG+"bo-bong-so.svg",          badge:"",         rating:4.8, reviews:88,  char:false, featured:false, active:true, desc:"Bó bóng kèm số tuổi — điểm nhấn cho bàn tiệc sinh nhật." },
    { id:"bong-led",          name:"Bóng bay LED phát sáng (10 quả)",    cat:"Sự kiện",   price:190000, old:0,       img:IMG+"bong-led.svg",            badge:"Mới",      rating:4.6, reviews:54,  char:false, featured:false, active:true, desc:"Bóng bay LED phát sáng — lung linh cho tiệc tối, sự kiện ngoài trời." },
    { id:"trang-tri-cuoi",    name:"Set trang trí tiệc cưới lãng mạn",   cat:"Đám cưới",  price:1850000,old:0,       img:IMG+"trang-tri-cuoi.svg",      badge:"",         rating:5.0, reviews:47,  char:false, featured:false, active:true, desc:"Set trang trí tiệc cưới tông lãng mạn — thiết kế & lắp đặt trọn gói." }
  ];

  var CATEGORIES = ["Nhân vật", "Sinh nhật", "Đám cưới", "Sự kiện", "Trang trí", "Kỷ niệm"];

  var DEFAULT_SETTINGS = {
    shopName: "Dali Party",
    tagline:  "Bóng bay & Trang trí",
    hotline:  "090 123 4567",
    email:    "info@daliparty.vn",
    address:  "123 Đường Hoa Mai, Hà Nội",
    hours:    "8:00 – 21:00 mỗi ngày",
    promo:    "🎈 Miễn phí giao hàng nội thành · ✨ Trang trí tận nơi · 🎀 Bơm khí Helium an toàn · 🎉 Thiết kế theo yêu cầu · 💚 8 năm đồng hành cùng 5.000+ bữa tiệc",
    facebook: "#", instagram: "#", tiktok: "#"
  };

  /* ---------- PRODUCTS ---------- */
  function getProducts() {
    var p = read(K.products, null);
    return (p && p.length) ? p : DEFAULT_PRODUCTS.map(clone);
  }
  function saveProducts(list) { return write(K.products, list || []); }
  function resetProducts() { drop(K.products); }
  function getProduct(id) {
    var list = getProducts();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function upsertProduct(rec) {
    var list = getProducts();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === rec.id) { idx = i; break; }
    if (idx >= 0) list[idx] = rec; else list.push(rec);
    saveProducts(list);
    return rec;
  }
  function deleteProduct(id) {
    saveProducts(getProducts().filter(function (p) { return p.id !== id; }));
  }
  /* products as an id->product map (for the cart engine in main.js) */
  function catalogMap() {
    var m = {}, list = getProducts();
    for (var i = 0; i < list.length; i++) m[list[i].id] = list[i];
    return m;
  }

  /* ---------- ORDERS ---------- */
  function getOrders() { return read(K.orders, []); }
  function saveOrders(list) { return write(K.orders, list || []); }
  function addOrder(o) {
    var list = getOrders();
    var rec = {
      id: uid("o"),
      code: "DH" + Date.now().toString(36).toUpperCase().slice(-6),
      items: o.items || [],
      total: o.total || 0,
      customer: o.customer || {},
      status: "Mới",          // Mới · Đã xác nhận · Hoàn tất · Đã huỷ
      at: nowISO()
    };
    list.unshift(rec);
    saveOrders(list);
    return rec;
  }
  function updateOrder(id, patch) {
    var list = getOrders();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { for (var k in patch) list[i][k] = patch[k]; break; }
    saveOrders(list);
  }
  function deleteOrder(id) { saveOrders(getOrders().filter(function (x) { return x.id !== id; })); }

  /* ---------- BOOKINGS (service requests) ---------- */
  function getBookings() { return read(K.bookings, []); }
  function saveBookings(list) { return write(K.bookings, list || []); }
  function addBooking(b) {
    var list = getBookings();
    var rec = { id: uid("b"), data: b || {}, status: "Mới", at: nowISO() };
    list.unshift(rec);
    saveBookings(list);
    return rec;
  }
  function updateBooking(id, patch) {
    var list = getBookings();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { for (var k in patch) list[i][k] = patch[k]; break; }
    saveBookings(list);
  }
  function deleteBooking(id) { saveBookings(getBookings().filter(function (x) { return x.id !== id; })); }

  /* ---------- MESSAGES (contact form) ---------- */
  function getMessages() { return read(K.messages, []); }
  function saveMessages(list) { return write(K.messages, list || []); }
  function addMessage(m) {
    var list = getMessages();
    var rec = { id: uid("m"), data: m || {}, read: false, at: nowISO() };
    list.unshift(rec);
    saveMessages(list);
    return rec;
  }
  function updateMessage(id, patch) {
    var list = getMessages();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { for (var k in patch) list[i][k] = patch[k]; break; }
    saveMessages(list);
  }
  function deleteMessage(id) { saveMessages(getMessages().filter(function (x) { return x.id !== id; })); }

  /* ---------- SETTINGS ---------- */
  function getSettings() {
    var s = read(K.settings, null);
    if (!s) return clone(DEFAULT_SETTINGS);
    var out = clone(DEFAULT_SETTINGS);
    for (var k in s) out[k] = s[k];
    return out;
  }
  function saveSettings(obj) { return write(K.settings, obj || {}); }
  function resetSettings() { drop(K.settings); }

  /* Apply settings to the live DOM of any page that opts in.
     - [data-cfg="key"]      → textContent = settings[key]
     - [data-cfg-tel="hotline"] / [data-cfg-mail="email"] → href
     - [data-cfg-promo]      → rebuild a marquee track from settings.promo
     Safe to call on any page; only touches elements that exist. */
  function applySettings(root) {
    root = root || document;
    var s = getSettings();
    root.querySelectorAll("[data-cfg]").forEach(function (el) {
      var key = el.getAttribute("data-cfg");
      if (key && s[key] != null) el.textContent = s[key];
    });
    root.querySelectorAll("[data-cfg-tel]").forEach(function (el) {
      var v = s[el.getAttribute("data-cfg-tel")];
      if (v) el.setAttribute("href", "tel:" + String(v).replace(/\s+/g, ""));
    });
    root.querySelectorAll("[data-cfg-mail]").forEach(function (el) {
      var v = s[el.getAttribute("data-cfg-mail")];
      if (v) el.setAttribute("href", "mailto:" + v);
    });
    root.querySelectorAll("[data-cfg-promo]").forEach(function (track) {
      var parts = String(s.promo || "").split("·").map(function (x) { return x.trim(); }).filter(Boolean);
      if (!parts.length) return;
      var html = parts.map(function (p) { return "<span>" + p.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>"; }).join("");
      track.innerHTML = html + html; // duplicated for seamless marquee
    });
  }

  window.DaliShop = {
    KEYS: K,
    DEFAULT_PRODUCTS: DEFAULT_PRODUCTS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    CATEGORIES: CATEGORIES,
    // products
    getProducts: getProducts, saveProducts: saveProducts, resetProducts: resetProducts,
    getProduct: getProduct, upsertProduct: upsertProduct, deleteProduct: deleteProduct,
    catalogMap: catalogMap,
    // orders
    getOrders: getOrders, saveOrders: saveOrders, addOrder: addOrder,
    updateOrder: updateOrder, deleteOrder: deleteOrder,
    // bookings
    getBookings: getBookings, addBooking: addBooking, updateBooking: updateBooking, deleteBooking: deleteBooking,
    // messages
    getMessages: getMessages, addMessage: addMessage, updateMessage: updateMessage, deleteMessage: deleteMessage,
    // settings
    getSettings: getSettings, saveSettings: saveSettings, resetSettings: resetSettings, applySettings: applySettings,
    // utils
    uid: uid, money: money, nowISO: nowISO
  };

  /* auto-apply settings on content pages that include this script */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { try { applySettings(); } catch (e) {} });
  } else { try { applySettings(); } catch (e) {} }
})();
