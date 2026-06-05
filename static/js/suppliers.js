var supplierProductOptionsCache = null;
var supplierPickerScrollHandler = null;
var supplierQuickProductTargetPicker = null;

function fetchSupplierProductOptions() {
  if (supplierProductOptionsCache) {
    return Promise.resolve(supplierProductOptionsCache);
  }
  return fetch('/products/options.json', {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
    .then(function (res) {
      if (!res.ok) throw new Error('Failed to load products');
      return res.json();
    })
    .then(function (data) {
      supplierProductOptionsCache = (data && data.products) || [];
      return supplierProductOptionsCache;
    });
}

function findSupplierProduct(id) {
  return (supplierProductOptionsCache || []).find(function (p) {
    return String(p.id) === String(id);
  });
}

function supplierPickerProductInput(picker) {
  if (!picker) return null;
  var field = picker.getAttribute('data-product-field') || 'sp_product_id';
  return picker.querySelector('input[name="' + field + '"]');
}

function supplierProductHasConversion(p) {
  if (window.ProductUnits) return ProductUnits.hasConversion(p);
  if (!p) return false;
  var factor = parseFloat(p.conversion_factor) || 1;
  var pu = (p.purchase_unit || '').trim();
  var bu = (p.base_unit || p.unit || '').trim();
  var diff = pu && bu && pu.toLowerCase() !== bu.toLowerCase();
  if (factor <= 0 || (!diff && factor === 1)) return false;
  if (p.unit_conversion_enabled) return diff || factor !== 1;
  return diff && factor !== 1;
}

function supplierProductHasLot(p) {
  return !!(p && p.has_lot_unit && p.lot_unit && parseFloat(p.lot_factor) > 1);
}

function formatSupplierQtyPlain(value) {
  var v = parseFloat(value);
  if (isNaN(v)) return '0';
  if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
  return String(v).replace('.', ',');
}

function getSupplierQtyUnitMode(row) {
  var hidden = row && row.querySelector('input[data-supplier-qty-unit-mode]');
  if (hidden) return hidden.value || 'base';
  return 'base';
}

function supplierQtyModeUnitLabel(product, mode) {
  if (!product) return '—';
  var pu = product.purchase_unit || product.base_unit || '';
  var bu = product.base_unit || product.unit || '';
  if (mode === 'lot' && supplierProductHasLot(product)) return product.lot_unit || 'Lô';
  if (mode === 'purchase' && supplierProductHasConversion(product)) return pu;
  return bu;
}

function setSupplierQtyUnitMode(row, mode, userTouched) {
  if (!row) return;
  var hidden = row.querySelector('input[data-supplier-qty-unit-mode]');
  if (hidden) hidden.value = mode;
  if (userTouched) row.dataset.supplierQtyModeTouched = '1';
  row.querySelectorAll('[data-supplier-qty-unit-btn]').forEach(function (btn) {
    var active = btn.getAttribute('data-mode') === mode && !btn.disabled;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function resolveSupplierIntakeQtyClient(product, entered, unitMode) {
  var qty = parseFloat(entered) || 0;
  if (!supplierProductHasConversion(product)) {
    return { purchaseQty: qty, baseQty: qty, mode: 'base' };
  }
  var factor = parseFloat(product.conversion_factor) || 1;
  if (unitMode === 'base') {
    var baseQty = qty;
    var purchaseQty = factor > 0 ? qty / factor : qty;
    return { purchaseQty: purchaseQty, baseQty: baseQty, mode: 'base' };
  }
  if (unitMode === 'lot' && supplierProductHasLot(product)) {
    var lf = parseFloat(product.lot_factor) || 1;
    var purchaseQtyLot = qty * lf;
    return {
      purchaseQty: purchaseQtyLot,
      baseQty: purchaseQtyLot * factor,
      mode: 'lot',
    };
  }
  var purchaseQty = qty;
  var baseQty = qty * factor;
  return { purchaseQty: purchaseQty, baseQty: baseQty, mode: 'purchase' };
}

function syncSupplierQtyUnitMode(row, product) {
  var modeWrap = row.querySelector('[data-supplier-qty-unit-mode-wrap]');
  var modeHidden = row.querySelector('input[data-supplier-qty-unit-mode]');
  var convBadge = row.querySelector('[data-supplier-conv-badge]');
  var setupHint = row.querySelector('[data-supplier-qty-setup-hint]');
  var modeHint = row.querySelector('[data-supplier-qty-mode-hint]');
  var qtyLabel = row.querySelector('[data-supplier-qty-unit-label]');
  var qtySuffix = row.querySelector('[data-supplier-qty-unit-suffix]');
  var qtyInput = row.querySelector('[data-supplier-qty-input]');
  var lotBtn = row.querySelector('[data-supplier-qty-mode-lot]');
  var purchaseBtn = row.querySelector('[data-supplier-qty-unit-btn][data-mode="purchase"]');
  var baseBtn = row.querySelector('[data-supplier-qty-unit-btn][data-mode="base"]');
  var hasProduct = !!(product && product.id);
  var hasConv = hasProduct && supplierProductHasConversion(product);
  var hasLot = hasConv && supplierProductHasLot(product);
  var pu = hasProduct ? product.purchase_unit || 'ĐV nhập' : '—';
  var bu = hasProduct ? product.base_unit || product.unit || 'ĐV tồn' : '—';

  if (modeWrap) modeWrap.classList.toggle('is-awaiting-product', !hasProduct);
  if (setupHint) setupHint.classList.toggle('d-none', !hasProduct || hasConv);
  if (qtyInput) qtyInput.disabled = !hasProduct;
  if (modeHidden) {
    if (!hasProduct) modeHidden.value = 'base';
  }

  if (lotBtn) {
    lotBtn.textContent = hasLot ? (product.lot_unit || 'Lô') : 'Lô';
    lotBtn.disabled = !hasLot;
    lotBtn.classList.toggle('d-none', !hasLot);
  }
  if (purchaseBtn) {
    purchaseBtn.textContent = hasConv ? pu : bu;
    purchaseBtn.disabled = !hasProduct || !hasConv;
    purchaseBtn.classList.toggle('d-none', hasProduct && !hasConv);
  }
  if (baseBtn) {
    baseBtn.textContent = bu;
    baseBtn.disabled = !hasProduct;
  }

  var mode = getSupplierQtyUnitMode(row);
  if (hasProduct) {
    if (!hasConv) {
      mode = 'base';
    } else if (!row.dataset.supplierQtyModeTouched) {
      mode = hasLot ? 'lot' : 'purchase';
    } else if (!hasLot && mode === 'lot') {
      mode = 'purchase';
    } else if (mode === 'purchase' && !hasConv) {
      mode = 'base';
    }
    setSupplierQtyUnitMode(row, mode, false);
  } else {
    setSupplierQtyUnitMode(row, 'base', false);
  }

  mode = getSupplierQtyUnitMode(row);
  var unitName = supplierQtyModeUnitLabel(product, mode);
  if (qtyLabel) {
    qtyLabel.textContent = hasProduct ? 'Số lượng (' + unitName + ')' : 'Số lượng';
  }
  if (qtySuffix) qtySuffix.textContent = hasProduct ? unitName : '—';
  if (qtyInput && hasProduct) {
    qtyInput.placeholder = 'VD: 2 ' + unitName;
  } else if (qtyInput) {
    qtyInput.placeholder = '0';
  }
  if (modeHint) {
    if (!hasProduct) {
      modeHint.textContent = 'Chọn sản phẩm để bật Lô / Hộp / đơn vị tồn.';
    } else if (hasLot) {
      modeHint.textContent =
        '1 ' +
        (product.lot_unit || 'Lô') +
        ' = ' +
        formatSupplierQtyPlain(product.lot_factor) +
        ' ' +
        pu;
    } else if (hasConv) {
      modeHint.textContent = '1 ' + pu + ' = ' + formatSupplierQtyPlain(product.conversion_factor) + ' ' + bu;
    } else {
      modeHint.textContent = 'Nhập theo ' + bu + ' (SP không quy đổi đơn vị).';
    }
  }
  if (convBadge) {
    convBadge.classList.add('d-none');
    convBadge.textContent = '';
  }
}

function updateSupplierRowQtyHint(row) {
  if (!row) return;
  var picker = row.querySelector('.supplier-product-picker');
  var input = picker && supplierPickerProductInput(picker);
  var qtyInput = row.querySelector('.supplier-intake-qty');
  var unitLabel = row.querySelector('[data-supplier-qty-unit-label]');
  var hint = row.querySelector('[data-supplier-qty-convert-hint]');
  var costHint = row.querySelector('[data-supplier-cost-unit-hint]');
  var product = input && input.value ? findSupplierProduct(input.value) : null;

  syncSupplierQtyUnitMode(row, product);

  var unitMode = getSupplierQtyUnitMode(row);
  var pu = product ? (product.purchase_unit || product.base_unit || '') : '';
  var bu = product ? (product.base_unit || product.unit || '') : '';

  if (costHint) {
    if (!product) {
      costHint.textContent = '/ đơn vị nhập';
    } else if (supplierProductHasConversion(product)) {
      costHint.textContent = '/ ' + pu + ' (giá vốn chia đều → ' + bu + ')';
    } else {
      costHint.textContent = '/ ' + bu;
    }
  }
  var costInput = row.querySelector('input[name="sp_cost_price"]');
  var costPerBaseHint = row.querySelector('[data-supplier-cost-per-base-hint]');
  if (costPerBaseHint && product && supplierProductHasConversion(product)) {
    var purchaseCost = parseFloat((costInput && costInput.value ? costInput.value : '0').replace(/\D/g, '')) || 0;
    var factor = parseFloat(product.conversion_factor) || 1;
    if (purchaseCost > 0 && factor > 0) {
      var baseCost = Math.round(purchaseCost / factor);
      costPerBaseHint.textContent =
        '→ ' + baseCost.toLocaleString('vi-VN') + ' đ/' + bu + ' (' + purchaseCost.toLocaleString('vi-VN') + ' đ/' + pu + ' ÷ ' + formatSupplierQtyPlain(factor) + ')';
      costPerBaseHint.classList.remove('d-none');
    } else {
      costPerBaseHint.classList.add('d-none');
      costPerBaseHint.textContent = '';
    }
  } else if (costPerBaseHint) {
    costPerBaseHint.classList.add('d-none');
    costPerBaseHint.textContent = '';
  }
  if (!hint || !product || !qtyInput) {
    if (hint) hint.textContent = '';
    return;
  }
  var entered = parseFloat(qtyInput.value || '0') || 0;
  if (entered <= 0) {
    hint.textContent = '';
    return;
  }
  var resolved = resolveSupplierIntakeQtyClient(product, entered, unitMode);
  if (!supplierProductHasConversion(product)) {
    hint.textContent = 'Nhập kho: ' + formatSupplierQtyPlain(resolved.baseQty) + ' ' + bu;
    return;
  }
  if (unitMode === 'base') {
    hint.textContent =
      '→ Tồn kho +' + formatSupplierQtyPlain(resolved.baseQty) + ' ' + bu +
      ' (≈ ' + formatSupplierQtyPlain(resolved.purchaseQty) + ' ' + pu + ')';
  } else if (unitMode === 'lot' && supplierProductHasLot(product)) {
    hint.textContent =
      '→ Tồn kho +' +
      formatSupplierQtyPlain(resolved.baseQty) +
      ' ' +
      bu +
      ' (' +
      formatSupplierQtyPlain(entered) +
      ' ' +
      (product.lot_unit || 'Lô') +
      ' = ' +
      formatSupplierQtyPlain(resolved.purchaseQty) +
      ' ' +
      pu +
      ')';
  } else {
    hint.textContent =
      '→ Tồn kho +' + formatSupplierQtyPlain(resolved.baseQty) + ' ' + bu +
      ' (' + formatSupplierQtyPlain(entered) + ' ' + pu + ' × ' + formatSupplierQtyPlain(product.conversion_factor) + ')';
  }
}

function supplierProductLabel(p) {
  return (p.sku || '') + ' — ' + (p.name || '');
}

function setSupplierProductPickerValue(picker, product) {
  var input = supplierPickerProductInput(picker);
  var btn = picker.querySelector('.supplier-product-picker-btn');
  var label = picker.querySelector('.supplier-product-picker-label');
  if (!input || !btn || !label) return;

  if (product) {
    input.value = String(product.id);
    input.required = true;
    label.textContent = supplierProductLabel(product);
    btn.classList.remove('is-placeholder');
  } else {
    input.value = '';
    input.required = false;
    label.textContent = '— Chọn sản phẩm —';
    btn.classList.add('is-placeholder');
  }
}

function applySupplierProductCost(row, product) {
  if (!row || !product) return;
  var panel = row.closest('[data-supplier-products-panel]');
  if (panel && panel.getAttribute('data-skip-auto-cost') === '1') return;
  var costInput =
    row.querySelector('input[name="sp_cost_price"]') || row.querySelector('input[name="catalog_cost_price"]');
  if (!costInput || costInput.value) return;
  var cost = product.purchase_cost_price || product.cost_price || 0;
  if (cost <= 0) return;
  if (typeof formatMoneyInputValue === 'function') {
    costInput.value = formatMoneyInputValue(String(cost));
  } else {
    costInput.value = String(cost);
  }
  if (typeof window.initMoneyInputs === 'function') {
    window.initMoneyInputs(row);
  }
}

function getSupplierPickerMenu(picker) {
  if (!picker) return null;
  if (picker._floatedMenu) return picker._floatedMenu;
  return picker.querySelector('.supplier-product-picker-menu');
}

function floatSupplierPickerMenuToBody(picker) {
  var menu = getSupplierPickerMenu(picker);
  if (!menu) return null;
  if (menu.parentElement !== document.body) {
    document.body.appendChild(menu);
    menu._supplierPickerOwner = picker;
    picker._floatedMenu = menu;
  }
  return menu;
}

function dockSupplierProductPickerMenu(menu) {
  if (!menu) return;
  var picker = menu._supplierPickerOwner;
  if (picker && menu.parentElement === document.body) {
    picker.appendChild(menu);
    delete menu._supplierPickerOwner;
    delete picker._floatedMenu;
  }
  menu.classList.remove('open', 'is-floating', 'is-drop-up');
  menu.style.removeProperty('top');
  menu.style.removeProperty('left');
  menu.style.removeProperty('width');
  menu.style.removeProperty('max-height');
  menu.style.removeProperty('bottom');
}

function positionSupplierProductPickerMenu(picker, menu) {
  var anchor = picker.querySelector('.supplier-product-picker-btn');
  if (!anchor) return;
  var rect = anchor.getBoundingClientRect();
  var gap = 6;
  var pad = 12;
  var listMax = 240;
  var searchH = 50;
  var spaceBelow = window.innerHeight - rect.bottom - gap - pad;
  var spaceAbove = rect.top - gap - pad;
  var dropUp = spaceBelow < 160 && spaceAbove > spaceBelow;
  var maxH = Math.min(searchH + listMax, dropUp ? spaceAbove : spaceBelow);

  menu.classList.add('is-floating');
  menu.style.width = Math.max(rect.width, 300) + 'px';
  menu.style.left = Math.max(pad, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 300) - pad)) + 'px';
  menu.style.maxHeight = Math.max(maxH, 140) + 'px';
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

function unbindSupplierPickerScrollListeners() {
  if (!supplierPickerScrollHandler) return;
  window.removeEventListener('scroll', supplierPickerScrollHandler, true);
  window.removeEventListener('resize', supplierPickerScrollHandler);
  document.querySelectorAll('.supplier-products-table-wrap, .modal-body, .supplier-intake-modal').forEach(function (el) {
    el.removeEventListener('scroll', supplierPickerScrollHandler);
  });
  supplierPickerScrollHandler = null;
}

function bindSupplierPickerScrollListeners(picker) {
  unbindSupplierPickerScrollListeners();
  supplierPickerScrollHandler = function () {
    var menu = getSupplierPickerMenu(picker);
    if (menu && menu.classList.contains('open')) positionSupplierProductPickerMenu(picker, menu);
  };
  window.addEventListener('scroll', supplierPickerScrollHandler, true);
  window.addEventListener('resize', supplierPickerScrollHandler);
  document.querySelectorAll(
    '.supplier-products-table-wrap, .modal-body, .supplier-intake-modal, .supplier-detail-modal, .supplier-catalog-table-wrap'
  ).forEach(function (el) {
    el.addEventListener('scroll', supplierPickerScrollHandler, { passive: true });
  });
}

function closeAllSupplierProductPickers(exceptPicker) {
  document.querySelectorAll('.supplier-product-picker-menu.open').forEach(function (menu) {
    if (exceptPicker && (exceptPicker.contains(menu) || menu._supplierPickerOwner === exceptPicker)) return;
    dockSupplierProductPickerMenu(menu);
  });
  unbindSupplierPickerScrollListeners();
}

function getSupplierIdFromPicker(picker) {
  if (!picker) return null;
  var catalogPanel = picker.closest('[data-supplier-catalog-panel]');
  if (catalogPanel) return catalogPanel.getAttribute('data-supplier-id');
  var intakeModal = picker.closest('.supplier-intake-import-modal, [id^="productsModal"]');
  if (intakeModal) return intakeModal.getAttribute('data-supplier-id');
  return null;
}

function appendSupplierProductPickerFooter(picker, list, search) {
  var footer = document.createElement('div');
  footer.className = 'supplier-product-picker-footer';
  var q = (search && search.value ? search.value : '').trim();
  if (!list.children.length) {
    var empty = document.createElement('div');
    empty.className = 'supplier-product-empty';
    empty.textContent = q
      ? 'Không có trong danh mục cửa hàng'
      : 'Gõ SKU hoặc tên để tìm';
    list.appendChild(empty);
  }
  var hint = document.createElement('p');
  hint.className = 'supplier-product-empty-hint small-muted mb-2';
  hint.textContent = q
    ? '「' + q + '」 chưa có — thêm mới vào danh mục trước khi nhập kho.'
    : 'Chưa chọn sản phẩm — tìm trong danh mục hoặc thêm mới.';
  footer.appendChild(hint);
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-primary w-100 supplier-product-quick-add-btn';
  btn.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Thêm sản phẩm mới';
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    openSupplierQuickProductModal(picker, q);
  });
  footer.appendChild(btn);
  list.appendChild(footer);
}

function openSupplierQuickProductModal(picker, searchQuery) {
  var modalEl = document.getElementById('supplierQuickProductModal');
  var form = document.getElementById('supplierQuickProductForm');
  if (!modalEl || !form || !window.bootstrap) return;
  var sid = getSupplierIdFromPicker(picker);
  var sidInput = document.getElementById('supplierQuickProductSupplierId');
  if (sidInput) sidInput.value = sid || '';
  supplierQuickProductTargetPicker = picker || null;
  var err = document.getElementById('supplierQuickProductError');
  if (err) {
    err.classList.add('d-none');
    err.textContent = '';
  }
  var skuIn = document.getElementById('supplierQuickProductSku');
  var nameIn = document.getElementById('supplierQuickProductName');
  var costIn = document.getElementById('supplierQuickProductCost');
  if (skuIn) skuIn.value = '';
  if (nameIn) nameIn.value = '';
  if (costIn) costIn.value = '';
  var q = (searchQuery || '').trim();
  if (q) {
    if (/^[a-z0-9._-]+$/i.test(q) && q.indexOf(' ') === -1) {
      if (skuIn) skuIn.value = q;
    } else if (nameIn) {
      nameIn.value = q;
    }
  }
  if (typeof window.initMoneyInputs === 'function') {
    window.initMoneyInputs(modalEl);
  }
  if (typeof initProductUnitSetup === 'function') {
    initProductUnitSetup(modalEl);
  }
  closeAllSupplierProductPickers();
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
  if (skuIn && !skuIn.value && nameIn && nameIn.value) {
    nameIn.focus();
  } else if (skuIn) {
    skuIn.focus();
  }
}

function applyQuickCreatedProductToPicker(picker, product) {
  if (!picker || !product) return;
  var row = picker.closest('.supplier-product-row') || picker.closest('[data-supplier-catalog-add-row]');
  if (row) {
    delete row.dataset.supplierQtyModeTouched;
    row.dataset.supplierProductId = String(product.id);
  }
  setSupplierProductPickerValue(picker, product);
  if (row) {
    var costFromModal = document.getElementById('supplierQuickProductCost');
    var costInput = row.querySelector('input[name="sp_cost_price"]');
    if (costInput && costFromModal && costFromModal.value) {
      costInput.value = costFromModal.value;
      if (typeof window.initMoneyInputs === 'function') {
        window.initMoneyInputs(row);
      }
    } else {
      applySupplierProductCost(row, product);
    }
    updateSupplierRowQtyHint(row);
    var qtyInput = row.querySelector('[data-supplier-qty-input]');
    if (qtyInput) qtyInput.focus();
    updateSupplierCatalogCostHint(row.closest('[data-supplier-catalog-panel]'), product);
  }
}

function initSupplierQuickProductModal() {
  var form = document.getElementById('supplierQuickProductForm');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var sid = (document.getElementById('supplierQuickProductSupplierId') || {}).value;
    if (!sid) return;
    var errEl = document.getElementById('supplierQuickProductError');
    var submitBtn = document.getElementById('supplierQuickProductSubmit');
    if (submitBtn) submitBtn.disabled = true;
    if (errEl) {
      errEl.classList.add('d-none');
      errEl.textContent = '';
    }
    var formData = new FormData(form);
    fetch('/suppliers/' + sid + '/products/quick-create', {
      method: 'POST',
      body: formData,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.error) || 'Không thêm được sản phẩm');
          return data;
        });
      })
      .then(function (data) {
        supplierProductOptionsCache = null;
        return fetchSupplierProductOptions().then(function () {
          var product = (data && data.product) || findSupplierProduct(String(data.product.id));
          var picker = supplierQuickProductTargetPicker;
          var quickModal = document.getElementById('supplierQuickProductModal');
          if (quickModal && window.bootstrap) {
            bootstrap.Modal.getInstance(quickModal)?.hide();
          }
          if (picker && product) {
            applyQuickCreatedProductToPicker(picker, product);
          }
          if (data.linked_existing && errEl) {
            // brief info via hint only
          }
        });
      })
      .catch(function (err) {
        var msg = err.message || 'Lỗi thêm sản phẩm';
        if (typeof window.showAppToast === 'function') {
          window.showAppToast(msg, 'danger');
        } else if (errEl) {
          errEl.textContent = msg;
          errEl.classList.remove('d-none');
        } else {
          alert(msg);
        }
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
}

function renderSupplierProductMenu(picker) {
  var menu = getSupplierPickerMenu(picker);
  if (!menu) return;
  var list = menu.querySelector('.supplier-product-list');
  var search = menu.querySelector('.supplier-product-search');
  if (!list) return;

  var q = (search && search.value ? search.value : '').toLowerCase().trim();
  var inputEl = supplierPickerProductInput(picker);
  var currentId = inputEl ? inputEl.value : '';
  list.innerHTML = '';

  (supplierProductOptionsCache || []).forEach(function (p) {
    var hay = ((p.sku || '') + ' ' + (p.name || '')).toLowerCase();
    if (q && hay.indexOf(q) === -1) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'supplier-product-item' + (String(p.id) === String(currentId) ? ' is-selected' : '');
    btn.dataset.id = String(p.id);
    btn.innerHTML =
      '<span class="supplier-product-item-text">' +
      '<span class="supplier-product-item-sku">' + (p.sku || '') + '</span>' +
      '<span class="supplier-product-item-name">' + (p.name || '') + '</span>' +
      '</span>' +
      '<span class="supplier-product-item-stock">Tồn: ' + (p.stock || 0).toLocaleString('vi-VN') + ' ' + (p.base_unit || '') + '</span>' +
      (supplierProductHasConversion(p)
        ? '<span class="supplier-product-item-conv">' +
          '1 ' +
          (p.purchase_unit || '') +
          ' = ' +
          formatSupplierQtyPlain(p.conversion_factor) +
          ' ' +
          (p.base_unit || '') +
          (supplierProductHasLot(p)
            ? ' · 1 ' + (p.lot_unit || 'Lô') + ' = ' + formatSupplierQtyPlain(p.lot_factor) + ' ' + (p.purchase_unit || '')
            : '') +
          '</span>'
        : '');

    btn.addEventListener('click', function () {
      var row =
        picker.closest('.supplier-product-row') || picker.closest('[data-supplier-catalog-add-row]');
      if (row && String(row.dataset.supplierProductId || '') !== String(p.id)) {
        delete row.dataset.supplierQtyModeTouched;
        row.dataset.supplierProductId = String(p.id);
      }
      setSupplierProductPickerValue(picker, p);
      applySupplierProductCost(row, p);
      updateSupplierCatalogCostHint(picker.closest('[data-supplier-catalog-panel]'), p);
      updateSupplierRowQtyHint(row);
      if (row && row.closest('.po-products-panel') && typeof window.poOnProductSelected === 'function') {
        window.poOnProductSelected(row, p);
      }
      dockSupplierProductPickerMenu(getSupplierPickerMenu(picker));
      unbindSupplierPickerScrollListeners();
    });
    list.appendChild(btn);
  });

  appendSupplierProductPickerFooter(picker, list, search);
}

function syncSupplierProductPickerLabels(panel) {
  if (!panel || !supplierProductOptionsCache) return;
  panel.querySelectorAll('.supplier-product-picker').forEach(function (picker) {
    var input = supplierPickerProductInput(picker);
    if (!input || !input.value) return;
    var product = findSupplierProduct(input.value);
    if (product) setSupplierProductPickerValue(picker, product);
  });
}

function initSupplierProductPicker(picker) {
  if (!picker || picker.dataset.supplierPickerInit === '1') return;
  picker.dataset.supplierPickerInit = '1';

  var btn = picker.querySelector('.supplier-product-picker-btn');
  var menu = getSupplierPickerMenu(picker);
  var search = menu ? menu.querySelector('.supplier-product-search') : null;
  if (!btn || !menu) return;

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var isOpen = menu.classList.contains('open');
    closeAllSupplierProductPickers(picker);
    if (!isOpen) {
      fetchSupplierProductOptions().then(function () {
        var floated = floatSupplierPickerMenuToBody(picker) || menu;
        floated.classList.add('open');
        renderSupplierProductMenu(picker);
        positionSupplierProductPickerMenu(picker, floated);
        bindSupplierPickerScrollListeners(picker);
        if (search) {
          search.value = '';
          renderSupplierProductMenu(picker);
          search.focus();
        }
      });
    }
  });

  menu.addEventListener('click', function (e) {
    e.stopPropagation();
  });

  if (search) {
    search.addEventListener('input', function () {
      renderSupplierProductMenu(picker);
    });
    search.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }
}

