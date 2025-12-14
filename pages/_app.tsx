// pages/_app.tsx
import type { AppProps } from "next/app";
import "../styles/globals.css";

import JazzyWidget from "../components/JazzyWidget";
import Script from "next/script";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* Cloudflare Turnstile – loads once globally */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />

      {/* Turnstile callback (required for invisible mode) */}
      <Script id="turnstile-callback" strategy="afterInteractive">
        {`
          window.onTurnstileVerified = function(token) {
            const event = new CustomEvent("turnstile-token", { detail: token });
            window.dispatchEvent(event);
          };
        `}
      </Script>

      <Component {...pageProps} />

      {/* Global AI Chat Widget */}
      <JazzyWidget />
    </>
  );
}
