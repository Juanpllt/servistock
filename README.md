# Servistock — Sistema de gestión de inventario (Servingeniería)

Aplicación web/móvil (PWA) para controlar el inventario de la bodega de Servingeniería: productos con QR,
pedidos, entradas, salidas por proyecto, historial, notificaciones de stock bajo y exportación a Excel.

- **Frontend:** Angular (PWA, RxJS, escáner QR con la cámara) — carpeta `frontend/`
- **Backend:** Express + Node.js + PostgreSQL, JWT, Socket.IO (tiempo real), ExcelJS — carpeta `backend/`
- **Decisiones de arquitectura (ADR):** el stock se actualiza en una transacción ACID y **solo después del COMMIT** se
  publica el evento en tiempo real. La validación de stock ocurre siempre en el backend, con bloqueo de filas.

## Cuentas de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@correo.com` | `123456` |
| Empleado | `pepe@correo.com` | `pepe123` |

> Cambia estas contraseñas antes de usar el sistema con datos reales (pantalla **Mi cuenta**).

---

## 1. Ejecutar en tu computador (desarrollo)

Necesitas Node.js 22+ y PostgreSQL.

```powershell
# Terminal 1: backend  (copia backend/.env.example a backend/.env y completa DB_PASSWORD y JWT_SECRET)
cd backend
npm install
npm run dev            # crea la base de datos y las tablas si no existen

# Terminal 2: frontend
cd frontend
npm install
npm start              # abre http://localhost:4200  (el proxy reenvía /api al backend en el puerto 3000)
```

Documentación interactiva de la API (Swagger): http://localhost:3000/api/docs

## 2. Ejecutar todo con Docker

```powershell
copy .env.example .env         # y cambia POSTGRES_PASSWORD y JWT_SECRET
docker compose up -d --build   # base de datos + aplicación
```

Abre http://localhost:8080. Los datos se guardan en el volumen `pgdata` (siguen ahí aunque apagues los contenedores).
`docker compose down` apaga; `docker compose down -v` apaga **y borra los datos**.

La imagen es única: el backend sirve también el frontend compilado, con política de seguridad de contenido (CSP).

## 3. API Gateway con Kong

Kong recibe todo el tráfico y lo reenvía al backend (límite de 300 peticiones/minuto por IP, `X-Request-Id`
para trazabilidad, tope de tamaño de petición).

- **Con Docker Compose:** `docker compose --profile gateway up -d --build` → http://localhost:8100
- **Delante del backend local (puerto 3000):** `docker compose -f docker-compose.kong.yml up -d` → http://localhost:8000
  y en `frontend` usa `npm run start:kong` en vez de `npm start`.

Configuración: `kong/kong.yml` (local) y `kong/kong.compose.yml` (Compose).

## 4. Ingreso con Auth0 (opcional)

El botón **Ingresar con Auth0** aparece solo si el backend tiene `AUTH0_DOMAIN` y `AUTH0_CLIENT_ID`.

1. En https://manage.auth0.com crea una aplicación de tipo **Single Page Application**.
2. En **Settings** copia **Domain** y **Client ID** (no son secretos). **Nunca** uses el Client Secret aquí.
3. En **Application URIs** escribe (separando varias direcciones con coma):
   - **Allowed Callback URLs:** `http://localhost:4200/login, http://localhost:8080/login, https://TU-DOMINIO/login`
   - **Allowed Logout URLs:** las mismas direcciones que las de arriba.
   - **Allowed Web Origins:** solo el origen, **sin** `/login`: `http://localhost:4200, http://localhost:8080, https://TU-DOMINIO`
4. Guarda y define las variables en el backend: `AUTH0_DOMAIN=tu-tenant.us.auth0.com` y `AUTH0_CLIENT_ID=...`
   (en `backend/.env`, en el `.env` de Docker o en las variables de Railway). Reinicia el backend.

**Reglas de seguridad:** Auth0 solo demuestra *quién es* la persona. Para entrar debe existir ya una cuenta en
Servistock con **el mismo correo** (la crea un Administrador en **Empleados**) y el correo debe estar
**verificado** en Auth0 (con "Continuar con Google" ya viene verificado). Los permisos siguen siendo los de Servistock.

## 5. Desplegar en Railway

1. Sube el proyecto a GitHub (ver la sección 6) y en https://railway.com crea un proyecto **desde el repositorio**.
   Railway detecta `railway.json` y construye con el `Dockerfile` de la raíz.
2. En el mismo proyecto agrega el servicio **PostgreSQL** (New → Database → PostgreSQL).
3. En las variables del servicio de la aplicación define:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al servicio de base de datos) |
   | `JWT_SECRET` | una cadena larga y aleatoria (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
   | `CORS_ORIGIN` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
   | `TZ_NEGOCIO` | `America/Bogota` |
   | `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID` | opcionales (sección 4) |

   Railway define `PORT` por sí solo. Las tablas se crean automáticamente en el primer arranque.
4. En **Settings → Networking** genera un dominio público y ábrelo. Agrega `https://ESE-DOMINIO/login` a las URLs
   permitidas de Auth0 si lo usas.
5. **Cambia las contraseñas de las cuentas de prueba** apenas entres.

## 6. GitHub Actions y SonarCloud

`.github/workflows/ci.yml` corre en cada push a `main` y en cada Pull Request: tipos (TypeScript estricto), lint,
pruebas de integración contra PostgreSQL real, compilación del frontend y arranque completo con Docker.

Para activar **SonarCloud**: importa el repositorio en https://sonarcloud.io, completa `sonar.organization` y
`sonar.projectKey` en `sonar-project.properties` y crea el secreto `SONAR_TOKEN` en GitHub
(Settings → Secrets and variables → Actions). Sin ese secreto el paso se omite.

> **Antes del primer push:** este proyecto debe ser **un solo repositorio en la carpeta raíz**. Hoy `frontend/`
> tiene su propia carpeta `.git`; bórrala (o mueve su historial) antes de ejecutar `git init` en la raíz.

## 7. Pruebas

```powershell
cd backend
npm run typecheck ; npm run lint
$env:DB_PASSWORD="tu-clave" ; npm test     # recrea la base "servistack_test" (nunca toca tu base real)
cd ../frontend
npx ng test --watch=false
```

## Notas de diseño

- El estado de cada movimiento se cambia **a mano** (no se deriva de las líneas), como pide el documento de requisitos.
- Cambiar una línea a "Cancelado" **no devuelve stock**: el stock solo cambia al registrar o editar cantidades.
- Las cantidades son enteros. Una salida solo se permite si el proyecto está **En curso**.
- Un empleado con entradas o salidas registradas no se puede eliminar (se conserva el historial).
- Sin `RECAPTCHA_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, `UPSTASH_*` o `LOGTAIL_*` esos bloques quedan desactivados y la
  aplicación funciona igual (límite de intentos de login en memoria, logs en consola).

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| `client password must be a string` / no conecta a PostgreSQL | `DB_PASSWORD` vacío en `backend/.env` (ver `backend/scripts/reset-postgres-password.ps1`) |
| El botón de Auth0 no aparece | Faltan `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` o no reiniciaste el backend |
| Auth0: "Callback URL mismatch" | La dirección `.../login` no está en *Allowed Callback URLs* |
| Auth0: "no está registrada en Servistock" | Un Administrador debe crear la cuenta con ese correo |
| La cámara no abre | Usa `http://localhost` o HTTPS y concede el permiso; si no, usa "Subir imagen" o escribe el código |
| Puerto 3000 / 4200 / 8080 ocupado | Otro proceso lo usa; ciérralo o cambia `APP_PORT` |
