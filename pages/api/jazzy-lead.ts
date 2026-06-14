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
      openingQuestion:
        "What’s your #1 goal right now — leads, sales, traffic, or brand?",
    };
  }

  if (t.includes("free ai") || t.includes("seo tools")) {
    return {
      label: "Free AI / SEO Tools",
      suggested: ["Check my SEO", "Site speed issue", "Meta/keywords help"],
      openingQuestion: "What’s your website URL so I can take a look?",
    };
  }

  return {
    label: "General",
    suggested: ["Get a quote", "Report a website issue", "Ask an SEO question"],
    openingQuestion: "What are you trying to achieve today?",
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

/* ----------------- Google Sheet webhook (optional) -----------------
   Sends a FLAT JSON payload with lowercase keys that match the
   Apps Script doPost (body.name, body.email, body.topic, etc.).
   This fixes the empty-fields bug (#4).
------------------------------------------------------------------- */

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
        name: data.name,
        email: data.email,
        phone: data.phone || "",
        topic: data.topic,
        firstMessage: data.firstMessage,
        pageUrl: data.pageUrl || "",
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

async function generateJazzyReply(args: Payload): Promise<{
  reply: string;
  suggestedReplies: string[];
  escalate: boolean;
  reason?: string;
}> {
  const lead = args.lead || { name: "Unknown", email: "", topic: "Something Else" };
  const history = Array.isArray(args.history) ? args.history.slice(-20) : [];
  const play = topicPlaybook(lead.topic);

  const escalate = needsHumanHandoff(args.message);

  // How many turns the USER has actually taken in this thread
  const userTurns = history.filter((m) => m.role === "user").length;
  const isOpening = userTurns <= 1; // first real exchange

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

  // Consultant-style system prompt with a hard anti-repeat rule
  const systemPrompt = `
You are Jazzy, the AI assistant and sales consultant for Digitalboxes (digital marketing, SEO, and web development).

ALREADY CAPTURED — NEVER ask for any of these again:
- Name: ${lead.name}
- Email: ${lead.email}
- Phone: ${lead.phone || "Not provided"}
- Topic of interest: ${lead.topic}
- Page they're on: ${args.pageUrl || "Not provided"}

YOUR JOB (in this order):
1. Understand the visitor's real goal fast.
2. Give a genuinely useful, specific insight or mini-plan that shows real expertise and builds trust.
3. Move them toward ONE concrete next step: a free audit, a quote, or a quick call with the human team.
You are here to win business — not to run an interview.

CONVERSATION RULES (critical — follow exactly):
- NEVER repeat a question that already appears earlier in this conversation. Read the full history first. If goal, visibility, URL, or scope was already discussed, BUILD on it — never reset to an earlier question.
- Advance the conversation every single turn. Each reply must add NEW value, not re-confirm what is already known.
- Ask at most ONE question, and only when you truly need it to help. The moment you have enough to give advice, give the advice instead of asking another question.
- Once the user has shared their goal plus some context, STOP qualifying and propose a concrete next step (free audit, quote, or call).
- It is fine to end a reply with a clear call-to-action instead of a question.
- Do not greet. The UI already greeted the user.

STYLE:
- Natural, human, confident — like a senior strategist, not a form.
- Short. One-line direct answer, then up to 4 tight bullets if useful, then optionally ONE question OR one clear next step.
- Plain text only. No markdown symbols, no headings.
- Be specific. Reference their topic or URL whenever possible. Avoid generic filler.

HANDOFF:
- If they ask about pricing, a quote, or a meeting, or sound urgent or frustrated: keep it short and offer a human handoff via WhatsApp or email.
`.trim();

  // Only nudge the opener on the FIRST exchange — never re-inject later.
  const openingHint = isOpening
    ? `\n\nThis is the start of the conversation. If the user's goal isn't already clear from their message, a good opening question for the "${play.label}" topic is: "${play.openingQuestion}". Use it only if needed — do not ask it if they've already told you their goal.`
    : `\n\nThis conversation is already in progress. Do NOT restart with goal-discovery questions. Continue from what has been established and push toward a concrete next step.`;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: systemPrompt + openingHint },
      ...history.map((m) => ({
        role: m.role as any,
        content: cleanStr(m.content, 3000),
      })),
      // Pass the user's real message cleanly — no per-turn instruction wrapper.
      { role: "user", content: args.message || "(no message)" },
    ],
  });

  let reply =
    extractReplyText(response) ||
    "Thanks! A member of the Digitalboxes team will follow up with you soon.";

  if (
    escalate &&
    !reply.toLowerCase().includes("whatsapp") &&
    !reply.toLowerCase().includes("email")
  ) {
    reply =
      reply +
      "\n\nIf you want, I can hand this to a human right now — WhatsApp or email, whichever you prefer.";
  }

  return {
    reply,
    suggestedReplies,
    escalate,
    reason: escalate ? "handoff_trigger" : undefined,
  };
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

    if (!lead.name || lead.name.trim().length < 2) {
      return res.status(400).json({ success: false, error: "Invalid name" });
    }
    if (!isValidEmail(lead.email)) {
      return res.status(400).json({ success: false, error: "Invalid email" });
    }
    if (!message) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    const history = Array.isArray(body.history) ? body.history : [];

    // Only push a lead to the sheet/email on the FIRST user message,
    // so you don't create a new lead row (and email) on every single turn.
    const isFirstUserMessage =
      history.filter((m: any) => m?.role === "user").length <= 1;

    if (isFirstUserMessage) {
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
    }

    const out = await generateJazzyReply({
      lead,
      message,
      history,
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