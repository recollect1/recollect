import { App } from "@modelcontextprotocol/ext-apps";

export function el(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/** Only inline images: cards have no network access. */
export const safeImage = (url: unknown): url is string => typeof url === "string" && /^data:image\//.test(url);

/** Connect a card to its host and re-render on every tool result. */
export async function card(name: string, render: (sc: Record<string, any>, app: App) => Node[]): Promise<void> {
  const root = document.getElementById("root")!;
  const app = new App({ name, version: "0.1.0" });
  app.ontoolresult = (r) => {
    const sc = (r.structuredContent ?? {}) as Record<string, any>;
    root.replaceChildren(...render(sc, app));
  };
  await app.connect();
  app.setupSizeChangedNotifications();
}
