# Full Business Web - Quản lý bán hàng nội bộ

Hệ thống Flask chạy local cho công ty thương mại: khách hàng, sản phẩm, bảng giá, báo giá, hợp đồng, đơn hàng, kho, công nợ.

## Chạy nhanh

```bash
cd full_business_web
python3 -m venv venv
source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
python app.py
```

Mở trình duyệt:

```text
http://127.0.0.1:5050
```

Nếu máy khác cùng WiFi truy cập:

```text
http://IP-MAY-CHU:5050
```

## Tài khoản

Bản này chưa bật đăng nhập để chạy nhanh nội bộ. Nếu muốn public lên internet thì cần thêm login + phân quyền.

## Dữ liệu

Database SQLite nằm ở:

```text
instance/business.db
```

## Module có sẵn

- Dashboard
- Khách hàng
- Sản phẩm
- Lịch sử giá
- Báo giá
- Hợp đồng Word
- Đơn hàng
- Nhập/xuất kho
- Công nợ/thanh toán

## Lưu ý

- Báo giá sẽ đóng băng đơn giá tại thời điểm tạo.
- Đổi giá sản phẩm sau này không làm thay đổi báo giá cũ.
- File hợp đồng tạo ra nằm trong `output/contracts/`.
