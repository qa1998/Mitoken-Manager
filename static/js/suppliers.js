var supplierProductOptionsCache = null;
var supplierPickerScrollHandler = null;

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

function supplierProductHasConversion(p) {
  if (!p || !p.unit_conversion_enabled) return false;
  var factor = parseFloat(p.conversion_factor) || 1;
  var pu = (p.purchase_unit || '').trim();
  var bu = (p.base_unit || p.unit || '').trim();
  return factor > 0 && (factor !== 1 || (pu && bu && pu !== bu));
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
  var sel = row.querySelector('[data-supplier-qty-unit-mode]:not([disabled])');
  if (sel && !sel.closest('.d-none')) return sel.value || 'purchase';
  return 'base';
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
  var modeSelect = row.querySelector('[data-supplier-qty-unit-mode]');
  var modeHidden = row.querySelector('[data-supplier-qty-unit-mode-hidden]');
  var convBadge = row.querySelector('[data-supplier-conv-badge]');
  var setupHint = row.querySelector('[data-supplier-qty-setup-hint]');
  var qtyLabel = row.querySelector('[data-supplier-qty-unit-label]');
  var hasProduct = !!(product && product.id);
  var hasConv = hasProduct && supplierProductHasConversion(product);

  if (modeWrap) modeWrap.classList.toggle('d-none', !hasProduct);
  if (setupHint) setupHint.classList.toggle('d-none', !hasProduct || hasConv);
  if (modeHidden) {
    modeHidden.disabled = hasProduct;
    if (!hasProduct) modeHidden.value = 'base';
  }
  if (modeSelect) {
    modeSelect.disabled = !hasProduct;
    var lotOpt = modeSelect.querySelector('[data-supplier-qty-mode-lot]');
    var hasLot = hasConv && supplierProductHasLot(product);
    if (lotOpt) {
      lotOpt.hidden = !hasLot;
      lotOpt.disabled = !hasLot;
      if (hasLot) lotOpt.textContent = 'Theo ' + (product.lot_unit || 'Lô');
    }
    var pu = hasProduct ? product.purchase_unit || 'ĐV nhập' : '—';
    var bu = hasProduct ? product.base_unit || product.unit || 'ĐV tồn' : '—';
    var purchaseOpt = modeSelect.querySelector('option[value="purchase"]');
    var baseOpt = modeSelect.querySelector('option[value="base"]');
    if (purchaseOpt) purchaseOpt.textContent = hasConv ? 'Theo ' + pu : 'Theo ' + bu + ' (chưa quy đổi)';
    if (baseOpt) baseOpt.textContent = 'Theo ' + bu;
    if (hasProduct) {
      if (!hasConv) {
        modeSelect.value = 'base';
        if (purchaseOpt) purchaseOpt.disabled = true;
        if (lotOpt) lotOpt.disabled = true;
        if (baseOpt) baseOpt.disabled = false;
      } else {
        if (purchaseOpt) purchaseOpt.disabled = false;
        if (baseOpt) baseOpt.disabled = false;
        if (!modeSelect.dataset.userTouched) {
          modeSelect.value = hasLot ? 'lot' : 'purchase';
        } else if (!hasLot && modeSelect.value === 'lot') {
          modeSelect.value = 'purchase';
        }
      }
    }
    if (qtyLabel) {
      qtyLabel.textContent = hasProduct ? 'Số lượng (' + (modeSelect.options[modeSelect.selectedIndex]?.textContent || bu) + ')' : 'Số lượng';
    }
    if (convBadge) {
      if (hasConv) {
        var factor = parseFloat(product.conversion_factor) || 1;
        var badge = '1 ' + pu + ' = ' + formatSupplierQtyPlain(factor) + ' ' + bu;
        if (hasLot) {
          badge +=
            ' · 1 ' +
            (product.lot_unit || 'Lô') +
            ' = ' +
            formatSupplierQtyPlain(product.lot_factor) +
            ' ' +
            pu;
        }
        convBadge.textContent = badge;
        convBadge.classList.remove('d-none');
      } else {
        convBadge.classList.add('d-none');
        convBadge.textContent = '';
      }
    }
  }
}

