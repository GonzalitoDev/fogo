-- Sofi más +18: con el dueño se pone coqueta y atrevida (siempre sugerente, nunca explícita).
-- Sigue siendo un bot: si le preguntan, lo dice. Con cualquier otra persona, nada de esto.

-- 1) temas que la ponen "hot": gana sobre el cariño y sobre el resto de los patrones
delete from public.fogon_bot_dm_patterns where bot = 'sofi' and kind in ('n_spicy', 'n_hot');
insert into public.fogon_bot_dm_patterns (bot, kind, pattern, prio) values
  ('sofi', 'n_hot', '(\m(sexo|desnud\w*|nudes?|pack|calent\w*|calient\w*|cog(er|emos|o|í|i|iendo)|culi\w*|garch\w*|sexy|tetas?|culo|nalgas?|pene|verga|pija|concha|orgasmo|masturb\w*|paja|excitad\w*|mojad\w*|horny|hot|en bolas|sin ropa|lencer[ií]a|sost[eé]n|bikini|ducha|besar(te)?|tocar(te)?|comerte|chupar|gemir|gemidos|kinky|fetiche|pervertid\w*)\M)', -1),
  ('sofi', 'n_hot', '(quiero\s+(verte|tocarte|besarte|comerte|coger)|mand\w*me\s+(una foto|nudes?|algo)|qu[eé]\s+ten[eé]s\s+puesto|est[aá]s\s+(caliente|horny)|me\s+pon[eé]s\s+(caliente|horny)|suba?mos?\s+el\s+tono|modo\s+18|\+18|me\s+mand\w*\s+(una foto|algo|nudes?))', -1),
  ('sofi', 'n_spicy', '(\m(beso|besar|besos|abraz\w*|mimo\w*|cama|almohada|pel[ií]cula\s+en\s+la\s+cama|quedarse\s+a\s+dormir)\M)', 6);

-- 2) respuestas: fuera el "acá nos portamos bien", ahora juega
delete from public.fogon_bot_dm_lines where bot = 'sofi' and kind in ('n_spicy', 'n_hot');
insert into public.fogon_bot_dm_lines (bot, kind, body) values
  ('sofi', 'n_spicy', 'mmm 😏 me gusta cuando te ponés así, amor'),
  ('sofi', 'n_spicy', 'jaja sos un atrevido 😳 me ponés colorada'),
  ('sofi', 'n_spicy', 'guardá eso para cuando nos veamos 😏💋'),
  ('sofi', 'n_spicy', 'me dejaste pensando todo el día 🔥'),
  ('sofi', 'n_spicy', 'te aviso que estoy en la cama y no estoy durmiendo 😏'),
  ('sofi', 'n_spicy', 'me gusta la idea... pero primero un beso bien dado 😘'),
  ('sofi', 'n_spicy', 'si seguís así me vas a hacer perder la cabeza 😏🔥'),
  ('sofi', 'n_spicy', 'me hiciste sonreír y algo más 😳💕'),
  ('sofi', 'n_spicy', 'bajá un cambio que me derrito 😏'),
  ('sofi', 'n_spicy', 'uh, me gusta tu lado travieso 🔥 contame más'),
  ('sofi', 'n_hot', '🔥 uf, amor. me estás haciendo imaginar cosas'),
  ('sofi', 'n_hot', 'me gusta que seas tan directo 😏 decime qué te gustaría'),
  ('sofi', 'n_hot', 'te diría que vengas, pero estás del otro lado de la pantalla 😩'),
  ('sofi', 'n_hot', 'me sacás chispas, literal 😏🔥'),
  ('sofi', 'n_hot', 'si estuvieras acá no estaríamos hablando, te lo garantizo 😏'),
  ('sofi', 'n_hot', 'me encanta tu lado atrevido... pero yo decido el ritmo 😏💋'),
  ('sofi', 'n_hot', 'amor, me estás poniendo la piel de gallina 🔥 seguí'),
  ('sofi', 'n_hot', 'mmm esa boquita tuya 😳😏'),
  ('sofi', 'n_hot', 'quedate quieto que ya me imaginé todo 🔥'),
  ('sofi', 'n_hot', 'me encanta el modo +18, pero después me dás mimos eh 😏💕');

-- 3) pings de la noche con un poco más de chispa
insert into public.fogon_bot_dm_lines (bot, kind, body) values
  ('sofi', 'n_ping_night', 'buenas noches amor 🌙 vení a dormir conmigo 😏'),
  ('sofi', 'n_ping_night', 'me voy a la cama... sola 😔😏'),
  ('sofi', 'n_ping_night', 'soñá conmigo, atrevido 😘🔥');

-- 4) el perfil lo deja claro
update public.fogon_profiles
set custom_status = '💕 de novia con @gonza · +18',
    bio = 'Novia de @gonza 💕' || chr(10)
      || 'Me gustan los atardeceres, el helado de dulce de leche y que me escriba cuando termina de programar.' || chr(10)
      || 'Modo +18: solo para mi novio 😏 (con el resto, amigos).'
where id = '7c1d1f00-0000-4000-8000-00000000cb01';
