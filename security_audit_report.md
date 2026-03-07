# SECURITY AUDIT REPORT
**Auditor:** Antigravity AI Secure Code Auditor

🔐 **Credenciales:** [CRÍTICO]
🔐 **Base de Datos Firebase:** [OK] (No se utiliza Firebase, todo corre en Supabase)
🔐 **Base de Datos Supabase:** [MEDIO]
🔐 **Arquitectura:** [CRÍTICO]
🔐 **Autenticación / Autorización:** [MEDIO]
🔐 **APIs / Functions:** [CRÍTICO]
🔐 **Dependencias:** [OK]

---
**RIESGO TOTAL:** [ALTO]
**DEPLOY RECOMENDADO:** [NO]
---

## 🧩 DETALLES DE VULNERABILIDADES

### 1. Fuga de Claves de API (API Key Exposure)
- **Archivo / Componente:** `vite.config.ts`, `src/services/geminiService.ts`
- **Descripción del problema:** La clave secreta de Gemini (`GEMINI_API_KEY`) está siendo inyectada forzosamente en el frontend a través de la propiedad `define` en `vite.config.ts` (`process.env.GEMINI_API_KEY`), y es utilizada directamente por la librería de Gemini dentro de `geminiService.ts`. Cualquier usuario puede inspeccionar el código fuente del navegador en producción y extraer tu API Key, consumiendo tus fondos de facturación o cuotas.
- **Nivel de riesgo:** 🔴 CRÍTICO
- **Recomendación:** Se DEBE mover toda la lógica que invoca el SDK de Gemini (`@google/genai`) y la generación de prompts hacia el backend (dentro de `server.ts`). El frontend debe limitarse a hacer un `GET` o `POST` a tu servidor, el cual guardará localmente la Key en su sistema seguro y se comunicará con Gemini.

### 2. Endpoints Backend Sin Autorización de Sesión Requerida (Impersonation)
- **Archivo / Componente:** `server.ts` (rutas `/api/linkedin/post` y `/api/auth/linkedin/status`)
- **Descripción del problema:** Los endpoints reciben un `userId` en el payload/query. Dependen únicamente de este `userId` para buscar tokens en DB y ejecutar acciones críticas en LinkedIn. No hay verificación o validación de Bearer Token JWT (Auth real) de Supabase que confirme que quien hace la petición HTTP es realmente el dueño del ID especificado. Un atacante malicioso podría interceptar -o adivinar- el ID UUID de cualquier usuario y enviar posts automatizados a nombre de esa víctima.
- **Nivel de riesgo:** 🔴 CRÍTICO
- **Recomendación:** Validar los requests mediante autenticación real. Extraer el token Bearer desde el header (`Authorization: Bearer <TOKEN>`), y usar `supabase.auth.getUser(token)` para confirmar que el UID del token encriptado sea idéntico al que intenta postear.

### 3. Vulnerabilidad RLS de Supabase con UPSERT Directo desde Cliente
- **Archivo / Componente:** `src/App.tsx` (Función `saveProfileToSupabase` y otras)
- **Descripción del problema:** El cliente realiza un `upsert` a la tabla `profiles` empleando la `VITE_SUPABASE_ANON_KEY`. Si en el panel de control de Supabase el RLS (Row Level Security) admite inserciones y actualizaciones anónimas, esto resultaría en permitirle a cualquier persona reescribir la información o tokens de otros perfiles.
- **Nivel de riesgo:** 🟠 MEDIO
- **Recomendación:** Constatar en el panel de Supabase SQL que la tabla `profiles` tiene RLS habilitado, y en su policy definir: `(auth.uid() = id)` forzando que solo el verdadero dueño autenticado pueda editar su row. Alternativamente, puedes forzar estas actualizaciones mediante el `server.ts` haciendo uso del `SUPABASE_SERVICE_ROLE_KEY` del lado del servidor.

### 4. Dependencias Huérfanas
- **Archivo / Componente:** `package.json`
- **Descripción del problema:** Contiene `better-sqlite3` pero no está siendo instanciado ni requerido de forma real en los archivos de la app ni del backend. Esto resulta en vulnerabilidades colaterales innecesarias, un mayor tamaño del instalable o problemas de Docker.
- **Nivel de riesgo:** 🟢 BAJO / INFORMATIVO
- **Recomendación:** Retirar `better-sqlite3` si ya no se utiliza la base de datos local pre-Supabase.