function bindSupplierProductRow(row) {
  var picker = row.querySelector('.supplier-product-picker');
  var qtyInput = row.querySelector('.supplier-intake-qty');
  if (picker) initSupplierProductPicker(picker);
  if (qtyInput) {
    qtyInput.addEventListener('input', function () {
      updateSupplierRowQtyHint(row);
    });
  }
  var costInput = row.querySelector('input[name="sp_cost_price"]');
  if (costInput) {
    costInput.addEventListener('input', function () {
      updateSupplierRowQtyHint(row);
    });
  }
  if (row.dataset.supplierQtyBtnsBound !== '1') {
    row.dataset.supplierQtyBtnsBound = '1';
    row.querySelectorAll('[data-supplier-qty-unit-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        var mode = btn.getAttribute('data-mode');
        if (!mode) return;
        setSupplierQtyUnitMode(row, mode, true);
        updateSupplierRowQtyHint(row);
      });
    });
  }
  updateSupplierRowQtyHint(row);
}

function updateSupplierProductsEmpty(panel) {
  var tbody = panel.querySelector('.supplier-products-body');
  var empty = panel.querySelector('.supplier-products-empty');
  if (!tbody || !empty) return;
  empty.classList.toggle('d-none', tbody.children.length > 0);
}

function addSupplierProductRow(panel, options) {
  if (!panel) return null;
  options = options || {};
  var tbody = panel.querySelector('.supplier-products-body');
  var tpl = panel.querySelector('.supplier-product-row-template');
  if (!tbody || !tpl || !tpl.content) return null;
  var row = tpl.content.firstElementChild.cloneNode(true);
  tbody.appendChild(row);
  row.dataset.productRowInit = '1';
  bindSupplierProductRow(row);
  if (typeof window.initMoneyInputs === 'function') {
    window.initMoneyInputs(row);
  }
  if (options.openPicker !== false) {
    var btn = row.querySelector('.supplier-product-picker-btn');
    if (btn) btn.click();
  }
  updateSupplierProductsEmpty(panel);
  return row;
}

