(function () {
  // prevent double load
  if (window.__JAZZY_WIDGET_LOADED__) return;
  window.__JAZZY_WIDGET_LOADED__ = true;

  // Cleanup any previous instances (just in case)
  const oldBtn = document.getElementById("jazzy-launcher");
  if (oldBtn) oldBtn.remove();

  const oldFrame = document.getElementById("jazzy-frame");
  if (oldFrame) oldFrame.remove();

  const oldStyle = document.getElementById("jazzy-widget-style");
  if (oldStyle) oldStyle.remove();

  const CHAT_URL = "https://agent.digitalboxes.net/jazzy-chat";

  // 0) Inject styles (hover, idle bob, attention pulse)
  const style = document.createElement("style");
  style.id = "jazzy-widget-style";
  style.textContent = `
    #jazzy-launcher .jazzy-btn {
      position: relative;
      display: flex;
      align-items: center;
      background: #fff;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 9999px;
      padding: 10px 16px 10px 60px;
      box-shadow: 0 10px 22px rgba(0,0,0,0.18);
      font-family: sans-serif;
      gap: 10px;
      cursor: pointer;
      transition: transform 200ms ease, box-shadow 200ms ease;
      animation: jazzyIdle 2.6s ease-in-out infinite;
    }
    #jazzy-launcher .jazzy-btn:hover {
      transform: translateY(-4px) scale(1.04);
      box-shadow: 0 18px 32px rgba(0,0,0,0.28);
      animation: none;
    }
    #jazzy-launcher .jazzy-btn:active {
      transform: scale(0.97);
    }
    #jazzy-launcher .jazzy-avatar {
      position: absolute;
      left: -16px;
      bottom: -10px;
      width: 58px;
      height: 58px;
      border-radius: 9999px;
      overflow: hidden;
      background: #0d5bd8;
      border: 3px solid #fff;
      box-shadow: 0 12px 22px rgba(0,0,0,0.25);
    }
    #jazzy-launcher .jazzy-avatar::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 9999px;
      box-shadow: 0 0 0 0 rgba(13,91,216,0.55);
      animation: jazzyPulse 2s ease-out infinite;
      pointer-events: none;
    }
    #jazzy-launcher .jazzy-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    #jazzy-launcher .jazzy-text {
      font-weight: 700;
      color: #111827;
      font-size: 14px;
      white-space: nowrap;
    }
    @keyframes jazzyIdle {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
    @keyframes jazzyPulse {
      0%   { box-shadow: 0 0 0 0 rgba(13,91,216,0.55); }
      70%  { box-shadow: 0 0 0 14px rgba(13,91,216,0); }
      100% { box-shadow: 0 0 0 0 rgba(13,91,216,0); }
    }
    @media (prefers-reduced-motion: reduce) {
      #jazzy-launcher .jazzy-btn { animation: none; }
      #jazzy-launcher .jazzy-avatar::after { animation: none; }
    }
  `;
  document.head.appendChild(style);

  // 1) Create avatar launcher button
  const btn = document.createElement("div");
  btn.id = "jazzy-launcher";
  btn.style.position = "fixed";
  btn.style.bottom = "20px";
  btn.style.right = "20px";
  btn.style.zIndex = "999999";
  btn.style.userSelect = "none";

  btn.innerHTML = `
    <div class="jazzy-btn">
      <div class="jazzy-avatar">
        <img
          src="https://agent.digitalboxes.net/jazzy-avatar.png"
          onerror="this.src='https://agent.digitalboxes.net/favicon.ico'"
        />
      </div>
      <div class="jazzy-text">Chat with Jazzy</div>
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
  frame.style.background = "transparent";
  frame.setAttribute("title", "Jazzy Chat");

  document.body.appendChild(frame);

  // Helpers to open/close cleanly
  function openFrame() {
    frame.style.display = "block";
  }

  function closeFrame() {
    frame.style.display = "none";
    // Reload so the next open starts a fresh session (no stale lead/chat)
    try {
      frame.src = CHAT_URL + "?t=" + Date.now();
    } catch (e) {}
  }

  // 3) Toggle open/close
  btn.addEventListener("click", function () {
    const isOpen = frame.style.display === "block";
    if (isOpen) closeFrame();
    else openFrame();
  });

  // 3b) Listen for close request from inside the iframe (End chat / survey done)
  window.addEventListener("message", function (event) {
    const data = event && event.data;
    if (data && data.type === "JAZZY_CLOSE") {
      closeFrame();
    }
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