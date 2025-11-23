import React, { useState } from "react";

type ChatMessage = {
  id: number;
  role: "user" | "bot";
  text: string;
};

export default function JazzyChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setError(null);

    // 1. Add user message to UI immediately
    const userMsg: ChatMessage = {
      id: Date.now(),
      role: "user",
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/jazzy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      const replyText =
        (data && data.reply) || "Jazzy API is working but sent no reply text.";

      const botMsg: ChatMessage = {
        id: Date.now() + 1,
        role: "bot",
        text: replyText,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      console.error(err);
      setError("Something went wrong talking to Jazzy API.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: "40px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <h1
        style={{
          fontSize: "32px",
          fontWeight: 700,
          marginBottom: "24px",
        }}
      >
        Jazzy Agent
      </h1>

      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          background: "#fff",
          borderRadius: "16px",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div
          style={{
            height: "320px",
            overflowY: "auto",
            borderRadius: "12px",
            padding: "16px",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
          }}
        >
          {messages.length === 0 ? (
            <p style={{ color: "#9ca3af" }}>No messages yet…</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                style={{
                  marginBottom: "10px",
                  display: "flex",
                  justifyContent:
                    m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "70%",
                    padding: "10px 14px",
                    borderRadius: "14px",
                    fontSize: "14px",
                    lineHeight: 1.4,
                    background:
                      m.role === "user" ? "#0d5bd8" : "white",
                    color: m.role === "user" ? "white" : "#111827",
                    border:
                      m.role === "user"
                        ? "none"
                        : "1px solid #e5e7eb",
                  }}
                >
                  {m.text}
                </div>
              </div>
            ))
          )}
          {error && (
            <p style={{ color: "#dc2626", marginTop: "8px" }}>{error}</p>
          )}
        </div>

        <div
          style={{
            marginTop: "16px",
            display: "flex",
            gap: "8px",
          }}
        >
          <input
            type="text"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              padding: "12px 22px",
              borderRadius: "999px",
              border: "none",
              backgroundColor: loading ? "#93c5fd" : "#0d5bd8",
              color: "white",
              fontWeight: 600,
              cursor:
                loading || !input.trim() ? "not-allowed" : "pointer",
              transition: "background 0.15s ease",
            }}
          >
            {loading ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