function ensureSupplierProductsStarterRow(panel) {
  if (!panel) return;
  var tbody = panel.querySelector('.supplier-products-body');
  if (tbody && !tbody.children.length) {
    addSupplierProductRow(panel, { openPicker: false });
  }
}

function initSupplierProductsPanel(panel) {
  if (!panel) return;
  if (panel.dataset.supplierPanelBound !== '1') {
    panel.dataset.supplierPanelBound = '1';
    panel.addEventListener('click', function (e) {
      var removeBtn = e.target.closest('.supplier-product-remove-btn');
      if (!removeBtn) return;
      var row = removeBtn.closest('.supplier-product-row');
      if (!row || !panel.contains(row)) return;
      row.remove();
      updateSupplierProductsEmpty(panel);
    });
  }
  panel.querySelectorAll('.supplier-product-row').forEach(function (row) {
    if (row.dataset.productRowInit === '1') return;
    row.dataset.productRowInit = '1';
    bindSupplierProductRow(row);
  });
  updateSupplierProductsEmpty(panel);
  var addBtn = panel.querySelector('.supplier-products-add-btn');
  if (addBtn && addBtn.dataset.bound !== '1') {
    addBtn.dataset.bound = '1';
    addBtn.addEventListener('click', function () {
      addSupplierProductRow(panel);
    });
  }
}

