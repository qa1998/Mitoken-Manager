function fmtMoney(n){return (parseInt(n||0)).toLocaleString('vi-VN')+' đ'}

var APP_TOAST_ICONS = {
  success: 'bi-check-circle-fill',
  danger: 'bi-x-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill',
  secondary: 'bi-bell-fill',
};

function normalizeAppToastCategory(category) {
  if (category === 'error') return 'danger';
  if (category && APP_TOAST_ICONS[category]) return category;
  return 'info';
}

function ensureAppToastContainer() {
  var container = document.getElementById('appToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'appToastContainer';
    container.className = 'app-toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
  }
  return container;
}

function dismissAppToast(toastEl) {
  if (!toastEl || toastEl.classList.contains('is-hiding')) return;
  toastEl.classList.remove('is-visible');
  toastEl.classList.add('is-hiding');
  window.setTimeout(function () {
    if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
  }, 280);
}

function showAppToast(message, category, options) {
  if (!message) return null;
  options = options || {};
  var cat = normalizeAppToastCategory(category);
  var duration = typeof options.duration === 'number' ? options.duration : 5000;
  var container = ensureAppToastContainer();

  var toast = document.createElement('div');
  toast.className = 'app-toast app-toast-' + cat;
  toast.setAttribute('role', 'status');

  var icon = document.createElement('i');
  icon.className = 'bi ' + (APP_TOAST_ICONS[cat] || APP_TOAST_ICONS.info) + ' app-toast-icon';
  icon.setAttribute('aria-hidden', 'true');

  var text = document.createElement('span');
  text.className = 'app-toast-text app-toast-multiline';
  text.textContent = String(message);

  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn-close app-toast-close';
  closeBtn.setAttribute('aria-label', 'Đóng');
  closeBtn.addEventListener('click', function () {
    dismissAppToast(toast);
  });

  toast.appendChild(icon);
  toast.appendChild(text);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  requestAnimationFrame(function () {
    toast.classList.add('is-visible');
  });

  if (duration > 0) {
    window.setTimeout(function () {
      dismissAppToast(toast);
    }, duration);
  }
  return toast;
}

window.showAppToast = showAppToast;

function initAppFlashes() {
  var dataEl = document.getElementById('app-flash-data');
  if (!dataEl || !dataEl.textContent) return;
  try {
    var messages = JSON.parse(dataEl.textContent);
    if (!Array.isArray(messages)) return;
    messages.forEach(function (entry, index) {
      var category = entry[0];
      var message = entry[1];
      window.setTimeout(function () {
        showAppToast(message, category, { duration: 5000 });
      }, index * 120);
    });
  } catch (e) {
    /* ignore malformed flash payload */
  }
  dataEl.parentNode && dataEl.parentNode.removeChild(dataEl);
}

function vnSearchFold(value) {
  if (value == null) return '';
  var text = String(value).trim().toLowerCase();
  var map = {
    à: 'a', á: 'a', ả: 'a', ã: 'a', ạ: 'a',
    ă: 'a', ằ: 'a', ắ: 'a', ẳ: 'a', ẵ: 'a', ặ: 'a',
    â: 'a', ầ: 'a', ấ: 'a', ẩ: 'a', ẫ: 'a', ậ: 'a',
    è: 'e', é: 'e', ẻ: 'e', ẽ: 'e', ẹ: 'e',
    ê: 'e', ề: 'e', ế: 'e', ể: 'e', ễ: 'e', ệ: 'e',
    ì: 'i', í: 'i', ỉ: 'i', ĩ: 'i', ị: 'i',
    ò: 'o', ó: 'o', ỏ: 'o', õ: 'o', ọ: 'o',
    ô: 'o', ồ: 'o', ố: 'o', ổ: 'o', ỗ: 'o', ộ: 'o',
    ơ: 'o', ờ: 'o', ớ: 'o', ở: 'o', ỡ: 'o', ợ: 'o',
    ù: 'u', ú: 'u', ủ: 'u', ũ: 'u', ụ: 'u',
    ư: 'u', ừ: 'u', ứ: 'u', ử: 'u', ữ: 'u', ự: 'u',
    ỳ: 'y', ý: 'y', ỷ: 'y', ỹ: 'y', ỵ: 'y',
    đ: 'd',
  };
  return text
    .split('')
    .map(function (ch) {
      return map[ch] || ch;
    })
    .join('');
}

