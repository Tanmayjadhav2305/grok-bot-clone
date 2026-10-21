import type { BotApi } from "../electron/preload";

declare global {
  interface Window {
    bot: BotApi;
  }
}

export {};
