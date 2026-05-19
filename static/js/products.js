function getTaxonomyCatalog() {
  var el = document.getElementById('taxonomyCatalogData');
  if (!el) return { parents: [], children: {} };
  try {
    return JSON.parse(el.textContent);
  } catch (e) {
    return { parents: [], children: {} };
  }
}

function fillChildCategorySelect(childSelect, parentId, selectedId, emptyLabel) {
  var catalog = getTaxonomyCatalog();
  var label = emptyLabel || '— Chọn danh mục con —';
  childSelect.innerHTML = '<option value="">' + label + '</option>';
  if (!parentId) return;
  var children = catalog.children[String(parentId)] || [];
  children.forEach(function (c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    if (selectedId && String(selectedId) === String(c.id)) opt.selected = true;
    childSelect.appendChild(opt);
  });
}

function filterBrandSelectOptions(brandSelect, parentId, childId) {
  if (!brandSelect) return;
  var scopeIds = new Set();
  if (childId) scopeIds.add(String(childId));
  if (parentId) {
    scopeIds.add(String(parentId));
    var catalog = getTaxonomyCatalog();
    (catalog.children[String(parentId)] || []).forEach(function (c) {
      scopeIds.add(String(c.id));
    });
  }
  Array.from(brandSelect.options).forEach(function (opt, idx) {
    if (idx === 0) {
      opt.hidden = false;
      return;
    }
    var cid = opt.dataset.categoryId || '';
    opt.hidden = scopeIds.size > 0 && cid && !scopeIds.has(cid);
  });
}

function resolveParentIdForCategory(categoryId) {
  if (!categoryId) return '';
  var catalog = getTaxonomyCatalog();
  if (catalog.parents.some(function (p) {
    return String(p.id) === String(categoryId);
  })) {
    return String(categoryId);
  }
  for (var pid in catalog.children) {
    if (
      catalog.children[pid].some(function (c) {
        return String(c.id) === String(categoryId);
      })
    ) {
      return pid;
    }
  }
  return '';
}

function initTaxonomyPickers() {
  document.querySelectorAll('.taxonomy-picker').forEach(function (picker) {
    var parentSel = picker.querySelector('.taxonomy-parent-select');
    var childSel = picker.querySelector('.taxonomy-child-select');
    var brandSel = picker.querySelector('.taxonomy-brand-select');
    if (!parentSel || !childSel) return;

    var selectedCat = picker.dataset.selectedCategoryId || '';
    var selectedBrand = picker.dataset.selectedBrandId || '';
    var parentId = resolveParentIdForCategory(selectedCat);
    var childId = '';
    if (selectedCat && parentId && String(selectedCat) !== String(parentId)) {
      childId = selectedCat;
    } else if (selectedCat && !parentId) {
      parentId = resolveParentIdForCategory(selectedCat);
      childId = selectedCat;
    }

    if (parentId) parentSel.value = parentId;
    fillChildCategorySelect(childSel, parentId, childId);
    if (selectedBrand && brandSel) brandSel.value = selectedBrand;
    filterBrandSelectOptions(brandSel, parentId, childId);

    parentSel.addEventListener('change', function () {
      fillChildCategorySelect(childSel, parentSel.value, '');
      filterBrandSelectOptions(brandSel, parentSel.value, '');
      if (brandSel) brandSel.value = '';
    });
    childSel.addEventListener('change', function () {
      filterBrandSelectOptions(brandSel, parentSel.value, childSel.value);
      if (brandSel) brandSel.value = '';
    });
  });
}

function initProductFilterTaxonomy() {
  var form = document.getElementById('product-filter-form');
  if (!form) return;
  var parentSel = form.querySelector('.product-filter-parent');
  var childSel = form.querySelector('.product-filter-child');
  var brandSel = form.querySelector('.product-filter-brand');
  if (!parentSel || !childSel) return;

  var selectedChild = childSel.dataset.selected || '';
  if (parentSel.value) {
    fillChildCategorySelect(childSel, parentSel.value, selectedChild, 'Tất cả');
  }
  parentSel.addEventListener('change', function () {
    fillChildCategorySelect(childSel, parentSel.value, '', 'Tất cả');
    filterBrandSelectOptions(brandSel, parentSel.value, '');
  });
  childSel.addEventListener('change', function () {
    filterBrandSelectOptions(brandSel, parentSel.value, childSel.value);
  });
  filterBrandSelectOptions(brandSel, parentSel.value, childSel.value);
}

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

  document.querySelectorAll('.category-create-link').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var picker = link.closest('.category-picker');
      if (picker) {
        var menu = picker.querySelector('.category-picker-menu');
        if (menu) menu.classList.remove('open');
      }
      var parentModal = link.closest('.modal');
      if (parentModal && window.bootstrap) {
        var inst = bootstrap.Modal.getInstance(parentModal);
        if (inst) {
          parentModal.addEventListener(
            'hidden.bs.modal',
            function () {
              var catModal = document.getElementById('categoryModal');
              if (catModal) bootstrap.Modal.getOrCreateInstance(catModal).show();
            },
            { once: true }
          );
          inst.hide();
          return;
        }
      }
      var catModal = document.getElementById('categoryModal');
      if (catModal && window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(catModal).show();
      }
    });
  });
}

