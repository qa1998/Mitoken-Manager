import json
import os
import time
import uuid
import csv
import io
from datetime import datetime, date, timedelta
from decimal import Decimal
from pathlib import Path
from urllib.request import urlopen
from flask import Flask, render_template, request, redirect, url_for, flash, send_file, Response
from werkzeug.utils import secure_filename
from sqlalchemy import func, or_
from flask_sqlalchemy import SQLAlchemy
from markupsafe import escape
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'instance' / 'business.db'
OUTPUT_DIR = BASE_DIR / 'output'
TEMPLATE_DOCX = BASE_DIR / 'templates_docx' / 'hop_dong_template.docx'
TEMPLATE_QUOTE_SALE_CONTRACT = BASE_DIR / 'templates_docx' / 'hop_dong_mua_ban_bao_gia.docx'
TEMPLATE_QUOTE_HANDOVER = BASE_DIR / 'templates_docx' / 'bien_ban_nhan_hang.docx'
QUOTE_DOCS_DIR = OUTPUT_DIR / 'quotes'
PRODUCT_UPLOAD_DIR = BASE_DIR / 'static' / 'uploads' / 'products'
COMPANY_LOGO_DIR = BASE_DIR / 'static' / 'uploads' / 'company'
CONTRACT_SIGNED_UPLOAD_DIR = BASE_DIR / 'static' / 'uploads' / 'contracts' / 'signed'
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
ALLOWED_CONTRACT_SCAN_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.pdf'}
MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024
MAX_CONTRACT_SCAN_BYTES = 10 * 1024 * 1024

