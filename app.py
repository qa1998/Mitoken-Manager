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
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode
from flask import Flask, render_template, request, redirect, url_for, flash, send_file, Response, session
from werkzeug.utils import secure_filename
from sqlalchemy import func, or_
from flask_sqlalchemy import SQLAlchemy
from markupsafe import escape
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'instance' / 'business.db'
IMPORT_PREVIEW_DIR = BASE_DIR / 'instance' / 'import_previews'
IMPORT_PREVIEW_SESSION_KEY = 'product_import_preview_id'
CATEGORY_IMPORT_SESSION_KEY = 'category_import_preview_id'
OUTPUT_DIR = BASE_DIR / 'output'
TEMPLATE_DOCX = BASE_DIR / 'templates_docx' / 'hop_dong_template.docx'
TEMPLATE_QUOTE_SALE_CONTRACT = BASE_DIR / 'templates_docx' / 'hop_dong_mua_ban_bao_gia.docx'
TEMPLATE_QUOTE_HANDOVER = BASE_DIR / 'templates_docx' / 'bien_ban_nhan_hang.docx'
QUOTE_DOCS_DIR = OUTPUT_DIR / 'quotes'
PRODUCT_UPLOAD_DIR = BASE_DIR / 'static' / 'uploads' / 'products'
COMPANY_LOGO_DIR = BASE_DIR / 'static' / 'uploads' / 'company'
CONTRACT_SIGNED_UPLOAD_DIR = BASE_DIR / 'static' / 'uploads' / 'contracts' / 'signed'
ORDER_HANDOVER_UPLOAD_DIR = BASE_DIR / 'static' / 'uploads' / 'orders' / 'handover'
PAYMENT_RECEIPT_UPLOAD_DIR = BASE_DIR / 'static' / 'uploads' / 'payments' / 'receipts'
ALLOWED_ORDER_HANDOVER_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
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
    name = db.Column(db.String(120), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=True)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    parent = db.relationship('Category', remote_side=[id], backref=db.backref('children', lazy='dynamic'))

class Brand(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    category = db.relationship('Category')

class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sku = db.Column(db.String(80), unique=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(120), default='')
    brand = db.Column(db.String(120), default='')
    category_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=True)
    brand_id = db.Column(db.Integer, db.ForeignKey('brand.id'), nullable=True)
    category_ref = db.relationship('Category', foreign_keys=[category_id])
    brand_ref = db.relationship('Brand', foreign_keys=[brand_id])
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
    handover_scan_path = db.Column(db.String(512), default='')
    handover_scan_uploaded_at = db.Column(db.DateTime, nullable=True)
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
    receipt_path = db.Column(db.String(512), default='')
    receipt_uploaded_at = db.Column(db.DateTime, nullable=True)
    batch_id = db.Column(db.String(64), default='')
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
    'Hoàn thành': 'success',
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

def ensure_category_brand_schema():
    from sqlalchemy import inspect, text
    ensure_product_columns()
    insp = inspect(db.engine)
    tables = set(insp.get_table_names())
    if 'brand' not in tables:
        Brand.__table__.create(db.engine)
    if 'category' in tables:
        cols = {c['name'] for c in insp.get_columns('category')}
        with db.engine.begin() as conn:
            if 'parent_id' not in cols:
                conn.execute(text('ALTER TABLE category ADD COLUMN parent_id INTEGER'))
            if 'sort_order' not in cols:
                conn.execute(text('ALTER TABLE category ADD COLUMN sort_order INTEGER DEFAULT 0'))
    if 'product' in tables:
        cols = {c['name'] for c in insp.get_columns('product')}
        with db.engine.begin() as conn:
            if 'category_id' not in cols:
                conn.execute(text('ALTER TABLE product ADD COLUMN category_id INTEGER'))
            if 'brand_id' not in cols:
                conn.execute(text('ALTER TABLE product ADD COLUMN brand_id INTEGER'))
    migrate_product_taxonomy_ids()

def migrate_product_taxonomy_ids():
    for product in Product.query.all():
        changed = False
        if product.category and not product.category_id:
            cid = find_category_id_by_path(product.category)
            if cid:
                product.category_id = cid
                changed = True
        if product.brand and not product.brand_id:
            brand = Brand.query.filter_by(name=product.brand).first()
            if not brand:
                brand = Brand(name=product.brand)
                db.session.add(brand)
                db.session.flush()
            product.brand_id = brand.id
            changed = True
        if changed:
            sync_product_taxonomy_strings(product)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()

def category_display_path(category_id):
    if not category_id:
        return ''
    cat = Category.query.get(category_id)
    if not cat:
        return ''
    if cat.parent_id:
        parent = Category.query.get(cat.parent_id)
        if parent:
            return f'{parent.name} > {cat.name}'
    return cat.name

def product_category_path(product):
    if getattr(product, 'category_id', None):
        return category_display_path(product.category_id)
    return product.category or ''

def product_brand_name(product):
    if getattr(product, 'brand_id', None):
        brand = Brand.query.get(product.brand_id)
        if brand:
            return brand.name
    return product.brand or ''

def parent_categories():
    return Category.query.filter(Category.parent_id.is_(None)).order_by(Category.sort_order, Category.name).all()

def child_categories(parent_id):
    if not parent_id:
        return []
    return Category.query.filter_by(parent_id=parent_id).order_by(Category.sort_order, Category.name).all()

def build_category_tree():
    all_cats = Category.query.order_by(Category.sort_order, Category.name).all()
    by_parent = {}
    for cat in all_cats:
        by_parent.setdefault(cat.parent_id, []).append(cat)

    def walk(parent_id=None):
        nodes = []
        for cat in by_parent.get(parent_id, []):
            nodes.append({'category': cat, 'children': walk(cat.id)})
        return nodes

    return walk(None)

def category_name_exists(name, parent_id=None):
    q = Category.query.filter(Category.name == name)
    if parent_id:
        q = q.filter_by(parent_id=parent_id)
    else:
        q = q.filter(Category.parent_id.is_(None))
    return q.first() is not None

def find_category_id_by_path(path):
    path = (path or '').strip()
    if not path:
        return None
    if '>' in path:
        parts = [p.strip() for p in path.split('>') if p.strip()]
        if len(parts) >= 2:
            parent = Category.query.filter(Category.parent_id.is_(None), Category.name == parts[0]).first()
            if not parent:
                return None
            child = Category.query.filter_by(parent_id=parent.id, name=parts[-1]).first()
            return child.id if child else None
    cat = Category.query.filter(Category.name == path).first()
    return cat.id if cat else None

def sync_product_taxonomy_strings(product):
    product.category = category_display_path(product.category_id) if product.category_id else ''
    if product.brand_id:
        brand = Brand.query.get(product.brand_id)
        product.brand = brand.name if brand else ''
    elif not product.brand:
        product.brand = ''

def assign_product_taxonomy_from_form(product):
    child_id = request.form.get('category_id', type=int)
    parent_id = request.form.get('category_parent_id', type=int)
    if child_id:
        product.category_id = child_id
    elif parent_id:
        product.category_id = parent_id
    else:
        legacy = request.form.get('category', '').strip()
        product.category_id = find_category_id_by_path(legacy) if legacy else None
    brand_id = request.form.get('brand_id', type=int)
    if brand_id:
        product.brand_id = brand_id
    else:
        legacy_brand = request.form.get('brand', '').strip()
        if legacy_brand:
            brand = Brand.query.filter_by(name=legacy_brand).first()
            if not brand:
                brand = Brand(name=legacy_brand)
                db.session.add(brand)
                db.session.flush()
            product.brand_id = brand.id
        else:
            product.brand_id = None
    sync_product_taxonomy_strings(product)

def ensure_category_from_path(path):
    path = (path or '').strip()
    if not path:
        return None
    existing = find_category_id_by_path(path)
    if existing:
        return existing
    if '>' in path:
        parts = [p.strip() for p in path.split('>') if p.strip()]
        parent_name, child_name = parts[0], parts[-1]
        parent = category_name_exists(parent_name, None) and Category.query.filter(
            Category.parent_id.is_(None), Category.name == parent_name
        ).first()
        if not parent:
            parent = Category(name=parent_name)
            db.session.add(parent)
            db.session.flush()
        child = Category.query.filter_by(parent_id=parent.id, name=child_name).first()
        if not child:
            child = Category(name=child_name, parent_id=parent.id)
            db.session.add(child)
            db.session.flush()
        return child.id
    if not category_name_exists(path, None):
        cat = Category(name=path)
        db.session.add(cat)
        db.session.flush()
        return cat.id
    return Category.query.filter(Category.parent_id.is_(None), Category.name == path).first().id

def ensure_brand_name(name, category_id=None):
    name = (name or '').strip()
    if not name:
        return None
    brand = Brand.query.filter_by(name=name).first()
    if not brand:
        brand = Brand(name=name, category_id=category_id)
        db.session.add(brand)
        db.session.flush()
    elif category_id and not brand.category_id:
        brand.category_id = category_id
    return brand.id

def brands_for_category(category_id):
    q = Brand.query.order_by(Brand.name)
    if not category_id:
        return q.all()
    cat = Category.query.get(category_id)
    if not cat:
        return q.all()
    scope_ids = {category_id}
    if cat.parent_id:
        scope_ids.add(cat.parent_id)
    else:
        scope_ids.update(c.id for c in Category.query.filter_by(parent_id=cat.id))
    return q.filter(or_(Brand.category_id.is_(None), Brand.category_id.in_(scope_ids))).all()

def brands_catalog_json():
    return [
        {'id': b.id, 'name': b.name, 'category_id': b.category_id}
        for b in Brand.query.order_by(Brand.name).all()
    ]

def categories_catalog_json():
    parents = parent_categories()
    children = {}
    for p in parents:
        children[str(p.id)] = [
            {'id': c.id, 'name': c.name, 'path': category_display_path(c.id)}
            for c in child_categories(p.id)
        ]
    return {
        'parents': [{'id': p.id, 'name': p.name} for p in parents],
        'children': children,
    }

app.jinja_env.globals['product_category_path'] = product_category_path
app.jinja_env.globals['product_brand_name'] = product_brand_name
app.jinja_env.globals['category_display_path'] = category_display_path

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

