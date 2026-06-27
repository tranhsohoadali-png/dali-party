/* ============================================================
   DALI PARTY — admin dashboard logic
   Tabs: Overview · Products · Orders · Bookings · Messages · Stores · Settings
   Data via window.DaliShop (shop-data.js) + window.DaliStores (stores.js).
   Client-side demo only — no real backend/auth.
   ============================================================ */
(function () {
  "use strict";

  var SESSION_KEY = "dali_admin_session";
  var PASSCODE = "dali2026";
  var DS = window.DaliStores;   // stores
  var SHOP = window.DaliShop;   // products / orders / bookings / messages / settings
  var revRange = 7;             // overview revenue chart window (days)
  var currentView = "overview"; // active view name (set by showView; used by global quick-search)
  var lastFocus = null;         // element focused before a modal opened (restored on close — a11y)

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var ctx = this, args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; fn.apply(ctx, args); }, wait || 180);
    };
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function money(n) { return (Number(n) || 0).toLocaleString("vi-VN") + "₫"; }
  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso || "—";
      return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return iso || "—"; }
  }
  function csvCell(v) { var s = String(v == null ? "" : v); return '"' + s.replace(/"/g, '""') + '"'; }
  function exportOrdersCSV() {
    var orders = SHOP.getOrders();
    var header = ["Mã đơn", "Khách", "SĐT", "Tổng", "Trạng thái", "Thời gian"];
    var lines = [header.map(csvCell).join(",")];
    orders.forEach(function (o) {
      var c = o.customer || {};
      lines.push([o.code, c.name || "", c.phone || "", (o.total || 0), o.status || "Mới", fmtDate(o.at)].map(csvCell).join(","));
    });
    var csv = "﻿" + lines.join("\r\n");
    try {
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "don-hang.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast("Đã tải CSV đơn hàng");
    } catch (e) { toast("Trình duyệt không hỗ trợ tải file", true); }
  }
  function toast(msg, warn) {
    var wrap = $("toastWrap");
    var el = document.createElement("div");
    el.className = "a-toast" + (warn ? " warn" : "");
    el.innerHTML = '<span class="dot">' + (warn ? "!" : "✓") + "</span><span>" + esc(msg) + "</span>";
    wrap.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("show"); });
    setTimeout(function () { el.classList.remove("show"); setTimeout(function () { el.remove(); }, 350); }, 2600);
  }
  /* a11y: remember what was focused before a modal opened, and return focus on close */
  function rememberFocus() { lastFocus = document.activeElement; }
  function restoreFocus() {
    var el = lastFocus; lastFocus = null;
    if (el && typeof el.focus === "function") { try { el.focus(); } catch (e) {} }
  }

  /* ============================================================
     AUTH GATE (client-side demo only)
     ============================================================ */
  function isAuthed() { try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch (e) { return false; } }
  function showDashboard() {
    $("gateView").hidden = true; $("dashView").hidden = false; $("logoutBtn").hidden = false;
    populateCatList();
    refreshCounts();
    showView("overview");
  }
  function showGate() {
    $("gateView").hidden = false; $("dashView").hidden = true; $("logoutBtn").hidden = true;
    var pi = $("passInput"); if (pi) { pi.value = ""; pi.focus(); }
  }
  $("gateForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if ($("passInput").value === PASSCODE) {
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (err) {}
      $("gateErr").textContent = ""; showDashboard(); toast("Đăng nhập thành công");
    } else { $("gateErr").textContent = "Mã truy cập không đúng. Thử lại."; $("passInput").select(); }
  });
  $("logoutBtn").addEventListener("click", function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    showGate(); toast("Đã đăng xuất");
  });

  /* ============================================================
     TABS / VIEW ROUTER
     ============================================================ */
  function showView(name) {
    currentView = name;
    document.querySelectorAll(".view").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== name; });
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-view") === name); });
    var TITLES = { overview: "Tổng quan", products: "Sản phẩm", orders: "Đơn hàng", customers: "Khách hàng", bookings: "Đặt dịch vụ", messages: "Tin nhắn", stores: "Điểm bán", settings: "Cài đặt" };
    var pt = $("pageTitle"); if (pt) pt.textContent = TITLES[name] || "Quản trị";
    if (name === "overview") renderOverview();
    else if (name === "products") renderProducts();
    else if (name === "orders") renderOrders();
    else if (name === "customers") renderCustomers();
    else if (name === "bookings") renderBookings();
    else if (name === "messages") renderMessages();
    else if (name === "stores") renderStores();
    else if (name === "settings") loadSettings();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () { showView(t.getAttribute("data-view")); });
  });

  /* ---- Topbar global quick-search: route query into the current view's filter ---- */
  var gs = $("globalSearch");
  if (gs) {
    gs.addEventListener("input", debounce(function () {
      var q = this.value.trim().toLowerCase();
      if (currentView === "products") { prodFilter = q; if ($("prodSearch")) $("prodSearch").value = this.value; renderProducts(); }
      else if (currentView === "orders") { orderFilter = q; if ($("orderSearch")) $("orderSearch").value = this.value; renderOrders(); }
      else if (currentView === "stores") { storeFilter = q; if ($("searchInput")) $("searchInput").value = this.value; renderStores(); }
      /* customers/messages/bookings have no text filter — no-op gracefully */
    }, 180));
  }

  /* ---- Topbar notification bell: summarize + jump to the more urgent view ---- */
  var bell = $("bellBtn");
  if (bell) {
    bell.addEventListener("click", function () {
      var orders = SHOP ? SHOP.getOrders() : [];
      var messages = SHOP ? SHOP.getMessages() : [];
      var newOrders = orders.filter(function (o) { return o.status === "Mới"; }).length;
      var unread = messages.filter(function (m) { return !m.read; }).length;
      toast(newOrders + " đơn mới · " + unread + " tin chưa đọc");
      showView(unread >= newOrders ? "messages" : "orders");
    });
  }

  function refreshCounts() {
    var products = SHOP ? SHOP.getProducts() : [];
    var orders = SHOP ? SHOP.getOrders() : [];
    var bookings = SHOP ? SHOP.getBookings() : [];
    var messages = SHOP ? SHOP.getMessages() : [];
    var stores = DS ? DS.getStores() : [];
    var newOrders = orders.filter(function (o) { return o.status === "Mới"; }).length;
    var newBookings = bookings.filter(function (b) { return b.status === "Mới"; }).length;
    var unread = messages.filter(function (m) { return !m.read; }).length;
    $("tabnProducts").textContent = products.length;
    $("tabnOrders").textContent = newOrders;
    $("tabnBookings").textContent = newBookings;
    $("tabnMessages").textContent = unread;
    $("tabnStores").textContent = stores.length;
    if ($("tabnCustomers")) {
      var phones = {};
      orders.forEach(function (o) { phones[(o.customer && o.customer.phone) || "—"] = 1; });
      $("tabnCustomers").textContent = Object.keys(phones).length;
    }
  }

  /* ============================================================
     OVERVIEW
     ============================================================ */
  function renderOverview() {
    refreshCounts();
    var products = SHOP.getProducts(), orders = SHOP.getOrders(),
        bookings = SHOP.getBookings(), messages = SHOP.getMessages(), stores = DS.getStores();
    var revenue = orders.filter(function (o) { return o.status !== "Đã huỷ"; })
                        .reduce(function (s, o) { return s + (o.total || 0); }, 0);
    var cards = [
      { ic: "🎈", num: products.length, lbl: "Sản phẩm", view: "products" },
      { ic: "🧾", num: orders.length, lbl: "Đơn hàng", view: "orders" },
      { ic: "💰", num: money(revenue), lbl: "Doanh thu (chưa huỷ)", view: "orders" },
      { ic: "📅", num: bookings.length, lbl: "Đặt dịch vụ", view: "bookings" },
      { ic: "✉️", num: messages.length, lbl: "Tin nhắn", view: "messages" },
      { ic: "📍", num: stores.length, lbl: "Điểm bán", view: "stores" }
    ];
    $("statGrid").innerHTML = cards.map(function (c) {
      return '<button class="stat-card" type="button" data-go="' + c.view + '">' +
        '<span class="ic">' + c.ic + '</span><span class="num">' + esc(c.num) + '</span><span class="lbl">' + esc(c.lbl) + "</span></button>";
    }).join("");
    var ov = $("ovDate");
    try { ov.textContent = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }); } catch (e) {}

    var recent = orders.slice(0, 5);
    if (!recent.length) {
      $("recentOrders").innerHTML = '<p style="color:var(--muted)">Chưa có đơn hàng nào. Khi khách bấm “Thanh toán” trên website, đơn sẽ xuất hiện ở đây.</p>';
    } else {
      var recTable =
        '<div class="table-wrap"><table class="dtable"><thead><tr><th>Mã đơn</th><th>Khách</th><th>Tổng</th><th>Trạng thái</th><th>Thời gian</th></tr></thead><tbody>' +
        recent.map(function (o) {
          return "<tr><td><b>" + esc(o.code) + "</b></td><td>" + esc((o.customer && o.customer.name) || "—") +
            "</td><td>" + money(o.total) + "</td><td>" + statusBadge(o.status) + '</td><td class="cell-mono">' + esc(fmtDate(o.at)) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
      /* mobile twin: same .cards/.d-card pattern as every other view (display toggled by CSS @760px) */
      var recCards = '<div class="cards">' + recent.map(function (o) {
        return '<div class="d-card"><h4>' + esc(o.code) + " · " + money(o.total) + "</h4><p>👤 " + esc((o.customer && o.customer.name) || "—") +
          "</p><p>" + statusBadge(o.status) + " · 🕐 " + esc(fmtDate(o.at)) + "</p></div>";
      }).join("") + "</div>";
      $("recentOrders").innerHTML = recTable + recCards;
    }

    fillKpiGrid(orders, bookings, messages, products);
    renderCatRevChart(orders);
    renderTopProducts(orders);
    renderRevChart(orders);
    renderStatusDonut(orders);
  }

  /* ---- Overview: detailed KPI cards (period revenue, time buckets, AOV,
         action worklist, best-day / VIP / rates, catalog health).
         Everything is computed from DaliShop data and degrades cleanly to
         "0₫" / "—" on empty data. ---- */
  function fillKpiGrid(orders, bookings, messages, products) {
    var host = $("kpiGrid"); if (!host) return;
    var valid = orders.filter(function (o) { return o.status !== "Đã huỷ"; });

    /* date keys built exactly like renderRevChart (today-based, pad2) */
    var today = new Date(); today.setHours(0, 0, 0, 0);
    function keyOf(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
    var todayKey = keyOf(today);

    /* Monday 00:00 of current week */
    var weekStart = new Date(today.getTime());
    var dow = (weekStart.getDay() + 6) % 7;            // 0 = Monday
    weekStart = new Date(weekStart.getTime() - dow * 86400000);
    var nowY = today.getFullYear(), nowM = today.getMonth();

    /* ---- Period revenue + %-change vs previous window (tied to 7/30 toggle) ---- */
    var curKeys = {}, prevKeys = {};
    for (var i = revRange - 1; i >= 0; i--) curKeys[keyOf(new Date(today.getTime() - i * 86400000))] = 1;
    for (var j = revRange; j < revRange * 2; j++) prevKeys[keyOf(new Date(today.getTime() - j * 86400000))] = 1;
    var cur = 0, prev = 0;
    valid.forEach(function (o) {
      var k = (o.at || "").slice(0, 10);
      if (curKeys[k]) cur += (o.total || 0);
      else if (prevKeys[k]) prev += (o.total || 0);
    });
    var pct = prev > 0 ? Math.round((cur - prev) / prev * 100) : (cur > 0 ? 100 : 0);
    var deltaHtml;
    if (cur === 0 && prev === 0) deltaHtml = '<span class="delta flat">—</span>';
    else if (cur >= prev) deltaHtml = '<span class="delta up">▲ ' + pct + '%</span>';
    else deltaHtml = '<span class="delta down">▼ ' + Math.abs(pct) + '%</span>';

    /* ---- Today / week / month revenue + order count ---- */
    var tRev = 0, tN = 0, wRev = 0, wN = 0, mRev = 0, mN = 0;
    valid.forEach(function (o) {
      var d = new Date(o.at);
      if ((o.at || "").slice(0, 10) === todayKey) { tRev += (o.total || 0); tN++; }
      if (!isNaN(d.getTime()) && d >= weekStart) { wRev += (o.total || 0); wN++; }
      if (!isNaN(d.getTime()) && d.getFullYear() === nowY && d.getMonth() === nowM) { mRev += (o.total || 0); mN++; }
    });

    /* ---- AOV + items per order ---- */
    var aov = valid.length ? Math.round(valid.reduce(function (s, o) { return s + (o.total || 0); }, 0) / valid.length) : 0;
    var totQty = valid.reduce(function (s, o) {
      return s + (o.items || []).reduce(function (q, it) { return q + (it.qty || 0); }, 0);
    }, 0);
    var spo = valid.length ? (totQty / valid.length).toFixed(1) : "0";

    /* ---- Best sales day across the current revRange window ---- */
    var dayBuckets = {}, dayOrder = [];
    for (var d2 = revRange - 1; d2 >= 0; d2--) {
      var dd = new Date(today.getTime() - d2 * 86400000);
      var dk = keyOf(dd);
      dayBuckets[dk] = { label: pad2(dd.getDate()) + "/" + pad2(dd.getMonth() + 1), val: 0 };
      dayOrder.push(dk);
    }
    valid.forEach(function (o) { var k = (o.at || "").slice(0, 10); if (dayBuckets[k]) dayBuckets[k].val += (o.total || 0); });
    var best = null;
    dayOrder.forEach(function (k) { var b = dayBuckets[k]; if (!best || b.val > best.val) best = b; });

    /* ---- VIP customer (by phone, highest spend) ---- */
    var byPhone = {};
    orders.forEach(function (o) {
      var ph = (o.customer && o.customer.phone) || "—";
      var rec = byPhone[ph];
      if (!rec) rec = byPhone[ph] = { name: (o.customer && o.customer.name) || "—", count: 0, spent: 0 };
      rec.count++;
      if (o.status !== "Đã huỷ") rec.spent += (o.total || 0);
      rec.name = (o.customer && o.customer.name) || rec.name;
    });
    var custKeys = Object.keys(byPhone);
    var custCount = custKeys.length;
    var returning = 0, vip = null;
    custKeys.forEach(function (k) {
      var c = byPhone[k];
      if (c.count > 1) returning++;
      if (!vip || c.spent > vip.spent) vip = c;
    });

    /* ---- Completion / cancel rates (from raw status counts) ---- */
    var total = orders.length;
    var done = orders.filter(function (o) { return o.status === "Hoàn tất"; }).length;
    var cancelled = orders.filter(function (o) { return o.status === "Đã huỷ"; }).length;
    var completionRate = total ? Math.round(done / total * 100) : 0;
    var cancelRate = total ? Math.round(cancelled / total * 100) : 0;

    /* ---- Action worklist counts ---- */
    var newOrders = orders.filter(function (o) { return o.status === "Mới"; }).length;
    var newBookings = bookings.filter(function (b) { return b.status === "Mới"; }).length;
    var unread = messages.filter(function (m) { return !m.read; }).length;

    /* ---- Catalog health ---- */
    var hidden = products.filter(function (p) { return p.active === false; }).length;
    var onSale = products.filter(function (p) { return p.old && p.old > p.price; }).length;

    var cards = [];
    function card(opts) {
      var attn = opts.attn ? " is-attn" : "";
      var nameCls = opts.isName ? " is-name" : "";
      var tag = opts.go ? "button" : "div";
      var open = opts.go ? '<button class="stat-card" type="button" data-go="' + opts.go + '">' : '<div class="stat-card">';
      var h = open;
      if (opts.ic) h += '<span class="ic">' + opts.ic + '</span>';
      h += '<span class="num' + attn + nameCls + '">' + esc(opts.num) + '</span>';
      h += '<span class="lbl">' + esc(opts.lbl) + '</span>';
      if (opts.delta) h += opts.delta;
      if (opts.sub != null) h += '<span class="sub">' + esc(opts.sub) + '</span>';
      return h + '</' + tag + '>';
    }

    cards.push(card({ ic: "💸", num: money(cur), lbl: "Doanh thu " + revRange + " ngày", delta: deltaHtml }));
    cards.push(card({ ic: "📈", num: money(aov), lbl: "Giá trị TB / đơn", sub: spo + " SP / đơn" }));
    cards.push(card({ ic: "🌅", num: money(tRev), lbl: "Hôm nay", sub: tN + " đơn" }));
    cards.push(card({ ic: "🗓️", num: money(wRev), lbl: "Tuần này", sub: wN + " đơn" }));
    cards.push(card({ ic: "📆", num: money(mRev), lbl: "Tháng này", sub: mN + " đơn" }));
    cards.push(card({ ic: "🏆", num: (best && best.val > 0) ? money(best.val) : "—", lbl: "Ngày bán tốt nhất", sub: (best && best.val > 0) ? best.label : "" }));
    cards.push(card({ ic: "👑", num: (vip && vip.spent > 0) ? vip.name : "—", lbl: "Khách VIP", isName: !!(vip && vip.spent > 0), sub: (vip && vip.spent > 0) ? money(vip.spent) : "" }));
    cards.push(card({ ic: "✅", num: total ? completionRate + "%" : "—", lbl: "Tỉ lệ hoàn tất" }));
    cards.push(card({ ic: "🚫", num: total ? cancelRate + "%" : "—", lbl: "Tỉ lệ huỷ", attn: cancelRate > 0 }));
    cards.push(card({ ic: "🧾", num: newOrders, lbl: "Đơn cần xử lý", go: "orders", attn: newOrders > 0 }));
    cards.push(card({ ic: "📅", num: newBookings, lbl: "Đặt dịch vụ mới", go: "bookings", attn: newBookings > 0 }));
    cards.push(card({ ic: "✉️", num: unread, lbl: "Tin chưa đọc", go: "messages", attn: unread > 0 }));
    cards.push(card({ ic: "👥", num: custCount, lbl: "Khách hàng", go: "customers", sub: returning + " khách quay lại" }));
    cards.push(card({ ic: "🙈", num: hidden, lbl: "Sản phẩm đang ẩn", go: "products", attn: hidden > 0 }));
    cards.push(card({ ic: "🏷️", num: onSale, lbl: "Đang giảm giá", go: "products" }));

    host.innerHTML = cards.join("");
  }

  /* ---- Overview: top-selling & top-revenue products (by order line name) ---- */
  function renderTopProducts(orders) {
    var host = $("topProducts"); if (!host) return;
    var acc = {};
    orders.forEach(function (o) {
      if (o.status === "Đã huỷ") return;
      (o.items || []).forEach(function (it) {
        var name = (it && it.name) || "—";
        var rec = acc[name] || (acc[name] = { qty: 0, rev: 0 });
        rec.qty += (it.qty || 0);
        rec.rev += (it.price || 0) * (it.qty || 0);
      });
    });
    var names = Object.keys(acc);
    if (!names.length) { host.innerHTML = '<p style="color:var(--muted)">Chưa có dữ liệu bán hàng.</p>'; return; }
    var byQty = names.slice().sort(function (a, b) { return acc[b].qty - acc[a].qty; }).slice(0, 5);
    var byRev = names.slice().sort(function (a, b) { return acc[b].rev - acc[a].rev; }).slice(0, 5);
    function tbl(title, keys, qtyFirst) {
      var head = qtyFirst
        ? '<thead><tr><th>Sản phẩm</th><th>SL bán</th><th>Doanh thu</th></tr></thead>'
        : '<thead><tr><th>Sản phẩm</th><th>Doanh thu</th><th>SL bán</th></tr></thead>';
      var body = keys.map(function (name) {
        var r = acc[name];
        return qtyFirst
          ? '<tr><td><b>' + esc(name) + '</b></td><td>' + r.qty + '</td><td class="cell-mono">' + money(r.rev) + '</td></tr>'
          : '<tr><td><b>' + esc(name) + '</b></td><td class="cell-mono">' + money(r.rev) + '</td><td>' + r.qty + '</td></tr>';
      }).join("");
      return '<h3 style="font-size:.92rem;font-weight:700;color:var(--ink-2);margin:0 0 8px">' + esc(title) +
        '</h3><div class="table-wrap"><table class="dtable">' + head + '<tbody>' + body + '</tbody></table></div>';
    }
    host.innerHTML = '<div style="display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">' +
      tbl("Bán chạy nhất (số lượng)", byQty, true) +
      tbl("Doanh thu cao nhất", byRev, false) + '</div>';
  }

  /* ---- Overview: revenue-by-category mini horizontal-bar chart ----
         Reuses the hand-rolled SVG approach of renderRevChart. ---- */
  function renderCatRevChart(orders) {
    var host = $("catRevChart"); if (!host) return;
    var nameCat = {};
    SHOP.getProducts().forEach(function (p) { nameCat[p.name] = p.cat; });
    var totals = {};
    orders.forEach(function (o) {
      if (o.status === "Đã huỷ") return;
      (o.items || []).forEach(function (it) {
        var cat = nameCat[(it && it.name)] || "Khác";
        totals[cat] = (totals[cat] || 0) + (it.price || 0) * (it.qty || 0);
      });
    });
    var cats = Object.keys(totals);
    var max = 0; cats.forEach(function (c) { if (totals[c] > max) max = totals[c]; });
    if (max <= 0) { host.innerHTML = '<p style="color:var(--muted)">Chưa có dữ liệu doanh thu.</p>'; return; }
    cats.sort(function (a, b) { return totals[b] - totals[a]; });

    var W = 700, labelW = 110, barMaxW = W - labelW - 110, rowH = 34, pad = 6;
    var H = cats.length * rowH + pad * 2;
    var rows = "";
    cats.forEach(function (c, i) {
      var val = totals[c];
      var y = pad + i * rowH;
      var bw = Math.max(2, (val / max) * barMaxW);
      rows += '<text x="0" y="' + (y + rowH / 2 + 4) + '" font-size="12" fill="var(--ink-2)">' + esc(c) + '</text>';
      rows += '<rect x="' + labelW + '" y="' + (y + 6) + '" width="' + bw.toFixed(1) + '" height="' + (rowH - 14) +
        '" rx="4" fill="var(--green-500)"><title>' + esc(c + ": " + money(val)) + '</title></rect>';
      rows += '<text x="' + (labelW + bw + 8) + '" y="' + (y + rowH / 2 + 4) +
        '" font-size="11" fill="var(--muted)">' + esc(money(val)) + '</text>';
    });
    host.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" ' +
      'aria-label="Doanh thu theo danh mục" style="display:block;max-width:100%">' + rows + "</svg>";
  }

  /* ---- Overview: revenue bar chart (hand-rolled SVG) ---- */
  function renderRevChart(orders) {
    var host = $("revChart"); if (!host) return;
    // toggle active state on range buttons
    document.querySelectorAll("[data-revrange]").forEach(function (b) {
      b.classList.toggle("active", parseInt(b.getAttribute("data-revrange"), 10) === revRange);
    });
    var days = revRange;
    var buckets = [];           // [{key,label,val}]
    var index = {};
    var today = new Date(); today.setHours(0, 0, 0, 0);
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(today.getTime() - i * 86400000);
      var key = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
      var b = { key: key, label: pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1), val: 0 };
      index[key] = b; buckets.push(b);
    }
    orders.forEach(function (o) {
      if (o.status === "Đã huỷ") return;
      var k = (o.at || "").slice(0, 10);
      if (index[k]) index[k].val += (o.total || 0);
    });
    var max = 0; buckets.forEach(function (b) { if (b.val > max) max = b.val; });
    if (max <= 0) { host.innerHTML = '<p style="color:var(--muted)">Chưa có dữ liệu doanh thu.</p>'; return; }

    var W = 700, H = 240, base = 200, plot = 180, n = buckets.length;
    var slot = W / n, bw = Math.max(2, Math.min(40, slot * 0.6));
    var every = days > 7 ? Math.ceil(n / 8) : 1;
    var bars = "", labels = "";
    buckets.forEach(function (b, i) {
      var cx = i * slot + slot / 2;
      var h = (b.val / max) * plot;
      var y = base - h;
      bars += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + h.toFixed(1) + '" rx="3" fill="var(--green-500)"><title>' +
        esc(b.label + ": " + money(b.val)) + "</title></rect>";
      if (i % every === 0 || i === n - 1) {
        labels += '<text x="' + cx.toFixed(1) + '" y="' + (base + 16) +
          '" text-anchor="middle" font-size="11" fill="var(--muted)">' + esc(b.label) + "</text>";
      }
    });
    host.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" ' +
      'aria-label="Biểu đồ doanh thu" style="display:block;max-width:100%">' +
      '<line x1="0" y1="' + base + '" x2="' + W + '" y2="' + base +
      '" stroke="var(--line)" stroke-width="1"/>' + bars + labels + "</svg>";
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /* ---- Overview: order-status donut (hand-rolled SVG) ---- */
  function renderStatusDonut(orders) {
    var host = $("statusDonut"); if (!host) return;
    var defs = [
      { label: "Mới", cls: "st-new", color: "#8cc63f" },
      { label: "Đã xác nhận", cls: "st-ok", color: "#5a8f1f" },
      { label: "Hoàn tất", cls: "st-done", color: "var(--green-700)" },
      { label: "Đã huỷ", cls: "st-cancel", color: "#d8483a" }
    ];
    var total = orders.length;
    if (total === 0) { host.innerHTML = '<p style="color:var(--muted)">Chưa có đơn hàng để thống kê.</p>'; return; }
    var counts = defs.map(function (d) {
      return orders.filter(function (o) { return (o.status || "Mới") === d.label; }).length;
    });
    var r = 70, cx = 90, cy = 90, sw = 28, C = 2 * Math.PI * r, run = 0;
    var arcs = "";
    defs.forEach(function (d, i) {
      var frac = counts[i] / total;
      if (frac > 0) {
        var arc = frac * C;
        arcs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + d.color +
          '" stroke-width="' + sw + '" stroke-dasharray="' + arc.toFixed(2) + " " + (C - arc).toFixed(2) +
          '" stroke-dashoffset="' + (-run * C).toFixed(2) + '"><title>' +
          esc(d.label + ": " + counts[i] + " (" + Math.round(frac * 100) + "%)") + "</title></circle>";
      }
      run += frac;
    });
    var svg = '<svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Tỉ lệ trạng thái đơn" ' +
      'style="flex:0 0 auto"><g transform="rotate(-90 90 90)">' + arcs + "</g>" +
      '<text x="90" y="86" text-anchor="middle" font-size="26" font-weight="700" fill="var(--ink)">' + total + "</text>" +
      '<text x="90" y="106" text-anchor="middle" font-size="12" fill="var(--muted)">đơn</text></svg>';
    var legend = '<div style="display:flex;flex-direction:column;gap:8px">' + defs.map(function (d, i) {
      return '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:' + d.color + '"></span> ' +
        esc(d.label) + '<b>' + counts[i] + "</b></div>";
    }).join("") + "</div>";
    host.innerHTML = '<div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">' + svg + legend + "</div>";
  }

  function statusBadge(s) {
    var cls = s === "Hoàn tất" ? "st-done" : s === "Đã xác nhận" ? "st-ok" : s === "Đã huỷ" ? "st-cancel" : "st-new";
    return '<span class="st ' + cls + '">' + esc(s || "Mới") + "</span>";
  }

  /* ============================================================
     PRODUCTS
     ============================================================ */
  var prodFilter = "";
  function populateCatList() {
    var dl = $("catList"); if (!dl || !SHOP) return;
    dl.innerHTML = (SHOP.CATEGORIES || []).map(function (c) { return '<option value="' + esc(c) + '"></option>'; }).join("");
  }
  function badgeClass(b) { return b === "Mới" ? "is-new" : b === "Hot" ? "is-hot" : ""; }
  function renderProducts() {
    var all = SHOP.getProducts();
    var list = all.filter(function (p) {
      if (!prodFilter) return true;
      return (p.name + " " + p.cat + " " + (p.badge || "")).toLowerCase().indexOf(prodFilter) !== -1;
    });
    $("prodCount").textContent = all.length + (prodFilter && list.length !== all.length ? " · hiện " + list.length : "") + " sản phẩm";
    var rows = $("prodRows"), cards = $("prodCards");
    if (!list.length) {
      rows.innerHTML = '<tr class="empty-row"><td colspan="6">' + (prodFilter ? "Không tìm thấy sản phẩm." : "Chưa có sản phẩm.") + "</td></tr>";
      cards.innerHTML = '<div class="d-card" style="text-align:center;color:var(--muted)">' + (prodFilter ? "Không tìm thấy." : "Chưa có sản phẩm.") + "</div>";
      return;
    }
    rows.innerHTML = list.map(function (p) {
      var badge = p.badge ? ' <span class="st ' + (badgeClass(p.badge) === "is-new" ? "st-new" : badgeClass(p.badge) === "is-hot" ? "st-ok" : "st-done") + '">' + esc(p.badge) + "</span>" : "";
      var price = money(p.price) + (p.old ? ' <small style="color:var(--muted);text-decoration:line-through">' + money(p.old) + "</small>" : "");
      var st = p.active === false ? '<span class="st st-cancel">Ẩn</span>' : '<span class="st st-done">Đang bán</span>';
      return "<tr>" +
        '<td class="cell-name" title="' + esc(p.name) + '"><div style="display:flex;align-items:center;gap:10px"><img class="prod-thumb" src="' + esc(p.img) + '" alt="" loading="lazy"><span><b>' + esc(p.name) + "</b>" + badge + "</span></div></td>" +
        "<td>" + esc(p.cat) + "</td>" +
        '<td class="cell-mono">' + price + "</td>" +
        "<td>★ " + esc(p.rating || "—") + " <small style='color:var(--muted)'>(" + esc(p.reviews || 0) + ")</small></td>" +
        "<td>" + st + "</td>" +
        '<td><div class="row-actions"><button class="mini-btn" data-pedit="' + esc(p.id) + '" type="button">Sửa</button><button class="mini-btn danger" data-pdel="' + esc(p.id) + '" type="button">Xoá</button></div></td>' +
        "</tr>";
    }).join("");
    cards.innerHTML = list.map(function (p) {
      return '<div class="d-card"><div style="display:flex;gap:12px;align-items:center"><img class="prod-thumb" src="' + esc(p.img) + '" alt="" loading="lazy"><div><h4>' + esc(p.name) + "</h4><p>" + esc(p.cat) + " · " + money(p.price) + "</p></div></div>" +
        '<div class="row-actions"><button class="mini-btn" data-pedit="' + esc(p.id) + '" type="button">Sửa</button><button class="mini-btn danger" data-pdel="' + esc(p.id) + '" type="button">Xoá</button></div></div>';
    }).join("");
  }
  $("prodSearch").addEventListener("input", debounce(function () { prodFilter = this.value.trim().toLowerCase(); renderProducts(); }, 180));

  function compressDataUrl(dataUrl, cb) {
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) { cb(dataUrl); return; }
      var scale = Math.min(1, 800 / Math.max(w, h));
      var cw = Math.round(w * scale), ch = Math.round(h * scale);
      var canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      var ctx = canvas.getContext("2d");
      if (!ctx) { cb(dataUrl); return; }
      ctx.drawImage(img, 0, 0, cw, ch);
      try { cb(canvas.toDataURL("image/jpeg", 0.8)); }
      catch (e) { cb(dataUrl); }
    };
    img.onerror = function () { cb(dataUrl); };
    img.src = dataUrl;
  }

  var editingProdId = null;
  function openProd(id) {
    rememberFocus();
    editingProdId = id || null;
    $("prodErr").textContent = "";
    var p = id ? SHOP.getProduct(id) : null;
    $("prodTitle").textContent = id ? "Sửa sản phẩm" : "Thêm sản phẩm";
    $("pName").value = p ? p.name : "";
    $("pCat").value = p ? p.cat : "";
    $("pBadge").value = p ? (p.badge || "") : "";
    $("pPrice").value = p ? p.price : "";
    $("pOld").value = p && p.old ? p.old : "";
    $("pImg").value = p ? (p.img || "") : "assets/img/products/";
    (function () { var pv = $("pImgPreview"); var v = $("pImg").value; if (v) { pv.src = v; pv.style.display = "block"; } else { pv.style.display = "none"; } })();
    $("pImgFile").value = "";
    $("pRating").value = p && p.rating != null ? p.rating : "";
    $("pReviews").value = p && p.reviews != null ? p.reviews : "";
    $("pActive").checked = p ? p.active !== false : true;
    $("pFeatured").checked = p ? !!p.featured : false;
    $("pChar").checked = p ? !!p.char : false;
    $("pDesc").value = p ? (p.desc || "") : "";
    $("prodOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
    setTimeout(function () { $("pName").focus(); }, 60);
  }
  function closeProd() { $("prodOverlay").classList.remove("open"); document.body.style.overflow = ""; editingProdId = null; $("pImgFile").value = ""; $("pImgPreview").style.display = "none"; setImgBusy(false); restoreFocus(); }
  var imgBusy = false;
  function prodSubmitBtn() { return $("prodForm") ? $("prodForm").querySelector('button[type="submit"]') : null; }
  function setImgBusy(busy) {
    imgBusy = busy;
    var b = prodSubmitBtn(); if (b) b.disabled = busy;
  }
  $("addProdBtn").addEventListener("click", function () { openProd(null); });
  $("pImgFile").addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast("Tệp không phải ảnh", true); this.value = ""; return; }
    setImgBusy(true);
    var reader = new FileReader();
    reader.onload = function (ev) {
      compressDataUrl(ev.target.result, function (out) {
        $("pImg").value = out;
        var pv = $("pImgPreview"); pv.src = out; pv.style.display = "block";
        if (out.length > 400000) toast("Ảnh khá lớn, có thể chiếm nhiều bộ nhớ trình duyệt", true);
        setImgBusy(false);
      });
    };
    reader.onerror = function () { setImgBusy(false); toast("Không đọc được tệp ảnh", true); };
    reader.readAsDataURL(f);
  });
  $("pImg").addEventListener("input", function () {
    var pv = $("pImgPreview"); var v = this.value.trim();
    if (v) { pv.src = v; pv.style.display = "block"; } else { pv.style.display = "none"; }
  });
  $("prodClose").addEventListener("click", closeProd);
  $("prodCancel").addEventListener("click", closeProd);
  $("prodOverlay").addEventListener("click", function (e) { if (e.target === $("prodOverlay")) closeProd(); });
  $("prodForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("prodErr"); err.textContent = "";
    if (imgBusy) { err.textContent = "Đang xử lý ảnh, vui lòng đợi…"; return; }
    var name = $("pName").value.trim(), cat = $("pCat").value.trim();
    var price = parseInt($("pPrice").value, 10);
    if (!name) { err.textContent = "Vui lòng nhập tên sản phẩm."; $("pName").focus(); return; }
    if (!cat) { err.textContent = "Vui lòng nhập danh mục."; $("pCat").focus(); return; }
    if (isNaN(price) || price < 0) { err.textContent = "Giá phải là số ≥ 0."; $("pPrice").focus(); return; }
    var rec = {
      id: editingProdId || SHOP.uid("p"),
      name: name, cat: cat, badge: $("pBadge").value.trim(),
      price: price, old: parseInt($("pOld").value, 10) || 0,
      img: $("pImg").value.trim() || "assets/img/products/combo-ky-lan.svg",
      rating: parseFloat($("pRating").value) || 0,
      reviews: parseInt($("pReviews").value, 10) || 0,
      char: $("pChar").checked, featured: $("pFeatured").checked, active: $("pActive").checked,
      desc: $("pDesc").value.trim()
    };
    var wasEditing = !!editingProdId;
    if (!SHOP.upsertProduct(rec)) { err.textContent = "Không lưu được — bộ nhớ trình duyệt đã đầy (ảnh quá lớn)."; toast("Không lưu được — bộ nhớ trình duyệt đã đầy (ảnh quá lớn).", true); return; }
    closeProd(); renderProducts(); refreshCounts();
    toast(wasEditing ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm mới");
  });

  /* ============================================================
     ORDERS
     ============================================================ */
  var orderFilter = "";
  var orderStatusFilter = "";
  var STATUSES = ["Mới", "Đã xác nhận", "Hoàn tất", "Đã huỷ"];
  function renderOrders() {
    var all = SHOP.getOrders();
    var list = all.filter(function (o) {
      if (orderStatusFilter && o.status !== orderStatusFilter) return false;
      if (!orderFilter) return true;
      var hay = [o.code, (o.customer && o.customer.name), (o.customer && o.customer.phone)].join(" ").toLowerCase();
      return hay.indexOf(orderFilter) !== -1;
    });
    $("orderCount").textContent = all.length + (list.length !== all.length ? " · hiện " + list.length : "") + " đơn";
    var rows = $("orderRows"), cards = $("orderCards");
    if (!list.length) {
      rows.innerHTML = '<tr class="empty-row"><td colspan="8">' + ((orderFilter || orderStatusFilter) ? "Không tìm thấy đơn." : "Chưa có đơn hàng.") + "</td></tr>";
      cards.innerHTML = '<div class="d-card" style="text-align:center;color:var(--muted)">' + ((orderFilter || orderStatusFilter) ? "Không tìm thấy đơn." : "Chưa có đơn hàng.") + '</div>';
      return;
    }
    function sel(o) {
      return '<select class="st-sel" data-ostatus="' + esc(o.id) + '" data-prev="' + esc(o.status || "Mới") + '">' + STATUSES.map(function (s) {
        return '<option' + (s === o.status ? " selected" : "") + ">" + esc(s) + "</option>";
      }).join("") + "</select>";
    }
    rows.innerHTML = list.map(function (o) {
      var nItems = (o.items || []).reduce(function (s, i) { return s + (i.qty || 0); }, 0);
      return "<tr><td><b>" + esc(o.code) + "</b></td><td>" + esc((o.customer && o.customer.name) || "—") +
        '</td><td class="cell-mono">' + esc((o.customer && o.customer.phone) || "—") + "</td><td>" + nItems +
        '</td><td class="cell-mono">' + money(o.total) + "</td><td>" + sel(o) + '</td><td class="cell-mono">' + esc(fmtDate(o.at)) +
        '</td><td><div class="row-actions"><button class="mini-btn" data-oview="' + esc(o.id) + '" type="button">Xem</button><button class="mini-btn danger" data-odel="' + esc(o.id) + '" type="button">Xoá</button></div></td></tr>';
    }).join("");
    cards.innerHTML = list.map(function (o) {
      return '<div class="d-card"><h4>' + esc(o.code) + " · " + money(o.total) + "</h4><p>👤 " + esc((o.customer && o.customer.name) || "—") + " · " + esc((o.customer && o.customer.phone) || "—") +
        "</p><p>🕐 " + esc(fmtDate(o.at)) + "</p><p>" + sel(o) + "</p>" +
        '<div class="row-actions"><button class="mini-btn" data-oview="' + esc(o.id) + '" type="button">Xem</button><button class="mini-btn danger" data-odel="' + esc(o.id) + '" type="button">Xoá</button></div></div>';
    }).join("");
  }
  $("orderSearch").addEventListener("input", debounce(function () { orderFilter = this.value.trim().toLowerCase(); renderOrders(); }, 180));

  function viewOrder(id) {
    var o = SHOP.getOrders().filter(function (x) { return x.id === id; })[0]; if (!o) return;
    var c = o.customer || {};
    var items = (o.items || []).map(function (i) {
      return '<div class="oi"><span>' + esc(i.name) + " × " + (i.qty || 1) + "</span><b>" + money((i.price || 0) * (i.qty || 1)) + "</b></div>";
    }).join("");
    $("detailTitle").textContent = "Đơn hàng " + o.code;
    $("detailBody").innerHTML =
      '<dl class="dl"><dt>Khách hàng</dt><dd>' + esc(c.name || "—") + "</dd>" +
      "<dt>Điện thoại</dt><dd>" + esc(c.phone || "—") + "</dd>" +
      (c.note ? "<dt>Ghi chú</dt><dd>" + esc(c.note) + "</dd>" : "") +
      "<dt>Trạng thái</dt><dd>" + statusBadge(o.status) + "</dd>" +
      "<dt>Thời gian</dt><dd>" + esc(fmtDate(o.at)) + "</dd></dl>" +
      '<div class="ord-items">' + items + '<div class="oi" style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px"><span><b>Tổng cộng</b></span><b>' + money(o.total) + "</b></div></div>";
    openDetail();
  }

  /* ============================================================
     CUSTOMERS (derived from orders by phone)
     ============================================================ */
  function renderCustomers() {
    var orders = SHOP.getOrders();
    var map = {};
    orders.forEach(function (o) {
      var phone = (o.customer && o.customer.phone) || "—";
      var rec = map[phone];
      if (!rec) { rec = map[phone] = { name: (o.customer && o.customer.name) || "—", phone: phone, count: 0, spent: 0, lastAt: o.at }; }
      rec.count++;
      if (o.status !== "Đã huỷ") rec.spent += (o.total || 0);
      if (!rec.lastAt || (o.at && o.at > rec.lastAt)) { rec.lastAt = o.at; rec.name = (o.customer && o.customer.name) || "—"; }
    });
    var list = Object.keys(map).map(function (k) { return map[k]; });
    list.sort(function (a, b) { return b.spent - a.spent; });
    $("custCount").textContent = list.length + " khách";
    var rows = $("custRows"), cards = $("custCards");
    if (!list.length) {
      rows.innerHTML = '<tr class="empty-row"><td colspan="6">Chưa có khách hàng.</td></tr>';
      cards.innerHTML = '<div class="d-card" style="text-align:center;color:var(--muted)">Chưa có khách hàng.</div>';
      return;
    }
    rows.innerHTML = list.map(function (c) {
      return "<tr><td><b>" + esc(c.name) + "</b></td><td class=\"cell-mono\">" + esc(c.phone) + "</td><td>" + c.count +
        '</td><td class="cell-mono">' + money(c.spent) + '</td><td class="cell-mono">' + esc(fmtDate(c.lastAt)) +
        '</td><td><button class="mini-btn" data-custphone="' + esc(c.phone) + '" type="button">Xem đơn</button></td></tr>';
    }).join("");
    cards.innerHTML = list.map(function (c) {
      return '<div class="d-card"><h4>' + esc(c.name) + "</h4><p>📞 " + esc(c.phone) +
        "</p><p>🧾 " + c.count + " đơn · 💰 " + money(c.spent) + "</p><p>🕐 " + esc(fmtDate(c.lastAt)) + "</p>" +
        '<div class="row-actions"><button class="mini-btn" data-custphone="' + esc(c.phone) + '" type="button">Xem đơn</button></div></div>';
    }).join("");
  }

  /* ============================================================
     BOOKINGS
     ============================================================ */
  var BOOK_LABELS = { evtType: "Loại sự kiện", name: "Họ tên", phone: "Điện thoại", email: "Email", guests: "Số khách", bookDate: "Ngày tổ chức", note: "Ghi chú" };
  function renderBookings() {
    var all = SHOP.getBookings();
    $("bookingCount").textContent = all.length + " yêu cầu";
    var rows = $("bookingRows"), cards = $("bookingCards");
    if (!all.length) {
      rows.innerHTML = '<tr class="empty-row"><td colspan="7">Chưa có yêu cầu đặt dịch vụ. Form ở trang “Gói dịch vụ” sẽ gửi về đây.</td></tr>';
      cards.innerHTML = '<div class="d-card" style="text-align:center;color:var(--muted)">Chưa có yêu cầu.</div>';
      return;
    }
    function sel(b) {
      return '<select class="st-sel" data-bstatus="' + esc(b.id) + '" data-prev="' + esc(b.status || "Mới") + '">' + STATUSES.map(function (s) {
        return '<option' + (s === b.status ? " selected" : "") + ">" + esc(s) + "</option>";
      }).join("") + "</select>";
    }
    rows.innerHTML = all.map(function (b) {
      var d = b.data || {};
      return "<tr><td><b>" + esc(d.evtType || "—") + "</b></td><td>" + esc(d.name || "—") +
        '</td><td class="cell-mono">' + esc(d.phone || "—") + '</td><td class="cell-mono">' + esc(d.bookDate || "—") +
        "</td><td>" + sel(b) + '</td><td class="cell-mono">' + esc(fmtDate(b.at)) +
        '</td><td><div class="row-actions"><button class="mini-btn" data-bview="' + esc(b.id) + '" type="button">Xem</button><button class="mini-btn danger" data-bdel="' + esc(b.id) + '" type="button">Xoá</button></div></td></tr>';
    }).join("");
    cards.innerHTML = all.map(function (b) {
      var d = b.data || {};
      return '<div class="d-card"><h4>' + esc(d.evtType || "Đặt dịch vụ") + "</h4><p>👤 " + esc(d.name || "—") + " · " + esc(d.phone || "—") +
        "</p><p>📅 " + esc(d.bookDate || "—") + " · 🕐 " + esc(fmtDate(b.at)) + "</p><p>" + sel(b) + "</p>" +
        '<div class="row-actions"><button class="mini-btn" data-bview="' + esc(b.id) + '" type="button">Xem</button><button class="mini-btn danger" data-bdel="' + esc(b.id) + '" type="button">Xoá</button></div></div>';
    }).join("");
  }
  function viewBooking(id) {
    var b = SHOP.getBookings().filter(function (x) { return x.id === id; })[0]; if (!b) return;
    var d = b.data || {};
    var rows = Object.keys(BOOK_LABELS).filter(function (k) { return d[k] != null && d[k] !== ""; }).map(function (k) {
      return "<dt>" + esc(BOOK_LABELS[k]) + "</dt><dd>" + esc(d[k]) + "</dd>";
    }).join("");
    $("detailTitle").textContent = "Yêu cầu đặt dịch vụ";
    $("detailBody").innerHTML = '<dl class="dl">' + rows + "<dt>Trạng thái</dt><dd>" + statusBadge(b.status) + "</dd><dt>Gửi lúc</dt><dd>" + esc(fmtDate(b.at)) + "</dd></dl>";
    openDetail();
  }

  /* ============================================================
     MESSAGES
     ============================================================ */
  var MSG_LABELS = { "c-name": "Họ tên", "c-email": "Email", "c-phone": "Điện thoại", "c-topic": "Chủ đề", "c-msg": "Nội dung" };
  function renderMessages() {
    var all = SHOP.getMessages();
    $("messageCount").textContent = all.length + " tin";
    var rows = $("messageRows"), cards = $("messageCards");
    if (!all.length) {
      rows.innerHTML = '<tr class="empty-row"><td colspan="5">Chưa có tin nhắn. Form ở trang “Liên hệ” sẽ gửi về đây.</td></tr>';
      cards.innerHTML = '<div class="d-card" style="text-align:center;color:var(--muted)">Chưa có tin nhắn.</div>';
      return;
    }
    rows.innerHTML = all.map(function (m) {
      var d = m.data || {};
      var unread = m.read ? "" : ' <span class="st st-unread">Mới</span>';
      return '<tr style="' + (m.read ? "" : "font-weight:600") + '"><td class="cell-name" title="' + esc(d["c-name"] || "—") + '"><b>' + esc(d["c-name"] || "—") + "</b>" + unread + "</td><td>" + esc(d["c-topic"] || "—") +
        '</td><td class="cell-mono">' + esc(d["c-phone"] || d["c-email"] || "—") + '</td><td class="cell-mono">' + esc(fmtDate(m.at)) +
        '</td><td><div class="row-actions"><button class="mini-btn" data-mview="' + esc(m.id) + '" type="button">Xem</button><button class="mini-btn danger" data-mdel="' + esc(m.id) + '" type="button">Xoá</button></div></td></tr>';
    }).join("");
    cards.innerHTML = all.map(function (m) {
      var d = m.data || {};
      return '<div class="d-card"><h4>' + esc(d["c-name"] || "—") + (m.read ? "" : ' <span class="st st-unread">Mới</span>') + "</h4><p>" + esc(d["c-topic"] || "—") + " · " + esc(d["c-phone"] || d["c-email"] || "") +
        "</p><p>🕐 " + esc(fmtDate(m.at)) + "</p>" +
        '<div class="row-actions"><button class="mini-btn" data-mview="' + esc(m.id) + '" type="button">Xem</button><button class="mini-btn danger" data-mdel="' + esc(m.id) + '" type="button">Xoá</button></div></div>';
    }).join("");
  }
  function viewMessage(id) {
    var m = SHOP.getMessages().filter(function (x) { return x.id === id; })[0]; if (!m) return;
    if (!m.read) { SHOP.updateMessage(id, { read: true }); refreshCounts(); }
    var d = m.data || {};
    var rows = Object.keys(MSG_LABELS).filter(function (k) { return d[k] != null && d[k] !== ""; }).map(function (k) {
      return "<dt>" + esc(MSG_LABELS[k]) + "</dt><dd>" + esc(d[k]) + "</dd>";
    }).join("");
    $("detailTitle").textContent = "Tin nhắn";
    $("detailBody").innerHTML = '<dl class="dl">' + rows + "<dt>Gửi lúc</dt><dd>" + esc(fmtDate(m.at)) + "</dd></dl>";
    openDetail();
    renderMessages();
  }

  /* ---------- detail modal ---------- */
  function openDetail() { rememberFocus(); $("detailOverlay").classList.add("open"); document.body.style.overflow = "hidden"; }
  function closeDetail() { $("detailOverlay").classList.remove("open"); document.body.style.overflow = ""; restoreFocus(); }
  $("detailClose").addEventListener("click", closeDetail);
  $("detailCloseBtn").addEventListener("click", closeDetail);
  $("detailOverlay").addEventListener("click", function (e) { if (e.target === $("detailOverlay")) closeDetail(); });

  /* ============================================================
     SETTINGS
     ============================================================ */
  function loadSettings() {
    var s = SHOP.getSettings();
    $("setShopName").value = s.shopName || ""; $("setTagline").value = s.tagline || "";
    $("setHotline").value = s.hotline || ""; $("setEmail").value = s.email || "";
    $("setAddress").value = s.address || ""; $("setHours").value = s.hours || "";
    $("setFacebook").value = s.facebook || ""; $("setInstagram").value = s.instagram || ""; $("setTiktok").value = s.tiktok || "";
    $("setPromo").value = s.promo || "";
  }
  $("setForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var setErr = $("setErr"); if (setErr) setErr.textContent = "";
    var email = $("setEmail").value.trim();
    /* a bad email flows into the public mailto: via applySettings — block save + toast on it */
    if (email && !/.+@.+\..+/.test(email)) {
      if (setErr) setErr.textContent = "Email không hợp lệ.";
      $("setEmail").focus();
      return;
    }
    SHOP.saveSettings({
      shopName: $("setShopName").value.trim(), tagline: $("setTagline").value.trim(),
      hotline: $("setHotline").value.trim(), email: email,
      address: $("setAddress").value.trim(), hours: $("setHours").value.trim(),
      facebook: $("setFacebook").value.trim(), instagram: $("setInstagram").value.trim(), tiktok: $("setTiktok").value.trim(),
      promo: $("setPromo").value.trim()
    });
    toast("Đã lưu cài đặt");
  });
  $("setReset").addEventListener("click", function () {
    if (!confirm("Khôi phục cài đặt về mặc định?")) return;
    SHOP.resetSettings(); loadSettings(); toast("Đã khôi phục cài đặt mặc định");
  });

  /* ============================================================
     STORES (Leaflet + Nominatim) — ported from the store admin
     ============================================================ */
  var storeFilter = "";
  function storeMatches(s) {
    if (!storeFilter) return true;
    return [s.name, s.city, s.address, s.tag, s.phone, s.hours].join(" ").toLowerCase().indexOf(storeFilter) !== -1;
  }
  function renderStores() {
    var all = DS.getStores(), list = all.filter(storeMatches);
    $("countPill").textContent = all.length + " điểm" + (storeFilter && list.length !== all.length ? " · hiện " + list.length : "");
    var rows = $("storeRows"), cards = $("storeCards");
    if (!list.length) {
      rows.innerHTML = '<tr class="empty-row"><td colspan="6">' + (storeFilter ? "Không tìm thấy điểm bán." : "Chưa có điểm bán.") + "</td></tr>";
      cards.innerHTML = '<div class="d-card" style="text-align:center;color:var(--muted)">Chưa có điểm bán.</div>';
      return;
    }
    rows.innerHTML = list.map(function (s) {
      var coord = (typeof s.lat === "number" ? s.lat.toFixed(4) : "—") + ", " + (typeof s.lng === "number" ? s.lng.toFixed(4) : "—");
      return '<tr><td class="cell-name" title="' + esc(s.name) + '"><b>' + esc(s.name) + "</b>" + (s.tag ? '<span class="tg">' + esc(s.tag) + "</span>" : "") + "</td><td>" + esc(s.city || "—") +
        "</td><td>" + esc(s.address || "—") + "</td><td>" + esc(s.hours || "—") + '</td><td class="cell-coord">' + coord +
        '</td><td><div class="row-actions"><button class="mini-btn" data-sedit="' + esc(s.id) + '" type="button">Sửa</button><button class="mini-btn danger" data-sdel="' + esc(s.id) + '" type="button">Xoá</button></div></td></tr>';
    }).join("");
    cards.innerHTML = list.map(function (s) {
      var coord = (typeof s.lat === "number" ? s.lat.toFixed(4) : "—") + ", " + (typeof s.lng === "number" ? s.lng.toFixed(4) : "—");
      return '<div class="d-card"><h4>' + esc(s.name) + "</h4>" + (s.tag ? '<span class="tg">' + esc(s.tag) + "</span>" : "") +
        "<p>📍 " + esc(s.address || "—") + " · " + esc(s.city || "—") + "</p><p>🕐 " + esc(s.hours || "—") + (s.phone ? " · ☎ " + esc(s.phone) : "") +
        '</p><p class="cell-coord">🧭 ' + coord + "</p>" +
        '<div class="row-actions"><button class="mini-btn" data-sedit="' + esc(s.id) + '" type="button">Sửa</button><button class="mini-btn danger" data-sdel="' + esc(s.id) + '" type="button">Xoá</button></div></div>';
    }).join("");
  }
  $("searchInput").addEventListener("input", debounce(function () { storeFilter = this.value.trim().toLowerCase(); renderStores(); }, 180));
  function deleteStore(id) {
    var s = DS.getStores().filter(function (x) { return x.id === id; })[0]; if (!s) return;
    if (!confirm('Xoá điểm bán "' + s.name + '"?')) return;
    if (!DS.saveStores(DS.getStores().filter(function (x) { return x.id !== id; }))) { toast("Không lưu được điểm bán — bộ nhớ đầy.", true); return; }
    renderStores(); refreshCounts(); toast("Đã xoá điểm bán");
  }

  var editingStoreId = null, map = null, marker = null, mapReady = false, hasLeaflet = typeof window.L !== "undefined";
  function placeMarker(lat, lng, moveMap) {
    if (!hasLeaflet || !mapReady) return;
    var ll = [lat, lng];
    if (!marker) {
      marker = window.L.marker(ll, { draggable: true }).addTo(map);
      marker.on("dragend", function () { var p = marker.getLatLng(); $("fLat").value = p.lat.toFixed(6); $("fLng").value = p.lng.toFixed(6); });
    } else marker.setLatLng(ll);
    if (moveMap !== false) map.setView(ll, Math.max(map.getZoom(), 13));
  }
  function setLatLng(lat, lng, moveMap) {
    $("fLat").value = (lat == null ? "" : (+lat).toFixed(6));
    $("fLng").value = (lng == null ? "" : (+lng).toFixed(6));
    if (hasLeaflet && mapReady && lat != null && lng != null) placeMarker(lat, lng, moveMap);
  }
  function initMap() {
    if (!hasLeaflet) { $("editorMap").hidden = true; $("mapFallback").hidden = false; $("geocodeBtn").hidden = true; return; }
    if (map) { setTimeout(function () { map.invalidateSize(); }, 60); return; }
    try {
      map = window.L.map("editorMap", { scrollWheelZoom: true }).setView([16.0479, 108.2209], 5);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      if (DS && DS.addVNIslands) DS.addVNIslands(map, window.L);   /* Hoàng Sa & Trường Sa của Việt Nam */
      map.on("click", function (e) { $("fLat").value = e.latlng.lat.toFixed(6); $("fLng").value = e.latlng.lng.toFixed(6); placeMarker(e.latlng.lat, e.latlng.lng, false); });
      mapReady = true;
      setTimeout(function () { map.invalidateSize(); }, 80);
    } catch (err) { hasLeaflet = false; $("editorMap").hidden = true; $("mapFallback").hidden = false; $("geocodeBtn").hidden = true; }
  }
  function openStore(id) {
    rememberFocus();
    editingStoreId = id || null;
    $("editorErr").textContent = ""; $("geoStatus").textContent = ""; $("geoStatus").className = "geo-status";
    var s = id ? (DS.getStores().filter(function (x) { return x.id === id; })[0] || null) : null;
    $("editorTitle").textContent = id ? "Sửa điểm bán" : "Thêm điểm bán";
    $("fName").value = s ? (s.name || "") : ""; $("fTag").value = s ? (s.tag || "") : "";
    $("fAddress").value = s ? (s.address || "") : ""; $("fCity").value = s ? (s.city || "") : "";
    $("fHours").value = s ? (s.hours || "") : ""; $("fPhone").value = s ? (s.phone || "") : "";
    $("fLat").value = s && typeof s.lat === "number" ? s.lat : ""; $("fLng").value = s && typeof s.lng === "number" ? s.lng : "";
    if (marker && map) { map.removeLayer(marker); marker = null; }
    $("editorOverlay").classList.add("open"); document.body.style.overflow = "hidden";
    initMap();
    if (hasLeaflet && mapReady) {
      if (s && typeof s.lat === "number" && typeof s.lng === "number") placeMarker(s.lat, s.lng, true);
      else setTimeout(function () { map.setView([16.0479, 108.2209], 5); map.invalidateSize(); }, 90);
    }
    setTimeout(function () { $("fName").focus(); }, 60);
  }
  function closeStore() { $("editorOverlay").classList.remove("open"); document.body.style.overflow = ""; editingStoreId = null; restoreFocus(); }
  $("addBtn").addEventListener("click", function () { openStore(null); });
  $("editorClose").addEventListener("click", closeStore);
  $("editorCancel").addEventListener("click", closeStore);
  $("editorOverlay").addEventListener("click", function (e) { if (e.target === $("editorOverlay")) closeStore(); });
  $("geocodeBtn").addEventListener("click", function () {
    var btn = this;
    if (btn.disabled) return;
    var addr = $("fAddress").value.trim(), city = $("fCity").value.trim(), status = $("geoStatus");
    if (!addr && !city) { status.className = "geo-status err"; status.textContent = "Hãy nhập địa chỉ hoặc thành phố trước."; return; }
    var q = [addr, city, "Vietnam"].filter(Boolean).join(", ");
    /* disable + loading state: rapid clicks fire concurrent Nominatim requests (which rate-limit) */
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = "⏳ Đang tìm…";
    status.className = "geo-status"; status.textContent = "Đang tìm toạ độ…";
    /* snapshot the open editor so a stale response can't overwrite a pin the owner moved/closed to */
    var reqStoreId = editingStoreId, wasOpen = $("editorOverlay").classList.contains("open");
    function stale() { return !$("editorOverlay").classList.contains("open") || editingStoreId !== reqStoreId; }
    fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q), { headers: { "Accept": "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        if (!wasOpen || stale()) return;   // editor closed or switched record mid-request — ignore
        if (data && data.length) {
          var lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
          if (isNaN(lat) || isNaN(lng)) { status.className = "geo-status err"; status.textContent = "Toạ độ trả về không hợp lệ."; return; }
          setLatLng(lat, lng, true); status.className = "geo-status ok"; status.textContent = "✓ Đã tìm thấy: " + lat.toFixed(4) + ", " + lng.toFixed(4);
        } else { status.className = "geo-status err"; status.textContent = "Không tìm thấy toạ độ. Hãy thử nhập rõ hơn hoặc đặt ghim thủ công."; }
      })
      .catch(function () { if (!stale()) { status.className = "geo-status err"; status.textContent = "Không kết nối được dịch vụ tìm toạ độ. Bạn vẫn có thể nhập lat/lng thủ công."; } })
      .then(function () { btn.disabled = false; btn.textContent = label; });
  });
  $("editorForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("editorErr"); err.textContent = "";
    var name = $("fName").value.trim(), address = $("fAddress").value.trim(), city = $("fCity").value.trim();
    var latRaw = $("fLat").value.trim(), lngRaw = $("fLng").value.trim();
    if (!name) { err.textContent = "Vui lòng nhập tên cửa hàng."; $("fName").focus(); return; }
    if (!address) { err.textContent = "Vui lòng nhập địa chỉ."; $("fAddress").focus(); return; }
    if (!city) { err.textContent = "Vui lòng nhập thành phố."; $("fCity").focus(); return; }
    var lat = parseFloat(latRaw), lng = parseFloat(lngRaw);
    if (latRaw === "" || isNaN(lat) || lat < -90 || lat > 90) { err.textContent = "Vĩ độ (lat) phải trong -90…90."; $("fLat").focus(); return; }
    if (lngRaw === "" || isNaN(lng) || lng < -180 || lng > 180) { err.textContent = "Kinh độ (lng) phải trong -180…180."; $("fLng").focus(); return; }
    var all = DS.getStores();
    var record = { name: name, tag: $("fTag").value.trim(), address: address, city: city, hours: $("fHours").value.trim(), phone: $("fPhone").value.trim(), lat: lat, lng: lng };
    if (editingStoreId) {
      var idx = -1; for (var i = 0; i < all.length; i++) if (all[i].id === editingStoreId) { idx = i; break; }
      if (idx === -1) { err.textContent = "Không tìm thấy bản ghi."; return; }
      record.id = editingStoreId; all[idx] = record;
    } else { record.id = DS.uid(); all.push(record); }
    var wasEditingStore = !!editingStoreId;
    if (!DS.saveStores(all)) { err.textContent = "Không lưu được điểm bán — bộ nhớ đầy."; toast("Không lưu được điểm bán — bộ nhớ đầy.", true); return; }
    closeStore(); renderStores(); refreshCounts();
    toast(wasEditingStore ? "Đã cập nhật điểm bán" : "Đã thêm điểm bán mới");
  });

  /* ============================================================
     DELEGATED ACTIONS (all tables/cards)
     ============================================================ */
  document.addEventListener("click", function (e) {
    var t = e.target;
    var rr = t.closest("[data-revrange]"); if (rr) { revRange = parseInt(rr.getAttribute("data-revrange"), 10) || 7; renderOverview(); return; }
    var of = t.closest("[data-ofilter]"); if (of) { orderStatusFilter = of.getAttribute("data-ofilter"); document.querySelectorAll(".is-ofilter").forEach(function (b) { b.classList.toggle("active", b === of); }); renderOrders(); return; }
    var go = t.closest("[data-go]"); if (go) { showView(go.getAttribute("data-go")); return; }
    var pe = t.closest("[data-pedit]"); if (pe) { openProd(pe.getAttribute("data-pedit")); return; }
    var pd = t.closest("[data-pdel]"); if (pd) { var p = SHOP.getProduct(pd.getAttribute("data-pdel")); if (p && confirm('Xoá sản phẩm "' + p.name + '"?')) { if (!SHOP.deleteProduct(p.id)) { toast("Không lưu được — bộ nhớ trình duyệt đã đầy.", true); return; } renderProducts(); refreshCounts(); toast("Đã xoá sản phẩm"); } return; }
    var ov = t.closest("[data-oview]"); if (ov) { viewOrder(ov.getAttribute("data-oview")); return; }
    var od = t.closest("[data-odel]"); if (od) { if (confirm("Xoá đơn hàng này?")) { SHOP.deleteOrder(od.getAttribute("data-odel")); renderOrders(); refreshCounts(); toast("Đã xoá đơn hàng"); } return; }
    var cp = t.closest("[data-custphone]"); if (cp) { var ph = cp.getAttribute("data-custphone"); orderFilter = (ph === "—" ? "" : ph).toLowerCase(); $("orderSearch").value = (ph === "—" ? "" : ph); orderStatusFilter = ""; document.querySelectorAll(".is-ofilter").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-ofilter") === ""); }); showView("orders"); return; }
    var bv = t.closest("[data-bview]"); if (bv) { viewBooking(bv.getAttribute("data-bview")); return; }
    var bd = t.closest("[data-bdel]"); if (bd) { if (confirm("Xoá yêu cầu này?")) { SHOP.deleteBooking(bd.getAttribute("data-bdel")); renderBookings(); refreshCounts(); toast("Đã xoá yêu cầu"); } return; }
    var mv = t.closest("[data-mview]"); if (mv) { viewMessage(mv.getAttribute("data-mview")); return; }
    var md = t.closest("[data-mdel]"); if (md) { if (confirm("Xoá tin nhắn này?")) { SHOP.deleteMessage(md.getAttribute("data-mdel")); renderMessages(); refreshCounts(); toast("Đã xoá tin nhắn"); } return; }
    var se = t.closest("[data-sedit]"); if (se) { openStore(se.getAttribute("data-sedit")); return; }
    var sd = t.closest("[data-sdel]"); if (sd) { deleteStore(sd.getAttribute("data-sdel")); return; }
    var cv = t.closest("[data-csv]"); if (cv) { exportOrdersCSV(); return; }
    var ex = t.closest("[data-export]"); if (ex) { openJson("export", ex.getAttribute("data-export")); return; }
    var im = t.closest("[data-import]"); if (im) { openJson("import", im.getAttribute("data-import")); return; }
    var rs = t.closest("[data-reset]"); if (rs) { resetDataset(rs.getAttribute("data-reset")); return; }
  });
  document.addEventListener("change", function (e) {
    var os = e.target.closest("[data-ostatus]");
    if (os) {
      /* destructive 'Đã huỷ' transition: confirm; if declined, revert the select and bail (no toast) */
      if (os.value === "Đã huỷ" && !confirm("Chuyển đơn sang ĐÃ HUỶ? Doanh thu sẽ không tính đơn này.")) { os.value = os.getAttribute("data-prev") || "Mới"; return; }
      if (!SHOP.updateOrder(os.getAttribute("data-ostatus"), { status: os.value })) { toast("Không lưu được — bộ nhớ trình duyệt đã đầy.", true); renderOrders(); return; }
      os.setAttribute("data-prev", os.value); refreshCounts(); toast("Đã cập nhật trạng thái đơn"); return;
    }
    var bs = e.target.closest("[data-bstatus]");
    if (bs) {
      if (bs.value === "Đã huỷ" && !confirm("Chuyển yêu cầu sang ĐÃ HUỶ?")) { bs.value = bs.getAttribute("data-prev") || "Mới"; return; }
      if (!SHOP.updateBooking(bs.getAttribute("data-bstatus"), { status: bs.value })) { toast("Không lưu được — bộ nhớ trình duyệt đã đầy.", true); renderBookings(); return; }
      bs.setAttribute("data-prev", bs.value); refreshCounts(); toast("Đã cập nhật trạng thái"); return;
    }
  });

  /* ============================================================
     EXPORT / IMPORT / RESET (per dataset)
     ============================================================ */
  var DATASETS = {
    products: { label: "sản phẩm", file: "dali-san-pham.json", get: function () { return SHOP.getProducts(); }, save: function (l) { return SHOP.saveProducts(l); }, reset: function () { SHOP.resetProducts(); }, rerender: function () { renderProducts(); }, validate: validateProducts, importable: true },
    stores:   { label: "điểm bán",  file: "dali-diem-ban.json",  get: function () { return DS.getStores(); },   save: function (l) { return DS.saveStores(l); },   reset: function () { DS.resetStores(); },   rerender: function () { renderStores(); },   validate: validateStores,   importable: true },
    orders:   { label: "đơn hàng",  file: "dali-don-hang.json",  get: function () { return SHOP.getOrders(); },   importable: false },
    bookings: { label: "đặt dịch vụ", file: "dali-dat-dich-vu.json", get: function () { return SHOP.getBookings(); }, importable: false },
    messages: { label: "tin nhắn",  file: "dali-tin-nhan.json",  get: function () { return SHOP.getMessages(); }, importable: false }
  };

  function validateProducts(arr) {
    if (!Array.isArray(arr)) throw "Dữ liệu phải là MẢNG sản phẩm ([ … ]).";
    if (!arr.length) throw "Mảng rỗng — cần ít nhất 1 sản phẩm.";
    return arr.map(function (o, i) {
      o = o || {};
      if (!o.name) throw "Mục #" + (i + 1) + " thiếu tên.";
      var price = parseInt(o.price, 10);
      if (isNaN(price) || price < 0) throw "Mục #" + (i + 1) + " có giá không hợp lệ.";
      return {
        id: o.id || SHOP.uid("p"), name: String(o.name), cat: String(o.cat || "Khác"),
        badge: o.badge ? String(o.badge) : "", price: price, old: parseInt(o.old, 10) || 0,
        img: String(o.img || "assets/img/products/combo-ky-lan.svg"),
        rating: parseFloat(o.rating) || 0, reviews: parseInt(o.reviews, 10) || 0,
        char: !!o.char, featured: !!o.featured, active: o.active !== false, desc: o.desc ? String(o.desc) : ""
      };
    });
  }
  function validateStores(arr) {
    if (!Array.isArray(arr)) throw "Dữ liệu phải là MẢNG điểm bán ([ … ]).";
    if (!arr.length) throw "Mảng rỗng — cần ít nhất 1 điểm bán.";
    return arr.map(function (o, i) {
      o = o || {};
      var lat = parseFloat(o.lat), lng = parseFloat(o.lng);
      if (!o.name || !o.address || !o.city) throw "Mục #" + (i + 1) + " thiếu tên/địa chỉ/thành phố.";
      if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) throw "Mục #" + (i + 1) + " có toạ độ không hợp lệ.";
      return { id: o.id || DS.uid(), name: String(o.name), tag: o.tag ? String(o.tag) : "", address: String(o.address), city: String(o.city), hours: o.hours ? String(o.hours) : "", phone: o.phone ? String(o.phone) : "", lat: lat, lng: lng };
    });
  }

  function resetDataset(key) {
    var ds = DATASETS[key]; if (!ds || !ds.reset) return;
    if (!confirm("Khôi phục " + ds.label + " về mặc định?\nMọi thay đổi đã lưu trên trình duyệt này sẽ bị xoá.")) return;
    ds.reset();
    if (key === "products") { prodFilter = ""; $("prodSearch").value = ""; } if (key === "stores") { storeFilter = ""; $("searchInput").value = ""; }
    if (ds.rerender) ds.rerender(); refreshCounts();
    toast("Đã khôi phục " + ds.label + " mặc định");
  }

  /* ---------- JSON modal ---------- */
  var jsonMode = "export", jsonDataset = "products";
  function openJson(mode, key) {
    rememberFocus();
    jsonMode = mode; jsonDataset = key;
    var ds = DATASETS[key]; if (!ds) return;
    $("jsonErr").textContent = "";
    var area = $("jsonArea");
    if (mode === "export") {
      $("jsonTitle").textContent = "Xuất " + ds.label;
      $("jsonHint").innerHTML = "Sao chép nội dung hoặc bấm <b>Tải xuống</b> để lưu file. Toàn bộ " + esc(ds.label) + " hiện tại.";
      $("jsonPrimary").textContent = "⬇️ Tải xuống"; $("jsonPrimary").hidden = false;
      area.value = JSON.stringify(ds.get(), null, 2); area.readOnly = true;
    } else {
      $("jsonTitle").textContent = "Nhập " + ds.label;
      $("jsonHint").innerHTML = "Dán mảng JSON rồi bấm <b>Nhập &amp; lưu</b>. Dữ liệu hiện tại sẽ bị thay thế.";
      $("jsonPrimary").textContent = "Nhập & lưu"; $("jsonPrimary").hidden = false;
      area.value = ""; area.readOnly = false;
    }
    $("jsonOverlay").classList.add("open"); document.body.style.overflow = "hidden";
    setTimeout(function () { area.focus(); }, 60);
  }
  function closeJson() { $("jsonOverlay").classList.remove("open"); document.body.style.overflow = ""; restoreFocus(); }
  $("jsonClose").addEventListener("click", closeJson);
  $("jsonCancel").addEventListener("click", closeJson);
  $("jsonOverlay").addEventListener("click", function (e) { if (e.target === $("jsonOverlay")) closeJson(); });
  $("jsonPrimary").addEventListener("click", function () {
    var ds = DATASETS[jsonDataset]; if (!ds) return;
    if (jsonMode === "export") {
      try {
        var blob = new Blob([$("jsonArea").value], { type: "application/json" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = ds.file;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); toast("Đã tải file JSON");
      } catch (e) { toast("Trình duyệt không hỗ trợ tải file", true); }
      return;
    }
    var errEl = $("jsonErr"); errEl.textContent = "";
    var parsed;
    try { parsed = JSON.parse($("jsonArea").value); } catch (e) { errEl.textContent = "JSON không hợp lệ: " + e.message; return; }
    var clean;
    try { clean = ds.validate(parsed); } catch (msg) { errEl.textContent = String(msg); return; }
    if (!confirm("Nhập sẽ THAY THẾ toàn bộ " + ds.label + " hiện tại (" + ds.get().length + " mục) bằng " + clean.length + " mục mới. Tiếp tục?")) return;
    if (!ds.save(clean)) { errEl.textContent = "Không lưu được — bộ nhớ trình duyệt đã đầy."; return; }
    closeJson();
    if (jsonDataset === "stores") { storeFilter = ""; $("searchInput").value = ""; }
    if (jsonDataset === "products") { prodFilter = ""; $("prodSearch").value = ""; }
    if (ds.rerender) ds.rerender(); refreshCounts();
    toast("Đã nhập " + clean.length + " " + ds.label);
  });

  /* global Esc closes any open modal
     (stat cards are now real <button>s — native Enter/Space activation + the
     [data-go] click delegate handle keyboard, so no custom key branch needed) */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    [["editorOverlay", closeStore], ["prodOverlay", closeProd], ["detailOverlay", closeDetail], ["jsonOverlay", closeJson]].forEach(function (pair) {
      if ($(pair[0]).classList.contains("open")) pair[1]();
    });
  });

  /* ============================================================
     BOOT
     ============================================================ */
  if (!SHOP || !DS) {
    document.body.innerHTML = '<div style="padding:60px;text-align:center;font-family:sans-serif"><h2>Lỗi tải dữ liệu</h2>' +
      "<p>Không tìm thấy <code>shop-data.js</code> hoặc <code>stores.js</code>. Hãy đảm bảo cả hai được nạp trước admin.js.</p></div>";
    return;
  }
  if (isAuthed()) showDashboard(); else showGate();
})();
