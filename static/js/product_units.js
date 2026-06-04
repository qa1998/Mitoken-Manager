/** Quy đổi đơn vị SP — dùng chung báo giá, nhập kho, NCC */
window.ProductUnits = (function () {
  function parseNum(v) {
    var n = parseFloat(String(v || '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  function formatQty(n) {
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return n.toFixed(4).replace(/\.?0+$/, '');
  }

  function unitsDiffer(p) {
    var pu = (p.purchase_unit || '').trim();
    var bu = (p.base_unit || p.unit || '').trim();
    return !!(pu && bu && pu.toLowerCase() !== bu.toLowerCase());
  }

  function hasConversion(p) {
    if (!p) return false;
    var factor = parseNum(p.conversion_factor) || 1;
    if (factor <= 0) return false;
    var diff = unitsDiffer(p);
    if (!diff && factor === 1) return false;
    if (p.unit_conversion_enabled) return diff || factor !== 1;
    return diff && factor !== 1;
  }

  function hasLot(p) {
    return !!(p && p.has_lot_unit && p.lot_unit && parseNum(p.lot_factor) > 1);
  }

  function resolveQty(product, entered, unitMode) {
    var qty = parseNum(entered);
    if (!hasConversion(product)) {
      return { purchaseQty: qty, baseQty: qty, mode: 'base' };
    }
    var factor = parseNum(product.conversion_factor) || 1;
    var mode = unitMode || 'purchase';
    if (mode === 'base') {
      return {
        purchaseQty: factor > 0 ? qty / factor : qty,
        baseQty: qty,
        mode: 'base',
      };
    }
    if (mode === 'lot' && hasLot(product)) {
      var lf = parseNum(product.lot_factor) || 1;
      var purchaseQty = qty * lf;
      return {
        purchaseQty: purchaseQty,
        baseQty: purchaseQty * factor,
        mode: 'lot',
      };
    }
    return {
      purchaseQty: qty,
      baseQty: qty * factor,
      mode: 'purchase',
    };
  }

  function baseToDisplay(product, baseQty, unitMode) {
    var base = parseNum(baseQty);
    if (!hasConversion(product)) return base;
    var factor = parseNum(product.conversion_factor) || 1;
    var mode = unitMode || 'purchase';
    if (mode === 'base') return base;
    if (mode === 'lot' && hasLot(product)) {
      var lf = parseNum(product.lot_factor) || 1;
      if (lf <= 0) return base;
      return base / factor / lf;
    }
    return factor > 0 ? base / factor : base;
  }

  function productFromBar(bar) {
    if (!bar) return null;
    return {
      unit_conversion_enabled: bar.getAttribute('data-has-conv') === '1',
      conversion_factor: parseNum(bar.getAttribute('data-conversion-factor')) || 1,
      base_unit: bar.getAttribute('data-base-unit') || '',
      purchase_unit: bar.getAttribute('data-purchase-unit') || '',
      lot_unit: bar.getAttribute('data-lot-unit') || '',
      lot_factor: parseNum(bar.getAttribute('data-lot-factor')) || 0,
      has_lot_unit: bar.getAttribute('data-has-lot') === '1',
    };
  }

  function getBarMode(bar) {
    var active = bar && bar.querySelector('.product-unit-mode-btn.active');
    return (active && active.getAttribute('data-unit-mode')) || bar.getAttribute('data-selected-mode') || 'base';
  }

  function bindUnitModeBar(bar, onChange) {
    if (!bar || bar.dataset.unitBarInit === '1') return;
    bar.dataset.unitBarInit = '1';
    bar.querySelectorAll('.product-unit-mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var mode = btn.getAttribute('data-unit-mode');
        bar.setAttribute('data-selected-mode', mode);
        bar.querySelectorAll('.product-unit-mode-btn').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        if (typeof onChange === 'function') onChange(mode, bar);
      });
    });
  }

  return {
    parseNum: parseNum,
    formatQty: formatQty,
    hasConversion: hasConversion,
    hasLot: hasLot,
    resolveQty: resolveQty,
    baseToDisplay: baseToDisplay,
    productFromBar: productFromBar,
    getBarMode: getBarMode,
    bindUnitModeBar: bindUnitModeBar,
  };
})();
