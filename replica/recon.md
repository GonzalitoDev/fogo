# Recon map: Discord (web)

Alcance: chat de texto en servidores. Servidores con canales agrupados en categorías, mensajes en tiempo real, @menciones, mensajes directos 1 a 1, reacciones, editar/borrar, imágenes adjuntas, respuestas.
Fuera de esta versión: voz/video, hilos y foros, roles y permisos finos, bots, Nitro, stickers.
Para: uso propio / aprender. Nombre del clon: **Fogón**.
Fecha: 2026-10-22

## Fuentes

| # | fuente | URL | notas |
| --- | --- | --- | --- |
| 1 | API pública: Message | https://docs.discord.com/developers/resources/message | campos: content (≤2000), edited_timestamp, mentions, attachments, reactions, message_reference (respuestas) |
| 2 | API pública: Channel | https://docs.discord.com/developers/resources/channel | tipos (texto, categoría, DM, grupo), name 1–100, topic, position, parent_id |
| 3 | help: invitar amigos | https://support.discord.com/hc/en-us/articles/204155938-How-do-I-invite-friends-to-my-server | invitación por link, aterriza en un canal |
| 4 | help: atajos | https://support.discord.com/hc/en-us/articles/31232432266647-Discord-Commands-Shortcuts-and-Navigation-Guide | Ctrl+K, Alt+↑↓, editar último con ↑, Esc marca leído |
| 5 | help: editar mensajes | https://support.discord.com/hc/en-us/articles/207618817-How-do-I-edit-my-messages | lápiz al pasar el mouse, Enter guarda, Esc cancela |
| 6 | help: límites | https://support.discord.com/hc/en-us/articles/33694251638295-Discord-Account-Caps-Server-Caps-and-More | 2000 caracteres, 10 MB por archivo, 500 canales, 100 servidores |
| 7 | help: categorías | https://support.discord.com/hc/en-us/articles/115001580171-Channel-Categories-101 | categorías colapsables |
| 8 | tu propia cuenta | — | conocés el producto como usuario y dev de bots |

## Core loop

Entrar a un servidor, abrir un canal y conversar en tiempo real.

## Pantallas

