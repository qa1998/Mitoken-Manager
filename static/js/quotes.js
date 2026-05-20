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

  function getPriceListType() {
    var el = document.getElementById('quote-price-list');
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

  function stockAmountClass(status) {
    if (status === 'out') return 'is-out';
    if (status === 'low') return 'is-low';
    return 'is-ok';
  }

  function getSelectedProductIds(excludeRow) {
    var ids = new Set();
    document.querySelectorAll('#quote-items-body .quote-line-row').forEach(function (row) {
      if (row === excludeRow) return;
      var input = row.querySelector('input[name="product_id"]');
      if (input && input.value) ids.add(String(input.value));
    });
    return ids;
  }

  function findProduct(id) {
    return quoteCatalog.find(function (p) {
      return String(p.id) === String(id);
    });
  }

  function closeAllProductMenus(exceptPicker) {
    document.querySelectorAll('.quote-product-picker-menu.open').forEach(function (menu) {
      if (exceptPicker && exceptPicker.contains(menu)) return;
      menu.classList.remove('open');
    });
  }

  function renderProductMenu(picker, row) {
    var list = picker.querySelector('.quote-product-list');
    var search = picker.querySelector('.quote-product-search');
    if (!list) return;
    var q = (search && search.value ? search.value : '').toLowerCase().trim();
    var selected = getSelectedProductIds(row);
    var currentId = row.querySelector('input[name="product_id"]').value;
    list.innerHTML = '';

    quoteCatalog.forEach(function (p) {
      var id = String(p.id);
      var hay = (p.sku + ' ' + p.name + ' ' + (p.spec || '') + ' ' + p.label).toLowerCase();
      if (q && hay.indexOf(q) === -1) return;

      var usedElsewhere = selected.has(id) && id !== String(currentId);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quote-product-item' + (usedElsewhere ? ' is-disabled' : '');
      btn.disabled = usedElsewhere;
      btn.dataset.id = id;
      btn.innerHTML =
        '<span class="quote-product-item-thumb">' +
        (p.image_url
          ? '<img src="' + p.image_url + '" alt="">'
          : '<i class="bi bi-image"></i>') +
        '</span><span class="quote-product-item-text">' +
        '<span class="quote-product-item-sku">' + p.sku + '</span>' +
        '<span class="quote-product-item-name">' + p.name + '</span>' +
        (p.spec ? '<span class="quote-product-item-spec">' + p.spec + '</span>' : '') +
        '</span>' +
        '<span class="stock-status-badge status-' + (p.stock_status || 'ok') + '">' +
        p.stock_label +
        '</span>' +
        (usedElsewhere ? '<span class="quote-product-item-badge">Đã thêm</span>' : '');

      if (!usedElsewhere) {
        btn.addEventListener('click', function () {
          setRowProduct(row, p);
          picker.querySelector('.quote-product-picker-menu').classList.remove('open');
          syncAllProductMenus();
          recalcQuoteTotals();
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
      if (picker.querySelector('.quote-product-picker-menu.open')) {
        renderProductMenu(picker, row);
      }
    });
  }

  function renderProductCell(row, product) {
    var cell = row.querySelector('.quote-line-product-cell');
    var picker = cell.querySelector('.quote-product-picker');
    if (!product) {
      cell.innerHTML =
        '<input type="hidden" name="product_id" value="">' +
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
      '<div class="quote-product-picker">' +
      '<button type="button" class="quote-line-product-display">' +
      '<span class="quote-line-product-thumb">' +
      (product.image_url
        ? '<img src="' + product.image_url + '" alt="">'
        : '<i class="bi bi-image"></i>') +
      '</span>' +
      '<span class="quote-line-product-text">' +
      '<span class="quote-line-product-title">' + product.sku + ' - ' + product.name + '</span>' +
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

  function updateRowStock(row, product) {
    var stockCell = row.querySelector('.quote-line-stock');
    if (!stockCell) return;
    if (!product) {
      stockCell.innerHTML = '<span class="quote-stock-empty">—</span>';
      return;
    }
    stockCell.innerHTML =
      '<span class="quote-stock-qty ' + stockAmountClass(product.stock_status) + '">' +
      (product.stock || 0).toLocaleString('vi-VN') +
      '</span>' +
      '<span class="quote-stock-unit">' + (product.unit || 'cái') + '</span>';
  }

  function setRowProduct(row, product) {
    if (!product) return;
    renderProductCell(row, product);
    row.dataset.productId = String(product.id);
    row.querySelector('.quote-line-unit').textContent = product.unit || 'cái';
    var price = getProductPrice(product, getPriceListType());
    var priceInput = row.querySelector('input[name="price"]');
    priceInput.value = formatMoneyInputValue(String(price));
    updateRowStock(row, product);
    updateRowAmount(row);
  }

  function clearRowProduct(row) {
    renderProductCell(row, null);
    row.dataset.productId = '';
    row.querySelector('.quote-line-unit').textContent = '—';
    row.querySelector('input[name="price"]').value = '';
    updateRowStock(row, null);
    updateRowAmount(row);
  }

  function updateRowAmount(row) {
    var qty = parseInt(row.querySelector('input[name="qty"]').value, 10) || 0;
    var price = parseMoneyInput(row.querySelector('input[name="price"]').value);
    var lineDisc = parseFloat(row.querySelector('input[name="line_discount"]').value) || 0;
    var gross = qty * price;
    var amount = Math.round(gross * (1 - lineDisc / 100));
    row.querySelector('.quote-line-amount').textContent = fmtMoney(amount);
    row.dataset.amount = String(amount);
  }

  function renumberRows() {
    document.querySelectorAll('#quote-items-body .quote-line-row').forEach(function (row, idx) {
      row.querySelector('.quote-line-num').textContent = String(idx + 1);
    });
  }

  function recalcQuoteTotals(skipPreview) {
    var subtotal = 0;
    document.querySelectorAll('#quote-items-body .quote-line-row').forEach(function (row) {
      subtotal += parseInt(row.dataset.amount || '0', 10) || 0;
    });
    var discountPct = parseFloat(document.getElementById('quote-discount-percent').value) || 0;
    var vatRate = parseFloat(document.getElementById('quote-vat-rate').value) || 0;
    var discount = Math.round((subtotal * discountPct) / 100);
    var afterDiscount = Math.max(subtotal - discount, 0);
    var vat = Math.round((afterDiscount * vatRate) / 100);
    var total = afterDiscount + vat;

    document.getElementById('quote-discount-amount').value = String(discount);
    document.getElementById('quote-summary-subtotal').textContent = fmtMoney(subtotal);
    document.getElementById('quote-summary-discount-label').textContent =
      'Tổng chiết khấu (' + discountPct + '%)';
    document.getElementById('quote-summary-discount').textContent = fmtMoneySigned(discount);
    document.getElementById('quote-summary-vat-label').textContent = 'VAT (' + vatRate + '%)';
    document.getElementById('quote-summary-vat').textContent = fmtMoney(vat);
    document.getElementById('quote-summary-total').textContent = fmtMoney(total);
    if (!skipPreview) scheduleQuotePreview();
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

  function isPreviewOpen() {
    var panel = document.getElementById('quote-create-preview-panel');
    return panel && !panel.classList.contains('is-hidden');
  }

  function setPreviewOpen(open) {
    var panel = document.getElementById('quote-create-preview-panel');
    var dialog = document.querySelector('#createQuoteModal .quote-create-dialog');
    var btn = document.getElementById('btn-toggle-quote-preview');
    if (!panel) return;
    if (open) {
      panel.classList.remove('is-hidden');
      if (dialog) dialog.classList.add('has-preview');
      if (btn) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
      }
      scheduleQuotePreview();
    } else {
      panel.classList.add('is-hidden');
      if (dialog) dialog.classList.remove('has-preview');
      if (btn) {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-pressed', 'false');
      }
    }
  }

  function scheduleQuotePreview() {
    if (!isPreviewOpen()) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshQuotePreview, 350);
  }

  function refreshQuotePreview() {
    if (!isPreviewOpen()) return;
    var form = document.getElementById('create-quote-form');
    var host = document.getElementById('quote-create-preview-body');
    if (!form || !host || previewBusy) return;

    recalcQuoteTotals(true);
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

  function initQuotePreviewPanel() {
    var btn = document.getElementById('btn-toggle-quote-preview');
    var openByDefault = window.matchMedia('(min-width: 993px)').matches;
    setPreviewOpen(openByDefault);
    if (btn) {
      btn.addEventListener('click', function () {
        setPreviewOpen(!isPreviewOpen());
      });
    }
    var form = document.getElementById('create-quote-form');
    if (form) {
      form.querySelectorAll('.quote-preview-input, #quote-customer-select').forEach(function (el) {
        el.addEventListener('input', scheduleQuotePreview);
        el.addEventListener('change', scheduleQuotePreview);
      });
    }
  }

  function applyPriceListToAllRows() {
    document.querySelectorAll('#quote-items-body .quote-line-row').forEach(function (row) {
      var productId = row.querySelector('input[name="product_id"]').value;
      if (!productId) return;
      var product = findProduct(productId);
      if (!product) return;
      var price = getProductPrice(product, getPriceListType());
      row.querySelector('input[name="price"]').value = formatMoneyInputValue(String(price));
      updateRowAmount(row);
    });
    recalcQuoteTotals();
  }

  function initProductPicker(picker, row) {
    var btn = picker.querySelector('.quote-product-picker-btn, .quote-line-product-display');
    var menu = picker.querySelector('.quote-product-picker-menu');
    var search = picker.querySelector('.quote-product-search');
    if (!btn || !menu) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = menu.classList.contains('open');
      closeAllProductMenus(picker);
      if (!isOpen) {
        menu.classList.add('open');
        renderProductMenu(picker, row);
        if (search) {
          search.value = '';
          search.focus();
        }
      }
    });

    if (search) {
      search.addEventListener('input', function () {
        renderProductMenu(picker, row);
      });
      search.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }
  }

  function bindRowInputs(row) {
    row.querySelector('input[name="qty"]').addEventListener('input', function () {
      updateRowAmount(row);
      recalcQuoteTotals();
    });
    row.querySelector('input[name="price"]').addEventListener('input', function () {
      updateRowAmount(row);
      recalcQuoteTotals();
    });
    row.querySelector('input[name="line_discount"]').addEventListener('input', function () {
      updateRowAmount(row);
      recalcQuoteTotals();
    });
    row.querySelector('.btn-remove-quote-row').addEventListener('click', function () {
      row.remove();
      renumberRows();
      syncAllProductMenus();
      recalcQuoteTotals();
    });
  }

  function addQuoteRow(product) {
    var tbody = document.getElementById('quote-items-body');
    if (!tbody) return null;
    rowSeq += 1;
    var row = document.createElement('tr');
    row.className = 'quote-line-row';
    row.dataset.rowId = String(rowSeq);
    row.innerHTML =
      '<td class="quote-line-num">1</td>' +
      '<td class="quote-line-product-cell"></td>' +
      '<td class="quote-line-stock"><span class="quote-stock-empty">—</span></td>' +
      '<td class="quote-line-unit text-muted">—</td>' +
      '<td><input type="number" name="qty" class="form-control form-control-sm quote-qty-input" value="1" min="1"></td>' +
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

    if (product) setRowProduct(row, product);
    renumberRows();
    syncAllProductMenus();
    recalcQuoteTotals();
    return row;
  }

  function resetCreateQuoteForm() {
    var tbody = document.getElementById('quote-items-body');
    if (tbody) tbody.innerHTML = '';
    rowSeq = 0;
    addQuoteRow();
    recalcQuoteTotals();
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
  }

  function normalizeRowsBeforeSubmit() {
    document.querySelectorAll('#quote-items-body .quote-line-row').forEach(function (row) {
      var priceInput = row.querySelector('input[name="price"]');
      var lineDisc = parseFloat(row.querySelector('input[name="line_discount"]').value) || 0;
      var rawPrice = parseMoneyInput(priceInput.value);
      var effective = Math.round(rawPrice * (1 - lineDisc / 100));
      priceInput.value = effective ? String(effective) : '0';
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

    var btnAdd = document.getElementById('btn-add-quote-row');
    if (btnAdd) {
      btnAdd.addEventListener('click', function () {
        addQuoteRow();
      });
    }

    var priceList = document.getElementById('quote-price-list');
    if (priceList) {
      priceList.addEventListener('change', applyPriceListToAllRows);
    }

    document.querySelectorAll('.quote-calc-input').forEach(function (el) {
      el.addEventListener('input', recalcQuoteTotals);
    });

    var noteInput = document.getElementById('quote-note-input');
    var noteCount = document.getElementById('quote-note-count');
    if (noteInput && noteCount) {
      noteInput.addEventListener('input', function () {
        noteCount.textContent = String(noteInput.value.length);
      });
    }

    document.addEventListener('click', function () {
      closeAllProductMenus();
    });

    var createModal = document.getElementById('createQuoteModal');
    if (createModal) {
      initQuotePreviewPanel();
      createModal.addEventListener('shown.bs.modal', function () {
        var tbody = document.getElementById('quote-items-body');
        if (tbody && !tbody.children.length) addQuoteRow();
        if (typeof window.initMoneyInputs === 'function') {
          window.initMoneyInputs(createModal);
        }
        if (isPreviewOpen()) scheduleQuotePreview();
      });
      createModal.addEventListener('hidden.bs.modal', function () {
        var form = document.getElementById('create-quote-form');
        if (form) form.reset();
        var priceListEl = document.getElementById('quote-price-list');
        if (priceListEl) priceListEl.value = 'dealer';
        resetCreateQuoteForm();
      });
    }

    var createForm = document.getElementById('create-quote-form');
    if (createForm) {
      createForm.addEventListener('submit', function (e) {
        recalcQuoteTotals();
        normalizeRowsBeforeSubmit();
        var hasProduct = false;
        document.querySelectorAll('#quote-items-body input[name="product_id"]').forEach(function (input) {
          if (input.value) hasProduct = true;
        });
        if (!hasProduct) {
          e.preventDefault();
          alert('Vui lòng thêm ít nhất một sản phẩm vào báo giá');
        }
      });
    }

    if (document.getElementById('quote-items-body')) {
      resetCreateQuoteForm();
    }
  });
})();
