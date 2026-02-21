# erapport

React/Node.js app to create evaluation reports for students and export them as PDFs.

## Project structure

- `client/`: React UI (Vite)
- `server/`: Node.js/Express API that generates the PDF

## Getting started

### 1) Install dependencies

```bash
cd server
npm install
cd ../client
npm install
```

### 2) Run the backend

```bash
cd server
npm run dev
```

### 3) Run the frontend

```bash
cd client
npm run dev
```

The UI runs on `http://localhost:5173` and expects the API at
`http://localhost:3001`.

## Production Docker images

This repo contains two Dockerfiles:

- `server/Dockerfile` builds the Node/Express API image.
- `client/Dockerfile` builds the static Vite app and serves it with Nginx.

### Build the images

From the repository root:

```bash
docker build -t erapport-server ./server
docker build --build-arg VITE_API_BASE_URL=http://localhost:3001 -t erapport-client ./client
```

`VITE_API_BASE_URL` is baked into the frontend at build time, so set it to the
public URL of the API for your environment.

### Run the containers

```bash
docker run --name erapport-server -p 3001:3001 erapport-server
docker run --name erapport-client -p 8080:80 erapport-client
```

The frontend will be available on `http://localhost:8080` and it will connect to
the API using the `VITE_API_BASE_URL` used at build time.

### MariaDB configuration

The server stores state in MariaDB. It automatically creates the required
tables and seeds them with the default state on first run. Configure the
connection using either `DATABASE_URL` (with a `mysql://` URL) or the
`MARIADB_*` environment variables.

#### Local development (using a local MariaDB)

```bash
export DATABASE_URL=mysql://erapport:erapport@localhost:3306/erapport
cd server
npm run dev
```

PowerShell (Windows):

```powershell
$env:DATABASE_URL="mysql://erapport:erapport@localhost:3306/erapport"
cd server
npm run dev
```

Windows Command Prompt:

```cmd
set DATABASE_URL=mysql://erapport:erapport@localhost:3306/erapport
cd server
npm run dev
```

#### Docker example (server + MariaDB)

```bash
docker network create erapport-net

docker run --name erapport-mariadb \
  --network erapport-net \
  -e MARIADB_DATABASE=erapport \
  -e MARIADB_USER=erapport \
  -e MARIADB_PASSWORD=erapport \
  -e MARIADB_ROOT_PASSWORD=erapport-root \
  -p 3306:3306 \
  mariadb:11

docker run --name erapport-server \
  --network erapport-net \
  -p 3001:3001 \
  -e MARIADB_HOST=erapport-mariadb \
  -e MARIADB_PORT=3306 \
  -e MARIADB_DATABASE=erapport \
  -e MARIADB_USER=erapport \
  -e MARIADB_PASSWORD=erapport \
  erapport-server
```

## OAuth2 configuration

The backend can delegate authentication to any OAuth2/OpenID Connect provider. The feature is opt-in via environment variables (similar to the database configuration) but is activated by default inside `server/Dockerfile` (`OAUTH2_ENABLED=true`).

Set the following variables when you enable OAuth2:

- `OAUTH2_ENABLED` – `true` to use OAuth2; the frontend builder also reads `VITE_OAUTH2_ENABLED=true` so the login form is hidden.
- `OAUTH2_ISSUER_URL` – the provider's discovery URL (required).
- `OAUTH2_CLIENT_ID` – the OAuth2 client identifier (required).
- `OAUTH2_CLIENT_SECRET` – the client secret for confidential clients (omit if you rely on `token_endpoint_auth_method=none`).
- `OAUTH2_REDIRECT_URL` – optional override for the callback URL (defaults to `http://<server>/oauth2/callback`).
- `OAUTH2_POST_LOGOUT_REDIRECT_URL` – optional redirect after sign-out (defaults to the server base URL).
- `OAUTH2_SCOPES` – optional scope list (default: `openid profile email`).
- `SESSION_SECRET` / `SESSION_COOKIE_NAME` – optional overrides used for the Express session that stores the OAuth state.
- `SERVER_BASE_URL` – optional base URL used when building redirects.

When OAuth2 is active, the SPA automatically calls `/oauth2/session`. If no session exists it redirects to `/oauth2/login`, the provider calls back to `/oauth2/callback`, and the backend creates or refreshes a teacher account using the emailed profile (name/email). The "Se déconnecter" button calls `/oauth2/sign_out`, which clears the session, invalidates the token, and (if available) points to the provider's `end_session_endpoint`.
