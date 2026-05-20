function fmtMoney(n){return (parseInt(n||0)).toLocaleString('vi-VN')+' đ'}

function parseMoneyInput(value) {
  return parseInt(String(value || '').replace(/\D/g, ''), 10) || 0;
}

function formatMoneyInputValue(value) {
  var digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return (parseInt(digits, 10) || 0).toLocaleString('vi-VN');
}

function initMoneyInputs(root) {
  (root || document).querySelectorAll('input.money-input').forEach(function (input) {
    if (input.dataset.moneyInputInit === '1') return;
    input.dataset.moneyInputInit = '1';

    if (input.value !== '') {
      input.value = formatMoneyInputValue(input.value);
    }

    input.addEventListener('input', function () {
      var formatted = formatMoneyInputValue(input.value);
      input.value = formatted;
      input.setSelectionRange(formatted.length, formatted.length);
    });

    input.addEventListener('blur', function () {
      if (input.value === '') return;
      input.value = formatMoneyInputValue(input.value);
    });
  });
}
function addQuoteRow(){const wrap=document.getElementById('quote-items');if(!wrap)return;const options=document.getElementById('product-options').innerHTML;const div=document.createElement('div');div.className='row g-2 mb-2 quote-row';div.innerHTML=`<div class="col-md-5"><select name="product_id" class="form-select product-select" onchange="fillPrice(this)">${options}</select></div><div class="col-md-2"><input name="qty" type="number" class="form-control" value="1"></div><div class="col-md-3"><input name="price" class="form-control price-input" value="0"></div><div class="col-md-2"><button type="button" class="btn btn-outline-danger w-100" onclick="this.closest('.quote-row').remove()">Xóa</button></div>`;wrap.appendChild(div)}
function fillPrice(sel){const opt=sel.options[sel.selectedIndex];const price=opt.getAttribute('data-price')||0;sel.closest('.quote-row').querySelector('.price-input').value=price}

/** Dropdown trong bảng: dùng position fixed để không bị cắt bởi overflow của table wrapper. */
function initTableDropdowns(root) {
  if (!window.bootstrap) return;
  (root || document).querySelectorAll('[data-bs-toggle="dropdown"]').forEach(function (toggle) {
    if (toggle.dataset.tableDropdownInit === '1') return;
    toggle.dataset.tableDropdownInit = '1';
    bootstrap.Dropdown.getOrCreateInstance(toggle, {
      popperConfig: function (defaultConfig) {
        defaultConfig.strategy = 'fixed';
        return defaultConfig;
      },
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initMoneyInputs();
  initTableDropdowns();
  document.querySelectorAll('.list-search-wrap input').forEach(function (el) {
    var t;
    el.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        if (el.form) el.form.submit();
      }, 400);
    });
  });
});

document.addEventListener('shown.bs.modal', function (e) {
  initMoneyInputs(e.target);
});
