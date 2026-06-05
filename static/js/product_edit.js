(function () {
  var FIELD_LABELS = {
    name: 'Tên sản phẩm',
    sku: 'SKU',
    model: 'Mã model',
    warranty: 'Bảo hành',
    low_stock: 'Tồn tối thiểu',
    category_label: 'Danh mục',
    brand_label: 'Thương hiệu',
    variant: 'Biến thể',
    image_url: 'URL hình ảnh',
    base_unit: 'Đơn vị tồn kho',
    purchase_unit: 'Đơn vị nhập',
    unit_conversion_enabled: 'Quy đổi đơn vị',
    conversion_factor: 'Hệ số quy đổi',
    lot_unit_enabled: 'Đơn vị lô',
    lot_unit: 'Tên đơn vị lô',
    lot_factor: 'Hệ số lô',
    sale_unit_mode: 'Đơn vị hiển thị bán',
    stock: 'Tồn kho',
    cost_price: 'Giá nhập',
    retail_price: 'Giá lẻ',
    dealer_price: 'Giá sỉ',
    project_price: 'Giá công trình',
    variant_image_urls: 'Ảnh biến thể',
    variant_brand_ids: 'Thương hiệu biến thể',
  };

  var MONEY_FIELDS = {
    cost_price: 1,
    retail_price: 1,
    dealer_price: 1,
    project_price: 1,
  };

  var SALE_MODE_LABELS = {
    base: 'Đơn vị tồn',
    purchase: 'Đơn vị nhập',
    lot: 'Lô',
  };

  function syncProductEditSidebar() {
    var page = document.querySelector('.product-edit-page');
    if (!page) return;
    var baseInput = page.querySelector('[data-base-unit-input]');
    var purchaseInput = page.querySelector('[data-purchase-unit-input]');
    var factorInput = page.querySelector('[data-conversion-factor-input]');
    var toggle = page.querySelector('[data-unit-conversion-toggle]');

    function sync() {
      var base = (baseInput && baseInput.value.trim()) || 'cái';
      var purchase = (purchaseInput && purchaseInput.value.trim()) || base;
      var factor = parseFloat(factorInput && factorInput.value ? factorInput.value : '1') || 1;
      var convOn = toggle && toggle.checked;

      page.querySelectorAll('[data-edit-sidebar-base-unit]').forEach(function (el) {
        el.textContent = base;
      });
      page.querySelectorAll('[data-edit-sidebar-purchase-unit]').forEach(function (el) {
        el.textContent = purchase;
      });
      page.querySelectorAll('[data-edit-low-stock-suffix]').forEach(function (el) {
        el.textContent = base;
      });
      var convBox = page.querySelector('[data-edit-conv-summary]');
      if (convBox) {
        if (convOn && purchase.toLowerCase() !== base.toLowerCase()) {
          convBox.classList.remove('d-none');
          convBox.textContent =
            'Quy đổi: 1 ' + purchase + ' = ' + formatQtyPlain(factor) + ' ' + base;
        } else {
          convBox.classList.add('d-none');
        }
      }
      var saleInput = page.querySelector('[data-sale-unit-mode-input]');
      var saleLabel = page.querySelector('[data-edit-sale-unit-label]');
      if (saleLabel && saleInput) {
        var mode = saleInput.value || 'base';
        var label = base;
        if (mode === 'purchase' && convOn && purchase.toLowerCase() !== base.toLowerCase()) {
          label = purchase;
        } else if (mode === 'lot') {
          var lotInp = page.querySelector('[data-lot-unit-input]');
          label = (lotInp && lotInp.value.trim()) || 'Lô';
        }
        saleLabel.textContent = label;
      }
    }

    [baseInput, purchaseInput, factorInput, toggle].forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    });
    page.querySelectorAll('.product-sale-unit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTimeout(sync, 0);
      });
    });
    var saleInput = page.querySelector('[data-sale-unit-mode-input]');
    if (saleInput) {
      saleInput.addEventListener('change', sync);
    }
    sync();
  }

  function formatQtyPlain(value) {
    var v = parseFloat(value);
    if (isNaN(v)) return '0';
    if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
    return String(v).replace('.', ',');
  }

  function parseSnapshot() {
    var el = document.getElementById('productEditSnapshotData');
    if (!el) return {};
    try {
      return JSON.parse(el.textContent || '{}');
    } catch (e) {
      return {};
    }
  }

  function formValue(form, name) {
    var el = form.elements[name];
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked ? '1' : '0';
    return String(el.value || '').trim();
  }

  function moneyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizeFieldValue(key, value) {
    if (MONEY_FIELDS[key]) return moneyDigits(value) || '0';
    if (key === 'stock' || key === 'low_stock' || key === 'conversion_factor' || key === 'lot_factor') {
      var n = parseFloat(String(value || '').replace(',', '.'));
      if (isNaN(n)) return '0';
      if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
      return String(n);
    }
    if (key === 'unit_conversion_enabled' || key === 'lot_unit_enabled') {
      return value === '1' || value === true || value === 'on' ? '1' : '0';
    }
    return String(value || '').trim();
  }

  function displayFieldValue(key, value) {
    if (!value && value !== '0') return '—';
    if (MONEY_FIELDS[key]) {
      var digits = moneyDigits(value);
      if (!digits || digits === '0') return '0 đ';
      return (parseInt(digits, 10) || 0).toLocaleString('vi-VN') + ' đ';
    }
    if (key === 'unit_conversion_enabled' || key === 'lot_unit_enabled') {
      return value === '1' ? 'Bật' : 'Tắt';
    }
    if (key === 'sale_unit_mode') {
      return SALE_MODE_LABELS[value] || value || '—';
    }
    if (key === 'warranty' && value) return value + ' tháng';
    if (key === 'variant_image_urls') {
      try {
        var urls = JSON.parse(value);
        if (Array.isArray(urls)) {
          return urls.map(function (u, i) {
            return (i + 1) + '. ' + (u || '—');
          }).join('\n');
        }
      } catch (e) {
        /* fall through */
      }
    }
    return String(value);
  }

  function resolveCategoryLabel(form) {
    var picker = form.querySelector('.taxonomy-picker');
    if (!picker) return '—';
    var parentSel = picker.querySelector('[name="category_parent_id"]');
    var childSel = picker.querySelector('[name="category_id"]');
    var parentName = '';
    var childName = '';
    if (parentSel && parentSel.value) {
      parentName = parentSel.options[parentSel.selectedIndex]
        ? parentSel.options[parentSel.selectedIndex].textContent.trim()
        : '';
    }
    if (childSel && childSel.value) {
      childName = childSel.options[childSel.selectedIndex]
        ? childSel.options[childSel.selectedIndex].textContent.trim()
        : '';
    }
    if (parentName && childName) return parentName + ' > ' + childName;
    if (childName) return childName;
    if (parentName) return parentName;
    return '—';
  }

  function resolveBrandLabel(form) {
    var picker = form.querySelector('.taxonomy-picker');
    if (!picker) return '—';
    var brandSel = picker.querySelector('[name="brand_id"]');
    if (!brandSel || !brandSel.value) return '—';
    return brandSel.options[brandSel.selectedIndex]
      ? brandSel.options[brandSel.selectedIndex].textContent.trim()
      : '—';
  }

  function collectProductEditState(form) {
    return {
      name: formValue(form, 'name'),
      sku: formValue(form, 'sku'),
      model: formValue(form, 'model'),
      warranty: formValue(form, 'warranty'),
      low_stock: formValue(form, 'low_stock'),
      category_label: resolveCategoryLabel(form),
      brand_label: resolveBrandLabel(form),
      variant: formValue(form, 'variant'),
      image_url: formValue(form, 'image_url'),
      base_unit: formValue(form, 'base_unit'),
      purchase_unit: formValue(form, 'purchase_unit'),
      unit_conversion_enabled: formValue(form, 'unit_conversion_enabled'),
      conversion_factor: formValue(form, 'conversion_factor'),
      lot_unit_enabled: formValue(form, 'lot_unit_enabled'),
      lot_unit: formValue(form, 'lot_unit'),
      lot_factor: formValue(form, 'lot_factor'),
      sale_unit_mode: formValue(form, 'sale_unit_mode'),
      stock: (form.querySelector('[data-variant-stock-submit]') || {}).value || formValue(form, 'stock'),
      cost_price: (form.querySelector('[data-cost-price-submit]') || {}).value || '',
      retail_price: (form.querySelector('[data-retail-price-submit]') || {}).value || '',
      dealer_price: (form.querySelector('[data-dealer-price-submit]') || {}).value || '',
      project_price: (form.querySelector('[data-project-price-submit]') || {}).value || '',
      variant_image_urls: (form.querySelector('[data-variant-image-urls-submit]') || {}).value || '',
      variant_brand_ids: (form.querySelector('[data-variant-brand-ids-submit]') || {}).value || '',
    };
  }

  function computeProductEditChanges(before, after) {
    var changes = [];
    Object.keys(FIELD_LABELS).forEach(function (key) {
      var oldVal = normalizeFieldValue(key, before[key]);
      var newVal = normalizeFieldValue(key, after[key]);
      if (oldVal === newVal) return;
      changes.push({
        key: key,
        label: FIELD_LABELS[key],
        oldDisplay: displayFieldValue(key, before[key]),
        newDisplay: displayFieldValue(key, after[key]),
      });
    });
    return changes;
  }

  function renderPreviewList(container, changes) {
    container.innerHTML = '';
    if (!changes.length) {
      container.innerHTML =
        '<div class="product-edit-preview-empty text-muted text-center py-4">Không có thay đổi nào.</div>';
      return;
    }
    changes.forEach(function (change) {
      var item = document.createElement('div');
      item.className = 'product-edit-preview-item';
      item.innerHTML =
        '<div class="product-edit-preview-label">' + change.label + '</div>' +
        '<div class="product-edit-preview-diff">' +
        '<span class="product-edit-preview-old">' + escapeHtml(change.oldDisplay) + '</span>' +
        '<i class="bi bi-arrow-right product-edit-preview-arrow" aria-hidden="true"></i>' +
        '<span class="product-edit-preview-new">' + escapeHtml(change.newDisplay) + '</span>' +
        '</div>';
      container.appendChild(item);
    });
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br>');
  }

  function initProductEditSavePreview() {
    var form = document.getElementById('productEditForm');
    var modalEl = document.getElementById('productEditPreviewModal');
    var listEl = document.getElementById('productEditPreviewList');
    var confirmBtn = document.getElementById('btnProductEditConfirmSave');
    if (!form || !modalEl || !listEl || !confirmBtn || !window.bootstrap) return;

    var snapshot = parseSnapshot();
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    form.addEventListener('submit', function (e) {
      if (form.dataset.saveConfirmed === '1') {
        form.dataset.saveConfirmed = '';
        return;
      }
      e.preventDefault();
      if (!form.reportValidity()) return;

      form.dispatchEvent(new CustomEvent('product-form-presubmit', { bubbles: true }));
      var current = collectProductEditState(form);
      var changes = computeProductEditChanges(snapshot, current);
      if (!changes.length) {
        if (typeof window.showAppToast === 'function') {
          showAppToast('Không có thay đổi để lưu', 'info');
        } else {
          alert('Không có thay đổi để lưu');
        }
        return;
      }
      renderPreviewList(listEl, changes);
      modal.show();
    });

    confirmBtn.addEventListener('click', function () {
      form.dataset.saveConfirmed = '1';
      modal.hide();
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('.product-edit-page')) return;
    initTaxonomyPickers();
    syncProductEditSidebar();
    if (typeof window.initMoneyInputs === 'function') {
      window.initMoneyInputs(document.querySelector('.product-edit-page'));
    }
    initProductEditSavePreview();
  });
})();
