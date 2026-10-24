"use client";

// "Fulano está escribiendo…" con Realtime Broadcast: no toca la base, solo avisa a quien tiene el canal abierto.
import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { getState } from "./store";

const TTL = 6000; // si no llega otro aviso en 6 s, deja de mostrarse
const EVERY = 2500; // cada cuánto aviso que sigo escribiendo

export function useTyping(channelId: string) {
  const [typers, setTypers] = useState<Record<string, number>>({});
  const ch = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const last = useRef(0);

  useEffect(() => {
    const c = supabase.channel(`typing:${channelId}`, { config: { broadcast: { self: false } } });
    c.on("broadcast", { event: "typing" }, ({ payload }) => {
      const uid = (payload as { user_id?: string })?.user_id;
      if (!uid || uid === getState().me?.id) return;
      const stop = (payload as { stop?: boolean }).stop;
      setTypers((t) => {
        const n = { ...t };
        if (stop) delete n[uid];
        else n[uid] = Date.now() + TTL;
        return n;
      });
    }).subscribe();
    ch.current = c;
    const tick = setInterval(() => {
      setTypers((t) => {
        const now = Date.now();
        const live = Object.entries(t).filter(([, exp]) => exp > now);
        return live.length === Object.keys(t).length ? t : Object.fromEntries(live);
      });
    }, 1000);
    return () => {
      clearInterval(tick);
      void supabase.removeChannel(c);
      ch.current = null;
      setTypers({});
    };
  }, [channelId]);

  // si llega un mensaje de alguien, deja de "escribir"
  const list = getState().messages[channelId]?.list;
  const lastAuthor = list?.[list.length - 1]?.author_id;
  useEffect(() => {
    if (lastAuthor) setTypers((t) => (t[lastAuthor] ? Object.fromEntries(Object.entries(t).filter(([k]) => k !== lastAuthor)) : t));
  }, [lastAuthor, list?.length]);

  const notify = (stop = false) => {
    const me = getState().me?.id;
    if (!me || !ch.current) return;
    const now = Date.now();
    if (!stop && now - last.current < EVERY) return;
    last.current = stop ? 0 : now;
    void ch.current.send({ type: "broadcast", event: "typing", payload: { user_id: me, stop } });
  };

  return { typers: Object.keys(typers), notify };
}

/** "Beto está escribiendo…", "Beto y Ana están escribiendo…", "Varias personas están escribiendo…" */
export function typingText(names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1) return `${names[0]} está escribiendo…`;
  if (names.length === 2) return `${names[0]} y ${names[1]} están escribiendo…`;
  if (names.length === 3) return `${names[0]}, ${names[1]} y ${names[2]} están escribiendo…`;
  return "Varias personas están escribiendo…";
}
