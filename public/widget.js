(function() {
  // Create chat button
  const btn = document.createElement("div");
  btn.id = "jazzy-chat-button";
  btn.style.position = "fixed";
  btn.style.bottom = "20px";
  btn.style.right = "20px";
  btn.style.background = "#0d5bd8";
  btn.style.color = "#fff";
  btn.style.padding = "14px 18px";
  btn.style.borderRadius = "50px";
  btn.style.cursor = "pointer";
  btn.style.zIndex = "999999";
  btn.style.fontFamily = "sans-serif";
  btn.style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)";
  btn.innerHTML = "💬 Chat with Jazzy";

  document.body.appendChild(btn);

  // Create iframe container
  const frame = document.createElement("iframe");
  frame.id = "jazzy-frame";
  frame.src = "https://agent.digitalboxes.net/jazzy-chat";
  frame.style.position = "fixed";
  frame.style.bottom = "90px";
  frame.style.right = "20px";
  frame.style.width = "380px";
  frame.style.height = "520px";
  frame.style.border = "none";
  frame.style.borderRadius = "12px";
  frame.style.display = "none";
  frame.style.zIndex = "999999";

  document.body.appendChild(frame);

  // Toggle widget
  btn.onclick = () => {
    frame.style.display = frame.style.display === "none" ? "block" : "none";
  };
})();
