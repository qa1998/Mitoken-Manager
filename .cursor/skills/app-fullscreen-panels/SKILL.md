---
name: app-fullscreen-panels
description: >-
  Full Business Web UX: app-fs-modal push panels beside sidebar (Quay lại, no backdrop),
  add forms via modal push not URL tabs, full-height scrollable lists (app-list-fill),
  product units and supplier intake. Use for modals, Thêm mới, list row click, preview pages,
  preview_page_back, app_back_url, quote_preview, app-fs-modal, open_add, or list layout.
---

# Full Business Web — UI patterns

## 1. Panel full màn hình (`app-fs-modal`)

### Mục tiêu UX

- Popup = **màn hình mới** bên phải sidebar (240px), **không** trượt/đè/mờ list phía sau.
- **Sidebar** luôn thấy và bấm được.
- Nút **← Quay lại** (ẩn `btn-close`).
- **Không** backdrop (`data-bs-backdrop="false"`).

### File

| File | Hàm / class |
|------|-------------|
| `static/css/style.css` | `.app-fs-modal`, `--app-sidebar-width: 240px` |
| `static/js/app.js` | `relocateAppModalsToBody`, `initAppFullscreenModals`, `ensureAppPushBackButton`, `syncAppFullscreenBackdrop` |

### CSS (bắt buộc)

```css
.app-fs-modal {
  left: var(--app-sidebar-width);
  width: calc(100vw - var(--app-sidebar-width));
  background: #fff;
}
.app-fs-modal .modal-dialog {
  position: fixed;
  left: var(--app-sidebar-width);
  right: 0; top: 0; bottom: 0;
  transform: none;
  transition: none;
}
body.app-fs-modal-open .app-shell .sidebar { z-index: 1060; }
.modal-backdrop.app-fs-backdrop { display: none; }
```

**Sai:** `padding-left: 240px` full viewport → che sidebar.

**Sai:** modal trong `.content` bị `opacity`/`transform` parent → dùng `relocateAppModalsToBody()`.

### Modal mới

- `class="modal fade"` → JS tự gắn `app-fs-modal`.
- Opt-out: `modal-compact` hoặc `data-app-fs-modal="0"`.
- Form dài: `modal-dialog-scrollable`; header có `.modal-title` để inject **Quay lại**.

---

## 2. Form «Thêm mới» — push panel (không tab URL)

### Mục tiêu UX

- Trang chính **chỉ** header + stats (nếu có) + **danh sách** full cao.
- **Không** đặt form thêm dài phía trên bảng.
- **Không** dùng tab URL (`?tab=add`) — user muốn **push** như Chi tiết NCC / Nhập SP.

### Trang đã áp dụng

| Trang | Template | Modal ID | Nút mở |
|-------|----------|----------|--------|
| NCC | `suppliers.html` | `#addSupplierModal` | `data-bs-target="#addSupplierModal"` |
| Khách hàng | `customers.html` | `#addCustomerModal` | `#addCustomerModal` |
| Hợp đồng | `contracts.html` | `#addContractModal` | `#addContractModal` |

**Chưa dùng pattern này:** Báo giá, Đơn hàng, Sản phẩm (modal tạo riêng, VD `#createQuoteModal`).

### HTML mẫu

```html
<!-- Trang: chỉ list -->
<button type="button" class="btn btn-primary btn-sm"
        data-bs-toggle="modal" data-bs-target="#addSupplierModal">
  Thêm mới
</button>

<!-- Cuối template, ngoài .supplier-page -->
<div class="modal fade" id="addSupplierModal" tabindex="-1"
     data-app-open-on-load="{{ '1' if open_add_modal else '0' }}">
  <div class="modal-dialog modal-dialog-scrollable">
    <div class="modal-content">
      <form method="post" class="supplier-form">
        <div class="modal-header">
          <h5 class="modal-title">Thêm nhà cung cấp mới</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">{{ form_fields }}</div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Hủy</button>
          <button type="submit" class="btn btn-primary">Lưu</button>
        </div>
      </form>
    </div>
  </div>
</div>
```

→ `initAppFullscreenModals()` biến thành `app-fs-modal` + **Quay lại**.

### Backend (`app.py`)

```python
# GET: mở lại panel sau lỗi validate
open_add_modal = request.args.get('open_add') == 'supplier'  # | customer | contract

# POST lỗi → redirect giữ list + mở panel
return redirect(url_for('suppliers', open_add='supplier'))

# POST OK → redirect list bình thường (không open_add)
return suppliers_redirect_after_save('Đã thêm...')
```

| `open_add` | Trang |
|------------|-------|
| `supplier` | `/suppliers` |
| `customer` | `/customers` (+ `from=quotes` → `open_add_modal=True` không cần query) |
| `contract` | `/contracts` |

### Frontend (`app.js`)

- `openAppModalsOnLoad()` — `DOMContentLoaded`: mọi `.modal[data-app-open-on-load="1"]` → `.show()`.
- Sau khi mở: `history.replaceState` xóa `open_add` khỏi URL.

### Trang mới — checklist

- [ ] Form thêm trong `modal.fade` + `modal-dialog-scrollable`, **không** inline trên list
- [ ] Nút list: `data-bs-toggle="modal"` + `data-bs-target="#addXModal"`
- [ ] Redirect lỗi: `open_add=<entity>`; template: `open_add_modal` → `data-app-open-on-load`
- [ ] Wrapper list: `*-page` + `*-list-card` (fill chiều cao, mục 3)
- [ ] **Không** tạo `entity_page_tabs` / `?tab=add`

### Sai lầm thường gặp

