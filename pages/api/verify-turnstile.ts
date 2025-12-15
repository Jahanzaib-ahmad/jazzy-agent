// pages/api/verify-turnstile.ts
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: { bodyParser: { sizeLimit: "256kb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ success: false });

    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ success: false, error: "Missing token" });

    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      return res.status(500).json({
        success: false,
        error: "Missing TURNSTILE_SECRET_KEY in server env",
      });
    }

    const ip =
      (req.headers["cf-connecting-ip"] as string) ||
      (req.headers["x-forwarded-for"] as string) ||
      "";

    const form = new URLSearchParams();
    form.append("secret", secret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip.split(",")[0].trim());

    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const data = await r.json();

    // Cloudflare uses { success: boolean, ... }
    return res.status(200).json({ success: !!data?.success, data });
  } catch (e) {
    console.error("verify-turnstile error:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
