document.addEventListener('DOMContentLoaded', function () {
  var PU = window.ProductUnits;
  if (!PU) return;

  function getPlanForBlock(block) {
    if (!block) return null;
    var lineId = block.getAttribute('data-line-id');
    var form = block.closest('form');
    return form ? form.querySelector('.stock-intake-line-plan[data-line-id="' + lineId + '"]') : null;
  }

  function getBarForPlan(planEl) {
    return planEl ? planEl.querySelector('[data-product-unit-mode-bar]') : null;
  }

  function syncPlanDisplay(planEl, mode) {
    if (!planEl) return;
    var bar = getBarForPlan(planEl);
    var product = PU.productFromBar(bar);
    if (!product || !bar) return;
    var lineBase = PU.parseNum(planEl.getAttribute('data-line-max-base'));
    planEl.setAttribute('data-unit-mode', mode);

    var stockD = PU.baseToDisplay(product, PU.parseNum(planEl.dataset.stockBase), mode);
    var shortD = PU.baseToDisplay(product, PU.parseNum(planEl.dataset.shortfallBase), mode);
    var lineD = PU.baseToDisplay(product, lineBase, mode);
    var remainD = PU.baseToDisplay(product, PU.parseNum(planEl.dataset.remainBase), mode);
    var totalD = PU.baseToDisplay(product, PU.parseNum(planEl.dataset.demandBase), mode);
    var unitLabel =
      mode === 'lot' && PU.hasLot(product)
        ? product.lot_unit
        : mode === 'purchase' && PU.hasConversion(product)
          ? product.purchase_unit
          : product.base_unit;

    planEl.querySelectorAll('[data-plan-unit]').forEach(function (el) {
      el.textContent = unitLabel;
    });
    var stockEl = planEl.querySelector('[data-plan-stock]');
    if (stockEl) {
      stockEl.childNodes[0].textContent = PU.formatQty(stockD) + ' ';
    }
    var shortEl = planEl.querySelector('[data-plan-shortfall]');
    if (shortEl) {
      shortEl.childNodes[0].textContent = PU.formatQty(shortD) + ' ';
    }
    var lineEl = planEl.querySelector('[data-plan-line-qty]');
    if (lineEl) {
      lineEl.childNodes[0].textContent = PU.formatQty(lineD) + ' ';
    }
    var remainEl = planEl.querySelector('[data-plan-remain]');
    if (remainEl) {
      remainEl.childNodes[0].textContent = PU.formatQty(remainD) + ' ';
    }
    planEl.querySelectorAll('[data-plan-max-display]').forEach(function (el) {
      el.textContent = PU.formatQty(lineD);
    });
    var strong = planEl.querySelector('[data-plan-remain-strong]');
    if (strong) {
      strong.textContent = PU.formatQty(remainD) + ' ' + unitLabel;
    }

    var allocBlock = planEl.closest('tbody')
      ? planEl.closest('tbody').querySelector(
          '.stock-intake-alloc-block[data-line-id="' + planEl.getAttribute('data-line-id') + '"]'
        )
      : null;
    if (allocBlock) {
      allocBlock.setAttribute('data-unit-mode', mode);
      allocBlock.setAttribute('data-line-max-display', String(lineD));
      allocBlock.querySelectorAll('[data-alloc-unit-header]').forEach(function (el) {
        el.textContent = unitLabel;
      });
      allocBlock.querySelectorAll('[data-alloc-unit-mode]').forEach(function (el) {
        el.value = mode;
      });
      allocBlock.querySelectorAll('[data-alloc-max-label]').forEach(function (el) {
        el.textContent = PU.formatQty(lineD) + ' ' + unitLabel;
      });
      updateAllocBlock(allocBlock);
    }
  }

  document.querySelectorAll('.stock-intake-line-plan').forEach(function (planEl) {
    var bar = getBarForPlan(planEl);
    if (!bar) return;
    var stockText = planEl.querySelector('[data-plan-stock-base]');
    planEl.dataset.stockBase = stockText
      ? stockText.textContent.replace(/[^\d.,]/g, '').replace(',', '.')
      : '0';
    var lineBase = planEl.getAttribute('data-line-max-base');
    planEl.dataset.shortfallBase = planEl.dataset.shortfallBase || '0';
    planEl.dataset.remainBase = planEl.dataset.remainBase || '0';
    planEl.dataset.demandBase = planEl.dataset.demandBase || '0';

    PU.bindUnitModeBar(bar, function (mode) {
      syncPlanDisplay(planEl, mode);
    });
    syncPlanDisplay(planEl, PU.getBarMode(bar));
  });

  function sumAllocInputs(block, inDisplayUnit) {
    var sum = 0;
    block.querySelectorAll('input[name="alloc_qty"]').forEach(function (inp) {
      sum += PU.parseNum(inp.value);
    });
    if (!inDisplayUnit) return sum;
    var bar = getBarForPlan(getPlanForBlock(block));
    var product = PU.productFromBar(bar);
    var mode = block.getAttribute('data-unit-mode') || 'base';
    if (!product) return sum;
    return sum;
  }

  function updateAllocBlock(block) {
    if (!block) return;
    var maxDisplay = PU.parseNum(block.getAttribute('data-line-max-display'));
    var sum = 0;
    block.querySelectorAll('input[name="alloc_qty"]').forEach(function (inp) {
      sum += PU.parseNum(inp.value);
    });
    block.querySelectorAll('[data-alloc-sum]').forEach(function (el) {
      el.textContent = PU.formatQty(sum);
    });
    var over = maxDisplay > 0 && sum > maxDisplay + 1e-6;
    block.classList.toggle('stock-intake-alloc-over', over);
    var planEl = getPlanForBlock(block);
    if (planEl) {
      var unalloc = Math.max(0, maxDisplay - sum);
      planEl.querySelectorAll('[data-unalloc-sum]').forEach(function (el) {
        el.textContent = PU.formatQty(unalloc);
      });
      planEl.querySelectorAll('[data-alloc-sum]').forEach(function (el) {
        el.textContent = PU.formatQty(sum);
      });
      planEl.classList.toggle('stock-intake-alloc-over', over);
    }
  }

  document.querySelectorAll('.stock-intake-alloc-block').forEach(function (block) {
    updateAllocBlock(block);
    block.querySelectorAll('.stock-intake-alloc-qty').forEach(function (inp) {
      inp.addEventListener('input', function () {
        updateAllocBlock(block);
      });
    });
    block.querySelectorAll('.stock-intake-add-alloc-row').forEach(function (btn) {
      btn.addEventListener('click', function () {
        addManualAllocRow(block);
      });
    });
    block.addEventListener('click', function (e) {
      var rm = e.target.closest('.stock-intake-remove-alloc-row');
      if (!rm) return;
      rm.closest('tr').remove();
      updateAllocBlock(block);
    });
  });

  function buildSelectOptions(opts, customers) {
    var seen = {};
    var html = '<option value="">— Chọn khách / đơn —</option>';
    (opts || []).forEach(function (c) {
      var key = String(c.customer_id) + ':' + String(c.order_id || '');
      if (seen[key]) return;
      seen[key] = true;
      html +=
        '<option value="' +
        c.customer_id +
        '" data-order-id="' +
        (c.order_id || '') +
        '" data-quote-id="' +
        (c.quote_id || '') +
        '">' +
        (c.customer_name || '') +
        (c.order_code ? ' — ' + c.order_code : '') +
        '</option>';
    });
    (customers || []).forEach(function (c) {
      var key = String(c.customer_id) + ':';
      if (seen[key]) return;
      seen[key] = true;
      html += '<option value="' + c.customer_id + '">' + (c.customer_name || '') + '</option>';
    });
    return html;
  }

  function addManualAllocRow(block) {
    var tbody = block.querySelector('.stock-intake-alloc-tbody');
    if (!tbody) return;
    var lineId = block.getAttribute('data-line-id');
    var mode = block.getAttribute('data-unit-mode') || 'base';
    var opts = [];
    var customers = [];
    try {
      opts = JSON.parse(block.getAttribute('data-alloc-options') || '[]');
      customers = JSON.parse(block.getAttribute('data-customer-choices') || '[]');
    } catch (e) {}
    var tr = document.createElement('tr');
    tr.className = 'stock-intake-alloc-manual-row';
    tr.innerHTML =
      '<td><select class="form-select form-select-sm stock-intake-alloc-pick">' +
      buildSelectOptions(opts, customers) +
      '</select>' +
      '<input type="hidden" name="alloc_line_id" value="' +
      lineId +
      '">' +
      '<input type="hidden" name="alloc_customer_id" value="">' +
      '<input type="hidden" name="alloc_order_id" value="">' +
      '<input type="hidden" name="alloc_quote_id" value="">' +
      '<input type="hidden" name="alloc_unit_mode" value="' +
      mode +
      '" data-alloc-unit-mode></td>' +
      '<td class="text-end">—</td>' +
      '<td class="text-end"><input type="number" name="alloc_qty" class="form-control form-control-sm text-end stock-intake-alloc-qty" min="0" step="any" value="0"></td>' +
      '<td class="text-end"><button type="button" class="btn btn-sm btn-link text-danger stock-intake-remove-alloc-row"><i class="bi bi-trash"></i></button></td>';
    tbody.appendChild(tr);
    var pick = tr.querySelector('.stock-intake-alloc-pick');
    pick.addEventListener('change', function () {
      var opt = pick.options[pick.selectedIndex];
      tr.querySelector('input[name="alloc_customer_id"]').value = pick.value || '';
      tr.querySelector('input[name="alloc_order_id"]').value = opt && opt.dataset.orderId ? opt.dataset.orderId : '';
      tr.querySelector('input[name="alloc_quote_id"]').value = opt && opt.dataset.quoteId ? opt.dataset.quoteId : '';
    });
    tr.querySelector('.stock-intake-alloc-qty').addEventListener('input', function () {
      updateAllocBlock(block);
    });
    updateAllocBlock(block);
  }

  document.querySelectorAll('.stock-intake-approve-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var warnings = [];
      form.querySelectorAll('.stock-intake-alloc-block').forEach(function (block) {
        var maxDisplay = PU.parseNum(block.getAttribute('data-line-max-display'));
        var sum = 0;
        block.querySelectorAll('input[name="alloc_qty"]').forEach(function (inp) {
          sum += PU.parseNum(inp.value);
        });
        if (maxDisplay > 0 && sum > maxDisplay + 1e-6) {
          warnings.push('Tổng phân bổ (' + sum + ') vượt SL nhập dòng (' + maxDisplay + ').');
        }
      });
      if (warnings.length && !confirm(warnings.join('\n') + '\n\nVẫn gửi duyệt?')) {
        e.preventDefault();
      }
    });
  });
});
