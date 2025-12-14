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

const JazzyWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);

  // Lead gate
  const [leadGate, setLeadGate] = useState(true);
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
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
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  /* ----------------------------------------------------------------------
    LOAD TURNSTILE SCRIPT (ONCE)
  ---------------------------------------------------------------------- */
  const ensureTurnstileScript = () =>
    new Promise<void>((resolve, reject) => {
      if (typeof window === "undefined") return resolve();

      // Already loaded
      if (window.turnstile) return resolve();

      // If script tag already exists, wait a bit for it to initialize
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
          if (!window.turnstile) reject(new Error("Turnstile script loaded but window.turnstile not available"));
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
    RENDER TURNSTILE WIDGET (SAFE)
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

      // Render only once per open session
      if (turnstileRenderedRef.current && turnstileWidgetIdRef.current) return;

      const container = document.getElementById("cf-turnstile");
      if (!container) return;

      // Clear container to avoid duplicate widgets
      container.innerHTML = "";

      const widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        size: "invisible",
        callback: (token: string) => validateLead(token),
        "error-callback": () => setLeadError("Captcha failed. Please try again."),
        "expired-callback": () => {
          setLeadError("Captcha expired. Please try again.");
          if (turnstileWidgetIdRef.current) window.turnstile.reset(turnstileWidgetIdRef.current);
        },
      });

      turnstileWidgetIdRef.current = widgetId;
      turnstileRenderedRef.current = true;
    } catch (e) {
      console.error("[Jazzy] Turnstile init error:", e);
      setLeadError("Captcha failed to load. Please try again.");
    }
  };

  /* ----------------------------------------------------------------------
    RESET TURNSTILE
  ---------------------------------------------------------------------- */
  const resetTurnstile = () => {
    try {
      if (window.turnstile && turnstileWidgetIdRef.current) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
    } catch (e) {
      // ignore
    }
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
    LEAD VALIDATION + TURNSTILE SERVER CHECK
  ---------------------------------------------------------------------- */
  const validateLead = async (token: string) => {
    setLeadError("");

    if (!leadName.trim().match(/^[A-Za-z ]{3,}$/)) {
      setLeadError("Enter a valid full name.");
      resetTurnstile();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(leadEmail.trim())) {
      setLeadError("Enter a valid email.");
      resetTurnstile();
      return;
    }

    const disposable = ["mailinator", "tempmail", "10minutemail", "yopmail"];
    if (disposable.some((d) => leadEmail.toLowerCase().includes(d))) {
      setLeadError("Disposable emails are not allowed.");
      resetTurnstile();
      return;
    }

    if (!acceptedTerms) {
      setLeadError("Please agree to the Terms & Privacy Policy.");
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
        console.error("[Jazzy] verify-turnstile not OK:", r.status);
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

      // ✅ Success → open chat
      setLeadGate(false);

      setMessages([
        {
          id: "welcome-" + Date.now(),
          role: "assistant",
          content: "Hey! I'm Jazzy 👋 How can I help you today?",
        },
      ]);
    } catch (err) {
      console.error("[Jazzy] verify-turnstile request error:", err);
      setLeadError("Network error. Please try again.");
      resetTurnstile();
    }
  };

  /* ----------------------------------------------------------------------
    SPEAK RESPONSE
  ---------------------------------------------------------------------- */
  const speak = (text: string) => {
    const s = window.speechSynthesis;
    if (!s) return;

    const u = new SpeechSynthesisUtterance(text);
    u.pitch = 1;
    u.rate = 1;
    s.speak(u);
  };

  /* ----------------------------------------------------------------------
    SEND MESSAGE TO API (/api/jazzy-lead)
  ---------------------------------------------------------------------- */
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { id: Date.now() + "", role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/jazzy-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadName,
          email: leadEmail,
          topic: selectedTopic,
          message: text,
          pageUrl: typeof window !== "undefined" ? window.location.href : "",
        }),
      });

      if (!res.ok) {
        console.error("[Jazzy] /api/jazzy-lead not OK:", res.status);

        const fallback =
          "I'm having trouble connecting right now. A human from Digitalboxes will follow up with you shortly.";

        setMessages((prev) => [...prev, { id: Date.now() + "-jazzy-error", role: "assistant", content: fallback }]);
        return;
      }

      const data = await res.json().catch(() => null);

      const reply: string =
        data?.reply ||
        "Thanks for the details! A member of the Digitalboxes team will follow up with you soon.";

      setMessages((prev) => [...prev, { id: Date.now() + "-jazzy", role: "assistant", content: reply }]);
      speak(reply);
    } catch (err) {
      console.error("[Jazzy] sendMessage error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + "-jazzy-fail",
          role: "assistant",
          content: "Looks like the connection dropped. Please try again in a moment.",
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
    END CHAT
  ---------------------------------------------------------------------- */
  const endChat = () => setShowSurvey(true);

  const submitSurvey = () => {
    console.log("Survey Submitted:", rating, reviewText);
    setShowSurvey(false);
  };

  /* ----------------------------------------------------------------------
    CLOSE WIDGET (RESET NICE)
  ---------------------------------------------------------------------- */
  const closeWidget = () => {
    setOpen(false);
    setShowSurvey(false);
    setLoading(false);
    setInput("");
    setListening(false);
    setLeadError("");

    // reset turnstile flags (so it re-renders next time)
    turnstileRenderedRef.current = false;
    turnstileWidgetIdRef.current = null;
  };

  /* ----------------------------------------------------------------------
    RENDER UI
  ---------------------------------------------------------------------- */
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
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lg">Before we start ⭐</h3>
            <button onClick={closeWidget} className="text-xs text-gray-500 hover:text-gray-800">
              Close
            </button>
          </div>

          <input
            className="border w-full p-2 rounded mb-2 text-sm"
            placeholder="Full Name"
            value={leadName}
            onChange={(e) => setLeadName(e.target.value)}
          />

          <input
            type="email"
            className="border w-full p-2 rounded mb-2 text-sm"
            placeholder="Email"
            value={leadEmail}
            onChange={(e) => setLeadEmail(e.target.value)}
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
              onChange={(e) => setAcceptedTerms(e.target.checked)}
            />
            I agree to the Terms &amp; Privacy Policy.
          </label>

          {/* Turnstile container (rendered via turnstile.render) */}
          <div id="cf-turnstile" />

          {leadError && <div className="text-red-500 text-xs mb-2">{leadError}</div>}

          <button
            type="button"
            onClick={() => {
              setLeadError("");

              // Render if not rendered yet
              if (!turnstileRenderedRef.current) {
                renderTurnstile();
                return;
              }

              // Execute using widgetId (this is the correct approach)
              if (window.turnstile && turnstileWidgetIdRef.current) {
                window.turnstile.execute(turnstileWidgetIdRef.current);
              } else {
                setLeadError("Captcha not ready. Please try again.");
              }
            }}
            className="w-full bg-blue-600 text-white py-2 rounded text-sm"
          >
            Continue to Chat
          </button>
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

            <button className="ml-auto text-xs text-gray-600 hover:text-gray-900" onClick={endChat}>
              End Chat
            </button>

            <button className="ml-2 text-xs text-gray-600 hover:text-gray-900" onClick={closeWidget}>
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
              aria-label="Toggle microphone"
            >
              🎤
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ask Jazzy…"
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
