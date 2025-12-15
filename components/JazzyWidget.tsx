// components/JazzyWidget.tsx
import React, { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

declare global {
  interface Window {
    turnstile: any;
  }
}

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/** 🌍 Global-safe name validator */
function validateName(raw: string) {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  const ok = /^[\p{L}\p{M}\s.'-]{2,60}$/u.test(name);
  return { ok, value: name, error: ok ? "" : "Please enter a valid name" };
}

/** Basic email validation */
function validateEmail(raw: string) {
  const email = (raw ?? "").trim();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return { ok, value: email, error: ok ? "" : "Enter a valid email" };
}

/** Phone validation (8–15 digits, allows + and separators) */
function validatePhone(raw: string) {
  const phone = (raw ?? "").trim();
  const digitsOnly = phone.replace(/[^\d]/g, "");
  const ok = digitsOnly.length >= 8 && digitsOnly.length <= 15;

  return {
    ok,
    value: phone,
    error: ok ? "" : "Enter a valid phone number",
  };
}

function isDisposableEmail(email: string) {
  const e = email.toLowerCase();
  const disposable = ["mailinator", "tempmail", "10minutemail", "yopmail"];
  return disposable.some((d) => e.includes(d));
}

function firstNameFrom(full: string) {
  const s = (full ?? "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0];
}

const JazzyWidget: React.FC = () => {
  const [open, setOpen] = useState(false);

  // Chat
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);

  // Lead gate
  const [leadGate, setLeadGate] = useState(true);
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [leadError, setLeadError] = useState("");

  // Topic selection
  const [selectedTopic, setSelectedTopic] = useState("Something Else");

  // Survey
  const [showSurvey, setShowSurvey] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");

  const chatRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Turnstile
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstileRenderedRef = useRef(false);

  /* ----------------------------------------------------------------------
    SPEECH RECOGNITION
  ---------------------------------------------------------------------- */
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      setInput(event.results[0][0].transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
  }, []);

  /* ----------------------------------------------------------------------
    AUTO SCROLL CHAT
  ---------------------------------------------------------------------- */
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  /* ----------------------------------------------------------------------
    LOAD TURNSTILE SCRIPT (ONCE)
  ---------------------------------------------------------------------- */
  const ensureTurnstileScript = () =>
    new Promise<void>((resolve, reject) => {
      if (typeof window === "undefined") return resolve();

      if (window.turnstile) return resolve();

      const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
      if (existing) {
        const check = setInterval(() => {
          if (window.turnstile) {
            clearInterval(check);
            resolve();
          }
        }, 50);

        setTimeout(() => {
          clearInterval(check);
          if (!window.turnstile) reject(new Error("Turnstile loaded but not initialized"));
        }, 4000);

        return;
      }

      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Turnstile script"));
      document.head.appendChild(script);
    });

  /* ----------------------------------------------------------------------
    RENDER TURNSTILE WIDGET (INVISIBLE)
  ---------------------------------------------------------------------- */
  const renderTurnstile = async () => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    if (!siteKey) {
      setLeadError("Turnstile site key missing (NEXT_PUBLIC_TURNSTILE_SITE_KEY).");
      return;
    }

    try {
      await ensureTurnstileScript();

      if (!window.turnstile) {
        setLeadError("Captcha failed to initialize. Please refresh.");
        return;
      }

      // Render only once per widget open
      if (turnstileRenderedRef.current && turnstileWidgetIdRef.current) return;

      const container = document.getElementById("cf-turnstile");
      if (!container) return;

      container.innerHTML = "";

      const widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        size: "invisible",
        callback: (token: string) => validateLead(token),
        "error-callback": () => setLeadError("Captcha failed. Please try again."),
        "expired-callback": () => setLeadError("Captcha expired. Please try again."),
      });

      turnstileWidgetIdRef.current = widgetId;
      turnstileRenderedRef.current = true;
    } catch (e) {
      console.error("[Jazzy] Turnstile init error:", e);
      setLeadError("Captcha failed to load. Please try again.");
    }
  };

  const resetTurnstile = () => {
    try {
      if (window.turnstile && turnstileWidgetIdRef.current) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
    } catch {}
  };

  /* ----------------------------------------------------------------------
    WHEN MODAL OPENS, PREP TURNSTILE
  ---------------------------------------------------------------------- */
  useEffect(() => {
    if (open && leadGate) {
      setLeadError("");
      renderTurnstile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadGate]);

  /* ----------------------------------------------------------------------
    LOCAL LEAD VALIDATION
  ---------------------------------------------------------------------- */
  const validateLeadLocal = () => {
    const n = validateName(leadName);
    if (!n.ok) return { ok: false as const, error: n.error };

    const e = validateEmail(leadEmail);
    if (!e.ok) return { ok: false as const, error: e.error };

    if (isDisposableEmail(e.value)) {
      return { ok: false as const, error: "Disposable emails are not allowed." };
    }

    const p = validatePhone(leadPhone);
    if (!p.ok) return { ok: false as const, error: p.error };

    if (!acceptedTerms) {
      return { ok: false as const, error: "Please agree to the Terms & Privacy Policy." };
    }

    // normalize stored values
    if (leadName !== n.value) setLeadName(n.value);
    if (leadEmail !== e.value) setLeadEmail(e.value);
    if (leadPhone !== p.value) setLeadPhone(p.value);

    return { ok: true as const };
  };

  /* ----------------------------------------------------------------------
    TURNSTILE SERVER CHECK THEN OPEN CHAT
  ---------------------------------------------------------------------- */
  const validateLead = async (token: string) => {
    setLeadError("");

    const local = validateLeadLocal();
    if (!local.ok) {
      setLeadError(local.error);
      resetTurnstile();
      return;
    }

    if (!token) {
      setLeadError("Captcha verification failed.");
      resetTurnstile();
      return;
    }

    try {
      const r = await fetch("/api/verify-turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!r.ok) {
        setLeadError("Captcha failed. Please try again.");
        resetTurnstile();
        return;
      }

      const j = await r.json().catch(() => null);
      if (!j?.success) {
        setLeadError("Captcha failed. Try again.");
        resetTurnstile();
        return;
      }

      // ✅ Open chat
      setLeadGate(false);

      const fn = firstNameFrom(leadName);
      setMessages([
        {
          id: "welcome-" + Date.now(),
          role: "assistant",
          content: `السلام عليكم ورحمة الله وبركاته، ${fn || "أهلاً"} 👋
Hello ${fn || "there"}! How can I help you today?`,
        },
      ]);
    } catch (err) {
      console.error("[Jazzy] verify-turnstile error:", err);
      setLeadError("Network error. Please try again.");
      resetTurnstile();
    }
  };

  /* ----------------------------------------------------------------------
    SEND MESSAGE TO API (WITH HISTORY ✅)
  ---------------------------------------------------------------------- */
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newUserMsg: Message = { id: Date.now() + "", role: "user", content: text };
    const nextMessages = [...messages, newUserMsg];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/jazzy-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead: {
            name: leadName,
            email: leadEmail,
            phone: leadPhone,
            topic: selectedTopic,
          },
          message: text,
          history: nextMessages.slice(-20).map(({ role, content }) => ({ role, content })),
          pageUrl: typeof window !== "undefined" ? window.location.href : "",
        }),
      });

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + "-jazzy-error",
            role: "assistant",
            content: "I’m having trouble connecting right now. A human from Digitalboxes will follow up shortly.",
          },
        ]);
        return;
      }

      const data = await res.json().catch(() => null);
      const reply: string = data?.reply || "Thanks! A member of the Digitalboxes team will follow up with you soon.";

      setMessages((prev) => [...prev, { id: Date.now() + "-jazzy", role: "assistant", content: reply }]);
    } catch (err) {
      console.error("[Jazzy] sendMessage error:", err);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + "-jazzy-fail", role: "assistant", content: "Connection dropped. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  /* ----------------------------------------------------------------------
    MIC
  ---------------------------------------------------------------------- */
  const toggleMic = () => {
    if (!recognitionRef.current) return;
    if (listening) recognitionRef.current.stop();
    else recognitionRef.current.start();
    setListening(!listening);
  };

  const endChat = () => setShowSurvey(true);
  const submitSurvey = () => setShowSurvey(false);

  const closeWidget = () => {
    setOpen(false);
    setShowSurvey(false);
    setLoading(false);
    setInput("");
    setListening(false);
    setLeadError("");

    // reset turnstile flags
    turnstileRenderedRef.current = false;
    turnstileWidgetIdRef.current = null;
  };

  // ✅ Prevent Enter submitting lead gate form / jumping screens
  const preventEnterSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.preventDefault();
  };

  return (
    <>
      {/* FLOATING BUTTON */}
      <div
        className="fixed bottom-5 right-5 z-50 bg-white border shadow-lg px-3 py-2 rounded-full flex items-center cursor-pointer"
        onClick={() => setOpen(true)}
        role="button"
        aria-label="Open Jazzy chat"
      >
        <img src="/jazzy-avatar.jpg" className="h-10 w-10 rounded-full" alt="Jazzy avatar" />
        <span className="ml-2 text-sm font-semibold">Chat with Jazzy</span>
      </div>

      {/* LEAD FORM */}
      {open && leadGate && (
        <div className="fixed bottom-24 right-5 w-80 bg-white shadow-xl border rounded-xl p-4 z-50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-lg">Let’s get you to the right place 👋</h3>
              <button onClick={closeWidget} type="button" className="text-xs text-gray-500 hover:text-gray-800">
                Close
              </button>
            </div>

            <input
              className="border w-full p-2 rounded mb-2 text-sm"
              placeholder="Your full name"
              value={leadName}
              onChange={(e) => {
                setLeadName(e.target.value);
                if (leadError) setLeadError("");
              }}
              onKeyDown={preventEnterSubmit}
            />

            <input
              type="email"
              className="border w-full p-2 rounded mb-2 text-sm"
              placeholder="you@company.com"
              value={leadEmail}
              onChange={(e) => {
                setLeadEmail(e.target.value);
                if (leadError) setLeadError("");
              }}
              onKeyDown={preventEnterSubmit}
            />

            <input
              className="border w-full p-2 rounded mb-2 text-sm"
              placeholder="Phone (WhatsApp preferred)"
              value={leadPhone}
              onChange={(e) => {
                setLeadPhone(e.target.value);
                if (leadError) setLeadError("");
              }}
              onKeyDown={preventEnterSubmit}
            />

            <div className="flex gap-2 mb-2 text-xs flex-wrap">
              {["Marketing & Services", "Free AI / SEO Tools", "Something Else"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTopic(t)}
                  className={`px-2 py-1 rounded border ${
                    selectedTopic === t ? "bg-blue-600 text-white" : "bg-white text-gray-800"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <label className="text-xs flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => {
                  setAcceptedTerms(e.target.checked);
                  if (leadError) setLeadError("");
                }}
              />
              I accept the Terms &amp; Conditions and Privacy Policy.
            </label>

            <div id="cf-turnstile" />

            {leadError && <div className="text-red-500 text-xs mb-2">{leadError}</div>}

            <button
              type="button"
              onClick={() => {
                setLeadError("");

                const local = validateLeadLocal();
                if (!local.ok) {
                  setLeadError(local.error);
                  return;
                }

                // Render if not rendered yet
                if (!turnstileRenderedRef.current) {
                  renderTurnstile();
                  return;
                }

                // Execute
                if (window.turnstile && turnstileWidgetIdRef.current) {
                  window.turnstile.execute(turnstileWidgetIdRef.current);
                } else {
                  setLeadError("Captcha not ready. Please try again.");
                }
              }}
              className="w-full bg-blue-600 text-white py-2 rounded text-sm"
            >
              Continue to chat
            </button>
          </form>
        </div>
      )}

      {/* CHAT WINDOW */}
      {open && !leadGate && (
        <div className="fixed bottom-20 right-5 w-80 h-[450px] bg-white shadow-xl border rounded-xl flex flex-col z-50">
          <div className="p-3 border-b bg-gray-100 flex items-center">
            <img src="/jazzy-avatar.jpg" className="h-9 w-9 rounded-full" alt="Jazzy avatar" />
            <div className="ml-2">
              <div className="font-semibold text-sm">Jazzy</div>
              <div className="text-xs text-gray-500">Your AI Assistant</div>
            </div>

            <button className="ml-auto text-xs text-gray-600 hover:text-gray-900" onClick={endChat} type="button">
              End chat
            </button>

            <button className="ml-2 text-xs text-gray-600 hover:text-gray-900" onClick={closeWidget} type="button">
              Close
            </button>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-2" ref={chatRef}>
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`px-3 py-2 rounded-xl max-w-[75%] ${
                    m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-900"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>

          <div className="p-2 border-t flex items-center gap-2">
            <button
              onClick={toggleMic}
              className={`h-8 w-8 rounded-full border flex items-center justify-center ${
                listening ? "bg-red-100 border-red-400" : ""
              }`}
              type="button"
            >
              🎤
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type your question…"
              className="flex-1 border rounded-full px-3 py-2 text-xs"
            />

            <button
              onClick={sendMessage}
              disabled={loading}
              className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60"
              type="button"
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* SURVEY MODAL */}
      {showSurvey && (
        <div className="fixed bottom-32 right-5 bg-white border shadow-xl p-4 rounded-xl w-80 z-50">
          <h3 className="font-semibold mb-2">Rate your experience</h3>

          <div className="flex gap-2 mb-3 text-xl">
            {[1, 2, 3, 4, 5].map((star) => (
              <span
                key={star}
                className={`cursor-pointer ${star <= rating ? "text-yellow-500" : "text-gray-400"}`}
                onClick={() => setRating(star)}
              >
                ⭐
              </span>
            ))}
          </div>

          <textarea
            className="border w-full p-2 rounded text-sm mb-2"
            placeholder="Any feedback?"
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
          />

          <button onClick={submitSurvey} className="bg-blue-600 text-white w-full py-2 rounded text-sm" type="button">
            Submit Feedback
          </button>
        </div>
      )}
    </>
  );
};

export default JazzyWidget;
