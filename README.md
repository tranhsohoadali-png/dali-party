# 🎈 Dali Party — Website bán bóng bay & trang trí

Website thương mại cho **Dali Party** (Công ty Sản xuất & Thương mại Dali) — cửa hàng bóng bay
và trang trí sự kiện. Trang chủ tập trung vào **animation sống động** để thu hút khách hàng,
kèm đầy đủ luồng mua sắm (giỏ hàng, sản phẩm, đặt dịch vụ, liên hệ).

Thiết kế dựa trên dự án Stitch *"Trang chủ Cửa hàng Bóng bay & Trang trí"*, sau đó được
**redesign sang phong cách boutique cao cấp** (cũng tạo từ Stitch, Gemini 3.1 Pro): nền kem ấm
`#fafaf3`, primary olive đậm `#416900`, accent xanh `#8cc63f`, ảnh hero bóng bay thật tông sage/kem/vàng.

---

## ▶️ Cách chạy

Không cần build, không cần cài đặt. Chọn một trong hai cách:

1. **Mở trực tiếp:** nhấp đúp vào `index.html`.
2. **Chạy server tĩnh** (khuyến nghị — để ảnh SVG & font tải đúng):
   ```bash
   cd "E:/DALI Party"
   python -m http.server 8000
   # mở http://localhost:8000
   ```

## 🗂️ Cấu trúc trang

| Trang | Tệp | Nội dung |
|------|-----|----------|
| Trang chủ | `index.html` | Hero animation, sản phẩm nổi bật, danh mục, lý do chọn, thống kê, quy trình, đánh giá, CTA |
| Cửa hàng | `cua-hang.html` | Toàn bộ 8 sản phẩm + bộ lọc danh mục |
| Chi tiết sản phẩm | `san-pham.html` | Combo Sinh nhật Kỳ Lân: thư viện ảnh, chọn màu, số lượng, sản phẩm gợi ý |
| Gói dịch vụ | `goi-dich-vu.html` | Lịch đặt hẹn tương tác + 3 gói dịch vụ + quy trình |
| Liên hệ | `lien-he.html` | Form liên hệ, thông tin, hệ thống cửa hàng (bản đồ), FAQ |

## ✨ Animation trang chủ

- Bóng bay trôi nổi + **parallax** theo chuột và cuộn trang
- **Confetti** khi tải trang và mỗi lần thêm vào giỏ
- Hiệu ứng hiện dần (reveal) + so le (stagger) khi cuộn tới
- Tiêu đề "phép thuật" hiện theo từng chữ, gradient chuyển màu
- Vệt lấp lánh theo con trỏ chuột trong khu vực hero
- Đếm số tự động (5.000+ bữa tiệc, 8 năm…)
- Carousel đánh giá tự chạy, marquee khuyến mãi, nút "lên đầu trang" hình bóng bay
- Giỏ hàng: bóng bay "bay" vào giỏ + ngăn kéo trượt + thông báo toast

> Tất cả tôn trọng `prefers-reduced-motion` — tự tắt chuyển động mạnh cho người dùng nhạy cảm.

## 🛒 Tính năng

- Giỏ hàng đầy đủ (thêm/xóa/đổi số lượng), **lưu trong `localStorage`**, tính tổng tiền
- Lọc sản phẩm theo danh mục (trang Cửa hàng)
- Lịch đặt dịch vụ tương tác (chọn ngày, chặn ngày quá khứ)
- Form đặt lịch / liên hệ / nhận ưu đãi (bản demo — hiện thông báo thành công)

## 🎨 Tùy chỉnh nhanh

- **Sản phẩm & giá:** sửa `DALI.CATALOG` trong `assets/js/main.js` (id, tên, giá, ảnh).
- **Màu thương hiệu, font, bo góc:** các biến CSS ở đầu `assets/css/styles.css` (`:root`).
- **Ảnh sản phẩm:** SVG trong `assets/img/products/` (thay bằng ảnh thật nếu muốn).

## 🧱 Công nghệ

HTML + CSS + JavaScript thuần (vanilla), không framework, không bước build.
Font **Be Vietnam Pro** (Google Fonts). Ảnh sản phẩm dạng **SVG** (nhẹ, sắc nét); ảnh hero là ảnh thật.

**Lớp "premium motion" (tùy chọn):** smooth-scroll **Lenis** + **GSAP ScrollTrigger** (parallax) + nút **magnetic**,
nạp qua CDN trong `assets/js/premium-motion.js`. Đây là *progressive enhancement* — nếu không có mạng
(không tải được CDN) hoặc người dùng bật `prefers-reduced-motion`, lớp này tự bỏ qua và site vẫn chạy
đầy đủ với animation vanilla sẵn có.

## ♿ Khả năng tiếp cận (đã rà soát)

- Độ tương phản nút/chữ đạt chuẩn WCAG AA (xanh `--green-700`)
- Liên kết "Bỏ qua tới nội dung", landmark `<main id="main">`
- `alt` tiếng Việt cho ảnh, `aria-label` cho nút biểu tượng, nhãn cho ô nhập liệu
- Lịch & danh sách cửa hàng thao tác được bằng bàn phím, có `aria-live` / `aria-current`
- Responsive: 4 cột → 2 cột → 1 cột; menu mobile dạng ngăn kéo

## 📌 Ghi chú

- Giỏ hàng, thanh toán và các form chỉ là **demo** (chưa kết nối backend/thanh toán thật).
- Liên kết mạng xã hội và một số trang chính sách là placeholder (`#`) — gắn URL thật khi triển khai.
- `.stitch_ref/` chứa ảnh tham chiếu từ thiết kế Stitch (không thuộc website).

---

© 2026 Dali Party — Công ty Sản xuất & Thương mại Dali.
