(function () {
  // Prevent duplicate loads
  if (window.__JAZZY_WIDGET_LOADED__) return;
  window.__JAZZY_WIDGET_LOADED__ = true;

  // Create iframe only (NO external button)
  const frame = document.createElement("iframe");
  frame.id = "jazzy-frame";
  frame.src = "https://agent.digitalboxes.net/jazzy-chat";
  frame.style.position = "fixed";
  frame.style.bottom = "20px";
  frame.style.right = "20px";
  frame.style.width = "360px";
  frame.style.height = "420px";
  frame.style.border = "none";
  frame.style.borderRadius = "14px";
  frame.style.zIndex = "999999";
  frame.style.boxShadow = "0 8px 20px rgba(0,0,0,0.20)";
  frame.style.overflow = "hidden";

  document.body.appendChild(frame);

  // Responsive handling
  function adjustForMobile() {
    if (window.innerWidth < 480) {
      frame.style.width = "calc(100% - 24px)";
      frame.style.height = "70vh";
      frame.style.right = "12px";
      frame.style.left = "12px";
      frame.style.bottom = "12px";
    } else {
      frame.style.width = "360px";
      frame.style.height = "420px";
      frame.style.right = "20px";
      frame.style.left = "";
      frame.style.bottom = "20px";
    }
  }

  adjustForMobile();
  window.addEventListener("resize", adjustForMobile);
})();
