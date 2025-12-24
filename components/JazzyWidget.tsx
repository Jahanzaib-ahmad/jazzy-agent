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

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

function isEmbeddedMode() {
  if (typeof window === "undefined") return false;

  // widget.js can set this flag when embedding (optional)
  if ((window as any).__JAZZY_EMBED__ === true) return true;

  // fallback: if container exists (widget mounted into a div)
  if (document.getElementById("jazzy-widget-root")) return true;

  // fallback: iframe detection
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }

  return false;
}

/** Normalize multiple spaces */
function normalizeSpaces(raw: string) {
  return (raw || "").replace(/\s+/g, " ").trim();
}

/** ✅ NAME VALIDATION: required only */
function validateName(raw: string) {
  const name = normalizeSpaces(raw);
  if (!name) return { ok: false, value: name, error: "Please enter your name" };
  if (name.length > 80)
    return { ok: false, value: name, error: "Name is too long" };
  return { ok: true, value: name, error: "" };
}

/** Basic email validation */
function validateEmail(raw: string) {
  const email = (raw ?? "").trim();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return { ok, value: email, error: ok ? "" : "Enter a valid email" };
}

/**
 * ✅ Phone validation (relaxed):
 * Accepts:
 *  - +923111090222
 *  - 033112447003
 *  - 33112447003
 */
function validatePhone(raw: string) {
  const input = (raw ?? "").trim();
  if (!input)
    return { ok: false, value: input, error: "Please enter your phone number" };

  const cleaned = input.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+")) {
    if (!/^\+\d+$/.test(cleaned)) {
      return {
        ok: false,
        value: input,
        error: "Enter a valid phone number (digits only after +)",
      };
    }
    const digitsOnly = cleaned.slice(1);
    const ok = digitsOnly.length >= 8 && digitsOnly.length <= 15;
    return { ok, value: cleaned, error: ok ? "" : "Phone must be 8–15 digits after +" };
  }

  const digitsOnly = cleaned.replace(/[^\d]/g, "");
  const ok = digitsOnly.length >= 8 && digitsOnly.length <= 15;
  return { ok, value: digitsOnly, error: ok ? "" : "Enter a valid phone number" };
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

/** Decide when to ask for review */
function shouldAskForReview(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("thank") ||
    t.includes("thanks") ||
    t.includes("ok") ||
    t.includes("okay") ||
    t.includes("done") ||
    t.includes("bye") ||
    t.includes("perfect") ||
    t.includes("great")
  );
}

const AVATAR_SRC = "/jazzy-avatar.png";

type Props = { embed?: boolean };

