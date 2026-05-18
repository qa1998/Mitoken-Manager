(function () {
  var quoteCatalog = [];
  var rowSeq = 0;

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

  function parseMoneyInput(value) {
    return parseInt(String(value || '').replace(/\D/g, ''), 10) || 0;
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
      var hay = (p.sku + ' ' + p.name + ' ' + p.label).toLowerCase();
      if (q && hay.indexOf(q) === -1) return;

      var usedElsewhere = selected.has(id) && id !== String(currentId);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quote-product-item' + (usedElsewhere ? ' is-disabled' : '');
      btn.disabled = usedElsewhere;
      btn.dataset.id = id;
      btn.dataset.price = String(p.retail_price || 0);
      btn.dataset.unit = p.unit || 'cái';
      btn.dataset.label = p.label;
      btn.innerHTML =
        '<span class="quote-product-item-thumb">' +
        (p.image_url
          ? '<img src="' + p.image_url + '" alt="">'
          : '<i class="bi bi-image"></i>') +
        '</span><span class="quote-product-item-text"><span class="quote-product-item-sku">' +
        p.sku +
        '</span><span class="quote-product-item-name">' +
        p.name +
        '</span></span>' +
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
      empty.textContent = 'Không tìm thấy sản phẩm';
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

  function setRowProduct(row, product) {
    if (!product) return;
    row.querySelector('input[name="product_id"]').value = product.id;
    var btn = row.querySelector('.quote-product-picker-btn');
    btn.innerHTML =
      '<span class="quote-product-picker-thumb">' +
      (product.image_url
        ? '<img src="' + product.image_url + '" alt="">'
        : '<i class="bi bi-image"></i>') +
      '</span><span class="quote-product-picker-label">' +
      product.label +
      '</span><i class="bi bi-chevron-down quote-product-picker-caret"></i>';
    btn.classList.remove('is-placeholder');
    row.querySelector('.quote-line-unit').textContent = product.unit || 'cái';
    row.querySelector('input[name="price"]').value = product.retail_price || 0;
    updateRowAmount(row);
  }

  function clearRowProduct(row) {
    row.querySelector('input[name="product_id"]').value = '';
    var btn = row.querySelector('.quote-product-picker-btn');
    btn.innerHTML =
      '<span class="quote-product-picker-placeholder">Chọn sản phẩm</span><i class="bi bi-chevron-down quote-product-picker-caret"></i>';
    btn.classList.add('is-placeholder');
    row.querySelector('.quote-line-unit').textContent = '—';
    row.querySelector('input[name="price"]').value = 0;
    updateRowAmount(row);
  }

  function updateRowAmount(row) {
    var qty = parseInt(row.querySelector('input[name="qty"]').value, 10) || 0;
    var price = parseMoneyInput(row.querySelector('input[name="price"]').value);
    var amount = qty * price;
    row.querySelector('.quote-line-amount').textContent = fmtMoney(amount);
    row.dataset.amount = String(amount);
  }

  function renumberRows() {
    document.querySelectorAll('#quote-items-body .quote-line-row').forEach(function (row, idx) {
      row.querySelector('.quote-line-num').textContent = String(idx + 1);
    });
  }

  function recalcQuoteTotals() {
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
    document.getElementById('quote-summary-discount').textContent = fmtMoney(discount);
    document.getElementById('quote-summary-discount-box').textContent = fmtMoney(discount);
    document.getElementById('quote-summary-vat-label').textContent = 'VAT (' + vatRate + '%)';
    document.getElementById('quote-summary-vat').textContent = fmtMoney(vat);
    document.getElementById('quote-summary-total').textContent = fmtMoney(total);
  }

  function initProductPicker(picker, row) {
    var btn = picker.querySelector('.quote-product-picker-btn');
    var menu = picker.querySelector('.quote-product-picker-menu');
    var search = picker.querySelector('.quote-product-search');

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

  function addQuoteRow(product) {
    var tbody = document.getElementById('quote-items-body');
    if (!tbody) return null;
    rowSeq += 1;
    var row = document.createElement('tr');
    row.className = 'quote-line-row';
    row.dataset.rowId = String(rowSeq);
    row.innerHTML =
      '<td class="quote-line-num">1</td>' +
      '<td class="quote-line-product-cell">' +
      '<input type="hidden" name="product_id" value="">' +
      '<div class="quote-product-picker">' +
      '<button type="button" class="quote-product-picker-btn is-placeholder">' +
      '<span class="quote-product-picker-placeholder">Chọn sản phẩm</span>' +
      '<i class="bi bi-chevron-down quote-product-picker-caret"></i></button>' +
      '<div class="quote-product-picker-menu">' +
      '<div class="quote-product-search-wrap">' +
      '<i class="bi bi-search"></i>' +
      '<input type="text" class="quote-product-search" placeholder="Nhập tên hoặc mã sản phẩm..." autocomplete="off">' +
      '</div>' +
      '<div class="quote-product-list"></div>' +
      '</div></div></td>' +
      '<td class="quote-line-unit text-muted">—</td>' +
      '<td><input type="number" name="qty" class="form-control form-control-sm quote-qty-input" value="1" min="1"></td>' +
      '<td><input type="number" name="price" class="form-control form-control-sm quote-price-input" value="0" min="0" step="1000"></td>' +
      '<td class="quote-line-amount fw-semibold">0 đ</td>' +
      '<td class="text-end">' +
      '<button type="button" class="btn btn-sm btn-outline-primary btn-quote-line-edit me-1" title="Đổi sản phẩm"><i class="bi bi-pencil"></i></button>' +
      '<button type="button" class="btn btn-sm btn-outline-danger btn-remove-quote-row" title="Xóa dòng"><i class="bi bi-trash"></i></button>' +
      '</td>';

    tbody.appendChild(row);
    row.dataset.amount = '0';

    var picker = row.querySelector('.quote-product-picker');
    initProductPicker(picker, row);

    row.querySelector('.btn-remove-quote-row').addEventListener('click', function () {
      row.remove();
      renumberRows();
      syncAllProductMenus();
      recalcQuoteTotals();
    });

    row.querySelector('.btn-quote-line-edit').addEventListener('click', function () {
      picker.querySelector('.quote-product-picker-btn').click();
    });

    row.querySelector('input[name="qty"]').addEventListener('input', function () {
      updateRowAmount(row);
      recalcQuoteTotals();
    });
    row.querySelector('input[name="price"]').addEventListener('input', function () {
      updateRowAmount(row);
      recalcQuoteTotals();
    });

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
      createModal.addEventListener('shown.bs.modal', function () {
        var tbody = document.getElementById('quote-items-body');
        if (tbody && !tbody.children.length) addQuoteRow();
      });
      createModal.addEventListener('hidden.bs.modal', function () {
        var form = document.getElementById('create-quote-form');
        if (form) form.reset();
        resetCreateQuoteForm();
      });
    }

    var createForm = document.getElementById('create-quote-form');
    if (createForm) {
      createForm.addEventListener('submit', function (e) {
        recalcQuoteTotals();
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
