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

/** Panel upload ảnh: hàng thumbnail + placeholder +N, thao tác dưới ảnh chọn, dropzone. */
function initProductMultiImages() {
  var accumulators = new WeakMap();
  var replaceTargets = new WeakMap();

  function fileKey(f) {
    return f.name + '|' + f.size + '|' + f.lastModified;
  }

  function setInputFiles(input, files) {
    var dt = new DataTransfer();
    files.forEach(function (f) {
      dt.items.add(f);
    });
    try {
      input.files = dt.files;
    } catch (e) {
      /* ignore */
    }
  }

  function revokeNewPreviewBlobs(panel) {
    if (!panel) return;
    panel.querySelectorAll('.product-image-thumb-wrap[data-new-index] img').forEach(function (img) {
      if (img.src && img.src.indexOf('blob:') === 0) URL.revokeObjectURL(img.src);
    });
  }

  function countExisting(panel) {
    var n = 0;
    panel.querySelectorAll('.product-image-thumb-wrap[data-existing="1"]').forEach(function (wrap) {
      var chk = wrap.querySelector('.product-image-remove-check');
      if (!chk || !chk.checked) n += 1;
    });
    return n;
  }

  function countNew(panel, input) {
    return (accumulators.get(input) || []).length;
  }

  function slotsLeft(panel, input) {
    var max = parseInt(panel.getAttribute('data-max-images') || '5', 10) || 5;
    return Math.max(0, max - countExisting(panel) - countNew(panel, input));
  }

  function updateActionsBar(panel) {
    var bar = panel.querySelector('.product-images-actions-bar');
    var rep = panel.querySelector('.product-image-replace-btn');
    if (!bar || !rep) return;
    var has = panel.querySelector(
      '.product-image-thumb-wrap[data-existing="1"], .product-image-thumb-wrap[data-new-index]'
    );
    var sel = panel.querySelector('.product-image-thumb-wrap.is-selected');
    if (!has || !sel) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    rep.classList.toggle('d-none', sel.dataset.existing !== '1');
  }

  function selectWrap(panel, wrap) {
    panel.querySelectorAll('.product-image-thumb-wrap.is-selected').forEach(function (w) {
      w.classList.remove('is-selected');
    });
    wrap.classList.add('is-selected');
    updateActionsBar(panel);
  }

  function ensureSelection(panel) {
    var sel = panel.querySelector('.product-image-thumb-wrap.is-selected');
    if (sel && panel.contains(sel)) {
      updateActionsBar(panel);
      return;
    }
    var first =
      panel.querySelector('.product-image-thumb-wrap[data-existing="1"]') ||
      panel.querySelector('.product-image-thumb-wrap[data-new-index]');
    if (first) selectWrap(panel, first);
    else updateActionsBar(panel);
  }

  function updatePanelUI(panel) {
    var input = panel.querySelector('.product-images-file-input');
    if (!input) return;
    var max = parseInt(panel.getAttribute('data-max-images') || '5', 10) || 5;
    var existing = countExisting(panel);
    var newer = countNew(panel, input);
    var total = existing + newer;
    var left = Math.max(0, max - total);
    var counter = panel.querySelector('.product-images-counter');
    if (counter) {
      counter.textContent =
        total +
        '/' +
        max +
        ' ảnh' +
        (left > 0 ? ' — còn thêm được ' + left + ' ảnh' : ' — đã đủ tối đa');
    }
    var ph = panel.querySelector('.product-image-slot-placeholder');
    if (ph) {
      var numEl = ph.querySelector('.product-image-slot-placeholder-num');
      if (numEl) numEl.textContent = String(left);
      ph.classList.toggle('d-none', left <= 0);
    }
    var dropzone = panel.querySelector('.product-images-dropzone');
    if (dropzone) {
      dropzone.classList.toggle('is-disabled', left <= 0);
      /* Không disabled input — trình duyệt sẽ không gửi file khi submit */
    }
    updateActionsBar(panel);
  }

  function panelCanAddFiles(panel, input) {
    return slotsLeft(panel, input) > 0;
  }

  function syncFilesBeforeSubmit(panel, input) {
    var merged = accumulators.get(input);
    if (merged && merged.length) {
      setInputFiles(input, merged);
    }
    input.disabled = false;
    input.removeAttribute('disabled');
  }

  function renderNewPreviews(panel, input) {
    var strip = panel.querySelector('.product-images-new-strip');
    var scroll = panel.querySelector('.product-images-strip-scroll');
    if (!strip) return;
    revokeNewPreviewBlobs(panel);
    panel.querySelectorAll('.product-image-thumb-wrap[data-new-index]').forEach(function (el) {
      el.remove();
    });
    var files = accumulators.get(input) || [];
    files.forEach(function (file, idx) {
      var wrap = document.createElement('div');
      wrap.className = 'product-image-thumb-wrap';
      wrap.dataset.newIndex = String(idx);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'product-image-thumb';
      btn.setAttribute('aria-label', 'Ảnh mới ' + (idx + 1));
      var img = document.createElement('img');
      img.alt = '';
      img.src = URL.createObjectURL(file);
      btn.appendChild(img);
      wrap.appendChild(btn);
      if (scroll) scroll.insertBefore(wrap, strip);
      else strip.appendChild(wrap);
    });
    ensureSelection(panel);
    updatePanelUI(panel);
  }

  function mergeIntoInput(panel, input, newFiles) {
    var prev = accumulators.get(input) || [];
    var map = new Map();
    prev.forEach(function (f) {
      map.set(fileKey(f), f);
    });
    Array.from(newFiles || []).forEach(function (f) {
      map.set(fileKey(f), f);
    });
    var max = parseInt(panel.getAttribute('data-max-images') || '5', 10) || 5;
    var cap = Math.max(0, max - countExisting(panel));
    var merged = Array.from(map.values()).slice(0, cap);
    accumulators.set(input, merged);
    setInputFiles(input, merged);
    renderNewPreviews(panel, input);
  }

  function resetPanel(panel) {
    var input = panel.querySelector('.product-images-file-input');
    if (!input) return;
    accumulators.delete(input);
    replaceTargets.delete(input);
    input.value = '';
    input.disabled = false;
    input.removeAttribute('disabled');
    panel.querySelectorAll('.product-image-remove-check').forEach(function (chk) {
      chk.checked = false;
    });
    panel.querySelectorAll('.product-image-thumb-wrap[data-existing="1"]').forEach(function (wrap) {
      wrap.classList.remove('is-marked-remove');
    });
    revokeNewPreviewBlobs(panel);
    panel.querySelectorAll('.product-image-thumb-wrap[data-new-index]').forEach(function (el) {
      el.remove();
    });
    panel.querySelectorAll('.product-image-thumb-wrap.is-selected').forEach(function (w) {
      w.classList.remove('is-selected');
    });
    var first = panel.querySelector('.product-image-thumb-wrap[data-existing="1"]');
    if (first) first.classList.add('is-selected');
    updatePanelUI(panel);
  }

  function initPanel(panel) {
    var input = panel.querySelector('.product-images-file-input');
    if (!input || panel.dataset.imagesInit === '1') return;
    panel.dataset.imagesInit = '1';

    var scroll = panel.querySelector('.product-images-strip-scroll');
    if (scroll) {
      scroll.addEventListener('click', function (e) {
        if (e.target.closest('.product-image-slot-placeholder')) {
          if (panelCanAddFiles(panel, input)) input.click();
          return;
        }
        var wrap = e.target.closest('.product-image-thumb-wrap');
        if (!wrap || !scroll.contains(wrap) || !wrap.querySelector('.product-image-thumb')) return;
        selectWrap(panel, wrap);
      });
    }

    input.addEventListener('change', function () {
      var replaceIdx = replaceTargets.get(input);
      if (replaceIdx != null) {
        var rwrap = panel.querySelector(
          '.product-image-thumb-wrap[data-existing="1"][data-index="' + replaceIdx + '"]'
        );
        var chk = rwrap && rwrap.querySelector('.product-image-remove-check');
        if (chk) {
          chk.checked = true;
          if (rwrap) rwrap.classList.add('is-marked-remove');
        }
        replaceTargets.delete(input);
        if (input.files && input.files[0]) mergeIntoInput(panel, input, [input.files[0]]);
        else updatePanelUI(panel);
        return;
      }
      mergeIntoInput(panel, input, input.files);
    });

    var repBtn = panel.querySelector('.product-image-replace-btn');
    if (repBtn) {
      repBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var sel = panel.querySelector('.product-image-thumb-wrap.is-selected');
        if (!sel || sel.dataset.existing !== '1') return;
        replaceTargets.set(input, sel.getAttribute('data-index'));
        input.click();
      });
    }

    var delBtn = panel.querySelector('.product-image-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var sel = panel.querySelector('.product-image-thumb-wrap.is-selected');
        if (!sel) return;
        if (sel.dataset.existing === '1') {
          var c = sel.querySelector('.product-image-remove-check');
          if (c) {
            c.checked = !c.checked;
            sel.classList.toggle('is-marked-remove', c.checked);
          }
          updatePanelUI(panel);
          return;
        }
        if (sel.dataset.newIndex != null) {
          var rm = parseInt(sel.dataset.newIndex, 10);
          var acc = (accumulators.get(input) || []).slice();
          acc.splice(rm, 1);
          accumulators.set(input, acc);
          setInputFiles(input, acc);
          renderNewPreviews(panel, input);
        }
      });
    }

    var dropzone = panel.querySelector('.product-images-dropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        dropzone.addEventListener(ev, function (e) {
          e.preventDefault();
          if (!dropzone.classList.contains('is-disabled')) dropzone.classList.add('is-dragover');
        });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        dropzone.addEventListener(ev, function (e) {
          e.preventDefault();
          dropzone.classList.remove('is-dragover');
        });
      });
      dropzone.addEventListener('drop', function (e) {
        if (dropzone.classList.contains('is-disabled')) return;
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) mergeIntoInput(panel, input, files);
      });
    }

    var form = panel.closest('form');
    if (form) {
      form.addEventListener('submit', function () {
        syncFilesBeforeSubmit(panel, input);
      });
    }

    ensureSelection(panel);
    updatePanelUI(panel);
  }

  document.querySelectorAll('.product-images-panel').forEach(initPanel);

  document.querySelectorAll('.product-page-modal').forEach(function (modal) {
    modal.addEventListener('show.bs.modal', function () {
      modal.querySelectorAll('.product-images-panel').forEach(resetPanel);
    });
  });
}