def product_is_active(product):
    return bool(getattr(product, 'is_active', True))

def quote_product_catalog(products):
    return [{
        'id': p.id,
        'sku': p.sku,
        'name': p.name,
        'unit': p.unit or 'cái',
        'retail_price': p.retail_price or 0,
        'image_url': product_image_url(p) or '',
        'label': f'{p.sku} - {p.name}',
    } for p in products if product_is_active(p)]

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
        status='Đang xử lý',
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

ORDER_STATUSES = ['Đang xử lý', 'Hoàn thành', 'Đã hủy']
ORDER_FILTER_STATUSES = ORDER_STATUSES
ORDER_STATUS_KEYS = {
    'Đang xử lý': 'processing',
    'Hoàn thành': 'completed',
    'Đã hủy': 'cancelled',
}
ORDER_LEGACY_STATUS_MAP = {
    'Mới tạo': 'Đang xử lý',
    'Chờ xác nhận': 'Đang xử lý',
    'Đang giao': 'Đang xử lý',
    'Đã chốt': 'Hoàn thành',
    'Đã thanh toán': 'Hoàn thành',
    'Thanh toán 1 phần': 'Hoàn thành',
}
ORDER_LEGACY_STATUS = ORDER_LEGACY_STATUS_MAP
ORDER_STATUS_FILTER_VALUES = {
    'Đang xử lý': ['Đang xử lý', 'Chờ xác nhận', 'Mới tạo', 'Đang giao'],
    'Hoàn thành': ['Hoàn thành', 'Đã chốt', 'Đã thanh toán', 'Thanh toán 1 phần'],
    'Đã hủy': ['Đã hủy'],
}
ORDER_ALLOWED_TRANSITIONS = {
    'Đang xử lý': {'Hoàn thành', 'Đã hủy'},
}
PAYMENT_STATUS_KEYS = {
    'Đã thanh toán': 'paid',
    'Thanh toán 1 phần': 'partial',
    'Chưa thanh toán': 'unpaid',
    '—': 'none',
}

def effective_order_status(order):
    raw = (order.status or 'Đang xử lý').strip()
    if raw in ORDER_LEGACY_STATUS_MAP:
        return ORDER_LEGACY_STATUS_MAP[raw]
    return raw if raw in ORDER_STATUSES else 'Đang xử lý'

def normalize_order_statuses():
    changed = False
    for order in Order.query.all():
        raw = (order.status or '').strip()
        if raw in ORDER_STATUSES:
            continue
        mapped = ORDER_LEGACY_STATUS_MAP.get(raw, 'Đang xử lý')
        if order.status != mapped:
            order.status = mapped
            changed = True
    if changed:
        db.session.commit()

def order_next_statuses(status):
    return sorted(ORDER_ALLOWED_TRANSITIONS.get(status, set()))

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
    display = ORDER_LEGACY_STATUS_MAP.get(status, status)
    return ORDER_STATUS_KEYS.get(display or '', 'processing')

def order_payment_key(status):
    return PAYMENT_STATUS_KEYS.get(status or '', 'unpaid')

def order_counts_toward_debt(order):
    return effective_order_status(order) != 'Đã hủy'

def order_balance(order):
    if not order_counts_toward_debt(order):
        return 0
    return max((order.total or 0) - (order.paid_amount or 0), 0)

def total_outstanding_debt(query=None):
    base = query if query is not None else Order.query
    return sum(order_balance(o) for o in base.all())

def debt_orders(query=None):
    base = query if query is not None else Order.query
    return [o for o in base.order_by(Order.created_at.desc()).all() if order_balance(o) > 0]

def customer_prior_debt(customer_id, exclude_order_id=None):
    """Công nợ còn lại của khách từ các đơn khác (không tính đơn đang xem)."""
    q = Order.query.filter_by(customer_id=customer_id)
    if exclude_order_id:
        q = q.filter(Order.id != exclude_order_id)
    return sum(order_balance(o) for o in q.all())

DEBT_OVERDUE_DAYS = 30

def customer_initials(name):
    if not name:
        return '?'
    parts = [p for p in name.strip().split() if p]
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()
    return name.strip()[:2].upper()

def customer_debt_aggregates():
    agg = {}
    for o in Order.query.order_by(Order.created_at.asc()).all():
        if not order_counts_toward_debt(o):
            continue
        cid = o.customer_id
        if cid not in agg:
            agg[cid] = {
                'total': 0, 'paid': 0, 'remaining': 0,
                'order_count': 0, 'unpaid_count': 0,
                'oldest_unpaid_at': None,
            }
        a = agg[cid]
        a['total'] += o.total or 0
        a['paid'] += o.paid_amount or 0
        bal = order_balance(o)
        a['remaining'] += bal
        a['order_count'] += 1
        if bal > 0:
            a['unpaid_count'] += 1
            created = o.created_at or datetime.utcnow()
            if a['oldest_unpaid_at'] is None or created < a['oldest_unpaid_at']:
                a['oldest_unpaid_at'] = created
    return agg

def customer_debt_status_from_agg(agg_row):
    if not agg_row or agg_row.get('remaining', 0) <= 0:
        return 'Đã thanh toán'
    cutoff = datetime.utcnow() - timedelta(days=DEBT_OVERDUE_DAYS)
    oldest = agg_row.get('oldest_unpaid_at')
    if oldest and oldest < cutoff:
        return 'Quá hạn'
    return 'Còn nợ'

def customer_debt_status_key(status):
    return {'Còn nợ': 'owing', 'Đã thanh toán': 'paid', 'Quá hạn': 'overdue'}.get(status or '', 'owing')

def customer_unpaid_orders_oldest_first(customer_id):
    return [
        o for o in Order.query.filter_by(customer_id=customer_id)
        .order_by(Order.created_at.asc(), Order.id.asc()).all()
        if order_counts_toward_debt(o) and order_balance(o) > 0
    ]

def customer_outstanding_balance(customer_id):
    return sum(order_balance(o) for o in customer_unpaid_orders_oldest_first(customer_id))

def apply_order_payment(order, amount, method='Chuyển khoản', note='',
                        receipt_path='', receipt_uploaded_at=None, batch_id=''):
    pay = min(parse_int(amount), order_balance(order))
    if pay <= 0:
        return None
    p = Payment(
        order_id=order.id,
        amount=pay,
        method=method or 'Chuyển khoản',
        note=(note or '').strip(),
        receipt_path=receipt_path or '',
        receipt_uploaded_at=receipt_uploaded_at,
        batch_id=batch_id or '',
    )
    order.paid_amount = min((order.paid_amount or 0) + pay, order.total or 0)
    db.session.add(p)
    return {'payment': p, 'amount': pay, 'order': order}

def allocate_customer_payment(customer_id, amount, method='Chuyển khoản', note='',
                              receipt_path='', receipt_uploaded_at=None):
    """Phân bổ thanh toán vào các đơn còn nợ, đơn cũ nhất trước."""
    pay_total = parse_int(amount)
    if pay_total <= 0:
        return []
    batch_id = uuid.uuid4().hex
    allocations = []
    remaining = pay_total
    user_note = (note or '').strip()
    for o in customer_unpaid_orders_oldest_first(customer_id):
        if remaining <= 0:
            break
        pay = min(remaining, order_balance(o))
        if pay <= 0:
            continue
        p_note = user_note or 'Thanh toán công nợ tổng'
        result = apply_order_payment(
            o, pay, method, p_note,
            receipt_path=receipt_path,
            receipt_uploaded_at=receipt_uploaded_at,
            batch_id=batch_id,
        )
        if result:
            allocations.append(result)
            remaining -= pay
    if allocations:
        db.session.commit()
    return allocations

def format_payment_allocation_lines(allocations):
    return [f"{a['order'].order_code} +{money_plain(a['amount'])}đ" for a in allocations]

def payment_group_key(payment):
    if payment.batch_id:
        return ('batch', payment.batch_id)
    if payment.receipt_path and payment.receipt_uploaded_at:
        return (
            'receipt',
            payment.receipt_path,
            payment.receipt_uploaded_at.isoformat(),
            (payment.note or '').strip(),
            payment.payment_date.isoformat() if payment.payment_date else '',
            payment.method or '',
        )
    return ('single', payment.id)

def group_payments_for_display(payments):
    """Gộp các dòng payment cùng lần phân bổ thành một dòng hiển thị."""
    if not payments:
        return []
    buckets = {}
    order_keys = []
    for p in payments:
        key = payment_group_key(p)
        if key not in buckets:
            buckets[key] = []
            order_keys.append(key)
        buckets[key].append(p)

    groups = []
    for key in order_keys:
        items = buckets[key]
        head = items[0]
        if key[0] in ('batch', 'receipt') and len(items) > 1:
            items_sorted = sorted(items, key=lambda x: (x.id,))
            groups.append({
                'kind': 'batch',
                'payment_date': head.payment_date,
                'method': head.method,
                'note': head.note,
                'total': sum(i.amount or 0 for i in items),
                'receipt_pid': head.id,
                'receipt_path': head.receipt_path,
                'allocations': [
                    {'order_code': i.order.order_code if i.order else '—', 'amount': i.amount or 0}
                    for i in items_sorted
                ],
            })
        else:
            for p in items:
                groups.append({
                    'kind': 'single',
                    'payment': p,
                    'payment_date': p.payment_date,
                    'method': p.method,
                    'note': p.note,
                    'total': p.amount or 0,
                    'receipt_pid': p.id,
                    'receipt_path': p.receipt_path,
                })
    return groups

app.jinja_env.globals['group_payments_for_display'] = group_payments_for_display

def build_debt_customer_rows(search_q=''):
    agg = customer_debt_aggregates()
    if not agg:
        return []
    query = Customer.query.filter(Customer.id.in_(agg.keys()))
    if search_q:
        like = f'%{search_q}%'
        query = query.filter(or_(Customer.name.ilike(like), Customer.phone.ilike(like)))
    rows = []
    for c in query.all():
        a = agg.get(c.id, {})
        status = customer_debt_status_from_agg(a)
        rows.append({
            'customer': c,
            'total': a.get('total', 0),
            'paid': a.get('paid', 0),
            'remaining': a.get('remaining', 0),
            'order_count': a.get('order_count', 0),
            'unpaid_count': a.get('unpaid_count', 0),
            'status': status,
            'status_key': customer_debt_status_key(status),
        })
    rows.sort(key=lambda r: (-r['remaining'], (r['customer'].name or '').lower()))
    return rows

