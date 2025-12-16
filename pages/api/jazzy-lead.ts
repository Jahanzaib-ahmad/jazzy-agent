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

type Payload = {
  lead: Lead;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  pageUrl?: string;
};

/* -------------------- helpers -------------------- */

function cleanStr(v: any, max = 5000) {
  return String(v ?? "")
    .replace(/\u0000/g, "")
    .slice(0, max)
    .trim();
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

async function sendLeadToSheet(data: {
  name: string;
  email: string;
  phone?: string;
  topic: string;
  firstMessage: string;
  pageUrl?: string;
}) {
  if (!LEADS_WEBHOOK_URL) return;

  try {
    await fetch(LEADS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: JSON.stringify({
          timestamp: new Date().toISOString(),
          Name: data.name,
          Email: data.email,
          Phone: data.phone || "",
          Topic: data.topic,
          "First Message": data.firstMessage,
          PageURL: data.pageUrl || "",
          Status: "Open",
        }),
      }),
    });
  } catch (err) {
    console.error("[Jazzy] Failed to push lead to Google Sheet:", err);
  }
}

/* ----------------------- SMTP email notify ------------------------- */

async function sendLeadEmail(data: {
  name: string;
  email: string;
  phone?: string;
  topic: string;
  message: string;
  pageUrl?: string;
}) {
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

async function generateJazzyReply(args: Payload): Promise<string> {
  if (!OPENAI_API_KEY) {
    return (
      "Thanks for your message! Our AI assistant is temporarily offline, " +
      "but a human from Digitalboxes will follow up with you shortly."
    );
  }

  // ✅ IMPORTANT: no greeting in prompt (UI handles first greeting)
  const systemPrompt = `
You are Jazzy, the AI assistant for Digitalboxes (digital marketing & development agency).

Hard rules:
- Do NOT greet the user (no hi/hello/salaam/assalam). The UI already greets.
- Do NOT repeat introductions.
- Do NOT ask for details the user already provided earlier in the chat.
- If the user says "I already shared this", acknowledge and summarize what they provided.
- Ask at most ONE follow-up question only if something critical is missing.
- Keep replies short, natural, and non-robotic. No markdown.
`.trim();

  const lead = args.lead || { name: "Unknown", email: "", topic: "Something Else" };

  const history = Array.isArray(args.history) ? args.history.slice(-20) : [];

  const userPrompt = `
Lead details:
- Name: ${lead.name || "Unknown"}
- Email: ${lead.email || "Not provided"}
- Phone: ${lead.phone || "Not provided"}
- Topic: ${lead.topic || "Not specified"}

User message:
${args.message || "(no message)"}
`.trim();

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role as any, content: m.content })),
      { role: "user", content: userPrompt },
    ],
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
    // ✅ Accept both old and new payload shapes
    const body = req.body || {};

    const leadObj = body.lead || {
      name: body.name,
      email: body.email,
      phone: body.phone,
      topic: body.topic,
    };

    const lead: Lead = {
      name: cleanStr(leadObj?.name, 120),
      email: cleanStr(leadObj?.email, 200),
      phone: cleanStr(leadObj?.phone, 30),
      topic: cleanStr(leadObj?.topic || "Something Else", 80),
    };

    const message = cleanStr(body.message, 4000);
    const pageUrl = body.pageUrl ? cleanStr(body.pageUrl, 2000) : undefined;

    // Validation
    if (!lead.name || lead.name.trim().length < 2) {
  return res.status(400).json({
    success: false,
    error: "Invalid name",
  });
}
    if (!isValidEmail(lead.email)) {
      return res.status(400).json({ success: false, error: "Invalid email" });
    }
    if (!message) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    // Fire-and-forget lead capture (sheet + email)
    void sendLeadToSheet({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      topic: lead.topic,
      firstMessage: message,
      pageUrl,
    });

    void sendLeadEmail({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      topic: lead.topic,
      message,
      pageUrl,
    });

    const reply = await generateJazzyReply({
      lead,
      message,
      history: Array.isArray(body.history) ? body.history : [],
      pageUrl,
    });

    return res.status(200).json({ success: true, reply });
  } catch (err: any) {
    console.error("[Jazzy] API error:", err);
    return res.status(500).json({ success: false, error: err?.message || "Server error" });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};
