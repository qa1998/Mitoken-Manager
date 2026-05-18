function initCategoryPickers() {
  document.querySelectorAll('.category-picker').forEach(function (picker) {
    const input = picker.querySelector('input[type=hidden]');
    const btn = picker.querySelector('.category-picker-btn');
    const search = picker.querySelector('.category-search');
    const items = picker.querySelectorAll('.category-item');
    const label = picker.querySelector('.category-picker-label');

    function setValue(value, text) {
      input.value = value || '';
      if (label) label.textContent = text || 'Chọn danh mục';
      btn.classList.toggle('text-muted', !value);
    }

    if (input.value) {
      const match = Array.from(items).find((el) => el.dataset.value === input.value);
      setValue(input.value, match ? match.textContent.trim() : input.value);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      document.querySelectorAll('.category-picker-menu.open').forEach((m) => {
        if (!picker.contains(m)) m.classList.remove('open');
      });
      picker.querySelector('.category-picker-menu').classList.toggle('open');
      if (search) {
        search.value = '';
        filterCategoryItems(picker, '');
        search.focus();
      }
    });

    items.forEach(function (item) {
      item.addEventListener('click', function () {
        setValue(item.dataset.value, item.textContent.trim());
        picker.querySelector('.category-picker-menu').classList.remove('open');
      });
    });

    if (search) {
      search.addEventListener('input', function () {
        filterCategoryItems(picker, search.value.toLowerCase());
      });
      search.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }
  });

  document.addEventListener('click', function () {
    document.querySelectorAll('.category-picker-menu.open').forEach((m) => m.classList.remove('open'));
  });
}

function filterCategoryItems(picker, q) {
  picker.querySelectorAll('.category-item').forEach(function (item) {
    const text = item.textContent.toLowerCase();
    item.style.display = !q || text.includes(q) ? '' : 'none';
  });
}

function moveProductModalsToBody() {
  document.querySelectorAll('.product-page-modal, #createProductModal').forEach(function (modalEl) {
    if (modalEl.parentElement !== document.body) {
      document.body.appendChild(modalEl);
    }
  });
}

function initProductStockMethodSelects() {
  document.querySelectorAll('.product-stock-type').forEach(function (typeSel) {
    var methodSel = typeSel.closest('form').querySelector('.product-stock-method');
    if (!methodSel) return;
    var inMethods = (typeSel.dataset.inMethods || '').split('||').filter(Boolean);
    var outMethods = (typeSel.dataset.outMethods || '').split('||').filter(Boolean);
    function syncMethods() {
      var list = typeSel.value === 'OUT' ? outMethods : inMethods;
      var current = methodSel.value;
      methodSel.innerHTML = '';
      list.forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (m === current) opt.selected = true;
        methodSel.appendChild(opt);
      });
      if (!methodSel.value && list.length) methodSel.value = list[0];
    }
    typeSel.addEventListener('change', syncMethods);
    syncMethods();
  });
}

function openProductModal(selector) {
  var el = document.querySelector(selector);
  if (!el || !window.bootstrap) return;
  bootstrap.Modal.getOrCreateInstance(el).show();
}

function closeDropdownFrom(el) {
  var menu = el.closest('.dropdown');
  if (!menu) return;
  var toggle = menu.querySelector('[data-bs-toggle="dropdown"]');
  if (!toggle) return;
  var dd = bootstrap.Dropdown.getInstance(toggle);
  if (dd) dd.hide();
}

function initProductModalActions() {
  moveProductModalsToBody();

  document.querySelectorAll('.js-open-product-modal').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var target = btn.getAttribute('data-modal-target');
      closeDropdownFrom(btn);
      openProductModal(target);
    });
  });

  document.querySelectorAll('.js-switch-product-modal').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var fromSel = btn.getAttribute('data-from-modal');
      var toSel = btn.getAttribute('data-modal-target');
      var fromEl = document.querySelector(fromSel);
      var toEl = document.querySelector(toSel);
      if (!fromEl || !toEl || !window.bootstrap) return;
      var fromModal = bootstrap.Modal.getInstance(fromEl) || bootstrap.Modal.getOrCreateInstance(fromEl);
      fromEl.addEventListener(
        'hidden.bs.modal',
        function () {
          bootstrap.Modal.getOrCreateInstance(toEl).show();
        },
        { once: true }
      );
      fromModal.hide();
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initProductModalActions();
  initProductStockMethodSelects();
  initCategoryPickers();
  document.querySelectorAll('.category-delete-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var name = form.dataset.name || '';
      var count = parseInt(form.dataset.count || '0', 10);
      var msg = 'Xóa danh mục "' + name + '"?';
      if (count > 0) {
        msg += ' ' + count + ' sản phẩm sẽ được bỏ danh mục (để trống).';
      }
      if (!confirm(msg)) e.preventDefault();
    });
  });
  document.querySelectorAll('#product-filter-form .product-search-wrap input, .list-search-wrap input').forEach(function (el) {
    var t;
    el.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        if (el.form) el.form.submit();
      }, 400);
    });
  });
  document.querySelectorAll('.product-toggle-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var label = form.querySelector('button')?.textContent?.trim() || '';
      if (label.indexOf('Ngừng') >= 0 && !confirm('Ngừng bán sản phẩm này?')) e.preventDefault();
    });
  });
});
