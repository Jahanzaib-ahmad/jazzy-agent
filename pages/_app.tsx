import type { AppProps } from "next/app";
import "../styles/globals.css";

// Import Jazzy widget
import JazzyWidget from "../components/JazzyWidget";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <JazzyWidget />
    </>
  );
}
