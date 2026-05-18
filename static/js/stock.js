function moveStockModalsToBody() {
  document.querySelectorAll('.stock-page-modal').forEach(function (modalEl) {
    if (modalEl.parentElement !== document.body) {
      document.body.appendChild(modalEl);
    }
  });
}

function openStockModal(selector) {
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

function initStockModals() {
  moveStockModalsToBody();

  document.querySelectorAll('.js-open-stock-modal').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openStockModal(btn.getAttribute('data-modal-target'));
    });
  });

  document.querySelectorAll('.js-stock-quick').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var movement = btn.getAttribute('data-movement');
      var productId = btn.getAttribute('data-product-id');
      var target = movement === 'IN' ? '#stockInModal' : '#stockOutModal';
      var selectId = movement === 'IN' ? 'stockInProduct' : 'stockOutProduct';
      closeDropdownFrom(btn);
      openStockModal(target);
      var select = document.getElementById(selectId);
      if (select && productId) select.value = productId;
    });
  });
}

document.addEventListener('DOMContentLoaded', initStockModals);
