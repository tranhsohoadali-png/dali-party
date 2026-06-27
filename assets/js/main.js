/* ============================================================
   DALI PARTY — core: catalog, cart, drawer, nav, forms
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Product catalog (shared across pages) ---------- */
  const IMG = "assets/img/products/";
  const CATALOG = {
    "combo-ky-lan":      { name: "Combo Sinh nhật Kỳ Lân",            cat: "Sinh nhật",  price: 350000, old: 420000, img: IMG + "combo-ky-lan.svg",        rating: 4.9, badge: "Bán chạy" },
    "vong-hoa-pastel":   { name: "Vòng hoa bóng bay pastel",          cat: "Trang trí",  price: 550000,             img: IMG + "vong-hoa-pastel.svg",     rating: 4.8 },
    "hop-qua-anniv":     { name: 'Hộp quà bóng "Happy Anniversary"',  cat: "Kỷ niệm",    price: 280000,             img: IMG + "hop-qua-anniversary.svg", rating: 5.0, badge: "Mới" },
    "bong-tha-tran-sao": { name: "Bóng bay thả trần ngôi sao",        cat: "Trang trí",  price: 420000,             img: IMG + "bong-tha-tran-sao.svg",   rating: 4.7 },
    "cong-khai-truong":  { name: "Cổng bóng bay Khai trương",         cat: "Sự kiện",    price: 1250000, old: 1500000, img: IMG + "cong-khai-truong.svg",  rating: 4.9, badge: "Hot" },
    "bo-bong-so":        { name: "Bó bóng bay số sinh nhật",          cat: "Sinh nhật",  price: 320000,             img: IMG + "bo-bong-so.svg",          rating: 4.8 },
    "bong-led":          { name: "Bóng bay LED phát sáng (10 quả)",   cat: "Sự kiện",    price: 190000,             img: IMG + "bong-led.svg",            rating: 4.6, badge: "Mới" },
    "trang-tri-cuoi":    { name: "Set trang trí tiệc cưới lãng mạn",  cat: "Đám cưới",   price: 1850000,            img: IMG + "trang-tri-cuoi.svg",      rating: 5.0 },
    "foil-doraemon":     { name: "Bóng foil Doraemon",                cat: "Nhân vật",   price: 120000,             img: IMG + "foil-doraemon.png",       rating: 4.9, badge: "Hot" },
    "foil-goku":         { name: "Bóng foil Son Goku",                cat: "Nhân vật",   price: 150000,             img: IMG + "foil-goku.png",           rating: 4.9, badge: "Hot" },
    "foil-astronaut":    { name: "Bóng foil Phi hành gia",            cat: "Nhân vật",   price: 110000,             img: IMG + "foil-astronaut.png",      rating: 4.8, badge: "Mới" },
  };
  /* Prefer the admin-managed catalog (DaliShop) when present; fall back to the
     built-in list above so pages without shop-data.js still work. */
  let catalog = CATALOG;
  if (window.DaliShop && typeof DaliShop.catalogMap === "function") {
    try { var m = DaliShop.catalogMap(); if (m && Object.keys(m).length) catalog = m; } catch (e) {}
  }
  window.DALI = window.DALI || {};
  DALI.CATALOG = catalog;

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = (n) => (Number(n) || 0).toLocaleString("vi-VN") + "₫";
  DALI.money = money;
  /* escape untrusted (admin-entered) product fields before innerHTML */
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  /* ---------- cart state ---------- */
  const KEY = "dali_cart_v1";
  let cart = load();
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function save() { localStorage.setItem(KEY, JSON.stringify(cart)); }

  function addToCart(id, qty = 1) {
    if (!catalog[id]) return;
    cart[id] = (cart[id] || 0) + qty;
    save(); renderCart(); bumpCount();
  }
  function setQty(id, qty) {
    if (qty <= 0) delete cart[id]; else cart[id] = qty;
    save(); renderCart();
  }
  DALI.addToCart = addToCart;

  function totalItems() { return Object.values(cart).reduce((a, b) => a + b, 0); }
  function totalPrice() { return Object.entries(cart).reduce((s, [id, q]) => s + (catalog[id]?.price || 0) * q, 0); }

  /* ---------- count badge ---------- */
  function renderCount() {
    $$(".cart-count").forEach((el) => {
      const n = totalItems();
      el.textContent = n;
      el.classList.toggle("show", n > 0);
    });
  }
  function bumpCount() {
    renderCount();
    $$(".cart-count").forEach((el) => { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); });
  }

  /* ---------- mini-cart drawer ---------- */
  function renderCart() {
    renderCount();
    const wrap = $("#cartItems");
    if (!wrap) return;
    const ids = Object.keys(cart);
    if (!ids.length) {
      wrap.innerHTML = `<div class="cart-empty"><div style="font-size:3rem">🎈</div><p>Giỏ hàng đang trống.<br>Hãy chọn vài quả bóng thật xinh nhé!</p></div>`;
    } else {
      wrap.innerHTML = ids.map((id) => {
        const p = catalog[id], q = cart[id];
        return `<div class="cart-row" data-row="${id}">
          <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">
          <div>
            <div class="cart-row__t">${esc(p.name)}</div>
            <div class="cart-row__p">${money(p.price)}</div>
            <div class="qty">
              <button data-dec="${id}" aria-label="Giảm">−</button>
              <span>${q}</span>
              <button data-inc="${id}" aria-label="Tăng">+</button>
            </div>
          </div>
          <button class="cart-row__rm" data-rm="${id}">Xoá</button>
        </div>`;
      }).join("");
    }
    const tot = $("#cartTotal"); if (tot) tot.textContent = money(totalPrice());
  }

  function openCart() { $("#cartDrawer")?.classList.add("open"); $("#overlay")?.classList.add("show"); document.body.style.overflow = "hidden"; }
  function closeCart() { $("#cartDrawer")?.classList.remove("open"); $("#overlay")?.classList.remove("show"); document.body.style.overflow = ""; }
  DALI.openCart = openCart;

  /* ---------- flying ball animation ---------- */
  function flyToCart(fromEl) {
    const cartIcon = $("#cartBtn");
    if (!cartIcon || !fromEl) return;
    const a = fromEl.getBoundingClientRect(), b = cartIcon.getBoundingClientRect();
    const ball = document.createElement("div");
    ball.className = "fly-ball";
    ball.innerHTML = `<svg viewBox="0 0 30 38"><ellipse cx="15" cy="15" rx="13" ry="16" fill="#8cc63f"/><path d="M13 30l4 0-2 7z" fill="#6fa82e"/></svg>`;
    ball.style.left = a.left + a.width / 2 - 15 + "px";
    ball.style.top = a.top + a.height / 2 - 19 + "px";
    document.body.appendChild(ball);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    ball.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy - 120}px) scale(1.1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0.2 },
      ],
      { duration: 800, easing: "cubic-bezier(.5,-0.2,.4,1)" }
    ).onfinish = () => ball.remove();
  }

  /* ---------- toast ---------- */
  let toastWrap;
  function toast(msg, icon = "✓") {
    if (!toastWrap) { toastWrap = document.createElement("div"); toastWrap.className = "toast-wrap"; document.body.appendChild(toastWrap); }
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<span class="dot">${icon}</span><span>${msg}</span>`;
    toastWrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 2600);
  }
  DALI.toast = toast;

  /* ---------- checkout flow (captures an order via DaliShop) ---------- */
  function injectCheckoutCss() {
    if (document.getElementById("coCss")) return;
    var st = document.createElement("style");
    st.id = "coCss";
    st.textContent =
      ".co-panel{padding:18px 20px;overflow-y:auto}" +
      ".co-back{background:none;border:0;color:var(--green-700);font-weight:600;cursor:pointer;padding:4px 0;margin-bottom:8px}" +
      ".co-title{font-size:1.05rem;margin-bottom:12px}" +
      ".co-f{display:block;margin-bottom:12px}" +
      ".co-f>span{display:block;font-size:.82rem;font-weight:600;color:var(--ink-2);margin-bottom:5px}" +
      ".co-f input,.co-f textarea{width:100%;padding:11px 13px;border:1.5px solid var(--line);border-radius:12px;font:inherit;background:#fff;color:var(--ink)}" +
      ".co-f input:focus,.co-f textarea:focus{outline:none;border-color:var(--green-400);box-shadow:0 0 0 3px var(--green-100)}" +
      ".co-err{color:#d8483a;font-weight:600;font-size:.85rem;min-height:1em;margin:2px 0 8px}" +
      ".co-note{font-size:.76rem;color:var(--muted);margin-top:10px;line-height:1.5}";
    document.head.appendChild(st);
  }
  function buildCheckoutPanel() {
    var drawer = document.getElementById("cartDrawer");
    if (!drawer) return null;
    if (document.getElementById("coPanel")) return document.getElementById("coPanel");
    injectCheckoutCss();
    var panel = document.createElement("div");
    panel.id = "coPanel"; panel.className = "co-panel"; panel.hidden = true;
    panel.innerHTML =
      '<button type="button" class="co-back" id="coBack">← Quay lại giỏ</button>' +
      '<h4 class="co-title">Thông tin đặt hàng</h4>' +
      '<form id="coForm" novalidate>' +
      '<label class="co-f"><span>Họ tên *</span><input id="coName" autocomplete="name" required></label>' +
      '<label class="co-f"><span>Số điện thoại *</span><input id="coPhone" autocomplete="tel" inputmode="tel" required></label>' +
      '<label class="co-f"><span>Địa chỉ / ghi chú</span><textarea id="coNote" rows="2" placeholder="Địa chỉ nhận, thời gian, yêu cầu thêm…"></textarea></label>' +
      '<p class="co-err" id="coErr" role="alert"></p>' +
      '<button type="submit" class="btn btn--block btn--lg">Đặt hàng ✓</button>' +
      '<p class="co-note">Đơn được gửi tới cửa hàng, nhân viên sẽ gọi xác nhận. Bản demo lưu cục bộ, chưa thanh toán online.</p>' +
      '</form>';
    var foot = drawer.querySelector(".cart-drawer__foot");
    drawer.insertBefore(panel, foot);
    document.getElementById("coBack").addEventListener("click", closeCheckout);
    document.getElementById("coForm").addEventListener("submit", submitOrder);
    return panel;
  }
  function openCheckout() {
    if (!buildCheckoutPanel()) return;
    var items = $("#cartItems"); if (items) items.hidden = true;
    document.getElementById("coPanel").hidden = false;
    var cb = $("#checkoutBtn"); if (cb) cb.style.display = "none";
    setTimeout(function () { var n = document.getElementById("coName"); if (n) n.focus(); }, 50);
  }
  function closeCheckout() {
    var p = document.getElementById("coPanel"); if (p) p.hidden = true;
    var items = $("#cartItems"); if (items) items.hidden = false;
    var cb = $("#checkoutBtn"); if (cb) cb.style.display = "";
  }
  function submitOrder(e) {
    e.preventDefault();
    var name = document.getElementById("coName").value.trim();
    var phone = document.getElementById("coPhone").value.trim();
    var err = document.getElementById("coErr");
    if (!name) { err.textContent = "Vui lòng nhập họ tên."; document.getElementById("coName").focus(); return; }
    if (!phone) { err.textContent = "Vui lòng nhập số điện thoại."; document.getElementById("coPhone").focus(); return; }
    err.textContent = "";
    var lines = Object.keys(cart).map(function (id) {
      return { id: id, name: (catalog[id] && catalog[id].name) || id, price: (catalog[id] && catalog[id].price) || 0, qty: cart[id] };
    });
    var rec = null;
    if (window.DaliShop) rec = DaliShop.addOrder({ items: lines, total: totalPrice(), customer: { name: name, phone: phone, note: document.getElementById("coNote").value.trim() } });
    cart = {}; save(); renderCart();
    closeCheckout(); closeCart();
    if (window.DALI.confettiBurst) window.DALI.confettiBurst(document.body);
    toast(rec ? ("Đã đặt hàng! Mã đơn " + rec.code + " 🎉") : "Cảm ơn bạn! Đơn đã được ghi nhận.", "♥");
  }

  /* ============================================================
     EVENT WIRING
     ============================================================ */
  document.addEventListener("DOMContentLoaded", () => {
    renderCart();

    /* header scroll */
    const header = $(".site-header");
    const onScroll = () => header?.classList.toggle("scrolled", window.scrollY > 12);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });

    /* cart open/close */
    $("#cartBtn")?.addEventListener("click", openCart);
    $("#cartClose")?.addEventListener("click", closeCart);
    $("#overlay")?.addEventListener("click", () => { closeCart(); closeMenu(); });

    /* mobile menu */
    const menu = $("#mobileMenu");
    function openMenu() { menu?.classList.add("open"); $("#overlay")?.classList.add("show"); }
    function closeMenu() { menu?.classList.remove("open"); if (!$("#cartDrawer")?.classList.contains("open")) $("#overlay")?.classList.remove("show"); }
    $("#navToggle")?.addEventListener("click", openMenu);
    $("#menuClose")?.addEventListener("click", closeMenu);
    $$("#mobileMenu a").forEach((a) => a.addEventListener("click", closeMenu));

    /* delegated clicks */
    document.addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      if (add) {
        const id = add.getAttribute("data-add");
        const qty = parseInt(add.getAttribute("data-qty") || "1", 10);
        addToCart(id, qty);
        flyToCart(add);
        window.DALI.confettiBurst?.(add);
        toast(`Đã thêm “${esc(catalog[id]?.name || "sản phẩm")}” vào giỏ 🎉`);
        e.preventDefault();
        return;
      }
      const inc = e.target.closest("[data-inc]"); if (inc) { const id = inc.dataset.inc; setQty(id, (cart[id] || 0) + 1); }
      const dec = e.target.closest("[data-dec]"); if (dec) { const id = dec.dataset.dec; setQty(id, (cart[id] || 0) - 1); }
      const rm = e.target.closest("[data-rm]"); if (rm) { setQty(rm.dataset.rm, 0); }
    });

    /* Esc closes overlays */
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeCart(); closeMenu(); } });

    /* back to top */
    const top = $("#toTop");
    if (top) {
      const tg = () => top.classList.toggle("show", window.scrollY > 600);
      tg(); window.addEventListener("scroll", tg, { passive: true });
      top.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    }

    /* checkout */
    $("#checkoutBtn")?.addEventListener("click", () => {
      if (!totalItems()) { toast("Giỏ hàng đang trống 🎈", "!"); return; }
      if (window.DaliShop) openCheckout();
      else toast("Cảm ơn bạn! Đây là bản demo nên chưa thanh toán thật.", "♥");
    });

    /* forms -> capture (DaliShop) + demo success */
    $$("form[data-demo]").forEach((f) =>
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        const cap = f.getAttribute("data-capture");
        if (cap && window.DaliShop) {
          const data = {};
          $$("input, select, textarea", f).forEach((el) => {
            const key = el.name || el.id; if (!key) return;
            if (el.type === "checkbox") data[key] = el.checked;
            else if (el.type === "radio") { if (el.checked) data[key] = el.value; }
            else if (el.value !== "") data[key] = el.value;
          });
          try {
            if (cap === "booking") DaliShop.addBooking(data);
            else if (cap === "message") DaliShop.addMessage(data);
          } catch (err) {}
        }
        const msg = f.getAttribute("data-success") || "Đã gửi thành công! Dali Party sẽ liên hệ với bạn sớm nhất.";
        toast(msg, "✓");
        window.DALI.confettiBurst?.(f.querySelector("[type=submit], button"));
        f.reset();
      })
    );

    /* search (demo) */
    $$("[data-search]").forEach((box) => {
      const input = box.querySelector("input");
      box.addEventListener("submit", (e) => { e.preventDefault(); if (input.value.trim()) location.href = "cua-hang"; });
    });
  });
})();
