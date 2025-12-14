// pages/api/jazzy-chat.ts
export { default } from "./jazzy-lead";
export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};
