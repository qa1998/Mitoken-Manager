(function () {
  var CART_KEY = 'bw_product_quote_draft';
  var variantModalProductId = null;

  function parseCatalog() {
    var el = document.getElementById('quote-catalog-data');
    if (!el) return [];
    try {
      return JSON.parse(el.textContent || '[]');
    } catch (e) {
      return [];
    }
  }

  function lineCatalogKey(productId, variantLabel) {
    var vl = variantLabel || '';
    return vl ? String(productId) + ':' + vl : String(productId);
  }

  function catalogEntriesForProduct(catalog, productId, triggerEl) {
    var entries = catalog.filter(function (p) {
      return String(p.id) === String(productId);
    });
    if (entries.length > 1) return entries;
    var row = triggerEl && triggerEl.closest('tr');
    if (!row) return entries;
    var labelsRaw = row.getAttribute('data-product-variant-labels');
    if (!labelsRaw) return entries;
    var labels;
    try {
      labels = JSON.parse(labelsRaw);
    } catch (e) {
      return entries;
    }
    if (!Array.isArray(labels) || labels.length <= 1) return entries;
    var base = entries[0] || { id: Number(productId) || productId, name: '', sku: '' };
    return labels.map(function (label) {
      var found = catalog.find(function (p) {
        return String(p.id) === String(productId) && (p.variant_label || '') === label;
      });
      if (found) return found;
      return {
        id: base.id,
        sku: base.sku || '',
        name: base.name || '',
        variant_label: label,
        catalog_key: lineCatalogKey(productId, label),
        display_name: label,
        label: (base.sku ? base.sku + ' - ' : '') + label,
        retail_price: base.retail_price || 0,
        dealer_price: base.dealer_price || 0,
        stock: base.stock || 0,
        image_url: base.image_url || '',
        brand_name: base.brand_name || '',
      };
    });
  }

  function findCatalogEntry(catalog, item) {
    if (!item) return null;
    if (item.catalogKey) {
      var byKey = catalog.find(function (p) {
        return p.catalog_key === item.catalogKey;
      });
      if (byKey) return byKey;
    }
    var vl = item.variantLabel || item.variant_label || '';
    return catalog.find(function (p) {
      return String(p.id) === String(item.productId) && (p.variant_label || '') === vl;
    });
  }

  function normalizeDraftItem(item, catalog) {
    if (!item || !item.productId) return null;
    if (item.catalogKey) {
      return {
        productId: item.productId,
        variantLabel: item.variantLabel || item.variant_label || '',
        catalogKey: item.catalogKey,
        qty: item.qty || 1,
      };
    }
    var entries = catalogEntriesForProduct(catalog, item.productId);
    if (!entries.length) return null;
    var entry = entries.length === 1
      ? entries[0]
      : entries.find(function (p) {
          return (p.variant_label || '') === (item.variantLabel || item.variant_label || '');
        }) || entries[0];
    return {
      productId: entry.id,
      variantLabel: entry.variant_label || '',
      catalogKey: entry.catalog_key || lineCatalogKey(entry.id, entry.variant_label),
      qty: item.qty || 1,
    };
  }

  function readDraft() {
    var catalog = parseCatalog();
    try {
      var raw = localStorage.getItem(CART_KEY);
      var data = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(data)) return [];
      return data
        .map(function (item) {
          return normalizeDraftItem(item, catalog);
        })
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function writeDraft(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items || []));
  }

  function isCatalogKeyInDraft(draft, catalogKey) {
    return draft.some(function (item) {
      return item.catalogKey === catalogKey;
    });
  }

  function addProductToQuote(productId, triggerEl) {
    var catalog = parseCatalog();
    var entries = catalogEntriesForProduct(catalog, productId, triggerEl);
    if (!entries.length) return false;
    if (entries.length > 1) {
      openVariantPicker(productId, triggerEl);
      return true;
    }
    var added = addCatalogEntry(entries[0]);
    if (added && triggerEl) flashAddButton(triggerEl);
    return added;
  }

  function closeVariantPickerModal() {
    var modalEl = document.getElementById('productQuoteVariantModal');
    if (!modalEl || !window.bootstrap) return;
    var inst = bootstrap.Modal.getInstance(modalEl);
    if (inst) inst.hide();
  }

  function addCatalogEntry(entry) {
    if (!entry) return false;
    var catalogKey = entry.catalog_key || lineCatalogKey(entry.id, entry.variant_label);
    var draft = readDraft();
    if (isCatalogKeyInDraft(draft, catalogKey)) return false;
    draft.push({
      productId: entry.id,
      variantLabel: entry.variant_label || '',
      catalogKey: catalogKey,
      qty: 1,
    });
    writeDraft(draft);
    syncDraftUi();
    return true;
  }

  function removeFromDraft(catalogKey) {
    writeDraft(
      readDraft().filter(function (item) {
        return item.catalogKey !== catalogKey;
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

  var variantModalTriggerEl = null;
  var variantModalPendingKeys = null;

  function initVariantModalPending(productId, triggerEl) {
    var catalog = parseCatalog();
    var entries = catalogEntriesForProduct(catalog, productId, triggerEl);
    var draft = readDraft();
    variantModalPendingKeys = new Set();
    entries.forEach(function (entry) {
      var catalogKey = entry.catalog_key || lineCatalogKey(entry.id, entry.variant_label);
      if (isCatalogKeyInDraft(draft, catalogKey)) {
        variantModalPendingKeys.add(catalogKey);
      }
    });
  }

  function updateVariantPickerSelectionUi() {
    var countEl = document.getElementById('productQuoteVariantSelectCount');
    var n = variantModalPendingKeys ? variantModalPendingKeys.size : 0;
    if (countEl) countEl.textContent = String(n);
    document.querySelectorAll('#productQuoteVariantList .product-quote-variant-option').forEach(function (btn) {
      var key = btn.dataset.catalogKey;
      var selected = variantModalPendingKeys && variantModalPendingKeys.has(key);
      btn.classList.toggle('is-selected', !!selected);
      var icon = btn.querySelector('.product-quote-variant-option-add i');
      if (icon) icon.className = selected ? 'bi bi-check-lg' : 'bi bi-plus-lg';
    });
  }

  function toggleVariantModalPending(catalogKey) {
    if (!variantModalPendingKeys || !catalogKey) return;
    if (variantModalPendingKeys.has(catalogKey)) {
      variantModalPendingKeys.delete(catalogKey);
    } else {
      variantModalPendingKeys.add(catalogKey);
    }
    updateVariantPickerSelectionUi();
  }

  function applyVariantModalSelection() {
    if (!variantModalProductId || !variantModalPendingKeys) return;
    var catalog = parseCatalog();
    var entries = catalogEntriesForProduct(catalog, variantModalProductId, variantModalTriggerEl);
    var productKeys = new Set();
    var entryByKey = {};
    entries.forEach(function (entry) {
      var key = entry.catalog_key || lineCatalogKey(entry.id, entry.variant_label);
      productKeys.add(key);
      entryByKey[key] = entry;
    });

    var draft = readDraft();
    var beforeKeys = new Set(draft.map(function (item) {
      return item.catalogKey;
    }));

    draft = draft.filter(function (item) {
      if (!productKeys.has(item.catalogKey)) return true;
      return variantModalPendingKeys.has(item.catalogKey);
    });

    variantModalPendingKeys.forEach(function (key) {
      if (beforeKeys.has(key) || !entryByKey[key]) return;
      var entry = entryByKey[key];
      draft.push({
        productId: entry.id,
        variantLabel: entry.variant_label || '',
        catalogKey: key,
        qty: 1,
      });
    });

    var addedNew = draft.some(function (item) {
      return productKeys.has(item.catalogKey) && !beforeKeys.has(item.catalogKey);
    });

    writeDraft(draft);
    syncDraftUi();
    if (addedNew && variantModalTriggerEl) flashAddButton(variantModalTriggerEl);
    closeVariantPickerModal();
  }

  function renderVariantPickerList(productId, triggerEl) {
    var listEl = document.getElementById('productQuoteVariantList');
    var titleEl = document.getElementById('productQuoteVariantModalTitle');
    var skuEl = document.getElementById('productQuoteVariantModalSku');
    if (!listEl) return;
    var catalog = parseCatalog();
    var entries = catalogEntriesForProduct(catalog, productId, triggerEl || variantModalTriggerEl);
    if (!entries.length) {
      listEl.innerHTML = '<div class="text-center text-muted py-3 small">Không có biến thể cho sản phẩm này</div>';
      updateVariantPickerSelectionUi();
      return;
    }

    if (titleEl) titleEl.textContent = entries[0].name || 'Chọn biến thể';
    if (skuEl) skuEl.textContent = entries[0].sku || '';

    listEl.innerHTML = '';
    entries.forEach(function (entry) {
      var catalogKey = entry.catalog_key || lineCatalogKey(entry.id, entry.variant_label);
      var selected = variantModalPendingKeys && variantModalPendingKeys.has(catalogKey);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'product-quote-variant-option' + (selected ? ' is-selected' : '');
      btn.dataset.catalogKey = catalogKey;
      var thumb = entry.image_url
        ? '<img src="' + entry.image_url + '" alt="" referrerpolicy="no-referrer">'
        : '<span class="product-quote-variant-option-ph"><i class="bi bi-image"></i></span>';
      btn.innerHTML =
        '<span class="product-quote-variant-option-thumb">' + thumb + '</span>' +
        '<span class="product-quote-variant-option-body">' +
        '<span class="product-quote-variant-option-label">' + (entry.variant_label || entry.display_name || entry.name) + '</span>' +
        '<span class="product-quote-variant-option-meta">' +
        (entry.brand_name ? entry.brand_name + ' · ' : '') +
        fmtMoney(entry.dealer_price || entry.retail_price || 0) +
        ' · Tồn: ' + (window.ProductUnits ? ProductUnits.formatQty(entry.stock || 0) : (entry.stock || 0)) +
        '</span>' +
        '</span>' +
        '<span class="product-quote-variant-option-add"><i class="bi ' + (selected ? 'bi-check-lg' : 'bi-plus-lg') + '"></i></span>';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleVariantModalPending(catalogKey);
      });
      listEl.appendChild(btn);
    });
    updateVariantPickerSelectionUi();
  }

  function openVariantPicker(productId, triggerEl) {
    var modalEl = document.getElementById('productQuoteVariantModal');
    if (!modalEl || !window.bootstrap) return;
    variantModalProductId = productId;
    variantModalTriggerEl = triggerEl || null;
    initVariantModalPending(productId, triggerEl);
    renderVariantPickerList(productId, triggerEl);
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
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
      var product = findCatalogEntry(catalog, item);
      if (!product) return;
      var row = document.createElement('div');
      row.className = 'product-quote-cart-item';
      row.dataset.catalogKey = item.catalogKey;
      var thumb = product.image_url
        ? '<img src="' + product.image_url + '" alt="" referrerpolicy="no-referrer">'
        : '<span class="product-quote-cart-item-ph"><i class="bi bi-image"></i></span>';
      var title = product.variant_label || product.display_name || product.name || '';
      row.innerHTML =
        '<div class="product-quote-cart-item-thumb">' + thumb + '</div>' +
        '<div class="product-quote-cart-item-body">' +
        '<div class="product-quote-cart-item-name">' + title + '</div>' +
        '<div class="product-quote-cart-item-meta">' + (product.sku || '') + '</div>' +
        '<div class="product-quote-cart-item-price">' + fmtMoney(product.dealer_price || product.retail_price || 0) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-link text-danger product-quote-cart-remove" title="Xóa"><i class="bi bi-x-lg"></i></button>';
      listEl.appendChild(row);
    });

    listEl.querySelectorAll('.product-quote-cart-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('.product-quote-cart-item');
        if (!row) return;
        removeFromDraft(row.dataset.catalogKey);
        if (variantModalProductId) {
          initVariantModalPending(variantModalProductId, variantModalTriggerEl);
          renderVariantPickerList(variantModalProductId, variantModalTriggerEl);
        }
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
        barText.textContent = 'Đã thêm sản phẩm cho báo giá';
      } else {
        barText.textContent = draft.length + ' dòng đã thêm cho báo giá';
      }
    }
    if (panelCount) panelCount.textContent = String(draft.length);
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
    if (window.QuoteFormApi && typeof window.QuoteFormApi.refreshCatalog === 'function') {
      window.QuoteFormApi.refreshCatalog();
    }
    var modalEl = document.getElementById('createQuoteModal');
    if (!modalEl || !window.bootstrap || !window.QuoteFormApi) return;
    var panel = document.getElementById('productQuoteCartPanel');
    if (panel && panel.classList.contains('show')) {
      var inst = bootstrap.Offcanvas.getInstance(panel);
      if (inst) inst.hide();
    }
    var variantModal = document.getElementById('productQuoteVariantModal');
    if (variantModal && variantModal.classList.contains('show')) {
      var vInst = bootstrap.Modal.getInstance(variantModal);
      if (vInst) vInst.hide();
    }
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    var onShown = function () {
      modalEl.removeEventListener('shown.bs.modal', onShown);
      window.QuoteFormApi.loadQuoteCartItems(draft);
    };
    modalEl.addEventListener('shown.bs.modal', onShown);
    modal.show();
  }

  function bindQuoteCartButtons(root) {
    (root || document).querySelectorAll('.js-add-to-quote-cart').forEach(function (btn) {
      if (btn.dataset.quoteCartInit === '1') return;
      btn.dataset.quoteCartInit = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var pid = btn.getAttribute('data-product-id');
        if (pid) addProductToQuote(pid, btn);
      });
    });
  }

  function bindDraftActions() {
    bindQuoteCartButtons();
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
          if (!readDraft().length || confirm('Bỏ tất cả sản phẩm đã thêm?')) clearDraft();
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

  function moveVariantModalToBody() {
    var modalEl = document.getElementById('productQuoteVariantModal');
    if (modalEl && modalEl.parentElement !== document.body) {
      document.body.appendChild(modalEl);
    }
  }

  function bindVariantModalUi() {
    var modalEl = document.getElementById('productQuoteVariantModal');
    var bar = document.getElementById('productQuoteCartBar');
    var confirmBtn = document.getElementById('btnConfirmQuoteVariants');
    if (!modalEl) return;
    modalEl.addEventListener('show.bs.modal', function () {
      if (bar) bar.classList.add('is-behind-modal');
    });
    modalEl.addEventListener('hidden.bs.modal', function () {
      if (bar) bar.classList.remove('is-behind-modal');
      variantModalTriggerEl = null;
      variantModalPendingKeys = null;
      syncDraftUi();
    });
    if (confirmBtn && confirmBtn.dataset.bound !== '1') {
      confirmBtn.dataset.bound = '1';
      confirmBtn.addEventListener('click', function () {
        applyVariantModalSelection();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('.product-page-v2')) return;
    if (!document.getElementById('productQuoteCartBar')) return;
    moveVariantModalToBody();
    bindVariantModalUi();
    bindDraftActions();
    syncDraftUi();
  });

  window.ProductQuoteCart = {
    addProductToQuote: addProductToQuote,
    clearDraft: clearDraft,
    readDraft: readDraft,
    openCreateQuoteFromDraft: openCreateQuoteFromDraft,
    syncDraftUi: syncDraftUi,
  };
})();
