(function () {
  if (window.__JAZZY_WIDGET_LOADED__) return;
  window.__JAZZY_WIDGET_LOADED__ = true;

  const frame = document.createElement("iframe");
  frame.id = "jazzy-frame";
  frame.src = "https://agent.digitalboxes.net/jazzy-chat?embed=1"; // ✅ add embed flag
  frame.style.position = "fixed";
  frame.style.right = "20px";
  frame.style.bottom = "20px";
  frame.style.border = "none";
  frame.style.zIndex = "999999";
  frame.style.overflow = "hidden";
  frame.style.background = "transparent";

  // ✅ COLLAPSED size (shows only launcher area)
  frame.style.width = "240px";
  frame.style.height = "72px";
  frame.style.borderRadius = "9999px";
  frame.style.boxShadow = "0 8px 20px rgba(0,0,0,0.18)";

  document.body.appendChild(frame);

  function mobile() {
    return window.innerWidth < 480;
  }

  function applyResponsive() {
    if (mobile()) {
      frame.style.right = "12px";
      frame.style.bottom = "12px";
      frame.style.width = "220px";
      frame.style.height = "72px";
    } else {
      frame.style.right = "20px";
      frame.style.bottom = "20px";
      frame.style.width = "240px";
      frame.style.height = "72px";
    }
  }

  applyResponsive();
  window.addEventListener("resize", applyResponsive);
})();