function initSupplierProductsPanels(root) {
  (root || document).querySelectorAll('[data-supplier-products-panel]').forEach(initSupplierProductsPanel);
}

document.addEventListener('click', function () {
  closeAllSupplierProductPickers();
});

document.addEventListener('shown.bs.modal', function (e) {
  var modal = e.target;
  if (modal.classList.contains('supplier-intake-import-modal') && modal.getAttribute('data-show-preview') === '1') {
    var sid = modal.getAttribute('data-supplier-id');
    if (sid) activateSupplierIntakeTab(modal, 'supplierIntakeExcelTab' + sid);
  }
  modal.querySelectorAll('[data-supplier-products-panel]').forEach(function (panel) {
    fetchSupplierProductOptions().then(function () {
      syncSupplierProductPickerLabels(panel);
      initSupplierProductsPanel(panel);
      ensureSupplierProductsStarterRow(panel);
      panel.querySelectorAll('.supplier-product-row').forEach(function (row) {
        updateSupplierRowQtyHint(row);
      });
    });
  });
});

document.addEventListener('hidden.bs.modal', function () {
  closeAllSupplierProductPickers();
});

function formatSupplierMoney(n) {
  return (parseInt(n, 10) || 0).toLocaleString('vi-VN') + ' đ';
}

function initSupplierPaymentModals() {
  document.querySelectorAll('.supplier-intake-pay-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var supplierId = btn.getAttribute('data-bs-target');
      if (!supplierId) return;
      var modal = document.querySelector(supplierId);
      if (!modal) return;
      var form = modal.querySelector('.supplier-payment-form');
      if (!form) return;
      var url = btn.getAttribute('data-payment-url') || '#';
      form.action = url;
      var code = btn.getAttribute('data-intake-code') || '—';
      var balance = parseInt(btn.getAttribute('data-balance') || '0', 10) || 0;
      var ref = btn.getAttribute('data-ref') || '';
      var codeLabel = modal.querySelector('.supplier-payment-intake-label');
      var balanceLabel = modal.querySelector('.supplier-payment-balance-label');
      var amountInput = modal.querySelector('.supplier-payment-amount');
      if (codeLabel) {
        codeLabel.textContent = code + (ref ? ' · ' + ref : '');
      }
      if (balanceLabel) {
        balanceLabel.textContent = formatSupplierMoney(balance);
      }
      if (amountInput) {
        amountInput.value = balance > 0 ? String(balance) : '';
        amountInput.max = balance > 0 ? String(balance) : '';
      }
      var fileInput = form.querySelector('input[name="payment_receipt"]');
      if (fileInput) fileInput.value = '';
    });
  });

  document.querySelectorAll('.supplier-payment-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var fileInput = form.querySelector('input[name="payment_receipt"]');
      if (!fileInput || !fileInput.files || !fileInput.files.length) {
        e.preventDefault();
        alert('Vui lòng chụp hoặc upload ảnh bill thanh toán.');
        return;
      }
      var amountInput = form.querySelector('.supplier-payment-amount');
      var max = parseInt(amountInput && amountInput.max ? amountInput.max : '0', 10) || 0;
      var val = parseInt(amountInput && amountInput.value ? amountInput.value : '0', 10) || 0;
      if (val <= 0) {
        e.preventDefault();
        alert('Số tiền thanh toán không hợp lệ.');
      } else if (max > 0 && val > max) {
        e.preventDefault();
        alert('Số tiền không được vượt quá ' + formatSupplierMoney(max) + '.');
      }
    });
  });
}