| ID | pantalla | ruta | propósito | componentes | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Login / registro | `/login` | entrar con email | form, magic link o contraseña | error, enviando |
| S02 | Rail de servidores | siempre (izquierda) | cambiar de servidor, ir a DMs, crear/unirse | íconos redondos, indicador de no leídos, + | activo, con no leídos, con mención |
| S03 | Lista de canales | `/s/:server` | navegar canales por categoría | nombre del servidor + menú, categorías colapsables, canales, panel de usuario abajo | no leído (negrita), con menciones (badge), activo |
| S04 | Canal | `/s/:server/:channel` | conversar | header (# nombre, tema), lista de mensajes, compositor | vacío ("bienvenido a #canal"), cargando, con historial, sin conexión |
| S05 | Mensaje | en S04/S07 | leer y actuar | avatar, nombre, hora, texto con menciones, imagen, reacciones, "(editado)", respuesta citada, barra de acciones al pasar el mouse | agrupado (mismo autor <7 min), me mencionan (resaltado), editando, borrado |
| S06 | Lista de miembros | panel derecho de S04 | ver quién está | miembros agrupados online/offline | — |
| S07 | DMs | `/dm` y `/dm/:id` | chat 1 a 1 | lista de conversaciones, buscar persona | sin DMs |
| S08 | Crear servidor | modal desde S02 | nuevo servidor | nombre, ícono (inicial) | — |
| S09 | Invitar / unirse | modal + `/invite/:code` | sumar gente | link copiable, pantalla de aceptar | código inválido |
| S10 | Ajustes de canal / servidor | modal | crear/renombrar/borrar canales y categorías | form | — |
| S11 | Selector de emoji | popover | reaccionar | grilla de emojis frecuentes | — |
| S12 | Quick switcher | Ctrl+K | saltar a canal o DM | input + resultados | sin resultados |
| S13 | Perfil propio | panel abajo de S03 | nombre visible, avatar, cerrar sesión | — | — |

## Flujos

```
F01 Registrarse y crear tu primer servidor
    S01 -> S02 (+) -> S08 -> S04 #general
    edge: email ya registrado, nombre de servidor vacío

F02 Mandar un mensaje y que el otro lo vea al instante
    S04 escribir -> Enter -> aparece en S04 de todos los miembros (realtime)
    clics: 0 (Enter)
    edge: sin conexión, 2001 caracteres, mensaje vacío, doble Enter rápido

F03 Mencionar a alguien
    S04 escribir "@" -> autocompletar miembros -> enviar -> el mencionado ve badge en S02/S03 y el mensaje resaltado
    edge: @ de alguien que no es miembro, @everyone

F04 Invitar a un amigo
    S03 menú -> S09 copiar link -> amigo abre /invite/:code -> se une -> aparece en S06
    edge: código inválido, ya es miembro

F05 Reaccionar
    S05 hover -> 😀 -> S11 -> elegir -> contador +1 en vivo; click en la reacción propia la saca

F06 Editar / borrar el propio mensaje
    S05 hover -> lápiz (o ↑ con el compositor vacío) -> Enter guarda / Esc cancela -> "(editado)"
    borrar -> confirmación (Shift+click la saltea) -> desaparece para todos

F07 Responder a un mensaje
    S05 hover -> responder -> el compositor muestra "Respondiendo a X" -> enviar -> cita arriba del mensaje

F08 Mandar una imagen
    S04 clip o pegar/arrastrar imagen -> preview -> enviar -> miniatura en el mensaje; click abre grande
    edge: >10 MB, no es imagen

F09 Mensaje directo
    S06 o S07 -> click en persona -> S07 /dm/:id -> mismo compositor y mensajes que un canal

F10 No leídos
    llega mensaje a otro canal -> canal en negrita en S03, punto en S02; abrirlo lo marca leído
```

## Componentes

| componente | variantes | estados | usado en |
| --- | --- | --- | --- |
| Ícono de servidor | imagen, inicial | activo (pill), no leído (punto), mención (badge rojo) | S02 |
| Ítem de canal | texto, categoría (colapsable) | activo, no leído, mención, hover con engranaje | S03 |
| Mensaje | primero del grupo (avatar + nombre), seguido (solo texto) | hover, editando, mención propia, pendiente de envío, error | S04, S07 |
| Compositor | canal, DM, editando, respondiendo | vacío, escribiendo, con adjunto, deshabilitado | S04, S07 |
| Autocompletar | @miembros, #canales | abierto, sin resultados | compositor |
| Chip de reacción | — | mía (resaltada), de otros | S05 |
| Avatar | imagen, inicial con color | online (punto) | todos |
| Modal | crear, invitar, ajustes, confirmar | — | S08–S10 |
| Toast | error de envío, link copiado | — | todos |

## Modelo de datos inferido

```
Profile     id (= auth user), username (único), display_name, avatar_url, created_at
            evidencia: autor de mensajes, panel de usuario
            confianza: alta

Server      id, name (1–100), icon_url, owner_id, invite_code, created_at
            evidencia: fuente 3, S08
            confianza: alta

Member      server_id, user_id, nickname, joined_at   (PK compuesta)
            evidencia: S06
            confianza: alta

Channel     id, server_id (null en DMs), kind (text | category | dm),
            name, topic, position, parent_id (categoría), created_at
            evidencia: fuente 2 (tipos 0, 4, 1; position; parent_id)
            confianza: alta

DmParticipant  channel_id, user_id   (exactamente 2 por DM)
            evidencia: fuente 2 (recipients)
            confianza: alta

Message     id, channel_id, author_id, content (≤2000), created_at, edited_at,
            reply_to_id, attachments (json: path, name, size, w, h), mentions (uuid[]),
            deleted (soft) 
            evidencia: fuente 1
            confianza: alta

Reaction    message_id, user_id, emoji   (PK compuesta)
            evidencia: fuente 1 (reactions con count y "me")
            confianza: alta

ReadState   user_id, channel_id, last_read_at, mention_count
            evidencia: F10 (negrita y badges)
            confianza: media (cómo lo guarda Discord es privado; esto es nuestra versión)
```

Relaciones: Server 1-n Channel, Server n-n Profile (Member), Channel 1-n Message, Message 1-n Reaction, Message 0-1 Message (respuesta), Channel(dm) n-n Profile (DmParticipant).

## Matriz de features

Ver `features.csv`.

## Fuera de alcance

- Voz, video, compartir pantalla, Stage: otro proyecto entero (WebRTC + servidor de medios).
- Nitro, stickers, emojis personalizados por servidor, boosts: monetización propia de Discord.
- La red: los servidores y usuarios de Discord. Tu clon arranca vacío.
- Bots y la API de bots: posible fase 2 (webhooks entrantes son fáciles).
- Marca, logo, colores y sonidos de Discord: diseño propio.

## Tamaño

Pantallas 13, flujos 10, entidades 8.

Partes difíciles:
1. **Seguridad (RLS):** cada lectura y escritura tiene que respetar membresía. Un usuario no puede leer canales de un servidor del que no es miembro ni DMs ajenos, tampoco por Realtime.
2. **Lista de mensajes:** scroll que se queda abajo cuando llegan mensajes, carga hacia arriba del historial sin saltos, agrupado por autor y envío optimista.
3. **No leídos y menciones** en varios niveles (canal, servidor, DMs) sin cientos de queries.

Tamaño: **M-L**. El slice (login + un servidor + un canal en tiempo real) es un día.
