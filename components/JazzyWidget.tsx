import React, { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const JazzyWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);

  const chatRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  /* ---------------------- Initialize Speech Recognition --------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
  }, []);

  /* --------------------------- Auto Scroll Chat --------------------------- */
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  /* ------------------------------ Speak Response ----------------------------- */
  const speak = (text: string) => {
    if (typeof window === "undefined") return;

    const synth = window.speechSynthesis;
    if (!synth) return;

    const utter = new SpeechSynthesisUtterance(text);
    utter.pitch = 1;
    utter.rate = 1;
    synth.speak(utter);
  };

  /* ------------------------------ Send Message ------------------------------ */
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/jazzy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages,
          source: "chat",
        }),
      });

      const data = await res.json();

      const replyText =
        data.reply ||
        "I'm sorry, something seems off. Can you rephrase that?";

      const botMessage: Message = {
        id: Date.now() + "-jazzy",
        role: "assistant",
        content: replyText,
      };

      setMessages((prev) => [...prev, botMessage]);

      // 🔊 speak response
      speak(replyText);
    } catch (error) {
      console.error("Jazzy error:", error);
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------ Microphone ------------------------------ */
  const toggleMic = () => {
    if (!recognitionRef.current) return;

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setListening(true);
      recognitionRef.current.start();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <div
        className="fixed bottom-5 right-5 z-50 flex items-center cursor-pointer bg-white border shadow-lg px-3 py-2 rounded-full"
        onClick={() => setOpen(!open)}
      >
        <img
          src="/jazzy-avatar.jpg"
          alt="Jazzy"
          className="h-10 w-10 rounded-full object-cover"
        />
        <span className="ml-2 font-semibold text-sm">Chat with Jazzy</span>
      </div>

      {/* Chat Window */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-80 h-[450px] bg-white shadow-xl border rounded-xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center p-3 border-b bg-gray-100">
            <img
              src="/jazzy-avatar.jpg"
              className="h-9 w-9 rounded-full object-cover"
            />
            <div className="ml-2">
              <div className="font-semibold text-sm">Jazzy</div>
              <div className="text-xs text-gray-500">Your AI Assistant</div>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={chatRef}
            className="flex-1 p-3 overflow-y-auto space-y-2 text-sm"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`px-3 py-2 rounded-xl max-w-[75%] ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-900"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="text-xs text-gray-400">Jazzy is thinking…</div>
            )}
          </div>

          {/* Input */}
          <div className="p-2 border-t flex items-center gap-2">
            <button
              onClick={toggleMic}
              className={`h-8 w-8 rounded-full flex items-center justify-center border ${
                listening ? "bg-red-100 border-red-400" : ""
              }`}
            >
              🎤
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ask Jazzy anything…"
              className="flex-1 border rounded-full px-3 py-2 text-xs"
            />

            <button
              onClick={sendMessage}
              disabled={loading}
              className="bg-blue-600 text-white text-xs px-4 py-2 rounded-full disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default JazzyWidget;