app = Flask(__name__)
app.config['SECRET_KEY'] = 'change-this-secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class Customer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer_type = db.Column(db.String(20), default='company')
    name = db.Column(db.String(255), nullable=False)
    tax_code = db.Column(db.String(64), default='')
    id_card = db.Column(db.String(32), default='')
    address = db.Column(db.Text, default='')
    phone = db.Column(db.String(64), default='')
    email = db.Column(db.String(120), default='')
    representative = db.Column(db.String(120), default='')
    position = db.Column(db.String(120), default='')
    bank_account = db.Column(db.String(120), default='')
    bank_name = db.Column(db.String(255), default='')
    note = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sku = db.Column(db.String(80), unique=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(120), default='')
    brand = db.Column(db.String(120), default='')
    model = db.Column(db.String(120), default='')
    variant = db.Column(db.String(120), default='')
    unit = db.Column(db.String(40), default='cái')
    warranty = db.Column(db.String(120), default='')
    cost_price = db.Column(db.Integer, default=0)
    retail_price = db.Column(db.Integer, default=0)
    dealer_price = db.Column(db.Integer, default=0)
    project_price = db.Column(db.Integer, default=0)
    stock = db.Column(db.Integer, default=0)
    low_stock = db.Column(db.Integer, default=5)
    image_path = db.Column(db.String(255), default='')
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class PriceHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    price_type = db.Column(db.String(50), nullable=False)
    old_price = db.Column(db.Integer, default=0)
    new_price = db.Column(db.Integer, default=0)
    note = db.Column(db.String(255), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    product = db.relationship('Product')

class Quote(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quote_code = db.Column(db.String(80), unique=True, nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    status = db.Column(db.String(40), default='Mới tạo')
    vat_rate = db.Column(db.Integer, default=10)
    discount = db.Column(db.Integer, default=0)
    subtotal = db.Column(db.Integer, default=0)
    vat_amount = db.Column(db.Integer, default=0)
    total = db.Column(db.Integer, default=0)
    note = db.Column(db.Text, default='')
    valid_until = db.Column(db.Date, nullable=True)
    sale_contract_path = db.Column(db.String(512), default='')
    handover_doc_path = db.Column(db.String(512), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    customer = db.relationship('Customer')
    items = db.relationship('QuoteItem', cascade='all, delete-orphan', backref='quote')

class QuoteItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.Integer, db.ForeignKey('quote.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    product_name = db.Column(db.String(255), nullable=False)
    sku = db.Column(db.String(80), default='')
    unit = db.Column(db.String(40), default='cái')
    qty = db.Column(db.Integer, default=1)
    price = db.Column(db.Integer, default=0)
    amount = db.Column(db.Integer, default=0)
    product = db.relationship('Product')

CONTRACT_TYPE_FRAMEWORK = 'framework'

class Contract(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    contract_code = db.Column(db.String(80), unique=True, nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    contract_type = db.Column(db.String(20), default='framework')
    quote_id = db.Column(db.Integer, db.ForeignKey('quote.id'), nullable=True)
    signed_date = db.Column(db.Date, default=date.today)
    expired_date = db.Column(db.Date, nullable=True)
    file_path = db.Column(db.String(255), default='')
    signed_scan_path = db.Column(db.String(255), default='')
    signed_scan_uploaded_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    customer = db.relationship('Customer')
    quote = db.relationship('Quote')

class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_code = db.Column(db.String(80), unique=True, nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey('customer.id'), nullable=False)
    quote_id = db.Column(db.Integer, db.ForeignKey('quote.id'), nullable=True)
    status = db.Column(db.String(40), default='Mới tạo')
    total = db.Column(db.Integer, default=0)
    paid_amount = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    customer = db.relationship('Customer')
    quote = db.relationship('Quote')

class Payment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('order.id'), nullable=False)
    amount = db.Column(db.Integer, default=0)
    method = db.Column(db.String(80), default='Chuyển khoản')
    note = db.Column(db.String(255), default='')
    payment_date = db.Column(db.Date, default=date.today)
    order = db.relationship('Order')

class CompanyProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, default='')
    short_name = db.Column(db.String(80), default='')
    tax_code = db.Column(db.String(64), default='')
    address = db.Column(db.Text, default='')
    phone = db.Column(db.String(120), default='')
    email = db.Column(db.String(120), default='')
    bank_account = db.Column(db.String(120), default='')
    bank_name = db.Column(db.String(255), default='')
    director_name = db.Column(db.String(120), default='')
    director_title = db.Column(db.String(80), default='Giám đốc')
    logo_path = db.Column(db.String(255), default='')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class StockMovement(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    movement_type = db.Column(db.String(20), nullable=False)  # IN/OUT
    qty = db.Column(db.Integer, default=0)
    ref_code = db.Column(db.String(80), default='')
    method = db.Column(db.String(80), default='Nhập tay')
    warehouse = db.Column(db.String(80), default='Kho chính')
    note = db.Column(db.String(255), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    product = db.relationship('Product')

def money(v):
    try:
        return f"{int(v):,}".replace(',', '.') + ' đ'
    except Exception:
        return '0 đ'

def money_plain(v):
    try:
        return f"{int(v):,}".replace(',', '.')
    except Exception:
        return '0'

app.jinja_env.filters['money'] = money
app.jinja_env.filters['money_plain'] = money_plain

STATUS_FLASH_CATEGORIES = {
    'Đã chốt': 'success',
    'Chờ xác nhận': 'info',
    'Đang xử lý': 'info',
    'Đang giao': 'info',
    'Mới tạo': 'info',
    'Nháp': 'secondary',
    'Đã hủy': 'danger',
}

def flash_status_updated(status):
    category = STATUS_FLASH_CATEGORIES.get(status, 'info')
    flash(f'Đã cập nhật trạng thái: {status}', category)

CATEGORY_TAG_CLASSES = ['tag-blue', 'tag-green', 'tag-purple', 'tag-orange', 'tag-pink', 'tag-cyan']

def category_tag_class(name):
    if not name:
        return 'tag-gray'
    return CATEGORY_TAG_CLASSES[sum(ord(c) for c in name) % len(CATEGORY_TAG_CLASSES)]

app.jinja_env.globals['category_tag'] = category_tag_class

def ensure_product_columns():
    from sqlalchemy import inspect, text
    try:
        cols = {c['name'] for c in inspect(db.engine).get_columns('product')}
    except Exception:
        return
    with db.engine.begin() as conn:
        if 'image_path' not in cols:
            conn.execute(text('ALTER TABLE product ADD COLUMN image_path VARCHAR(255) DEFAULT ""'))
        if 'is_active' not in cols:
            conn.execute(text('ALTER TABLE product ADD COLUMN is_active BOOLEAN DEFAULT 1'))

def ensure_product_image_column():
    ensure_product_columns()

def product_image_url(product):
    path = getattr(product, 'image_path', '') if product else ''
    if path:
        return url_for('static', filename=path)
    return None

def quote_product_catalog(products):
    return [{
        'id': p.id,
        'sku': p.sku,
        'name': p.name,
        'unit': p.unit or 'cái',
        'retail_price': p.retail_price or 0,
        'image_url': product_image_url(p) or '',
        'label': f'{p.sku} - {p.name}',
    } for p in products]

app.jinja_env.globals['product_image_url'] = product_image_url

def delete_product_image_file(image_path):
    if not image_path:
        return
    file_path = BASE_DIR / 'static' / image_path
    if file_path.is_file():
        file_path.unlink(missing_ok=True)

def save_product_image(product, file_storage):
    if not file_storage or not file_storage.filename:
        return True
    ext = Path(secure_filename(file_storage.filename)).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        flash('Ảnh phải là JPG, PNG, WEBP hoặc GIF', 'warning')
        return False
    data = file_storage.read()
    size = len(data)
    file_storage.seek(0)
    if size > MAX_PRODUCT_IMAGE_BYTES:
        flash('Ảnh tối đa 5MB', 'warning')
        return False
    PRODUCT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    delete_product_image_file(product.image_path)
    filename = f'{product.id}_{uuid.uuid4().hex[:10]}{ext}'
    rel_path = f'uploads/products/{filename}'
    file_storage.save(PRODUCT_UPLOAD_DIR / filename)
    product.image_path = rel_path
    return True

QUOTE_STATUSES = ['Nháp', 'Mới tạo', 'Đã chốt', 'Đã hủy']
QUOTE_FILTER_STATUSES = ['Mới tạo', 'Đã chốt', 'Đã hủy']
QUOTE_STATUS_KEYS = {
    'Nháp': 'draft',
    'Mới tạo': 'new',
    'Đã chốt': 'won',
    'Đã hủy': 'cancelled',
}
LEGACY_QUOTE_STATUS_MAP = {
    'Đã gửi': 'Mới tạo',
    'Chờ duyệt': 'Mới tạo',
    'Hết hiệu lực': 'Mới tạo',
}
DEFAULT_COMPANY_PROFILE = {
    'name': 'CÔNG TY TNHH ĐẠI PHÁT',
    'short_name': 'ĐẠI PHÁT',
    'address': 'Tòa nhà IC, 82 Duy Tân, Cầu Giấy, Hà Nội',
    'phone': '024 407 781 999 - 0912 335 694',
    'email': 'contact@daiphat.vn',
    'tax_code': '0123456789',
    'bank_account': '18900217',
    'bank_name': 'Ngân hàng ACB - CN Hà Thành',
    'director_name': '',
    'director_title': 'Giám đốc',
}

def company_bank_display(row):
    parts = []
    if row.bank_account:
        parts.append(f'Số TK: {row.bank_account}')
    if row.bank_name:
        parts.append(row.bank_name)
    return ' - '.join(parts)

def company_profile_to_dict(row):
    return {
        'name': row.name or '',
        'short_name': row.short_name or '',
        'address': row.address or '',
        'phone': row.phone or '',
        'email': row.email or '',
        'tax_code': row.tax_code or '',
        'bank': company_bank_display(row),
        'bank_account': row.bank_account or '',
        'bank_name': row.bank_name or '',
        'director': row.director_title or 'Giám đốc',
        'director_name': row.director_name or '',
        'logo_url': url_for('static', filename=row.logo_path) if row.logo_path else None,
    }

def ensure_company_profile():
    db.create_all()
    row = CompanyProfile.query.get(1)
    if row:
        return row
    d = DEFAULT_COMPANY_PROFILE
    row = CompanyProfile(
        id=1,
        name=d['name'],
        short_name=d['short_name'],
        tax_code=d['tax_code'],
        address=d['address'],
        phone=d['phone'],
        email=d['email'],
        bank_account=d['bank_account'],
        bank_name=d['bank_name'],
        director_name=d.get('director_name', ''),
        director_title=d.get('director_title', 'Giám đốc'),
    )
    db.session.add(row)
    db.session.commit()
    return row

def get_company_profile():
    return company_profile_to_dict(ensure_company_profile())

def save_company_logo(row, file_storage):
    if not file_storage or not file_storage.filename:
        return True
    ext = Path(file_storage.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        flash('Logo phải là JPG, PNG, WEBP hoặc GIF', 'warning')
        return False
    data = file_storage.read()
    if len(data) > MAX_PRODUCT_IMAGE_BYTES:
        flash('Logo tối đa 5MB', 'warning')
        return False
    file_storage.seek(0)
    COMPANY_LOGO_DIR.mkdir(parents=True, exist_ok=True)
    if row.logo_path:
        old = BASE_DIR / 'static' / row.logo_path
        if old.exists():
            old.unlink(missing_ok=True)
    filename = f'logo_{uuid.uuid4().hex[:10]}{ext}'
    rel_path = f'uploads/company/{filename}'
    file_storage.save(COMPANY_LOGO_DIR / filename)
    row.logo_path = rel_path
    return True

@app.context_processor
def inject_company():
    try:
        company = get_company_profile()
    except Exception:
        d = DEFAULT_COMPANY_PROFILE
        bank = f"Số TK: {d['bank_account']} - {d['bank_name']}" if d.get('bank_account') else d.get('bank_name', '')
        company = {**d, 'bank': bank, 'director': d.get('director_title', 'Giám đốc'), 'logo_url': None}
    return {
        'company': company,
        'nav_endpoint': request.endpoint,
    }

def ensure_quote_columns():
    from sqlalchemy import inspect, text
    try:
        cols = {c['name'] for c in inspect(db.engine).get_columns('quote')}
    except Exception:
        return
    with db.engine.begin() as conn:
        if 'valid_until' not in cols:
            conn.execute(text('ALTER TABLE quote ADD COLUMN valid_until DATE'))
        if 'sale_contract_path' not in cols:
            conn.execute(text("ALTER TABLE quote ADD COLUMN sale_contract_path VARCHAR(512) DEFAULT ''"))
        if 'handover_doc_path' not in cols:
            conn.execute(text("ALTER TABLE quote ADD COLUMN handover_doc_path VARCHAR(512) DEFAULT ''"))

def quote_status_key(status):
    return QUOTE_STATUS_KEYS.get(status or '', 'new')

app.jinja_env.globals['quote_status_key'] = quote_status_key

def quote_valid_until(quote):
    if quote.valid_until:
        return quote.valid_until
    return (quote.created_at.date() if quote.created_at else date.today()) + timedelta(days=30)

def quote_display_status(quote):
    status = (quote.status or 'Mới tạo').strip()
    if status in LEGACY_QUOTE_STATUS_MAP:
        return LEGACY_QUOTE_STATUS_MAP[status]
    if status in QUOTE_STATUSES:
        return status
    return 'Mới tạo'

def quote_is_expired(quote):
    if quote_display_status(quote) != 'Mới tạo':
        return False
    return quote_valid_until(quote) < date.today()

def get_quote_order(quote):
    qid = quote if isinstance(quote, int) else quote.id
    return Order.query.filter_by(quote_id=qid).first()

def orders_by_quote_ids(quote_ids):
    if not quote_ids:
        return {}
    return {o.quote_id: o for o in Order.query.filter(Order.quote_id.in_(quote_ids)).all()}

def create_order_from_quote_record(quote):
    existing = get_quote_order(quote)
    if existing:
        return existing, False
    order = Order(
        order_code=next_code('DH', Order, 'order_code'),
        customer_id=quote.customer_id,
        quote_id=quote.id,
        total=quote.total,
        paid_amount=0,
        status='Chờ xác nhận',
    )
    db.session.add(order)
    return order, True

def chot_quote(quote):
    quote.status = 'Đã chốt'
    return create_order_from_quote_record(quote)

def effective_quote_status(quote):
    return quote_display_status(quote)

def normalize_quote_statuses():
    changed = False
    for quote in Quote.query.filter(Quote.status.in_(list(LEGACY_QUOTE_STATUS_MAP.keys()))).all():
        quote.status = LEGACY_QUOTE_STATUS_MAP[quote.status]
        changed = True
    if changed:
        db.session.commit()

app.jinja_env.globals['quote_display_status'] = quote_display_status
app.jinja_env.globals['effective_quote_status'] = effective_quote_status
app.jinja_env.globals['quote_is_expired'] = quote_is_expired
app.jinja_env.globals['quote_valid_until'] = quote_valid_until
app.jinja_env.globals['get_quote_order'] = get_quote_order

def quote_note_preview(note, limit=40):
    text = (note or '').strip()
    if not text:
        return '—'
    return text if len(text) <= limit else text[:limit] + '…'

app.jinja_env.globals['quote_note_preview'] = quote_note_preview

def quote_stats(query=None):
    base = query if query is not None else Quote.query
    total = base.count()
    if total == 0:
        return {'total': 0, 'new': 0, 'won': 0, 'cancelled': 0,
                'new_pct': 0, 'won_pct': 0, 'cancelled_pct': 0}
    counts = {'new': 0, 'won': 0, 'cancelled': 0}
    for q in base.all():
        st = quote_display_status(q)
        if st == 'Mới tạo':
            counts['new'] += 1
        elif st == 'Đã chốt':
            counts['won'] += 1
        elif st == 'Đã hủy':
            counts['cancelled'] += 1
    def pct(n):
        return round(n * 1000 / total) / 10 if total else 0
    return {
        'total': total,
        **counts,
        'new_pct': pct(counts['new']),
        'won_pct': pct(counts['won']),
        'cancelled_pct': pct(counts['cancelled']),
    }

QUOTE_SORT_FIELDS = {'quote_code', 'created_at', 'valid_until', 'total', 'status'}

def quote_filters_from_request():
    sort = request.args.get('sort', 'created_at')
    sort = sort if sort in QUOTE_SORT_FIELDS else 'created_at'
    return {
        'customer_id': request.args.get('customer_id', ''),
        'date_from': request.args.get('date_from', ''),
        'date_to': request.args.get('date_to', ''),
        'status': request.args.get('status', ''),
        'q': request.args.get('q', '').strip(),
        'tab': request.args.get('tab', 'list'),
        'sort': sort,
        'order': 'asc' if request.args.get('order') == 'asc' else 'desc',
    }

def quote_sort_url(field, list_args, sort, order):
    next_order = 'desc' if sort == field and order == 'asc' else 'asc'
    if sort != field:
        next_order = 'asc'
    args = {k: v for k, v in list_args.items() if k not in ('sort', 'order', 'page')}
    return url_for('quotes', sort=field, order=next_order, page=1, **args)

app.jinja_env.globals['quote_sort_url'] = quote_sort_url

ORDER_STATUSES = ['Chờ xác nhận', 'Đang xử lý', 'Đang giao', 'Đã chốt', 'Đã hủy']
ORDER_STATUS_KEYS = {
    'Chờ xác nhận': 'pending',
    'Đang xử lý': 'processing',
    'Đang giao': 'delivering',
    'Đã chốt': 'won',
    'Đã hủy': 'cancelled',
    'Mới tạo': 'pending',
}
ORDER_LEGACY_STATUS = {
    'Mới tạo': 'Chờ xác nhận',
    'Đã thanh toán': 'Đã chốt',
    'Thanh toán 1 phần': 'Đã chốt',
}
PAYMENT_STATUS_KEYS = {
    'Đã thanh toán': 'paid',
    'Thanh toán 1 phần': 'partial',
    'Chưa thanh toán': 'unpaid',
    '—': 'none',
}

def effective_order_status(order):
    raw = (order.status or 'Mới tạo').strip()
    if raw in ORDER_LEGACY_STATUS:
        return ORDER_LEGACY_STATUS[raw]
    return raw if raw in ORDER_STATUSES else 'Chờ xác nhận'

def order_payment_status(order):
    if effective_order_status(order) == 'Đã hủy':
        return '—'
    if (order.total or 0) <= 0:
        return 'Chưa thanh toán'
    if (order.paid_amount or 0) >= order.total:
        return 'Đã thanh toán'
    if (order.paid_amount or 0) > 0:
        return 'Thanh toán 1 phần'
    return 'Chưa thanh toán'

def order_status_key(status):
    return ORDER_STATUS_KEYS.get(status or '', 'pending')

def order_payment_key(status):
    return PAYMENT_STATUS_KEYS.get(status or '', 'unpaid')

def order_balance(order):
    return max((order.total or 0) - (order.paid_amount or 0), 0)

def order_stats(query=None):
    base = query if query is not None else Order.query
    total = base.count()
    if total == 0:
        return {'total': 0, 'won': 0, 'processing': 0, 'delivering': 0, 'cancelled': 0,
                'won_pct': 0, 'processing_pct': 0, 'delivering_pct': 0, 'cancelled_pct': 0}
    counts = {'won': 0, 'processing': 0, 'delivering': 0, 'cancelled': 0}
    for o in base.all():
        st = effective_order_status(o)
        if st == 'Đã chốt':
            counts['won'] += 1
        elif st in ('Chờ xác nhận', 'Đang xử lý'):
            counts['processing'] += 1
        elif st == 'Đang giao':
            counts['delivering'] += 1
        elif st == 'Đã hủy':
            counts['cancelled'] += 1
    def pct(n):
        return round(n * 1000 / total) / 10 if total else 0
    return {
        'total': total,
        **counts,
        'won_pct': pct(counts['won']),
        'processing_pct': pct(counts['processing']),
        'delivering_pct': pct(counts['delivering']),
        'cancelled_pct': pct(counts['cancelled']),
    }

def order_filters_from_request():
    return {
        'customer_id': request.args.get('customer_id', ''),
        'date_from': request.args.get('date_from', ''),
        'date_to': request.args.get('date_to', ''),
        'status': request.args.get('status', ''),
        'q': request.args.get('q', '').strip(),
    }

def apply_order_filters(query, filters):
    if filters['customer_id']:
        query = query.filter(Order.customer_id == int(filters['customer_id']))
    if filters['status']:
        st = filters['status']
        status_values = [st]
        if st == 'Chờ xác nhận':
            status_values.append('Mới tạo')
        elif st == 'Đã chốt':
            status_values.extend(['Đã thanh toán', 'Thanh toán 1 phần'])
        query = query.filter(Order.status.in_(status_values))
    date_from = parse_stock_date(filters['date_from'])
    date_to = parse_stock_date(filters['date_to'])
    if date_from:
        query = query.filter(Order.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(Order.created_at <= datetime.combine(date_to, datetime.max.time()))
    if filters['q']:
        like = f"%{filters['q']}%"
        customer_ids = db.session.query(Customer.id).filter(Customer.name.ilike(like))
        query = query.filter(or_(Order.order_code.ilike(like), Order.customer_id.in_(customer_ids)))
    return query

def orders_redirect(**extra):
    f = order_filters_from_request()
    f.update(extra)
    return redirect(url_for('orders', **{k: v for k, v in f.items() if v}))

app.jinja_env.globals['effective_order_status'] = effective_order_status
app.jinja_env.globals['order_payment_status'] = order_payment_status
app.jinja_env.globals['order_status_key'] = order_status_key
app.jinja_env.globals['order_payment_key'] = order_payment_key
app.jinja_env.globals['order_balance'] = order_balance

def apply_quote_sort(query, sort, order):
    col = getattr(Quote, sort)
    if sort == 'valid_until':
        col = Quote.valid_until
    return query.order_by(col.asc() if order == 'asc' else col.desc())

def recalculate_quote_totals(quote):
    quote.vat_amount = int(max(quote.subtotal - quote.discount, 0) * quote.vat_rate / 100)
    quote.total = max(quote.subtotal - quote.discount, 0) + quote.vat_amount

def apply_quote_filters(query, filters):
    if filters['customer_id']:
        query = query.filter(Quote.customer_id == int(filters['customer_id']))
    if filters['status']:
        if filters['status'] in QUOTE_FILTER_STATUSES:
            legacy = [filters['status']] + [
                old for old, new in LEGACY_QUOTE_STATUS_MAP.items() if new == filters['status']
            ]
            query = query.filter(Quote.status.in_(legacy))
    date_from = parse_stock_date(filters['date_from'])
    date_to = parse_stock_date(filters['date_to'])
    if date_from:
        query = query.filter(Quote.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(Quote.created_at <= datetime.combine(date_to, datetime.max.time()))
    if filters['q']:
        like = f"%{filters['q']}%"
        customer_ids = db.session.query(Customer.id).filter(Customer.name.ilike(like))
        query = query.filter(or_(Quote.quote_code.ilike(like), Quote.customer_id.in_(customer_ids)))
    return query

def quotes_redirect(**extra):
    f = quote_filters_from_request()
    f.update(extra)
    return redirect(url_for('quotes', **{k: v for k, v in f.items() if v}))

def create_quote_from_form():
    customer_id = int(request.form['customer_id'])
    vat_rate = parse_int(request.form.get('vat_rate'), 10)
    discount = parse_int(request.form.get('discount'), 0)
    is_draft = request.form.get('save_draft') == '1'
    status = 'Nháp' if is_draft else request.form.get('status', 'Mới tạo') or 'Mới tạo'
    valid_raw = request.form.get('valid_until', '').strip()
    valid_until = datetime.strptime(valid_raw, '%Y-%m-%d').date() if valid_raw else date.today() + timedelta(days=30)
    quote = Quote(
        quote_code=next_code('BG', Quote, 'quote_code'),
        customer_id=customer_id,
        status=status,
        vat_rate=vat_rate,
        discount=discount,
        note=request.form.get('note', ''),
        valid_until=valid_until,
    )
    db.session.add(quote)
    db.session.flush()
    subtotal = 0
    for product_id, qty, price in zip(
        request.form.getlist('product_id'),
        request.form.getlist('qty'),
        request.form.getlist('price'),
    ):
        if not product_id:
            continue
        p = Product.query.get(int(product_id))
        if not p:
            continue
        qv = parse_int(qty, 1)
        pv = parse_int(price, p.retail_price)
        amount = qv * pv
        subtotal += amount
        db.session.add(QuoteItem(
            quote_id=quote.id, product_id=p.id, product_name=p.name, sku=p.sku,
            unit=p.unit, qty=qv, price=pv, amount=amount,
        ))
    quote.subtotal = subtotal
    quote.vat_amount = int(max(subtotal - discount, 0) * vat_rate / 100)
    quote.total = max(subtotal - discount, 0) + quote.vat_amount
    generate_quote_documents(quote, commit=False)
    db.session.commit()
    return quote

DEFAULT_WAREHOUSE = 'Kho chính'
STOCK_IN_METHODS = ['Nhập mua hàng', 'Khách trả hàng', 'Kiểm kê (tăng)', 'Chuyển kho đến', 'Khác']
STOCK_OUT_METHODS = ['Bán hàng', 'Xuất hủy/hỏng', 'Kiểm kê (giảm)', 'Chuyển kho đi', 'Khác']
STOCK_FILTER_METHODS = sorted(set(STOCK_IN_METHODS + STOCK_OUT_METHODS + [
    'Nhập tay', 'Trả hàng', 'Kiểm kê', 'Chuyển kho',  # dữ liệu cũ
]))

def stock_method_default(movement_type):
    return STOCK_IN_METHODS[0] if movement_type == 'IN' else STOCK_OUT_METHODS[0]

def normalize_stock_method(movement_type, method):
    allowed = STOCK_IN_METHODS if movement_type == 'IN' else STOCK_OUT_METHODS
    method = (method or '').strip()
    if method in allowed:
        return method
    legacy_map = {
        'IN': {'Nhập tay': 'Nhập mua hàng', 'Trả hàng': 'Khách trả hàng', 'Kiểm kê': 'Kiểm kê (tăng)', 'Chuyển kho': 'Chuyển kho đến'},
        'OUT': {'Nhập tay': 'Khác', 'Bán hàng': 'Bán hàng', 'Kiểm kê': 'Kiểm kê (giảm)', 'Chuyển kho': 'Chuyển kho đi'},
    }
    return legacy_map.get(movement_type, {}).get(method, stock_method_default(movement_type))

def stock_status(product):
    if product.stock <= 0:
        return 'out', 'Hết hàng'
    if product.stock <= (product.low_stock or 5):
        return 'low', 'Sắp hết hàng'
    return 'ok', 'Còn hàng'

def product_inventory_level(product):
    if product.stock <= 0:
        return 'out', 'Hết hàng'
    if product.stock <= (product.low_stock or 5):
        return 'low', 'Sắp hết'
    return 'ok', 'Còn nhiều'

def product_sale_status(product):
    if not getattr(product, 'is_active', True):
        return 'stopped', 'Ngừng bán'
    if product.stock <= 0:
        return 'out', 'Hết hàng'
    return 'selling', 'Đang bán'

def product_list_status(product):
    if getattr(product, 'is_active', True):
        return 'selling', 'Đang bán'
    return 'stopped', 'Ngừng bán'

def product_barcode(product):
    return product.sku or ''

def product_brand_options():
    rows = db.session.query(Product.brand).filter(Product.brand != '').distinct().order_by(Product.brand).all()
    return [r[0] for r in rows if r[0]]

app.jinja_env.globals['product_inventory_level'] = product_inventory_level
app.jinja_env.globals['product_sale_status'] = product_sale_status
app.jinja_env.globals['product_list_status'] = product_list_status
app.jinja_env.globals['product_barcode'] = product_barcode

app.jinja_env.globals['stock_status'] = stock_status

def parse_stock_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except ValueError:
        return None

def ensure_stock_movement_columns():
    from sqlalchemy import inspect, text
    try:
        cols = {c['name'] for c in inspect(db.engine).get_columns('stock_movement')}
    except Exception:
        return
    with db.engine.begin() as conn:
        if 'method' not in cols:
            conn.execute(text("ALTER TABLE stock_movement ADD COLUMN method VARCHAR(80) DEFAULT 'Nhập tay'"))
        if 'warehouse' not in cols:
            conn.execute(text("ALTER TABLE stock_movement ADD COLUMN warehouse VARCHAR(80) DEFAULT 'Kho chính'"))

def movement_qty_sum(product_id, movement_type, date_from=None, date_to=None, before_date=None):
    q = db.session.query(func.coalesce(func.sum(StockMovement.qty), 0)).filter(
        StockMovement.product_id == product_id,
        StockMovement.movement_type == movement_type,
    )
    if before_date:
        q = q.filter(StockMovement.created_at < datetime.combine(before_date, datetime.min.time()))
    else:
        if date_from:
            q = q.filter(StockMovement.created_at >= datetime.combine(date_from, datetime.min.time()))
        if date_to:
            q = q.filter(StockMovement.created_at <= datetime.combine(date_to, datetime.max.time()))
    return int(q.scalar() or 0)

def product_stock_row(product, date_from=None, date_to=None):
    inbound = movement_qty_sum(product.id, 'IN', date_from, date_to)
    outbound = movement_qty_sum(product.id, 'OUT', date_from, date_to)
    if date_from:
        opening = product.stock - inbound + outbound
    else:
        in_all = movement_qty_sum(product.id, 'IN')
        out_all = movement_qty_sum(product.id, 'OUT')
        opening = max(0, product.stock - in_all + out_all)
    status_key, status_label = stock_status(product)
    return {
        'product': product,
        'opening': opening,
        'inbound': inbound,
        'outbound': outbound,
        'current': product.stock,
        'status_key': status_key,
        'status_label': status_label,
        'warehouse': DEFAULT_WAREHOUSE,
    }

def stock_stats():
    products = Product.query.all()
    return {
        'total_products': len(products),
        'total_qty': sum(p.stock for p in products),
        'available_qty': sum(p.stock for p in products if p.stock > 0),
        'low_stock': Product.query.filter(Product.stock > 0, Product.stock <= Product.low_stock).count(),
        'out_stock': Product.query.filter(Product.stock <= 0).count(),
    }

def product_stats():
    q = Product.query
    return {
        'total': q.count(),
        'selling': q.filter(Product.is_active.is_(True), Product.stock > 0).count(),
        'low_stock': q.filter(
            Product.stock > 0,
            Product.stock <= func.coalesce(Product.low_stock, 5),
        ).count(),
        'out_stock': q.filter(Product.stock <= 0).count(),
    }

def stock_filters_from_request():
    return {
        'product_id': request.args.get('product_id', ''),
        'movement_type': request.args.get('movement_type', ''),
        'method': request.args.get('method', ''),
        'warehouse': request.args.get('warehouse', ''),
        'date_from': request.args.get('date_from', ''),
        'date_to': request.args.get('date_to', ''),
        'q': request.args.get('q', '').strip(),
        'tab': request.args.get('tab', 'inventory'),
        'status': request.args.get('status', ''),
    }

def stock_redirect_after_save(message=None, category='success'):
    if message:
        flash(message, category)
    src = request.form if request.method == 'POST' else request.args
    return redirect(url_for(
        'stock',
        tab=src.get('_tab') or src.get('tab') or 'inventory',
        product_id=src.get('_product_id') or src.get('product_id') or '',
        movement_type=src.get('_movement_type') or src.get('movement_type') or '',
        method=src.get('_method') or src.get('method') or '',
        warehouse=src.get('_warehouse') or src.get('warehouse') or '',
        date_from=src.get('_date_from') or src.get('date_from') or '',
        date_to=src.get('_date_to') or src.get('date_to') or '',
        q=src.get('_q') or src.get('q') or '',
        status=src.get('_status') or src.get('status') or '',
        page=src.get('_page', 1, type=int) or 1,
        per_page=src.get('_per_page', 10, type=int) or 10,
    ))

def next_code(prefix, model, field):
    year = datetime.now().year
    count = model.query.filter(getattr(model, field).like(f'{prefix}-{year}-%')).count() + 1
    return f'{prefix}-{year}-{count:04d}'

def parse_int(value, default=0):
    if value is None or value == '':
        return default
    return int(str(value).replace('.', '').replace(',', '').strip())

def replace_docx_text(doc, mapping):
    def replace_in_paragraph(paragraph):
        full = ''.join(run.text for run in paragraph.runs)
        changed = False
        for k, v in mapping.items():
            if k in full:
                full = full.replace(k, str(v))
                changed = True
        if changed:
            for run in paragraph.runs:
                run.text = ''
            if paragraph.runs:
                paragraph.runs[0].text = full
            else:
                paragraph.add_run(full)
    for p in doc.paragraphs:
        replace_in_paragraph(p)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    replace_in_paragraph(p)

def contract_mapping(customer, code, signed, expired):
    is_company = getattr(customer, 'customer_type', 'company') != 'individual'
    return {
        '{{SO_HOP_DONG}}': code,
        '{{NGAY_KY}}': signed.strftime('%d/%m/%Y'),
        '{{TEN_BEN_A}}': customer.name,
        '{{DAI_DIEN_A}}': customer.representative or (customer.name if not is_company else ''),
        '{{CHUC_VU_A}}': customer.position or ('' if not is_company else ''),
        '{{DIA_CHI_A}}': customer.address,
        '{{DIEN_THOAI_A}}': customer.phone,
        '{{SO_TK_A}}': customer.bank_account,
        '{{NGAN_HANG_A}}': customer.bank_name,
        '{{MST_A}}': customer.tax_code if is_company else (customer.id_card or ''),
        '{{NGAY_HET_HIEU_LUC}}': expired.strftime('%d/%m/%Y') if expired else '',
    }

def ensure_contract_columns():
    from sqlalchemy import inspect, text
    try:
        cols = {c['name'] for c in inspect(db.engine).get_columns('contract')}
    except Exception:
        return
    with db.engine.begin() as conn:
        if 'contract_type' not in cols:
            conn.execute(text("ALTER TABLE contract ADD COLUMN contract_type VARCHAR(20) DEFAULT 'framework'"))
        if 'signed_scan_path' not in cols:
            conn.execute(text("ALTER TABLE contract ADD COLUMN signed_scan_path VARCHAR(255) DEFAULT ''"))
        if 'signed_scan_uploaded_at' not in cols:
            conn.execute(text('ALTER TABLE contract ADD COLUMN signed_scan_uploaded_at DATETIME'))

def delete_contract_scan_file(scan_path):
    if not scan_path:
        return
    file_path = BASE_DIR / 'static' / scan_path
    if file_path.is_file():
        file_path.unlink(missing_ok=True)

def contract_signed_scan_url(scan_path):
    if not scan_path:
        return ''
    return url_for('static', filename=scan_path)

def signed_scan_is_pdf(scan_path):
    return bool(scan_path) and scan_path.lower().endswith('.pdf')

def signed_scan_mimetype(file_path):
    ext = file_path.suffix.lower()
    return {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
    }.get(ext, 'application/octet-stream')

def resolve_customer_signed_scan(cid):
    customer = Customer.query.get_or_404(cid)
    contract = get_framework_contract(customer.id)
    if not contract or not contract.signed_scan_path:
        return customer, contract, None
    file_path = BASE_DIR / 'static' / contract.signed_scan_path
    if not file_path.is_file():
        return customer, contract, None
    return customer, contract, file_path

def save_contract_signed_scan(contract, file_storage):
    if not file_storage or not file_storage.filename:
        flash('Vui lòng chọn file hợp đồng đã ký', 'warning')
        return False
    ext = Path(secure_filename(file_storage.filename)).suffix.lower()
    if ext not in ALLOWED_CONTRACT_SCAN_EXTENSIONS:
        flash('File phải là JPG, PNG, WEBP, PDF', 'warning')
        return False
    data = file_storage.read()
    file_storage.seek(0)
    if len(data) > MAX_CONTRACT_SCAN_BYTES:
        flash('File tối đa 10MB', 'warning')
        return False
    CONTRACT_SIGNED_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    delete_contract_scan_file(contract.signed_scan_path)
    filename = f'{contract.id}_{uuid.uuid4().hex[:10]}{ext}'
    rel_path = f'uploads/contracts/signed/{filename}'
    file_storage.save(CONTRACT_SIGNED_UPLOAD_DIR / filename)
    contract.signed_scan_path = rel_path
    contract.signed_scan_uploaded_at = datetime.utcnow()
    return True

def default_contract_dates():
    signed = date.today()
    expired = date(date.today().year, 12, 31)
    return signed, expired

def save_contract_docx(doc, code):
    file_name = f"{code.replace('/', '-').replace(' ', '_')}.docx"
    out_path = OUTPUT_DIR / 'contracts' / file_name
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out_path)
    return out_path

def _doc_add_center_heading(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

def _doc_add_party_block(doc, title, lines):
    doc.add_paragraph(title)
    for line in lines:
        if line:
            doc.add_paragraph(line)

def _doc_add_quote_items_table(doc, items, include_price=True):
    cols = 6 if include_price else 5
    table = doc.add_table(rows=1, cols=cols)
    table.style = 'Table Grid'
    headers = ['STT', 'Tên hàng hóa', 'ĐVT', 'Số lượng']
    if include_price:
        headers += ['Đơn giá (VNĐ)', 'Thành tiền (VNĐ)']
    else:
        headers.append('Ghi chú')
    for i, label in enumerate(headers):
        table.rows[0].cells[i].text = label
    for idx, item in enumerate(items, start=1):
        cells = table.add_row().cells
        cells[0].text = str(idx)
        cells[1].text = item.product_name or ''
        cells[2].text = item.unit or 'cái'
        cells[3].text = str(item.qty or 0)
        if include_price:
            cells[4].text = money_plain(item.price)
            cells[5].text = money_plain(item.amount)
        else:
            cells[4].text = 'Mới, nguyên đai kiện'
    return table

def quote_customer_party_lines(customer):
    is_company = getattr(customer, 'customer_type', 'company') != 'individual'
    rep = customer.representative or (customer.name if not is_company else '')
    pos = customer.position or ('' if is_company else '')
    mst = customer.tax_code if is_company else (customer.id_card or '')
    lines = [
        f'Tên: {customer.name}',
        f'Đại diện: {rep}' + (f'    Chức vụ: {pos}' if pos else ''),
        f'Địa chỉ: {customer.address or "—"}',
        f'Điện thoại: {customer.phone or "—"}',
    ]
    if customer.bank_account or customer.bank_name:
        lines.append(f'Số TK: {customer.bank_account or "—"}    Ngân hàng: {customer.bank_name or "—"}')
    if mst:
        lines.append(f'{"MST" if is_company else "CCCD"}: {mst}')
    return lines

def quote_seller_party_lines():
    company = get_company_profile()
    lines = [
        f'Tên: {company["name"]}',
        f'Đại diện: {company.get("director_name") or "—"}    Chức vụ: {company.get("director") or "Giám đốc"}',
        f'Địa chỉ: {company.get("address") or "—"}',
        f'Điện thoại: {company.get("phone") or "—"}',
    ]
    if company.get('bank'):
        lines.append(company['bank'])
    if company.get('tax_code'):
        lines.append(f'MST: {company["tax_code"]}')
    return lines

def build_quote_sale_contract_doc(quote):
    customer = quote.customer
    items = list(quote.items)
    signed = quote.created_at.date() if quote.created_at else date.today()
    valid = quote_valid_until(quote)
    subtotal_net = max(quote.subtotal - quote.discount, 0)
    doc = Document()
    _doc_add_center_heading(doc, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', level=2)
    p = doc.add_paragraph('Độc lập - Tự do - Hạnh phúc')
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _doc_add_center_heading(doc, 'HỢP ĐỒNG MUA BÁN HÀNG HÓA', level=1)
    doc.add_paragraph(f'Số hợp đồng: HĐMB/{quote.quote_code}')
    doc.add_paragraph(f'Căn cứ báo giá số {quote.quote_code} ngày {signed.strftime("%d/%m/%Y")}.')
    doc.add_paragraph(f'Hôm nay, ngày {signed.strftime("%d/%m/%Y")}, chúng tôi gồm:')
    _doc_add_party_block(doc, 'BÊN MUA (BÊN A):', quote_customer_party_lines(customer))
    _doc_add_party_block(doc, 'BÊN BÁN (BÊN B):', quote_seller_party_lines())
    doc.add_paragraph('Hai bên thống nhất ký kết hợp đồng mua bán với nội dung sau:')
    doc.add_paragraph('Điều 1. Hàng hóa, số lượng, chất lượng, giá')
    _doc_add_quote_items_table(doc, items, include_price=True)
    doc.add_paragraph(f'Tổng giá trị hàng hóa (chưa VAT): {money(subtotal_net)}')
    doc.add_paragraph(f'VAT ({quote.vat_rate or 0}%): {money(quote.vat_amount)}')
    doc.add_paragraph(f'Tổng giá trị thanh toán: {money(quote.total)}')
    doc.add_paragraph('Điều 2. Thời hạn giao hàng')
    doc.add_paragraph('Bên B giao hàng cho Bên A trong thời gian thỏa thuận sau khi hợp đồng có hiệu lực.')
    doc.add_paragraph('Điều 3. Phương thức thanh toán')
    doc.add_paragraph('Thanh toán theo thỏa thuận giữa hai bên / theo báo giá đính kèm.')
    doc.add_paragraph('Điều 4. Điều khoản chung')
    doc.add_paragraph('Hợp đồng có hiệu lực kể từ ngày ký đến hết ngày ' + valid.strftime('%d/%m/%Y') + '.')
    doc.add_paragraph('Hợp đồng được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.')
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = 'ĐẠI DIỆN BÊN MUA\n\n\n\n(Ký, ghi rõ họ tên)'
    table.rows[0].cells[1].text = 'ĐẠI DIỆN BÊN BÁN\n\n\n\n(Ký, đóng dấu)'
    return doc

def build_quote_handover_doc(quote):
    customer = quote.customer
    items = list(quote.items)
    signed = date.today()
    doc = Document()
    _doc_add_center_heading(doc, 'BIÊN BẢN GIAO NHẬN HÀNG HÓA', level=1)
    doc.add_paragraph(f'Số biên bản: BBGH/{quote.quote_code}')
    doc.add_paragraph(f'Căn cứ báo giá / hợp đồng mua bán liên quan số {quote.quote_code}.')
    doc.add_paragraph(f'Hôm nay, ngày {signed.strftime("%d/%m/%Y")}, tại {customer.address or "địa điểm giao hàng"}, chúng tôi gồm:')
    _doc_add_party_block(doc, 'BÊN GIAO HÀNG (BÊN B):', quote_seller_party_lines())
    _doc_add_party_block(doc, 'BÊN NHẬN HÀNG (BÊN A):', quote_customer_party_lines(customer))
    doc.add_paragraph('Hai bên cùng lập biên bản giao nhận hàng hóa với chi tiết sau:')
    _doc_add_quote_items_table(doc, items, include_price=False)
    doc.add_paragraph('Tình trạng hàng hóa: Mới 100%, nguyên đai kiện, đúng chủng loại và số lượng.')
    doc.add_paragraph('Biên bản này là căn cứ nghiệm thu giao nhận hàng hóa giữa hai bên.')
    doc.add_paragraph('Biên bản được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị như nhau.')
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = 'BÊN GIAO HÀNG (BÊN B)\n\n\n\n(Ký, đóng dấu)'
    table.rows[0].cells[1].text = 'BÊN NHẬN HÀNG (BÊN A)\n\n\n\n(Ký, ghi rõ họ tên)'
    return doc

def save_quote_docx(doc, quote, suffix):
    QUOTE_DOCS_DIR.mkdir(parents=True, exist_ok=True)
    safe_code = quote.quote_code.replace('/', '-').replace(' ', '_')
    out_path = QUOTE_DOCS_DIR / f'{safe_code}_{suffix}.docx'
    doc.save(out_path)
    return out_path

def generate_quote_documents(quote, commit=True):
    sale_doc = build_quote_sale_contract_doc(quote)
    hand_doc = build_quote_handover_doc(quote)
    quote.sale_contract_path = str(save_quote_docx(sale_doc, quote, 'hop-dong-mua-ban'))
    quote.handover_doc_path = str(save_quote_docx(hand_doc, quote, 'bien-ban-nhan-hang'))
    if commit:
        db.session.commit()
    return quote

def ensure_quote_documents(quote):
    sale_ok = quote.sale_contract_path and Path(quote.sale_contract_path).is_file()
    hand_ok = quote.handover_doc_path and Path(quote.handover_doc_path).is_file()
    if not sale_ok or not hand_ok:
        generate_quote_documents(quote, commit=True)
    return quote

def get_framework_contract(customer_id):
    ensure_contract_columns()
    return Contract.query.filter_by(
        customer_id=customer_id,
        contract_type=CONTRACT_TYPE_FRAMEWORK,
    ).order_by(Contract.created_at.desc()).first()

def create_framework_contract_for_customer(customer, commit=True):
    ensure_contract_columns()
    contract = get_framework_contract(customer.id)
    signed, expired = default_contract_dates()
    if contract:
        code = contract.contract_code
        signed = contract.signed_date or signed
        expired = contract.expired_date or expired
    else:
        code = next_code('HD', Contract, 'contract_code')
    doc = build_contract_doc(customer, code, signed, expired)
    out_path = save_contract_docx(doc, code)
    if contract:
        contract.file_path = str(out_path)
        contract.signed_date = signed
        contract.expired_date = expired
    else:
        contract = Contract(
            contract_code=code,
            customer_id=customer.id,
            contract_type=CONTRACT_TYPE_FRAMEWORK,
            signed_date=signed,
            expired_date=expired,
            file_path=str(out_path),
        )
        db.session.add(contract)
    if commit:
        db.session.commit()
    return contract

def customer_transactions(customer_id, limit=50):
    quotes = Quote.query.filter_by(customer_id=customer_id).order_by(Quote.created_at.desc()).limit(limit).all()
    orders = Order.query.filter_by(customer_id=customer_id).order_by(Order.created_at.desc()).limit(limit).all()
    rows = []
    for q in quotes:
        rows.append({
            'kind': 'quote',
            'code': q.quote_code,
            'date': q.created_at,
            'amount': q.total,
            'status': q.status,
            'url': url_for('quote_preview', qid=q.id),
        })
    for o in orders:
        rows.append({
            'kind': 'order',
            'code': o.order_code,
            'date': o.created_at,
            'amount': o.total,
            'status': o.status,
            'url': url_for('order_preview_page', oid=o.id),
        })
    rows.sort(key=lambda r: r['date'] or datetime.min, reverse=True)
    return rows[:limit]

def customer_list_extras(customer_ids):
    ensure_contract_columns()
    if not customer_ids:
        return {}, {}, {}
    contracts = {
        c.customer_id: c
        for c in Contract.query.filter(
            Contract.customer_id.in_(customer_ids),
            Contract.contract_type == CONTRACT_TYPE_FRAMEWORK,
        ).all()
    }
    quotes_map = {}
    for q in Quote.query.filter(Quote.customer_id.in_(customer_ids)).order_by(Quote.created_at.desc()):
        quotes_map.setdefault(q.customer_id, []).append(q)
    orders_map = {}
    for o in Order.query.filter(Order.customer_id.in_(customer_ids)).order_by(Order.created_at.desc()):
        orders_map.setdefault(o.customer_id, []).append(o)
    return contracts, quotes_map, orders_map

def build_contract_doc(customer, code, signed, expired):
    doc = Document(TEMPLATE_DOCX)
    replace_docx_text(doc, contract_mapping(customer, code, signed, expired))
    return doc

def docx_to_preview_html(doc):
    blocks = []
    for p in doc.paragraphs:
        text = p.text
        style = ''
        if p.alignment == WD_ALIGN_PARAGRAPH.CENTER:
            style = ' style="text-align:center"'
        if not text.strip():
            blocks.append('<p class="doc-empty">&nbsp;</p>')
        else:
            blocks.append(f'<p{style}>{escape(text)}</p>')
    for table in doc.tables:
        rows = []
        for row in table.rows:
            cells = ''.join(f'<td>{escape(cell.text)}</td>' for cell in row.cells)
            rows.append(f'<tr>{cells}</tr>')
        blocks.append(f'<table class="doc-table"><tbody>{"".join(rows)}</tbody></table>')
    return '\n'.join(blocks)

def parse_contract_form():
    customer = Customer.query.get_or_404(int(request.form['customer_id']))
    signed = datetime.strptime(request.form.get('signed_date'), '%Y-%m-%d').date()
    expired_raw = request.form.get('expired_date')
    expired = datetime.strptime(expired_raw, '%Y-%m-%d').date() if expired_raw else None
    code = request.form.get('contract_code') or next_code('HD', Contract, 'contract_code')
    quote_id = request.form.get('quote_id') or None
    return customer, code, signed, expired, quote_id

@app.route('/company', methods=['GET', 'POST'])
def company_settings():
    row = ensure_company_profile()
    if request.method == 'POST':
        row.name = request.form.get('name', '').strip()
        if not row.name:
            flash('Vui lòng nhập tên công ty', 'warning')
            return redirect(url_for('company_settings'))
        row.short_name = request.form.get('short_name', '').strip()
        row.tax_code = request.form.get('tax_code', '').strip()
        row.address = request.form.get('address', '').strip()
        row.phone = request.form.get('phone', '').strip()
        row.email = request.form.get('email', '').strip()
        row.bank_account = request.form.get('bank_account', '').strip()
        row.bank_name = request.form.get('bank_name', '').strip()
        row.director_name = request.form.get('director_name', '').strip()
        row.director_title = request.form.get('director_title', '').strip() or 'Giám đốc'
        if request.form.get('remove_logo') == '1' and row.logo_path:
            old = BASE_DIR / 'static' / row.logo_path
            if old.exists():
                old.unlink(missing_ok=True)
            row.logo_path = ''
        if not save_company_logo(row, request.files.get('logo')):
            return redirect(url_for('company_settings'))
        row.updated_at = datetime.utcnow()
        db.session.commit()
        flash('Đã lưu thông tin công ty', 'success')
        return redirect(url_for('company_settings'))
    profile = company_profile_to_dict(row)
    banks = fetch_vietqr_banks()
    return render_template(
        'company.html',
        profile=profile,
        row=row,
        banks=banks,
        bank_value_set=bank_value_set(banks),
    )

@app.route('/')
def dashboard():
    stats = {
        'customers': Customer.query.count(),
        'products': Product.query.count(),
        'quotes': Quote.query.count(),
        'orders': Order.query.count(),
        'debt': sum(max(o.total - o.paid_amount, 0) for o in Order.query.all()),
        'low_stock': Product.query.filter(Product.stock <= Product.low_stock).count(),
    }
    latest_quotes = Quote.query.order_by(Quote.created_at.desc()).limit(5).all()
    latest_orders = Order.query.order_by(Order.created_at.desc()).limit(5).all()
    return render_template('dashboard.html', stats=stats, latest_quotes=latest_quotes, latest_orders=latest_orders)

CUSTOMER_SORT_FIELDS = {'name', 'tax_code', 'representative', 'phone', 'address', 'created_at', 'customer_type'}

def ensure_customer_columns():
    from sqlalchemy import inspect, text
    try:
        cols = {c['name'] for c in inspect(db.engine).get_columns('customer')}
    except Exception:
        return
    with db.engine.begin() as conn:
        if 'customer_type' not in cols:
            conn.execute(text("ALTER TABLE customer ADD COLUMN customer_type VARCHAR(20) DEFAULT 'company'"))
        if 'id_card' not in cols:
            conn.execute(text("ALTER TABLE customer ADD COLUMN id_card VARCHAR(32) DEFAULT ''"))

def parse_customer_type():
    t = request.form.get('customer_type', 'company').strip()
    return t if t in ('company', 'individual') else 'company'

def customer_is_company(customer):
    return getattr(customer, 'customer_type', 'company') != 'individual'

def customer_type_label(customer):
    return 'Cá nhân' if getattr(customer, 'customer_type', '') == 'individual' else 'Công ty'

app.jinja_env.globals['customer_is_company'] = customer_is_company
app.jinja_env.globals['customer_type_label'] = customer_type_label
app.jinja_env.globals['contract_signed_scan_url'] = contract_signed_scan_url
app.jinja_env.globals['signed_scan_is_pdf'] = signed_scan_is_pdf
VIETQR_BANKS_URL = 'https://api.vietqr.io/v2/banks'
BANKS_CACHE = {'at': 0, 'data': []}
BANKS_CACHE_TTL = 86400

def fetch_vietqr_banks():
    now = time.time()
    if BANKS_CACHE['data'] and now - BANKS_CACHE['at'] < BANKS_CACHE_TTL:
        return BANKS_CACHE['data']
    try:
        with urlopen(VIETQR_BANKS_URL, timeout=15) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
        if payload.get('code') == '00':
            banks = sorted(payload.get('data', []), key=lambda b: (b.get('shortName') or '').lower())
            BANKS_CACHE['data'] = banks
            BANKS_CACHE['at'] = now
            return banks
    except Exception:
        pass
    return BANKS_CACHE['data']

def bank_value_set(banks):
    values = set()
    for bank in banks:
        if bank.get('name'):
            values.add(bank['name'])
        if bank.get('shortName'):
            values.add(bank['shortName'])
    return values

def customer_list_params():
    q = request.args.get('q', '').strip()
    per_page = request.args.get('per_page', 10, type=int)
    per_page = per_page if per_page in (10, 25, 50, 100) else 10
    page = request.args.get('page', 1, type=int)
    sort = request.args.get('sort', 'created_at')
    sort = sort if sort in CUSTOMER_SORT_FIELDS else 'created_at'
    order = 'asc' if request.args.get('order') == 'asc' else 'desc'
    return q, per_page, page, sort, order

def customer_sort_url(field, q, per_page, sort, order):
    next_order = 'desc' if sort == field and order == 'asc' else 'asc'
    if sort != field:
        next_order = 'asc'
    return url_for('customers', q=q, sort=field, order=next_order, per_page=per_page, page=1)

def validate_customer_form():
    ctype = parse_customer_type()
    name = request.form.get('name', '').strip()
    if not name:
        return False, 'Vui lòng nhập tên khách hàng'
    if ctype == 'company':
        if not request.form.get('tax_code', '').strip():
            return False, 'Vui lòng nhập mã số thuế'
    elif not request.form.get('phone', '').strip():
        return False, 'Vui lòng nhập số điện thoại'
    return True, ''

def apply_customer_form(customer):
    ctype = parse_customer_type()
    customer.customer_type = ctype
    customer.name = request.form.get('name', '').strip()
    customer.address = request.form.get('address', '').strip()
    customer.phone = request.form.get('phone', '').strip()
    customer.email = request.form.get('email', '').strip()
    customer.bank_account = request.form.get('bank_account', '').strip()
    customer.bank_name = request.form.get('bank_name', '').strip()
    customer.note = request.form.get('note', '').strip()
    if ctype == 'company':
        customer.tax_code = request.form.get('tax_code', '').strip()
        customer.representative = request.form.get('representative', '').strip()
        customer.position = request.form.get('position', '').strip()
        customer.id_card = ''
    else:
        customer.id_card = request.form.get('id_card', '').strip()
        customer.tax_code = ''
        customer.representative = ''
        customer.position = ''

def customers_redirect_after_save(message=None, category='success'):
    if message:
        flash(message, category)
    return redirect(url_for(
        'customers',
        q=request.form.get('_q', ''),
        page=request.form.get('_page', 1, type=int) or 1,
        per_page=request.form.get('_per_page', 10, type=int) or 10,
        sort=request.form.get('_sort', 'created_at'),
        order=request.form.get('_order', 'desc'),
    ))

@app.route('/customers', methods=['GET', 'POST'])
def customers():
    ensure_customer_columns()
    ensure_contract_columns()
    if request.method == 'POST':
        ok, msg = validate_customer_form()
        if not ok:
            flash(msg, 'warning')
            return redirect(url_for('customers'))
        c = Customer()
        apply_customer_form(c)
        db.session.add(c)
        db.session.flush()
        create_framework_contract_for_customer(c, commit=False)
        db.session.commit()
        return customers_redirect_after_save('Đã thêm khách hàng và hợp đồng nguyên tắc')
    q, per_page, page, sort, order = customer_list_params()
    query = Customer.query
    if q:
        like = f'%{q}%'
        query = query.filter(or_(
            Customer.name.ilike(like),
            Customer.tax_code.ilike(like),
            Customer.phone.ilike(like),
            Customer.id_card.ilike(like),
        ))
    sort_col = getattr(Customer, sort)
    query = query.order_by(sort_col.asc() if order == 'asc' else sort_col.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    customer_ids = [c.id for c in pagination.items]
    framework_contracts, customer_quotes, customer_orders = customer_list_extras(customer_ids)
    banks = fetch_vietqr_banks()
    list_args = {'q': q, 'per_page': per_page, 'sort': sort, 'order': order}
    return render_template(
        'customers.html',
        pagination=pagination,
        customers=pagination.items,
        framework_contracts=framework_contracts,
        customer_quotes=customer_quotes,
        customer_orders=customer_orders,
        q=q,
        per_page=per_page,
        sort=sort,
        order=order,
        list_args=list_args,
        banks=banks,
        bank_value_set=bank_value_set(banks),
        sort_url=lambda field: customer_sort_url(field, q, per_page, sort, order),
    )

@app.route('/customers/<int:cid>/update', methods=['POST'])
def update_customer(cid):
    ensure_customer_columns()
    c = Customer.query.get_or_404(cid)
    ok, msg = validate_customer_form()
    if not ok:
        flash(msg, 'warning')
        return customers_redirect_after_save('')
    apply_customer_form(c)
    create_framework_contract_for_customer(c, commit=False)
    db.session.commit()
    return customers_redirect_after_save('Đã cập nhật khách hàng')

@app.route('/customers/<int:cid>/contract/preview')
def preview_customer_framework_contract(cid):
    customer = Customer.query.get_or_404(cid)
    contract = get_framework_contract(customer.id) or create_framework_contract_for_customer(customer)
    if not contract.file_path or not Path(contract.file_path).exists():
        create_framework_contract_for_customer(customer)
        contract = get_framework_contract(customer.id)
    doc = Document(contract.file_path)
    return render_template(
        'contract_preview.html',
        contract_code=contract.contract_code,
        customer_name=customer.name,
        preview_html=docx_to_preview_html(doc),
        download_url=url_for('download_customer_framework_contract', cid=customer.id),
        is_draft=False,
        back_url=url_for('customers'),
    )

@app.route('/customers/<int:cid>/contract/download')
def download_customer_framework_contract(cid):
    customer = Customer.query.get_or_404(cid)
    contract = get_framework_contract(customer.id) or create_framework_contract_for_customer(customer)
    if not contract.file_path or not Path(contract.file_path).exists():
        flash('Không tìm thấy file hợp đồng', 'danger')
        return redirect(url_for('customers'))
    return send_file(contract.file_path, as_attachment=True, download_name=Path(contract.file_path).name)

def customers_list_redirect(message=None, category='success', hub_id=None, hub_tab=None):
    if message:
        flash(message, category)
    src = request.form if request.method == 'POST' else request.args
    extra = {}
    hid = hub_id if hub_id is not None else src.get('_hub', type=int) or None
    htab = hub_tab if hub_tab is not None else src.get('_hub_tab', '')
    if hid:
        extra['hub'] = hid
    if htab:
        extra['hub_tab'] = htab
    return redirect(url_for(
        'customers',
        q=src.get('_q', ''),
        page=src.get('_page', 1, type=int) or 1,
        per_page=src.get('_per_page', 10, type=int) or 10,
        sort=src.get('_sort', 'created_at'),
        order=src.get('_order', 'desc'),
        **extra,
    ))

@app.route('/customers/<int:cid>/contract/signed-upload', methods=['POST'])
def upload_customer_signed_contract(cid):
    ensure_contract_columns()
    customer = Customer.query.get_or_404(cid)
    contract = get_framework_contract(customer.id) or create_framework_contract_for_customer(customer)
    if save_contract_signed_scan(contract, request.files.get('signed_scan')):
        db.session.commit()
        return customers_list_redirect('Đã tải lên hợp đồng đã ký', hub_id=cid, hub_tab='contract')
    db.session.rollback()
    return customers_list_redirect('', 'warning')

@app.route('/customers/<int:cid>/contract/signed')
def view_customer_signed_contract(cid):
    ensure_contract_columns()
    customer, contract, file_path = resolve_customer_signed_scan(cid)
    if not file_path:
        flash('Chưa có file hợp đồng đã ký hoặc file không tồn tại', 'warning')
        return redirect(url_for('customers'))
    return send_file(
        file_path,
        mimetype=signed_scan_mimetype(file_path),
        as_attachment=False,
        download_name=file_path.name,
    )

@app.route('/customers/<int:cid>/contract/signed/preview')
def preview_customer_signed_contract(cid):
    ensure_contract_columns()
    customer, contract, file_path = resolve_customer_signed_scan(cid)
    if not file_path:
        flash('Chưa có file hợp đồng đã ký hoặc file không tồn tại', 'warning')
        return redirect(url_for('customers'))
    return render_template(
        'signed_scan_preview.html',
        customer=customer,
        contract=contract,
        is_pdf=signed_scan_is_pdf(contract.signed_scan_path),
        view_url=url_for('view_customer_signed_contract', cid=cid),
        download_url=url_for('download_customer_signed_contract', cid=cid),
        back_url=url_for('customers', hub=cid, hub_tab='contract'),
    )

@app.route('/customers/<int:cid>/contract/signed-download')
def download_customer_signed_contract(cid):
    ensure_contract_columns()
    customer, contract, file_path = resolve_customer_signed_scan(cid)
    if not file_path:
        flash('Chưa có file hợp đồng đã ký hoặc file không tồn tại', 'warning')
        return redirect(url_for('customers'))
    return send_file(file_path, as_attachment=True, download_name=file_path.name)

@app.route('/customers/<int:cid>/contract/signed-delete', methods=['POST'])
def delete_customer_signed_contract(cid):
    ensure_contract_columns()
    customer = Customer.query.get_or_404(cid)
    contract = get_framework_contract(customer.id)
    if contract and contract.signed_scan_path:
        delete_contract_scan_file(contract.signed_scan_path)
        contract.signed_scan_path = ''
        contract.signed_scan_uploaded_at = None
        db.session.commit()
        return customers_list_redirect('Đã xóa file hợp đồng đã ký', 'warning')
    return customers_list_redirect()

def product_filters_from_request():
    return {
        'category': request.args.get('category', '').strip(),
        'brand': request.args.get('brand', '').strip(),
        'status': request.args.get('status', '').strip(),
        'q': request.args.get('q', '').strip(),
    }

def apply_product_filters(query, filters):
    q = filters.get('q', '')
    if q:
        like = f'%{q}%'
        query = query.filter(or_(
            Product.name.ilike(like),
            Product.sku.ilike(like),
            Product.category.ilike(like),
            Product.brand.ilike(like),
            Product.model.ilike(like),
        ))
    if filters.get('category'):
        query = query.filter(Product.category == filters['category'])
    if filters.get('brand'):
        query = query.filter(Product.brand == filters['brand'])
    st = filters.get('status', '')
    if st == 'selling':
        query = query.filter(Product.is_active.is_(True))
    elif st == 'low':
        query = query.filter(
            Product.stock > 0,
            Product.stock <= func.coalesce(Product.low_stock, 5),
        )
    elif st == 'out':
        query = query.filter(Product.stock <= 0)
    elif st == 'stopped':
        query = query.filter(or_(Product.is_active.is_(False), Product.is_active == 0))
    return query

def products_redirect_after_save(message=None, category='success'):
    if message:
        flash(message, category)
    return redirect(url_for(
        'products',
        q=request.form.get('_q', ''),
        page=request.form.get('_page', 1, type=int) or 1,
        per_page=request.form.get('_per_page', 10, type=int) or 10,
        category=request.form.get('_category', ''),
        brand=request.form.get('_brand', ''),
        status=request.form.get('_status', ''),
    ))

PRICE_TYPE_LABELS = {
    'retail_price': 'Giá bán lẻ',
    'project_price': 'Giá dự án',
    'dealer_price': 'Giá đại lý',
    'cost_price': 'Giá nhập',
}

def price_type_label(key):
    return PRICE_TYPE_LABELS.get(key, key)

app.jinja_env.globals['price_type_label'] = price_type_label

def apply_product_form(product):
    product.name = request.form.get('name', '').strip()
    product.category = request.form.get('category', '')
    product.brand = request.form.get('brand', '')
    product.model = request.form.get('model', '')
    product.variant = request.form.get('variant', '')
    product.unit = request.form.get('unit', 'cái') or 'cái'
    product.warranty = request.form.get('warranty', '')
    product.cost_price = parse_int(request.form.get('cost_price'))
    product.retail_price = parse_int(request.form.get('retail_price'))
    product.dealer_price = parse_int(request.form.get('dealer_price'))
    product.project_price = parse_int(request.form.get('project_price'))
    product.stock = parse_int(request.form.get('stock'))
    product.low_stock = parse_int(request.form.get('low_stock'), product.low_stock or 5)

def category_product_counts():
    counts = {}
    for cat in Category.query.all():
        counts[cat.id] = Product.query.filter_by(category=cat.name).count()
    return counts

@app.route('/categories', methods=['POST'])
def create_category():
    name = request.form.get('name', '').strip()
    if not name:
        flash('Vui lòng nhập tên danh mục', 'warning')
    elif Category.query.filter_by(name=name).first():
        flash('Danh mục đã tồn tại', 'danger')
    else:
        db.session.add(Category(name=name))
        db.session.commit()
        flash('Đã tạo danh mục', 'success')
    return redirect(request.referrer or url_for('products'))

@app.route('/categories/<int:cid>/delete', methods=['POST'])
def delete_category(cid):
    cat = Category.query.get_or_404(cid)
    name = cat.name
    affected = Product.query.filter_by(category=name).update({Product.category: ''})
    db.session.delete(cat)
    db.session.commit()
    if affected:
        flash(f'Đã xóa danh mục "{name}". {affected} sản phẩm đã được bỏ danh mục.', 'warning')
    else:
        flash(f'Đã xóa danh mục "{name}"', 'warning')
    return redirect(request.referrer or url_for('products'))

@app.route('/products', methods=['GET', 'POST'])
def products():
    ensure_product_image_column()
    if request.method == 'POST':
        sku = request.form.get('sku', '').strip()
        name = request.form.get('name', '').strip()
        if not sku or not name:
            flash('Vui lòng nhập SKU và tên sản phẩm', 'warning')
            return redirect(url_for('products'))
        if Product.query.filter_by(sku=sku).first():
            flash('SKU đã tồn tại', 'danger')
            return redirect(url_for('products'))
        p = Product(
            sku=sku, name=name, category=request.form.get('category', ''), brand=request.form.get('brand', ''),
            warranty=request.form.get('warranty', ''),
            cost_price=parse_int(request.form.get('cost_price')),
            retail_price=parse_int(request.form.get('retail_price')),
            project_price=parse_int(request.form.get('project_price')),
            stock=parse_int(request.form.get('stock')),
        )
        db.session.add(p)
        db.session.flush()
        if not save_product_image(p, request.files.get('image')):
            db.session.rollback()
            return redirect(url_for('products'))
        db.session.commit()
        flash('Đã thêm sản phẩm', 'success')
        return redirect(url_for('products'))
    filters = product_filters_from_request()
    per_page = request.args.get('per_page', 10, type=int)
    per_page = per_page if per_page in (10, 25, 50, 100) else 10
    page = request.args.get('page', 1, type=int)
    query = apply_product_filters(Product.query, filters)
    pagination = query.order_by(Product.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    categories = Category.query.order_by(Category.name).all()
    if not categories:
        for cat_name in ['Camera', 'Điện thoại', 'Laptop', 'Phụ kiện', 'Âm thanh', 'Thiết bị thông minh']:
            db.session.add(Category(name=cat_name))
        db.session.commit()
        categories = Category.query.order_by(Category.name).all()
    list_args = {k: v for k, v in filters.items() if v}
    list_args['per_page'] = per_page
    export_args = {k: v for k, v in list_args.items() if k != 'page'}
    price_histories = {}
    if pagination.items:
        ids = [p.id for p in pagination.items]
        for h in PriceHistory.query.filter(PriceHistory.product_id.in_(ids)).order_by(PriceHistory.created_at.desc()).all():
            price_histories.setdefault(h.product_id, []).append(h)
    return render_template(
        'products.html',
        pagination=pagination,
        products=pagination.items,
        categories=categories,
        category_counts=category_product_counts(),
        filters=filters,
        per_page=per_page,
        list_args=list_args,
        export_args=export_args,
        brands=product_brand_options(),
        price_histories=price_histories,
        stock_in_methods=STOCK_IN_METHODS,
        stock_out_methods=STOCK_OUT_METHODS,
    )

@app.route('/products/<int:pid>/update', methods=['POST'])
def update_product(pid):
    ensure_product_image_column()
    p = Product.query.get_or_404(pid)
    sku = request.form.get('sku', '').strip()
    name = request.form.get('name', '').strip()
    if not sku or not name:
        flash('Vui lòng nhập SKU và tên sản phẩm', 'warning')
        return products_redirect_after_save()
    if Product.query.filter(Product.sku == sku, Product.id != pid).first():
        flash('SKU đã tồn tại', 'danger')
        return products_redirect_after_save()
    p.sku = sku
    apply_product_form(p)
    if request.form.get('remove_image') == '1':
        delete_product_image_file(p.image_path)
        p.image_path = ''
    if not save_product_image(p, request.files.get('image')):
        return products_redirect_after_save()
    db.session.commit()
    return products_redirect_after_save('Đã cập nhật sản phẩm')

@app.route('/products/<int:pid>/price', methods=['POST'])
def update_price(pid):
    p = Product.query.get_or_404(pid)
    for field in ('retail_price', 'project_price'):
        old = getattr(p, field)
        new = parse_int(request.form.get(field), old)
        if new != old:
            db.session.add(PriceHistory(product_id=p.id, price_type=field, old_price=old, new_price=new, note=''))
            setattr(p, field, new)
    db.session.commit()
    return products_redirect_after_save('Đã cập nhật giá')

@app.route('/products/export')
def products_export():
    ensure_product_columns()
    filters = product_filters_from_request()
    query = apply_product_filters(Product.query, filters).order_by(Product.created_at.desc())
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['SKU', 'Tên sản phẩm', 'Danh mục', 'Thương hiệu', 'Tồn kho', 'Giá bán lẻ', 'Giá dự án', 'Trạng thái'])
    for p in query.all():
        sale_key, sale_label = product_sale_status(p)
        writer.writerow([
            p.sku,
            p.name,
            p.category or '',
            p.brand or '',
            p.stock,
            p.retail_price,
            p.project_price,
            sale_label,
        ])
    return Response(
        '\ufeff' + buf.getvalue(),
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename=san-pham.csv'},
    )

@app.route('/products/<int:pid>/toggle-active', methods=['POST'])
def toggle_product_active(pid):
    ensure_product_columns()
    p = Product.query.get_or_404(pid)
    p.is_active = not bool(p.is_active)
    db.session.commit()
    label = 'Đang bán' if p.is_active else 'Ngừng bán'
    return products_redirect_after_save(f'Đã chuyển sang trạng thái: {label}')

@app.route('/products/<int:pid>/stock', methods=['POST'])
def adjust_product_stock(pid):
    ensure_stock_movement_columns()
    p = Product.query.get_or_404(pid)
    qty = max(parse_int(request.form.get('qty')), 0)
    mtype = request.form.get('movement_type', 'IN')
    if qty <= 0:
        return products_redirect_after_save('Số lượng phải lớn hơn 0', 'warning')
    if mtype == 'OUT' and p.stock < qty:
        return products_redirect_after_save('Tồn kho không đủ để xuất', 'danger')
    if mtype == 'IN':
        p.stock += qty
    else:
        p.stock -= qty
    db.session.add(StockMovement(
        product_id=p.id,
        movement_type=mtype,
        qty=qty,
        ref_code=request.form.get('ref_code', '').strip(),
        method=normalize_stock_method(mtype, request.form.get('method')),
        warehouse=DEFAULT_WAREHOUSE,
        note=request.form.get('note', '').strip(),
    ))
    db.session.commit()
    label = 'nhập' if mtype == 'IN' else 'xuất'
    return products_redirect_after_save(f'Đã {label} kho thành công')

@app.route('/quotes', methods=['GET', 'POST'])
def quotes():
    ensure_quote_columns()
    normalize_quote_statuses()
    if request.method == 'POST':
        try:
            quote = create_quote_from_form()
        except (ValueError, KeyError):
            flash('Vui lòng kiểm tra lại thông tin báo giá', 'warning')
            return redirect(url_for('quotes', tab='list'))
        flash('Đã lưu nháp báo giá' if quote.status == 'Nháp' else 'Đã tạo báo giá',
              'secondary' if quote.status == 'Nháp' else 'success')
        return redirect(url_for('quotes', tab='draft' if quote.status == 'Nháp' else 'list'))

    filters = quote_filters_from_request()
    per_page = request.args.get('per_page', 10, type=int)
    per_page = per_page if per_page in (10, 25, 50) else 10
    page = request.args.get('page', 1, type=int)

    query = Quote.query
    if filters['tab'] == 'draft':
        query = query.filter(Quote.status == 'Nháp')
    else:
        query = query.filter(Quote.status != 'Nháp')
    query = apply_quote_filters(query, filters)

    stats_query = Quote.query.filter(Quote.status != 'Nháp')
    query = apply_quote_sort(query, filters['sort'], filters['order'])
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    orders_by_quote = orders_by_quote_ids([q.id for q in pagination.items])

    list_args = {k: v for k, v in filters.items() if v and k != 'tab'}
    list_args['per_page'] = per_page
    list_args_list = {**list_args, 'tab': 'list'}
    list_args_draft = {**list_args, 'tab': 'draft'}
    export_args = {k: v for k, v in list_args.items()}
    list_args_tab = {**list_args, 'tab': filters['tab']}

    return render_template(
        'quotes.html',
        quotes=pagination.items,
        orders_by_quote=orders_by_quote,
        pagination=pagination,
        stats=quote_stats(stats_query),
        filters=filters,
        list_args=list_args_tab,
        list_args_list=list_args_list,
        list_args_draft=list_args_draft,
        export_args=export_args,
        per_page=per_page,
        sort=filters['sort'],
        order=filters['order'],
        customers=Customer.query.order_by(Customer.name).all(),
        products=Product.query.order_by(Product.name).all(),
        quote_catalog=quote_product_catalog(Product.query.order_by(Product.name).all()),
        quote_filter_statuses=QUOTE_FILTER_STATUSES,
        quote_edit_statuses=QUOTE_FILTER_STATUSES,
        default_valid=(date.today() + timedelta(days=30)).isoformat(),
    )

@app.route('/quotes/export')
def quotes_export():
    ensure_quote_columns()
    normalize_quote_statuses()
    filters = quote_filters_from_request()
    query = Quote.query.filter(Quote.status != 'Nháp')
    query = apply_quote_filters(query, filters)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['Mã báo giá', 'Khách hàng', 'Ngày tạo', 'Hiệu lực đến', 'Tổng tiền', 'Trạng thái'])
    for q in query.order_by(Quote.created_at.desc()).all():
        writer.writerow([
            q.quote_code,
            q.customer.name,
            q.created_at.strftime('%d/%m/%Y') if q.created_at else '',
            quote_valid_until(q).strftime('%d/%m/%Y'),
            q.total,
            quote_display_status(q),
        ])
    return Response(
        '\ufeff' + buf.getvalue(),
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename=bao-gia.csv'},
    )

@app.route('/quotes/<int:qid>/status', methods=['POST'])
def update_quote_status(qid):
    ensure_quote_columns()
    normalize_quote_statuses()
    quote = Quote.query.get_or_404(qid)
    new_status = request.form.get('status', '').strip()
    current = quote_display_status(quote)
    allowed = {
        'Nháp': {'Mới tạo'},
        'Mới tạo': {'Đã chốt', 'Đã hủy'},
    }
    if new_status in QUOTE_STATUSES and new_status in allowed.get(current, set()):
        if new_status == 'Đã chốt':
            order, created = chot_quote(quote)
            db.session.commit()
            if created:
                flash(f'Đã chốt báo giá và tạo đơn hàng {order.order_code}', 'success')
            else:
                flash(f'Đã chốt báo giá (đơn hàng {order.order_code})', 'success')
        else:
            quote.status = new_status
            db.session.commit()
            flash_status_updated(new_status)
    elif new_status in QUOTE_STATUSES:
        flash('Không thể chuyển trạng thái báo giá theo hướng này', 'warning')
    return quotes_redirect(tab=request.form.get('_tab', 'list'))

@app.route('/quotes/<int:qid>/update', methods=['POST'])
def update_quote(qid):
    ensure_quote_columns()
    quote = Quote.query.get_or_404(qid)
    quote.customer_id = int(request.form['customer_id'])
    quote.vat_rate = parse_int(request.form.get('vat_rate'), 10)
    quote.discount = parse_int(request.form.get('discount'), 0)
    quote.note = request.form.get('note', '').strip()
    valid_raw = request.form.get('valid_until', '').strip()
    if valid_raw:
        quote.valid_until = datetime.strptime(valid_raw, '%Y-%m-%d').date()
    new_status = request.form.get('status', '').strip()
    old_status = quote_display_status(quote)
    if new_status in QUOTE_STATUSES:
        if new_status == 'Đã chốt' and old_status != 'Đã chốt':
            chot_quote(quote)
        elif new_status != 'Đã chốt':
            quote.status = new_status
    recalculate_quote_totals(quote)
    generate_quote_documents(quote, commit=False)
    db.session.commit()
    flash('Đã cập nhật báo giá', 'success')
    return quotes_redirect(tab=request.form.get('_tab', 'list'))

def _quote_doc_preview_response(quote, file_path, doc_title, download_endpoint):
    if not file_path or not Path(file_path).is_file():
        flash('Không tìm thấy file tài liệu', 'danger')
        return redirect(url_for('quote_preview', qid=quote.id))
    doc = Document(file_path)
    return render_template(
        'contract_preview.html',
        contract_code=doc_title,
        customer_name=quote.customer.name,
        preview_html=docx_to_preview_html(doc),
        download_url=url_for(download_endpoint, qid=quote.id),
        back_url=url_for('quote_preview', qid=quote.id),
    )

@app.route('/quotes/<int:qid>/sale-contract/preview')
def preview_quote_sale_contract(qid):
    ensure_quote_columns()
    quote = ensure_quote_documents(Quote.query.get_or_404(qid))
    return _quote_doc_preview_response(
        quote, quote.sale_contract_path,
        f'HĐMB/{quote.quote_code}',
        'download_quote_sale_contract',
    )

@app.route('/quotes/<int:qid>/sale-contract/download')
def download_quote_sale_contract(qid):
    ensure_quote_columns()
    quote = ensure_quote_documents(Quote.query.get_or_404(qid))
    if not quote.sale_contract_path or not Path(quote.sale_contract_path).is_file():
        flash('Không tìm thấy hợp đồng mua bán', 'danger')
        return redirect(url_for('quote_preview', qid=qid))
    return send_file(quote.sale_contract_path, as_attachment=True, download_name=Path(quote.sale_contract_path).name)

@app.route('/quotes/<int:qid>/handover/preview')
def preview_quote_handover(qid):
    ensure_quote_columns()
    quote = ensure_quote_documents(Quote.query.get_or_404(qid))
    return _quote_doc_preview_response(
        quote, quote.handover_doc_path,
        f'BBGH/{quote.quote_code}',
        'download_quote_handover',
    )

@app.route('/quotes/<int:qid>/handover/download')
def download_quote_handover(qid):
    ensure_quote_columns()
    quote = ensure_quote_documents(Quote.query.get_or_404(qid))
    if not quote.handover_doc_path or not Path(quote.handover_doc_path).is_file():
        flash('Không tìm thấy biên bản nhận hàng', 'danger')
        return redirect(url_for('quote_preview', qid=qid))
    return send_file(quote.handover_doc_path, as_attachment=True, download_name=Path(quote.handover_doc_path).name)

@app.route('/quotes/<int:qid>/preview')
def quote_preview(qid):
    ensure_quote_columns()
    quote = ensure_quote_documents(Quote.query.get_or_404(qid))
    return render_template(
        'quote_preview_page.html',
        quote=quote,
        valid_until=quote_valid_until(quote),
        status=quote_display_status(quote),
        expired=quote_is_expired(quote),
        linked_order=get_quote_order(quote),
    )

@app.route('/quotes/<int:qid>/print')
def quote_print(qid):
    ensure_quote_columns()
    quote = Quote.query.get_or_404(qid)
    return render_template(
        'quote_print.html',
        quote=quote,
        valid_until=quote_valid_until(quote),
    )

@app.route('/quotes/<int:qid>/order')
def create_order_from_quote(qid):
    ensure_quote_columns()
    normalize_quote_statuses()
    quote = Quote.query.get_or_404(qid)
    existing = get_quote_order(quote)
    if existing:
        flash(f'Báo giá đã có đơn hàng {existing.order_code}', 'info')
        return redirect(url_for('order_preview', oid=existing.id))
    if quote_display_status(quote) != 'Đã chốt':
        flash('Vui lòng chốt báo giá trước khi tạo đơn hàng', 'warning')
        return redirect(url_for('quotes'))
    order, _ = create_order_from_quote_record(quote)
    db.session.commit()
    flash(f'Đã tạo đơn hàng {order.order_code}', 'success')
    return redirect(url_for('order_preview', oid=order.id))

@app.route('/contracts', methods=['GET', 'POST'])
def contracts():
    return redirect(url_for('customers'))

@app.route('/contracts/preview', methods=['POST'])
def preview_contract_draft():
    customer, code, signed, expired, _ = parse_contract_form()
    doc = build_contract_doc(customer, code, signed, expired)
    return render_template(
        'contract_preview.html',
        contract_code=code,
        customer_name=customer.name,
        preview_html=docx_to_preview_html(doc),
        download_url=None,
        is_draft=True,
        back_url=url_for('customers'),
    )

@app.route('/contracts/<int:cid>/preview')
def preview_contract(cid):
    c = Contract.query.get_or_404(cid)
    if not c.file_path or not Path(c.file_path).exists():
        flash('Không tìm thấy file hợp đồng', 'danger')
        return redirect(url_for('customers'))
    doc = Document(c.file_path)
    return render_template(
        'contract_preview.html',
        contract_code=c.contract_code,
        customer_name=c.customer.name,
        preview_html=docx_to_preview_html(doc),
        download_url=url_for('download_contract', cid=c.id),
        is_draft=False,
        back_url=url_for('customers'),
    )

@app.route('/download/contract/<int:cid>')
def download_contract(cid):
    c = Contract.query.get_or_404(cid)
    return send_file(c.file_path, as_attachment=True)

@app.route('/orders', methods=['GET', 'POST'])
def orders():
    if request.method == 'POST':
        customer_id = int(request.form['customer_id'])
        total = parse_int(request.form.get('total'))
        status = request.form.get('status', 'Chờ xác nhận').strip() or 'Chờ xác nhận'
        if status not in ORDER_STATUSES:
            status = 'Chờ xác nhận'
        order = Order(
            order_code=next_code('DH', Order, 'order_code'),
            customer_id=customer_id,
            total=total,
            status=status,
        )
        db.session.add(order)
        db.session.commit()
        flash('Đã tạo đơn hàng', 'success')
        return orders_redirect()

    filters = order_filters_from_request()
    per_page = request.args.get('per_page', 10, type=int)
    per_page = per_page if per_page in (10, 25, 50) else 10
    page = request.args.get('page', 1, type=int)

    query = apply_order_filters(Order.query, filters)
    pagination = query.order_by(Order.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)

    list_args = {k: v for k, v in filters.items() if v}
    list_args['per_page'] = per_page
    export_args = {k: v for k, v in filters.items() if v}

    return render_template(
        'orders.html',
        orders=pagination.items,
        pagination=pagination,
        stats=order_stats(),
        filters=filters,
        list_args=list_args,
        export_args=export_args,
        per_page=per_page,
        customers=Customer.query.order_by(Customer.name).all(),
        order_statuses=ORDER_STATUSES,
    )

@app.route('/orders/export')
def orders_export():
    filters = order_filters_from_request()
    query = apply_order_filters(Order.query, filters)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['Mã đơn', 'Khách hàng', 'Ngày tạo', 'Tổng tiền', 'Đã trả', 'Còn nợ', 'Trạng thái', 'Thanh toán'])
    for o in query.order_by(Order.created_at.desc()).all():
        writer.writerow([
            o.order_code,
            o.customer.name,
            o.created_at.strftime('%d/%m/%Y') if o.created_at else '',
            o.total,
            o.paid_amount,
            order_balance(o),
            effective_order_status(o),
            order_payment_status(o),
        ])
    return Response(
        '\ufeff' + buf.getvalue(),
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename=don-hang.csv'},
    )

@app.route('/orders/<int:oid>/status', methods=['POST'])
def update_order_status(oid):
    o = Order.query.get_or_404(oid)
    new_status = request.form.get('status', '').strip()
    if new_status in ORDER_STATUSES:
        o.status = new_status
        db.session.commit()
        flash_status_updated(new_status)
    return orders_redirect(page=request.form.get('_page', 1, type=int))

@app.route('/orders/<int:oid>/payment', methods=['POST'])
def add_payment(oid):
    o = Order.query.get_or_404(oid)
    amount = parse_int(request.form.get('amount'))
    if amount <= 0:
        flash('Số tiền không hợp lệ', 'danger')
        return orders_redirect(page=request.form.get('_page', 1, type=int))
    p = Payment(order_id=o.id, amount=amount, method=request.form.get('method', 'Chuyển khoản'), note=request.form.get('note', ''))
    o.paid_amount = min((o.paid_amount or 0) + amount, o.total or 0)
    db.session.add(p)
    db.session.commit()
    flash('Đã ghi nhận thanh toán', 'success')
    return orders_redirect(page=request.form.get('_page', 1, type=int))

@app.route('/orders/<int:oid>/preview')
def order_preview(oid):
    o = Order.query.get_or_404(oid)
    return render_template(
        'order_preview_page.html',
        order=o,
        status=effective_order_status(o),
        payment=order_payment_status(o),
        balance=order_balance(o),
    )

@app.route('/stock', methods=['GET', 'POST'])
def stock():
    ensure_stock_movement_columns()
    if request.method == 'POST':
        p = Product.query.get_or_404(int(request.form['product_id']))
        qty = max(parse_int(request.form.get('qty')), 0)
        mtype = request.form.get('movement_type', 'IN')
        if qty <= 0:
            return stock_redirect_after_save('Số lượng phải lớn hơn 0', 'danger')
        if mtype == 'OUT' and p.stock < qty:
            return stock_redirect_after_save('Tồn kho không đủ để xuất', 'danger')
        if mtype == 'IN':
            p.stock += qty
        else:
            p.stock -= qty
        db.session.add(StockMovement(
            product_id=p.id,
            movement_type=mtype,
            qty=qty,
            ref_code=request.form.get('ref_code', '').strip(),
            method=normalize_stock_method(mtype, request.form.get('method')),
            warehouse=request.form.get('warehouse', DEFAULT_WAREHOUSE).strip() or DEFAULT_WAREHOUSE,
            note=request.form.get('note', '').strip(),
        ))
        db.session.commit()
        label = 'nhập' if mtype == 'IN' else 'xuất'
        return stock_redirect_after_save(f'Đã {label} kho thành công')

    filters = stock_filters_from_request()
    date_from = parse_stock_date(filters['date_from'])
    date_to = parse_stock_date(filters['date_to'])
    per_page = request.args.get('per_page', 10, type=int)
    per_page = per_page if per_page in (10, 25, 50, 100) else 10
    page = request.args.get('page', 1, type=int)

    query = Product.query
    if filters['product_id']:
        query = query.filter(Product.id == int(filters['product_id']))
    if filters['q']:
        like = f"%{filters['q']}%"
        query = query.filter(or_(Product.sku.ilike(like), Product.name.ilike(like)))
    if filters['status'] == 'ok':
        query = query.filter(Product.stock > Product.low_stock)
    elif filters['status'] == 'low':
        query = query.filter(Product.stock > 0, Product.stock <= Product.low_stock)
    elif filters['status'] == 'out':
        query = query.filter(Product.stock <= 0)

    pagination = query.order_by(Product.name).paginate(page=page, per_page=per_page, error_out=False)
    inventory_rows = [product_stock_row(p, date_from, date_to) for p in pagination.items]

    mov_query = StockMovement.query.join(Product)
    if filters['product_id']:
        mov_query = mov_query.filter(StockMovement.product_id == int(filters['product_id']))
    if filters['movement_type']:
        mov_query = mov_query.filter(StockMovement.movement_type == filters['movement_type'])
    if filters['method']:
        mov_query = mov_query.filter(StockMovement.method == filters['method'])
    if filters['warehouse']:
        mov_query = mov_query.filter(StockMovement.warehouse == filters['warehouse'])
    if date_from:
        mov_query = mov_query.filter(StockMovement.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        mov_query = mov_query.filter(StockMovement.created_at <= datetime.combine(date_to, datetime.max.time()))
    if filters['q']:
        like = f"%{filters['q']}%"
        mov_query = mov_query.filter(or_(Product.sku.ilike(like), Product.name.ilike(like)))
    history_pagination = mov_query.order_by(StockMovement.created_at.desc()).paginate(
        page=page if filters['tab'] == 'history' else 1,
        per_page=per_page,
        error_out=False,
    )

    list_args = {k: v for k, v in filters.items() if v}
    list_args['per_page'] = per_page
    base_args = {k: v for k, v in list_args.items() if k not in ('tab', 'status')}
    inventory_args = {**base_args, 'tab': 'inventory'}
    history_args = {**base_args, 'tab': 'history'}
    low_stock_args = {**base_args, 'tab': 'inventory', 'status': 'low'}
    out_stock_args = {**base_args, 'tab': 'inventory', 'status': 'out'}
    export_args = {k: v for k, v in list_args.items() if k != 'tab'}
    all_products = Product.query.order_by(Product.name).all()
    return render_template(
        'stock.html',
        stats=stock_stats(),
        inventory_rows=inventory_rows,
        pagination=pagination,
        history_pagination=history_pagination,
        movements=history_pagination.items,
        all_products=all_products,
        filters=filters,
        list_args=list_args,
        inventory_args=inventory_args,
        history_args=history_args,
        low_stock_args=low_stock_args,
        out_stock_args=out_stock_args,
        export_args=export_args,
        per_page=per_page,
        stock_in_methods=STOCK_IN_METHODS,
        stock_out_methods=STOCK_OUT_METHODS,
        stock_filter_methods=STOCK_FILTER_METHODS,
        warehouses=[DEFAULT_WAREHOUSE],
    )

@app.route('/stock/export')
def stock_export():
    ensure_stock_movement_columns()
    filters = stock_filters_from_request()
    date_from = parse_stock_date(filters['date_from'])
    date_to = parse_stock_date(filters['date_to'])
    query = Product.query.order_by(Product.name)
    if filters['q']:
        like = f"%{filters['q']}%"
        query = query.filter(or_(Product.sku.ilike(like), Product.name.ilike(like)))
    rows = [product_stock_row(p, date_from, date_to) for p in query.all()]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['SKU', 'Sản phẩm', 'Kho', 'Tồn đầu kỳ', 'Nhập', 'Xuất', 'Tồn hiện tại', 'Đơn vị', 'Trạng thái'])
    for r in rows:
        p = r['product']
        writer.writerow([p.sku, p.name, r['warehouse'], r['opening'], r['inbound'], r['outbound'], r['current'], p.unit, r['status_label']])
    return Response(
        '\ufeff' + buf.getvalue(),
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename=ton-kho.csv'},
    )

@app.route('/debt')
def debt():
    orders = Order.query.filter(Order.total > Order.paid_amount).order_by(Order.created_at.desc()).all()
    return render_template('debt.html', orders=orders)

@app.cli.command('init-db')
def init_db_command():
    init_db(seed=True)
    print('Initialized database')

def create_quote_doc_templates():
    TEMPLATE_QUOTE_SALE_CONTRACT.parent.mkdir(parents=True, exist_ok=True)
    if not TEMPLATE_QUOTE_SALE_CONTRACT.exists():
        doc = Document()
        _doc_add_center_heading(doc, 'HỢP ĐỒNG MUA BÁN HÀNG HÓA', level=1)
        doc.add_paragraph('Số hợp đồng: {{SO_HOP_DONG}}')
        doc.add_paragraph('Căn cứ báo giá số {{SO_BAO_GIA}} ngày {{NGAY_KY}}.')
        doc.add_paragraph('BÊN MUA: {{TEN_BEN_A}}')
        doc.add_paragraph('BÊN BÁN: {{TEN_BEN_B}}')
        doc.add_paragraph('Tổng thanh toán: {{TONG_THANH_TOAN}}')
        doc.save(TEMPLATE_QUOTE_SALE_CONTRACT)
    if not TEMPLATE_QUOTE_HANDOVER.exists():
        doc = Document()
        _doc_add_center_heading(doc, 'BIÊN BẢN GIAO NHẬN HÀNG HÓA', level=1)
        doc.add_paragraph('Số biên bản: {{SO_BIEN_BAN}}')
        doc.add_paragraph('Báo giá: {{SO_BAO_GIA}} — Ngày giao: {{NGAY_GIAO}}')
        doc.add_paragraph('BÊN GIAO: {{TEN_BEN_B}}')
        doc.add_paragraph('BÊN NHẬN: {{TEN_BEN_A}}')
        doc.add_paragraph('Địa điểm: {{DIA_DIEM}}')
        doc.save(TEMPLATE_QUOTE_HANDOVER)

def create_template_docx():
    if TEMPLATE_DOCX.exists(): return
    doc = Document()
    doc.add_paragraph('CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM').alignment = 1
    doc.add_paragraph('Độc lập - Tự do - Hạnh phúc').alignment = 1
    doc.add_heading('HỢP ĐỒNG NGUYÊN TẮC', level=1).alignment = 1
    doc.add_paragraph('Số: {{SO_HOP_DONG}}')
    doc.add_paragraph('Hôm nay, ngày {{NGAY_KY}}, chúng tôi gồm có:')
    doc.add_paragraph('BÊN MUA (BÊN A): {{TEN_BEN_A}}')
    doc.add_paragraph('Đại diện: {{DAI_DIEN_A}}    Chức vụ: {{CHUC_VU_A}}')
    doc.add_paragraph('Địa chỉ: {{DIA_CHI_A}}')
    doc.add_paragraph('Điện thoại: {{DIEN_THOAI_A}}')
    doc.add_paragraph('Số TK: {{SO_TK_A}}')
    doc.add_paragraph('Mở tại: {{NGAN_HANG_A}}')
    doc.add_paragraph('MST: {{MST_A}}')
    doc.add_paragraph('BÊN BÁN (BÊN B): CÔNG TY TNHH THƯƠNG MẠI SEOUL – HÀ NỘI')
    doc.add_paragraph('Đại diện: Bà Trần Thị Hương Giang    Chức vụ: Giám đốc')
    doc.add_paragraph('Địa chỉ: Số 270 Ngô Gia Tự, phường Đức Giang, Quận Long Biên, TP Hà Nội')
    doc.add_paragraph('Điều 1: Điều khoản chung')
    doc.add_paragraph('Hai bên thống nhất ký kết hợp đồng nguyên tắc mua bán hàng hóa.')
    doc.add_paragraph('Điều 2: Hàng hóa và bảo hành')
    doc.add_paragraph('Hàng hóa đảm bảo đúng chủng loại, chất lượng và thông số kỹ thuật.')
    doc.add_paragraph('Điều 3: Thanh toán')
    doc.add_paragraph('Thanh toán theo thỏa thuận của từng đơn hàng/báo giá.')
    doc.add_paragraph('Điều 4: Hiệu lực')
    doc.add_paragraph('Hợp đồng này có hiệu lực đến hết ngày {{NGAY_HET_HIEU_LUC}}.')
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = 'ĐẠI DIỆN BÊN A'
    table.rows[0].cells[1].text = 'ĐẠI DIỆN BÊN B'
    doc.save(TEMPLATE_DOCX)

def init_db(seed=False):
    DB_PATH.parent.mkdir(exist_ok=True)
    PRODUCT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    COMPANY_LOGO_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.joinpath('contracts').mkdir(parents=True, exist_ok=True)
    QUOTE_DOCS_DIR.mkdir(parents=True, exist_ok=True)
    create_template_docx()
    create_quote_doc_templates()
    db.create_all()
    ensure_contract_columns()
    CONTRACT_SIGNED_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ensure_company_profile()
    if seed and Customer.query.count() == 0:
        c = Customer(name='CÔNG TY CP XĂNG DẦU DẦU KHÍ NINH BÌNH', tax_code='2700275814', address='Khu công nghiệp Ninh Phúc, Phường Đông Hoa Lư, Tỉnh Ninh Bình', phone='0229.3854065', representative='Ông Quách Trọng Phụng', position='Phó Giám đốc', bank_account='4830006372', bank_name='BIDV chi nhánh Ninh Bình')
        db.session.add(c)
    if seed and Category.query.count() == 0:
        for cat_name in ['Camera', 'Điện thoại', 'Laptop', 'Phụ kiện', 'Âm thanh', 'Thiết bị thông minh']:
            db.session.add(Category(name=cat_name))
    if seed and Product.query.count() == 0:
        products = [
            Product(sku='A53-128-BLK', name='Samsung A53 6/128 Đen', category='Điện thoại', brand='Samsung', model='A53', variant='6/128 Đen', retail_price=5000000, project_price=4800000, stock=10, warranty='12 tháng'),
            Product(sku='DJI-A4-COMBO', name='DJI Action 4 Adventure Combo', category='Camera', brand='DJI', model='Action 4', variant='Adventure Combo', retail_price=8900000, project_price=8500000, stock=3, warranty='12 tháng'),
        ]
        db.session.add_all(products)
    if seed and Order.query.count() == 0:
        customer = Customer.query.first()
        if customer:
            demo_orders = [
                ('DH-2026-0001', 'Đã chốt', 17800000, 17800000),
                ('DH-2026-0002', 'Chờ xác nhận', 5500000, 0),
                ('DH-2026-0003', 'Đang xử lý', 12300000, 5000000),
                ('DH-2026-0004', 'Đang giao', 8900000, 8900000),
                ('DH-2026-0005', 'Đã hủy', 3200000, 0),
            ]
            for code, status, total, paid in demo_orders:
                db.session.add(Order(
                    order_code=code, customer_id=customer.id, status=status,
                    total=total, paid_amount=paid,
                ))
    db.session.commit()

if __name__ == '__main__':
    with app.app_context():
        init_db(seed=True)
    app.run(host='0.0.0.0', port=5050, debug=True)
