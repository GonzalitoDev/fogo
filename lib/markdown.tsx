import type { ReactNode } from "react";

/*
 * Markdown chico y seguro (nunca HTML crudo):
 *   ```bloque```, `código`, **negrita**, *cursiva* / _cursiva_, ~~tachado~~, links http(s), @usuario
 */

export type Token =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "block"; v: string }
  | { t: "bold"; c: Token[] }
  | { t: "italic"; c: Token[] }
  | { t: "strike"; c: Token[] }
  | { t: "link"; href: string }
  | { t: "mention"; username: string }
  | { t: "br" };

type Rule = { re: RegExp; atWordStart: boolean; make: (m: RegExpExecArray) => Token };

const RULES: Rule[] = [
  { re: /^`([^`\n]+)`/, atWordStart: false, make: (m) => ({ t: "code", v: m[1] }) },
  { re: /^\*\*([\s\S]+?)\*\*/, atWordStart: false, make: (m) => ({ t: "bold", c: inline(m[1]) }) },
  { re: /^~~([\s\S]+?)~~/, atWordStart: false, make: (m) => ({ t: "strike", c: inline(m[1]) }) },
  { re: /^\*([^*\n]+?)\*/, atWordStart: false, make: (m) => ({ t: "italic", c: inline(m[1]) }) },
  // _cursiva_, links y @menciones solo al empezar una palabra: no rompen snake_case ni emails
  { re: /^_([^_\n]+?)_(?![A-Za-z0-9])/, atWordStart: true, make: (m) => ({ t: "italic", c: inline(m[1]) }) },
  { re: /^https?:\/\/[^\s<>]*[^\s<>().,;:!?'"]/, atWordStart: true, make: (m) => ({ t: "link", href: m[0] }) },
  { re: /^@([A-Za-z0-9_](?:[A-Za-z0-9_.]{0,30}[A-Za-z0-9_])?)/, atWordStart: true, make: (m) => ({ t: "mention", username: m[1].toLowerCase() }) },
];

function pushText(out: Token[], v: string) {
  const last = out[out.length - 1];
  if (last && last.t === "text") last.v += v;
  else out.push({ t: "text", v });
}

export function inline(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === "\n") {
      out.push({ t: "br" });
      i++;
      continue;
    }
    const rest = src.slice(i);
    const wordStart = i === 0 || !/[A-Za-z0-9_.]/.test(src[i - 1]);
    let matched = false;
    for (const rule of RULES) {
      if (rule.atWordStart && !wordStart) continue;
      const m = rule.re.exec(rest);
      if (m) {
        out.push(rule.make(m));
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      pushText(out, src[i]);
      i++;
    }
  }
  return out;
}

export function parse(src: string): Token[] {
  const out: Token[] = [];
  const re = /```(?:[a-z0-9]+\n)?([\s\S]*?)```/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(...inline(src.slice(last, m.index)));
    out.push({ t: "block", v: m[1].replace(/^\n|\n$/g, "") });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(...inline(src.slice(last)));
  return out;
}

export function render(
  tokens: Token[],
  ctx: { mentionLabel: (username: string) => { label: string; me: boolean } | null },
  key = "k",
): ReactNode[] {
  return tokens.map((tk, i) => {
    const k = `${key}.${i}`;
    switch (tk.t) {
      case "text":
        return tk.v;
      case "br":
        return <br key={k} />;
      case "code":
        return (
          <code key={k} className="md-code">
            {tk.v}
          </code>
        );
      case "block":
        return (
          <pre key={k} className="md-block">
            <code>{tk.v}</code>
          </pre>
        );
      case "bold":
        return <strong key={k}>{render(tk.c, ctx, k)}</strong>;
      case "italic":
        return <em key={k}>{render(tk.c, ctx, k)}</em>;
      case "strike":
        return <s key={k}>{render(tk.c, ctx, k)}</s>;
      case "link":
        return (
          <a key={k} href={tk.href} target="_blank" rel="noopener noreferrer nofollow">
            {tk.href}
          </a>
        );
      case "mention": {
        const info = ctx.mentionLabel(tk.username);
        if (!info) return `@${tk.username}`;
        return (
          <span key={k} className={`mention${info.me ? " me" : ""}`}>
            @{info.label}
          </span>
        );
      }
    }
  });
}

/** Solo emojis (hasta 3): se muestran grandes, como en los chats */
export function isJumbo(src: string): boolean {
  const s = src.trim();
  if (!s || s.length > 24) return false;
  return /^(\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,3}$/u.test(s);
}
