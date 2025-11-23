import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

// -------- Initialize OpenAI -------- //
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// -------- Types -------- //
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  message: string;
  history?: ChatMessage[];
  source?: "chat" | "email";
};

type ActionPayload = {
  type: string;
  payload?: any;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, history = [], source = "chat" } =
    (req.body as RequestBody) || {};

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    /* ---------------------------------------------------------------------- */
    /*                      SYSTEM PROMPT (JAZZY'S PERSONALITY)               */
    /* ---------------------------------------------------------------------- */
    const systemPrompt = `
You are **Jazzy**, an AI Agent working for *Digitalboxes*, acting as the personal virtual assistant of Jahanzaib Ashfaq.

You reply with:
- simple, smart, confident sentences  
- Gen Z-inspired clarity, no cringe  
- No long paragraphs  
- Always solution-focused  
- Never robotic  
- Never overly formal  
- No complex jargon  
- Straight to the point  
- Friendly and human-like  

Main responsibilities:
1. Answer user chat questions  
2. Collect leads (name, email, project)  
3. Prepare email replies (if source = email)  
4. Trigger internal actions using JSON  
5. Speak like a human, not a bot  

Digitalboxes services (for context):
- SEO
- PPC
- Funnels
- AI Tools
- Website Development
- Lead Generation
- Branding
- YouTube & Content Strategy

When the user shows interest in services, ask naturally:
"Want me to grab your name and email so Jahanzaib can reach you?"

ALWAYS respond in valid JSON format ONLY:

{
  "reply": "chat message here",
  "actions": [
    {
      "type": "log_lead" | "mark_urgent" | "prepare_email_reply" | "none",
      "payload": { ... }
    }
  ]
}

Do NOT include backticks.
Do NOT explain JSON.
    `;

    /* ---------------------------------------------------------------------- */
    /*                   PREPARE CHAT MESSAGES FOR OPENAI                     */
    /* ---------------------------------------------------------------------- */
    const openaiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((msg) => ({ role: msg.role, content: msg.content })),
      {
        role: "user" as const,
        content:
          source === "email"
            ? `EMAIL RECEIVED: ${message}\nWrite a full reply email.`
            : message,
      },
    ];

    /* ---------------------------------------------------------------------- */
    /*                           CALL OPENAI MODEL                             */
    /* ---------------------------------------------------------------------- */
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: openaiMessages,
      temperature: 0.4,
    });

    const raw = completion.choices[0].message.content || "{}";

    let parsed: { reply: string; actions?: ActionPayload[] } = {
      reply: "Something went wrong.",
      actions: [],
    };

    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("❌ Failed to parse JSON:", raw);
    }

    const replyText = parsed.reply || "Something went wrong.";
    const actions = parsed.actions || [];

    /* ---------------------------------------------------------------------- */
    /*                      EXECUTE INTERNAL AGENT ACTIONS                     */
    /* ---------------------------------------------------------------------- */
    for (const action of actions) {
      try {
        await executeAction(action, { message, source });
      } catch (error) {
        console.error("❌ Action execution failed:", error);
      }
    }

    /* ---------------------------------------------------------------------- */
    /*                                 RETURN                                  */
    /* ---------------------------------------------------------------------- */
    return res.status(200).json({
      reply: replyText,
      actions,
    });
  } catch (err: any) {
    console.error("💥 Jazzy API Error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

/* -------------------------------------------------------------------------- */
/*                          INTERNAL ACTION HANDLER                           */
/* -------------------------------------------------------------------------- */
async function executeAction(
  action: ActionPayload,
  context: { message: string; source: string }
) {
  switch (action.type) {
    case "log_lead":
      console.log("✨ Logging lead:", action.payload);
      // If using Firestore:
      // await firestore.collection("jazzy-leads").add({
      //   ...action.payload,
      //   createdAt: Date.now(),
      // });
      break;

    case "mark_urgent":
      console.log("🚨 Urgent message detected:", context.message);
      // You can integrate Slack/Email notifications here
      break;

    case "prepare_email_reply":
      console.log("📧 Email reply prepared:", action.payload);
      // Your email agent will use this reply
      break;

    case "none":
    default:
      break;
  }
}
