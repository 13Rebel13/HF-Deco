document.querySelectorAll('.ba').forEach(function (el) {
  var after = el.querySelector('.ba-after');
  var bar = el.querySelector('.ba-bar');
  var dragging = false;
  function set(p) {
    p = Math.max(0, Math.min(100, p));
    bar.style.left = p + '%';
    after.style.clipPath = 'polygon(' + p + '% 0,100% 0,100% 100%,' + p + '% 100%)';
  }
  function move(e) {
    if (!dragging) return;
    var r = el.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 100);
  }
  el.addEventListener('pointerdown', function (e) {
    dragging = true;
    el.setPointerCapture(e.pointerId);
    var r = el.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 100);
  });
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', function () { dragging = false; });
  el.addEventListener('pointercancel', function () { dragging = false; });
  set(50);
});
