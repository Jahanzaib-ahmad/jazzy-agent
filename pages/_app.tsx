// pages/_app.tsx
import type { AppProps } from "next/app";
import "../styles/globals.css";
import JazzyWidget from "../components/JazzyWidget";
import { useRouter } from "next/router";

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isJazzyChatPage = router.pathname === "/jazzy-chat";

  return (
    <>
      <Component {...pageProps} />
      {!isJazzyChatPage && <JazzyWidget />}
    </>
  );
}