class SimplePagination:
    def __init__(self, items, page, per_page):
        self.total = len(items)
        self.per_page = max(per_page, 1)
        self.page = max(page, 1)
        self.pages = max(1, (self.total + self.per_page - 1) // self.per_page) if self.total else 1
        if self.page > self.pages:
            self.page = self.pages
        start = (self.page - 1) * self.per_page
        self.items = items[start:start + self.per_page]
        self.has_prev = self.page > 1
        self.has_next = self.page < self.pages
        self.prev_num = self.page - 1
        self.next_num = self.page + 1

    def iter_pages(self, left_edge=1, right_edge=1, left_current=1, right_current=2):
        last = 0
        for num in range(1, self.pages + 1):
            if (
                num <= left_edge
                or (self.page - left_current - 1 < num < self.page + right_current)
                or num > self.pages - right_edge
            ):
                if last + 1 != num:
                    yield None
                yield num
                last = num

def debt_redirect(**extra):
    args = {k: v for k, v in request.args.items() if v}
    args.update({k: v for k, v in extra.items() if v is not None and v != ''})
    return redirect(url_for('debt', **args))

def order_stats(query=None):
    base = query if query is not None else Order.query
    total = base.count()
    if total == 0:
        return {'total': 0, 'processing': 0, 'completed': 0, 'cancelled': 0,
                'processing_pct': 0, 'completed_pct': 0, 'cancelled_pct': 0}
    counts = {'processing': 0, 'completed': 0, 'cancelled': 0}
    for o in base.all():
        st = effective_order_status(o)
        if st == 'Hoàn thành':
            counts['completed'] += 1
        elif st == 'Đã hủy':
            counts['cancelled'] += 1
        else:
            counts['processing'] += 1
    def pct(n):
        return round(n * 1000 / total) / 10 if total else 0
    return {
        'total': total,
        **counts,
        'processing_pct': pct(counts['processing']),
        'completed_pct': pct(counts['completed']),
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
        status_values = ORDER_STATUS_FILTER_VALUES.get(st, [st])
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
app.jinja_env.globals['customer_prior_debt'] = customer_prior_debt
app.jinja_env.globals['customer_initials'] = customer_initials
app.jinja_env.globals['customer_debt_status_key'] = customer_debt_status_key
app.jinja_env.globals['order_next_statuses'] = order_next_statuses

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
    line_items = []
    stopped_names = []
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
        if not product_is_active(p):
            stopped_names.append(p.name or p.sku)
            continue
        qv = parse_int(qty, 1)
        pv = parse_int(price, p.retail_price)
        line_items.append((p, qv, pv, qv * pv))
    if stopped_names:
        names = ', '.join(stopped_names[:5])
        extra = f' và {len(stopped_names) - 5} sản phẩm khác' if len(stopped_names) > 5 else ''
        raise ValueError(f'Sản phẩm đã ngừng bán không thể thêm vào báo giá: {names}{extra}')
    if not line_items:
        raise ValueError('Vui lòng thêm ít nhất một sản phẩm đang bán vào báo giá')
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
    for p, qv, pv, amount in line_items:
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
    ensure_category_brand_schema()
    return [b.name for b in Brand.query.order_by(Brand.name).all()]

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

def ensure_order_columns():
    from sqlalchemy import inspect, text
    try:
        cols = {c['name'] for c in inspect(db.engine).get_columns('order')}
    except Exception:
        return
    with db.engine.begin() as conn:
        if 'handover_scan_path' not in cols:
            conn.execute(text("ALTER TABLE \"order\" ADD COLUMN handover_scan_path VARCHAR(512) DEFAULT ''"))
        if 'handover_scan_uploaded_at' not in cols:
            conn.execute(text('ALTER TABLE "order" ADD COLUMN handover_scan_uploaded_at DATETIME'))

def delete_order_handover_scan_file(scan_path):
    delete_contract_scan_file(scan_path)

def order_handover_scan_url(scan_path):
    return contract_signed_scan_url(scan_path)

app.jinja_env.globals['order_handover_scan_url'] = order_handover_scan_url

def ensure_payment_columns():
    from sqlalchemy import inspect, text
    try:
        cols = {c['name'] for c in inspect(db.engine).get_columns('payment')}
    except Exception:
        return
    with db.engine.begin() as conn:
        if 'receipt_path' not in cols:
            conn.execute(text("ALTER TABLE payment ADD COLUMN receipt_path VARCHAR(512) DEFAULT ''"))
        if 'receipt_uploaded_at' not in cols:
            conn.execute(text('ALTER TABLE payment ADD COLUMN receipt_uploaded_at DATETIME'))
        if 'batch_id' not in cols:
            conn.execute(text("ALTER TABLE payment ADD COLUMN batch_id VARCHAR(64) DEFAULT ''"))

def save_payment_receipt(file_storage):
    """Lưu ảnh xác nhận đã nhận tiền. Trả về đường dẫn tương đối hoặc None."""
    if not file_storage or not file_storage.filename:
        flash('Vui lòng upload ảnh xác nhận đã nhận tiền', 'warning')
        return None
    ext = Path(secure_filename(file_storage.filename)).suffix.lower()
    if ext not in ALLOWED_ORDER_HANDOVER_EXTENSIONS:
        flash('Ảnh phải là JPG, PNG hoặc WEBP', 'warning')
        return None
    data = file_storage.read()
    file_storage.seek(0)
    if len(data) > MAX_CONTRACT_SCAN_BYTES:
        flash('File tối đa 10MB', 'warning')
        return None
    PAYMENT_RECEIPT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f'{uuid.uuid4().hex}{ext}'
    rel_path = f'uploads/payments/receipts/{filename}'
    file_storage.save(PAYMENT_RECEIPT_UPLOAD_DIR / filename)
    return rel_path

def payment_receipt_url(receipt_path):
    return contract_signed_scan_url(receipt_path)

app.jinja_env.globals['payment_receipt_url'] = payment_receipt_url

def save_order_handover_scan(order, file_storage):
    if not file_storage or not file_storage.filename:
        flash('Vui lòng upload ảnh biên bản nhận hàng có chữ ký người nhận', 'warning')
        return False
    ext = Path(secure_filename(file_storage.filename)).suffix.lower()
    if ext not in ALLOWED_ORDER_HANDOVER_EXTENSIONS:
        flash('Ảnh phải là JPG, PNG hoặc WEBP', 'warning')
        return False
    data = file_storage.read()
    file_storage.seek(0)
    if len(data) > MAX_CONTRACT_SCAN_BYTES:
        flash('File tối đa 10MB', 'warning')
        return False
    ORDER_HANDOVER_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    delete_order_handover_scan_file(order.handover_scan_path)
    filename = f'{order.id}_{uuid.uuid4().hex[:10]}{ext}'
    rel_path = f'uploads/orders/handover/{filename}'
    file_storage.save(ORDER_HANDOVER_UPLOAD_DIR / filename)
    order.handover_scan_path = rel_path
    order.handover_scan_uploaded_at = datetime.utcnow()
    return True

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
            'url': url_for('order_preview', oid=o.id),
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
        'debt': total_outstanding_debt(),
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
        'category_parent_id': request.args.get('category_parent_id', type=int),
        'category_id': request.args.get('category_id', type=int),
        'brand_id': request.args.get('brand_id', type=int),
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
    if filters.get('category_id'):
        query = query.filter(Product.category_id == filters['category_id'])
    elif filters.get('category_parent_id'):
        child_ids = [c.id for c in Category.query.filter_by(parent_id=filters['category_parent_id'])]
        child_ids.append(filters['category_parent_id'])
        query = query.filter(Product.category_id.in_(child_ids))
    elif filters.get('category'):
        query = query.filter(Product.category == filters['category'])
    if filters.get('brand_id'):
        query = query.filter(Product.brand_id == filters['brand_id'])
    elif filters.get('brand'):
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
    assign_product_taxonomy_from_form(product)
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
        path = category_display_path(cat.id)
        counts[cat.id] = Product.query.filter(
            or_(Product.category_id == cat.id, Product.category == path, Product.category == cat.name)
        ).count()
    return counts

def brand_product_counts():
    counts = {}
    for brand in Brand.query.all():
        counts[brand.id] = Product.query.filter(
            or_(Product.brand_id == brand.id, Product.brand == brand.name)
        ).count()
    return counts

PRODUCT_IMPORT_FIELDS = [
    ('sku', 'SKU'),
    ('name', 'Tên sản phẩm'),
    ('category_parent', 'Danh mục cha'),
    ('category_child', 'Danh mục con'),
    ('brand', 'Thương hiệu'),
    ('model', 'Model'),
    ('variant', 'Biến thể'),
    ('unit', 'Đơn vị'),
    ('warranty', 'Bảo hành'),
    ('cost_price', 'Giá nhập'),
    ('retail_price', 'Giá bán lẻ'),
    ('dealer_price', 'Giá đại lý'),
    ('project_price', 'Giá dự án'),
    ('stock', 'Tồn kho'),
    ('low_stock', 'Tồn tối thiểu'),
    ('status', 'Trạng thái'),
]

PRODUCT_IMPORT_SAMPLE_ROW = [
    'SP-001', 'Sản phẩm mẫu', 'Điện thoại', 'Smartphone', 'Samsung',
    'A53', '6/128 Đen', 'cái', '12 tháng',
    5000000, 8900000, 8500000, 8700000, 10, 5, 'Đang bán',
]

PRODUCT_IMPORT_HEADER_ALIASES = {
    'sku': {'sku', 'mã sku', 'ma sku', 'mã vạch', 'ma vach'},
    'name': {'tên sản phẩm', 'ten san pham', 'tên', 'ten', 'name', 'sản phẩm'},
    'category_parent': {'danh mục cha', 'danh muc cha', 'category parent', 'nhóm danh mục', 'ngành hàng'},
    'category_child': {'danh mục con', 'danh muc con', 'category child', 'loại sản phẩm'},
    'category': {'danh mục', 'danh muc', 'category', 'loại'},
    'brand': {'thương hiệu', 'thuong hieu', 'brand', 'hãng'},
    'model': {'model', 'mẫu'},
    'variant': {'biến thể', 'bien the', 'variant'},
    'unit': {'đơn vị', 'don vi', 'unit', 'dvt'},
    'warranty': {'bảo hành', 'bao hanh', 'warranty'},
    'cost_price': {'giá nhập', 'gia nhap', 'cost', 'cost_price'},
    'retail_price': {'giá bán lẻ', 'gia ban le', 'giá bán', 'retail', 'retail_price'},
    'dealer_price': {'giá đại lý', 'gia dai ly', 'dealer', 'dealer_price'},
    'project_price': {'giá dự án', 'gia du an', 'project', 'project_price'},
    'stock': {'tồn kho', 'ton kho', 'stock', 'sl tồn'},
    'low_stock': {'tồn tối thiểu', 'ton toi thieu', 'low_stock', 'tồn min'},
    'status': {'trạng thái', 'trang thai', 'status'},
}

def normalize_import_header(value):
    return (str(value or '').strip().lower().replace('_', ' '))

def build_product_import_header_map(headers):
    col_map = {}
    for idx, raw in enumerate(headers):
        key = normalize_import_header(raw)
        if not key:
            continue
        for field, aliases in PRODUCT_IMPORT_HEADER_ALIASES.items():
            if key in aliases or key == field:
                col_map[field] = idx
                break
    return col_map

def parse_import_active_status(value):
    s = normalize_import_header(value)
    if s in ('ngừng bán', 'ngung ban', 'stopped', '0', 'false', 'no', 'n'):
        return False
    if s in ('đang bán', 'dang ban', 'selling', '1', 'true', 'yes', 'y'):
        return True
    return True

def ensure_category_name(name):
    ensure_category_from_path(name)

def read_product_import_sheet(file_storage):
    filename = secure_filename(file_storage.filename or '')
    ext = Path(filename).suffix.lower()
    if ext == '.csv':
        raw = file_storage.read()
        if raw[:3] == b'\xef\xbb\xbf':
            raw = raw[3:]
        text = raw.decode('utf-8-sig', errors='replace')
        reader = csv.reader(io.StringIO(text))
        return [list(row) for row in reader]
    if ext in ('.xlsx', '.xlsm'):
        try:
            from openpyxl import load_workbook
        except ImportError:
            raise ValueError('Thiếu thư viện openpyxl. Dùng file .csv hoặc cài: pip install openpyxl')
        file_storage.seek(0)
        wb = load_workbook(file_storage, read_only=True, data_only=True)
        ws = wb.active
        rows = []
        for row in ws.iter_rows(values_only=True):
            rows.append(['' if c is None else c for c in row])
        wb.close()
        return rows
    raise ValueError('Chỉ hỗ trợ file Excel (.xlsx) hoặc CSV (.csv)')

def product_category_parts(product):
    """Tách danh mục cha / con để export Excel."""
    if getattr(product, 'category_id', None):
        cat = Category.query.get(product.category_id)
        if cat and cat.parent_id:
            parent = Category.query.get(cat.parent_id)
            return (parent.name if parent else '', cat.name)
        if cat:
            return (cat.name, '')
    path = (product.category or '').strip()
    if '>' in path:
        parts = [p.strip() for p in path.split('>') if p.strip()]
        if len(parts) >= 2:
            return (parts[0], parts[-1])
    return (path, '')

def resolve_import_category_path(data):
    """Gộp danh mục từ cột cha/con hoặc cột danh mục gộp (Cha > Con)."""
    parent = (data.get('category_parent') or '').strip()
    child = (data.get('category_child') or '').strip()
    combined = (data.get('category') or '').strip()
    if parent and child:
        return f'{parent} > {child}'
    if child and not parent:
        return child
    if parent and not child:
        return parent
    return combined

def product_row_from_import(row, col_map):
    def cell(field, default=''):
        idx = col_map.get(field)
        if idx is None or idx >= len(row):
            return default
        val = row[idx]
        if val is None:
            return default
        return str(val).strip()

    raw = {
        'sku': cell('sku'),
        'name': cell('name'),
        'category_parent': cell('category_parent'),
        'category_child': cell('category_child'),
        'category': cell('category'),
        'brand': cell('brand'),
        'model': cell('model'),
        'variant': cell('variant'),
        'unit': cell('unit', 'cái') or 'cái',
        'warranty': cell('warranty'),
        'cost_price': parse_int(cell('cost_price'), 0),
        'retail_price': parse_int(cell('retail_price'), 0),
        'dealer_price': parse_int(cell('dealer_price'), 0),
        'project_price': parse_int(cell('project_price'), 0),
        'stock': parse_int(cell('stock'), 0),
        'low_stock': parse_int(cell('low_stock'), 5),
        'is_active': parse_import_active_status(cell('status', 'Đang bán')),
    }
    path = resolve_import_category_path(raw)
    raw['category'] = path
    parts = path.split('>') if path and '>' in path else []
    if len(parts) >= 2 and not raw['category_parent']:
        raw['category_parent'] = parts[0].strip()
        raw['category_child'] = parts[-1].strip()
    elif path and not raw['category_parent'] and not raw['category_child']:
        raw['category_parent'] = path
    return raw

def product_to_export_row(product):
    parent_name, child_name = product_category_parts(product)
    _, sale_label = product_sale_status(product)
    return [
        product.sku,
        product.name,
        parent_name,
        child_name,
        product_brand_name(product),
        product.model or '',
        product.variant or '',
        product.unit or 'cái',
        product.warranty or '',
        product.cost_price or 0,
        product.retail_price or 0,
        product.dealer_price or 0,
        product.project_price or 0,
        product.stock or 0,
        product.low_stock or 5,
        sale_label,
    ]

def product_import_field_labels():
    return [label for _, label in PRODUCT_IMPORT_FIELDS]

def build_products_xlsx_bytes(rows):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    wb = Workbook()
    ws = wb.active
    ws.title = 'San pham'
    headers = product_import_field_labels()
    ws.append(headers)
    for row in rows:
        ws.append(row)
    header_fill = PatternFill('solid', fgColor='E8F0FE')
    header_font = Font(bold=True)
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
    ws.freeze_panes = 'A2'
    from openpyxl.utils import get_column_letter
    widths = [14, 28, 16, 18, 14, 12, 14, 8, 12, 12, 12, 12, 12, 8, 10, 12]
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf

def build_products_csv_text(rows):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(product_import_field_labels())
    for row in rows:
        writer.writerow(row)
    return '\ufeff' + buf.getvalue()

def build_product_import_preview(rows, update_existing=False):
    if not rows:
        raise ValueError('File trống')
    header_row = rows[0]
    col_map = build_product_import_header_map(header_row)
    if 'sku' not in col_map or 'name' not in col_map:
        raise ValueError('File phải có cột SKU và Tên sản phẩm (xem file mẫu)')
    preview = []
    seen_skus = set()
    for line_no, raw_row in enumerate(rows[1:], start=2):
        if not any(str(c).strip() for c in raw_row):
            continue
        data = product_row_from_import(raw_row, col_map)
        sku = data['sku']
        name = data['name']
        row_id = uuid.uuid4().hex[:12]
        if not sku and not name:
            continue
        if not sku:
            preview.append({
                'row_id': row_id, 'line_no': line_no, 'data': data,
                'action': 'error', 'action_label': 'Lỗi', 'note': 'Thiếu SKU',
                'importable': False,
            })
            continue
        if not name:
            preview.append({
                'row_id': row_id, 'line_no': line_no, 'data': data,
                'action': 'error', 'action_label': 'Lỗi', 'note': 'Thiếu tên sản phẩm',
                'importable': False,
            })
            continue
        sku_key = sku.lower()
        if sku_key in seen_skus:
            preview.append({
                'row_id': row_id, 'line_no': line_no, 'data': data,
                'action': 'error', 'action_label': 'Lỗi', 'note': 'SKU trùng trong file',
                'importable': False,
            })
            continue
        seen_skus.add(sku_key)
        existing = Product.query.filter_by(sku=sku).first()
        if existing:
            if update_existing:
                preview.append({
                    'row_id': row_id, 'line_no': line_no, 'data': data,
                    'action': 'update', 'action_label': 'Cập nhật', 'note': 'SKU đã có trong hệ thống',
                    'importable': True,
                })
            else:
                preview.append({
                    'row_id': row_id, 'line_no': line_no, 'data': data,
                    'action': 'skip', 'action_label': 'Bỏ qua', 'note': 'SKU đã tồn tại',
                    'importable': False,
                })
            continue
        preview.append({
            'row_id': row_id, 'line_no': line_no, 'data': data,
            'action': 'create', 'action_label': 'Thêm mới', 'note': '',
            'importable': True,
        })
    if not preview:
        raise ValueError('Không có dòng dữ liệu hợp lệ trong file')
    return preview

def _apply_import_taxonomy(product, data):
    category_path = resolve_import_category_path(data)
    if category_path:
        product.category_id = ensure_category_from_path(category_path)
    else:
        product.category_id = None
    brand_name = (data.get('brand') or '').strip()
    if brand_name:
        product.brand_id = ensure_brand_name(brand_name, product.category_id)
    else:
        product.brand_id = None
    sync_product_taxonomy_strings(product)

def import_product_data_list(items, update_existing=False):
    created = updated = skipped = errors = 0
    error_lines = []
    for item in items:
        data = item.get('data') or item
        sku = data['sku']
        name = data['name']
        existing = Product.query.filter_by(sku=sku).first()
        if existing:
            if not update_existing:
                skipped += 1
                continue
            existing.name = name
            existing.model = data['model']
            existing.variant = data['variant']
            existing.unit = data['unit']
            existing.warranty = data['warranty']
            existing.cost_price = data['cost_price']
            existing.retail_price = data['retail_price']
            existing.dealer_price = data['dealer_price']
            existing.project_price = data['project_price']
            existing.stock = data['stock']
            existing.low_stock = data['low_stock']
            existing.is_active = data['is_active']
            _apply_import_taxonomy(existing, data)
            updated += 1
            continue
        p = Product(
            sku=sku, name=name,
            model=data['model'], variant=data['variant'], unit=data['unit'],
            warranty=data['warranty'], cost_price=data['cost_price'],
            retail_price=data['retail_price'], dealer_price=data['dealer_price'],
            project_price=data['project_price'], stock=data['stock'],
            low_stock=data['low_stock'], is_active=data['is_active'],
        )
        _apply_import_taxonomy(p, data)
        db.session.add(p)
        created += 1
    if created == 0 and updated == 0:
        raise ValueError('Không có sản phẩm nào được import')
    db.session.commit()
    return {
        'created': created, 'updated': updated, 'skipped': skipped,
        'errors': errors, 'error_lines': error_lines[:8],
    }

def delete_all_products_data():
    """Xóa toàn bộ sản phẩm và dữ liệu liên quan (danh mục, kho, báo giá chi tiết)."""
    product_count = Product.query.count()
    QuoteItem.query.delete()
    StockMovement.query.delete()
    PriceHistory.query.delete()
    Product.query.delete()
    Brand.query.delete()
    Category.query.delete()
    db.session.commit()
    clear_product_import_session()
    if PRODUCT_UPLOAD_DIR.exists():
        for path in PRODUCT_UPLOAD_DIR.iterdir():
            if path.is_file():
                path.unlink()
    return product_count

def _import_preview_path(preview_id):
    return IMPORT_PREVIEW_DIR / f'{preview_id}.json'

def _cleanup_old_import_previews(max_age_seconds=3600):
    if not IMPORT_PREVIEW_DIR.exists():
        return
    cutoff = time.time() - max_age_seconds
    for path in IMPORT_PREVIEW_DIR.glob('*.json'):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            pass

def clear_product_import_session():
    preview_id = session.pop(IMPORT_PREVIEW_SESSION_KEY, None)
    if preview_id:
        path = _import_preview_path(preview_id)
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass

def get_product_import_session():
    preview_id = session.get(IMPORT_PREVIEW_SESSION_KEY)
    if not preview_id:
        return None
    path = _import_preview_path(preview_id)
    if not path.exists():
        session.pop(IMPORT_PREVIEW_SESSION_KEY, None)
        return None
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        clear_product_import_session()
        return None

def save_product_import_session(filename, update_existing, preview_rows):
    IMPORT_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    clear_product_import_session()
    preview_id = uuid.uuid4().hex
    payload = {
        'filename': filename,
        'update_existing': update_existing,
        'rows': preview_rows,
    }
    _import_preview_path(preview_id).write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding='utf-8',
    )
    session[IMPORT_PREVIEW_SESSION_KEY] = preview_id
    _cleanup_old_import_previews()

def import_products_from_rows(rows, update_existing=False):
    preview = build_product_import_preview(rows, update_existing)
    importable = [r for r in preview if r.get('importable')]
    if not importable:
        raise ValueError('Không có dòng hợp lệ để import')
    return import_product_data_list(importable, update_existing)

def redirect_after_category_manage(category_import_preview=False):
    """Quay lại trang sản phẩm và mở lại modal quản lý danh mục."""
    ref = request.referrer or url_for('products')
    parts = urlparse(ref)
    qs = dict(parse_qsl(parts.query, keep_blank_values=True))
    qs['category_modal'] = '1'
    if category_import_preview:
        qs['category_import_preview'] = '1'
    return redirect(urlunparse(parts._replace(query=urlencode(qs))))

CATEGORY_IMPORT_FIELDS = [
    ('category_parent', 'Danh mục cha'),
    ('category_child', 'Danh mục con'),
    ('brand', 'Thương hiệu'),
]

CATEGORY_IMPORT_SAMPLE_ROWS = [
    ['Điện thoại', 'Smartphone', 'Samsung'],
    ['Điện thoại', 'Tablet', 'Apple'],
    ['Điện thoại', 'Phụ kiện điện thoại', ''],
    ['Camera', 'Action camera', 'DJI'],
    ['Camera', 'Máy ảnh', 'Sony'],
    ['Laptop', '', 'Asus'],
]

CATEGORY_IMPORT_HEADER_ALIASES = {
    'category_parent': {'danh mục cha', 'danh muc cha', 'nhóm', 'ngành hàng', 'parent'},
    'category_child': {'danh mục con', 'danh muc con', 'loại', 'child'},
    'brand': {'thương hiệu', 'thuong hieu', 'brand', 'hãng'},
    'category': {'danh mục', 'danh muc', 'category'},
}

def build_category_import_header_map(headers):
    col_map = {}
    for idx, raw in enumerate(headers):
        key = normalize_import_header(raw)
        if not key:
            continue
        for field, aliases in CATEGORY_IMPORT_HEADER_ALIASES.items():
            if key in aliases or key == field:
                col_map[field] = idx
                break
    return col_map

def category_row_from_import(row, col_map):
    def cell(field, default=''):
        idx = col_map.get(field)
        if idx is None or idx >= len(row):
            return default
        val = row[idx]
        if val is None:
            return default
        return str(val).strip()

    data = {
        'category_parent': cell('category_parent'),
        'category_child': cell('category_child'),
        'brand': cell('brand'),
    }
    combined = cell('category')
    if combined and not data['category_parent'] and not data['category_child']:
        if '>' in combined:
            parts = [p.strip() for p in combined.split('>') if p.strip()]
            data['category_parent'] = parts[0]
            data['category_child'] = parts[-1] if len(parts) > 1 else ''
        else:
            data['category_parent'] = combined
    return data

def _category_import_notes(parent_name, child_name, brand_name, parent_exists, child_exists, brand_exists):
    parts = []
    if parent_name and not parent_exists:
        parts.append(f'Thêm danh mục cha: {parent_name}')
    if child_name and not child_exists:
        parts.append(f'Thêm danh mục con: {child_name}')
    if brand_name and not brand_exists:
        parts.append(f'Thêm thương hiệu: {brand_name}')
    if not parts:
        return 'Đã có đủ trong hệ thống'
    return ' · '.join(parts)

def build_category_import_preview(rows):
    if not rows:
        raise ValueError('File trống')
    col_map = build_category_import_header_map(rows[0])
    if 'category_parent' not in col_map and 'category' not in col_map:
        raise ValueError('File phải có cột Danh mục cha (xem file mẫu)')
    preview = []
    for line_no, raw_row in enumerate(rows[1:], start=2):
        if not any(str(c).strip() for c in raw_row):
            continue
        data = category_row_from_import(raw_row, col_map)
        parent_name = data['category_parent']
        child_name = data['category_child']
        brand_name = data['brand']
        row_id = uuid.uuid4().hex[:12]
        if not parent_name and not child_name and not brand_name:
            continue
        if child_name and not parent_name:
            preview.append({
                'row_id': row_id, 'line_no': line_no, 'data': data,
                'action': 'error', 'action_label': 'Lỗi',
                'note': 'Có danh mục con nhưng thiếu danh mục cha',
                'importable': False,
            })
            continue
        if brand_name and not parent_name and not child_name:
            preview.append({
                'row_id': row_id, 'line_no': line_no, 'data': data,
                'action': 'error', 'action_label': 'Lỗi',
                'note': 'Thương hiệu cần gắn với danh mục cha hoặc con',
                'importable': False,
            })
            continue
        parent = None
        if parent_name:
            parent = Category.query.filter(
                Category.parent_id.is_(None), Category.name == parent_name
            ).first()
        child = None
        if parent and child_name:
            child = Category.query.filter_by(parent_id=parent.id, name=child_name).first()
        scope_id = child.id if child else (parent.id if parent else None)
        brand = Brand.query.filter_by(name=brand_name).first() if brand_name else None
        parent_exists = parent is not None
        child_exists = child is not None if child_name else True
        brand_exists = brand is not None if brand_name else True
        will_create = (
            (parent_name and not parent_exists)
            or (child_name and not child_exists)
            or (brand_name and not brand_exists)
        )
        if not will_create:
            preview.append({
                'row_id': row_id, 'line_no': line_no, 'data': data,
                'action': 'skip', 'action_label': 'Bỏ qua',
                'note': _category_import_notes(
                    parent_name, child_name, brand_name,
                    parent_exists, child_exists, brand_exists,
                ),
                'importable': False,
            })
            continue
        preview.append({
            'row_id': row_id, 'line_no': line_no, 'data': data,
            'action': 'create', 'action_label': 'Thêm mới',
            'note': _category_import_notes(
                parent_name, child_name, brand_name,
                parent_exists, child_exists, brand_exists,
            ),
            'importable': True,
        })
    if not preview:
        raise ValueError('Không có dòng dữ liệu hợp lệ trong file')
    return preview

def apply_category_import_row(data):
    created = {'parent': 0, 'child': 0, 'brand': 0}
    parent_name = (data.get('category_parent') or '').strip()
    child_name = (data.get('category_child') or '').strip()
    brand_name = (data.get('brand') or '').strip()
    parent_id = child_id = None
    if parent_name:
        parent = Category.query.filter(
            Category.parent_id.is_(None), Category.name == parent_name
        ).first()
        if not parent:
            parent = Category(name=parent_name)
            db.session.add(parent)
            db.session.flush()
            created['parent'] += 1
        parent_id = parent.id
    if child_name:
        child = Category.query.filter_by(parent_id=parent_id, name=child_name).first()
        if not child:
            child = Category(name=child_name, parent_id=parent_id)
            db.session.add(child)
            db.session.flush()
            created['child'] += 1
        child_id = child.id
    scope_id = child_id or parent_id
    if brand_name:
        brand = Brand.query.filter_by(name=brand_name).first()
        if not brand:
            db.session.add(Brand(name=brand_name, category_id=scope_id))
            created['brand'] += 1
        elif scope_id and not brand.category_id:
            brand.category_id = scope_id
    return created

def import_category_data_list(items):
    totals = {'parent': 0, 'child': 0, 'brand': 0}
    for item in items:
        data = item.get('data') or item
        row_created = apply_category_import_row(data)
        for k in totals:
            totals[k] += row_created[k]
    if sum(totals.values()) == 0:
        raise ValueError('Không có danh mục/thương hiệu mới nào được import')
    db.session.commit()
    return totals

def clear_category_import_session():
    preview_id = session.pop(CATEGORY_IMPORT_SESSION_KEY, None)
    if preview_id:
        path = _import_preview_path(f'cat_{preview_id}')
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass

def get_category_import_session():
    preview_id = session.get(CATEGORY_IMPORT_SESSION_KEY)
    if not preview_id:
        return None
    path = _import_preview_path(f'cat_{preview_id}')
    if not path.exists():
        session.pop(CATEGORY_IMPORT_SESSION_KEY, None)
        return None
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        clear_category_import_session()
        return None

def save_category_import_session(filename, preview_rows):
    IMPORT_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    clear_category_import_session()
    preview_id = uuid.uuid4().hex
    payload = {'filename': filename, 'rows': preview_rows}
    _import_preview_path(f'cat_{preview_id}').write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding='utf-8',
    )
    session[CATEGORY_IMPORT_SESSION_KEY] = preview_id
    _cleanup_old_import_previews()

