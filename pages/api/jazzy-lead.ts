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

type ApiResponse =
  | {
      success: true;
      reply: string;
      suggestedReplies?: string[];
      escalate?: boolean;
      reason?: string;
    }
  | { success: false; error: string };

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

/** Detect when user likely needs a human */
function needsHumanHandoff(text: string) {
  const t = (text || "").toLowerCase();
  const triggers = [
    "urgent",
    "asap",
    "not working",
    "broken",
    "error",
    "refund",
    "complaint",
    "call",
    "meeting",
    "quote",
    "pricing",
    "price",
    "budget",
    "invoice",
    "payment",
    "whatsapp",
  ];
  return triggers.some((k) => t.includes(k));
}

/** Topic routing + suggested replies */
function topicPlaybook(topic?: string) {
  const t = (topic || "").toLowerCase();

  if (t.includes("marketing")) {
    return {
      label: "Marketing & Services",
      suggested: ["I need more leads", "I want SEO help", "I need a website quote"],
      criticalQuestion:
        "What’s your #1 goal right now — leads, sales, traffic, or brand?",
    };
  }

  if (t.includes("free ai") || t.includes("seo tools")) {
    return {
      label: "Free AI / SEO Tools",
      suggested: ["Check my SEO", "Site speed issue", "Meta/keywords help"],
      criticalQuestion: "What’s your website URL?",
    };
  }

  return {
    label: "General",
    suggested: ["Get a quote", "Report a website issue", "Ask an SEO question"],
    criticalQuestion: "What are you trying to achieve today?",
  };
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

async function generateJazzyReply(args: Payload): Promise<{ reply: string; suggestedReplies: string[]; escalate: boolean; reason?: string }> {
  const lead = args.lead || { name: "Unknown", email: "", topic: "Something Else" };
  const history = Array.isArray(args.history) ? args.history.slice(-20) : [];
  const play = topicPlaybook(lead.topic);

  const escalate = needsHumanHandoff(args.message);

  // fallback suggested replies
  const suggestedReplies = escalate
    ? ["Human on WhatsApp", "Email support", "Send a quote request"]
    : play.suggested;

  if (!OPENAI_API_KEY) {
    return {
      reply:
        "Thanks — our AI assistant is temporarily offline.\n- A human from Digitalboxes will follow up shortly\n" +
        "What’s the best way to reach you — WhatsApp or email?",
      suggestedReplies: ["Human on WhatsApp", "Email support"],
      escalate: true,
      reason: "missing_openai_key",
    };
  }

  // 🔥 Upgraded system prompt for quality
  const systemPrompt = `
You are Jazzy, the AI assistant for Digitalboxes (digital marketing & development).

HARD RULES:
- Do NOT greet (no hi/hello/salaam). UI already greets.
- No long paragraphs. Use this structure:
  1) One-line direct answer
  2) 2–5 bullets (steps/options)
  3) End with ONLY ONE question
- Don’t ask for info the user already provided in chat history.
- If user is frustrated, acknowledge in one short line + give steps.
- If unsure, ask for ONE missing item (URL/plugin/screenshot).
- If user asks pricing/quote/meeting/urgent/broken: keep it tight and offer human handoff.

STYLE:
- Natural and human. No markdown. No robotic tone.
- Practical and actionable.

CONTEXT (use it):
- Lead name: ${lead.name}
- Email: ${lead.email}
- Phone: ${lead.phone || "Not provided"}
- Topic: ${lead.topic}
- Page URL: ${args.pageUrl || "Not provided"}
- Topic playbook: ${play.label}
`.trim();

  const userPrompt = `
User message:
${args.message || "(no message)"}

If the user didn’t provide enough context, ask ONE question.
If topic is "${play.label}" and the user is vague, default to this question:
"${play.criticalQuestion}"
`.trim();

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role as any, content: cleanStr(m.content, 3000) })),
      { role: "user", content: userPrompt },
    ],
  });

  let reply = extractReplyText(response) || "Thanks! A member of the Digitalboxes team will follow up with you soon.";

  // If escalation triggered, ensure we offer handoff in reply (without repeating greeting)
  if (escalate && !reply.toLowerCase().includes("whatsapp") && !reply.toLowerCase().includes("email")) {
    reply =
      reply +
      "\n\nIf you want, I can hand this to a human right now.\n- WhatsApp or Email?\nWhich one do you prefer?";
  }

  return { reply, suggestedReplies, escalate, reason: escalate ? "handoff_trigger" : undefined };
}

/* -------------------------- Main handler -------------------------- */

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
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
      return res.status(400).json({ success: false, error: "Invalid name" });
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

    const out = await generateJazzyReply({
      lead,
      message,
      history: Array.isArray(body.history) ? body.history : [],
      pageUrl,
    });

    return res.status(200).json({
      success: true,
      reply: out.reply,
      suggestedReplies: out.suggestedReplies,
      escalate: out.escalate,
      reason: out.reason,
    });
  } catch (err: any) {
    console.error("[Jazzy] API error:", err);
    return res.status(500).json({ success: false, error: err?.message || "Server error" });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};
