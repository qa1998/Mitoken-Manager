(function () {
  function formatQtyPlain(value) {
    var v = parseFloat(value);
    if (isNaN(v)) return '0';
    if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
    return String(v).replace('.', ',');
  }

  function parseMoneyPlain(value) {
    return parseInt(String(value || '').replace(/\D/g, ''), 10) || 0;
  }

  function formatMoneyPlain(n) {
    return (parseInt(n, 10) || 0).toLocaleString('vi-VN');
  }

  function syncSupplierCatalogAddSidebar() {
    var page = document.querySelector('[data-supplier-sp-add-page]');
    if (!page) return;

    var baseInput = page.querySelector('[data-base-unit-input]');
    var purchaseInput = page.querySelector('[data-purchase-unit-input]');
    var factorInput = page.querySelector('[data-conversion-factor-input]');
    var toggle = page.querySelector('[data-unit-conversion-toggle]');
    var costInput = page.querySelector('[data-supplier-catalog-cost-input]');

    function sync() {
      var base = (baseInput && baseInput.value.trim()) || 'cái';
      var purchase = (purchaseInput && purchaseInput.value.trim()) || base;
      var factor = parseFloat(factorInput && factorInput.value ? factorInput.value : '1') || 1;
      var convOn = toggle && toggle.checked;
      var purchaseDisplay = convOn && purchase.toLowerCase() !== base.toLowerCase() ? purchase : base;

      page.querySelectorAll('[data-edit-sidebar-base-unit]').forEach(function (el) {
        el.textContent = base;
      });
      page.querySelectorAll('[data-edit-sidebar-purchase-unit]').forEach(function (el) {
        el.textContent = purchaseDisplay;
      });
      page.querySelectorAll('[data-supplier-catalog-cost-unit]').forEach(function (el) {
        el.textContent = purchaseDisplay;
      });

      var hero = page.querySelector('[data-supplier-catalog-conv-hero]');
      var convRow = page.querySelector('[data-supplier-catalog-conv-row]');
      var convSummary = page.querySelector('[data-edit-conv-summary]');
      var convText = '';
      if (convOn && purchase.toLowerCase() !== base.toLowerCase()) {
        convText = '1 ' + purchase + ' = ' + formatQtyPlain(factor) + ' ' + base;
        if (hero) hero.textContent = convText;
        if (convRow) convRow.classList.remove('d-none');
        if (convSummary) convSummary.textContent = convText;
      } else {
        if (hero) hero.textContent = '1 ' + base + ' = 1 ' + base;
        if (convRow) convRow.classList.add('d-none');
        if (convSummary) convSummary.textContent = '—';
      }

      var tip = page.querySelector('[data-supplier-catalog-summary-tip]');
      if (tip) {
        if (convOn && purchase.toLowerCase() !== base.toLowerCase()) {
          tip.textContent =
            'Tồn kho được quản lý theo ' +
            base +
            '. Khi nhập hàng theo ' +
            purchase +
            ', hệ thống tự quy đổi sang ' +
            base +
            ' (1 ' +
            purchase +
            ' = ' +
            formatQtyPlain(factor) +
            ' ' +
            base +
            ').';
        } else {
          tip.textContent =
            'Không quy đổi: đơn vị tồn, nhập và bán đều theo ' + base + '.';
        }
      }

      var costDisplay = page.querySelector('[data-supplier-catalog-cost-display]');
      if (costDisplay) {
        var amount = costInput ? parseMoneyPlain(costInput.value) : 0;
        costDisplay.textContent = amount > 0 ? formatMoneyPlain(amount) + ' đ / ' + purchaseDisplay : '—';
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

    [baseInput, purchaseInput, factorInput, toggle, costInput].forEach(function (el) {
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
    if (saleInput) saleInput.addEventListener('change', sync);
    sync();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.querySelector('[data-supplier-sp-add-page]');
    if (!page) return;
    if (typeof window.initProductUnitSetup === 'function') {
      initProductUnitSetup(page);
    }
    if (typeof window.initMoneyInputs === 'function') {
      initMoneyInputs(page);
    }
    syncSupplierCatalogAddSidebar();
    var bulkBtn = page.querySelector('[data-unit-preset-bulk]');
    if (bulkBtn && !page.dataset.unitPresetApplied) {
      page.dataset.unitPresetApplied = '1';
      bulkBtn.click();
    }
  });
})();
