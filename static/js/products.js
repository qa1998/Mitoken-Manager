function getTaxonomyCatalog() {
  var el = document.getElementById('taxonomyCatalogData');
  if (!el) return { parents: [], children: {} };
  try {
    return JSON.parse(el.textContent);
  } catch (e) {
    return { parents: [], children: {} };
  }
}

function getBrandsCatalog() {
  var el = document.getElementById('brandsCatalogData');
  if (!el) return [];
  try {
    return JSON.parse(el.textContent || '[]');
  } catch (e) {
    return [];
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

function syncProductFilterChildSelect(parentSel, childSel, brandSel) {
  if (!parentSel || !childSel) return;
  var selectedChild = childSel.dataset.selected || '';
  if (parentSel.value) {
    childSel.disabled = false;
    fillChildCategorySelect(childSel, parentSel.value, selectedChild, 'Tất cả');
  } else {
    childSel.innerHTML = '<option value="">Tất cả</option>';
    childSel.value = '';
    childSel.disabled = true;
    childSel.dataset.selected = '';
  }
  filterBrandSelectOptions(brandSel, parentSel.value, childSel.value);
}

function initProductFilterTaxonomy() {
  var form = document.getElementById('product-filter-form');
  if (!form) return;
  var parentSel = form.querySelector('.product-filter-parent');
  var childSel = form.querySelector('.product-filter-child');
  var brandSel = form.querySelector('.product-filter-brand');
  if (!parentSel || !childSel) return;

  syncProductFilterChildSelect(parentSel, childSel, brandSel);
  parentSel.addEventListener('change', function () {
    childSel.dataset.selected = '';
    syncProductFilterChildSelect(parentSel, childSel, brandSel);
    if (brandSel) brandSel.value = '';
  });
  childSel.addEventListener('change', function () {
    childSel.dataset.selected = childSel.value;
    filterBrandSelectOptions(brandSel, parentSel.value, childSel.value);
  });
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
      var supplierWrap = typeSel.closest('form').querySelector('.product-stock-supplier-wrap');
      if (supplierWrap) {
        supplierWrap.style.display = typeSel.value === 'IN' ? '' : 'none';
      }
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

function activateCategoryManageTab(modalEl, tabKey) {
  if (!modalEl || !window.bootstrap || !bootstrap.Tab) return;
  var target = tabKey === 'brands' ? '#tabBrands' : '#tabCategoryTree';
  var btn = modalEl.querySelector('.taxonomy-manage-tabs [data-bs-target="' + target + '"]');
  if (btn) bootstrap.Tab.getOrCreateInstance(btn).show();
}

function openCategoryModalFromQuery() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('category_modal') !== '1' && params.get('category_import_preview') !== '1') return;
  var modalTab = params.get('category_modal_tab') || 'categories';
  if (params.get('category_modal') === '1') {
    var modalEl = document.getElementById('categoryModal');
    if (modalEl && window.bootstrap) {
      var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      if (modalTab === 'brands') {
        modalEl.addEventListener(
          'shown.bs.modal',
          function onCategoryModalShown() {
            activateCategoryManageTab(modalEl, 'brands');
          },
          { once: true }
        );
      }
      modal.show();
    }
  }
  if (params.get('category_import_preview') === '1') {
    var importModal = document.getElementById('importCategoryModal');
    if (importModal && window.bootstrap) {
      bootstrap.Modal.getOrCreateInstance(importModal).show();
    }
  }
  params.delete('category_modal');
  params.delete('category_modal_tab');
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

function initProductImageUrlFields(root) {
  (root || document).querySelectorAll('.product-image-url-input').forEach(function (input) {
    if (input.dataset.urlPreviewInit === '1') return;
    input.dataset.urlPreviewInit = '1';
    var wrap = input.closest('.product-image-url-field');
    var preview = wrap ? wrap.querySelector('[data-image-url-preview]') : null;
    var previewImg = preview ? preview.querySelector('img') : null;

    function syncPreview() {
      var val = (input.value || '').trim();
      var ok = /^https?:\/\//i.test(val);
      if (!preview || !previewImg) return;
      if (ok) {
        previewImg.src = val;
        preview.classList.remove('d-none');
      } else {
        previewImg.removeAttribute('src');
        preview.classList.add('d-none');
      }
    }

    input.addEventListener('input', syncPreview);
    input.addEventListener('change', syncPreview);
    syncPreview();
  });

  document.querySelectorAll('.product-page-modal').forEach(function (modal) {
    modal.addEventListener('show.bs.modal', function () {
      modal.querySelectorAll('.product-image-url-input').forEach(function (input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  });
}

function initProductDetailGallery() {
  var gallery = document.querySelector('.product-detail-gallery');

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
      modal.querySelectorAll('.product-image-url-input').forEach(function (input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
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

function bindProductUnitSelect(selectEl, hiddenInputEl, customInputEl) {
  if (!selectEl || !hiddenInputEl || selectEl.dataset.unitSelectBound === '1') {
    return selectEl && selectEl._setProductUnitValue ? selectEl._setProductUnitValue : null;
  }
  selectEl.dataset.unitSelectBound = '1';

  function ensureOption(value) {
    var val = (value || '').trim();
    if (!val || val === '__custom__') return;
    var found = Array.from(selectEl.options).some(function (opt) {
      return opt.value === val;
    });
    if (!found) {
      var opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      var customOpt = selectEl.querySelector('option[value="__custom__"]');
      if (customOpt) selectEl.insertBefore(opt, customOpt);
      else selectEl.appendChild(opt);
    }
  }

  function setValue(value, options) {
    options = options || {};
    var val = (value || '').trim();
    hiddenInputEl.value = val;
    ensureOption(val);
    var matched = val && Array.from(selectEl.options).some(function (opt) {
      return opt.value === val && opt.value !== '__custom__';
    });
    if (matched) {
      selectEl.value = val;
      if (customInputEl) {
        customInputEl.classList.add('d-none');
        customInputEl.value = val;
      }
    } else if (val) {
      selectEl.value = '__custom__';
      if (customInputEl) {
        customInputEl.classList.remove('d-none');
        customInputEl.value = val;
      }
    } else if (selectEl.options.length) {
      selectEl.selectedIndex = 0;
      hiddenInputEl.value = selectEl.value === '__custom__' ? '' : selectEl.value;
      if (customInputEl) customInputEl.classList.add('d-none');
    }
    if (!options.silent) {
      hiddenInputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  selectEl.addEventListener('change', function () {
    if (selectEl.value === '__custom__') {
      if (customInputEl) {
        customInputEl.classList.remove('d-none');
        hiddenInputEl.value = customInputEl.value.trim();
        customInputEl.focus();
      } else {
        hiddenInputEl.value = '';
      }
    } else {
      hiddenInputEl.value = selectEl.value;
      if (customInputEl) customInputEl.classList.add('d-none');
    }
    hiddenInputEl.dispatchEvent(new Event('input', { bubbles: true }));
  });

  if (customInputEl) {
    customInputEl.addEventListener('input', function () {
      hiddenInputEl.value = customInputEl.value.trim();
      hiddenInputEl.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  selectEl._setProductUnitValue = setValue;
  setValue(hiddenInputEl.value, { silent: true });
  return setValue;
}

function initProductUnitSetup(root) {
  (root || document).querySelectorAll('[data-product-unit-setup]').forEach(function (panel) {
    if (panel.dataset.unitSetupInit === '1') return;
    panel.dataset.unitSetupInit = '1';
    var toggle = panel.querySelector('[data-unit-conversion-toggle]');
    var fieldsWrap = panel.querySelector('[data-unit-fields]');
    var templateBlock = panel.querySelector('[data-unit-template-block]');
    var templateSelect = panel.querySelector('[data-unit-template-select]');
    var templateIcon = panel.querySelector('[data-unit-template-icon]');
    var guideToggle = panel.querySelector('[data-unit-guide-toggle]');
    var guidePanel = panel.querySelector('[data-unit-guide-panel]');
    var lotBlock = panel.querySelector('[data-unit-lot-block]');
    var lotToggle = panel.querySelector('[data-lot-unit-toggle]');
    var lotFields = panel.querySelector('[data-unit-lot-fields]');
    var baseInput = panel.querySelector('[data-base-unit-input]');
    var purchaseInput = panel.querySelector('[data-purchase-unit-input]');
    var factorInput = panel.querySelector('[data-conversion-factor-input]');
    var lotUnitInput = panel.querySelector('[data-lot-unit-input]');
    var lotFactorInput = panel.querySelector('[data-lot-factor-input]');
    var baseLabel = panel.querySelector('[data-base-unit-label]');
    var lotUnitLabel = panel.querySelector('[data-lot-unit-label]');
    var lotPurchaseLabel = panel.querySelector('[data-lot-purchase-label]');
    var purchaseInlineLabel = panel.querySelector('[data-purchase-unit-label-inline]');
    var hint = panel.querySelector('[data-unit-hint]');
    var presetWireBtn = panel.querySelector('[data-unit-preset-wire]');
    var presetBoxBtn = panel.querySelector('[data-unit-preset-box]');
    var presetBulkBtn = panel.querySelector('[data-unit-preset-bulk]');
    var baseSelect = panel.querySelector('[data-base-unit-select]');
    var purchaseSelect = panel.querySelector('[data-purchase-unit-select]');
    var setBaseUnitValue = bindProductUnitSelect(
      baseSelect,
      baseInput,
      panel.querySelector('[data-base-unit-custom]')
    );
    var setPurchaseUnitValue = bindProductUnitSelect(
      purchaseSelect,
      purchaseInput,
      panel.querySelector('[data-purchase-unit-custom]')
    );

    function syncUnitLabels() {
      var base = (baseInput && baseInput.value.trim()) || 'cái';
      var purchase = (purchaseInput && purchaseInput.value.trim()) || base;
      var lotName = (lotUnitInput && lotUnitInput.value.trim()) || 'Lô';
      if (baseLabel) baseLabel.textContent = base;
      if (purchaseInlineLabel) purchaseInlineLabel.textContent = purchase;
      if (lotUnitLabel) lotUnitLabel.textContent = lotName;
      if (lotPurchaseLabel) lotPurchaseLabel.textContent = purchase;
      if (hint) {
        if (toggle && toggle.checked) {
          var factor = parseFloat(factorInput && factorInput.value ? factorInput.value : '1') || 1;
          var text = '1 ' + purchase + ' = ' + formatQtyPlain(factor) + ' ' + base;
          if (lotToggle && lotToggle.checked) {
            var lf = parseFloat(lotFactorInput && lotFactorInput.value ? lotFactorInput.value : '0') || 0;
            if (lf > 1) {
              text += ' · 1 ' + lotName + ' = ' + formatQtyPlain(lf) + ' ' + purchase + ' = ' + formatQtyPlain(lf * factor) + ' ' + base;
            }
          }
          hint.textContent = text;
        } else {
          hint.textContent = 'Không quy đổi: đơn vị tồn kho và đơn vị nhập giống nhau.';
        }
      }
    }

    function setLotEnabled(enabled) {
      if (lotFields) lotFields.classList.toggle('d-none', !enabled);
      syncUnitLabels();
    }

    var saleBlock = panel.querySelector('[data-unit-sale-block]');
    var saleModeInput = panel.querySelector('[data-sale-unit-mode-input]');
    var saleBtnBase = panel.querySelector('[data-sale-btn-base]');
    var saleBtnPurchase = panel.querySelector('[data-sale-btn-purchase]');
    var saleBtnLot = panel.querySelector('[data-sale-btn-lot]');
    var saleHint = panel.querySelector('[data-sale-unit-hint]');

    function getSaleMode() {
      return (saleModeInput && saleModeInput.value) || 'base';
    }

    function syncProductCostForSaleMode(prevMode, newMode) {
      var form = panel.closest('form');
      if (!form) return;
      var priceCard = form.querySelector('[data-product-price-setup]');
      if (!priceCard || priceCard.getAttribute('data-has-conv') !== '1') return;
      var factor = parseFloat(priceCard.getAttribute('data-conversion-factor')) || 1;
      if (factor <= 0) return;
      var base = (baseInput && baseInput.value.trim()) || 'cái';
      var purchase = (purchaseInput && purchaseInput.value.trim()) || base;
      var costInput = priceCard.querySelector('[data-product-cost-input]');
      if (!costInput) return;
      var raw = (costInput.value || '').replace(/\D/g, '');
      var val = parseInt(raw, 10) || 0;
      if (val > 0 && prevMode && newMode && prevMode !== newMode) {
        if (prevMode === 'purchase' && newMode === 'base') {
          val = Math.round(val / factor);
        } else if (prevMode === 'base' && newMode === 'purchase') {
          val = Math.round(val * factor);
        }
        costInput.value =
          typeof window.formatMoneyInputValue === 'function'
            ? window.formatMoneyInputValue(String(val))
            : String(val);
      }
      var unitLabel = newMode === 'purchase' ? purchase : base;
      priceCard.querySelectorAll('[data-cost-unit-label]').forEach(function (el) {
        el.textContent = unitLabel;
      });
      var hint = priceCard.querySelector('[data-cost-equiv-hint]');
      if (hint) {
        var disp = parseInt((costInput.value || '').replace(/\D/g, ''), 10) || 0;
        if (disp > 0) {
          if (newMode === 'purchase') {
            var perBase = Math.round(disp / factor);
            hint.innerHTML =
              'Tương đương <strong>' +
              (perBase.toLocaleString('vi-VN')) +
              ' đ/' +
              base +
              '</strong> tồn kho';
          } else {
            var perPu = Math.round(disp * factor);
            hint.innerHTML =
              'Tương đương <strong>' +
              (perPu.toLocaleString('vi-VN')) +
              ' đ/' +
              purchase +
              '</strong>';
          }
        }
      }
      priceCard.setAttribute('data-sale-mode', newMode);
    }

    function setSaleMode(mode, options) {
      options = options || {};
      if (!saleModeInput) return;
      var prev = getSaleMode();
      saleModeInput.value = mode;
      panel.querySelectorAll('.product-sale-unit-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-sale-mode') === mode);
      });
      if (!options.skipCostConvert && prev !== mode) {
        syncProductCostForSaleMode(prev, mode);
      }
    }

    function syncSaleUnitLabels() {
      var base = (baseInput && baseInput.value.trim()) || 'cái';
      var purchase = (purchaseInput && purchaseInput.value.trim()) || base;
      var lotName = (lotUnitInput && lotUnitInput.value.trim()) || 'Lô';
      var convOn = toggle && toggle.checked;
      panel.querySelectorAll('[data-sale-label-base]').forEach(function (el) {
        el.textContent = base;
      });
      panel.querySelectorAll('[data-sale-label-purchase]').forEach(function (el) {
        el.textContent = purchase;
      });
      panel.querySelectorAll('[data-sale-label-lot]').forEach(function (el) {
        el.textContent = lotName;
      });
      if (saleBtnPurchase) {
        var purchaseOk = convOn && purchase.toLowerCase() !== base.toLowerCase();
        saleBtnPurchase.disabled = !purchaseOk;
        saleBtnPurchase.classList.remove('d-none');
        saleBtnPurchase.classList.toggle('opacity-50', !purchaseOk);
        saleBtnPurchase.title = purchaseOk
          ? ''
          : convOn
            ? 'Đặt đơn vị nhập khác đơn vị tồn (VD: Thùng vs kg)'
            : 'Bật「Có quy đổi đơn vị」hoặc bấm「Mẫu thùng/kg」';
      }
      if (saleBtnLot) {
        var showLot = convOn && lotToggle && lotToggle.checked;
        saleBtnLot.classList.toggle('d-none', !showLot);
        saleBtnLot.disabled = !showLot;
      }
      if (saleBtnBase) saleBtnBase.disabled = false;
      if (saleBlock) {
        saleBlock.classList.toggle('is-disabled', !convOn);
      }
      if (saleHint && convOn) {
        saleHint.innerHTML =
          'VD: tồn theo <strong>' +
          base +
          '</strong> — bán theo <strong>' +
          purchase +
          '</strong> (thùng/hộp) hoặc <strong>' +
          base +
          '</strong> (lẻ).';
      } else if (saleHint) {
        saleHint.textContent =
          'Bật「Có quy đổi đơn vị」hoặc chọn mẫu quy đổi để bán theo thùng/hộp hoặc ' + base + '.';
      }
      if (convOn) {
        var mode = getSaleMode();
        if (
          mode === 'purchase' &&
          (purchase.toLowerCase() === base.toLowerCase() || (saleBtnPurchase && saleBtnPurchase.disabled))
        ) {
          setSaleMode('base', { skipCostConvert: true });
        } else if (mode === 'lot' && saleBtnLot && saleBtnLot.classList.contains('d-none')) {
          setSaleMode(convOn && purchase !== base ? 'purchase' : 'base', { skipCostConvert: true });
        }
      } else {
        setSaleMode('base', { skipCostConvert: true });
      }
    }

    panel.querySelectorAll('.product-sale-unit-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled) return;
        setSaleMode(btn.getAttribute('data-sale-mode') || 'base');
      });
    });

    function setConversionEnabled(enabled) {
      if (fieldsWrap) fieldsWrap.classList.toggle('is-single', !enabled);
      if (lotBlock) lotBlock.classList.toggle('d-none', !enabled);
      if (templateBlock) templateBlock.classList.toggle('d-none', !enabled);
      if (!enabled) {
        if (templateSelect) templateSelect.value = '';
        if (lotToggle) lotToggle.checked = false;
        setLotEnabled(false);
        if (purchaseInput && baseInput) {
          var baseVal = baseInput.value.trim() || baseInput.value;
          if (setPurchaseUnitValue) setPurchaseUnitValue(baseVal, { silent: true });
          else purchaseInput.value = baseVal;
        }
      } else if (lotToggle) {
        setLotEnabled(lotToggle.checked);
      }
      syncUnitLabels();
      syncSaleUnitLabels();
    }

    if (toggle) {
      setConversionEnabled(toggle.checked);
      toggle.addEventListener('change', function () {
        setConversionEnabled(toggle.checked);
      });
    }
    if (lotToggle) {
      lotToggle.addEventListener('change', function () {
        setLotEnabled(lotToggle.checked);
        syncSaleUnitLabels();
      });
    }
    [purchaseInput, factorInput, lotUnitInput, lotFactorInput].forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', function () {
        syncUnitLabels();
        syncSaleUnitLabels();
      });
    });
    if (baseInput) {
      baseInput.addEventListener('input', function () {
        if (toggle && !toggle.checked) {
          if (setPurchaseUnitValue) setPurchaseUnitValue(baseInput.value.trim(), { silent: true });
          else if (purchaseInput) purchaseInput.value = baseInput.value.trim();
        } else if (toggle && toggle.checked && purchaseInput && !purchaseInput.value.trim()) {
          if (setPurchaseUnitValue) setPurchaseUnitValue(baseInput.value.trim(), { silent: true });
          else purchaseInput.value = baseInput.value.trim();
        }
        syncUnitLabels();
        syncSaleUnitLabels();
      });
    }
    function applyUnitPreset(cfg, templateKey) {
      if (toggle) toggle.checked = true;
      if (factorInput) factorInput.value = String(cfg.factor);
      if (lotToggle) lotToggle.checked = !!cfg.lot;
      if (lotUnitInput && cfg.lot) lotUnitInput.value = cfg.lotName || 'Lô';
      if (lotFactorInput) lotFactorInput.value = cfg.lot ? String(cfg.lotFactor || 10) : '0';
      if (templateSelect && templateKey) templateSelect.value = templateKey;
      if (templateIcon && templateSelect && templateKey) {
        var opt = templateSelect.querySelector('option[value="' + templateKey + '"]');
        var iconClass = opt && opt.getAttribute('data-template-icon');
        if (iconClass) templateIcon.className = 'bi ' + iconClass + ' product-unit-template-icon';
      }
      setConversionEnabled(true);
      if (setBaseUnitValue) setBaseUnitValue(cfg.base, { silent: true });
      else if (baseInput) baseInput.value = cfg.base;
      if (setPurchaseUnitValue) setPurchaseUnitValue(cfg.purchase, { silent: true });
      else if (purchaseInput) purchaseInput.value = cfg.purchase;
      setLotEnabled(!!cfg.lot);
      syncUnitLabels();
      syncSaleUnitLabels();
      setSaleMode(cfg.saleMode || (cfg.lot ? 'lot' : 'purchase'));
    }

    if (guideToggle && guidePanel) {
      guideToggle.addEventListener('click', function () {
        guidePanel.classList.toggle('d-none');
        guideToggle.setAttribute(
          'aria-expanded',
          guidePanel.classList.contains('d-none') ? 'false' : 'true'
        );
      });
    }

    if (templateSelect) {
      templateSelect.addEventListener('change', function () {
        var key = templateSelect.value;
        if (!key) return;
        if (templateIcon) {
          var opt = templateSelect.selectedOptions[0];
          var iconClass = opt && opt.getAttribute('data-template-icon');
          if (iconClass) templateIcon.className = 'bi ' + iconClass + ' product-unit-template-icon';
        }
        if (key === 'box') {
          applyUnitPreset({ base: 'Chiếc', purchase: 'Hộp', factor: 20, lot: false }, 'box');
        } else if (key === 'wire') {
          applyUnitPreset({
            base: 'Mét',
            purchase: 'Cuộn',
            factor: 50,
            lot: true,
            lotName: 'Lô',
            lotFactor: 10,
          }, 'wire');
        } else if (key === 'bulk') {
          applyUnitPreset({
            base: 'kg',
            purchase: 'Thùng',
            factor: 15,
            lot: false,
            saleMode: 'purchase',
          }, 'bulk');
        }
      });
    }

    if (presetBoxBtn) {
      presetBoxBtn.addEventListener('click', function () {
        applyUnitPreset({ base: 'Chiếc', purchase: 'Hộp', factor: 20, lot: false }, 'box');
      });
    }
    if (presetWireBtn) {
      presetWireBtn.addEventListener('click', function () {
        applyUnitPreset({
          base: 'Mét',
          purchase: 'Cuộn',
          factor: 50,
          lot: true,
          lotName: 'Lô',
          lotFactor: 10,
        }, 'wire');
      });
    }
    if (presetBulkBtn) {
      presetBulkBtn.addEventListener('click', function () {
        applyUnitPreset({
          base: 'kg',
          purchase: 'Thùng',
          factor: 15,
          lot: false,
          saleMode: 'purchase',
        }, 'bulk');
      });
    }

    syncUnitLabels();
    syncSaleUnitLabels();
  });
}

function formatQtyPlain(value) {
  var v = parseFloat(value);
  if (isNaN(v)) return '0';
  if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
  return String(v).replace('.', ',');
}

document.addEventListener('shown.bs.modal', function (e) {
  initProductUnitSetup(e.target);
  initProductSuppliersPanels(e.target);
});

function updateProductSuppliersEmpty(panel) {
  var tbody = panel.querySelector('.product-suppliers-body');
  var empty = panel.querySelector('.product-suppliers-empty');
  if (!tbody || !empty) return;
  empty.classList.toggle('d-none', tbody.children.length > 0);
}

function syncProductSupplierPrimaryRadios(panel) {
  var rows = panel.querySelectorAll('.product-supplier-row');
  if (!rows.length) return;
  var checked = panel.querySelector('input[name="ps_primary_supplier_id"]:checked');
  if (!checked) {
    var firstRadio = rows[0].querySelector('input[name="ps_primary_supplier_id"]');
    if (firstRadio) firstRadio.checked = true;
  }
  rows.forEach(function (row) {
    var sel = row.querySelector('select[name="ps_supplier_id"]');
    var radio = row.querySelector('input[name="ps_primary_supplier_id"]');
    if (sel && radio) radio.value = sel.value || '';
  });
}

function bindProductSupplierRow(row, panel) {
  var sel = row.querySelector('select[name="ps_supplier_id"]');
  var radio = row.querySelector('input[name="ps_primary_supplier_id"]');
  if (sel && radio) {
    sel.addEventListener('change', function () {
      radio.value = sel.value || '';
      if (sel.value && !panel.querySelector('input[name="ps_primary_supplier_id"]:checked')) {
        radio.checked = true;
      }
    });
  }
  if (radio) {
    radio.addEventListener('change', function () {
      if (radio.checked) syncProductSupplierPrimaryRadios(panel);
    });
  }
}

function addProductSupplierRow(panel, options) {
  if (!panel) return null;
  options = options || {};
  var tbody = panel.querySelector('.product-suppliers-body');
  var tpl = panel.querySelector('.product-supplier-row-template');
  if (!tbody || !tpl || !tpl.content) return null;
  var row = tpl.content.firstElementChild.cloneNode(true);
  tbody.appendChild(row);
  row.dataset.productSupplierRowInit = '1';
  bindProductSupplierRow(row, panel);
  if (typeof window.initMoneyInputs === 'function') {
    window.initMoneyInputs(row);
  }
  syncProductSupplierPrimaryRadios(panel);
  updateProductSuppliersEmpty(panel);
  if (options.focusSelect) {
    var sel = row.querySelector('select[name="ps_supplier_id"]');
    if (sel) sel.focus();
  }
  return row;
}

function ensureProductSuppliersStarterRow(panel) {
  if (!panel) return;
  var tbody = panel.querySelector('.product-suppliers-body');
  if (tbody && !tbody.children.length) {
    addProductSupplierRow(panel);
  }
}

function initProductSuppliersPanel(panel) {
  if (!panel) return;
  if (panel.dataset.productSuppliersPanelBound !== '1') {
    panel.dataset.productSuppliersPanelBound = '1';
    panel.addEventListener('click', function (e) {
      var removeBtn = e.target.closest('.product-supplier-remove-btn');
      if (!removeBtn) return;
      var row = removeBtn.closest('.product-supplier-row');
      if (!row || !panel.contains(row)) return;
      var wasPrimary = row.querySelector('input[name="ps_primary_supplier_id"]:checked');
      row.remove();
      if (wasPrimary) syncProductSupplierPrimaryRadios(panel);
      updateProductSuppliersEmpty(panel);
    });
  }
  panel.querySelectorAll('.product-supplier-row').forEach(function (row) {
    if (row.dataset.productSupplierRowInit === '1') return;
    row.dataset.productSupplierRowInit = '1';
    bindProductSupplierRow(row, panel);
  });
  syncProductSupplierPrimaryRadios(panel);
  updateProductSuppliersEmpty(panel);
  var addBtn = panel.querySelector('.product-suppliers-add-btn');
  if (addBtn && addBtn.dataset.bound !== '1') {
    addBtn.dataset.bound = '1';
    addBtn.addEventListener('click', function () {
      addProductSupplierRow(panel, { focusSelect: true });
    });
  }
}

function initProductSuppliersPanels(root) {
  (root || document).querySelectorAll('[data-product-suppliers-panel]').forEach(function (panel) {
    initProductSuppliersPanel(panel);
    ensureProductSuppliersStarterRow(panel);
  });
}

function initProductFilterAutoSubmit() {
  var form = document.getElementById('product-filter-form');
  if (!form) return;
  form.querySelectorAll('.product-filter-auto').forEach(function (el) {
    el.addEventListener('change', function () {
      form.submit();
    });
  });
}

function initProductSidebarSearch() {
  document.querySelectorAll('.js-product-sidebar-search').forEach(function (input) {
    var targetSel = input.getAttribute('data-target');
    var list = targetSel ? document.querySelector(targetSel) : null;
    if (!list) return;
    input.addEventListener('input', function () {
      var q = (input.value || '').trim();
      list.querySelectorAll('.product-sidebar-item').forEach(function (item) {
        var label = item.getAttribute('data-filter-label') || '';
        var match = window.vnSearchMatch
          ? vnSearchMatch(label, q)
          : !q || label.toLowerCase().indexOf(q.toLowerCase()) !== -1;
        item.hidden = q && !match;
      });
    });
  });
}

function initProductVariantSetup() {
  document.querySelectorAll('[data-product-variant-setup]').forEach(function (wrap) {
    if (wrap.dataset.variantSetupInit === '1') return;
    wrap.dataset.variantSetupInit = '1';
    var form = wrap.closest('form');
    var hidden = wrap.querySelector('input[name="variant"]');
    var listEl = wrap.querySelector('[data-variant-name-list]');
    var addBtn = wrap.querySelector('[data-variant-add-btn]');
    if (!hidden || !listEl || !addBtn) return;

    function parseInitialLabels() {
      var raw = (hidden.value || '').trim();
      if (!raw) return [];
      if (raw.indexOf(', ') >= 0) {
        return raw
          .split(', ')
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
      }
      return [raw];
    }

    function syncHidden() {
      var labels = [];
      listEl.querySelectorAll('[data-variant-name-input]').forEach(function (inp) {
        var v = (inp.value || '').trim();
        if (v) labels.push(v);
      });
      hidden.value = labels.join(', ');
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function addRow(value, focus) {
      var row = document.createElement('div');
      row.className = 'product-variant-name-row';
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control form-control-sm';
      input.setAttribute('data-variant-name-input', '');
      input.placeholder = 'VD: Đỏ, Xanh, Size M';
      input.value = value || '';
      input.addEventListener('input', syncHidden);
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-sm btn-link text-danger product-variant-name-remove';
      removeBtn.title = 'Xóa biến thể';
      removeBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
      removeBtn.addEventListener('click', function () {
        row.remove();
        syncHidden();
      });
      row.appendChild(input);
      row.appendChild(removeBtn);
      listEl.appendChild(row);
      if (focus) input.focus();
      syncHidden();
    }

    addBtn.addEventListener('click', function () {
      addRow('', true);
    });

    parseInitialLabels().forEach(function (label) {
      addRow(label, false);
    });

    if (form) form.addEventListener('submit', syncHidden);
  });
}

function initVariantRetailPriceFields() {
  document.querySelectorAll('[data-product-retail-price-col]').forEach(function (col) {
    var form = col.closest('form');
    if (!form) return;
    var variantInput = form.querySelector('input[name="variant"]');
    var stockCol = form.querySelector('[data-product-variant-stock-col]');
    var costCol = form.querySelector('[data-product-cost-col]');
    var projectCol = form.querySelector('[data-project-price-col]');
    var dealerCol = form.querySelector('[data-dealer-price-col]');
    var stockSingleWrap = stockCol ? stockCol.querySelector('[data-stock-single-wrap]') : null;
    var stockSingleInput = stockCol ? stockCol.querySelector('[data-stock-single]') : null;
    var costSingleWrap = costCol ? costCol.querySelector('[data-cost-single-wrap]') : null;
    var costSingleInput = costCol ? costCol.querySelector('[data-cost-single]') : null;
    var projectSingleWrap = projectCol ? projectCol.querySelector('[data-project-single-wrap]') : null;
    var projectSingleInput = projectCol ? projectCol.querySelector('[data-project-single]') : null;
    var dealerSingleWrap = dealerCol ? dealerCol.querySelector('[data-dealer-single-wrap]') : null;
    var dealerSingleInput = dealerCol ? dealerCol.querySelector('[data-dealer-single]') : null;
    var stockSubmitInput = form.querySelector('[data-variant-stock-submit]');
    var costSubmitInput = form.querySelector('[data-cost-price-submit]');
    var projectSubmitInput = form.querySelector('[data-project-price-submit]');
    var dealerSubmitInput = form.querySelector('[data-dealer-price-submit]');
    var imageSubmitInput = form.querySelector('[data-variant-image-urls-submit]');
    var brandSubmitInput = form.querySelector('[data-variant-brand-ids-submit]');
    var taxonomyPicker = form.querySelector('.taxonomy-picker');
    var taxonomyBrandCol = taxonomyPicker
      ? taxonomyPicker.querySelector('.taxonomy-brand-select')
        ? taxonomyPicker.querySelector('.taxonomy-brand-select').closest('[class*="col-"]')
        : null
      : null;
    var singleWrap = col.querySelector('[data-retail-single-wrap]');
    var variantsWrap = col.querySelector('[data-retail-variants-wrap]');
    var singleInput = col.querySelector('[data-retail-price-single]');
    var variantList = col.querySelector('[data-retail-variant-list]');
    var submitInput = col.querySelector('[data-retail-price-submit]');
    if (!submitInput) return;

    var initialPricesRaw = col.getAttribute('data-initial-prices') || '';
    var initialStocksRaw =
      (stockCol && stockCol.getAttribute('data-initial-stocks')) ||
      col.getAttribute('data-initial-stocks') ||
      '';
    var initialCostsRaw = col.getAttribute('data-initial-costs') || '';
    var initialDealersRaw = col.getAttribute('data-initial-dealers') || '';
    var initialProjectsRaw = col.getAttribute('data-initial-projects') || '';
    var initialImagesRaw = col.getAttribute('data-initial-images') || '';
    var initialBrandsRaw = col.getAttribute('data-initial-brands') || '';
    var defaultBrandId = col.getAttribute('data-default-brand-id') || '';

    function parseLabels() {
      var raw = (variantInput ? variantInput.value : col.getAttribute('data-initial-variant') || '').trim();
      if (!raw) return [];
      if (raw.indexOf(', ') >= 0) {
        return raw
          .split(', ')
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
      }
      return [raw];
    }

    function moneySubmitValue(val) {
      return String(val || '').replace(/\D/g, '');
    }

    function parseCsvValues(raw) {
      if (!raw) return [];
      if (raw.indexOf(', ') >= 0) {
        return raw.split(', ').map(function (s) {
          return s.trim();
        });
      }
      if (raw.indexOf(',') >= 0) {
        return raw.split(',').map(function (s) {
          return s.trim();
        });
      }
      return [raw];
    }

    function alignVariantRowValues(preserved, fallback, count) {
      var out = [];
      var i;
      for (i = 0; i < count; i++) {
        if (i < preserved.length) out.push(preserved[i]);
        else if (fallback && i < fallback.length) out.push(fallback[i]);
        else out.push('');
      }
      return out;
    }

    function parseSubmitImages(raw) {
      if (!raw) return [];
      try {
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return parseCsvValues(raw);
      }
    }

    function getFormBrandScopeIds() {
      if (!taxonomyPicker) return new Set();
      var parentSel = taxonomyPicker.querySelector('.taxonomy-parent-select');
      var childSel = taxonomyPicker.querySelector('.taxonomy-child-select');
      var parentId = parentSel ? parentSel.value : '';
      var childId = childSel ? childSel.value : '';
      var scopeIds = new Set();
      if (childId) scopeIds.add(String(childId));
      if (parentId) {
        scopeIds.add(String(parentId));
        var catalog = getTaxonomyCatalog();
        (catalog.children[String(parentId)] || []).forEach(function (c) {
          scopeIds.add(String(c.id));
        });
      }
      return scopeIds;
    }

    function getFallbackBrandId() {
      if (!taxonomyPicker) return defaultBrandId || '';
      var brandSel = taxonomyPicker.querySelector('.taxonomy-brand-select');
      return (brandSel && brandSel.value) || defaultBrandId || '';
    }

    function buildVariantBrandSelect(selectedId) {
      var select = document.createElement('select');
      select.className = 'form-select form-select-sm';
      select.setAttribute('data-variant-brand-input', '');
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '— Chọn thương hiệu —';
      select.appendChild(empty);
      var scopeIds = getFormBrandScopeIds();
      getBrandsCatalog().forEach(function (b) {
        var opt = document.createElement('option');
        opt.value = String(b.id);
        opt.textContent = b.name;
        if (b.category_id) opt.dataset.categoryId = String(b.category_id);
        var cid = b.category_id ? String(b.category_id) : '';
        if (scopeIds.size > 0 && cid && !scopeIds.has(cid)) {
          opt.hidden = true;
        }
        if (selectedId && String(selectedId) === String(b.id)) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', syncCombinedValues);
      return select;
    }

    function parseInitialImages() {
      if (!initialImagesRaw) return [];
      try {
        var parsed = JSON.parse(initialImagesRaw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return parseCsvValues(initialImagesRaw);
      }
    }

    function formatMoneyVal(val) {
      var digits = String(val || '').replace(/\D/g, '');
      if (!digits) return '';
      return typeof window.formatMoneyInputValue === 'function'
        ? window.formatMoneyInputValue(digits)
        : digits;
    }

    function collectVariantInputValues(selector) {
      var values = [];
      if (!variantList) return values;
      variantList.querySelectorAll(selector).forEach(function (inp) {
        values.push(inp.value || '');
      });
      return values;
    }

    function updateVariantImagePreview(wrap, url) {
      if (!wrap) return;
      var img = wrap.querySelector('img');
      var ph = wrap.querySelector('.product-variant-image-ph');
      var u = (url || '').trim();
      if (u && /^https?:\/\//i.test(u)) {
        if (!img) {
          img = document.createElement('img');
          img.alt = '';
          img.referrerPolicy = 'no-referrer';
          wrap.appendChild(img);
        }
        img.src = u;
        if (ph) ph.remove();
      } else {
        if (img) img.remove();
        if (!ph) {
          ph = document.createElement('span');
          ph.className = 'product-variant-image-ph';
          ph.innerHTML = '<i class="bi bi-image"></i>';
          wrap.appendChild(ph);
        }
      }
    }

    function syncCombinedValues() {
      var labels = parseLabels();
      if (labels.length > 1 && variantList) {
        var priceParts = [];
        var costParts = [];
        var dealerParts = [];
        var projectParts = [];
        var stockParts = [];
        var imageParts = [];
        variantList.querySelectorAll('[data-variant-price-input]').forEach(function (inp) {
          priceParts.push((inp.value || '').replace(/\D/g, '') || '0');
        });
        variantList.querySelectorAll('[data-variant-cost-input]').forEach(function (inp) {
          costParts.push((inp.value || '').replace(/\D/g, '') || '0');
        });
        variantList.querySelectorAll('[data-variant-dealer-input]').forEach(function (inp) {
          dealerParts.push((inp.value || '').replace(/\D/g, '') || '0');
        });
        variantList.querySelectorAll('[data-variant-project-input]').forEach(function (inp) {
          projectParts.push((inp.value || '').replace(/\D/g, '') || '0');
        });
        variantList.querySelectorAll('[data-variant-qty-input]').forEach(function (inp) {
          stockParts.push(inp.value === '' ? '0' : inp.value);
        });
        variantList.querySelectorAll('[data-variant-image-input]').forEach(function (inp) {
          imageParts.push((inp.value || '').trim());
        });
        var brandParts = [];
        variantList.querySelectorAll('[data-variant-brand-input]').forEach(function (sel) {
          brandParts.push(sel.value || '');
        });
        submitInput.value = priceParts.join(', ');
        if (costSubmitInput) costSubmitInput.value = costParts.join(', ');
        if (dealerSubmitInput) dealerSubmitInput.value = dealerParts.join(', ');
        if (projectSubmitInput) projectSubmitInput.value = projectParts.join(', ');
        if (stockSubmitInput) stockSubmitInput.value = stockParts.join(', ');
        if (imageSubmitInput) imageSubmitInput.value = JSON.stringify(imageParts);
        if (brandSubmitInput) brandSubmitInput.value = brandParts.join(', ');
        refreshVariantFieldSummaries();
      } else {
        if (singleInput) submitInput.value = moneySubmitValue(singleInput.value);
        if (stockSubmitInput && stockSingleInput) {
          stockSubmitInput.value = stockSingleInput.value === '' ? '0' : stockSingleInput.value;
        }
        if (costSubmitInput && costSingleInput) {
          costSubmitInput.value = moneySubmitValue(costSingleInput.value);
        }
        if (dealerSubmitInput && dealerSingleInput) {
          dealerSubmitInput.value = moneySubmitValue(dealerSingleInput.value);
        }
        if (projectSubmitInput && projectSingleInput) {
          projectSubmitInput.value = moneySubmitValue(projectSingleInput.value);
        }
        if (imageSubmitInput) imageSubmitInput.value = '';
        if (brandSubmitInput) brandSubmitInput.value = '';
      }
    }

    function getVariantExpandedState() {
      if (!col._variantExpandedLabels) col._variantExpandedLabels = {};
      return col._variantExpandedLabels;
    }

    function captureVariantExpandedState() {
      var state = getVariantExpandedState();
      if (!variantList) return state;
      variantList.querySelectorAll('.product-variant-price-field').forEach(function (field) {
        var key = field.getAttribute('data-variant-label');
        if (key) state[key] = field.classList.contains('is-expanded');
      });
      return state;
    }

    function variantFieldSummary(cost, retail, stock) {
      var parts = [];
      var stockVal = stock === '' || stock == null ? '' : String(stock);
      if (stockVal && stockVal !== '0') parts.push('Tồn: ' + stockVal);
      var retailDigits = String(retail || '').replace(/\D/g, '');
      if (retailDigits && retailDigits !== '0') {
        parts.push('Lẻ: ' + formatMoneyVal(retailDigits) + ' đ');
      }
      var costDigits = String(cost || '').replace(/\D/g, '');
      if (costDigits && costDigits !== '0' && !retailDigits) {
        parts.push('Nhập: ' + formatMoneyVal(costDigits) + ' đ');
      }
      return parts.length ? parts.join(' · ') : 'Bấm để nhập giá & tồn';
    }

    function refreshVariantFieldSummaries() {
      if (!variantList) return;
      variantList.querySelectorAll('.product-variant-price-field').forEach(function (field) {
        var summaryEl = field.querySelector('[data-variant-field-summary]');
        if (!summaryEl) return;
        var costInp = field.querySelector('[data-variant-cost-input]');
        var retailInp = field.querySelector('[data-variant-price-input]');
        var qtyInp = field.querySelector('[data-variant-qty-input]');
        summaryEl.textContent = variantFieldSummary(
          costInp ? costInp.value : '',
          retailInp ? retailInp.value : '',
          qtyInp ? qtyInp.value : ''
        );
      });
    }

    function setVariantFieldExpanded(field, label, expanded) {
      field.classList.toggle('is-expanded', expanded);
      var state = getVariantExpandedState();
      state[label] = expanded;
    }

    function updateVariantLabelHeaders(labels) {
      if (!variantList) return;
      var fields = variantList.querySelectorAll('.product-variant-price-field');
      labels.forEach(function (label, i) {
        if (!fields[i]) return;
        var labelEl = fields[i].querySelector('.product-variant-price-label');
        if (labelEl) labelEl.textContent = label;
        fields[i].setAttribute('data-variant-label', label);
      });
      refreshVariantFieldSummaries();
    }

    function renderVariantInputs() {
      if (!variantList) return;
      var labels = parseLabels();
      var prevLabelCount = parseInt(variantList.dataset.labelCount || '0', 10);
      var expandedState = captureVariantExpandedState();
      if (variantList.querySelector('[data-variant-price-input], [data-variant-qty-input]')) {
        syncCombinedValues();
      }
      var preservedPrices = collectVariantInputValues('[data-variant-price-input]');
      var preservedQtys = collectVariantInputValues('[data-variant-qty-input]');
      var preservedCosts = collectVariantInputValues('[data-variant-cost-input]');
      var preservedDealers = collectVariantInputValues('[data-variant-dealer-input]');
      var preservedProjects = collectVariantInputValues('[data-variant-project-input]');
      var preservedImages = collectVariantInputValues('[data-variant-image-input]');
      var preservedBrands = collectVariantInputValues('[data-variant-brand-input]');
      var prices = alignVariantRowValues(
        preservedPrices,
        parseCsvValues(submitInput.value || initialPricesRaw),
        labels.length
      );
      var qtys = alignVariantRowValues(
        preservedQtys,
        parseCsvValues((stockSubmitInput && stockSubmitInput.value) || initialStocksRaw),
        labels.length
      );
      var costs = alignVariantRowValues(
        preservedCosts,
        parseCsvValues((costSubmitInput && costSubmitInput.value) || initialCostsRaw),
        labels.length
      );
      var dealers = alignVariantRowValues(
        preservedDealers,
        parseCsvValues((dealerSubmitInput && dealerSubmitInput.value) || initialDealersRaw),
        labels.length
      );
      var projects = alignVariantRowValues(
        preservedProjects,
        parseCsvValues((projectSubmitInput && projectSubmitInput.value) || initialProjectsRaw),
        labels.length
      );
      var images = alignVariantRowValues(
        preservedImages,
        parseSubmitImages((imageSubmitInput && imageSubmitInput.value) || initialImagesRaw),
        labels.length
      );
      var brands = alignVariantRowValues(
        preservedBrands,
        parseCsvValues((brandSubmitInput && brandSubmitInput.value) || initialBrandsRaw),
        labels.length
      );
      var fallbackBrand = getFallbackBrandId();
      variantList.innerHTML = '';
      labels.forEach(function (label, i) {
        var field = document.createElement('div');
        field.className = 'product-variant-price-field';
        field.setAttribute('data-variant-label', label);
        var expanded;
        if (Object.prototype.hasOwnProperty.call(expandedState, label)) {
          expanded = expandedState[label];
        } else if (labels.length > prevLabelCount) {
          expanded = i >= prevLabelCount;
        } else {
          expanded = i === 0;
        }
        if (expanded) field.classList.add('is-expanded');

        var head = document.createElement('button');
        head.type = 'button';
        head.className = 'product-variant-field-toggle';
        var thumbWrap = document.createElement('div');
        thumbWrap.className = 'product-variant-image-thumb';
        updateVariantImagePreview(thumbWrap, images[i] || '');
        var toggleText = document.createElement('div');
        toggleText.className = 'product-variant-field-toggle-text';
        var labelEl = document.createElement('div');
        labelEl.className = 'product-variant-price-label';
        labelEl.textContent = label;
        var summaryEl = document.createElement('div');
        summaryEl.className = 'product-variant-field-summary';
        summaryEl.setAttribute('data-variant-field-summary', '');
        summaryEl.textContent = variantFieldSummary(costs[i], prices[i], qtys[i]);
        toggleText.appendChild(labelEl);
        toggleText.appendChild(summaryEl);
        var caret = document.createElement('i');
        caret.className = 'bi bi-chevron-down product-variant-field-caret';
        caret.setAttribute('aria-hidden', 'true');
        head.appendChild(thumbWrap);
        head.appendChild(toggleText);
        head.appendChild(caret);
        head.addEventListener('click', function () {
          setVariantFieldExpanded(field, label, !field.classList.contains('is-expanded'));
        });

        var body = document.createElement('div');
        body.className = 'product-variant-field-body';
        var brandWrap = document.createElement('div');
        brandWrap.className = 'product-variant-brand-wrap';
        var brandLabel = document.createElement('label');
        brandLabel.className = 'form-label-custom small mb-1';
        brandLabel.textContent = 'Thương hiệu';
        var brandOptional = document.createElement('span');
        brandOptional.className = 'text-muted fw-normal';
        brandOptional.textContent = ' (tuỳ chọn)';
        brandLabel.appendChild(brandOptional);
        brandWrap.appendChild(brandLabel);
        brandWrap.appendChild(
          buildVariantBrandSelect(brands[i] || fallbackBrand || '')
        );
        var imageWrap = document.createElement('div');
        imageWrap.className = 'product-variant-image-wrap';
        var imageLabel = document.createElement('label');
        imageLabel.className = 'form-label-custom small mb-1';
        imageLabel.textContent = 'URL hình ảnh';
        var imageOptional = document.createElement('span');
        imageOptional.className = 'text-muted fw-normal';
        imageOptional.textContent = ' (tuỳ chọn)';
        imageLabel.appendChild(imageOptional);
        var imageInput = document.createElement('input');
        imageInput.type = 'text';
        imageInput.setAttribute('inputmode', 'url');
        imageInput.className = 'form-control form-control-sm';
        imageInput.setAttribute('data-variant-image-input', '');
        imageInput.setAttribute('placeholder', 'https://example.com/image.jpg');
        imageInput.value = images[i] || '';
        imageInput.addEventListener('input', function () {
          updateVariantImagePreview(thumbWrap, imageInput.value);
          syncCombinedValues();
        });
        imageWrap.appendChild(imageLabel);
        imageWrap.appendChild(imageInput);
        var row = document.createElement('div');
        row.className = 'row g-2 product-variant-price-qty-row';
        function makeMoneyCol(labelText, placeholder, attr, val, colClass) {
          var colEl = document.createElement('div');
          colEl.className = colClass || 'col-6 col-md-4';
          var fieldLabel = document.createElement('label');
          fieldLabel.className = 'form-label-custom small mb-1';
          fieldLabel.textContent = labelText;
          colEl.appendChild(fieldLabel);
          var wrap = document.createElement('div');
          wrap.className = 'money-input-wrap money-input-wrap-sm';
          var input = document.createElement('input');
          input.type = 'text';
          input.className = 'form-control money-input form-control-sm';
          input.setAttribute('inputmode', 'numeric');
          input.setAttribute('autocomplete', 'off');
          input.setAttribute(attr, '');
          input.setAttribute('placeholder', placeholder);
          input.value = formatMoneyVal(val || '');
          input.addEventListener('input', syncCombinedValues);
          var suffix = document.createElement('span');
          suffix.className = 'money-input-suffix';
          suffix.textContent = 'đ';
          wrap.appendChild(input);
          wrap.appendChild(suffix);
          colEl.appendChild(wrap);
          return colEl;
        }
        row.appendChild(makeMoneyCol('Giá nhập', '0', 'data-variant-cost-input', costs[i]));
        row.appendChild(makeMoneyCol('Giá lẻ', '0', 'data-variant-price-input', prices[i]));
        row.appendChild(makeMoneyCol('Giá sỉ', '0', 'data-variant-dealer-input', dealers[i]));
        row.appendChild(makeMoneyCol('Giá công trình', '0', 'data-variant-project-input', projects[i]));
        var qtyCol = document.createElement('div');
        qtyCol.className = 'col-6 col-md-4';
        var qtyLabel = document.createElement('label');
        qtyLabel.className = 'form-label-custom small mb-1';
        qtyLabel.textContent = 'Tồn kho';
        var qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.className = 'form-control form-control-sm';
        qtyInput.setAttribute('data-variant-qty-input', '');
        qtyInput.setAttribute('placeholder', '0');
        qtyInput.min = '0';
        qtyInput.step = 'any';
        qtyInput.value = qtys[i] !== undefined && qtys[i] !== '' ? qtys[i] : '0';
        qtyInput.addEventListener('input', syncCombinedValues);
        qtyCol.appendChild(qtyLabel);
        qtyCol.appendChild(qtyInput);
        row.appendChild(qtyCol);
        body.appendChild(brandWrap);
        body.appendChild(imageWrap);
        body.appendChild(row);
        field.appendChild(head);
        field.appendChild(body);
        variantList.appendChild(field);
      });
      refreshVariantFieldSummaries();
      initialPricesRaw = '';
      initialStocksRaw = '';
      initialCostsRaw = '';
      initialDealersRaw = '';
      initialProjectsRaw = '';
      initialImagesRaw = '';
      initialBrandsRaw = '';
      col.removeAttribute('data-initial-prices');
      col.removeAttribute('data-initial-stocks');
      col.removeAttribute('data-initial-costs');
      col.removeAttribute('data-initial-dealers');
      col.removeAttribute('data-initial-projects');
      col.removeAttribute('data-initial-images');
      col.removeAttribute('data-initial-brands');
      if (stockCol) stockCol.removeAttribute('data-initial-stocks');
      if (typeof window.initMoneyInputs === 'function') {
        window.initMoneyInputs(variantList);
      }
      syncCombinedValues();
    }

    function refreshVariantBrandOptions() {
      if (!variantList) return;
      variantList.querySelectorAll('[data-variant-brand-input]').forEach(function (sel) {
        var current = sel.value;
        var parent = sel.parentNode;
        var next = buildVariantBrandSelect(current);
        parent.replaceChild(next, sel);
      });
    }

    function updateMode() {
      var labels = parseLabels();
      var multi = labels.length > 1;
      if (singleWrap) singleWrap.classList.toggle('d-none', multi);
      if (variantsWrap) variantsWrap.classList.toggle('d-none', !multi);
      if (stockSingleWrap) stockSingleWrap.classList.toggle('d-none', multi);
      if (costSingleWrap) costSingleWrap.classList.toggle('d-none', multi);
      if (projectSingleWrap) projectSingleWrap.classList.toggle('d-none', multi);
      if (dealerSingleWrap) dealerSingleWrap.classList.toggle('d-none', multi);
      if (projectCol) projectCol.classList.toggle('d-none', multi);
      if (dealerCol) dealerCol.classList.toggle('d-none', multi);
      if (taxonomyBrandCol) taxonomyBrandCol.classList.toggle('d-none', multi);
      if (multi) {
        var prevCount = parseInt(variantList.dataset.labelCount || '0', 10);
        if (!variantList.children.length || prevCount !== labels.length) {
          renderVariantInputs();
        } else {
          updateVariantLabelHeaders(labels);
        }
        variantList.dataset.labelCount = String(labels.length);
      } else {
        if (variantList && variantList.children.length) {
          function firstVariantValue(selector) {
            var el = variantList.querySelector(selector);
            return el ? el.value : '';
          }
          if (singleInput) singleInput.value = firstVariantValue('[data-variant-price-input]');
          if (costSingleInput) costSingleInput.value = firstVariantValue('[data-variant-cost-input]');
          if (dealerSingleInput) dealerSingleInput.value = firstVariantValue('[data-variant-dealer-input]');
          if (projectSingleInput) projectSingleInput.value = firstVariantValue('[data-variant-project-input]');
          if (stockSingleInput) stockSingleInput.value = firstVariantValue('[data-variant-qty-input]') || '0';
          variantList.dataset.labelCount = '0';
          variantList.innerHTML = '';
        }
        syncCombinedValues();
      }
    }

    if (variantInput) {
      variantInput.addEventListener('input', updateMode);
      variantInput.addEventListener('change', updateMode);
    }
    if (taxonomyPicker) {
      var parentSel = taxonomyPicker.querySelector('.taxonomy-parent-select');
      var childSel = taxonomyPicker.querySelector('.taxonomy-child-select');
      if (parentSel) {
        parentSel.addEventListener('change', function () {
          if (parseLabels().length > 1) refreshVariantBrandOptions();
        });
      }
      if (childSel) {
        childSel.addEventListener('change', function () {
          if (parseLabels().length > 1) refreshVariantBrandOptions();
        });
      }
    }
    if (singleInput) singleInput.addEventListener('input', syncCombinedValues);
    if (stockSingleInput) stockSingleInput.addEventListener('input', syncCombinedValues);
    if (costSingleInput) costSingleInput.addEventListener('input', syncCombinedValues);
    if (projectSingleInput) projectSingleInput.addEventListener('input', syncCombinedValues);
    if (dealerSingleInput) dealerSingleInput.addEventListener('input', syncCombinedValues);
    function presubmitProductFormSync() {
      var variantSetup = form.querySelector('[data-product-variant-setup]');
      if (variantSetup) {
        var variantHidden = form.querySelector('input[name="variant"]');
        var nameList = variantSetup.querySelector('[data-variant-name-list]');
        if (variantHidden && nameList) {
          var names = [];
          nameList.querySelectorAll('[data-variant-name-input]').forEach(function (inp) {
            var v = (inp.value || '').trim();
            if (v) names.push(v);
          });
          variantHidden.value = names.join(', ');
        }
      }
      updateMode();
      syncCombinedValues();
    }
    form.addEventListener('submit', presubmitProductFormSync);
    form.addEventListener('product-form-presubmit', presubmitProductFormSync);
    updateMode();
  });
}

function initProductListImagePreview() {
  var table = document.querySelector('.product-table-v2');
  if (!table) return;
  var rows = table.querySelectorAll('tbody tr.has-product-preview');
  if (!rows.length) return;

  var preview = document.createElement('div');
  preview.className = 'product-list-image-preview';
  preview.setAttribute('role', 'tooltip');
  preview.setAttribute('aria-hidden', 'true');
  preview.innerHTML =
    '<div class="product-list-image-preview-media">' +
    '<img alt="" referrerpolicy="no-referrer">' +
    '<span class="product-list-image-preview-more d-none"></span>' +
    '</div>' +
    '<div class="product-list-image-preview-name"></div>' +
    '<div class="product-list-image-preview-variants d-none"></div>';
  document.body.appendChild(preview);

  var previewImg = preview.querySelector('img');
  var mediaWrap = preview.querySelector('.product-list-image-preview-media');
  var moreBadge = preview.querySelector('.product-list-image-preview-more');
  var nameEl = preview.querySelector('.product-list-image-preview-name');
  var variantsEl = preview.querySelector('.product-list-image-preview-variants');
  var activeRow = null;
  var hideTimer = null;

  function fmtMoney(n) {
    return (parseInt(n, 10) || 0).toLocaleString('vi-VN') + ' đ';
  }

  function fmtQty(n) {
    if (window.ProductUnits && ProductUnits.formatQty) return ProductUnits.formatQty(n);
    var v = parseFloat(n);
    if (isNaN(v)) return '0';
    return v === Math.floor(v) ? String(Math.floor(v)) : String(v);
  }

  function parseImages(tr) {
    try {
      var urls = JSON.parse(tr.getAttribute('data-product-preview-images') || '[]');
      return Array.isArray(urls) ? urls.filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }

  function parseVariants(tr) {
    try {
      var items = JSON.parse(tr.getAttribute('data-product-preview-variants') || '[]');
      return Array.isArray(items) ? items : [];
    } catch (e) {
      return [];
    }
  }

  function hidePreview() {
    activeRow = null;
    preview.classList.remove('is-visible', 'has-variants');
    preview.setAttribute('aria-hidden', 'true');
    previewImg.removeAttribute('src');
    variantsEl.innerHTML = '';
    variantsEl.classList.add('d-none');
    mediaWrap.classList.remove('d-none');
  }

  function positionPreview(clientX, clientY) {
    var pad = 14;
    var gap = 18;
    var rect = preview.getBoundingClientRect();
    var w = rect.width || 280;
    var h = rect.height || 280;
    var x = clientX + gap;
    var y = clientY + gap;
    if (x + w > window.innerWidth - pad) {
      x = clientX - w - gap;
    }
    if (y + h > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - h - pad);
    }
    if (x < pad) x = pad;
    preview.style.left = x + 'px';
    preview.style.top = y + 'px';
  }

  function renderVariants(variants) {
    variantsEl.innerHTML = '';
    if (!variants.length) {
      variantsEl.classList.add('d-none');
      preview.classList.remove('has-variants');
      return;
    }
    variants.forEach(function (v) {
      var row = document.createElement('div');
      row.className = 'product-list-preview-variant-row';
      var thumb = v.image_url
        ? '<span class="product-list-preview-variant-thumb"><img src="' + v.image_url + '" alt="" referrerpolicy="no-referrer"></span>'
        : '<span class="product-list-preview-variant-thumb is-empty"><i class="bi bi-image"></i></span>';
      var meta = [];
      if (v.brand_name) meta.push(v.brand_name);
      if (v.cost != null && v.cost !== '') meta.push('Nhập: ' + fmtMoney(v.cost));
      meta.push(fmtMoney(v.price || 0));
      if (v.qty != null && v.qty !== '') meta.push(fmtQty(v.qty));
      row.innerHTML =
        thumb +
        '<span class="product-list-preview-variant-body">' +
        '<span class="product-list-preview-variant-label">' + (v.label || '') + '</span>' +
        '<span class="product-list-preview-variant-meta">' + meta.join(' · ') + '</span>' +
        '</span>';
      variantsEl.appendChild(row);
    });
    variantsEl.classList.remove('d-none');
    preview.classList.add('has-variants');
  }

  function showPreview(tr, clientX, clientY) {
    if (tr.querySelector('.dropdown.show')) return;
    var urls = parseImages(tr);
    var variants = parseVariants(tr);
    if (!urls.length && !variants.length) return;
    activeRow = tr;
    var displayUrl = urls[0] || (variants[0] && variants[0].image_url) || '';
    if (displayUrl) {
      previewImg.src = displayUrl;
      mediaWrap.classList.remove('d-none');
    } else {
      previewImg.removeAttribute('src');
      mediaWrap.classList.add('d-none');
    }
    previewImg.alt = tr.getAttribute('data-product-preview-name') || '';
    nameEl.textContent = tr.getAttribute('data-product-preview-name') || '';
    if (urls.length > 1) {
      moreBadge.textContent = '+' + (urls.length - 1);
      moreBadge.classList.remove('d-none');
    } else {
      moreBadge.classList.add('d-none');
    }
    renderVariants(variants);
    preview.classList.add('is-visible');
    preview.setAttribute('aria-hidden', 'false');
    positionPreview(clientX, clientY);
  }

  rows.forEach(function (tr) {
    var nameTd = tr.querySelector('td.product-col-name');
    if (!nameTd) return;
    nameTd.addEventListener('mouseenter', function (e) {
      clearTimeout(hideTimer);
      showPreview(tr, e.clientX, e.clientY);
    });
    nameTd.addEventListener('mousemove', function (e) {
      if (activeRow === tr && preview.classList.contains('is-visible')) {
        positionPreview(e.clientX, e.clientY);
      }
    });
    nameTd.addEventListener('mouseleave', function () {
      hideTimer = setTimeout(hidePreview, 80);
    });
  });

  preview.addEventListener('mouseenter', function () {
    clearTimeout(hideTimer);
  });
  preview.addEventListener('mouseleave', function () {
    hideTimer = setTimeout(hidePreview, 80);
  });

  table.addEventListener('scroll', hidePreview, true);
  window.addEventListener('scroll', hidePreview, { passive: true });
  window.addEventListener('resize', hidePreview);
}

document.addEventListener('DOMContentLoaded', function () {
  initProductModalActions();
  initProductVariantSetup();
  initVariantRetailPriceFields();
  initProductImageUrlFields();
  initProductListImagePreview();
  initProductDetailGallery();
  initProductUnitSetup();
  initProductSuppliersPanels();
  initProductStockMethodSelects();
  initProductSidebarSearch();
  initProductFilterAutoSubmit();
  initCategoryPickers();
  initTaxonomyPickers();
  initProductFilterTaxonomy();
  initProductImportPreview();
  initCategoryImportPreview();
  initProductSuppliersPanels();
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
  document.querySelectorAll('#product-filter-form .product-search-wrap input').forEach(function (el) {
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (el.form) el.form.submit();
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