function updateSupplierRowQtyHint(row) {
  if (!row) return;
  var picker = row.querySelector('.supplier-product-picker');
  var input = picker && picker.querySelector('input[name="sp_product_id"]');
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
  var input = picker.querySelector('input[name="sp_product_id"]');
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
  var costInput = row.querySelector('input[name="sp_cost_price"]');
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

function dockSupplierProductPickerMenu(menu) {
  if (!menu) return;
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
    var menu = picker.querySelector('.supplier-product-picker-menu.open');
    if (menu) positionSupplierProductPickerMenu(picker, menu);
  };
  window.addEventListener('scroll', supplierPickerScrollHandler, true);
  window.addEventListener('resize', supplierPickerScrollHandler);
  document.querySelectorAll('.supplier-products-table-wrap, .modal-body, .supplier-intake-modal').forEach(function (el) {
    el.addEventListener('scroll', supplierPickerScrollHandler, { passive: true });
  });
}

function closeAllSupplierProductPickers(exceptPicker) {
  document.querySelectorAll('.supplier-product-picker-menu.open').forEach(function (menu) {
    if (exceptPicker && exceptPicker.contains(menu)) return;
    dockSupplierProductPickerMenu(menu);
  });
  unbindSupplierPickerScrollListeners();
}

function renderSupplierProductMenu(picker) {
  var list = picker.querySelector('.supplier-product-list');
  var search = picker.querySelector('.supplier-product-search');
  if (!list) return;

  var q = (search && search.value ? search.value : '').toLowerCase().trim();
  var currentId = picker.querySelector('input[name="sp_product_id"]').value;
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
      var row = picker.closest('.supplier-product-row');
      var modeSelect = row && row.querySelector('[data-supplier-qty-unit-mode]');
      if (modeSelect && String(row.dataset.supplierProductId || '') !== String(p.id)) {
        delete modeSelect.dataset.userTouched;
        row.dataset.supplierProductId = String(p.id);
      }
      setSupplierProductPickerValue(picker, p);
      applySupplierProductCost(row, p);
      updateSupplierRowQtyHint(row);
      dockSupplierProductPickerMenu(picker.querySelector('.supplier-product-picker-menu'));
      unbindSupplierPickerScrollListeners();
    });
    list.appendChild(btn);
  });

  if (!list.children.length) {
    var empty = document.createElement('div');
    empty.className = 'supplier-product-empty';
    empty.textContent = q ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm đang bán';
    list.appendChild(empty);
  }
}

function syncSupplierProductPickerLabels(panel) {
  if (!panel || !supplierProductOptionsCache) return;
  panel.querySelectorAll('.supplier-product-picker').forEach(function (picker) {
    var input = picker.querySelector('input[name="sp_product_id"]');
    if (!input || !input.value) return;
    var product = findSupplierProduct(input.value);
    if (product) setSupplierProductPickerValue(picker, product);
  });
}

function initSupplierProductPicker(picker) {
  if (!picker || picker.dataset.supplierPickerInit === '1') return;
  picker.dataset.supplierPickerInit = '1';

  var btn = picker.querySelector('.supplier-product-picker-btn');
  var menu = picker.querySelector('.supplier-product-picker-menu');
  var search = picker.querySelector('.supplier-product-search');
  if (!btn || !menu) return;

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var isOpen = menu.classList.contains('open');
    closeAllSupplierProductPickers(picker);
    if (!isOpen) {
      menu.classList.add('open');
      renderSupplierProductMenu(picker);
      positionSupplierProductPickerMenu(picker, menu);
      bindSupplierPickerScrollListeners(picker);
      if (search) {
        search.value = '';
        renderSupplierProductMenu(picker);
        search.focus();
      }
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
  var modeSelect = row.querySelector('[data-supplier-qty-unit-mode]');
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
  if (modeSelect) {
    modeSelect.addEventListener('change', function () {
      modeSelect.dataset.userTouched = '1';
      updateSupplierRowQtyHint(row);
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

document.addEventListener('DOMContentLoaded', function () {
  initSupplierProductsPanels();
  initSupplierPaymentModals();
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
      var msg =
        'Xóa phiếu nhập ' +
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
