// pages/api/verify-turnstile.ts
import type { NextApiRequest, NextApiResponse } from "next";

const { TURNSTILE_SECRET_KEY } = process.env;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    if (!TURNSTILE_SECRET_KEY) {
      return res
        .status(500)
        .json({ success: false, error: "Missing TURNSTILE_SECRET_KEY" });
    }

    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ success: false, error: "Missing token" });
    }

    const ip =
      (req.headers["cf-connecting-ip"] as string) ||
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress;

    const formData = new URLSearchParams();
    formData.append("secret", TURNSTILE_SECRET_KEY);
    formData.append("response", token);
    if (ip) formData.append("remoteip", ip);

    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const data = await resp.json();

    if (!data?.success) {
      return res.status(200).json({
        success: false,
        error: data?.["error-codes"]?.[0] || "Turnstile verification failed",
      });
    }

    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error("[verify-turnstile] error:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
  },
};
