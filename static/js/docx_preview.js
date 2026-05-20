(function (global) {
  function showError(wrap, loading, errBox, msg) {
    if (loading) loading.classList.add('d-none');
    if (errBox) {
      errBox.textContent = msg;
      errBox.classList.remove('d-none');
    }
  }

  function renderDocxPreview(options) {
    var docUrl = options && options.docUrl;
    var wrap = options && options.wrap;
    if (!docUrl || !wrap) return Promise.reject(new Error('Thiếu docUrl hoặc container'));

    var loading = wrap.querySelector('.docx-preview-loading');
    var errBox = wrap.querySelector('.docx-preview-error');
    var container = wrap.querySelector('.docx-preview-container');

    if (loading) loading.classList.remove('d-none');
    if (errBox) errBox.classList.add('d-none');
    if (container) container.innerHTML = '';

    if (!container || typeof global.docx === 'undefined') {
      showError(wrap, loading, errBox, 'Không thể tải trình xem Word.');
      return Promise.reject(new Error('docx-preview chưa sẵn sàng'));
    }

    return fetch(docUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('Không đọc được file Word (HTTP ' + res.status + ')');
        return res.blob();
      })
      .then(function (blob) {
        return global.docx.renderAsync(blob, container, null, {
          className: 'docx-preview-body',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
        });
      })
      .then(function () {
        if (loading) loading.classList.add('d-none');
        wrap.dataset.docxLoaded = '1';
      })
      .catch(function (err) {
        showError(wrap, loading, errBox, err.message || 'Không thể hiển thị file Word.');
        throw err;
      });
  }

  global.renderDocxPreview = renderDocxPreview;
})(window);