function filterCategoryItems(picker, q) {
  picker.querySelectorAll('.category-item').forEach(function (item) {
    const text = item.textContent.toLowerCase();
    item.style.display = !q || text.includes(q) ? '' : 'none';
  });
}

function moveProductModalsToBody() {
  document.querySelectorAll('.product-page-modal, #createProductModal, #categoryModal, #importProductModal, #importCategoryModal').forEach(function (modalEl) {
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

function openCategoryModalFromQuery() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('category_modal') !== '1' && params.get('category_import_preview') !== '1') return;
  if (params.get('category_modal') === '1') {
    var modalEl = document.getElementById('categoryModal');
    if (modalEl && window.bootstrap) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }
  if (params.get('category_import_preview') === '1') {
    var importModal = document.getElementById('importCategoryModal');
    if (importModal && window.bootstrap) {
      bootstrap.Modal.getOrCreateInstance(importModal).show();
    }
  }
  params.delete('category_modal');
  params.delete('category_import_preview');
  var qs = params.toString();
  var next = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
  window.history.replaceState({}, '', next);
}

function initCategoryImportPreview() {
  initImportPreviewPanel({
    modalId: 'importCategoryModal',
    stepUploadId: 'importCategoryStepUpload',
    stepPreviewId: 'importCategoryStepPreview',
    summaryId: 'importCategoryPreviewSummary',
    tbodyId: 'importCategoryPreviewBody',
    selectAllId: 'importCategorySelectAll',
    confirmFormId: 'importCategoryConfirmForm',
    btnBackId: 'btnImportCategoryBackUpload',
    previewQueryKey: 'category_import_preview',
    emptyAlert: 'Vui lòng chọn ít nhất một dòng để import.',
    showUpdateChip: false,
  });
}

function initImportPreviewPanel(cfg) {
  var modalEl = document.getElementById(cfg.modalId);
  if (!modalEl) return;

  var stepUpload = document.getElementById(cfg.stepUploadId);
  var stepPreview = document.getElementById(cfg.stepPreviewId);
  var summaryEl = document.getElementById(cfg.summaryId);
  var tbody = document.getElementById(cfg.tbodyId);
  var selectAll = document.getElementById(cfg.selectAllId);
  var confirmForm = document.getElementById(cfg.confirmFormId);
  var btnBack = document.getElementById(cfg.btnBackId);

  function importableRows() {
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr.import-preview-row')).filter(function (tr) {
      return tr.dataset.importable === '1';
    });
  }

  function selectedImportableCount() {
    var n = 0;
    importableRows().forEach(function (tr) {
      var cb = tr.querySelector('.import-row-check');
      if (cb && cb.checked) n += 1;
    });
    return n;
  }

  function updateImportSummary() {
    if (!summaryEl || !tbody) return;
    var rows = Array.from(tbody.querySelectorAll('tr.import-preview-row'));
    var create = 0;
    var update = 0;
    var skip = 0;
    var err = 0;
    rows.forEach(function (tr) {
      var badge = tr.querySelector('.import-action-badge');
      if (!badge) return;
      if (badge.classList.contains('action-create')) create += 1;
      else if (badge.classList.contains('action-update')) update += 1;
      else if (badge.classList.contains('action-skip')) skip += 1;
      else if (badge.classList.contains('action-error')) err += 1;
    });
    var selected = selectedImportableCount();
    var importable = importableRows().length;
    var html =
      '<span class="import-summary-chip">Đã chọn <strong>' +
      selected +
      '</strong>/' +
      importable +
      ' dòng import</span>' +
      '<span class="import-summary-chip chip-create">Thêm mới: ' +
      create +
      '</span>';
    if (cfg.showUpdateChip !== false) {
      html += '<span class="import-summary-chip chip-update">Cập nhật: ' + update + '</span>';
    }
    if (skip) html += '<span class="import-summary-chip chip-skip">Bỏ qua: ' + skip + '</span>';
    if (err) html += '<span class="import-summary-chip chip-error">Lỗi: ' + err + '</span>';
    summaryEl.innerHTML = html;
  }

  function syncSelectAll() {
    if (!selectAll) return;
    var checks = importableRows()
      .map(function (tr) {
        return tr.querySelector('.import-row-check');
      })
      .filter(Boolean);
    if (!checks.length) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      selectAll.disabled = true;
      return;
    }
    selectAll.disabled = false;
    var checked = checks.filter(function (c) {
      return c.checked;
    }).length;
    selectAll.checked = checked === checks.length;
    selectAll.indeterminate = checked > 0 && checked < checks.length;
  }

  function showUploadStep() {
    if (stepUpload) stepUpload.classList.remove('d-none');
    if (stepPreview) stepPreview.classList.add('d-none');
    if (cfg.previewQueryKey) {
      var params = new URLSearchParams(window.location.search);
      if (params.has(cfg.previewQueryKey)) {
        params.delete(cfg.previewQueryKey);
        var qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
      }
    }
  }

  function showPreviewStep() {
    if (stepUpload) stepUpload.classList.add('d-none');
    if (stepPreview) stepPreview.classList.remove('d-none');
    updateImportSummary();
    syncSelectAll();
  }

  if (tbody) {
    tbody.addEventListener('change', function (e) {
      if (e.target.classList.contains('import-row-check')) {
        updateImportSummary();
        syncSelectAll();
      }
    });
    tbody.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-import-row-remove');
      if (!btn) return;
      var tr = btn.closest('tr');
      if (tr) tr.remove();
      updateImportSummary();
      syncSelectAll();
    });
  }

  if (selectAll) {
    selectAll.addEventListener('change', function () {
      importableRows().forEach(function (tr) {
        var cb = tr.querySelector('.import-row-check');
        if (cb) cb.checked = selectAll.checked;
      });
      updateImportSummary();
      syncSelectAll();
    });
  }

  if (btnBack) {
    btnBack.addEventListener('click', function () {
      showUploadStep();
    });
  }

  if (confirmForm) {
    confirmForm.addEventListener('submit', function (e) {
      if (e.submitter && e.submitter.getAttribute('formaction')) return;
      if (selectedImportableCount() === 0) {
        e.preventDefault();
        alert(cfg.emptyAlert || 'Vui lòng chọn ít nhất một dòng để import.');
      }
    });
  }

  if (modalEl.dataset.showPreview === '1' && stepPreview) {
    showPreviewStep();
    if (window.bootstrap) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  } else if (summaryEl && tbody) {
    updateImportSummary();
    syncSelectAll();
  }
}