def category_import_field_labels():
    return [label for _, label in CATEGORY_IMPORT_FIELDS]

def build_category_import_xlsx_bytes(rows):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter
    wb = Workbook()
    ws = wb.active
    ws.title = 'Danh muc'
    headers = category_import_field_labels()
    ws.append(headers)
    for row in rows:
        ws.append(row)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = PatternFill('solid', fgColor='E8F0FE')
        cell.alignment = Alignment(horizontal='center')
    ws.freeze_panes = 'A2'
    for idx, width in enumerate([18, 20, 16], start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf

def build_category_import_csv_text(rows):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(category_import_field_labels())
    for row in rows:
        writer.writerow(row)
    return '\ufeff' + buf.getvalue()

def taxonomy_export_rows():
    rows = []
    seen_brands = set()
    for parent in parent_categories():
        rows.append([parent.name, '', ''])
        for child in child_categories(parent.id):
            brand_names = [
                b.name for b in Brand.query.filter_by(category_id=child.id).order_by(Brand.name)
            ]
            if brand_names:
                for bn in brand_names:
                    rows.append([parent.name, child.name, bn])
                    seen_brands.add(bn)
            else:
                rows.append([parent.name, child.name, ''])
        for brand in Brand.query.filter_by(category_id=parent.id).order_by(Brand.name):
            if brand.name not in seen_brands:
                rows.append([parent.name, '', brand.name])
                seen_brands.add(brand.name)
    for brand in Brand.query.filter(Brand.category_id.is_(None)).order_by(Brand.name):
        if brand.name not in seen_brands:
            rows.append(['', '', brand.name])
    return rows

@app.route('/categories', methods=['POST'])
def create_category():
    ensure_category_brand_schema()
    keep_modal = request.form.get('_keep_modal') == '1'
    name = request.form.get('name', '').strip()
    parent_id = request.form.get('parent_id', type=int)
    if not name:
        flash('Vui lòng nhập tên danh mục', 'warning')
    elif category_name_exists(name, parent_id):
        flash('Tên danh mục đã tồn tại trong nhóm này', 'danger')
    elif parent_id and not Category.query.get(parent_id):
        flash('Danh mục cha không hợp lệ', 'danger')
    else:
        db.session.add(Category(name=name, parent_id=parent_id))
        db.session.commit()
        label = 'danh mục con' if parent_id else 'danh mục cha'
        flash(f'Đã tạo {label}', 'success')
    if keep_modal:
        return redirect_after_category_manage()
    return redirect(request.referrer or url_for('products'))

@app.route('/categories/<int:cid>/delete', methods=['POST'])
def delete_category(cid):
    ensure_category_brand_schema()
    cat = Category.query.get_or_404(cid)
    name = cat.name
    children = Category.query.filter_by(parent_id=cat.id).count()
    if children:
        flash(f'Không thể xóa "{name}" vì còn {children} danh mục con', 'danger')
        if request.form.get('_keep_modal') == '1':
            return redirect_after_category_manage()
        return redirect(request.referrer or url_for('products'))
    path = category_display_path(cat.id)
    affected = Product.query.filter(
        or_(Product.category_id == cat.id, Product.category == path, Product.category == cat.name)
    ).update({Product.category_id: None, Product.category: ''})
    Brand.query.filter_by(category_id=cat.id).update({Brand.category_id: None})
    db.session.delete(cat)
    db.session.commit()
    if affected:
        flash(f'Đã xóa danh mục "{name}". {affected} sản phẩm đã được bỏ danh mục.', 'warning')
    else:
        flash(f'Đã xóa danh mục "{name}"', 'success')
    if request.form.get('_keep_modal') == '1':
        return redirect_after_category_manage()
    return redirect(request.referrer or url_for('products'))

@app.route('/brands', methods=['POST'])
def create_brand():
    ensure_category_brand_schema()
    keep_modal = request.form.get('_keep_modal') == '1'
    name = request.form.get('name', '').strip()
    category_id = request.form.get('category_id', type=int)
    if not name:
        flash('Vui lòng nhập tên thương hiệu', 'warning')
    elif Brand.query.filter_by(name=name).first():
        flash('Thương hiệu đã tồn tại', 'danger')
    else:
        db.session.add(Brand(name=name, category_id=category_id or None))
        db.session.commit()
        flash('Đã tạo thương hiệu', 'success')
    if keep_modal:
        return redirect_after_category_manage()
    return redirect(request.referrer or url_for('products'))

@app.route('/brands/<int:bid>/delete', methods=['POST'])
def delete_brand(bid):
    ensure_category_brand_schema()
    brand = Brand.query.get_or_404(bid)
    name = brand.name
    affected = Product.query.filter(
        or_(Product.brand_id == brand.id, Product.brand == name)
    ).update({Product.brand_id: None, Product.brand: ''})
    db.session.delete(brand)
    db.session.commit()
    if affected:
        flash(f'Đã xóa thương hiệu "{name}". {affected} sản phẩm đã được bỏ thương hiệu.', 'warning')
    else:
        flash(f'Đã xóa thương hiệu "{name}"', 'success')
    if request.form.get('_keep_modal') == '1':
        return redirect_after_category_manage()
    return redirect(request.referrer or url_for('products'))

@app.route('/categories/export')
def categories_export():
    ensure_category_brand_schema()
    rows = taxonomy_export_rows()
    fmt = (request.args.get('format') or 'xlsx').lower()
    if fmt == 'csv':
        return Response(
            build_category_import_csv_text(rows),
            mimetype='text/csv; charset=utf-8',
            headers={'Content-Disposition': 'attachment; filename=danh-muc.csv'},
        )
    try:
        buf = build_category_import_xlsx_bytes(rows)
        return send_file(
            buf,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='danh-muc.xlsx',
        )
    except ImportError:
        return Response(
            build_category_import_csv_text(rows),
            mimetype='text/csv; charset=utf-8',
            headers={'Content-Disposition': 'attachment; filename=danh-muc.csv'},
        )

@app.route('/categories/import/template')
def categories_import_template():
    ensure_category_brand_schema()
    rows = list(CATEGORY_IMPORT_SAMPLE_ROWS)
    fmt = (request.args.get('format') or 'xlsx').lower()
    if fmt == 'csv':
        return Response(
            build_category_import_csv_text(rows),
            mimetype='text/csv; charset=utf-8',
            headers={'Content-Disposition': 'attachment; filename=mau-import-danh-muc.csv'},
        )
    try:
        buf = build_category_import_xlsx_bytes(rows)
        return send_file(
            buf,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='mau-import-danh-muc.xlsx',
        )
    except ImportError:
        return Response(
            build_category_import_csv_text(rows),
            mimetype='text/csv; charset=utf-8',
            headers={'Content-Disposition': 'attachment; filename=mau-import-danh-muc.csv'},
        )

@app.route('/categories/import/preview', methods=['POST'])
def categories_import_preview():
    ensure_category_brand_schema()
    file_storage = request.files.get('import_file')
    if not file_storage or not file_storage.filename:
        flash('Vui lòng chọn file Excel hoặc CSV', 'warning')
        return redirect_after_category_manage()
    try:
        rows = read_product_import_sheet(file_storage)
        preview = build_category_import_preview(rows)
        save_category_import_session(file_storage.filename, preview)
    except ValueError as e:
        flash(str(e), 'danger')
        return redirect_after_category_manage()
    except Exception as e:
        flash(f'Không đọc được file: {e}', 'danger')
        return redirect_after_category_manage()
    return redirect_after_category_manage(category_import_preview=True)

@app.route('/categories/import/confirm', methods=['POST'])
def categories_import_confirm():
    ensure_category_brand_schema()
    payload = get_category_import_session()
    if not payload:
        flash('Phiên import đã hết hạn. Vui lòng tải file lại.', 'warning')
        return redirect_after_category_manage()
    selected_ids = set(request.form.getlist('import_row_id'))
    to_import = [
        r for r in payload.get('rows', [])
        if r.get('row_id') in selected_ids and r.get('importable')
    ]
    if not to_import:
        flash('Chưa chọn dòng nào để import', 'warning')
        return redirect_after_category_manage(category_import_preview=True)
    try:
        totals = import_category_data_list(to_import)
    except ValueError as e:
        flash(str(e), 'danger')
        return redirect_after_category_manage(category_import_preview=True)
    clear_category_import_session()
    parts = []
    if totals['parent']:
        parts.append(f"{totals['parent']} danh mục cha")
    if totals['child']:
        parts.append(f"{totals['child']} danh mục con")
    if totals['brand']:
        parts.append(f"{totals['brand']} thương hiệu")
    flash('Đã import: ' + ', '.join(parts), 'success')
    return redirect_after_category_manage()

@app.route('/categories/import/cancel', methods=['POST'])
def categories_import_cancel():
    clear_category_import_session()
    return redirect_after_category_manage()

@app.route('/products', methods=['GET', 'POST'])
def products():
    ensure_category_brand_schema()
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
            sku=sku, name=name,
            warranty=request.form.get('warranty', ''),
            cost_price=parse_int(request.form.get('cost_price')),
            retail_price=parse_int(request.form.get('retail_price')),
            project_price=parse_int(request.form.get('project_price')),
            stock=parse_int(request.form.get('stock')),
        )
        assign_product_taxonomy_from_form(p)
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
    if not parent_categories():
        seed_product_taxonomy()
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
        brand_counts=brand_product_counts(),
        category_tree=build_category_tree(),
        parent_categories=parent_categories(),
        brands_list=Brand.query.order_by(Brand.name).all(),
        filters=filters,
        per_page=per_page,
        list_args=list_args,
        export_args=export_args,
        brands=product_brand_options(),
        taxonomy_catalog_json=json.dumps(categories_catalog_json(), ensure_ascii=False),
        brands_catalog_json=json.dumps(brands_catalog_json(), ensure_ascii=False),
        price_histories=price_histories,
        stock_in_methods=STOCK_IN_METHODS,
        stock_out_methods=STOCK_OUT_METHODS,
        import_preview_payload=get_product_import_session(),
        show_import_preview=bool(request.args.get('import_preview')),
        category_import_preview_payload=get_category_import_session(),
        show_category_import_preview=bool(request.args.get('category_import_preview')),
    )