function initSupplierIntakeImportModals() {
  if (typeof initImportPreviewPanel !== 'function') return;
  document.querySelectorAll('.supplier-intake-import-modal').forEach(function (modalEl) {
    var sid = modalEl.getAttribute('data-supplier-id');
    if (!sid) return;
    initImportPreviewPanel({
      modalId: 'productsModal' + sid,
      stepUploadId: 'supplierIntakeUpload' + sid,
      stepPreviewId: 'supplierIntakePreview' + sid,
      summaryId: 'supplierIntakeSummary' + sid,
      tbodyId: 'supplierIntakePreviewBody' + sid,
      selectAllId: 'supplierIntakeSelectAll' + sid,
      confirmFormId: 'supplierIntakeConfirm' + sid,
      btnBackId: 'supplierIntakeBack' + sid,
      previewQueryKey: 'intake_import_preview',
      emptyAlert: 'Vui lòng chọn ít nhất một dòng để nhập kho.',
      showUpdateChip: true,
    });
  });
}

function activateSupplierIntakeTab(modalEl, tabButtonId) {
  if (!modalEl || !window.bootstrap) return;
  var tabBtn = document.getElementById(tabButtonId);
  if (tabBtn) bootstrap.Tab.getOrCreateInstance(tabBtn).show();
}

function updateSupplierCatalogCostHint(panel, product) {
  if (!panel) return;
  var hint = panel.querySelector('[data-supplier-catalog-cost-hint]');
  if (!hint) return;
  if (!product) {
    hint.textContent = '/ đơn vị nhập';
    return;
  }
  var pu = product.purchase_unit || product.base_unit || '';
  var bu = product.base_unit || product.unit || '';
  if (supplierProductHasConversion(product)) {
    hint.textContent = '/ ' + pu + ' (≈ ' + bu + ' trong kho)';
  } else {
    hint.textContent = '/ ' + bu;
  }
}

function initSupplierCatalogPanels(root) {
  var scope = root || document;
  scope.querySelectorAll('[data-supplier-catalog-panel]').forEach(function (panel) {
    var picker = panel.querySelector('.supplier-product-picker');
    if (picker) initSupplierProductPicker(picker);
  });
  fetchSupplierProductOptions().then(function () {
    scope.querySelectorAll('[data-supplier-catalog-panel]').forEach(syncSupplierProductPickerLabels);
  });
  initSupplierCatalogForms(scope);
}

