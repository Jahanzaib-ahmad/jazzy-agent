// pages/api/jazzy-lead.ts
import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import nodemailer from "nodemailer";

const {
  OPENAI_API_KEY,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  NOTIFY_EMAIL,
  LEADS_WEBHOOK_URL,
} = process.env;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

type HistoryMsg = { role: "user" | "assistant"; content: string };

type LeadPayload = {
  name: string;
  email: string;
  phone?: string;
  topic: string;
  message: string;
  pageUrl?: string;
  history?: HistoryMsg[];
};

/* -------------------- helpers -------------------- */

function escapeHtml(input: string) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? "").trim());
}

// 🌍 Unicode-safe name validation
function isValidGlobalName(name: string) {
  const n = String(name ?? "").trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 60) return false;
  return /^[\p{L}\p{M}\s.'-]{2,60}$/u.test(n);
}

function normalizePhone(phone?: string) {
  const p = String(phone ?? "").trim();
  if (!p) return "";
  const digitsOnly = p.replace(/[^\d]/g, "");
  if (digitsOnly.length < 8 || digitsOnly.length > 15) return "";
  return p;
}

function firstNameFrom(full: string) {
  const s = String(full ?? "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0];
}

function extractReplyText(response: any): string | null {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const output = response?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const t1 = c?.text?.value;
          const t2 = c?.text;
          if (typeof t1 === "string" && t1.trim()) return t1.trim();
          if (typeof t2 === "string" && t2.trim()) return t2.trim();
        }
      }
    }
  }
  return null;
}

/* ----------------- Google Sheet webhook (optional) ----------------- */

async function sendLeadToSheet(data: LeadPayload) {
  if (!LEADS_WEBHOOK_URL) return;

  try {
    await fetch(LEADS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: JSON.stringify({
          timestamp: new Date().toISOString(),
          name: data.name,
          email: data.email,
          phone: data.phone || "",
          topic: data.topic,
          message: data.message,
          pageUrl: data.pageUrl || "",
          status: "Open",
        }),
      }),
    });
  } catch (err) {
    console.error("[Jazzy] Failed to push lead to Google Sheet:", err);
  }
}

/* ----------------------- SMTP email notify ------------------------- */

async function sendLeadEmail(data: LeadPayload) {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !NOTIFY_EMAIL) return;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const safeName = escapeHtml(data.name || "-");
    const safeEmail = escapeHtml(data.email || "-");
    const safePhone = escapeHtml(data.phone || "-");
    const safeTopic = escapeHtml(data.topic || "-");
    const safeMsg = escapeHtml(data.message || "").replace(/\n/g, "<br/>");
    const safeUrl = data.pageUrl ? escapeHtml(data.pageUrl) : "";

    await transporter.sendMail({
      from: `"Jazzy Agent" <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: "🆕 New Lead from Jazzy Agent",
      html: `
        <h2>New Chat Lead / Jazzy Agent</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Phone:</strong> ${safePhone}</p>
        <p><strong>Topic:</strong> ${safeTopic}</p>
        <p><strong>Message:</strong><br/>${safeMsg || "-"}</p>
        ${safeUrl ? `<p><strong>Page URL:</strong> <a href="${safeUrl}">${safeUrl}</a></p>` : ""}
        <p><strong>Status:</strong> Open</p>
      `,
    });
  } catch (err) {
    console.error("[Jazzy] Failed to send lead email:", err);
  }
}

/* ------------------- OpenAI – generate reply ---------------------- */

async function generateJazzyReply(data: LeadPayload): Promise<string> {
  if (!OPENAI_API_KEY) {
    return (
      "Thanks! Our assistant is temporarily offline, but a human from Digitalboxes will follow up shortly."
    );
  }

  const fn = firstNameFrom(data.name);

  const systemPrompt = `
You are Jazzy, the Digitalboxes AI assistant.

Mission:
- Help the visitor quickly and capture lead intent for Digitalboxes services/tools.
- Use the conversation history as truth.

Hard rules:
- Do NOT ask for details that the user already provided earlier in the chat (business type, location, goals, budget, timeline, phone).
- If the user says “I already shared this” (or similar), acknowledge and summarize what you already have instead of asking again.
- Ask at most ONE follow-up question, only if something critical is missing to help them.
- Keep replies short, natural, and non-robotic. No markdown bold like **this**.

Contact:
- If asked "how will you contact me?", say you’ll reach them via email or WhatsApp using the details they provided.

Personalization:
- Use the user's first name sometimes: ${fn || "there"}.
`.trim();

  // Build conversation with history
  const inputMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  const history = Array.isArray(data.history) ? data.history.slice(-20) : [];
  for (const m of history) {
    if (!m?.content) continue;
    if (m.role === "user" || m.role === "assistant") {
      inputMessages.push({ role: m.role, content: String(m.content) });
    }
  }

  // Add lead context (so the model knows phone exists + can greet properly)
  inputMessages.push({
    role: "user",
    content: `Lead snapshot: name=${data.name}, email=${data.email}, phone=${data.phone || "N/A"}, topic=${data.topic}, page=${data.pageUrl || "N/A"}`,
  });

  // Latest message
  inputMessages.push({
    role: "user",
    content: data.message || "(no message entered)",
  });

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: inputMessages,
  });

  const reply = extractReplyText(response);
  return reply || "Thanks! A member of the Digitalboxes team will follow up with you soon.";
}

/* -------------------------- Main handler -------------------------- */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const leadObj = body.lead && typeof body.lead === "object" ? body.lead : body;

    const lead: LeadPayload = {
      name: String(leadObj?.name ?? "").trim(),
      email: String(leadObj?.email ?? "").trim(),
      phone: normalizePhone(leadObj?.phone),
      topic: String(leadObj?.topic ?? body.topic ?? "Something Else").trim() || "Something Else",
      message: String(body.message ?? leadObj?.message ?? "").trim(),
      pageUrl: body.pageUrl ? String(body.pageUrl) : leadObj?.pageUrl ? String(leadObj.pageUrl) : undefined,
      history: Array.isArray(body.history) ? (body.history as HistoryMsg[]) : undefined,
    };

    // Validation
    if (!isValidGlobalName(lead.name)) {
      return res.status(400).json({ success: false, error: "Invalid name" });
    }
    if (!isValidEmail(lead.email)) {
      return res.status(400).json({ success: false, error: "Invalid email" });
    }
    if (!lead.message) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    // Fire-and-forget
    void sendLeadToSheet(lead);
    void sendLeadEmail(lead);

    const reply = await generateJazzyReply(lead);
    return res.status(200).json({ success: true, reply });
  } catch (err: any) {
    console.error("[Jazzy] API error:", err);
    return res.status(500).json({ success: false, error: err?.message || "Server error" });
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
  },
};
