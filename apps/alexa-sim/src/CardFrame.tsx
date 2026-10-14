import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import { useEffect, useRef, useState } from 'react';
import { api, type CardRef, type Role } from './api.ts';
import { FallbackCard } from './FallbackCard.tsx';

// Hosts an MCP Apps card (ui:// resource) in a sandboxed iframe via AppBridge.
// Falls back to plain HTML from structuredContent if the card cannot start.

export function CardFrame({ card, role, onCardMessage }: { card: CardRef; role: Role; onCardMessage: (text: string) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [height, setHeight] = useState(360);

  useEffect(() => {
    let alive = true;
    setHtml(null);
    setFailed(false);
    api.resource(role, card.resourceUri).then((r) => alive && setHtml(r.html)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [card, role]);

  useEffect(() => {
    const iframe = ref.current;
    if (!html || !iframe) return;
    const bridge = new AppBridge(null, { name: 'Recollect Alexa+ simulator', version: '0.1.0' }, { serverTools: {}, message: { text: {} }, logging: {} });
    let initialized = false;
    const giveUp = setTimeout(() => { if (!initialized) setFailed(true); }, 3000);

    bridge.oninitialized = () => {
      initialized = true;
      clearTimeout(giveUp);
      void bridge.sendToolInput({ arguments: card.args });
      void bridge.sendToolResult(card.result as never);
    };
    bridge.onsizechange = ({ height: h }) => { if (h) setHeight(Math.min(Math.max(h, 160), 900)); };
    bridge.onmessage = async (params) => {
      const text = (params.content as { type: string; text?: string }[]).map((c) => c.text ?? '').join(' ');
      onCardMessage(text);
      return {};
    };
    bridge.oncalltool = async (params) => {
      const rec = await api.tool(role, params.name, (params.arguments ?? {}) as Record<string, unknown>);
      return rec.result as never;
    };

    // Connect before loading: the card's module script sends `initialize` as soon as it runs.
    // The iframe's WindowProxy is stable across the srcdoc navigation.
    const w = iframe.contentWindow!;
    void bridge.connect(new PostMessageTransport(w, w)).then(() => { iframe.srcdoc = html; });
    return () => {
      clearTimeout(giveUp);
      // Ask the card to tear down; the iframe is removed either way, so don't wait on the reply.
      void bridge.teardownResource({}, { timeout: 500 }).catch(() => {});
    };
  }, [html, card, role, onCardMessage]);

  if (failed) return <FallbackCard card={card} />;
  return (
    <iframe
      ref={ref}
      title={card.toolName === 'whats_today' ? 'Today card' : 'Story card'}
      sandbox="allow-scripts"
      className="card-frame"
      style={{ height }}
    />
  );
}