function initProductImportPreview() {
  initImportPreviewPanel({
    modalId: 'importProductModal',
    stepUploadId: 'importStepUpload',
    stepPreviewId: 'importStepPreview',
    summaryId: 'importPreviewSummary',
    tbodyId: 'importPreviewBody',
    selectAllId: 'importSelectAll',
    confirmFormId: 'importConfirmForm',
    btnBackId: 'btnImportBackUpload',
    previewQueryKey: 'import_preview',
    emptyAlert: 'Vui lòng chọn ít nhất một sản phẩm để import.',
    showUpdateChip: true,
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initProductModalActions();
  initProductStockMethodSelects();
  initCategoryPickers();
  initTaxonomyPickers();
  initProductFilterTaxonomy();
  initProductImportPreview();
  initCategoryImportPreview();
  openCategoryModalFromQuery();
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
  document.querySelectorAll('.brand-delete-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var name = form.dataset.name || '';
      var count = parseInt(form.dataset.count || '0', 10);
      var msg = 'Xóa thương hiệu "' + name + '"?';
      if (count > 0) {
        msg += ' ' + count + ' sản phẩm sẽ được bỏ thương hiệu.';
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
  var deleteAllForm = document.getElementById('productDeleteAllForm');
  if (deleteAllForm) {
    deleteAllForm.addEventListener('submit', function (e) {
      var msg =
        'Xóa TOÀN BỘ sản phẩm, danh mục, lịch sử kho và dòng sản phẩm trong báo giá?\n\nThao tác này không thể hoàn tác.';
      if (!confirm(msg)) e.preventDefault();
    });
  }
});
