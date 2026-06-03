(function () {
  function printContractPdf() {
    var iframe = document.getElementById('contract-pdf-viewer');
    if (!iframe || !iframe.src) {
      window.print();
      return;
    }
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      var w = window.open(iframe.src, '_blank');
      if (w) {
        w.onload = function () {
          w.focus();
          w.print();
        };
      }
    }
  }

  function initDocxPreview() {
    var wrap = document.querySelector('[data-docx-preview]');
    if (!wrap || typeof window.renderDocxPreview !== 'function') return;
    var docUrl = wrap.getAttribute('data-doc-url');
    if (!docUrl) return;
    window.renderDocxPreview({ docUrl: docUrl, wrap: wrap });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initDocxPreview();
    var btn = document.getElementById('btn-print-contract-pdf');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var iframe = document.getElementById('contract-pdf-viewer');
        if (iframe && iframe.src) {
          printContractPdf();
        } else {
          window.print();
        }
      });
    }
  });
})();
