# erapport

Single Express+React application that lets teachers build, save and export evaluation reports (PDF + coaching demand documents) for students. The API, PDF generator and UI now run from the same process so you only need one server in development or production.

## Architecture

- **Express API & PDF generator** are implemented in `src/server`. It is the only Node process you run, and it exposes the `/api` endpoints, handles authentication plus MariaDB persistence, and provides the `/status` health endpoint.
- **React / Vite frontend** lives inside `src/frontend`. During development the server runs Vite in middleware mode so you get HMR while staying on the same port (default `3001`). In production the UI is built into `dist/` and served as static assets from Express.

## Getting started

1. `npm install`
2. `npm run dev`
   - Runs `node --watch src/server/index.js` in development mode with Vite middleware.
   - Open `http://localhost:3001` to reach the UI; the backend API is available under the same origin (e.g. `http://localhost:3001/api/state`).
3. `npm run build`
   - Produces the production-ready frontend bundle in `dist/`.
4. `npm start`
   - Starts the production server on the port configured via `PORT` (defaults to `3001`).

### Environment variables

| Variable | Description |
| --- | --- |
| `PORT` | Port for the Express server (default `3001`). |
| `DATABASE_URL` or `MARIADB_*` | MariaDB connection as described below. |
| `VITE_API_BASE_URL` | Optional; controls which API base the built UI talks to. When unset it uses the same origin as the page (so the frontend and backend stay together). |
| `TRUST_PROXY` | Set to `true` when running behind a reverse proxy to enable `trust proxy` on Express. |

## MariaDB configuration

The application persists state in MariaDB. It will create the required tables on first run but you must provide connection details via `DATABASE_URL` (e.g. `mysql://erapport:erapport@localhost:3306/erapport`) or the individual `MARIADB_HOST`, `MARIADB_USER`, etc. variables from the old setup.

Example (bash / PowerShell):

```bash
export DATABASE_URL=mysql://erapport:erapport@localhost:3306/erapport
npm run dev
```

```powershell
$env:DATABASE_URL="mysql://erapport:erapport@localhost:3306/erapport"
npm run dev
```

## Docker

Build a container that runs the unified app:

```bash
docker build -t erapport .
```

Run it with a linked MariaDB container or remotely configured database:

```bash
docker run --name erapport -p 3001:3001 -e DATABASE_URL=mysql://erapport:erapport@host.docker.internal:3306/erapport erapport
```

Because the UI is served by the same process, there is no separate client image anymore. The default port inside the container is still `3001`.
