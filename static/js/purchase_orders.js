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
  var panel = form.querySelector('[data-supplier-products-panel]');
  if (panel && typeof fetchSupplierProductOptions === 'function') {
    fetchSupplierProductOptions().then(function () {
      if (typeof syncSupplierProductPickerLabels === 'function') {
        syncSupplierProductPickerLabels(panel);
      }
      if (typeof initSupplierProductsPanel === 'function') initSupplierProductsPanel(panel);
      if (typeof ensureSupplierProductsStarterRow === 'function') {
        ensureSupplierProductsStarterRow(panel);
      }
      panel.querySelectorAll('.supplier-product-row').forEach(function (row) {
        if (typeof updateSupplierRowQtyHint === 'function') updateSupplierRowQtyHint(row);
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.po-form').forEach(initPoForm);

  function syncPoReceiveSupplierState() {
    var sel = document.querySelector('[data-po-supplier]');
    var has = !!(sel && sel.value);
    document.querySelectorAll('.po-receive-form').forEach(function (form) {
      form.setAttribute('data-has-supplier', has ? '1' : '0');
      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = !has;
        btn.title = has ? '' : 'Chọn nhà cung cấp (và Lưu) trước khi xác nhận';
      }
    });
  }

  document.querySelectorAll('[data-po-supplier]').forEach(function (sel) {
    sel.addEventListener('change', syncPoReceiveSupplierState);
  });
  syncPoReceiveSupplierState();

  document.querySelectorAll('.po-receive-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var sel = document.querySelector('[data-po-supplier]');
      if (sel && !sel.value) {
        e.preventDefault();
        alert('Vui lòng chọn nhà cung cấp và bấm Lưu thay đổi trước khi xác nhận nhận hàng.');
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
        ? 'Xóa phiếu ' +
          code +
          '?\n\nĐã nhận hàng: tồn kho (nếu có) và thanh toán liên quan sẽ bị hoàn / xóa.'
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