- Tab URL «Danh sách | Thêm mới» — user từ chối, dùng push modal.
- Form thêm là `panel-card` trên cùng trang → list bị đẩy xuống, không full cao.
- Quên `open_add` khi validate fail → user không thấy lại form + flash.

---

## 3. Click dòng list → màn chi tiết

### Mục tiêu UX

- Bấm **bất kỳ chỗ nào trên dòng** (trừ nút ⋮, link, form) → mở chi tiết.
- Modal có sẵn → **push panel** (`data-list-detail-modal`).
- Chưa có modal → **trang chi tiết** (`data-list-detail-href`).

### JS (`app.js`)

- `initListRowDetailClick()` — `DOMContentLoaded` + `shown.bs.modal`
- `tr.list-row-clickable` + `data-list-detail-modal="#detailModal5"` hoặc `data-list-detail-href="/url"`
- Tùy chọn hub KH: `data-list-detail-hub-tab="contract|history|info"`

### Đã gắn

| Trang | Cách mở |
|-------|---------|
| NCC | `#detailModal{id}` |
| Khách hàng | `#customerHub{id}` |
| Hợp đồng | `preview_contract` (trang xem HĐ) |
| Báo giá / Đơn | `quote_preview` / `order_preview` |
| Sản phẩm / Kho | `product_detail` |
| Công nợ | `debt?customer_id=` (panel phải) |

### HTML mẫu

```html
<tr class="list-row-clickable" data-list-detail-modal="#detailModal{{ id }}">
```

```html
<tr class="list-row-clickable" data-list-detail-href="{{ url_for('product_detail', pid=p.id) }}">
```

CSS: `.list-row-clickable { cursor: pointer }` + hover nền nhạt.

**Không** gắn handler riêng từng trang — dùng chung `app.js`.

---

## 4. Trang preview tài liệu (nút Quay lại)

### Mục tiêu UX

Trang xem báo giá / đơn / hợp đồng (không phải modal push) có **← Quay lại** góc trái header, giống panel push.

### File

| File | Vai trò |
|------|---------|
| `templates/partials/preview_page_back.html` | Macro `preview_page_back(back_url)` |
| `app.py` | `app_back_url('quotes'|'orders'|'contracts')` — ưu tiên `request.referrer` cùng host |
| `quote_preview_page.html`, `order_preview_page.html`, `contract_preview.html` | Layout `.preview-page-head` |

### HTML mẫu

```html
{% from 'partials/preview_page_back.html' import preview_page_back %}
<div class="preview-page-head no-print">
  {{ preview_page_back(back_url) }}
  <div class="preview-page-head-body">...</div>
  <div class="preview-page-head-actions">...</div>
</div>
```

### Backend

```python
back_url=app_back_url('quotes')  # trong quote_preview()
```

Docx HĐ từ list: `preview_contract` → `app_back_url('contracts')`.  
Docx phụ từ báo giá (HĐMB, BBGH): `back_url` → `quote_preview` (đã có trong `_quote_doc_preview_page`).

CSS: `.btn-preview-back`, `.preview-page-head`.

---

## 5. Danh sách full chiều cao (scroll trong bảng)

### Mục tiêu UX

- Card list **không** co theo số dòng; kéo tới đáy viewport; bảng scroll bên trong.

### File

| File | Vai trò |
|------|---------|
| `templates/base.html` | `main.content.content-fill` |
| `static/css/style.css` | `.app-page-stack`, `.app-list-fill`, `.app-list-scroll` |
| `static/js/app.js` | `initAppPageFillLists()` |

### Luồng `initAppPageFillLists`

1. `main.content-fill`
2. Stack: `.app-page-stack` hoặc `.quote-page`, `.supplier-page`, `.customer-entity-page`, `.contracts-page`, …
3. Card list (ưu tiên class): `.supplier-list-card`, `.customer-list-card`, `.contracts-list-card`, `.quote-table-card`, …
4. Gắn `app-list-fill` + `app-list-scroll` trên wrap bảng

### HTML list (rút gọn)

```html
<div class="supplier-page">
  <div class="panel-card supplier-header-card">...</div>
  <div class="row supplier-stat-row">...</div>
  <div class="panel-card supplier-list-card">
    <div class="table-toolbar">...</div>
    <div class="customer-table-wrap">...</div>
    <div class="table-footer">...</div>
  </div>
</div>
```

### Dropdown trong bảng scroll

- Popper `strategy: 'fixed'` — `initTableDropdowns()`.
- Skill chi tiết: `overflow-scroll-dropdowns`.

### Trang đặc biệt

| Trang | Ghi chú |
|-------|---------|
| Công nợ | 2 cột; `debt-list-card` + `debt-tab-content` scroll |
| Công ty | `company-page` — JS không auto-fill |
| Opt-out | `data-app-no-fill-list` |

---

## 6. Đơn vị sản phẩm & nhập NCC (tóm tắt)

**SP:** `base_unit`, `purchase_unit`, `conversion_factor`, `lot_unit` / `lot_factor`.

**Excel:** Đơn vị tồn kho | Đơn vị nhập | Hệ số quy đổi.

**Nhập NCC:** giá theo đơn vị nhập; `cost_price` = giá vốn đơn vị tồn. Panel: `#productsModal{id}`, `supplier-intake-modal`.

**SQL:** `Product.stock_qty` trong filter, không `Product.stock`.

---

## Kiểm tra nhanh

1. **Push thêm:** Thêm mới → panel full + **Quay lại**.
2. **Click dòng:** NCC/KH → modal chi tiết; SP → trang `product_detail`.
3. **Preview BG/ĐH/HĐ:** Có **Quay lại** trái, về list hoặc trang trước (referrer).
4. **List:** Bảng scroll trong card full cao.
5. **Ctrl+F5** sau đổi CSS/JS.
