import type { NextApiRequest, NextApiResponse } from "next";

type Data =
  | { success: true; reply: string }
  | { success: false; error: string };

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method === "POST") {
    const { message } = req.body as { message?: string };

    if (!message || typeof message !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "Message is required" });
    }

    // For now just echo back. Later you can plug in OpenAI here.
    return res.status(200).json({
      success: true,
      reply: `You said: "${message}". Jazzy API is working!`,
    });
  }

  // Simple GET check (what you already saw in the browser)
  return res.status(200).json({
    success: true,
    reply: "Jazzy API is working! Use POST with { message } to chat.",
  });
}