@app.route('/products/<int:pid>/update', methods=['POST'])
def update_product(pid):
    ensure_category_brand_schema()
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
    ensure_category_brand_schema()
    filters = product_filters_from_request()
    query = apply_product_filters(Product.query, filters).order_by(Product.created_at.desc())
    rows = [product_to_export_row(p) for p in query.all()]
    fmt = (request.args.get('format') or 'xlsx').lower()
    if fmt == 'csv':
        return Response(
            build_products_csv_text(rows),
            mimetype='text/csv; charset=utf-8',
            headers={'Content-Disposition': 'attachment; filename=san-pham.csv'},
        )
    try:
        buf = build_products_xlsx_bytes(rows)
        return send_file(
            buf,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='san-pham.xlsx',
        )
    except ImportError:
        return Response(
            build_products_csv_text(rows),
            mimetype='text/csv; charset=utf-8',
            headers={'Content-Disposition': 'attachment; filename=san-pham.csv'},
        )

@app.route('/products/import/template')
def products_import_template():
    ensure_category_brand_schema()
    rows = [PRODUCT_IMPORT_SAMPLE_ROW]
    fmt = (request.args.get('format') or 'xlsx').lower()
    if fmt == 'csv':
        return Response(
            build_products_csv_text(rows),
            mimetype='text/csv; charset=utf-8',
            headers={'Content-Disposition': 'attachment; filename=mau-import-san-pham.csv'},
        )
    try:
        buf = build_products_xlsx_bytes(rows)
        return send_file(
            buf,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='mau-import-san-pham.xlsx',
        )
    except ImportError:
        return Response(
            build_products_csv_text(rows),
            mimetype='text/csv; charset=utf-8',
            headers={'Content-Disposition': 'attachment; filename=mau-import-san-pham.csv'},
        )

