"use client";

import { useMemo, useState } from "react";
import { BOOSTS_PER_USER, LEVELS, boostLevel, nextLevel } from "@/lib/boost";
import { friendlyError } from "@/lib/chat";
import { boostServer, serverBoosters, toast, unboostServer, useStore } from "@/lib/store";
import { Avatar, Modal } from "./ui";
import { Icon } from "./Icon";
import { Name } from "./Name";

/** Gema de boost (rosa, como la de Discord). */
export function BoostGem({ className, title }: { className?: string; title?: string }) {
  return (
    <svg className={`boost-gem${className ? ` ${className}` : ""}`} viewBox="0 0 16 16" width="14" height="14" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d="M8 1.5 13.5 6 8 14.5 2.5 6z" fill="currentColor" />
      <path d="M8 1.5 10.5 6 8 14.5 5.5 6z" fill="#fff" opacity=".35" />
      <path d="M2.5 6h11" stroke="#fff" strokeOpacity=".5" strokeWidth=".8" />
    </svg>
  );
}

export function BoostDialog({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const server = useStore((s) => s.servers[serverId]);
  const me = useStore((s) => s.me);
  const boosts = useStore((s) => s.boosts);
  const profiles = useStore((s) => s.profiles);
  const state = useStore((s) => s);
  const [busy, setBusy] = useState(false);
  const boosters = useMemo(() => serverBoosters(state, serverId), [state, serverId]);
  if (!server || !me) return null;

  const count = server.boost_count ?? 0;
  const level = boostLevel(count);
  const nx = nextLevel(count);
  const mine = boosts.filter((b) => b.user_id === me.id);
  const used = mine.filter((b) => b.server_id).length;
  const free = me.premium ? BOOSTS_PER_USER - used : 0;
  const mineHere = mine.filter((b) => b.server_id === serverId).length;
  const pct = Math.min(100, (count / LEVELS[LEVELS.length - 1].need) * 100);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label={`Boostear ${server.name}`} onClose={onClose}>
      <div className="boost-dlg">
        <div className="boost-hero">
          <BoostGem className="big" />
          <h2>{server.name}</h2>
          {server.is_partner && (
            <span className="partner-tag">
              <Icon name="check" /> Partner oficial
            </span>
          )}
          <p>
            {level ? (
              <>
                <b>Nivel {level}</b> · {count} {count === 1 ? "boost" : "boosts"}
              </>
            ) : (
              <>
                {count} {count === 1 ? "boost" : "boosts"} · todavía sin nivel
              </>
            )}
          </p>
        </div>

        <div className="boost-bar" aria-label={`${count} de ${LEVELS[LEVELS.length - 1].need} boosts`}>
          <div className="boost-fill" style={{ width: `${pct}%` }} />
          {LEVELS.map((l) => (
            <span key={l.level} className={`boost-mark${count >= l.need ? " on" : ""}`} style={{ left: `${(l.need / LEVELS[LEVELS.length - 1].need) * 100}%` }}>
              <span>Nivel {l.level}</span>
            </span>
          ))}
        </div>
        <p className="hint boost-next">{nx ? `Faltan ${nx.missing} ${nx.missing === 1 ? "boost" : "boosts"} para el Nivel ${nx.level}.` : "¡Nivel máximo! 🎉"}</p>

        <div className="boost-levels">
          {LEVELS.map((l) => (
            <div key={l.level} className={`boost-level${level >= l.level ? " on" : ""}`}>
              <h3>
                {level >= l.level ? "✅" : "🔒"} Nivel {l.level} <small>{l.need} boosts</small>
              </h3>
              <ul>
                {l.perks.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <h3 className="boost-sub">Boosters {Object.keys(boosters).length ? `· ${Object.keys(boosters).length}` : ""}</h3>
        {(server.is_partner || Object.keys(boosters).length > 0) && (
          <div className="boost-people">
            {server.is_partner && (
              <div className="boost-person official">
                <span className="boost-official-logo">{server.icon_url ? <img src={server.icon_url} alt="" /> : <BoostGem />}</span>
                <b>Fogón Oficial</b>
                <span className="boost-n">
                  <BoostGem /> ×14
                </span>
              </div>
            )}
            {Object.entries(boosters).map(([uid, n]) => (
              <div key={uid} className="boost-person">
                <Avatar p={profiles[uid]} size="sm" />
                {profiles[uid] ? <Name p={profiles[uid]} /> : <span>…</span>}
                <span className="boost-n">
                  <BoostGem /> ·{n}
                </span>
              </div>
            ))}
          </div>
        )}
        {!server.is_partner && !Object.keys(boosters).length && <p className="hint">Nadie boosteó este servidor todavía. ¡Sé el primero!</p>}

        <div className="boost-mine">
          {me.premium ? (
            <p>
              💎 Tenés <b>{free}</b> de {BOOSTS_PER_USER} boosts libres{mineHere ? ` · ${mineHere} en este servidor` : ""}.
              {free === 0 && !mineHere && " Sacá uno de otro servidor para pasarlo a este."}
            </p>
          ) : (
            <p>Los boosts vienen con <b>Fogón Premium</b> 💎: cada cuenta Premium tiene {BOOSTS_PER_USER} para darle a los servidores que quiera.</p>
          )}
        </div>
        <div className="foot">
          {mineHere > 0 && (
            <button className="btn ghost" disabled={busy} onClick={() => void run(() => unboostServer(serverId), "Sacaste un boost del servidor")}>
              Quitar mi boost
            </button>
          )}
          <button className="btn boost-btn" disabled={busy || free <= 0} onClick={() => void run(() => boostServer(serverId), `💎 ¡Boosteaste ${server.name}!`)}>
            <BoostGem /> {busy ? "…" : "Boostear este servidor"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
