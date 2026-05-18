function moveOrderModalsToBody() {
  document.querySelectorAll('.order-page-modal').forEach(function (modal) {
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  });
}

document.addEventListener('DOMContentLoaded', function () {
  moveOrderModalsToBody();
});