@app.route('/products/import/preview', methods=['POST'])
def products_import_preview():
    ensure_category_brand_schema()
    file_storage = request.files.get('import_file')
    if not file_storage or not file_storage.filename:
        flash('Vui lòng chọn file Excel hoặc CSV', 'warning')
        return redirect(url_for('products'))
    update_existing = request.form.get('update_existing') == '1'
    try:
        rows = read_product_import_sheet(file_storage)
        preview = build_product_import_preview(rows, update_existing=update_existing)
        save_product_import_session(file_storage.filename, update_existing, preview)
    except ValueError as e:
        flash(str(e), 'danger')
        return redirect(url_for('products'))
    except Exception as e:
        flash(f'Không đọc được file: {e}', 'danger')
        return redirect(url_for('products'))
    return redirect(url_for('products', import_preview=1))

@app.route('/products/import/confirm', methods=['POST'])
def products_import_confirm():
    ensure_category_brand_schema()
    payload = get_product_import_session()
    if not payload:
        flash('Phiên import đã hết hạn. Vui lòng tải file lại.', 'warning')
        return redirect(url_for('products'))
    selected_ids = set(request.form.getlist('import_row_id'))
    update_existing = payload.get('update_existing', False)
    to_import = [
        r for r in payload.get('rows', [])
        if r.get('row_id') in selected_ids and r.get('importable')
    ]
    if not to_import:
        flash('Chưa chọn sản phẩm nào để import', 'warning')
        return redirect(url_for('products', import_preview=1))
    try:
        result = import_product_data_list(to_import, update_existing=update_existing)
    except ValueError as e:
        flash(str(e), 'danger')
        return redirect(url_for('products', import_preview=1))
    clear_product_import_session()
    parts = []
    if result['created']:
        parts.append(f"thêm mới {result['created']}")
    if result['updated']:
        parts.append(f"cập nhật {result['updated']}")
    msg = 'Đã import: ' + ', '.join(parts) + '.'
    flash(msg, 'success')
    return redirect(url_for('products'))