function showSupplierCatalogFlash(panel, message, category) {
  if (typeof window.showAppToast === 'function') {
    window.showAppToast(message, category);
  }
}

function resolveSupplierCatalogPanel(form) {
  if (!form) return null;
  var panel = form.closest('[data-supplier-catalog-panel]');
  if (panel) return panel;
  var page = document.querySelector('[data-supplier-entity-page]');
  var sid = page && page.getAttribute('data-supplier-id');
  if (!sid) {
    var m = (form.getAttribute('action') || '').match(/\/suppliers\/(\d+)\//);
    if (m) sid = m[1];
  }
  if (sid) {
    return document.querySelector('[data-supplier-catalog-panel][data-supplier-id="' + sid + '"]');
  }
  return null;
}

function closeSupplierLinkDrawer() {
  var drawer = document.querySelector('[data-supplier-link-drawer]');
  if (!drawer) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('hidden', '');
  document.body.classList.remove('supplier-link-drawer-open');
}

function catalogListCtxFromForm(form) {
  return {
    _q: (form.querySelector('[name="_q"]') || {}).value || '',
    _page: (form.querySelector('[name="_page"]') || {}).value || '1',
    _per_page: (form.querySelector('[name="_per_page"]') || {}).value || '10',
    _sort: (form.querySelector('[name="_sort"]') || {}).value || 'created_at',
    _order: (form.querySelector('[name="_order"]') || {}).value || 'desc',
  };
}

function catalogListCtxHiddenInputs(ctx) {
  ctx = ctx || {};
  var fromDetail =
    ctx._from_detail === '1' || ctx._from_detail === 1
      ? '<input type="hidden" name="_from_detail" value="1">'
      : '';
  return (
    fromDetail +
    '<input type="hidden" name="_q" value="' +
    (ctx._q || '').replace(/"/g, '&quot;') +
    '">' +
    '<input type="hidden" name="_page" value="' +
    (ctx._page || '1') +
    '">' +
    '<input type="hidden" name="_per_page" value="' +
    (ctx._per_page || '10') +
    '">' +
    '<input type="hidden" name="_sort" value="' +
    (ctx._sort || 'created_at') +
    '">' +
    '<input type="hidden" name="_order" value="' +
    (ctx._order || 'desc') +
    '">'
  );
}

function bumpSupplierCatalogTabCount(sid) {
  var tabBtn = document.getElementById('supplierCatalogTab' + sid);
  if (!tabBtn) return;
  var badge = tabBtn.querySelector('.badge');
  var count = badge ? (parseInt(badge.textContent, 10) || 0) + 1 : 1;
  if (badge) {
    badge.textContent = String(count);
  } else {
    var span = document.createElement('span');
    span.className = 'badge rounded-pill bg-light text-dark border ms-1';
    span.textContent = String(count);
    tabBtn.appendChild(span);
  }
}

function bindSupplierCatalogRemoveForm(form) {
  if (!form || form.dataset.removeBound === '1') return;
  form.dataset.removeBound = '1';
  form.addEventListener('submit', function (e) {
    var label = form.getAttribute('data-product-label') || 'sản phẩm này';
    if (!confirm('Gỡ ' + label + ' khỏi danh mục NCC?\n\nKhông xóa sản phẩm trong cửa hàng — chỉ bỏ liên kết.')) {
      e.preventDefault();
    }
  });
}

function escapeSupplierHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function supplierCatalogThumbHtml(p) {
  if (p && p.image_url) {
    return (
      '<div class="product-thumb product-thumb-sm"><img src="' +
      escapeSupplierHtml(p.image_url) +
      '" alt=""></div>'
    );
  }
  return '<div class="product-thumb product-thumb-sm"><i class="bi bi-image"></i></div>';
}

function buildSupplierCatalogRowHtml(link, listCtx, sid) {
  var p = link.product;
  var pu = link.purchase_unit || '';
  var bu = link.base_unit || '';
  var unitLabel = link.has_conversion ? pu : bu;
  var priceCell = link.cost_price
    ? '<span class="money fw-semibold">' +
      link.cost_display +
      ' đ</span><div class="small-muted">/ ' +
      escapeSupplierHtml(unitLabel) +
      '</div>'
    : '—';
  var convCell = link.conversion_text ? escapeSupplierHtml(link.conversion_text) : '—';
  var searchBlob = ((p && p.name) || '') + ' ' + ((p && p.sku) || '') + ' ' + (link.note || '');
  return (
    '<td><div class="supplier-catalog-product-cell">' +
    supplierCatalogThumbHtml(p) +
    '<div class="supplier-catalog-product-meta"><a href="' +
    p.detail_url +
    '" class="supplier-catalog-product-name">' +
    escapeSupplierHtml(p.name) +
    '</a><div class="supplier-catalog-product-sub"><span>SKU: <code class="sku-code">' +
    escapeSupplierHtml(p.sku) +
    '</code></span></div></div></div></td>' +
    '<td class="text-end text-nowrap">' +
    priceCell +
    '</td>' +
    '<td>' +
    escapeSupplierHtml(unitLabel || '—') +
    '</td>' +
    '<td class="supplier-catalog-conv-cell">' +
    convCell +
    '</td>' +
    '<td class="small-muted">' +
    escapeSupplierHtml(link.note || '—') +
    '</td>' +
    '<td class="text-end text-nowrap table-actions-cell">' +
    '<a href="' +
    p.edit_url +
    '" class="btn btn-sm btn-outline-secondary" title="Chỉnh sửa sản phẩm"><i class="bi bi-pencil"></i></a> ' +
    '<form method="post" action="/suppliers/' +
    sid +
    '/catalog/' +
    link.product_id +
    '/remove" class="d-inline m-0 supplier-catalog-remove-form" data-product-label="' +
    escapeSupplierHtml(p.sku) +
    '">' +
    catalogListCtxHiddenInputs(listCtx) +
    '<button type="submit" class="btn btn-sm btn-outline-danger" title="Gỡ khỏi NCC"><i class="bi bi-trash"></i></button></form></td>'
  );
}

function updateOrAppendSupplierCatalogRow(panel, link, listCtx) {
  var tbody = panel.querySelector('[data-supplier-catalog-body]');
  if (!tbody || !link || !link.product) return;
  var empty = tbody.querySelector('.supplier-catalog-empty-row');
  if (empty) empty.remove();
  var sid = panel.getAttribute('data-supplier-id');
  var existing = tbody.querySelector('[data-catalog-product-id="' + link.product_id + '"]');
  if (existing) {
    existing.innerHTML = buildSupplierCatalogRowHtml(link, listCtx, sid);
    existing.querySelectorAll('.supplier-catalog-remove-form').forEach(bindSupplierCatalogRemoveForm);
    return;
  }
  var tr = document.createElement('tr');
  tr.setAttribute('data-catalog-product-id', String(link.product_id));
  var blob = [
    link.product && link.product.name,
    link.product && link.product.sku,
    link.note || '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  tr.setAttribute('data-catalog-search', blob);
  tr.innerHTML = buildSupplierCatalogRowHtml(link, listCtx, sid);
  tbody.appendChild(tr);
  tr.querySelectorAll('.supplier-catalog-remove-form').forEach(bindSupplierCatalogRemoveForm);
}

function appendSupplierCatalogRow(panel, link, listCtx) {
  updateOrAppendSupplierCatalogRow(panel, link, listCtx);
}

function resetSupplierCatalogAddForm(form) {
  var picker = form.querySelector('.supplier-product-picker');
  if (picker) setSupplierProductPickerValue(picker, null);
  var cost = form.querySelector('[name="catalog_cost_price"]');
  if (cost) cost.value = '';
  var panel = form.closest('[data-supplier-catalog-panel]');
  if (panel) updateSupplierCatalogCostHint(panel, null);
}

function handleSupplierCatalogAddSubmit(e, form) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (!form || form.dataset.catalogSubmitting === '1') return;
  var picker = form.querySelector('.supplier-product-picker');
  var input = supplierPickerProductInput(picker);
  if (!input || !input.value) {
    input = form.querySelector('[name="product_id"]');
  }
  if (!input || !input.value) {
    showSupplierCatalogFlash(null, 'Vui lòng chọn sản phẩm cần gắn với nhà cung cấp.', 'warning');
    return;
  }
  var panel = resolveSupplierCatalogPanel(form);
  var submitBtn = form.querySelector('button[type="submit"]');
  form.dataset.catalogSubmitting = '1';
  if (submitBtn) submitBtn.disabled = true;
  fetch(form.getAttribute('action'), {
    method: 'POST',
    body: new FormData(form),
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  })
    .then(function (res) {
      var ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('json') === -1) {
        throw new Error('Không nhận được phản hồi từ máy chủ — thử tải lại trang hoặc đăng nhập lại.');
      }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || 'Không thêm được sản phẩm');
        return data;
      });
    })
    .then(function (data) {
      if (!data || !data.ok || !data.link || !data.link.product) {
        throw new Error('Phản hồi máy chủ không hợp lệ — tải lại trang và thử lại.');
      }
      if (panel) {
        var toastCat = data.updated ? 'info' : 'success';
        showSupplierCatalogFlash(panel, data.message || 'Đã lưu sản phẩm.', toastCat);
        var ctx = catalogListCtxFromForm(form);
        if (form.querySelector('[name="_from_detail"]')) ctx._from_detail = '1';
        updateOrAppendSupplierCatalogRow(panel, data.link, ctx);
        if (data.link && data.link.product_id) {
          var tr = panel.querySelector('[data-catalog-product-id="' + data.link.product_id + '"]');
          if (tr) {
            var blob = [
              data.link.product && data.link.product.name,
              data.link.product && data.link.product.sku,
              data.link.note || '',
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            tr.setAttribute('data-catalog-search', blob);
          }
        }
        if (!data.updated) {
          var sidAttr = panel.getAttribute('data-supplier-id');
          if (sidAttr) bumpSupplierCatalogTabCount(sidAttr);
        }
        filterSupplierCatalogRows(
          panel,
          panel.querySelector('[data-supplier-catalog-filter]') &&
            panel.querySelector('[data-supplier-catalog-filter]').value
        );
      } else {
        showSupplierCatalogFlash(null, data.message || 'Đã gắn sản phẩm.', data.updated ? 'info' : 'success');
      }
      if (form.closest('[data-supplier-link-drawer]')) {
        closeSupplierLinkDrawer();
      }
      supplierProductOptionsCache = null;
      resetSupplierCatalogAddForm(form);
      if (form.closest('[data-supplier-link-drawer]')) {
        var pidInput = form.querySelector('[data-supplier-link-product-id]');
        if (pidInput) pidInput.value = '';
        var radios = form.querySelectorAll('input[name="supplier_link_pick"]');
        radios.forEach(function (r) {
          r.checked = false;
        });
        form.querySelectorAll('.supplier-link-product-option.is-selected').forEach(function (el) {
          el.classList.remove('is-selected');
        });
      }
    })
    .catch(function (err) {
      showSupplierCatalogFlash(panel, err.message || 'Lỗi thêm sản phẩm', 'danger');
    })
    .finally(function () {
      form.dataset.catalogSubmitting = '0';
      if (submitBtn) submitBtn.disabled = false;
    });
}