/** Bấm vào dòng (trừ menu, nút, link) mở trang chi tiết sản phẩm. */
function initProductTableRowClick() {
  var tbody = document.querySelector('table.product-table-v2 tbody');
  if (!tbody) return;
  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-product-detail]');
    if (!tr) return;
    if (e.target.closest('a, button, input, label, .dropdown, form')) return;
    var url = tr.getAttribute('data-product-detail');
    if (url) window.location.href = url;
  });
}

function initProductDetailGallery() {
  var gallery = document.querySelector('.product-detail-gallery');
  if (!gallery) return;
  var mainImg = document.getElementById('productDetailMainImg');
  var thumbs = Array.from(gallery.querySelectorAll('.product-detail-thumb'));
  if (!mainImg || !thumbs.length) return;

  function activateThumb(btn) {
    var img = btn.querySelector('img');
    if (img && img.src) mainImg.src = img.src;
    thumbs.forEach(function (t) {
      t.classList.remove('is-active');
    });
    btn.classList.add('is-active');
  }

  thumbs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activateThumb(btn);
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initProductModalActions();
  initProductTableRowClick();
  initProductMultiImages();
  initProductDetailGallery();
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
  document.querySelectorAll('.product-delete-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var name = form.getAttribute('data-name') || 'sản phẩm này';
      var msg =
        'Xóa sản phẩm "' +
        name +
        '"?\n\nDòng sản phẩm trong báo giá liên quan cũng sẽ bị gỡ. Thao tác không thể hoàn tác.';
      if (!confirm(msg)) e.preventDefault();
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