@app.route('/products/import/cancel', methods=['POST'])
def products_import_cancel():
    clear_product_import_session()
    return redirect(url_for('products'))

@app.route('/products/delete-all', methods=['POST'])
def products_delete_all():
    ensure_product_columns()
    count = Product.query.count()
    if count == 0:
        flash('Không có sản phẩm nào để xóa', 'info')
        return redirect(url_for('products'))
    deleted = delete_all_products_data()
    flash(f'Đã xóa toàn bộ {deleted} sản phẩm và dữ liệu liên quan', 'success')
    return redirect(url_for('products'))

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
        except ValueError as e:
            flash(str(e) or 'Vui lòng kiểm tra lại thông tin báo giá', 'warning')
            return redirect(url_for('quotes', tab='list'))
        except KeyError:
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
        quote_catalog=quote_product_catalog(
            Product.query.filter(Product.is_active.is_(True)).order_by(Product.name).all()
        ),
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
    ensure_order_columns()
    normalize_order_statuses()
    if request.method == 'POST':
        customer_id = int(request.form['customer_id'])
        total = parse_int(request.form.get('total'))
        status = 'Đang xử lý'
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
        order_filter_statuses=ORDER_FILTER_STATUSES,
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
    ensure_order_columns()
    normalize_order_statuses()
    o = Order.query.get_or_404(oid)
    new_status = request.form.get('status', '').strip()
    current = effective_order_status(o)
    allowed = ORDER_ALLOWED_TRANSITIONS.get(current, set())
    if new_status == 'Hoàn thành':
        flash('Vui lòng upload biên bản nhận hàng có chữ ký để hoàn thành đơn', 'warning')
        return orders_redirect(page=request.form.get('_page', 1, type=int))
    if new_status in allowed:
        o.status = new_status
        db.session.commit()
        flash_status_updated(new_status)
    elif new_status in ORDER_STATUSES:
        flash('Không thể chuyển trạng thái đơn hàng theo hướng này', 'warning')
    return orders_redirect(page=request.form.get('_page', 1, type=int))

@app.route('/orders/<int:oid>/complete', methods=['POST'])
def complete_order(oid):
    ensure_order_columns()
    normalize_order_statuses()
    o = Order.query.get_or_404(oid)
    current = effective_order_status(o)
    if 'Hoàn thành' not in ORDER_ALLOWED_TRANSITIONS.get(current, set()):
        flash('Không thể hoàn thành đơn hàng ở trạng thái hiện tại', 'warning')
        return orders_redirect(page=request.form.get('_page', 1, type=int))
    if not save_order_handover_scan(o, request.files.get('handover_scan')):
        return orders_redirect(page=request.form.get('_page', 1, type=int))
    o.status = 'Hoàn thành'
    db.session.commit()
    flash('Đã hoàn thành đơn hàng và lưu biên bản nhận hàng', 'success')
    return orders_redirect(page=request.form.get('_page', 1, type=int))

@app.route('/orders/<int:oid>/handover-scan')
def view_order_handover_scan(oid):
    ensure_order_columns()
    o = Order.query.get_or_404(oid)
    if not o.handover_scan_path:
        flash('Chưa có biên bản nhận hàng', 'warning')
        return redirect(url_for('order_preview', oid=oid))
    file_path = BASE_DIR / 'static' / o.handover_scan_path
    if not file_path.is_file():
        flash('Không tìm thấy file biên bản nhận hàng', 'danger')
        return redirect(url_for('order_preview', oid=oid))
    return send_file(file_path, mimetype=signed_scan_mimetype(file_path))

@app.route('/payments/<int:pid>/receipt')
def view_payment_receipt(pid):
    ensure_payment_columns()
    p = Payment.query.get_or_404(pid)
    if not p.receipt_path:
        flash('Chưa có ảnh xác nhận thanh toán', 'warning')
        if p.order_id:
            return redirect(url_for('order_preview', oid=p.order_id))
        return redirect(url_for('debt'))
    file_path = BASE_DIR / 'static' / p.receipt_path
    if not file_path.is_file():
        flash('Không tìm thấy file ảnh xác nhận', 'danger')
        return redirect(url_for('debt'))
    return send_file(file_path, mimetype=signed_scan_mimetype(file_path))

@app.route('/orders/<int:oid>/payment', methods=['POST'])
def add_payment(oid):
    ensure_payment_columns()
    o = Order.query.get_or_404(oid)
    page = request.form.get('_page', 1, type=int)
    from_debt = request.form.get('_from') == 'debt'
    if not order_counts_toward_debt(o):
        flash('Đơn hàng đã hủy, không ghi nhận thanh toán / công nợ', 'warning')
        if from_debt:
            return debt_redirect(customer_id=request.form.get('customer_id') or o.customer_id, page=page)
        return orders_redirect(page=page)
    amount = parse_int(request.form.get('amount'))
    if amount <= 0:
        flash('Số tiền không hợp lệ', 'danger')
        if from_debt:
            return debt_redirect(customer_id=request.form.get('customer_id') or o.customer_id, page=page)
        return orders_redirect(page=page)
    receipt_path = save_payment_receipt(request.files.get('payment_receipt'))
    if not receipt_path:
        if from_debt:
            return debt_redirect(customer_id=request.form.get('customer_id') or o.customer_id, page=page)
        return orders_redirect(page=page)
    receipt_at = datetime.utcnow()
    result = apply_order_payment(
        o, amount, request.form.get('method', 'Chuyển khoản'), request.form.get('note', ''),
        receipt_path=receipt_path, receipt_uploaded_at=receipt_at,
    )
    if not result:
        flash('Số tiền không hợp lệ hoặc đơn đã thanh toán đủ', 'danger')
        if from_debt:
            return debt_redirect(customer_id=request.form.get('customer_id') or o.customer_id, page=page)
        return orders_redirect(page=page)
    db.session.commit()
    flash(f"Đã ghi nhận thanh toán {money(result['amount'])} cho {o.order_code}", 'success')
    if from_debt:
        return debt_redirect(
            customer_id=request.form.get('customer_id') or o.customer_id,
            page=request.form.get('_page', 1, type=int),
        )
    return orders_redirect(page=request.form.get('_page', 1, type=int))

