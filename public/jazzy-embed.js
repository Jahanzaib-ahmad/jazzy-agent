(function () {
  // Prevent double-load
  if (window.__JAZZY_EMBED_LOADED__) return;
  window.__JAZZY_EMBED_LOADED__ = true;

  // Change this to your live widget page URL
  var WIDGET_URL = "https://agent.digitalboxes.net/jazzy-chat";

  // Create container
  var container = document.createElement("div");
  container.id = "jazzy-embed-container";
  container.style.position = "fixed";
  container.style.bottom = "20px";
  container.style.right = "20px";
  container.style.zIndex = "999999";
  document.body.appendChild(container);

  // Create iframe
  var iframe = document.createElement("iframe");
  iframe.src = WIDGET_URL;
  iframe.title = "Jazzy AI Assistant";
  iframe.style.width = "360px";
  iframe.style.height = "560px";
  iframe.style.border = "0";
  iframe.style.borderRadius = "16px";
  iframe.style.boxShadow = "0 12px 40px rgba(0,0,0,0.18)";
  iframe.style.background = "transparent";
  iframe.allow = "microphone";
  container.appendChild(iframe);

  // Optional: hide on small screens (comment if you want mobile)
  // if (window.innerWidth < 420) container.style.display = "none";
})();