const JazzyWidget: React.FC<Props> = ({ embed = false }) => {
  const EMBED = embed || isEmbeddedMode();

  const [open, setOpen] = useState(EMBED ? true : false);

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
  const [askedForReview, setAskedForReview] = useState(false);

  const chatRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // ✅ Refs to always read REAL values (fixes timing bugs)
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const termsRef = useRef<HTMLInputElement | null>(null);

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
    RENDER TURNSTILE WIDGET
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

      if (turnstileRenderedRef.current && turnstileWidgetIdRef.current) return;

      const container = document.getElementById("cf-turnstile");
      if (!container) return;

      container.innerHTML = "";

      const widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        size: "invisible",
        callback: (token: string) => validateLead(token),
        "error-callback": () => {
          setLeadError("Captcha failed. Please try again.");
          resetTurnstile();
        },
        "expired-callback": () => {
          setLeadError("Captcha expired. Please try again.");
          resetTurnstile();
        },
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

  useEffect(() => {
    if (open && leadGate) {
      setLeadError("");
      renderTurnstile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadGate]);

  /* ----------------------------------------------------------------------
    LOCAL LEAD VALIDATION (uses REF values + termsRef)
  ---------------------------------------------------------------------- */
  const validateLeadLocal = (
    nameRaw: string,
    emailRaw: string,
    phoneRaw: string,
    termsChecked: boolean
  ) => {
    const n = validateName(nameRaw);
    if (!n.ok) return { ok: false as const, error: n.error, n: null, e: null, p: null };

    const e = validateEmail(emailRaw);
    if (!e.ok) return { ok: false as const, error: e.error, n, e: null, p: null };

    if (isDisposableEmail(e.value))
      return {
        ok: false as const,
        error: "Disposable emails are not allowed.",
        n,
        e,
        p: null,
      };

    const p = validatePhone(phoneRaw);
    if (!p.ok) return { ok: false as const, error: p.error, n, e, p: null };

    // ✅ don't rely on acceptedTerms state
    if (!termsChecked)
      return {
        ok: false as const,
        error: "Please agree to the Terms & Privacy Policy.",
        n,
        e,
        p,
      };

    return { ok: true as const, n, e, p };
  };

  /* ----------------------------------------------------------------------
    TURNSTILE SERVER CHECK THEN OPEN CHAT
  ---------------------------------------------------------------------- */
  const validateLead = async (token: string) => {
    setLeadError("");

    const nameVal = nameInputRef.current?.value ?? leadName;
    const emailVal = emailInputRef.current?.value ?? leadEmail;
    const phoneVal = phoneInputRef.current?.value ?? leadPhone;

    const termsChecked = termsRef.current?.checked ?? acceptedTerms;

    const local = validateLeadLocal(nameVal, emailVal, phoneVal, termsChecked);
    if (!local.ok) {
      setLeadError(local.error);
      resetTurnstile();
      return;
    }

    // sync normalized values to state
    setLeadName(local.n.value);
    setLeadEmail(local.e.value);
    setLeadPhone(local.p.value);
    setAcceptedTerms(termsChecked);

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

      setLeadGate(false);

      const fn = firstNameFrom(local.n.value) || "there";
      setMessages([
        {
          id: "welcome-" + Date.now(),
          role: "assistant",
          content: `السلام عليكم ورحمة الله وبركاته، ${fn} 👋\nHello ${fn}! How can I help you today?`,
        },
      ]);
    } catch (err) {
      console.error("[Jazzy] verify-turnstile error:", err);
      setLeadError("Network error. Please try again.");
      resetTurnstile();
    }
  };

  /* ----------------------------------------------------------------------
    SEND MESSAGE TO API (WITH HISTORY)
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
            content:
              "I’m having trouble connecting right now. A human from Digitalboxes will follow up shortly.",
          },
        ]);
        return;
      }

      const data = await res.json().catch(() => null);
      const reply: string =
        data?.reply ||
        "Thanks! A member of the Digitalboxes team will follow up with you soon.";
      setMessages((prev) => [...prev, { id: Date.now() + "-jazzy", role: "assistant", content: reply }]);

      if (!askedForReview && shouldAskForReview(text)) {
        setAskedForReview(true);

        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + "-review-ask",
              role: "assistant",
              content: "Before you go — can you leave a quick rating? It helps a lot 🙏",
            },
          ]);
        }, 350);

        setTimeout(() => {
          setRating(0);
          setReviewText("");
          setShowSurvey(true);
        }, 900);
      }
    } catch (err) {
      console.error("[Jazzy] sendMessage error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + "-jazzy-fail",
          role: "assistant",
          content: "Connection dropped. Please try again.",
        },
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

  /* ----------------------------------------------------------------------
    SURVEY
  ---------------------------------------------------------------------- */
  const submitSurvey = () => {
    setShowSurvey(false);
  };

  /* ----------------------------------------------------------------------
    CLOSE WIDGET
  ---------------------------------------------------------------------- */
  const closeWidget = () => {
    // In embed mode, keep "open" true (page should remain visible)
    if (!EMBED) setOpen(false);

    setShowSurvey(false);
    setLoading(false);
    setInput("");
    setListening(false);
    setLeadError("");
    setAskedForReview(false);

    turnstileRenderedRef.current = false;
    turnstileWidgetIdRef.current = null;

    setLeadGate(true);
    setMessages([]);
    setRating(0);
    setReviewText("");
  };

  // Layout helpers
  const leadWrapClass = EMBED
    ? "fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-white"
    : "fixed bottom-24 right-5 w-80 bg-white shadow-xl border rounded-xl p-4 z-[99999]";

  const chatWrapClass = EMBED
    ? "fixed inset-0 w-screen h-screen bg-white flex flex-col z-[99999]"
    : "fixed bottom-20 right-5 w-80 h-[450px] bg-white shadow-xl border rounded-xl flex flex-col z-[99999]";

  const surveyWrapClass = EMBED
    ? "fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-white"
    : "fixed bottom-32 right-5 bg-white border shadow-xl p-4 rounded-xl w-80 z-[99999]";

  const cardClass = EMBED ? "w-full max-w-md" : "";

  return (
    <>
      {/* FLOATING BUTTON (hide in embed mode) */}
      {!EMBED && (
        <div
          className="fixed bottom-5 right-5 z-[99999] cursor-pointer select-none"
          onClick={() => setOpen(true)}
          role="button"
          aria-label="Open Jazzy chat"
        >
          <div className="jazzyBtn">
            <div className="jazzyAvatarFloat">
              <img
                src={AVATAR_SRC}
                className="jazzyAvatarImg"
                alt="Jazzy avatar"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/favicon.ico";
                }}
              />
            </div>

            <span className="jazzyBtnText">Chat with Jazzy</span>
          </div>
        </div>
      )}

      {/* LEAD FORM */}
      {open && leadGate && (
        <div className={leadWrapClass}>
          <div className={`${cardClass} ${EMBED ? "border rounded-xl shadow-xl p-4" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-lg">Let’s get you to the right place 👋</h3>

              {!EMBED && (
                <button
                  onClick={closeWidget}
                  className="text-xs text-gray-500 hover:text-gray-800"
                  type="button"
                >
                  Close
                </button>
              )}
            </div>

            <input
              ref={nameInputRef}
              className="border w-full p-2 rounded mb-2 text-sm"
              placeholder="Name"
              value={leadName}
              onChange={(e) => {
                setLeadName(e.target.value);
                if (leadError) setLeadError("");
              }}
            />

            <input
              ref={emailInputRef}
              type="email"
              className="border w-full p-2 rounded mb-2 text-sm"
              placeholder="you@company.com"
              value={leadEmail}
              onChange={(e) => {
                setLeadEmail(e.target.value);
                if (leadError) setLeadError("");
              }}
            />

            <input
              ref={phoneInputRef}
              className="border w-full p-2 rounded mb-2 text-sm"
              placeholder="Phone (e.g. +923... or 033...)"
              value={leadPhone}
              onChange={(e) => {
                setLeadPhone(e.target.value);
                if (leadError) setLeadError("");
              }}
            />

            <div className="flex gap-2 mb-2 text-xs flex-wrap">
              {["Marketing & Services", "Free AI / SEO Tools", "Something Else"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTopic(t)}
                  className={`px-2 py-1 rounded border active:scale-95 transition-transform duration-150 ${
                    selectedTopic === t ? "bg-blue-600 text-white" : "bg-white text-gray-800"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <label className="text-xs flex items-center gap-2 mb-2">
              <input
                ref={termsRef}
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => {
                  setAcceptedTerms(e.target.checked);
                  if (leadError) setLeadError("");
                }}
              />
              I accept the Terms &amp; Conditions and Privacy Policy.
            </label>

            <div className="text-[11px] text-gray-500 mb-2">
              Protected by Cloudflare Turnstile.
            </div>
            <div id="cf-turnstile" />

            {leadError && <div className="text-red-500 text-xs mb-2">{leadError}</div>}

            <button
              type="button"
              onClick={() => {
                setLeadError("");

                const nameVal = nameInputRef.current?.value ?? leadName;
                const emailVal = emailInputRef.current?.value ?? leadEmail;
                const phoneVal = phoneInputRef.current?.value ?? leadPhone;
                const termsChecked = termsRef.current?.checked ?? acceptedTerms;

                const local = validateLeadLocal(nameVal, emailVal, phoneVal, termsChecked);
                if (!local.ok) {
                  setLeadError(local.error);
                  return;
                }

                setLeadName(local.n.value);
                setLeadEmail(local.e.value);
                setLeadPhone(local.p.value);
                setAcceptedTerms(termsChecked);

                if (!turnstileRenderedRef.current) {
                  renderTurnstile();
                  return;
                }

                if (window.turnstile && turnstileWidgetIdRef.current) {
                  window.turnstile.execute(turnstileWidgetIdRef.current);
                } else {
                  setLeadError("Captcha not ready. Please try again.");
                }
              }}
              className="w-full bg-blue-600 text-white py-2 rounded text-sm active:scale-[0.98] transition-transform duration-150"
            >
              Continue to chat
            </button>
          </div>
        </div>
      )}

      {/* CHAT WINDOW */}
      {open && !leadGate && (
        <div className={chatWrapClass}>
          <div className="p-3 border-b bg-gray-100 flex items-center">
            <img
              src={AVATAR_SRC}
              className="h-9 w-9 rounded-full object-cover"
              alt="Jazzy avatar"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/favicon.ico";
              }}
            />
            <div className="ml-2">
              <div className="font-semibold text-sm">Jazzy</div>
              <div className="text-xs text-gray-500">Your AI Assistant</div>
            </div>

            <button
              className="ml-auto text-xs text-gray-600 hover:text-gray-900 active:scale-95 transition-transform duration-150"
              onClick={() => {
                setRating(0);
                setReviewText("");
                setShowSurvey(true);
              }}
              type="button"
            >
              End chat
            </button>

            {!EMBED && (
              <button
                className="ml-2 text-xs text-gray-600 hover:text-gray-900 active:scale-95 transition-transform duration-150"
                onClick={closeWidget}
                type="button"
              >
                Close
              </button>
            )}
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-2" ref={chatRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {m.role === "assistant" && (
                  <img
                    src={AVATAR_SRC}
                    className="h-7 w-7 rounded-full object-cover"
                    alt="Jazzy avatar"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/favicon.ico";
                    }}
                  />
                )}
                <div
                  className={`px-3 py-2 rounded-xl max-w-[75%] whitespace-pre-line ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-900"
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
              className={`h-8 w-8 rounded-full border flex items-center justify-center active:scale-95 transition-transform duration-150 ${
                listening ? "bg-red-100 border-red-400" : ""
              }`}
              type="button"
              aria-label="Toggle microphone"
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
              className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs disabled:opacity-60 active:scale-95 transition-transform duration-150"
              type="button"
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* SURVEY MODAL */}
      {showSurvey && (
        <div className={surveyWrapClass}>
          <div className={`${cardClass} ${EMBED ? "border rounded-xl shadow-xl p-4" : ""}`}>
            <h3 className="font-semibold mb-2">Rate your experience</h3>

            <div className="flex gap-2 mb-3 text-2xl">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`${
                    star <= rating ? "text-yellow-500" : "text-gray-300"
                  } active:scale-95 transition-transform duration-150`}
                  aria-label={`Rate ${star} stars`}
                >
                  ★
                </button>
              ))}
            </div>

            <textarea
              className="border w-full p-2 rounded text-sm mb-2"
              placeholder="Any feedback?"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
            />

            <button
              onClick={submitSurvey}
              className="bg-blue-600 text-white w-full py-2 rounded text-sm active:scale-[0.98] transition-transform duration-150"
              type="button"
              disabled={rating === 0}
            >
              Submit Feedback
            </button>

            <button
              onClick={() => setShowSurvey(false)}
              className="mt-2 w-full text-xs text-gray-600 hover:text-gray-900"
              type="button"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .jazzyBtn {
          position: relative;
          display: flex;
          align-items: center;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 9999px;
          padding: 10px 16px 10px 60px;
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
          transition: transform 150ms ease;
        }

        .jazzyBtn:active {
          transform: scale(0.97);
        }

        .jazzyAvatarFloat {
          position: absolute;
          left: -16px;
          bottom: -10px;
          width: 58px;
          height: 58px;
          border-radius: 9999px;
          overflow: hidden;
          background: #0d5bd8;
          border: 3px solid #ffffff;
          box-shadow: 0 12px 22px rgba(0, 0, 0, 0.25);
        }

        .jazzyAvatarImg {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .jazzyBtnText {
          font-size: 14px;
          font-weight: 700;
          color: #111827;
          white-space: nowrap;
        }
      `}</style>
    </>
  );
};

export default JazzyWidget;