@app.route('/orders/<int:oid>/preview')
def order_preview(oid):
    ensure_order_columns()
    normalize_order_statuses()
    o = Order.query.get_or_404(oid)
    quote = None
    valid_until = None
    if o.quote_id:
        ensure_quote_columns()
        quote = Quote.query.get(o.quote_id)
        if quote:
            valid_until = quote_valid_until(quote)
    return render_template(
        'order_preview_page.html',
        order=o,
        quote=quote,
        valid_until=valid_until,
        status=effective_order_status(o),
        payment=order_payment_status(o),
        balance=order_balance(o),
    )

@app.route('/orders/<int:oid>/print')
def order_print(oid):
    o = Order.query.get_or_404(oid)
    if not o.quote_id:
        flash('Đơn hàng không có báo giá liên kết', 'warning')
        return redirect(url_for('order_preview', oid=oid))
    ensure_quote_columns()
    quote = Quote.query.get_or_404(o.quote_id)
    return render_template(
        'order_print.html',
        order=o,
        quote=quote,
        valid_until=quote_valid_until(quote),
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
    ensure_payment_columns()
    normalize_order_statuses()
    search_q = request.args.get('q', '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    order_page = request.args.get('order_page', 1, type=int)
    per_page = min(max(per_page, 5), 50)
    customer_id = request.args.get('customer_id', type=int)

    all_rows = build_debt_customer_rows(search_q)
    pagination = SimplePagination(all_rows, page, per_page)
    list_args = {'q': search_q, 'per_page': per_page}
    if customer_id:
        list_args['customer_id'] = customer_id
    if order_page > 1:
        list_args['order_page'] = order_page

    selected = None
    selected_summary = None
    customer_orders = []
    order_pagination = None
    payments = []

    if customer_id:
        selected = Customer.query.get(customer_id)
    elif pagination.items:
        selected = pagination.items[0]['customer']
        customer_id = selected.id
        list_args['customer_id'] = customer_id

    if selected:
        agg = customer_debt_aggregates().get(selected.id, {})
        selected_summary = {
            'total': agg.get('total', 0),
            'paid': agg.get('paid', 0),
            'remaining': agg.get('remaining', 0),
            'unpaid_count': agg.get('unpaid_count', 0),
            'order_count': agg.get('order_count', 0),
            'status': customer_debt_status_from_agg(agg),
            'status_key': customer_debt_status_key(customer_debt_status_from_agg(agg)),
        }
        orders_all = [
            o for o in Order.query.filter_by(customer_id=selected.id)
            .order_by(Order.created_at.desc()).all()
            if order_counts_toward_debt(o)
        ]
        order_pagination = SimplePagination(orders_all, order_page, 8)
        customer_orders = order_pagination.items
        payments = (
            Payment.query.join(Order)
            .filter(Order.customer_id == selected.id)
            .order_by(Payment.payment_date.desc(), Payment.id.desc())
            .limit(20)
            .all()
        )

    unpaid_orders = customer_unpaid_orders_oldest_first(selected.id) if selected else []
    customer_outstanding = customer_outstanding_balance(selected.id) if selected else 0

    return render_template(
        'debt.html',
        debt_rows=pagination.items,
        pagination=pagination,
        list_args=list_args,
        per_page=per_page,
        search_q=search_q,
        selected=selected,
        selected_summary=selected_summary,
        customer_orders=customer_orders,
        order_pagination=order_pagination,
        payments=payments,
        payment_groups=group_payments_for_display(payments) if payments else [],
        unpaid_orders=unpaid_orders,
        customer_outstanding=customer_outstanding,
        customer_id=customer_id,
    )

@app.route('/debt/payment', methods=['POST'])
def debt_allocate_payment():
    ensure_payment_columns()
    normalize_order_statuses()
    customer_id = request.form.get('customer_id', type=int)
    page = request.form.get('_page', 1, type=int)
    if not customer_id:
        flash('Không xác định được khách hàng', 'danger')
        return debt_redirect(page=page)
    Customer.query.get_or_404(customer_id)
    amount = parse_int(request.form.get('amount'))
    method = request.form.get('method', 'Chuyển khoản')
    note = request.form.get('note', '')
    outstanding = customer_outstanding_balance(customer_id)
    if outstanding <= 0:
        flash('Khách hàng không còn công nợ', 'warning')
        return debt_redirect(customer_id=customer_id, page=page)
    if amount <= 0:
        flash('Số tiền không hợp lệ', 'danger')
        return debt_redirect(customer_id=customer_id, page=page)
    receipt_path = save_payment_receipt(request.files.get('payment_receipt'))
    if not receipt_path:
        return debt_redirect(customer_id=customer_id, page=page)
    receipt_at = datetime.utcnow()
    pay_amount = min(amount, outstanding)
    if amount > outstanding:
        flash(
            f'Số tiền vượt tổng còn nợ ({money(outstanding)}). Chỉ phân bổ {money(pay_amount)}.',
            'warning',
        )
    allocations = allocate_customer_payment(
        customer_id, pay_amount, method, note,
        receipt_path=receipt_path, receipt_uploaded_at=receipt_at,
    )
    if not allocations:
        flash('Không thể phân bổ thanh toán', 'danger')
        return debt_redirect(customer_id=customer_id, page=page)
    lines = format_payment_allocation_lines(allocations)
    total_paid = sum(a['amount'] for a in allocations)
    flash(
        f'Đã ghi nhận thanh toán {money(total_paid)}.\nPhân bổ thanh toán:\n' + '\n'.join(lines),
        'success',
    )
    return debt_redirect(customer_id=customer_id, page=page)

@app.route('/debt/export')
def debt_export():
    normalize_order_statuses()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['Khách hàng', 'SĐT', 'Tổng công nợ', 'Đã thanh toán', 'Còn nợ', 'Số đơn', 'Trạng thái'])
    for row in build_debt_customer_rows(request.args.get('q', '').strip()):
        c = row['customer']
        writer.writerow([
            c.name,
            c.phone or '',
            row['total'],
            row['paid'],
            row['remaining'],
            row['order_count'],
            row['status'],
        ])
    return Response(
        '\ufeff' + buf.getvalue(),
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename=cong-no.csv'},
    )

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

def seed_product_taxonomy():
    tree = {
        'Điện thoại': ['Smartphone', 'Tablet', 'Phụ kiện điện thoại'],
        'Camera': ['Action camera', 'Máy ảnh', 'Phụ kiện camera'],
        'Laptop': ['Laptop gaming', 'Laptop văn phòng', 'Phụ kiện laptop'],
        'Phụ kiện': ['Tai nghe', 'Sạc & cáp', 'Ốp lưng'],
        'Âm thanh': ['Loa', 'Micro', 'Amply'],
        'Thiết bị thông minh': ['Smartwatch', 'Nhà thông minh'],
    }
    brand_map = {
        'Samsung': 'Điện thoại',
        'Apple': 'Điện thoại',
        'DJI': 'Camera',
        'Sony': 'Camera',
        'Asus': 'Laptop',
        'JBL': 'Âm thanh',
    }
    parent_by_name = {}
    for parent_name, children in tree.items():
        parent = Category(name=parent_name)
        db.session.add(parent)
        db.session.flush()
        parent_by_name[parent_name] = parent
        for child_name in children:
            db.session.add(Category(name=child_name, parent_id=parent.id))
    db.session.flush()
    for brand_name, parent_name in brand_map.items():
        parent = parent_by_name.get(parent_name)
        db.session.add(Brand(name=brand_name, category_id=parent.id if parent else None))
    db.session.commit()

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
    ensure_order_columns()
    ensure_payment_columns()
    CONTRACT_SIGNED_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ORDER_HANDOVER_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    PAYMENT_RECEIPT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ensure_company_profile()
    ensure_category_brand_schema()
    if seed and Customer.query.count() == 0:
        c = Customer(name='CÔNG TY CP XĂNG DẦU DẦU KHÍ NINH BÌNH', tax_code='2700275814', address='Khu công nghiệp Ninh Phúc, Phường Đông Hoa Lư, Tỉnh Ninh Bình', phone='0229.3854065', representative='Ông Quách Trọng Phụng', position='Phó Giám đốc', bank_account='4830006372', bank_name='BIDV chi nhánh Ninh Bình')
        db.session.add(c)
    if seed and not parent_categories():
        seed_product_taxonomy()
    if seed and Product.query.count() == 0:
        phone_cat = find_category_id_by_path('Điện thoại > Smartphone') or find_category_id_by_path('Điện thoại')
        cam_cat = find_category_id_by_path('Camera > Action camera') or find_category_id_by_path('Camera')
        samsung = Brand.query.filter_by(name='Samsung').first()
        dji = Brand.query.filter_by(name='DJI').first()
        demos = [
            Product(sku='A53-128-BLK', name='Samsung A53 6/128 Đen', category_id=phone_cat, brand_id=samsung.id if samsung else None, model='A53', variant='6/128 Đen', retail_price=5000000, project_price=4800000, stock=10, warranty='12 tháng'),
            Product(sku='DJI-A4-COMBO', name='DJI Action 4 Adventure Combo', category_id=cam_cat, brand_id=dji.id if dji else None, model='Action 4', variant='Adventure Combo', retail_price=8900000, project_price=8500000, stock=3, warranty='12 tháng'),
        ]
        for p in demos:
            sync_product_taxonomy_strings(p)
        db.session.add_all(demos)
    if seed and Order.query.count() == 0:
        customer = Customer.query.first()
        if customer:
            demo_orders = [
                ('DH-2026-0001', 'Hoàn thành', 17800000, 17800000),
                ('DH-2026-0002', 'Đang xử lý', 5500000, 0),
                ('DH-2026-0003', 'Đang xử lý', 12300000, 5000000),
                ('DH-2026-0004', 'Hoàn thành', 8900000, 8900000),
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