function initSupplierCatalogForms(root) {
  (root || document).querySelectorAll('.supplier-catalog-remove-form').forEach(bindSupplierCatalogRemoveForm);
}

function initSupplierCatalogFormDelegation() {
  if (document.body.dataset.supplierCatalogDelegate === '1') return;
  document.body.dataset.supplierCatalogDelegate = '1';
  document.addEventListener(
    'submit',
    function (e) {
      var form = e.target && e.target.closest ? e.target.closest('.supplier-catalog-add-form') : null;
      if (!form) return;
      handleSupplierCatalogAddSubmit(e, form);
    },
    true
  );
}

function filterSupplierCatalogRows(panel, query) {
  if (!panel) return;
  var tbody = panel.querySelector('[data-supplier-catalog-body]');
  if (!tbody) return;
  var q = (query || '').trim().toLowerCase();
  var rows = tbody.querySelectorAll('tr[data-catalog-search]');
  var visible = 0;
  rows.forEach(function (row) {
    var blob = (row.getAttribute('data-catalog-search') || '').toLowerCase();
    var show = !q || blob.indexOf(q) !== -1;
    row.classList.toggle('d-none', !show);
    if (show) visible += 1;
  });
  var countEl = panel.querySelector('[data-supplier-catalog-count]');
  if (countEl) {
    var total = rows.length;
    countEl.textContent = q
      ? 'Hiển thị ' + visible + ' / ' + total + ' sản phẩm'
      : total
        ? 'Hiển thị ' + total + ' sản phẩm'
        : '';
  }
}

function initSupplierCatalogSearch(root) {
  (root || document).querySelectorAll('[data-supplier-catalog-filter]').forEach(function (input) {
    if (input.dataset.catalogFilterBound === '1') return;
    input.dataset.catalogFilterBound = '1';
    input.addEventListener('input', function () {
      var panel = input.closest('[data-supplier-catalog-panel]');
      filterSupplierCatalogRows(panel, input.value);
    });
  });
}

