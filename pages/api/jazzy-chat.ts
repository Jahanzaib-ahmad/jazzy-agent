// pages/api/jazzy-chat.ts
import type { NextApiRequest, NextApiResponse } from "next";

type Msg = { role: "user" | "assistant"; content: string };

function safeString(v: any, max = 5000) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeName(nameRaw: any) {
  const n = safeString(nameRaw, 80);

  // Allow letters + spaces + dot + hyphen + apostrophe (common names)
  // If it doesn't match, we don't error — we fallback.
  const ok = /^[a-zA-Z.\-'\s]{2,80}$/.test(n);
  if (!ok) return "there";

  return n;
}

function isEmail(emailRaw: any) {
  const e = safeString(emailRaw, 120);
  // simple + safe check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

    const message = safeString(req.body?.message, 1500);
    const name = normalizeName(req.body?.name);
    const email = safeString(req.body?.email, 120);
    const topic = safeString(req.body?.topic, 120);
    const pageUrl = safeString(req.body?.pageUrl, 300);
    const history = (Array.isArray(req.body?.history) ? req.body.history : []) as Msg[];

    if (!message) return res.status(400).json({ success: false, error: "Missing message" });

    // Email: don't hard fail, but keep it clean
    const emailOk = email ? isEmail(email) : false;

    const system = `
You are Jazzy — Digitalboxes AI Assistant.
Be helpful, short, and practical.
If user asks about services, collect: business type, location, goal, budget, timeline.
If they ask about tools, explain and offer next steps.
Never claim you already emailed them. You can say "I can pass this to the team" but don't promise timing.
`.trim();

    const leadContext = `
Lead details:
- Name: ${name}
- Email: ${emailOk ? email : "(not provided / invalid)"}
- Topic: ${topic || "(not selected)"}
- Page: ${pageUrl || "(unknown)"}
`.trim();

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: system },
      { role: "user", content: leadContext },
    ];

    // include limited history
    const trimmedHistory = history.slice(-10).map((m) => ({
      role: m.role,
      content: safeString(m.content, 1200),
    }));

    for (const m of trimmedHistory) {
      messages.push({ role: m.role, content: m.content });
    }

    messages.push({ role: "user", content: message });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "Missing OPENAI_API_KEY on server (add it in Vercel env vars).",
      });
    }

    // Uses OpenAI Responses API style via fetch (no SDK needed)
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(500).json({
        success: false,
        error: data?.error?.message || "OpenAI request failed",
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      `Hi ${name}! How can I help you today?`;

    return res.status(200).json({ success: true, reply });
  } catch (e: any) {
    console.error("jazzy-chat error:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
