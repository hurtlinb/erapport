# erapport

React/Node.js starter to create evaluation reports for students and export them as PDFs.

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

### PostgreSQL configuration

The server now stores state in PostgreSQL. It automatically creates the
`app_state` table and seeds it with the default state on first run. Configure
the connection using either `DATABASE_URL` or the `PG*` environment variables.

#### Local development (using a local PostgreSQL)

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/erapport
cd server
npm run dev
```

PowerShell (Windows):

```powershell
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/erapport"
cd server
npm run dev
```

Windows Command Prompt:

```cmd
set DATABASE_URL=postgres://postgres:postgres@localhost:5432/erapport
cd server
npm run dev
```

#### Docker example (server + postgres)

```bash
docker network create erapport-net

docker run --name erapport-postgres \
  --network erapport-net \
  -e POSTGRES_DB=erapport \
  -e POSTGRES_USER=erapport \
  -e POSTGRES_PASSWORD=erapport \
  -p 5432:5432 \
  postgres:16

docker run --name erapport-server \
  --network erapport-net \
  -p 3001:3001 \
  -e PGHOST=erapport-postgres \
  -e PGPORT=5432 \
  -e PGDATABASE=erapport \
  -e PGUSER=erapport \
  -e PGPASSWORD=erapport \
  erapport-server
```
