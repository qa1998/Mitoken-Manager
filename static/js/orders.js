function moveOrderModalsToBody() {
  document.querySelectorAll('.order-page-modal').forEach(function (modal) {
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  });
}

document.addEventListener('DOMContentLoaded', function () {
  moveOrderModalsToBody();
  document.querySelectorAll('.order-delete-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var code = form.getAttribute('data-code') || 'đơn hàng này';
      var msg =
        'Xóa hóa đơn / đơn hàng ' +
        code +
        '?\n\nCác khoản thanh toán liên quan cũng sẽ bị xóa. Báo giá liên kết (nếu có) sẽ chuyển về trạng thái Mới tạo.';
      if (!confirm(msg)) e.preventDefault();
    });
  });
});
