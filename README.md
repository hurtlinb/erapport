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

### 2) Build the frontend

```bash
cd client
npm run build
```

### 3) Run the server

```bash
cd server
npm run dev
```

The app runs on `http://localhost:3001` and serves both the UI and the API from a
single port.
