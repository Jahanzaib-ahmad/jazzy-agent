// pages/jazzy-chat.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const TOPICS = [
  "Marketing & Services",
  "Free AI / SEO Tools",
  "Something Else",
] as const;

declare global {
  interface Window {
    turnstile: any;
  }
}

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

export default function JazzyChatPage() {
  const router = useRouter();

  const [stage, setStage] = useState<"lead" | "chat">("lead");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<(typeof TOPICS)[number] | "">("");

  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // End chat + review
  const [ended, setEnded] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState("");

  // Scroll fix
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Turnstile
  const widgetIdRef = useRef<any>(null);
  const turnstileReadyRef = useRef(false);

  const pageUrl = useMemo(
    () =>
      typeof window !== "undefined"
        ? window.location.href
        : "agent.digitalboxes.net",
    []
  );

  /* ------------------------------ Close (works everywhere) ------------------------------ */
  const handleClose = () => {
    // If inside iframe/modal: tell parent to close widget
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "jazzy-close" }, "*");
        return;
      }
    } catch {}

    // Normal page: go back or go home
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  /* ------------------------------ Scroll ------------------------------ */
  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages, loading, showReview]);

  /* ---------------------------- Turnstile ----------------------------- */
  const ensureTurnstileScript = () =>
    new Promise<void>((resolve, reject) => {
      if (typeof window === "undefined") return resolve();
      if (window.turnstile) return resolve();

      const existing = document.querySelector(
        `script[src="${TURNSTILE_SCRIPT_SRC}"]`
      );
      if (existing) {
        const check = setInterval(() => {
          if (window.turnstile) {
            clearInterval(check);
            resolve();
          }
        }, 50);

        setTimeout(() => {
          clearInterval(check);
          if (!window.turnstile)
            reject(new Error("Turnstile loaded but not available"));
        }, 4000);

        return;
      }

      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Turnstile"));
      document.head.appendChild(script);
    });

  const renderTurnstile = async () => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) {
      setError("Missing NEXT_PUBLIC_TURNSTILE_SITE_KEY");
      return;
    }

    try {
      await ensureTurnstileScript();
      const container = document.getElementById("cf-turnstile");
      if (!container) return;

      // Avoid re-rendering
      if (turnstileReadyRef.current && widgetIdRef.current) return;

      container.innerHTML = "";

      widgetIdRef.current = window.turnstile.render(container, {
        sitekey: siteKey,
        size: "invisible",
        callback: async (token: string) => {
          await verifyCaptchaAndStart(token);
        },
        "error-callback": () => {
          setLeadLoading(false);
          setError("Captcha failed. Please try again.");
        },
        "expired-callback": () => {
          setLeadLoading(false);
          setError("Captcha expired. Please try again.");
          try {
            if (widgetIdRef.current) window.turnstile.reset(widgetIdRef.current);
          } catch {}
        },
      });

      turnstileReadyRef.current = true;
    } catch (e) {
      console.error("[Turnstile] init error:", e);
      setError("Captcha failed to load. Please refresh and try again.");
    }
  };

  useEffect(() => {
    if (stage === "lead") {
      void renderTurnstile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  /* ---------------------- Lead verify + greeting ----------------------- */
  const verifyCaptchaAndStart = async (token: string) => {
    try {
      const r = await fetch("/api/verify-turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token }),
      });

      const raw = await r.text();

      // Prevent "<!DOCTYPE" JSON crash
      if (raw.trim().startsWith("<!DOCTYPE")) {
        console.error("[verify-turnstile] returned HTML:", raw.slice(0, 200));
        throw new Error("Server route issue. Restart dev server.");
      }

      let j: any;
      try {
        j = JSON.parse(raw);
      } catch {
        throw new Error("Captcha error. Please try again.");
      }

      if (!r.ok || !j?.success) {
        throw new Error("Captcha failed. Please try again.");
      }

      // Passed captcha -> get greeting from AI
      await startChatGreeting();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Captcha verification failed.");
      setLeadLoading(false);
      try {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current);
        }
      } catch {}
    }
  };

  const startChatGreeting = async () => {
    setError(null);

    try {
      const res = await fetch("/api/jazzy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name,
          email,
          topic,
          pageUrl,
          message:
            "The visitor just started a chat. Greet them by name and briefly ask how you can help.",
        }),
      });

      const raw = await res.text();

      if (raw.trim().startsWith("<!DOCTYPE")) {
        console.error("[jazzy-chat] returned HTML:", raw.slice(0, 200));
        throw new Error("Server response issue. Please restart the dev server.");
      }

      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("Invalid server response. Please try again.");
      }

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not start the chat.");
      }

      const reply: string = data.reply || "Hi there! How can I help you today?";

      setMessages([{ role: "assistant", content: reply }]);
      setStage("chat");

      // reset end-chat state
      setEnded(false);
      setShowReview(false);
      setRating(0);
      setReviewText("");
    } finally {
      setLeadLoading(false);
    }
  };

  const handleContinueToChat = async () => {
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError("Please add your name and email to continue.");
      return;
    }

    if (!topic) {
      setError("Please pick what you need help with.");
      return;
    }

    if (!acceptedTerms) {
      setError("Please accept Terms & Privacy Policy to continue.");
      return;
    }

    setLeadLoading(true);

    // Execute Turnstile (invisible)
    try {
      await renderTurnstile();
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.execute(widgetIdRef.current);
      } else {
        setLeadLoading(false);
        setError("Captcha not ready. Please try again.");
      }
    } catch (e) {
      setLeadLoading(false);
      setError("Captcha failed to load. Please refresh and try again.");
    }
  };

  /* ----------------------------- Chat send ----------------------------- */
  const handleSendMessage = async () => {
    if (!currentMessage.trim() || loading || ended) return;

    const newUserMsg: Message = {
      role: "user",
      content: currentMessage.trim(),
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setCurrentMessage("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/jazzy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name,
          email,
          topic,
          pageUrl,
          message: newUserMsg.content,
        }),
      });

      const raw = await res.text();

      if (raw.trim().startsWith("<!DOCTYPE")) {
        console.error("[jazzy-chat] returned HTML:", raw.slice(0, 200));
        throw new Error("Server response issue. Please restart dev server.");
      }

      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("Invalid server response. Please try again.");
      }

      if (!res.ok || !data?.success) throw new Error(data?.error || "Chat error");

      const reply: string =
        data.reply || "Got it! Let me think about that for a second…";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------ End chat ----------------------------- */
  const handleEndChat = () => {
    setEnded(true);
    setShowReview(true);
  };

  const submitReview = () => {
    // Later we can POST this to an API if you want
    console.log("Review:", { rating, reviewText, name, email, topic, pageUrl });

    setShowReview(false);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Thanks for your feedback!" },
    ]);
  };

  /* ------------------------------ UI Helpers --------------------------- */
  const renderLeadForm = () => (
    <div style={styles.content}>
      <h2 style={styles.h2}>Let’s get you to the right place 👋</h2>
      <p style={styles.p}>
        Share a few details so Jazzy can route your request and a human from
        Digitalboxes can follow up.
      </p>

      <label style={styles.label}>Name</label>
      <input
        style={styles.input}
        placeholder="Your full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label style={styles.label}>Email</label>
      <input
        style={styles.input}
        placeholder="you@company.com"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <label style={styles.label}>What do you need help with?</label>
      <div style={styles.chipRow}>
        {TOPICS.map((t) => (
          <button
            key={t}
            type="button"
            style={{
              ...styles.chip,
              ...(topic === t ? styles.chipActive : {}),
            }}
            onClick={() => setTopic(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Terms checkbox */}
      <label style={styles.termsRow}>
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
        />
        <span>
          I accept the{" "}
          <a href="/terms" style={styles.link} target="_blank" rel="noreferrer">
            Terms &amp; Conditions
          </a>{" "}
          and{" "}
          <a href="/privacy" style={styles.link} target="_blank" rel="noreferrer">
            Privacy Policy
          </a>
          .
        </span>
      </label>

      <div style={styles.smallLine}>
        Protected by Cloudflare Turnstile. We’ll never sell your data.
      </div>

      {/* Turnstile container (invisible widget renders here) */}
      <div id="cf-turnstile" style={{ marginTop: 8 }} />

      {error && <p style={styles.error}>{error}</p>}

      <button
        type="button"
        style={{
          ...styles.primaryButton,
          opacity: leadLoading ? 0.7 : 1,
          cursor: leadLoading ? "default" : "pointer",
        }}
        disabled={leadLoading}
        onClick={handleContinueToChat}
      >
        {leadLoading ? "Verifying…" : "Continue to chat"}
      </button>
    </div>
  );

  const renderChat = () => (
    <div style={styles.chatWrapper}>
      <div style={styles.chatHeaderRow}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={styles.avatarCircle}>DB</div>
          <div>
            <div style={styles.headerTitle}>Jazzy – AI Assistant</div>
            <div style={styles.headerSubtitle}>Digitalboxes</div>
          </div>
        </div>

        <button type="button" style={styles.endChatBtn} onClick={handleEndChat}>
          End chat
        </button>
      </div>

      <div ref={chatScrollRef} style={styles.chatMessages}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                ...styles.chatBubble,
                ...(m.role === "user"
                  ? styles.chatBubbleUser
                  : styles.chatBubbleAssistant),
              }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.chatBubble, ...styles.chatBubbleAssistant }}>
            Typing…
          </div>
        )}
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.chatInputRow}>
        <textarea
          style={{
            ...styles.chatInput,
            opacity: ended ? 0.6 : 1,
          }}
          rows={2}
          placeholder={ended ? "Chat ended" : "Type your question…"}
          value={currentMessage}
          disabled={ended}
          onChange={(e) => setCurrentMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
        />
        <button
          type="button"
          style={{
            ...styles.sendButton,
            opacity: loading || ended ? 0.6 : 1,
            cursor: loading || ended ? "default" : "pointer",
          }}
          onClick={handleSendMessage}
          disabled={loading || ended}
        >
          ➤
        </button>
      </div>

      {/* Review Modal */}
      {showReview && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalTitle}>Rate your chat experience</div>
            <div style={styles.modalSub}>
              Your feedback helps us improve Jazzy.
            </div>

            <div style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRating(s)}
                  style={{
                    ...styles.starBtn,
                    opacity: s <= rating ? 1 : 0.35,
                  }}
                  aria-label={`${s} star`}
                >
                  ⭐
                </button>
              ))}
            </div>

            <textarea
              style={styles.modalTextarea}
              rows={4}
              placeholder="Optional: what could be better?"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
            />

            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={() => setShowReview(false)}
                style={styles.modalSecondary}
              >
                Skip
              </button>
              <button
                type="button"
                onClick={submitReview}
                disabled={rating === 0}
                style={{
                  ...styles.modalPrimary,
                  opacity: rating === 0 ? 0.6 : 1,
                  cursor: rating === 0 ? "default" : "pointer",
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={styles.container}>
      <style jsx global>{`
        html,
        body,
        #__next {
          margin: 0;
          padding: 0;
          height: 100%;
          overflow: hidden;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
            sans-serif;
          background: transparent;
        }
      `}</style>

      <div style={styles.card}>
        {/* TOP BAR */}
        <div style={styles.topBar}>
          <div style={styles.logoCircle}>DB</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={styles.topBarTitle}>Digitalboxes</span>
            <span style={styles.topBarSubtitle}>AI Assistant</span>
          </div>
        </div>

        {/* MAIN CONTENT */}
        {stage === "lead" ? renderLeadForm() : renderChat()}

        {/* FOOTER CLOSE BUTTON */}
        <button type="button" style={styles.footerClose} onClick={handleClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ Inline styles ------------------------------ */
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: "100%",
    height: "100%",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "360px",
    maxWidth: "100%",
    height: "520px",
    maxHeight: "100%",
    background: "#fff",
    borderRadius: "18px",
    boxShadow: "0 18px 45px rgba(15, 35, 70, 0.25)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#0d5bd8",
    color: "#fff",
    padding: "10px 16px",
  },
  logoCircle: {
    width: 28,
    height: 28,
    borderRadius: "999px",
    background: "#fff",
    color: "#0d5bd8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 13,
  },
  topBarTitle: {
    fontSize: 13,
    fontWeight: 600,
  },
  topBarSubtitle: {
    fontSize: 11,
    opacity: 0.9,
  },
  content: {
    flex: 1,
    minHeight: 0, // IMPORTANT
    padding: "16px",
    overflowY: "auto",
  },
  h2: {
    margin: "0 0 8px",
    fontSize: 18,
  },
  p: {
    margin: "0 0 16px",
    fontSize: 13,
    color: "#555",
  },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    width: "100%",
    borderRadius: 999,
    border: "1px solid #dde2eb",
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
    marginBottom: 6,
  },
  chip: {
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    border: "1px solid #dde2eb",
    background: "#fff",
    cursor: "pointer",
  },
  chipActive: {
    background: "#e7efff",
    borderColor: "#0d5bd8",
    color: "#0d5bd8",
  },
  termsRow: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    fontSize: 12,
    marginTop: 10,
    color: "#333",
  },
  link: {
    color: "#0d5bd8",
    textDecoration: "underline",
    fontWeight: 500,
  },
  smallLine: {
    fontSize: 11,
    color: "#666",
    marginTop: 6,
  },
  primaryButton: {
    width: "100%",
    borderRadius: 999,
    border: "none",
    padding: "10px 14px",
    marginTop: 12,
    background: "#0d5bd8",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
  },
  error: {
    marginTop: 8,
    color: "#d33",
    fontSize: 12,
  },
  footerClose: {
    border: "none",
    borderTop: "1px solid #eef0f5",
    padding: "8px 0",
    fontSize: 13,
    background: "#fff",
    cursor: "pointer",
    fontWeight: 500,
  },

  chatWrapper: {
    flex: 1,
    minHeight: 0, // IMPORTANT
    display: "flex",
    flexDirection: "column",
    padding: "10px 12px",
  },
  chatHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  avatarCircle: {
    width: 26,
    height: 26,
    borderRadius: "999px",
    background: "#e7efff",
    color: "#0d5bd8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
  },
  headerSubtitle: {
    fontSize: 11,
    color: "#777",
  },
  endChatBtn: {
    borderRadius: 999,
    border: "1px solid #dde2eb",
    background: "#fff",
    padding: "6px 10px",
    fontSize: 12,
    cursor: "pointer",
  },
  chatMessages: {
    flex: 1,
    minHeight: 0, // IMPORTANT (this fixes hidden messages)
    overflowY: "auto",
    paddingRight: 4,
    marginBottom: 8,
  },
  chatBubble: {
    maxWidth: "80%",
    padding: "8px 10px",
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 1.4,
  },
  chatBubbleUser: {
    background: "#0d5bd8",
    color: "#fff",
    borderBottomRightRadius: 2,
  },
  chatBubbleAssistant: {
    background: "#f4f6fb",
    color: "#222",
    borderBottomLeftRadius: 2,
  },
  chatInputRow: {
    display: "flex",
    gap: 6,
    alignItems: "flex-end",
    marginTop: 4,
  },
  chatInput: {
    flex: 1,
    resize: "none",
    borderRadius: 12,
    border: "1px solid #dde2eb",
    padding: "8px 10px",
    fontSize: 13,
    outline: "none",
  },
  sendButton: {
    borderRadius: 999,
    border: "none",
    background: "#0d5bd8",
    color: "#fff",
    padding: "8px 12px",
    fontSize: 13,
  },

  // Modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 9999,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 18px 45px rgba(0,0,0,0.20)",
    padding: 16,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 700,
  },
  modalSub: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  starsRow: {
    display: "flex",
    gap: 6,
    marginTop: 10,
    fontSize: 22,
  },
  starBtn: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
  },
  modalTextarea: {
    width: "100%",
    marginTop: 10,
    borderRadius: 12,
    border: "1px solid #dde2eb",
    padding: "8px 10px",
    fontSize: 13,
    outline: "none",
    resize: "none",
  },
  modalActions: {
    display: "flex",
    gap: 8,
    marginTop: 12,
  },
  modalSecondary: {
    flex: 1,
    borderRadius: 999,
    border: "1px solid #dde2eb",
    background: "#fff",
    padding: "10px 12px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  modalPrimary: {
    flex: 1,
    borderRadius: 999,
    border: "none",
    background: "#0d5bd8",
    color: "#fff",
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 600,
  },
};
