(function () {
  // prevent double load
  if (window.__JAZZY_WIDGET_LOADED__) return;
  window.__JAZZY_WIDGET_LOADED__ = true;

  const CHAT_URL = "https://agent.digitalboxes.net/jazzy-chat";

  // 1) Create avatar launcher button
  const btn = document.createElement("div");
  btn.id = "jazzy-launcher";
  btn.style.position = "fixed";
  btn.style.bottom = "20px";
  btn.style.right = "20px";
  btn.style.zIndex = "999999";
  btn.style.cursor = "pointer";
  btn.style.userSelect = "none";

  btn.innerHTML = `
    <div style="
      position:relative;
      display:flex;
      align-items:center;
      background:#fff;
      border:1px solid rgba(0,0,0,0.12);
      border-radius:9999px;
      padding:10px 16px 10px 60px;
      box-shadow:0 10px 22px rgba(0,0,0,0.18);
      font-family:sans-serif;
      gap:10px;
    ">
      <div style="
        position:absolute;
        left:-16px;
        bottom:-10px;
        width:58px;
        height:58px;
        border-radius:9999px;
        overflow:hidden;
        background:#0d5bd8;
        border:3px solid #fff;
        box-shadow:0 12px 22px rgba(0,0,0,0.25);
      ">
        <img
          src="https://agent.digitalboxes.net/jazzy-avatar.png"
          style="width:100%;height:100%;object-fit:cover;display:block;"
          onerror="this.src='https://agent.digitalboxes.net/favicon.ico'"
        />
      </div>
      <div style="font-weight:700;color:#111827;font-size:14px;white-space:nowrap;">
        Chat with Jazzy
      </div>
    </div>
  `;

  document.body.appendChild(btn);

  // 2) Create iframe chatbox (hidden by default)
  const frame = document.createElement("iframe");
  frame.id = "jazzy-frame";
  frame.src = CHAT_URL;
  frame.style.position = "fixed";
  frame.style.bottom = "95px";
  frame.style.right = "20px";
  frame.style.width = "360px";
  frame.style.height = "520px";
  frame.style.border = "none";
  frame.style.borderRadius = "16px";
  frame.style.display = "none";
  frame.style.zIndex = "999999";
  frame.style.boxShadow = "0 12px 28px rgba(0,0,0,0.22)";
  frame.style.overflow = "hidden";
  frame.setAttribute("title", "Jazzy Chat");

  document.body.appendChild(frame);

  // 3) Toggle open/close
  btn.addEventListener("click", function () {
    const isOpen = frame.style.display === "block";
    frame.style.display = isOpen ? "none" : "block";
  });

  // 4) Mobile responsive
  function adjust() {
    if (window.innerWidth < 480) {
      btn.style.right = "12px";
      btn.style.bottom = "12px";

      frame.style.right = "12px";
      frame.style.left = "12px";
      frame.style.width = "calc(100% - 24px)";
      frame.style.height = "75vh";
      frame.style.bottom = "95px";
    } else {
      btn.style.right = "20px";
      btn.style.bottom = "20px";

      frame.style.left = "";
      frame.style.right = "20px";
      frame.style.width = "360px";
      frame.style.height = "520px";
      frame.style.bottom = "95px";
    }
  }

  adjust();
  window.addEventListener("resize", adjust);
})();
