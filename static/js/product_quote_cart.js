(function () {
  var CART_KEY = 'bw_product_quote_draft';

  function parseCatalog() {
    var el = document.getElementById('quote-catalog-data');
    if (!el) return [];
    try {
      return JSON.parse(el.textContent || '[]');
    } catch (e) {
      return [];
    }
  }

  function findCatalogProduct(catalog, productId) {
    return catalog.find(function (p) {
      return String(p.id) === String(productId);
    });
  }

  function readDraft() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function writeDraft(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items || []));
  }

  function isInDraft(draft, productId) {
    return draft.some(function (item) {
      return String(item.productId) === String(productId);
    });
  }

  /** Chọn / bỏ chọn sản phẩm — có thể chọn nhiều, chưa mở form tạo báo giá. */
  function toggleProduct(productId) {
    var catalog = parseCatalog();
    var product = findCatalogProduct(catalog, productId);
    if (!product) return false;
    var draft = readDraft();
    if (isInDraft(draft, productId)) {
      draft = draft.filter(function (item) {
        return String(item.productId) !== String(productId);
      });
    } else {
      draft.push({ productId: product.id, qty: 1 });
    }
    writeDraft(draft);
    syncDraftUi();
    return true;
  }

  function removeFromDraft(productId) {
    writeDraft(
      readDraft().filter(function (item) {
        return String(item.productId) !== String(productId);
      })
    );
    syncDraftUi();
  }

  function clearDraft() {
    writeDraft([]);
    syncDraftUi();
  }

  function fmtMoney(n) {
    return (parseInt(n, 10) || 0).toLocaleString('vi-VN') + ' đ';
  }

  function renderDraftList() {
    var listEl = document.getElementById('productQuoteCartList');
    var emptyEl = document.getElementById('productQuoteCartEmpty');
    if (!listEl) return;
    var catalog = parseCatalog();
    var draft = readDraft();
    listEl.innerHTML = '';
    if (!draft.length) {
      listEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    listEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;

    draft.forEach(function (item) {
      var product = findCatalogProduct(catalog, item.productId);
      if (!product) return;
      var row = document.createElement('div');
      row.className = 'product-quote-cart-item';
      row.dataset.productId = String(item.productId);
      var thumb = product.image_url
        ? '<img src="' + product.image_url + '" alt="" referrerpolicy="no-referrer">'
        : '<span class="product-quote-cart-item-ph"><i class="bi bi-image"></i></span>';
      row.innerHTML =
        '<div class="product-quote-cart-item-thumb">' + thumb + '</div>' +
        '<div class="product-quote-cart-item-body">' +
        '<div class="product-quote-cart-item-name">' + (product.name || '') + '</div>' +
        '<div class="product-quote-cart-item-meta">' + (product.sku || '') + '</div>' +
        '<div class="product-quote-cart-item-price">' + fmtMoney(product.dealer_price || product.retail_price || 0) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-link text-danger product-quote-cart-remove" title="Bỏ chọn"><i class="bi bi-x-lg"></i></button>';
      listEl.appendChild(row);
    });

    listEl.querySelectorAll('.product-quote-cart-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('.product-quote-cart-item');
        if (!row) return;
        removeFromDraft(row.dataset.productId);
      });
    });
  }

  function syncDraftUi() {
    var draft = readDraft();
    var bar = document.getElementById('productQuoteCartBar');
    var barText = document.getElementById('productQuoteCartBarText');
    var panelCount = document.getElementById('productQuoteDraftCount');
    if (bar) {
      bar.hidden = !draft.length;
      bar.classList.toggle('is-visible', draft.length > 0);
    }
    if (barText) {
      if (!draft.length) {
        barText.textContent = 'Đã chọn sản phẩm cho báo giá';
      } else {
        barText.textContent = draft.length + ' sản phẩm đã chọn cho báo giá';
      }
    }
    if (panelCount) panelCount.textContent = String(draft.length);
    document.querySelectorAll('.js-add-to-quote-cart').forEach(function (btn) {
      var pid = btn.getAttribute('data-product-id');
      btn.classList.toggle('is-selected', isInDraft(draft, pid));
    });
    renderDraftList();
  }

  function flashAddButton(btn) {
    if (!btn) return;
    btn.classList.add('is-just-added');
    setTimeout(function () {
      btn.classList.remove('is-just-added');
    }, 500);
  }

  function openCreateQuoteFromDraft() {
    var draft = readDraft();
    if (!draft.length) return;
    var modalEl = document.getElementById('createQuoteModal');
    if (!modalEl || !window.bootstrap || !window.QuoteFormApi) return;
    var panel = document.getElementById('productQuoteCartPanel');
    if (panel && panel.classList.contains('show')) {
      var inst = bootstrap.Offcanvas.getInstance(panel);
      if (inst) inst.hide();
    }
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    var onShown = function () {
      modalEl.removeEventListener('shown.bs.modal', onShown);
      window.QuoteFormApi.loadQuoteCartItems(draft);
    };
    modalEl.addEventListener('shown.bs.modal', onShown);
    modal.show();
  }

  function bindDraftActions() {
    document.querySelectorAll('.js-add-to-quote-cart').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        var pid = btn.getAttribute('data-product-id');
        if (!pid) return;
        var wasSelected = isInDraft(readDraft(), pid);
        if (toggleProduct(pid) && !wasSelected) flashAddButton(btn);
      });
    });

    var openBtn = document.getElementById('btnOpenQuoteCart');
    var panelEl = document.getElementById('productQuoteCartPanel');
    if (openBtn && panelEl && window.bootstrap) {
      openBtn.addEventListener('click', function () {
        bootstrap.Offcanvas.getOrCreateInstance(panelEl).show();
      });
    }

    ['btnCreateQuoteFromCart', 'btnCreateQuoteFromCartPanel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', openCreateQuoteFromDraft);
    });

    ['btnClearQuoteCart', 'btnClearQuoteCartPanel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', function () {
          if (!readDraft().length || confirm('Bỏ tất cả sản phẩm đã chọn?')) clearDraft();
        });
      }
    });

    var quoteForm = document.getElementById('create-quote-form');
    if (quoteForm) {
      quoteForm.addEventListener('submit', function () {
        clearDraft();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('.product-page-v2')) return;
    if (!document.getElementById('productQuoteCartBar')) return;
    bindDraftActions();
    syncDraftUi();
  });

  window.ProductQuoteCart = {
    toggleProduct: toggleProduct,
    clearDraft: clearDraft,
    readDraft: readDraft,
    openCreateQuoteFromDraft: openCreateQuoteFromDraft,
    syncDraftUi: syncDraftUi,
  };
})();
