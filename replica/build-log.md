# Build log: Fogón

| parte | estado | notas |
| --- | --- | --- |
| Esquema Supabase (8 tablas fogon_*, RLS, Realtime, bucket) | done | migraciones en supabase/migrations, aplicadas al proyecto personal |
| Login / registro / perfil | done | email + contraseña; perfil con @usuario y color |
| Servidores: crear, invitar por link, unirse, renombrar, borrar, salir, echar | done | |
| Canales y categorías (dueño) | done | slug estilo Discord, orden numérico |
| Mensajes en tiempo real + historial paginado | done | envío optimista, reintento si falla |
| @menciones | done | se calculan en la base (no se pueden falsificar) |
| DMs 1 a 1 | done | se abren desde miembros, autor o @usuario |
| Reacciones, editar (↑), borrar (Shift+clic sin confirmar) | done | |
| Responder citando | done | |
| Imágenes (botón, pegar, arrastrar) | done | bucket privado, URLs firmadas 1 h, ≤10 MB, hasta 4 |
| No leídos y menciones | done | canales: menciones; DMs: todos los mensajes |
| Ctrl+K, Ctrl+U, Alt+↑↓ | done | |
| Celular | done | menú lateral deslizable |

## Verificación

- `npm test`: 13 tests (markdown seguro, agrupado, compositor, árbol de canales).
- Recorrido de la UI con Supabase simulado (`replica/ui-mock-test.js`): 22/23; el que falló era la expectativa del test.
- Prueba de RLS en la base: escrita, no corrió (el conector cancela escrituras en auth.users). Pendiente: probar con dos cuentas reales.
- Sin probar todavía con Supabase real: Realtime entre dos navegadores, subida de imágenes, emails de confirmación.
