function setCustomerType(form, type) {
  var hidden = form.querySelector('[data-customer-type-input]');
  if (hidden) hidden.value = type;

  form.querySelectorAll('[data-customer-type]').forEach(function (btn) {
    var on = btn.getAttribute('data-customer-type') === type;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  form.querySelectorAll('[data-customer-panel]').forEach(function (panel) {
    var key = panel.getAttribute('data-customer-panel');
    if (key === 'shared') return;

    var show = key === type;
    panel.hidden = !show;
    panel.querySelectorAll('input, select, textarea').forEach(function (el) {
      el.disabled = !show;
      el.required = false;
      if (!show) return;
      if (type === 'company' && el.hasAttribute('data-field-company-required')) {
        el.required = true;
      }
      if (type === 'individual' && el.hasAttribute('data-field-individual-required')) {
        el.required = true;
      }
    });
  });
}

function initCustomerTypeForms() {
  document.querySelectorAll('[data-customer-type-segment]').forEach(function (segment) {
    var form = segment.closest('form');
    if (!form) return;

    var initial = form.querySelector('[data-customer-type-input]');
    setCustomerType(form, (initial && initial.value) || 'company');

    segment.querySelectorAll('[data-customer-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setCustomerType(form, btn.getAttribute('data-customer-type'));
      });
    });

    form.addEventListener('reset', function () {
      setTimeout(function () {
        setCustomerType(form, 'company');
      }, 0);
    });
  });
}

function activateCustomerHubTab(modalEl, tabName) {
  if (!modalEl || !tabName) return;
  var id = modalEl.id.replace('customerHub', '');
  var target = tabName === 'contract' ? '#hubContract' + id : tabName === 'history' ? '#hubHistory' + id : '#hubInfo' + id;
  var btn = modalEl.querySelector('[data-bs-target="' + target + '"]');
  if (btn && window.bootstrap) {
    bootstrap.Tab.getOrCreateInstance(btn).show();
  }
}

function openCustomerHubFromQuery() {
  var params = new URLSearchParams(window.location.search);
  var hubId = params.get('hub');
  if (!hubId) return;
  var hubTab = params.get('hub_tab') || 'contract';
  var modalEl = document.getElementById('customerHub' + hubId);
  if (!modalEl || !window.bootstrap) return;

  var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
  modalEl.addEventListener(
    'shown.bs.modal',
    function () {
      activateCustomerHubTab(modalEl, hubTab);
    },
    { once: true }
  );

  params.delete('hub');
  params.delete('hub_tab');
  var qs = params.toString();
  var next = window.location.pathname + (qs ? '?' + qs : '');
  history.replaceState({}, '', next);
}

document.addEventListener('DOMContentLoaded', function () {
  initCustomerTypeForms();
  openCustomerHubFromQuery();

  document.querySelectorAll('[data-hub-tab]').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var tab = trigger.getAttribute('data-hub-tab');
      var targetSel = trigger.getAttribute('data-bs-target');
      if (!targetSel) return;
      var modalEl = document.querySelector(targetSel);
      if (!modalEl) return;
      modalEl.addEventListener(
        'shown.bs.modal',
        function () {
          activateCustomerHubTab(modalEl, tab);
        },
        { once: true }
      );
    });
  });

  document.querySelectorAll('.modal').forEach(function (modal) {
    modal.addEventListener('shown.bs.modal', function () {
      var form = modal.querySelector('.customer-form');
      if (!form) return;
      var input = form.querySelector('[data-customer-type-input]');
      setCustomerType(form, input ? input.value : 'company');
    });
  });

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
