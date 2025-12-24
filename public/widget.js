(function () {
  // prevent double load
  if (window.__JAZZY_WIDGET_LOADED__) return;
  window.__JAZZY_WIDGET_LOADED__ = true;

  // DO NOT create any launcher button here
  // JazzyWidget.tsx already provides the avatar button

  const frame = document.createElement("iframe");
  frame.id = "jazzy-frame";
  frame.src = "https://agent.digitalboxes.net/jazzy-chat?embed=1";
  frame.style.position = "fixed";
  frame.style.bottom = "12px";
  frame.style.right = "12px";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.style.border = "none";
  frame.style.zIndex = "999999";
  frame.style.background = "transparent";

  document.body.appendChild(frame);

  // Listen for OPEN/CLOSE messages from inside iframe (JazzyWidget.tsx)
  window.addEventListener("message", function (event) {
    if (event.origin !== "https://agent.digitalboxes.net") return;
    const data = event.data || {};

    if (data.type === "JAZZY_OPEN") {
      frame.style.width = "360px";
      frame.style.height = "520px";
      frame.style.opacity = "1";
      frame.style.pointerEvents = "auto";
      frame.style.borderRadius = "16px";
      frame.style.boxShadow = "0 12px 28px rgba(0,0,0,0.22)";
      frame.style.overflow = "hidden";
    }

    if (data.type === "JAZZY_CLOSE") {
      frame.style.width = "1px";
      frame.style.height = "1px";
      frame.style.opacity = "0";
      frame.style.pointerEvents = "none";
      frame.style.boxShadow = "none";
    }
  });
})();
