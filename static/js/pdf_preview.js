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

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('btn-print-contract-pdf');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        printContractPdf();
      });
    }
  });
})();
