function formatPoMoney(n) {
  return (parseInt(n, 10) || 0).toLocaleString('vi-VN') + ' đ';
}

function parsePoMoneyInput(val) {
  if (!val) return 0;
  var digits = String(val).replace(/[^\d]/g, '');
  return parseInt(digits, 10) || 0;
}

function updatePoLineAmount(row) {
  if (!row) return;
  var amountEl = row.querySelector('[data-po-line-amount]');
  if (!amountEl) return;
  var qtyInput = row.querySelector('.supplier-intake-qty');
  var costInput = row.querySelector('.po-line-cost');
  var qty = parseFloat(qtyInput && qtyInput.value ? qtyInput.value : 0) || 0;
  var cost = parsePoMoneyInput(costInput && costInput.value ? costInput.value : '');
  amountEl.textContent = formatPoMoney(Math.round(qty * cost));
}

function fillPoSupplierSelect(select, data, selectedId) {
  if (!select || !data) return;
  var locked = select.getAttribute('data-lock-supplier') === '1';
  var keep = selectedId || select.getAttribute('data-selected') || select.value;
  select.innerHTML = '';
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— Chọn NCC —';
  select.appendChild(placeholder);

  var linkedIds = {};
  (data.linked || []).forEach(function (s) {
    linkedIds[String(s.id)] = true;
    var opt = document.createElement('option');
    opt.value = String(s.id);
    opt.textContent = (s.code ? s.code + ' — ' : '') + (s.name || '');
    if (s.is_primary) opt.textContent += ' (mặc định)';
    select.appendChild(opt);
  });

  if ((data.linked || []).length) {
    var sep = document.createElement('option');
    sep.disabled = true;
    sep.textContent = '——— NCC khác ———';
    select.appendChild(sep);
  }

  (data.active || []).forEach(function (s) {
    if (linkedIds[String(s.id)]) return;
    var opt = document.createElement('option');
    opt.value = String(s.id);
    opt.textContent = (s.code ? s.code + ' — ' : '') + (s.name || '');
    select.appendChild(opt);
  });

  if (keep) select.value = String(keep);
  else if (data.default_supplier_id) select.value = String(data.default_supplier_id);

  if (locked && keep) {
    select.disabled = true;
  }
}