function initSupplierLinkDrawer() {
  var drawer = document.querySelector('[data-supplier-link-drawer]');
  if (!drawer || drawer.dataset.drawerBound === '1') return;
  drawer.dataset.drawerBound = '1';
  var form = drawer.querySelector('.supplier-link-drawer-form');
  var listEl = drawer.querySelector('[data-supplier-link-product-list]');
  var searchInput = drawer.querySelector('[data-supplier-link-search]');
  var productIdInput = drawer.querySelector('[data-supplier-link-product-id]');
  var costInput = drawer.querySelector('[data-supplier-link-cost]');
  var costHint = drawer.querySelector('[data-supplier-catalog-cost-hint]');
  var linkedIds = new Set();

  function setLinkedIds(ids) {
    linkedIds = new Set((ids || []).map(String));
  }

  function closeDrawer() {
    closeSupplierLinkDrawer();
  }

  function openDrawer(panel) {
    var tbody = panel && panel.querySelector('[data-supplier-catalog-body]');
    var ids = [];
    if (tbody) {
      tbody.querySelectorAll('[data-catalog-product-id]').forEach(function (row) {
        ids.push(row.getAttribute('data-catalog-product-id'));
      });
    }
    setLinkedIds(ids);
    drawer.removeAttribute('hidden');
    requestAnimationFrame(function () {
      drawer.classList.add('is-open');
    });
    document.body.classList.add('supplier-link-drawer-open');
    renderLinkProductList('');
    if (searchInput) searchInput.value = '';
    if (productIdInput) productIdInput.value = '';
    if (costInput) costInput.value = '';
    updateSupplierCatalogCostHint(panel, null);
    fetchSupplierProductOptions().then(function () {
      renderLinkProductList('');
    });
  }

  function renderLinkProductList(filterText) {
    if (!listEl) return;
    var q = (filterText || '').trim().toLowerCase();
    var products = supplierProductOptionsCache || [];
    var html = '';
    var count = 0;
    products.forEach(function (p) {
      if (linkedIds.has(String(p.id))) return;
      var label = (p.sku + ' ' + p.name).toLowerCase();
      if (q && label.indexOf(q) === -1) return;
      count += 1;
      var thumb = p.image_url
        ? '<div class="product-thumb product-thumb-sm"><img src="' + escapeSupplierHtml(p.image_url) + '" alt=""></div>'
        : '<div class="product-thumb product-thumb-sm"><i class="bi bi-image"></i></div>';
      html +=
        '<label class="supplier-link-product-option">' +
        '<input type="radio" name="supplier_link_pick" value="' +
        p.id +
        '">' +
        thumb +
        '<span class="supplier-link-product-option-body">' +
        '<span class="supplier-link-product-option-name">' +
        escapeSupplierHtml(p.name) +
        '</span>' +
        '<span class="supplier-link-product-option-meta">SKU: ' +
        escapeSupplierHtml(p.sku) +
        '</span></span>' +
        '<span class="supplier-link-product-option-stock">Tồn: ' +
        formatSupplierQtyPlain(p.stock) +
        '</span></label>';
    });
    listEl.innerHTML = html || '<p class="text-muted text-center py-4 mb-0">Không có sản phẩm phù hợp</p>';
  }

  function selectLinkProduct(product) {
    if (!product) return;
    if (productIdInput) productIdInput.value = String(product.id);
    listEl.querySelectorAll('.supplier-link-product-option').forEach(function (el) {
      el.classList.toggle('is-selected', el.querySelector('input') && el.querySelector('input').value === String(product.id));
    });
    var panel = document.querySelector('[data-supplier-catalog-panel]');
    if (costInput && product.purchase_cost_price) {
      costInput.value = String(Math.round(product.purchase_cost_price));
    }
    updateSupplierCatalogCostHint(panel, product);
  }

  drawer.querySelectorAll('[data-supplier-link-drawer-close]').forEach(function (btn) {
    btn.addEventListener('click', closeDrawer);
  });

  document.querySelectorAll('[data-supplier-link-drawer-open]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = btn.closest('[data-supplier-catalog-panel]') || document.querySelector('[data-supplier-catalog-panel]');
      openDrawer(panel);
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      renderLinkProductList(searchInput.value);
    });
  }

  if (listEl) {
    listEl.addEventListener('change', function (e) {
      var radio = e.target.closest('input[type=radio][name=supplier_link_pick]');
      if (!radio) return;
      selectLinkProduct(findSupplierProduct(radio.value));
    });
    listEl.addEventListener('click', function (e) {
      var option = e.target.closest('.supplier-link-product-option');
      if (!option) return;
      var radio = option.querySelector('input[type=radio][name=supplier_link_pick]');
      if (!radio || e.target === radio) return;
      radio.checked = true;
      selectLinkProduct(findSupplierProduct(radio.value));
    });
  }
}

function openSupplierIntakeModalFromQuery() {
  var params = new URLSearchParams(window.location.search);
  var page = document.querySelector('[data-supplier-entity-page]');
  var pageSid = page && page.getAttribute('data-supplier-id');
  var sid = params.get('intake_sid') || params.get('open_intake_sid') || pageSid;
  var wantsIntake =
    params.get('intake') === '1' ||
    params.get('intake_sid') ||
    params.get('open_intake_sid') ||
    params.get('intake_import_preview') === '1';
  if (!sid) return;
  var modalEl = document.getElementById('productsModal' + sid);
  if (!modalEl || !window.bootstrap) return;
  if (!wantsIntake && modalEl.getAttribute('data-show-preview') !== '1') return;
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
  if (params.get('intake_import_preview') === '1' || modalEl.getAttribute('data-show-preview') === '1') {
    activateSupplierIntakeTab(modalEl, 'supplierIntakeExcelTab' + sid);
  } else {
    activateSupplierIntakeTab(modalEl, 'supplierIntakeManualTab' + sid);
  }
  var openQuick = params.get('open_quick_product') === '1' || params.get('quick_product') === '1';
  params.delete('intake_import_preview');
  params.delete('intake_sid');
  params.delete('open_intake_sid');
  params.delete('open_quick_product');
  params.delete('quick_product');
  params.delete('intake');
  var qs = params.toString();
  var next = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
  window.history.replaceState({}, '', next);
  if (openQuick) {
    setTimeout(function () {
      var panel = modalEl.querySelector('[data-supplier-products-panel]');
      var picker = panel && panel.querySelector('.supplier-product-picker');
      openSupplierQuickProductModal(picker, '');
    }, 400);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  initSupplierQuickProductModal();
  initSupplierIntakeImportModals();
  openSupplierIntakeModalFromQuery();
  initSupplierProductsPanels();
  initSupplierCatalogFormDelegation();
  initSupplierCatalogPanels();
  initSupplierCatalogSearch(document);
  initSupplierLinkDrawer();
  initSupplierPaymentModals();
  document.querySelectorAll('.supplier-catalog-remove-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var label = form.getAttribute('data-product-label') || 'sản phẩm này';
      if (!confirm('Gỡ ' + label + ' khỏi danh mục NCC?\n\nKhông xóa sản phẩm trong cửa hàng — chỉ bỏ liên kết.')) {
        e.preventDefault();
      }
    });
  });
  document.querySelectorAll('.supplier-delete-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var name = form.getAttribute('data-name') || 'nhà cung cấp này';
      if (!confirm('Xóa nhà cung cấp "' + name + '"? Hành động không thể hoàn tác.')) {
        e.preventDefault();
      }
    });
  });
  document.querySelectorAll('.supplier-intake-delete-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var code = form.getAttribute('data-code') || 'phiếu này';
      var pendingOnly = form.getAttribute('data-pending-only') === '1';
      var msg = pendingOnly
        ? 'Hủy yêu cầu nhập kho ' + code + '?\n\nPhiếu chưa duyệt — không ảnh hưởng tồn kho.'
        : 'Xóa phiếu nhập ' +
          code +
          '?\n\n' +
          '• Tồn kho sẽ được trừ lại theo số lượng đã nhập\n' +
          '• Các khoản thanh toán liên quan cũng bị xóa\n' +
          'Hành động không thể hoàn tác.';
      if (!confirm(msg)) {
        e.preventDefault();
      }
    });
  });
});