function vnSearchMatch(haystack, query) {
  var foldedHay = vnSearchFold(haystack);
  var tokens = String(query || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every(function (token) {
    return foldedHay.indexOf(vnSearchFold(token)) !== -1;
  });
}

window.vnSearchFold = vnSearchFold;
window.vnSearchMatch = vnSearchMatch;

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

/** Dropdown trong bảng — Popper strategy fixed (tránh clip overflow + hàng che menu). */
function initTableDropdowns(root) {
  if (!window.bootstrap || !window.bootstrap.Dropdown) return;
  var selector = [
    '.customer-table-wrap [data-bs-toggle="dropdown"]',
    '.product-table-v2 [data-bs-toggle="dropdown"]',
    '.quote-list-table-wrap [data-bs-toggle="dropdown"]',
    '.order-list-table-wrap [data-bs-toggle="dropdown"]',
    '.stock-table [data-bs-toggle="dropdown"]',
    '.debt-customer-table-wrap [data-bs-toggle="dropdown"]',
    'td.table-actions-cell [data-bs-toggle="dropdown"]',
  ].join(', ');
  (root || document).querySelectorAll(selector).forEach(function (toggle) {
    if (toggle.dataset.tableDropdownInit === '1') return;
    toggle.dataset.tableDropdownInit = '1';
    var existing = bootstrap.Dropdown.getInstance(toggle);
    if (existing) existing.dispose();
    new bootstrap.Dropdown(toggle, {
      popperConfig: {
        strategy: 'fixed',
      },
    });
  });
}

document.addEventListener('show.bs.dropdown', function (e) {
  var cell = e.target.closest('.table-actions-cell');
  if (cell) cell.classList.add('is-dropdown-open');
});

document.addEventListener('hide.bs.dropdown', function (e) {
  var cell = e.target.closest('.table-actions-cell');
  if (cell) cell.classList.remove('is-dropdown-open');
});

function relocateAppModalsToBody(root) {
  (root || document).querySelectorAll('.modal.fade').forEach(function (modal) {
    if (modal.dataset.appModalRelocated === '1') return;
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    modal.dataset.appModalRelocated = '1';
  });
}

function initAppFullscreenModals(root) {
  relocateAppModalsToBody(root);
  (root || document).querySelectorAll('.modal.fade').forEach(function (modal) {
    if (modal.dataset.appFsModal === '0') return;
    if (modal.classList.contains('modal-compact')) return;
    modal.classList.add('app-fs-modal');
    if (modal.dataset.bsBackdrop === undefined) {
      modal.setAttribute('data-bs-backdrop', 'false');
    }
  });
}

function ensureAppPushBackButton(modal) {
  if (!modal || !modal.classList.contains('app-fs-modal')) return;
  modal.querySelectorAll('.modal-header, .quote-create-header').forEach(function (header) {
    if (header.querySelector('.app-push-back-btn')) return;
    header.classList.add('app-push-modal-header');
    var backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn app-push-back-btn';
    backBtn.setAttribute('aria-label', 'Quay lại');
    backBtn.innerHTML = '<i class="bi bi-arrow-left" aria-hidden="true"></i><span>Quay lại</span>';
    backBtn.addEventListener('click', function () {
      var inst = window.bootstrap && bootstrap.Modal.getInstance(modal);
      if (inst) inst.hide();
    });
    header.insertBefore(backBtn, header.firstChild);
  });
}

function syncAppFullscreenBackdrop() {
  var open = document.querySelector('.modal.app-fs-modal.show');
  document.body.classList.toggle('app-fs-modal-open', !!open);
  document.querySelectorAll('.modal-backdrop.show').forEach(function (backdrop) {
    backdrop.classList.toggle('app-fs-backdrop', !!open);
  });
}

function isAppModalNode(el) {
  return el && el.classList && el.classList.contains('modal');
}

function getAppPageStack(content) {
  var stack = content.querySelector(':scope > .app-page-stack');
  if (stack) return stack;
  var pageRoot = content.querySelector(
    ':scope > .quote-page, :scope > .order-page, :scope > .stock-page, :scope > .debt-page, :scope > .product-page-v2, :scope > .product-page, :scope > .supplier-page, :scope > .supplier-entity-page, :scope > .customer-entity-page, :scope > .contracts-page'
  );
  if (pageRoot) return pageRoot;
  if (content.querySelector(':scope > .company-page, :scope > [data-app-no-fill-list]')) return null;
  var nodes = Array.from(content.children).filter(function (el) {
    return !isAppModalNode(el);
  });
  if (nodes.length < 2) return null;
  stack = document.createElement('div');
  stack.className = 'app-page-stack';
  nodes.forEach(function (el) {
    stack.appendChild(el);
  });
  content.appendChild(stack);
  return stack;
}

function findAppListFillCard(stack) {
  var named = stack.querySelector(
    '.product-list-layout, .debt-list-card, .quote-table-card, .order-table-card, .stock-table-card, .product-list-card-v2, .supplier-list-card, .supplier-entity-tabs-card, .customer-list-card, .contracts-list-card'
  );
  if (named) return named;
  var found = null;
  stack.querySelectorAll('.panel-card').forEach(function (card) {
    if (card.closest('.modal')) return;
    if (card.querySelector('table, .customer-table-wrap')) found = card;
  });
  return found;
}

function markAppListScrollTargets(card) {
  card.querySelectorAll(
    '.customer-table-wrap, .table-responsive, .order-list-table-wrap, .quote-list-table-wrap, .supplier-intake-table-wrap, .supplier-catalog-table-wrap, .supplier-payments-table-wrap'
  ).forEach(function (el) {
    el.classList.add('app-list-scroll');
  });
}

function initAppPageFillLists() {
  var content = document.querySelector('main.content-fill');
  if (!content || content.dataset.appFillInit === '1') return;
  content.dataset.appFillInit = '1';
  var stack = getAppPageStack(content);
  if (!stack) return;
  var listCard = findAppListFillCard(stack);
  if (!listCard) return;
  listCard.classList.add('app-list-fill');
  markAppListScrollTargets(listCard);
}

function isListRowInteractiveTarget(el) {
  return el && el.closest('a, button, input, select, textarea, label, .dropdown, form');
}

function activateListDetailModalTab(modalEl, tabKey) {
  if (!modalEl || !tabKey || !window.bootstrap || !bootstrap.Tab) return;
  var id = modalEl.id || '';
  var target = tabKey === 'contract' ? '#hubContract' + id.replace('customerHub', '')
    : tabKey === 'history' ? '#hubHistory' + id.replace('customerHub', '')
    : '#hubInfo' + id.replace('customerHub', '');
  var btn = modalEl.querySelector('[data-bs-target="' + target + '"]');
  if (btn) bootstrap.Tab.getOrCreateInstance(btn).show();
}

function openListRowDetail(tr) {
  if (!tr) return;
  var modalSel = tr.getAttribute('data-list-detail-modal');
  var href = tr.getAttribute('data-list-detail-href');
  var hubTab = tr.getAttribute('data-list-detail-hub-tab');

  if (modalSel) {
    var modalEl = document.querySelector(modalSel);
    if (!modalEl || !window.bootstrap || !bootstrap.Modal) return;
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    if (hubTab) {
      modalEl.addEventListener('shown.bs.modal', function onShown() {
        activateListDetailModalTab(modalEl, hubTab);
      }, { once: true });
    }
    modal.show();
    return;
  }
  if (href) window.location.href = href;
}

function initListRowDetailClick(root) {
  (root || document).querySelectorAll('table tbody').forEach(function (tbody) {
    if (!tbody.querySelector('tr.list-row-clickable[data-list-detail-modal], tr.list-row-clickable[data-list-detail-href]')) {
      return;
    }
    if (tbody.dataset.listRowClickInit === '1') return;
    tbody.dataset.listRowClickInit = '1';
    tbody.addEventListener('click', function (e) {
      var tr = e.target.closest('tr.list-row-clickable');
      if (!tr || !tbody.contains(tr)) return;
      if (isListRowInteractiveTarget(e.target)) return;
      openListRowDetail(tr);
    });
  });
}

function openAppModalsOnLoad() {
  if (!window.bootstrap || !bootstrap.Modal) return;
  var opened = false;
  document.querySelectorAll('.modal[data-app-open-on-load="1"]').forEach(function (modal) {
    bootstrap.Modal.getOrCreateInstance(modal).show();
    opened = true;
  });
  if (opened) {
    var params = new URLSearchParams(window.location.search);
    if (params.has('open_add')) {
      params.delete('open_add');
      var qs = params.toString();
      history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
    }
  }
}

document.addEventListener('DOMContentLoaded', function () {
  initAppFlashes();
  initAppPageFillLists();
  initAppFullscreenModals();
  openAppModalsOnLoad();
  initListRowDetailClick();
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

document.addEventListener('show.bs.modal', function (e) {
  var modal = e.target;
  if (!modal.classList.contains('app-fs-modal')) return;
  ensureAppPushBackButton(modal);
});

document.addEventListener('shown.bs.modal', function (e) {
  var modal = e.target;
  initAppFullscreenModals(modal);
  if (modal.classList.contains('app-fs-modal')) {
    ensureAppPushBackButton(modal);
  }
  syncAppFullscreenBackdrop();
  initMoneyInputs(modal);
  initTableDropdowns(modal);
  initListRowDetailClick(modal);
});

document.addEventListener('hidden.bs.modal', function () {
  syncAppFullscreenBackdrop();
});
