(function () {
  var quoteCatalog = [];
  var rowSeq = 0;
  var previewTimer = null;
  var previewBusy = false;

  var PRICE_LISTS = {
    retail: { label: 'Giá lẻ', field: 'retail_price' },
    dealer: { label: 'Giá sỉ / đại lý', field: 'dealer_price' },
    project: { label: 'Giá công trình', field: 'project_price' },
  };

  function parseCatalog() {
    var el = document.getElementById('quote-catalog-data');
    if (!el) return [];
    try {
      return JSON.parse(el.textContent || '[]');
    } catch (e) {
      return [];
    }
  }

  function fmtMoney(n) {
    return (parseInt(n, 10) || 0).toLocaleString('vi-VN') + ' đ';
  }

  function fmtMoneySigned(n) {
    var v = parseInt(n, 10) || 0;
    if (!v) return '0 đ';
    return '-' + v.toLocaleString('vi-VN') + ' đ';
  }

  function parseMoneyInput(value) {
    if (typeof window.parseMoneyInput === 'function') {
      return window.parseMoneyInput(value);
    }
    return parseInt(String(value || '').replace(/\D/g, ''), 10) || 0;
  }

  function formatMoneyInputValue(value) {
    if (typeof window.formatMoneyInputValue === 'function') {
      return window.formatMoneyInputValue(value);
    }
    var digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    return (parseInt(digits, 10) || 0).toLocaleString('vi-VN');
  }

  function resolveQuoteForm(el) {
    if (!el) return null;
    if (el.matches && el.matches('form.quote-form')) return el;
    if (el.closest) return el.closest('form.quote-form');
    return null;
  }

  function getFormTbody(form) {
    return form ? form.querySelector('.quote-items-body') : null;
  }

  function getPriceListType(form) {
    var el = form ? form.querySelector('.quote-price-list') : document.getElementById('quote-price-list');
    return el && el.value ? el.value : 'dealer';
  }

  function getPriceListLabel(type) {
    return (PRICE_LISTS[type] || PRICE_LISTS.dealer).label;
  }

  function getProductPrice(product, listType) {
    if (!product) return 0;
    var field = (PRICE_LISTS[listType] || PRICE_LISTS.dealer).field;
    return product[field] || product.retail_price || 0;
  }

  /** Giá bảng giá theo đơn vị dòng (mét / cuộn / lô) — giá trong catalog theo sale_unit_mode mặc định. */
  function getProductPriceForUnit(product, listType, unitMode) {
    var price = getProductPrice(product, listType);
    if (!product || !quoteHasConversion(product)) return price;
    var factor = parseFloat(product.conversion_factor) || 1;
    if (factor <= 0) return price;
    var defMode = quoteDefaultUnitMode(product);
    var mode = unitMode || defMode;
    if (mode === defMode) return price;
    var perBase = defMode === 'purchase' ? Math.round(price / factor) : price;
    if (mode === 'base') return perBase;
    if (mode === 'purchase') return Math.round(perBase * factor);
    if (mode === 'lot') {
      var lf = parseFloat(product.lot_factor) || 1;
      if (lf <= 0) return price;
      var perPurchase = defMode === 'base' ? Math.round(perBase * factor) : price;
      return Math.round(perPurchase * lf);
    }
    return price;
  }

  function applyRowPriceFromUnit(row, product, options) {
    if (!row || !product) return;
    options = options || {};
    var form = resolveQuoteForm(row);
    var priceInput = row.querySelector('input[name="price"]');
    if (!priceInput || options.keepPrice) return;
    var mode = getRowUnitMode(row);
    var price = getProductPriceForUnit(product, getPriceListType(form), mode);
    priceInput.value = formatMoneyInputValue(String(price));
    updateRowAmount(row);
  }

  function stockAmountClass(status) {
    if (status === 'out') return 'is-out';
    if (status === 'low') return 'is-low';
    return 'is-ok';
  }

  function lineCatalogKey(productId, variantLabel) {
    var vl = variantLabel || '';
    return vl ? String(productId) + ':' + vl : String(productId);
  }

  function getRowCatalogKey(row) {
    if (!row) return '';
    var pid = row.querySelector('input[name="product_id"]');
    var vl = row.querySelector('input[name="variant_label"]');
    if (!pid || !pid.value) return '';
    return lineCatalogKey(pid.value, vl ? vl.value : '');
  }

  function getSelectedCatalogKeys(excludeRow) {
    var form = resolveQuoteForm(excludeRow);
    var keys = new Set();
    if (!form) return keys;
    form.querySelectorAll('.quote-items-body .quote-line-row').forEach(function (row) {
      if (row === excludeRow) return;
      var key = getRowCatalogKey(row);
      if (key) keys.add(key);
    });
    return keys;
  }

  function findProduct(id, variantLabel) {
    var vl = variantLabel || '';
    return quoteCatalog.find(function (p) {
      return String(p.id) === String(id) && (p.variant_label || '') === vl;
    });
  }

  function findCatalogEntry(entry) {
    if (!entry) return null;
    if (entry.catalog_key) {
      var byKey = quoteCatalog.find(function (p) {
        return p.catalog_key === entry.catalog_key;
      });
      if (byKey) return byKey;
    }
    return findProduct(entry.productId || entry.product_id || entry.id, entry.variantLabel || entry.variant_label);
  }

  var productPickerScrollHandler = null;

  function getQuotePickerMenu(picker) {
    if (!picker) return null;
    return picker._floatedMenu || picker.querySelector('.quote-product-picker-menu');
  }

  function getQuotePickerFloatRoot(picker) {
    if (!picker) return document.body;
    return picker.closest('.modal') || document.body;
  }

  function floatQuotePickerMenuToBody(picker) {
    var menu = getQuotePickerMenu(picker);
    if (!menu) return null;
    var root = getQuotePickerFloatRoot(picker);
    if (menu.parentElement !== root) {
      root.appendChild(menu);
      menu._quotePickerOwner = picker;
      picker._floatedMenu = menu;
    }
    return menu;
  }

  function dockProductPickerMenu(menu) {
    if (!menu) return;
    var picker = menu._quotePickerOwner;
    if (picker && !picker.contains(menu)) {
      picker.appendChild(menu);
      delete menu._quotePickerOwner;
      delete picker._floatedMenu;
    }
    menu.classList.remove('open', 'is-floating', 'is-drop-up');
    menu.style.removeProperty('top');
    menu.style.removeProperty('left');
    menu.style.removeProperty('width');
    menu.style.removeProperty('max-height');
    menu.style.removeProperty('bottom');
  }

  function positionProductPickerMenu(picker, menu) {
    var anchor = picker.querySelector('.quote-product-picker-btn, .quote-line-product-display');
    if (!anchor) return;
    var rect = anchor.getBoundingClientRect();
    var gap = 6;
    var pad = 12;
    var listMax = 260;
    var searchH = 54;
    var spaceBelow = window.innerHeight - rect.bottom - gap - pad;
    var spaceAbove = rect.top - gap - pad;
    var dropUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    var maxH = Math.min(searchH + listMax, dropUp ? spaceAbove : spaceBelow);

    menu.classList.add('is-floating');
    menu.style.width = Math.max(rect.width, 280) + 'px';
    menu.style.left = Math.max(pad, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 280) - pad)) + 'px';
    menu.style.maxHeight = Math.max(maxH, 120) + 'px';
    if (dropUp) {
      menu.classList.add('is-drop-up');
      menu.style.top = 'auto';
      menu.style.bottom = (window.innerHeight - rect.top + gap) + 'px';
    } else {
      menu.classList.remove('is-drop-up');
      menu.style.bottom = 'auto';
      menu.style.top = (rect.bottom + gap) + 'px';
    }
  }

  function unbindProductPickerScrollListeners() {
    if (!productPickerScrollHandler) return;
    window.removeEventListener('scroll', productPickerScrollHandler, true);
    window.removeEventListener('resize', productPickerScrollHandler);
    document.querySelectorAll('.quote-lines-table-wrap, .quote-create-body, .modal-body, .modal-dialog-scrollable').forEach(function (el) {
      el.removeEventListener('scroll', productPickerScrollHandler);
    });
    productPickerScrollHandler = null;
  }

  function bindProductPickerScrollListeners(picker) {
    unbindProductPickerScrollListeners();
    productPickerScrollHandler = function () {
      var menu = picker._floatedMenu || picker.querySelector('.quote-product-picker-menu.open');
      if (menu && menu.classList.contains('open')) positionProductPickerMenu(picker, menu);
    };
    window.addEventListener('scroll', productPickerScrollHandler, true);
    window.addEventListener('resize', productPickerScrollHandler);
    document.querySelectorAll('.quote-lines-table-wrap, .quote-create-body, .modal-body, .modal-dialog-scrollable').forEach(function (el) {
      el.addEventListener('scroll', productPickerScrollHandler, { passive: true });
    });
  }

  function closeAllProductMenus(exceptPicker) {
    document.querySelectorAll('.quote-product-picker-menu.open').forEach(function (menu) {
      if (exceptPicker && menu._quotePickerOwner === exceptPicker) return;
      if (exceptPicker && exceptPicker.contains(menu)) return;
      dockProductPickerMenu(menu);
    });
    unbindProductPickerScrollListeners();
  }

  function renderProductMenu(picker, row) {
    var menu = getQuotePickerMenu(picker);
    if (!menu) return;
    var list = menu.querySelector('.quote-product-list');
    var search = menu.querySelector('.quote-product-search');
    if (!list) return;
    var q = search ? String(search.value || '').trim() : '';
    var selected = getSelectedCatalogKeys(row);
    var currentKey = getRowCatalogKey(row);
    list.innerHTML = '';

    quoteCatalog.forEach(function (p) {
      var key = p.catalog_key || lineCatalogKey(p.id, p.variant_label);
      var hay = p.sku + ' ' + p.name + ' ' + (p.display_name || '') + ' ' + (p.spec || '') + ' ' + p.label;
      if (q) {
        var matched = typeof window.vnSearchMatch === 'function'
          ? window.vnSearchMatch(hay, q)
          : hay.toLowerCase().indexOf(q.toLowerCase()) !== -1;
        if (!matched) return;
      }

      var usedElsewhere = selected.has(key) && key !== currentKey;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quote-product-item' + (usedElsewhere ? ' is-disabled' : '');
      btn.disabled = usedElsewhere;
      btn.dataset.id = String(p.id);
      btn.dataset.variant = p.variant_label || '';
      btn.dataset.catalogKey = key;
      btn.innerHTML =
        '<span class="quote-product-item-thumb">' +
        (p.image_url
          ? '<img src="' + p.image_url + '" alt="" referrerpolicy="no-referrer">'
          : '<i class="bi bi-image"></i>') +
        '</span><span class="quote-product-item-text">' +
        '<span class="quote-product-item-sku">' + p.sku + '</span>' +
        '<span class="quote-product-item-name">' + (p.display_name || p.name) + '</span>' +
        (p.spec ? '<span class="quote-product-item-spec">' + p.spec + '</span>' : '') +
        '</span>' +
        '<span class="stock-status-badge status-' + (p.stock_status || 'ok') + '">' +
        p.stock_label +
        '</span>' +
        (usedElsewhere ? '<span class="quote-product-item-badge">Đã thêm</span>' : '');

      if (!usedElsewhere) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var form = resolveQuoteForm(row);
          setRowProduct(row, p);
          closeAllProductMenus();
          syncAllProductMenus();
          recalcQuoteTotals(form, true);
          scheduleQuotePreview({ immediate: true });
        });
      }
      list.appendChild(btn);
    });

    if (!list.children.length) {
      var empty = document.createElement('div');
      empty.className = 'quote-product-empty';
      empty.textContent = q
        ? 'Không tìm thấy sản phẩm'
        : 'Không có sản phẩm đang bán. Bật lại trạng thái bán tại trang Sản phẩm.';
      list.appendChild(empty);
    }
  }

  function syncAllProductMenus() {
    document.querySelectorAll('.quote-product-picker').forEach(function (picker) {
      var row = picker.closest('.quote-line-row');
      var menu = getQuotePickerMenu(picker);
      if (menu && menu.classList.contains('open')) {
        renderProductMenu(picker, row);
        positionProductPickerMenu(picker, menu);
      }
    });
  }

  function renderProductCell(row, product) {
    var cell = row.querySelector('.quote-line-product-cell');
    var oldPicker = cell.querySelector('.quote-product-picker');
    if (oldPicker && oldPicker._floatedMenu) {
      dockProductPickerMenu(oldPicker._floatedMenu);
    }
    if (!product) {
      cell.innerHTML =
        '<input type="hidden" name="product_id" value="">' +
        '<input type="hidden" name="variant_label" value="">' +
        '<div class="quote-product-picker">' +
        '<button type="button" class="quote-product-picker-btn is-placeholder">' +
        '<span class="quote-product-picker-placeholder">Chọn sản phẩm</span>' +
        '<i class="bi bi-chevron-down quote-product-picker-caret"></i></button>' +
        '<div class="quote-product-picker-menu">' +
        '<div class="quote-product-search-wrap">' +
        '<i class="bi bi-search"></i>' +
        '<input type="text" class="quote-product-search" placeholder="Nhập tên hoặc mã sản phẩm..." autocomplete="off">' +
        '</div><div class="quote-product-list"></div></div></div>';
      initProductPicker(cell.querySelector('.quote-product-picker'), row);
      return;
    }

    cell.innerHTML =
      '<input type="hidden" name="product_id" value="' + product.id + '">' +
      '<input type="hidden" name="variant_label" value="' + (product.variant_label || '') + '">' +
      '<div class="quote-product-picker">' +
      '<button type="button" class="quote-line-product-display">' +
      '<span class="quote-line-product-thumb">' +
      (product.image_url
        ? '<img src="' + product.image_url + '" alt="" referrerpolicy="no-referrer">'
        : '<i class="bi bi-image"></i>') +
      '</span>' +
      '<span class="quote-line-product-text">' +
      '<span class="quote-line-product-title">' + (product.label || (product.sku + ' - ' + (product.display_name || product.name))) + '</span>' +
      (product.spec ? '<span class="quote-line-product-spec">' + product.spec + '</span>' : '') +
      '</span>' +
      '<i class="bi bi-chevron-down quote-product-picker-caret"></i></button>' +
      '<div class="quote-product-picker-menu">' +
      '<div class="quote-product-search-wrap">' +
      '<i class="bi bi-search"></i>' +
      '<input type="text" class="quote-product-search" placeholder="Nhập tên hoặc mã sản phẩm..." autocomplete="off">' +
      '</div><div class="quote-product-list"></div></div></div>';
    initProductPicker(cell.querySelector('.quote-product-picker'), row);
  }

  function quoteHasConversion(product) {
    if (!product) return false;
    if (window.ProductUnits) return ProductUnits.hasConversion(product);
    var factor = parseFloat(product.conversion_factor) || 1;
    var pu = (product.purchase_unit || '').trim();
    var bu = (product.base_unit || product.unit || '').trim();
    var diff = pu && bu && pu.toLowerCase() !== bu.toLowerCase();
    if (factor <= 0 || (!diff && factor === 1)) return false;
    if (product.unit_conversion_enabled) return diff || factor !== 1;
    return diff && factor !== 1;
  }

  function quoteDefaultUnitMode(product) {
    if (!product) return 'base';
    return product.sale_unit_mode || (quoteHasConversion(product) ? 'purchase' : 'base');
  }

  function quoteUnitOptions(product) {
    if (!product || !quoteHasConversion(product)) return [];
    var opts = [{ mode: 'base', label: product.base_unit || product.unit || 'cái' }];
    var pu = (product.purchase_unit || '').trim();
    var bu = (product.base_unit || product.unit || '').trim();
    if (pu && bu && pu.toLowerCase() !== bu.toLowerCase()) {
      opts.push({ mode: 'purchase', label: pu });
    }
    if (window.ProductUnits && ProductUnits.hasLot(product)) {
      opts.push({ mode: 'lot', label: product.lot_unit || 'Lô' });
    } else if (product.has_lot_unit && product.lot_unit) {
      opts.push({ mode: 'lot', label: product.lot_unit });
    }
    return opts.length > 1 ? opts : [];
  }

  function renderQuoteUnitCell(row, product, selectedMode) {
    var cell = row.querySelector('.quote-line-unit-cell');
    if (!cell) return;
    if (!product) {
      cell.innerHTML = '<span class="text-muted">—</span>';
      return;
    }
    var mode = selectedMode || quoteDefaultUnitMode(product);
    var opts = quoteUnitOptions(product);
    if (!opts.length) {
      cell.innerHTML =
        '<span class="quote-line-unit-label">' + (product.unit || 'cái') + '</span>' +
        '<input type="hidden" name="qty_unit_mode" value="base">';
      return;
    }
    var html =
      '<div class="quote-line-unit-picker" data-quote-unit-picker>' +
      '<input type="hidden" name="qty_unit_mode" value="' + mode + '" data-quote-qty-unit-mode>' +
      '<select class="form-select form-select-sm quote-unit-mode-select" data-quote-unit-mode-select>';
    opts.forEach(function (opt) {
      html +=
        '<option value="' + opt.mode + '"' + (opt.mode === mode ? ' selected' : '') + '>' + opt.label + '</option>';
    });
    html += '</select></div>';
    cell.innerHTML = html;
    var sel = cell.querySelector('[data-quote-unit-mode-select]');
    var hidden = cell.querySelector('[data-quote-qty-unit-mode]');
    if (sel) {
      sel.addEventListener('change', function (e) {
        e.stopPropagation();
        hidden.value = sel.value;
        updateRowStock(row, product);
        applyRowPriceFromUnit(row, product);
        var form = resolveQuoteForm(row);
        recalcQuoteTotals(form, true);
        scheduleQuotePreview({ immediate: true });
      });
    }
  }

  function getRowUnitMode(row) {
    var inp = row.querySelector('[data-quote-qty-unit-mode]');
    return (inp && inp.value) || 'base';
  }

  function updateRowStock(row, product) {
    var stockCell = row.querySelector('.quote-line-stock');
    if (!stockCell) return;
    if (!product) {
      stockCell.innerHTML = '<span class="quote-stock-empty">—</span>';
      return;
    }
    var mode = getRowUnitMode(row);
    var displayQty = product.stock || 0;
    var unitLabel = product.unit || product.base_unit || 'cái';
    if (quoteHasConversion(product)) {
      displayQty = window.ProductUnits
        ? ProductUnits.baseToDisplay(product, product.stock || 0, mode)
        : product.stock || 0;
      unitLabel =
        mode === 'lot' &&
          ((window.ProductUnits && ProductUnits.hasLot(product)) || product.has_lot_unit)
          ? product.lot_unit
          : mode === 'purchase'
            ? product.purchase_unit
            : product.base_unit || product.unit;
    }
    stockCell.innerHTML =
      '<span class="quote-stock-qty ' + stockAmountClass(product.stock_status) + '">' +
      (window.ProductUnits ? ProductUnits.formatQty(displayQty) : displayQty.toLocaleString('vi-VN')) +
      '</span>' +
      '<span class="quote-stock-unit">' + unitLabel + '</span>';
  }

  function setRowProduct(row, product, options) {
    if (!product) return;
    options = options || {};
    var form = resolveQuoteForm(row);
    renderProductCell(row, product);
    row.dataset.productId = String(product.id);
    renderQuoteUnitCell(row, product, options.qty_unit_mode);
    var priceInput = row.querySelector('input[name="price"]');
    if (!options.keepPrice) {
      applyRowPriceFromUnit(row, product, { keepPrice: false });
    }
    updateRowStock(row, product);
    updateRowAmount(row);
  }

  function clearRowProduct(row) {
    renderProductCell(row, null);
    row.dataset.productId = '';
    renderQuoteUnitCell(row, null);
    row.querySelector('input[name="price"]').value = '';
    updateRowStock(row, null);
    updateRowAmount(row);
  }

  function updateRowAmount(row) {
    var qty = parseFloat(row.querySelector('input[name="qty"]').value) || 0;
    var price = parseMoneyInput(row.querySelector('input[name="price"]').value);
    var lineDisc = parseFloat(row.querySelector('input[name="line_discount"]').value) || 0;
    var gross = qty * price;
    var amount = Math.round(gross * (1 - lineDisc / 100));
    row.querySelector('.quote-line-amount').textContent = fmtMoney(amount);
    row.dataset.amount = String(amount);
  }

  function renumberRows(form) {
    if (!form) return;
    form.querySelectorAll('.quote-items-body .quote-line-row').forEach(function (row, idx) {
      row.querySelector('.quote-line-num').textContent = String(idx + 1);
    });
  }

  function recalcQuoteTotals(form, skipPreview) {
    if (!form) form = document.getElementById('create-quote-form');
    if (!form) return;
    var subtotal = 0;
    form.querySelectorAll('.quote-items-body .quote-line-row').forEach(function (row) {
      subtotal += parseInt(row.dataset.amount || '0', 10) || 0;
    });
    var discountPctEl = form.querySelector('.quote-discount-percent');
    var vatRateEl = form.querySelector('.quote-vat-rate');
    var discountPct = parseFloat(discountPctEl && discountPctEl.value) || 0;
    var vatRate = parseFloat(vatRateEl && vatRateEl.value) || 0;
    var discount = Math.round((subtotal * discountPct) / 100);
    var afterDiscount = Math.max(subtotal - discount, 0);
    var vat = Math.round((afterDiscount * vatRate) / 100);
    var total = afterDiscount + vat;

    var discountAmount = form.querySelector('.quote-discount-amount');
    if (discountAmount) discountAmount.value = String(discount);
    var subtotalEl = form.querySelector('.quote-summary-subtotal');
    if (subtotalEl) subtotalEl.textContent = fmtMoney(subtotal);
    var discountLabel = form.querySelector('.quote-summary-discount-label');
    if (discountLabel) discountLabel.textContent = 'Tổng chiết khấu (' + discountPct + '%)';
    var discountEl = form.querySelector('.quote-summary-discount');
    if (discountEl) discountEl.textContent = fmtMoneySigned(discount);
    var vatLabel = form.querySelector('.quote-summary-vat-label');
    if (vatLabel) vatLabel.textContent = 'VAT (' + vatRate + '%)';
    var vatEl = form.querySelector('.quote-summary-vat');
    if (vatEl) vatEl.textContent = fmtMoney(vat);
    var totalEl = form.querySelector('.quote-summary-total');
    if (totalEl) totalEl.textContent = fmtMoney(total);
    if (!skipPreview && form.id === 'create-quote-form') scheduleQuotePreview();
  }

  function getPreviewUrl() {
    var el = document.getElementById('quote-preview-url');
    if (!el) return '/quotes/preview';
    try {
      return JSON.parse(el.textContent || '""') || '/quotes/preview';
    } catch (e) {
      return '/quotes/preview';
    }
  }

  function getCustomerOptionsUrl() {
    var el = document.getElementById('quote-customer-options-url');
    if (!el) return '/customers/options.json';
    try {
      return JSON.parse(el.textContent || '""') || '/customers/options.json';
    } catch (e) {
      return '/customers/options.json';
    }
  }

  function getPickCustomerId() {
    var el = document.getElementById('quote-pick-customer-id');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent || 'null');
    } catch (e) {
      return null;
    }
  }

  function refreshQuoteCustomerOptions(selectedId) {
    var select = document.getElementById('quote-customer-select');
    if (!select) return Promise.resolve();

    var current = selectedId != null ? String(selectedId) : select.value || '';

    return fetch(getCustomerOptionsUrl(), {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load customers');
        return res.json();
      })
      .then(function (data) {
        var rows = (data && data.customers) || [];
        select.innerHTML = '<option value="">Khách vãng lai</option>';
        rows.forEach(function (c) {
          var opt = document.createElement('option');
          opt.value = String(c.id);
          opt.textContent = c.name;
          select.appendChild(opt);
        });
        if (current && rows.some(function (c) { return String(c.id) === current; })) {
          select.value = current;
        } else {
          select.value = '';
        }
      })
      .catch(function () {
        /* keep existing options */
      });
  }

  function openCreateQuoteModalWithCustomer(customerId) {
    var modalEl = document.getElementById('createQuoteModal');
    if (!modalEl || !window.bootstrap) return;
    refreshQuoteCustomerOptions(customerId).finally(function () {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });
  }

  function clearQuoteCustomerPickParam() {
    var params = new URLSearchParams(window.location.search);
    if (!params.has('quote_customer_id')) return;
    params.delete('quote_customer_id');
    var qs = params.toString();
    history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  function isPreviewOpen() {
    var panel = document.getElementById('quote-create-preview-panel');
    return panel && !panel.classList.contains('is-hidden');
  }

  function setPreviewOpen(open) {
    var panel = document.getElementById('quote-create-preview-panel');
    var resizer = document.getElementById('quote-create-resizer');
    var dialog = document.querySelector('#createQuoteModal .quote-create-dialog');
    var btn = document.getElementById('btn-toggle-quote-preview');
    if (!panel) return;
    if (open) {
      panel.classList.remove('is-hidden');
      if (resizer) resizer.classList.remove('is-hidden');
      if (dialog) dialog.classList.add('has-preview');
      if (btn) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
      }
      applyQuotePreviewWidth(getStoredPreviewWidth());
      scheduleQuotePreview({ immediate: true });
    } else {
      panel.classList.add('is-hidden');
      if (resizer) resizer.classList.add('is-hidden');
      if (dialog) dialog.classList.remove('has-preview');
      if (btn) {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-pressed', 'false');
      }
    }
  }

  var PREVIEW_WIDTH_KEY = 'quoteCreatePreviewWidth';
  var PREVIEW_DOC_WIDTH = 794;
  var PREVIEW_MIN_WIDTH = 300;

  function getPreviewLayout() {
    return document.querySelector('#createQuoteModal .quote-create-layout');
  }

  function getMaxPreviewWidth() {
    var layout = getPreviewLayout();
    if (!layout) return 720;
    return Math.floor(layout.clientWidth * 0.72);
  }

  function updatePreviewScale(width) {
    var layout = getPreviewLayout();
    if (!layout) return;
    var available = Math.max(width - 24, 200);
    var scale = Math.min(1, Math.max(0.48, available / PREVIEW_DOC_WIDTH));
    layout.style.setProperty('--quote-preview-scale', String(Math.round(scale * 1000) / 1000));
  }

  function applyQuotePreviewWidth(width) {
    var layout = getPreviewLayout();
    var panel = document.getElementById('quote-create-preview-panel');
    if (!layout || !panel) return;
    var maxW = getMaxPreviewWidth();
    var w = Math.max(PREVIEW_MIN_WIDTH, Math.min(width || 480, maxW));
    layout.style.setProperty('--quote-preview-width', w + 'px');
    panel.style.width = w + 'px';
    updatePreviewScale(w);
    try {
      localStorage.setItem(PREVIEW_WIDTH_KEY, String(w));
    } catch (e) {}
    return w;
  }

  function getStoredPreviewWidth() {
    try {
      var saved = parseInt(localStorage.getItem(PREVIEW_WIDTH_KEY), 10);
      if (saved >= PREVIEW_MIN_WIDTH) return saved;
    } catch (e) {}
    var layout = getPreviewLayout();
    if (layout && layout.clientWidth) {
      return Math.max(420, Math.floor(layout.clientWidth * 0.42));
    }
    return 480;
  }

  function initQuotePreviewResize() {
    var layout = getPreviewLayout();
    var resizer = document.getElementById('quote-create-resizer');
    if (!layout || !resizer) return;

    applyQuotePreviewWidth(getStoredPreviewWidth());

    var dragging = false;

    function stopDrag() {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('is-dragging');
      document.body.classList.remove('quote-create-resizing');
    }

    function onMove(clientX) {
      var rect = layout.getBoundingClientRect();
      applyQuotePreviewWidth(rect.right - clientX);
    }

    resizer.addEventListener('mousedown', function (e) {
      if (!isPreviewOpen() || e.button !== 0) return;
      dragging = true;
      resizer.classList.add('is-dragging');
      document.body.classList.add('quote-create-resizing');
      onMove(e.clientX);
      e.preventDefault();
    });

    resizer.addEventListener('dblclick', function () {
      applyQuotePreviewWidth(Math.max(480, Math.floor(layout.clientWidth * 0.45)));
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      onMove(e.clientX);
    });

    document.addEventListener('mouseup', stopDrag);
    window.addEventListener('blur', stopDrag);

    window.addEventListener('resize', function () {
      if (!isPreviewOpen()) return;
      applyQuotePreviewWidth(getStoredPreviewWidth());
    });
  }

  function scheduleQuotePreview(opts) {
    if (!isPreviewOpen()) return;
    clearTimeout(previewTimer);
    var immediate = opts && opts.immediate;
    if (immediate) {
      refreshQuotePreview();
      return;
    }
    previewTimer = setTimeout(refreshQuotePreview, 280);
  }

  function refreshQuotePreview() {
    if (!isPreviewOpen()) return;
    var form = document.getElementById('create-quote-form');
    var host = document.getElementById('quote-create-preview-body');
    if (!form || !host || previewBusy) return;

    recalcQuoteTotals(form, true);
    previewBusy = true;
    host.innerHTML =
      '<div class="quote-create-preview-loading">' +
      '<div class="spinner-border spinner-border-sm text-primary" role="status"></div>' +
      '<span>Đang cập nhật xem trước...</span></div>';

    fetch(getPreviewUrl(), {
      method: 'POST',
      body: new FormData(form),
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Preview failed');
        return res.text();
      })
      .then(function (html) {
        host.innerHTML = html;
        applyQuotePreviewWidth(getStoredPreviewWidth());
      })
      .catch(function () {
        host.innerHTML =
          '<div class="quote-create-preview-empty">' +
          '<i class="bi bi-exclamation-circle"></i>' +
          '<p>Không tải được xem trước. Vui lòng thử lại.</p></div>';
      })
      .finally(function () {
        previewBusy = false;
      });
  }

  function bindQuotePreviewAutoRefresh(form) {
    if (!form || form.dataset.quotePreviewAuto === '1') return;
    form.dataset.quotePreviewAuto = '1';
    form.addEventListener('change', function () {
      scheduleQuotePreview({ immediate: true });
    });
    form.addEventListener('input', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.classList && t.classList.contains('quote-product-search')) return;
      scheduleQuotePreview();
    });
  }

  function initQuotePreviewPanel() {
    var btn = document.getElementById('btn-toggle-quote-preview');
    initQuotePreviewResize();
    var openByDefault = window.matchMedia('(min-width: 993px)').matches;
    setPreviewOpen(openByDefault);
    if (btn) {
      btn.addEventListener('click', function () {
        var willOpen = !isPreviewOpen();
        setPreviewOpen(willOpen);
        if (willOpen) scheduleQuotePreview({ immediate: true });
      });
    }
    var form = document.getElementById('create-quote-form');
    bindQuotePreviewAutoRefresh(form);
  }

  function applyPriceListToAllRows(form) {
    if (!form) form = document.getElementById('create-quote-form');
    if (!form) return;
    form.querySelectorAll('.quote-items-body .quote-line-row').forEach(function (row) {
      var productId = row.querySelector('input[name="product_id"]').value;
      if (!productId) return;
      var vlInput = row.querySelector('input[name="variant_label"]');
      var product = findProduct(productId, vlInput ? vlInput.value : '');
      if (!product) return;
      applyRowPriceFromUnit(row, product);
      updateRowAmount(row);
    });
    recalcQuoteTotals(form);
  }

  function bindProductPickerSearch(picker, row) {
    var menu = getQuotePickerMenu(picker);
    if (!menu || menu.dataset.searchBound === '1') return;
    menu.dataset.searchBound = '1';
    menu.addEventListener('input', function (e) {
      if (!e.target || !e.target.classList.contains('quote-product-search')) return;
      renderProductMenu(picker, row);
    });
    menu.addEventListener('click', function (e) {
      if (e.target && e.target.classList.contains('quote-product-search')) {
        e.stopPropagation();
      }
    });
  }

  function initProductPicker(picker, row) {
    var btn = picker.querySelector('.quote-product-picker-btn, .quote-line-product-display');
    var menu = picker.querySelector('.quote-product-picker-menu');
    if (!btn || !menu) return;

    bindProductPickerSearch(picker, row);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var activeMenu = getQuotePickerMenu(picker) || menu;
      var isOpen = activeMenu.classList.contains('open');
      closeAllProductMenus(picker);
      if (!isOpen) {
        var floated = floatQuotePickerMenuToBody(picker) || activeMenu;
        floated.classList.add('open');
        renderProductMenu(picker, row);
        positionProductPickerMenu(picker, floated);
        bindProductPickerScrollListeners(picker);
        var search = floated.querySelector('.quote-product-search');
        if (search) {
          search.value = '';
          search.focus();
        }
      }
    });

    menu.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    menu.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });
  }

  function bindRowInputs(row) {
    var form = resolveQuoteForm(row);
    row.querySelector('input[name="qty"]').addEventListener('input', function () {
      updateRowAmount(row);
      recalcQuoteTotals(form);
    });
    row.querySelector('input[name="price"]').addEventListener('input', function () {
      updateRowAmount(row);
      recalcQuoteTotals(form);
    });
    row.querySelector('input[name="line_discount"]').addEventListener('input', function () {
      updateRowAmount(row);
      recalcQuoteTotals(form);
    });
    row.querySelector('.btn-remove-quote-row').addEventListener('click', function () {
      row.remove();
      renumberRows(form);
      syncAllProductMenus();
      recalcQuoteTotals(form);
    });
  }

  function addQuoteRow(form, product, options) {
    if (!form) form = document.getElementById('create-quote-form');
    var tbody = getFormTbody(form);
    if (!tbody) return null;
    options = options || {};
    rowSeq += 1;
    var row = document.createElement('tr');
    row.className = 'quote-line-row';
    row.dataset.rowId = String(rowSeq);
    row.innerHTML =
      '<td class="quote-line-num">1</td>' +
      '<td class="quote-line-product-cell"></td>' +
      '<td class="quote-line-stock"><span class="quote-stock-empty">—</span></td>' +
      '<td class="quote-line-unit-cell"><span class="text-muted">—</span></td>' +
      '<td><input type="number" name="qty" class="form-control form-control-sm quote-qty-input" value="1" min="0.0001" step="any"></td>' +
      '<td class="quote-line-price-cell">' +
      '<div class="money-input-wrap quote-price-input-wrap">' +
      '<input type="text" name="price" class="form-control form-control-sm money-input quote-price-input" inputmode="numeric" autocomplete="off" value="" placeholder="0">' +
      '<span class="money-input-suffix">đ</span></div>' +
      '</td>' +
      '<td><input type="number" name="line_discount" class="form-control form-control-sm quote-line-disc-input" value="0" min="0" max="100" step="0.1"></td>' +
      '<td class="quote-line-amount fw-semibold">0 đ</td>' +
      '<td class="text-end">' +
      '<button type="button" class="btn btn-sm btn-outline-danger btn-remove-quote-row" title="Xóa dòng"><i class="bi bi-trash"></i></button>' +
      '</td>';

    tbody.appendChild(row);
    row.dataset.amount = '0';
    renderProductCell(row, null);
    bindRowInputs(row);

    if (typeof window.initMoneyInputs === 'function') {
      window.initMoneyInputs(row);
    }

    if (product) {
      setRowProduct(row, product, options);
      if (options.qty != null) {
        row.querySelector('input[name="qty"]').value = String(options.qty);
      }
      if (options.price != null) {
        row.querySelector('input[name="price"]').value = formatMoneyInputValue(String(options.price));
      }
      updateRowAmount(row);
    }
    renumberRows(form);
    syncAllProductMenus();
    recalcQuoteTotals(form, true);
    return row;
  }

  function isWalkinCustomerSelected() {
    var select = document.getElementById('quote-customer-select');
    if (!select) return true;
    var walkinId = select.getAttribute('data-walkin-id') || '';
    var val = select.value || '';
    return !val || val === walkinId;
  }

  function syncQuoteWalkinNameField() {
    var wrap = document.getElementById('quote-walkin-name-wrap');
    var input = document.getElementById('quote-walkin-name-input');
    if (!wrap) return;
    var show = isWalkinCustomerSelected();
    wrap.classList.toggle('d-none', !show);
    if (!show && input) input.value = '';
  }

  function initQuoteWalkinCustomerField() {
    var select = document.getElementById('quote-customer-select');
    if (!select) return;
    select.addEventListener('change', function () {
      syncQuoteWalkinNameField();
      scheduleQuotePreview({ immediate: true });
    });
    var nameInput = document.getElementById('quote-walkin-name-input');
    if (nameInput) {
      nameInput.addEventListener('input', scheduleQuotePreview);
    }
    syncQuoteWalkinNameField();
  }

  function resetCreateQuoteForm(form) {
    if (!form) form = document.getElementById('create-quote-form');
    var tbody = getFormTbody(form);
    if (tbody) tbody.innerHTML = '';
    rowSeq = 0;
    addQuoteRow(form);
    recalcQuoteTotals(form, true);
    var note = document.getElementById('quote-note-input');
    var noteCount = document.getElementById('quote-note-count');
    if (note && noteCount) {
      note.value = '';
      noteCount.textContent = '0';
    }
    var noteCollapse = document.getElementById('quote-note-collapse');
    if (noteCollapse && window.bootstrap) {
      bootstrap.Collapse.getOrCreateInstance(noteCollapse, { toggle: false }).hide();
    }
    var walkinName = document.getElementById('quote-walkin-name-input');
    if (walkinName) walkinName.value = '';
    syncQuoteWalkinNameField();
  }

  function normalizeRowsBeforeSubmit(form) {
    if (!form) return;
    form.querySelectorAll('.quote-items-body .quote-line-row').forEach(function (row) {
      var priceInput = row.querySelector('input[name="price"]');
      var lineDisc = parseFloat(row.querySelector('input[name="line_discount"]').value) || 0;
      var rawPrice = parseMoneyInput(priceInput.value);
      var effective = Math.round(rawPrice * (1 - lineDisc / 100));
      priceInput.value = effective ? String(effective) : '0';
    });
  }

  function loadQuoteCartItems(items) {
    var form = document.getElementById('create-quote-form');
    if (!form) return;
    var tbody = getFormTbody(form);
    if (tbody) tbody.innerHTML = '';
    rowSeq = 0;
    (items || []).forEach(function (item) {
      var product = findCatalogEntry(item);
      if (!product) return;
      addQuoteRow(form, product, { qty: item.qty || 1 });
    });
    if (!tbody || !tbody.children.length) addQuoteRow(form);
    recalcQuoteTotals(form, true);
    if (typeof window.initMoneyInputs === 'function') {
      window.initMoneyInputs(form);
    }
  }

  function loadEditQuoteForm(form) {
    var dataEl = form.querySelector('.quote-edit-items-data');
    var items = [];
    if (dataEl) {
      try {
        items = JSON.parse(dataEl.textContent || '[]');
      } catch (e) {
        items = [];
      }
    }
    var tbody = getFormTbody(form);
    if (tbody) tbody.innerHTML = '';
    if (!items.length) {
      addQuoteRow(form);
      return;
    }
    items.forEach(function (item) {
      var product = findProduct(item.product_id, item.variant_label || '');
      if (!product) return;
      addQuoteRow(form, product, {
        keepPrice: true,
        qty: item.qty,
        price: item.price,
        qty_unit_mode: item.qty_unit_mode,
      });
    });
    if (!tbody.children.length) addQuoteRow(form);
    recalcQuoteTotals(form, true);
    if (typeof window.initMoneyInputs === 'function') {
      window.initMoneyInputs(form);
    }
  }

  function bindQuoteForm(form) {
    if (!form || form.dataset.quoteBound === '1') return;
    form.dataset.quoteBound = '1';

    var addBtn = form.querySelector('.quote-add-row-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        addQuoteRow(form);
      });
    }

    var priceList = form.querySelector('.quote-price-list');
    if (priceList) {
      priceList.addEventListener('change', function () {
        applyPriceListToAllRows(form);
      });
    }

    form.querySelectorAll('.quote-calc-input').forEach(function (el) {
      el.addEventListener('input', function () {
        recalcQuoteTotals(form);
      });
    });

    form.addEventListener('submit', function (e) {
      recalcQuoteTotals(form, true);
      normalizeRowsBeforeSubmit(form);
      var hasProduct = false;
      form.querySelectorAll('.quote-items-body input[name="product_id"]').forEach(function (input) {
        if (input.value) hasProduct = true;
      });
      if (!hasProduct) {
        e.preventDefault();
        alert('Vui lòng thêm ít nhất một sản phẩm vào báo giá');
      }
    });
  }

  function moveQuoteModalsToBody() {
    document.querySelectorAll('.quote-page-modal, #createQuoteModal').forEach(function (modalEl) {
      if (modalEl.parentElement !== document.body) {
        document.body.appendChild(modalEl);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    quoteCatalog = parseCatalog();
    moveQuoteModalsToBody();

    document.querySelectorAll('form.quote-form').forEach(bindQuoteForm);

    var noteInput = document.getElementById('quote-note-input');
    var noteCount = document.getElementById('quote-note-count');
    if (noteInput && noteCount) {
      noteInput.addEventListener('input', function () {
        noteCount.textContent = String(noteInput.value.length);
      });
    }

    document.addEventListener('click', function (e) {
      if (e.target.closest('.quote-product-picker-menu')) return;
      if (e.target.closest('.quote-product-picker-btn, .quote-line-product-display')) return;
      closeAllProductMenus();
    });

    var createModal = document.getElementById('createQuoteModal');
    initQuoteWalkinCustomerField();

    if (createModal) {
      initQuotePreviewPanel();
      createModal.addEventListener('shown.bs.modal', function () {
        quoteCatalog = parseCatalog();
        var form = document.getElementById('create-quote-form');
        var tbody = getFormTbody(form);
        if (tbody && !tbody.children.length) addQuoteRow(form);
        if (typeof window.initMoneyInputs === 'function') {
          window.initMoneyInputs(createModal);
        }
        refreshQuoteCustomerOptions(getPickCustomerId()).finally(function () {
          if (isPreviewOpen()) scheduleQuotePreview({ immediate: true });
        });
      });
      createModal.addEventListener('hidden.bs.modal', function () {
        closeAllProductMenus();
        var form = document.getElementById('create-quote-form');
        if (form) form.reset();
        var priceListEl = form && form.querySelector('.quote-price-list');
        if (priceListEl) priceListEl.value = 'dealer';
        resetCreateQuoteForm(form);
      });
    }

    document.querySelectorAll('.quote-edit-modal').forEach(function (modalEl) {
      modalEl.addEventListener('shown.bs.modal', function () {
        quoteCatalog = parseCatalog();
        var form = modalEl.querySelector('form.quote-form');
        if (form) loadEditQuoteForm(form);
      });
      modalEl.addEventListener('hidden.bs.modal', function () {
        closeAllProductMenus();
      });
    });

    window.addEventListener('focus', function () {
      if (!createModal || !createModal.classList.contains('show')) return;
      refreshQuoteCustomerOptions().then(function () {
        if (isPreviewOpen()) scheduleQuotePreview();
      });
    });

    var pickCustomerId = getPickCustomerId();
    if (pickCustomerId) {
      openCreateQuoteModalWithCustomer(pickCustomerId);
      clearQuoteCustomerPickParam();
    }

    if (document.getElementById('create-quote-form')) {
      resetCreateQuoteForm(document.getElementById('create-quote-form'));
    }

    document.querySelectorAll('.quote-delete-form').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        var code = form.getAttribute('data-code') || 'báo giá này';
        var msg =
          'Xóa báo giá "' +
          code +
          '"?\n\nĐơn hàng liên quan (nếu chưa thanh toán) cũng sẽ bị gỡ. Thao tác không thể hoàn tác.';
        if (!confirm(msg)) e.preventDefault();
      });
    });
  });

  window.QuoteFormApi = {
    addQuoteRow: addQuoteRow,
    findProduct: findProduct,
    loadQuoteCartItems: loadQuoteCartItems,
    resetCreateQuoteForm: resetCreateQuoteForm,
    recalcQuoteTotals: recalcQuoteTotals,
    refreshCatalog: function () {
      quoteCatalog = parseCatalog();
    },
  };
})();
