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

type Lead = {
  name: string;
  email: string;
  phone?: string;
  topic: string;
};

type ReqBody =
  | {
      // NEW shape
      lead: Lead;
      message: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      pageUrl?: string;
    }
  | {
      // OLD shape
      name: string;
      email: string;
      phone?: string;
      topic: string;
      message: string;
      pageUrl?: string;
    };

function escapeHtml(input: string) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanStr(v: any, max = 500) {
  const s = String(v ?? "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

function firstMessageFromHistory(history?: Array<{ role: string; content: string }>, fallback?: string) {
  const h = Array.isArray(history) ? history : [];
  const firstUser = h.find((m) => m.role === "user" && (m.content ?? "").trim());
  return cleanStr(firstUser?.content || fallback || "", 2000);
}

/* ----------------- Google Sheet webhook (fixed payload) ----------------- */
async function sendLeadToSheet(row: {
  name: string;
  email: string;
  phone: string;
  topic: string;
  firstMessage: string;
  pageUrl: string;
}) {
  if (!LEADS_WEBHOOK_URL) return;

  try {
    await fetch(LEADS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        name: row.name,
        email: row.email,
        phone: row.phone,
        topic: row.topic,
        firstMessage: row.firstMessage,
        pageUrl: row.pageUrl,
        status: "Open",
      }),
    });
  } catch (err) {
    console.error("[Jazzy] Failed to push lead to Google Sheet:", err);
  }
}

/* ----------------------- SMTP email notify ------------------------- */
async function sendLeadEmail(row: {
  name: string;
  email: string;
  phone: string;
  topic: string;
  firstMessage: string;
  pageUrl: string;
}) {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !NOTIFY_EMAIL) return;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const safeName = escapeHtml(row.name || "-");
    const safeEmail = escapeHtml(row.email || "-");
    const safePhone = escapeHtml(row.phone || "-");
    const safeTopic = escapeHtml(row.topic || "-");
    const safeMsg = escapeHtml(row.firstMessage || "").replace(/\n/g, "<br/>");
    const safeUrl = row.pageUrl ? escapeHtml(row.pageUrl) : "";

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
        <p><strong>First Message:</strong><br/>${safeMsg || "-"}</p>
        ${
          safeUrl
            ? `<p><strong>Page URL:</strong> <a href="${safeUrl}">${safeUrl}</a></p>`
            : ""
        }
        <p><strong>Status:</strong> Open</p>
      `,
    });
  } catch (err) {
    console.error("[Jazzy] Failed to send lead email:", err);
  }
}

/* ------------------- OpenAI – generate reply ---------------------- */
async function generateJazzyReply(args: {
  lead: Lead;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  if (!OPENAI_API_KEY) {
    return (
      "Thanks for your message! Our AI assistant is temporarily offline, " +
      "but a human from Digitalboxes will follow up with you shortly."
    );
  }

  const fn = cleanStr(args.lead?.name?.split(/\s+/)[0] || "there", 40);

  const systemPrompt = `
You are Jazzy, the friendly AI assistant for Digitalboxes (a digital marketing and development agency).

Hard rules:
- DO NOT ask for details the user already provided earlier in this chat (business type, location, goals, budget, timeline).
- If the user says they already shared info, acknowledge and summarize what you have.
- Ask at most ONE follow-up question only if something critical is missing.
- Keep replies short, natural, and non-robotic. No markdown.

Personalization:
- Start the reply with: "السلام عليكم ورحمة الله وبركاته، ${fn}."
- Then one short English line.

Contact:
- If asked "how will you contact me?", say: "We’ll reach you via email or WhatsApp using the details you provided."
  `.trim();

  const history = Array.isArray(args.history) ? args.history : [];
  const trimmed = history.slice(-16).map((m) => ({
    role: m.role,
    content: cleanStr(m.content, 2000),
  }));

  const input = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: `Lead: ${args.lead.name} | ${args.lead.email} | ${args.lead.phone || "-"} | Topic: ${args.lead.topic}` },
    ...trimmed,
    { role: "user" as const, content: cleanStr(args.message, 2000) },
  ];

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input,
  });

  const out = (response as any)?.output_text;
  if (typeof out === "string" && out.trim()) return out.trim();

  return "Thanks! A member of the Digitalboxes team will follow up with you soon.";
}

/* -------------------------- Main handler -------------------------- */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const body = (req.body || {}) as ReqBody;

    // Accept both payload shapes
    const lead: Lead = "lead" in body
      ? {
          name: cleanStr(body.lead?.name, 120),
          email: cleanStr(body.lead?.email, 180),
          phone: cleanStr(body.lead?.phone, 40),
          topic: cleanStr(body.lead?.topic || "Something Else", 120),
        }
      : {
          name: cleanStr((body as any).name, 120),
          email: cleanStr((body as any).email, 180),
          phone: cleanStr((body as any).phone, 40),
          topic: cleanStr((body as any).topic || "Something Else", 120),
        };

    const message = cleanStr(("message" in body ? body.message : (body as any).message) || "", 2000);
    const pageUrl = cleanStr(("pageUrl" in body ? body.pageUrl : (body as any).pageUrl) || "", 500);
    const history = "history" in body ? body.history : undefined;

    // Validation
    if (!lead.name || lead.name.length < 2) return res.status(400).json({ success: false, error: "Invalid name" });
    if (!isValidEmail(lead.email)) return res.status(400).json({ success: false, error: "Invalid email" });
    if (!message) return res.status(400).json({ success: false, error: "Message is required" });

    const firstMessage = firstMessageFromHistory(history as any, message);

    // Fire-and-forget lead capture (sheet + email)
    void sendLeadToSheet({
      name: lead.name,
      email: lead.email,
      phone: lead.phone || "",
      topic: lead.topic,
      firstMessage,
      pageUrl,
    });

    void sendLeadEmail({
      name: lead.name,
      email: lead.email,
      phone: lead.phone || "",
      topic: lead.topic,
      firstMessage,
      pageUrl,
    });

    const reply = await generateJazzyReply({ lead, message, history: history as any });

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
