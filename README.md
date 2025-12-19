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
