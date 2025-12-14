// pages/api/verify-turnstile.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ success: false, error: "No token provided" });
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      console.error("Missing TURNSTILE_SECRET_KEY");
      return res.status(500).json({
        success: false,
        error: "Missing TURNSTILE_SECRET_KEY on server",
      });
    }

    const ip =
      (req.headers["cf-connecting-ip"] as string) ||
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "";

    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (ip) formData.append("remoteip", ip);

    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      }
    );

    const data: any = await verifyRes.json();

    if (data?.success !== true) {
      return res.status(400).json({ success: false, result: data });
    }

    return res.status(200).json({ success: true, result: data });
  } catch (err: any) {
    console.error("Turnstile verify error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Internal server error",
    });
  }
}
