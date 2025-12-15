// pages/_app.tsx
import type { AppProps } from "next/app";
import "../styles/globals.css";

import JazzyWidget from "../components/JazzyWidget";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      {/* Global AI Chat Widget */}
      <JazzyWidget />
    </>
  );
}