function loadPoLineSuppliers(row, productId, selectedId) {
  var select = row && row.querySelector('.po-line-supplier');
  if (!select || !productId) return Promise.resolve();
  return fetch('/products/' + productId + '/suppliers.json', {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
    .then(function (res) {
      if (!res.ok) throw new Error('suppliers');
      return res.json();
    })
    .then(function (data) {
      fillPoSupplierSelect(select, data, selectedId);
      return data;
    })
    .catch(function () {});
}

window.poOnProductSelected = function (row, product) {
  if (!row || !product) return;
  loadPoLineSuppliers(row, product.id).then(function (data) {
    if (!data) return;
    var costInput = row.querySelector('.po-line-cost');
    if (costInput && !costInput.value && data.default_supplier_id) {
      var link = (data.linked || []).find(function (s) {
        return String(s.id) === String(data.default_supplier_id);
      });
      if (link && link.cost_price) {
        if (typeof formatMoneyInputValue === 'function') {
          costInput.value = formatMoneyInputValue(String(link.cost_price));
        } else {
          costInput.value = String(link.cost_price);
        }
        if (typeof window.initMoneyInputs === 'function') window.initMoneyInputs(row);
      }
    }
    updatePoLineAmount(row);
  });
};

function bindPoProductRow(row) {
  if (!row || row.dataset.poRowBound === '1') return;
  row.dataset.poRowBound = '1';
  var qtyInput = row.querySelector('.supplier-intake-qty');
  var costInput = row.querySelector('.po-line-cost');
  if (qtyInput) {
    qtyInput.addEventListener('input', function () {
      updatePoLineAmount(row);
    });
  }
  if (costInput) {
    costInput.addEventListener('input', function () {
      updatePoLineAmount(row);
    });
  }
  var productInput = row.querySelector('input[name="sp_product_id"]');
  if (productInput && productInput.value) {
    loadPoLineSuppliers(row, productInput.value, row.querySelector('.po-line-supplier') && row.querySelector('.po-line-supplier').value);
  }
  updatePoLineAmount(row);
}

function syncPoReceiptMode(form) {
  if (!form) return;
  var mode = form.querySelector('input[name="receipt_mode"]:checked');
  var isDirect = mode && mode.value === 'direct_delivery';
  form.querySelectorAll('[data-po-direct-fields]').forEach(function (el) {
    el.classList.toggle('d-none', !isDirect);
  });
  var customerSel = form.querySelector('[data-po-customer]');
  if (customerSel) {
    if (isDirect) customerSel.setAttribute('required', 'required');
    else customerSel.removeAttribute('required');
  }
}

function loadPoCustomerOrders(form) {
  var customerSel = form.querySelector('[data-po-customer]');
  var orderSel = form.querySelector('[data-po-order]');
  if (!customerSel || !orderSel) return;
  var cid = customerSel.value;
  var keepOrder = orderSel.value;
  orderSel.innerHTML = '<option value="">— Không liên kết —</option>';
  if (!cid) return;
  fetch('/customers/' + cid + '/orders.json', {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
    .then(function (res) {
      if (!res.ok) throw new Error('orders');
      return res.json();
    })
    .then(function (data) {
      (data.orders || []).forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent =
          (o.order_code || '#' + o.id) +
          (o.status ? ' — ' + o.status : '') +
          (o.created_at ? ' (' + o.created_at + ')' : '');
        orderSel.appendChild(opt);
      });
      if (keepOrder) orderSel.value = keepOrder;
    })
    .catch(function () {});
}

function initPoProductsPanel(panel) {
  if (!panel) return;
  panel.querySelectorAll('.supplier-product-row').forEach(bindPoProductRow);
  var observer = panel.querySelector('.supplier-products-body');
  if (observer && panel.dataset.poObserve !== '1') {
    panel.dataset.poObserve = '1';
    var mo = new MutationObserver(function () {
      panel.querySelectorAll('.supplier-product-row').forEach(bindPoProductRow);
    });
    mo.observe(observer, { childList: true });
  }
}

function initPoForm(form) {
  if (!form || form.getAttribute('data-po-init')) return;
  form.setAttribute('data-po-init', '1');
  form.querySelectorAll('[data-po-receipt-mode]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      syncPoReceiptMode(form);
    });
  });
  var customerSel = form.querySelector('[data-po-customer]');
  if (customerSel) {
    customerSel.addEventListener('change', function () {
      loadPoCustomerOrders(form);
    });
    if (customerSel.value) loadPoCustomerOrders(form);
  }
  syncPoReceiptMode(form);
  var panel = form.querySelector('.po-products-panel');
  if (panel && typeof fetchSupplierProductOptions === 'function') {
    fetchSupplierProductOptions().then(function () {
      if (typeof syncSupplierProductPickerLabels === 'function') {
        syncSupplierProductPickerLabels(panel);
      }
      if (typeof initSupplierProductsPanel === 'function') initSupplierProductsPanel(panel);
      if (typeof ensureSupplierProductsStarterRow === 'function') {
        ensureSupplierProductsStarterRow(panel);
      }
      initPoProductsPanel(panel);
    });
  }
}

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.po-form').forEach(initPoForm);

  document.querySelectorAll('.po-receive-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (form.getAttribute('data-has-supplier') !== '1') {
        e.preventDefault();
        alert('Phiếu chưa có nhà cung cấp.');
        return;
      }
      var mode = form.getAttribute('data-mode') || 'stock_in';
      var msg;
      if (mode === 'direct_delivery') {
        msg = 'Xác nhận nhận hàng giao thẳng khách?\n\n• Không nhập kho\n• Phát sinh công nợ NCC';
      } else if (mode === 'no_stock') {
        msg = 'Xác nhận nhận hàng (không nhập kho)?\n\n• Không tăng tồn kho\n• Phát sinh công nợ NCC';
      } else {
        msg = 'Xác nhận nhận hàng nhập kho?\n\n• Tăng tồn kho\n• Phát sinh công nợ NCC';
      }
      if (!confirm(msg)) e.preventDefault();
    });
  });

  document.querySelectorAll('.po-delete-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var code = form.getAttribute('data-code') || 'phiếu này';
      var received = form.getAttribute('data-received');
      var msg = received
        ? 'Xóa phiếu ' + code + '?\n\nĐã nhận hàng: tồn kho (nếu có) và thanh toán liên quan sẽ bị hoàn / xóa.'
        : 'Xóa phiếu nháp ' + code + '?';
      if (!confirm(msg)) e.preventDefault();
    });
  });

  document.querySelectorAll('.po-pay-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var modal = document.getElementById('poPaymentModal');
      if (!modal) return;
      var balance = parseInt(btn.getAttribute('data-balance') || '0', 10) || 0;
      var amountInput = modal.querySelector('.supplier-payment-amount');
      if (amountInput) {
        amountInput.value = balance > 0 ? String(balance) : '';
        amountInput.max = balance > 0 ? String(balance) : '';
      }
    });
  });

  if (typeof initSupplierPaymentModals === 'function') initSupplierPaymentModals();
});

document.addEventListener('shown.bs.modal', function (e) {
  var form = e.target.querySelector('.po-form');
  if (form) initPoForm(form);
});
