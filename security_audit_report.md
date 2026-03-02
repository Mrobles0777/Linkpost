# SECURITY AUDIT REPORT

🔐 Credenciales: [CRÍTICO]
🔐 Base de Datos Firebase: [OK]
🔐 Base de Datos Supabase: [CRÍTICO]
🔐 Arquitectura: [CRÍTICO]
🔐 Autenticación / Autorización: [CRÍTICO]
🔐 APIs / Functions: [MEDIO]
🔐 Dependencias: [OK]

RIESGO TOTAL: [ALTO]
DEPLOY RECOMENDADO: [NO]

🧩 DETALLES:

- Archivo / Componente: `vite.config.ts`, `src/services/geminiService.ts`
- Descripción del problema: La clave de la API de Gemini (`GEMINI_API_KEY`) se inyecta directamente en el bundle del frontend, exponiendo la credencial de facturación a cualquier usuario que inspeccione el código.
- Nivel de riesgo: 🔴 CRÍTICO
- Recomendación: Mueve toda la lógica de `geminiService.ts` al backend (`server.ts`) y reemplaza la llamada desde el cliente por una petición HTTP a tu propia API.

- Archivo / Componente: `server.ts` (Ruta `/api/linkedin/post`)
- Descripción del problema: El endpoint de publicación no verifica la identidad del usuario que realiza la petición originaria; obtiene el `userId` desde el `req.body`, posibilitando que un tercero malicioso publique en el perfil de LinkedIn de cualquier usuario si conoce su UUID.
- Nivel de riesgo: 🔴 CRÍTICO
- Recomendación: El backend debe recibir el token JWT de sesión de Supabase en el header `Authorization`, validarlo, y extraer el `userId` desde el token seguro, ignorando el del `body`.

- Archivo / Componente: `server.ts` (Callback LinkedIn de línea 85) y DB Supabase
- Descripción del problema: El servidor realiza un `upsert` a la tabla `profiles` mediante `SUPABASE_ANON_KEY`, sin contexto de autenticación de usuario. Si las reglas RLS de Supabase están correctamente definidas (`auth.uid() = id`), esta consulta fallará. Si el proceso de base de datos es exitoso en el entorno actual, significa que los filtros RLS están desactivados o permisivos (permitiendo escrituras anónimas globales).
- Nivel de riesgo: 🔴 CRÍTICO
- Recomendación: Modifica el cliente de Supabase alojado en `server.ts` para utilizar `SUPABASE_SERVICE_ROLE_KEY` en lugar de la `ANON_KEY`, para evadir las políticas RLS únicamente desde el entorno de servidor cerrado. Almacenar tokens crudos además merece encriptación extra.

- Archivo / Componente: API General (`/api/image/search`)
- Descripción del problema: Faltas de Rate Limiting e inyección de abuso. Los endpoints se encuentran totalmente públicos.
- Nivel de riesgo: 🟠 MEDIO
- Recomendación: Configura `express-rate-limit` con ventanas seguras de acceso en la inicialización de express.
