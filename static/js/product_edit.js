(function () {
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

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('.product-edit-page')) return;
    initTaxonomyPickers();
    syncProductEditSidebar();
    if (typeof window.initMoneyInputs === 'function') {
      window.initMoneyInputs(document.querySelector('.product-edit-page'));
    }
  });
})();
