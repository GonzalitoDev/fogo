"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Cloudflare Turnstile (CAPTCHA invisible con IA). Renderiza el widget y expone
 * el token por handle imperativo para que el formulario lo mande a Supabase Auth.
 *
 * Si no hay `siteKey` configurada, no renderiza nada y el login queda como antes
 * (sin verificación). Esto permite desplegar el código y activar Turnstile después.
 */

type TurnstileWidget = {
  render: (
    container: HTMLElement,
    opts: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileWidget;
  }
}

export type TurnstileHandle = {
  /** Token actual del widget ("" si todavía no se verificó). */
  getToken: () => string;
  /** Reinicia el widget para pedir un token nuevo (después de usarlo). */
  reset: () => void;
};

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const Turnstile = forwardRef<TurnstileHandle, { siteKey?: string; onToken?: (t: string) => void }>(
  function Turnstile({ siteKey, onToken }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const tokenRef = useRef("");
    const cbRef = useRef(onToken);
    cbRef.current = onToken;

    const setToken = (t: string) => {
      tokenRef.current = t;
      cbRef.current?.(t);
    };

    useImperativeHandle(ref, () => ({
      getToken: () => tokenRef.current,
      reset: () => {
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
        setToken("");
      },
    }));

    useEffect(() => {
      if (!siteKey) return;
      const el = containerRef.current;
      if (!el) return;
      let cancelled = false;

      const render = () => {
        if (cancelled || !window.turnstile) return;
        if (widgetId.current) window.turnstile.remove(widgetId.current);
        widgetId.current = window.turnstile.render(el, {
          sitekey: siteKey,
          theme: "dark",
          callback: (token) => setToken(token),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
      };

      if (window.turnstile) {
        render();
      } else {
        const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
        if (!existing) {
          const s = document.createElement("script");
          s.src = SCRIPT;
          s.async = true;
          s.defer = true;
          s.onload = render;
          document.head.appendChild(s);
        }
      }

      return () => {
        cancelled = true;
        if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      };
    }, [siteKey]);

    if (!siteKey) return null;
    return <div ref={containerRef} />;
  }
);
