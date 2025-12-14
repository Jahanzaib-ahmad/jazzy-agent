(function () {
  // Create chat button
  const btn = document.createElement("div");
  btn.id = "jazzy-chat-button";
  btn.style.position = "fixed";
  btn.style.bottom = "20px";
  btn.style.right = "20px";
  btn.style.background = "#0d5bd8";
  btn.style.color = "#fff";
  btn.style.padding = "14px 26px";
  btn.style.borderRadius = "50px";
  btn.style.cursor = "pointer";
  btn.style.zIndex = "999999";
  btn.style.fontFamily = "sans-serif";
  btn.style.fontSize = "16px";
  btn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
  btn.innerHTML = "💬 Ask Jazzy";
  btn.style.transition = "all 0.25s ease";

  // Hover effect
  btn.onmouseover = () => (btn.style.transform = "scale(1.05)");
  btn.onmouseout = () => (btn.style.transform = "scale(1)");

  document.body.appendChild(btn);

  // Create iframe popup
  const frame = document.createElement("iframe");
  frame.id = "jazzy-frame";
  frame.src = "https://agent.digitalboxes.net/jazzy-chat";
  frame.style.position = "fixed";
  frame.style.bottom = "85px";  
  frame.style.right = "20px";
  frame.style.width = "360px";        // WhatsApp size
  frame.style.height = "420px";       // WhatsApp size  
  frame.style.border = "none";
  frame.style.borderRadius = "14px";
  frame.style.display = "none";
  frame.style.zIndex = "999999";
  frame.style.boxShadow = "0 8px 20px rgba(0,0,0,0.20)";
  frame.style.overflow = "hidden";    // removes scrollbar

  document.body.appendChild(frame);

  // Smooth open/close animation
  frame.style.transition = "all 0.25s ease";

  // Toggle widget
  btn.onclick = () => {
    if (frame.style.display === "none") {
      frame.style.display = "block";
      frame.style.opacity = "1";
      frame.style.transform = "translateY(0)";
    } else {
      frame.style.opacity = "0";
      setTimeout(() => (frame.style.display = "none"), 200);
    }
  };
})();
