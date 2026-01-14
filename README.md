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
