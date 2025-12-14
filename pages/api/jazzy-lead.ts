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

type LeadPayload = {
  name: string;
  email: string;
  topic: string;
  message: string;
  pageUrl?: string;
};

/* -------------------- helpers -------------------- */

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
  // Best case: SDK convenience
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  // Fallback: scan output blocks
  const output = response?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          // Common shapes
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
          ...data,
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
        <p><strong>Topic:</strong> ${safeTopic}</p>
        <p><strong>Message:</strong><br/>${safeMsg || "-"}</p>
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

async function generateJazzyReply(data: LeadPayload): Promise<string> {
  if (!OPENAI_API_KEY) {
    return (
      "Thanks for your message! Our AI assistant is temporarily offline, " +
      "but a human from Digitalboxes will follow up with you shortly."
    );
  }

  const systemPrompt = `
You are Jazzy, the friendly AI assistant for Digitalboxes (a digital marketing
and development agency). Your goals:
- Be clear, helpful, and concise.
- Answer in simple, conversational English.
- If the user is asking about services, briefly explain how Digitalboxes can help
  and encourage them that a human will follow up by email.
- Never promise exact prices or timelines; keep it high level.
- If information is missing, ask 1–2 simple follow-up questions.
  `.trim();

  const userPrompt = `
User details:
- Name: ${data.name || "Unknown"}
- Email: ${data.email || "Not provided"}
- Topic: ${data.topic || "Not specified"}

User message:
${data.message || "(no message entered)"}
  `.trim();

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const reply = extractReplyText(response);
  return (
    reply ||
    "Thanks for the details! A member of the Digitalboxes team will review this and follow up with you soon."
  );
}

/* -------------------------- Main handler -------------------------- */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { name, email, topic, message, pageUrl } = req.body || {};

    const lead: LeadPayload = {
      name: (name || "").toString().trim(),
      email: (email || "").toString().trim(),
      topic: (topic || "Something Else").toString().trim(),
      message: (message || "").toString().trim(),
      pageUrl: pageUrl ? pageUrl.toString() : undefined,
    };

    // Basic validation so junk doesn’t hit OpenAI / email
    if (!lead.name || lead.name.length < 3) {
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
