import archiver from "archiver";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import fs from "fs";
import { generators, Issuer } from "openid-client";
import path from "path";
import PDFDocument from "pdfkit";
import { PassThrough } from "stream";
import { fileURLToPath } from "url";
import {
  checkDatabaseStatus,
  loadState,
  saveState,
  upsertUserIdentity
} from "./dataStore.js";

const app = express();
const PORT = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const serverPackage = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")
);
const SERVER_VERSION = serverPackage.version || "unknown";
const DIST_DIR = path.join(ROOT_DIR, "dist");
const INDEX_HTML_PATH = path.join(ROOT_DIR, "index.html");
const isDev = process.env.NODE_ENV !== "production";
let vite;

const toBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return fallback;
};

const trimTrailingSlash = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/\/+$/, "");
};

const PORT_BASE_URL = trimTrailingSlash(process.env.SERVER_BASE_URL || "");
const SERVER_BASE_URL =
  PORT_BASE_URL || `http://localhost:${PORT}`;
const KEYCLOAK_URL = trimTrailingSlash(process.env.KEYCLOAK_URL || "");
const KEYCLOAK_REALM = String(process.env.KEYCLOAK_REALM || "").trim();
const KEYCLOAK_CLIENT_ID = String(process.env.KEYCLOAK_CLIENT_ID || "").trim();
const KEYCLOAK_CLIENT_SECRET = String(
  process.env.KEYCLOAK_CLIENT_SECRET || ""
).trim();
const SESSION_SECRET = String(process.env.SESSION_SECRET || "").trim();
const OIDC_ENABLED = Boolean(
  KEYCLOAK_URL &&
  KEYCLOAK_REALM &&
  KEYCLOAK_CLIENT_ID &&
  KEYCLOAK_CLIENT_SECRET &&
  SESSION_SECRET
);
const OIDC_ISSUER = OIDC_ENABLED
  ? `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`
  : "";
const OIDC_REDIRECT_URI = `${SERVER_BASE_URL}/auth/callback`;
const MySQLStore = MySQLStoreFactory(session);

const getOptionalString = (value) =>
  typeof value === "string" && value.trim() ? value : undefined;

const getSessionStoreOptions = () => {
  const databaseUrl = getOptionalString(process.env.DATABASE_URL);
  if (databaseUrl) {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, "")
    };
  }

  return {
    host: getOptionalString(process.env.MARIADB_HOST) || "localhost",
    port: process.env.MARIADB_PORT ? Number(process.env.MARIADB_PORT) : 3306,
    user: getOptionalString(process.env.MARIADB_USER),
    password: getOptionalString(process.env.MARIADB_PASSWORD),
    database: getOptionalString(process.env.MARIADB_DATABASE)
  };
};

const sessionStore = new MySQLStore(
  {
    ...getSessionStoreOptions(),
    createDatabaseTable: true,
    schema: {
      tableName: "user_sessions"
    }
  }
);
let oidcClientPromise;
app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));

if (toBoolean(process.env.TRUST_PROXY, false)) {
  app.set("trust proxy", 1);
}

app.use(
  session({
    name: "erapport.sid",
    secret: SESSION_SECRET || "dev-session-secret",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: !isDev,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

const hashPassword = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");

const createToken = () => crypto.randomUUID();

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.replace("Bearer ", "").trim();
};

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const resolveTeacherName = (student, context = {}) => {
  const currentTeacher = String(student?.teacher || "").trim();
  if (currentTeacher) return currentTeacher;

  const teacherId = student?.teacherId || context.user?.id;
  const matchingUser = context.state?.users?.find(
    (entry) => entry.id === teacherId
  );
  return (
    matchingUser?.name ||
    matchingUser?.email ||
    context.user?.name ||
    context.user?.email ||
    ""
  );
};

const normalizeStudentForReport = (student, context = {}) => {
  const teacherName = resolveTeacherName(student, context);
  const signatureData = context.user?.signatureData || "";
  const evaluationType = student?.evaluationType;
  let evaluationDate = student?.evaluationDate || "";
  if (evaluationType === "E2" && student?.evaluationDateE2) {
    evaluationDate = student.evaluationDateE2;
  }
  if (evaluationType === "E3" && student?.evaluationDateE3) {
    evaluationDate = student.evaluationDateE3;
  }
  let coachingDate = student?.coachingDate || "";
  if (evaluationType === "E2" && student?.coachingDateE2) {
    coachingDate = student.coachingDateE2;
  }

  const coachingDates = Array.isArray(student?.coachingDates)
    ? student.coachingDates
    : [];

  const basePayload = {
    ...student,
    evaluationDate,
    coachingDate,
    coachingDates,
    signatureData
  };
  if (!teacherName) return basePayload;
  return { ...basePayload, teacher: teacherName };
};

const MAX_SIGNATURE_LENGTH = 1000000;

const getSignatureBuffer = (signatureData) => {
  if (!signatureData || typeof signatureData !== "string") return null;
  const trimmed = signatureData.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^data:image\/(?:png|jpeg|jpg);base64,(.+)$/i);
  let base64Payload = match ? match[1] : trimmed;
  base64Payload = base64Payload.replace(/\s+/g, "");
  if (!base64Payload) return null;
  try {
    return Buffer.from(base64Payload, "base64");
  } catch (error) {
    console.warn("Invalid signature payload", error);
    return null;
  }
};

app.get("/status", asyncHandler(async (req, res) => {
  const dbStatus = await checkDatabaseStatus();
  const statusCode = dbStatus.ok ? 200 : 503;
  res.status(statusCode).json({
    status: dbStatus.ok ? "ok" : "degraded",
    version: SERVER_VERSION,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    db: dbStatus
  });
}));

const logServerEvent = (event, payload) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    payload
  };
  const logsDir = path.join(__dirname, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, "server-events.log");
  fs.appendFileSync(logFile, `${JSON.stringify(logEntry)}\n`, "utf8");
};

const normalizeEmail = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const getOidcConfig = () => ({
  enabled: OIDC_ENABLED,
  url: KEYCLOAK_URL,
  realm: KEYCLOAK_REALM,
  clientId: KEYCLOAK_CLIENT_ID
});

const buildUserIdentityFromClaims = (claims = {}) => {
  const givenName = String(claims.given_name || "").trim();
  const familyName = String(claims.family_name || "").trim();
  const combinedName = [givenName, familyName].filter(Boolean).join(" ");
  const email = normalizeEmail(claims.email || "");
  const preferredUsername = String(claims.preferred_username || "").trim();
  return {
    id: String(claims.sub || "").trim(),
    email,
    name:
      combinedName ||
      String(claims.name || "").trim() ||
      preferredUsername ||
      email
  };
};

const getOidcClient = async () => {
  if (!OIDC_ENABLED) {
    throw new Error("OIDC configuration is missing.");
  }
  if (!oidcClientPromise) {
    oidcClientPromise = Issuer.discover(OIDC_ISSUER).then((issuer) => (
      new issuer.Client({
        client_id: KEYCLOAK_CLIENT_ID,
        client_secret: KEYCLOAK_CLIENT_SECRET,
        redirect_uris: [OIDC_REDIRECT_URI],
        response_types: ["code"]
      })
    ));
  }
  return oidcClientPromise;
};

const getSessionUser = (req) =>
  req.session?.user && typeof req.session.user === "object"
    ? req.session.user
    : null;

const requireAuth = async (req, res, next) => {
  if (!OIDC_ENABLED) {
    res.status(503).json({ error: "Configuration OpenID manquante." });
    return;
  }

  const sessionUser = getSessionUser(req);
  if (!sessionUser?.id) {
    res.status(401).json({ error: "Session manquante." });
    return;
  }

  try {
    await upsertUserIdentity(sessionUser);
  } catch (error) {
    console.error("OIDC session synchronization failed", error);
    res.status(401).json({ error: "Session invalide." });
    return;
  }

  const state = await loadState();
  const user = state.users.find((entry) => entry.id === sessionUser.id);
  if (!user) {
    res.status(401).json({ error: "Utilisateur introuvable." });
    return;
  }
  req.user = user;
  req.state = state;
  next();
};

app.get("/api/auth/config", (req, res) => {
  const config = getOidcConfig();
  if (!config.enabled) {
    res.status(503).json({
      ...config,
      error: "Configuration OpenID manquante."
    });
    return;
  }
  res.json(config);
});

app.get("/api/auth/session", asyncHandler(async (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser?.id) {
    res.status(401).json({ authenticated: false });
    return;
  }

  await upsertUserIdentity(sessionUser);
  const state = await loadState();
  const user = state.users.find((entry) => entry.id === sessionUser.id);
  if (!user) {
    res.status(401).json({ authenticated: false });
    return;
  }

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
}));

app.get("/auth/login", asyncHandler(async (req, res) => {
  const client = await getOidcClient();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const state = generators.state();
  const nonce = generators.nonce();

  req.session.oidcLogin = {
    codeVerifier,
    state,
    nonce
  };

  const authorizationUrl = client.authorizationUrl({
    scope: "openid profile email",
    redirect_uri: OIDC_REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce
  });

  res.redirect(authorizationUrl);
}));

app.get("/auth/callback", asyncHandler(async (req, res) => {
  const client = await getOidcClient();
  const loginSession = req.session.oidcLogin || {};
  const params = client.callbackParams(req);
  const tokenSet = await client.callback(
    OIDC_REDIRECT_URI,
    params,
    {
      code_verifier: loginSession.codeVerifier,
      state: loginSession.state,
      nonce: loginSession.nonce
    }
  );
  const identity = buildUserIdentityFromClaims(tokenSet.claims());
  await upsertUserIdentity(identity);
  req.session.user = identity;
  req.session.oidc = {
    idToken: tokenSet.id_token || ""
  };
  delete req.session.oidcLogin;
  res.redirect("/");
}));

app.get("/auth/logout", asyncHandler(async (req, res) => {
  const idTokenHint = req.session?.oidc?.idToken || "";
  const client = OIDC_ENABLED ? await getOidcClient() : null;
  await new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const endSessionUrl = client?.issuer?.metadata?.end_session_endpoint;
  if (endSessionUrl && idTokenHint) {
    res.redirect(
      client.endSessionUrl({
        id_token_hint: idTokenHint,
        post_logout_redirect_uri: SERVER_BASE_URL
      })
    );
    return;
  }

  res.redirect("/");
}));

app.all(["/api/auth/login", "/api/auth/register"], (req, res) => {
  res.status(410).json({
    error: "L'authentification locale est désactivée. Utilisez OpenID."
  });
});

app.post("/api/auth/register", asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    res.status(400).json({ error: "Nom, e-mail et mot de passe requis." });
    return;
  }

  const state = await loadState();
  const normalizedEmail = String(email).trim().toLowerCase();
  const existingUser = state.users.find(
    (user) => user.email.toLowerCase() === normalizedEmail
  );
  if (existingUser) {
    res.status(409).json({ error: "Un compte existe déjà pour cet e-mail." });
    return;
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  const token = createToken();
  const newUser = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash,
    salt,
    token
  };

  await saveState({
    ...state,
    users: [...state.users, newUser]
  });

  res.json({
    user: { id: newUser.id, name: newUser.name, email: newUser.email },
    token
  });
}));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: "E-mail et mot de passe requis." });
    return;
  }

  const state = await loadState();
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = state.users.find(
    (entry) => entry.email.toLowerCase() === normalizedEmail
  );
  if (!user) {
    res.status(401).json({ error: "Identifiants invalides." });
    return;
  }

  const passwordHash = hashPassword(password, user.salt);
  if (passwordHash !== user.passwordHash) {
    res.status(401).json({ error: "Identifiants invalides." });
    return;
  }

  const token = createToken();
  const updatedUsers = state.users.map((entry) =>
    entry.id === user.id ? { ...entry, token } : entry
  );
  await saveState({ ...state, users: updatedUsers });

  res.json({
    user: { id: user.id, name: user.name, email: user.email },
    token
  });
}));

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/")) {
    next();
    return;
  }
  asyncHandler(requireAuth)(req, res, next);
});

app.get("/api/state", asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  const { state, user } = req;
  const filteredStudents = (state.students || []).filter(
    (student) => student.teacherId === user.id
  );
  logServerEvent("state-read", {
    userId: user.id,
    totalStudents: (state.students || []).length,
    filteredStudents: filteredStudents.length,
    schoolYears: (state.schoolYears || []).length
  });
  res.json({ schoolYears: state.schoolYears, students: filteredStudents });
}));

app.put("/api/state", asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  const { state, user } = req;
  const teacherId = user.id;
  const incomingStudents = Array.isArray(req.body.students)
    ? req.body.students
    : [];
  const normalizedStudents = incomingStudents.map((student) => ({
    ...student,
    teacherId
  }));
  const otherStudents = (state.students || []).filter(
    (student) => student.teacherId !== teacherId
  );
  const nextState = {
    ...state,
    schoolYears: req.body.schoolYears || state.schoolYears,
    students: [...otherStudents, ...normalizedStudents]
  };
  const updatedState = await saveState(nextState);
  const filteredStudents = updatedState.students.filter(
    (student) => student.teacherId === teacherId
  );
  logServerEvent("state-write", {
    userId: user.id,
    incomingStudents: incomingStudents.length,
    totalStudents: updatedState.students.length,
    filteredStudents: filteredStudents.length,
    schoolYears: (updatedState.schoolYears || []).length
  });
  res.json({ schoolYears: updatedState.schoolYears, students: filteredStudents });
}));

app.get("/api/settings", asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  res.json({ signatureData: req.user?.signatureData || "" });
}));

app.put("/api/settings", asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  const { state, user } = req;
  const rawSignature =
    typeof req.body?.signatureData === "string" ? req.body.signatureData : "";
  const signatureData = rawSignature.trim();

  if (signatureData.length > MAX_SIGNATURE_LENGTH) {
    res.status(413).json({
      error: "Signature trop volumineuse. Veuillez importer un fichier plus léger."
    });
    return;
  }

  if (
    signatureData &&
    !/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(signatureData)
  ) {
    res.status(400).json({
      error: "La signature doit être un fichier PNG."
    });
    return;
  }

  const updatedUsers = (state.users || []).map((entry) =>
    entry.id === user.id ? { ...entry, signatureData } : entry
  );
  const updatedState = await saveState({ ...state, users: updatedUsers });
  const updatedUser = updatedState.users.find((entry) => entry.id === user.id);
  logServerEvent("settings-update", {
    userId: user.id,
    hasSignature: Boolean(signatureData)
  });
  res.json({ signatureData: updatedUser?.signatureData || "" });
}));

app.post("/api/logs", asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  const { user } = req;
  const { event, payload } = req.body || {};
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId: user.id,
    event: event || "unknown",
    payload: payload || {}
  };
  const logsDir = path.join(__dirname, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, "client-events.log");
  fs.appendFileSync(logFile, `${JSON.stringify(logEntry)}\n`, "utf8");
  res.json({ status: "ok" });
}));

const theme = {
  text: "#0f172a",
  muted: "#334155",
  border: "#e2e8f0",
  primary: "#2563eb",
  primaryLight: "#eff6ff",
  surfaceMuted: "#f8fafc",
  competencyHeader: "#c7d7ec",
  competencyAccent: "#d9f2d9",
  status: {
    OK: { fill: "#dcfce7", text: "#16a34a", border: "#16a34a" },
    NEEDS_IMPROVEMENT: { fill: "#ffedd5", text: "#f97316", border: "#f97316" },
    NOT_ASSESSED: { fill: "#fecdd3", text: "#e11d48", border: "#e11d48" },
    DEFAULT: { fill: "#ffffff", text: "#0f172a", border: "#e2e8f0" }
  }
};

const STATUS_VALUES = {
  OK: "OK",
  NEEDS_IMPROVEMENT: "~",
  NOT_ASSESSED: "NOK"
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR");
};

const getEvaluationNumber = (value) => {
  if (!value) return "";
  const normalizedValue = String(value).trim().toUpperCase();
  const evaluationMap = {
    E1: "1",
    E2: "2",
    E3: "3"
  };
  if (evaluationMap[normalizedValue]) {
    return evaluationMap[normalizedValue];
  }
  const matchedNumber = normalizedValue.match(/E(\d+)/);
  return matchedNumber ? matchedNumber[1] : "";
};

const getStudentDisplayName = (student) => {
  const firstName = student?.firstname?.trim() || "";
  const lastName = student?.name?.trim() || "";
  return [firstName, lastName].filter(Boolean).join(" ");
};

const normalizeFilenameValue = (value) =>
  String(value || "").normalize("NFC");

const sanitizeFilename = (value) => {
  const normalized = normalizeFilenameValue(value)
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized ? normalized.slice(0, 60) : "rapport";
};

const sanitizeReportToken = (value) =>
  normalizeFilenameValue(value)
    .trim()
    .replace(/[^\p{L}\p{N}]/gu, "");

const buildModuleLabel = (moduleNumber, moduleTitle) => {
  const numberValue = String(moduleNumber || "").trim();
  const titleValue = String(moduleTitle || "").trim();
  if (numberValue && titleValue) {
    return `${numberValue} - ${titleValue}`;
  }
  return numberValue || titleValue || "Module";
};

const getModuleNumberToken = (student) => {
  const numberValue = String(student?.moduleNumber || "").trim();
  if (numberValue) {
    return sanitizeReportToken(numberValue) || "module";
  }
  const titleValue = String(student?.moduleTitle || "").trim();
  const fallbackWord = titleValue.split(/\s+/)[0];
  return sanitizeReportToken(fallbackWord) || "module";
};

const getEvaluationLabel = (evaluationType) => {
  const normalized = String(evaluationType || "").trim().toUpperCase();
  return sanitizeReportToken(normalized) || "E1";
};

const getStudentNameToken = (student) => {
  const firstName = sanitizeReportToken(student?.firstname);
  const lastName = sanitizeReportToken(student?.name);
  return `${firstName}${lastName}` || "etudiant";
};

const buildReportFilename = (student) => {
  const moduleNumber = getModuleNumberToken(student);
  const evaluationLabel = getEvaluationLabel(student?.evaluationType);
  const studentName = getStudentNameToken(student);
  return `${moduleNumber}-${evaluationLabel}-${studentName}.pdf`;
};

const buildCoachingFilename = (student) => {
  const moduleNumber = getModuleNumberToken(student);
  const evaluationLabel = getEvaluationLabel(student?.evaluationType);
  const studentName = getStudentNameToken(student);
  return `${moduleNumber}-${evaluationLabel}-${studentName}-coaching.pdf`;
};

const csvEscape = (value) => {
  const stringValue = String(value ?? "");
  if (/["\n,]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
};

const buildOutlookDraftScript = () => `# Crée des brouillons Outlook à partir de etudiants.csv
$csvPath = Join-Path $PSScriptRoot "etudiants.csv"
if (-not (Test-Path $csvPath)) {
  Write-Error "etudiants.csv introuvable dans le même dossier que ce script."
  exit 1
}

$subjectPath = Join-Path $PSScriptRoot "mail-subject.txt"
$bodyPath = Join-Path $PSScriptRoot "mail-body.txt"
$mailSubjectTemplate = ""
$mailBody = ""

if (Test-Path $subjectPath) {
  $mailSubjectTemplate = (Get-Content -Path $subjectPath -Raw -Encoding UTF8).TrimEnd()
}

if (Test-Path $bodyPath) {
  $mailBody = (Get-Content -Path $bodyPath -Raw -Encoding UTF8).TrimEnd()
}

$outlook = New-Object -ComObject Outlook.Application
$students = Import-Csv -Path $csvPath -Encoding UTF8

foreach ($student in $students) {
  if (-not $student.EmailEtudiant) {
    continue
  }

  $mail = $outlook.CreateItem(0)
  $mail.To = $student.EmailEtudiant
  if ($mailSubjectTemplate) {
    $mail.Subject = $mailSubjectTemplate
  } else {
    $mail.Subject = "Rapport d'évaluation - $($student.NomEtudiant)"
  }
  $attachmentPath = Join-Path $PSScriptRoot $student.FichierRapport
  $coachingPath = $null

  if ($mailBody) {
    $mail.Body = $mailBody
  }

  if ($student.FichierCoaching) {
    $coachingPath = Join-Path $PSScriptRoot $student.FichierCoaching
  }

  if (Test-Path $attachmentPath) {
    $null = $mail.Attachments.Add($attachmentPath)
  }

  if ($coachingPath -and (Test-Path $coachingPath)) {
    $null = $mail.Attachments.Add($coachingPath)
  }

  $mail.Save()
}
`;

const shouldIncludeCoaching = (student) => {
  const numericNote = Number(student?.note);
  return [1, 2, 3].includes(numericNote);
};

const getStatusStyle = (status) => {
  if (status === STATUS_VALUES.OK) {
    return theme.status.OK;
  }
  if (status === STATUS_VALUES.NEEDS_IMPROVEMENT) {
    return theme.status.NEEDS_IMPROVEMENT;
  }
  if (status === STATUS_VALUES.NOT_ASSESSED) {
    return theme.status.NOT_ASSESSED;
  }
  return theme.status.DEFAULT;
};

const shouldShowRemediationField = (student) => {
  const numericNote = student?.note ? Number(student.note) : null;
  if (numericNote === null || Number.isNaN(numericNote)) {
    return false;
  }
  return numericNote < 4;
};

const getRemediationValue = (competencies = []) => {
  const allItems = competencies.flatMap((section) => section.items || []);
  if (allItems.length === 0) {
    return "-";
  }

  const hasNonOk = allItems.some((item) => item.status !== STATUS_VALUES.OK);
  if (!hasNonOk) {
    return "Aucune remédiation";
  }

  const remediationMethods = new Set();
  allItems.forEach((item) => {
    if (item.status !== STATUS_VALUES.NOT_ASSESSED) {
      return;
    }
    if (item.evaluationMethod) {
      remediationMethods.add(item.evaluationMethod);
    }
  });

  if (remediationMethods.size === 0) {
    return "-";
  }

  return Array.from(remediationMethods).join(" + ");
};

const competencyTable = {
  x: 40,
  width: 515,
  headerHeight: 18,
  baseRowHeight: 18,
  columnWidths: {
    indicator: 16,
    code: 40,
    task: 250,
    comment: 155,
    status: 54
  }
};

const summaryTable = {
  x: 40,
  width: 515,
  headerHeight: 18,
  baseRowHeight: 18,
  noteRowHeight: 26,
  columnWidths: {
    category: 445,
    result: 70
  }
};

const getSummaryLabel = (student, section) => {
  if (!student.summaryByCompetencies) {
    return section.category || "";
  }

  const competencyOptions = student.competencyOptions || [];
  const items = section.items || [];
  const seen = new Set();
  const labels = [];

  items.forEach((item) => {
    const competencyId = item.competencyId || "";
    if (!competencyId || seen.has(competencyId)) return;
    seen.add(competencyId);

    const option = competencyOptions.find(
      (candidate) => candidate.code === competencyId
    );
    labels.push(
      option ? `${option.code} - ${option.description}` : competencyId
    );
  });

  if (!labels.length) {
    return section.category || "";
  }

  return labels.join("\n");
};

const aggregateCompetencyStatus = (statuses = []) => {
  const normalized = statuses.filter(Boolean);
  if (!normalized.length) return "";
  if (normalized.includes(STATUS_VALUES.NOT_ASSESSED)) {
    return STATUS_VALUES.NOT_ASSESSED;
  }
  if (normalized.includes(STATUS_VALUES.NEEDS_IMPROVEMENT)) {
    return STATUS_VALUES.NEEDS_IMPROVEMENT;
  }
  if (normalized.every((status) => status === STATUS_VALUES.OK)) {
    return STATUS_VALUES.OK;
  }
  return normalized[0] || "";
};

const getCompetencySummaryRows = (student) => {
  const items = (student.competencies || []).flatMap(
    (section) => section.items || []
  );
  const summaryMap = new Map();
  const order = [];
  const overrides = student.competencySummaryOverrides || {};

  items.forEach((item) => {
    const competencyId = item.competencyId || "";
    if (!competencyId) return;
    if (!summaryMap.has(competencyId)) {
      summaryMap.set(competencyId, []);
      order.push(competencyId);
    }
    summaryMap.get(competencyId).push(item.status || "");
  });

  const rows = [];
  const optionCodes = new Set();
  (student.competencyOptions || []).forEach((option) => {
    if (!option?.code || !summaryMap.has(option.code)) return;
    optionCodes.add(option.code);
    const computedResult = aggregateCompetencyStatus(summaryMap.get(option.code));
    const override = overrides[option.code] || "";
    rows.push({
      label: `${option.code} - ${option.description}`,
      result: override || computedResult
    });
  });

  order.forEach((competencyId) => {
    if (optionCodes.has(competencyId)) return;
    const computedResult = aggregateCompetencyStatus(summaryMap.get(competencyId));
    const override = overrides[competencyId] || "";
    rows.push({
      label: competencyId,
      result: override || computedResult
    });
  });

  return rows;
};

const getSummaryRowHeight = (doc, label) => {
  const textPadding = 4;
  const categoryHeight = doc.heightOfString(label || "", {
    width: summaryTable.columnWidths.category - textPadding * 2
  });
  return Math.max(
    summaryTable.baseRowHeight,
    Math.ceil(categoryHeight + textPadding * 2)
  );
};

const drawSummaryHeaderRow = (doc, y) => {
  doc
    .rect(
      summaryTable.x,
      y,
      summaryTable.columnWidths.category,
      summaryTable.headerHeight
    )
    .fillAndStroke(theme.competencyHeader, theme.text)
    .rect(
      summaryTable.x + summaryTable.columnWidths.category,
      y,
      summaryTable.columnWidths.result,
      summaryTable.headerHeight
    )
    .fillAndStroke(theme.competencyHeader, theme.text)
    .fillColor(theme.text)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Résumé des compétences évaluées", summaryTable.x + 6, y + 4, {
      width: summaryTable.columnWidths.category - 12
    })
    .text(
      "Résultat",
      summaryTable.x + summaryTable.columnWidths.category,
      y + 4,
      {
        width: summaryTable.columnWidths.result,
        align: "center"
      }
    );
  doc.font("Helvetica");
};

const drawSummaryRow = (doc, category, result, y, rowHeight) => {
  const statusStyle = getStatusStyle(result);
  const resultX = summaryTable.x + summaryTable.columnWidths.category;

  doc
    .rect(summaryTable.x, y, summaryTable.columnWidths.category, rowHeight)
    .stroke(theme.text)
    .rect(resultX, y, summaryTable.columnWidths.result, rowHeight)
    .fillAndStroke(statusStyle.fill, theme.text);

  doc
    .fontSize(8)
    .fillColor(theme.text)
    .text(category || "-", summaryTable.x + 4, y + 4, {
      width: summaryTable.columnWidths.category - 8
    })
    .fillColor(statusStyle.text)
    .font("Helvetica-Bold")
    .text(result || "-", resultX, y + 4, {
      width: summaryTable.columnWidths.result,
      align: "center"
    });
  doc.font("Helvetica");
};

const drawSummaryNoteRow = (doc, note, y, rowHeight) => {
  const resultX = summaryTable.x + summaryTable.columnWidths.category;
  const noteValue = note || "-";

  doc
    .rect(summaryTable.x, y, summaryTable.columnWidths.category, rowHeight)
    .fill(theme.status.DEFAULT.fill)
    .rect(resultX, y, summaryTable.columnWidths.result, rowHeight)
    .stroke(theme.text);
  doc
    .moveTo(summaryTable.x, y)
    .lineTo(resultX, y)
    .stroke(theme.text);
  doc
    .moveTo(resultX, y)
    .lineTo(resultX, y + rowHeight)
    .stroke(theme.text);

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(theme.text)
    .text("Note du module", summaryTable.x, y + 6, {
      width: summaryTable.columnWidths.category,
      align: "center"
    })
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(theme.text)
    .text(noteValue, resultX, y + 7, {
      width: summaryTable.columnWidths.result,
      align: "center"
    });
  doc.font("Helvetica");
};

const getCompetencyRowHeight = (doc, task, comment) => {
  const textPadding = 4;
  const taskHeight = doc.heightOfString(task || "", {
    width: competencyTable.columnWidths.task - textPadding * 2
  });
  const commentHeight = doc.heightOfString(comment || "", {
    width: competencyTable.columnWidths.comment - textPadding * 2
  });
  return Math.max(
    competencyTable.baseRowHeight,
    Math.ceil(Math.max(taskHeight, commentHeight) + textPadding * 2)
  );
};

const drawCompetencyHeaderRow = (doc, title, index, y) => {
  doc
    .rect(competencyTable.x, y, competencyTable.width, competencyTable.headerHeight)
    .fillAndStroke(theme.competencyHeader, theme.text)
    .fillColor(theme.text)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text(`${index + 1}) ${title}`, competencyTable.x + 6, y + 4, {
      width: competencyTable.width - 90
    });
  doc.font("Helvetica");
};

const drawCompetencyRow = (doc, task, code, status, comment, y, rowHeight) => {
  const statusStyle = getStatusStyle(status);
  const columns = competencyTable.columnWidths;
  const columnPositions = {
    indicator: competencyTable.x,
    code: competencyTable.x + columns.indicator,
    task: competencyTable.x + columns.indicator + columns.code,
    comment:
      competencyTable.x + columns.indicator + columns.code + columns.task,
    status:
      competencyTable.x +
      columns.indicator +
      columns.code +
      columns.task +
      columns.comment
  };

  doc
    .rect(columnPositions.indicator, y, columns.indicator, rowHeight)
    .fillAndStroke(theme.competencyAccent, theme.text)
    .rect(columnPositions.code, y, columns.code, rowHeight)
    .stroke(theme.text)
    .rect(columnPositions.task, y, columns.task, rowHeight)
    .stroke(theme.text)
    .rect(columnPositions.comment, y, columns.comment, rowHeight)
    .stroke(theme.text)
    .rect(columnPositions.status, y, columns.status, rowHeight)
    .fillAndStroke(statusStyle.fill, theme.text);

  doc
    .fontSize(8)
    .fillColor(theme.text)
    .text(code || "", columnPositions.code, y + 4, {
      width: columns.code,
      align: "center"
    })
    .text(task || "-", columnPositions.task + 4, y + 4, {
      width: columns.task - 8
    });

  doc
    .fillColor(theme.text)
    .text(comment || "", columnPositions.comment + 4, y + 4, {
      width: columns.comment - 8
    });

  doc
    .fillColor(statusStyle.text)
    .font("Helvetica-Bold")
    .text(status || "-", columnPositions.status, y + 4, {
      width: columns.status,
      align: "center"
    });
  doc.font("Helvetica");
};

const renderReportHeader = (doc, reportTitle, evaluationDate) => {
  const headerX = 40;
  const headerY = 40;
  const headerWidth = 515;
  const headerHeight = 40;
  const logoWidth = 150;
  const dateWidth = 90;
  const titleWidth = headerWidth - logoWidth - dateWidth;
  const logoPath = path.join(__dirname, "emf.png");
  const formattedDate = formatDate(evaluationDate) || "-";

  doc.lineWidth(0.6).strokeColor(theme.text);
  doc.rect(headerX, headerY, logoWidth, headerHeight).stroke();
  doc
    .rect(headerX + logoWidth, headerY, titleWidth, headerHeight)
    .stroke();
  doc
    .rect(
      headerX + logoWidth + titleWidth,
      headerY,
      dateWidth,
      headerHeight
    )
    .stroke();

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, headerX + 8, headerY + 6, {
      fit: [logoWidth - 16, headerHeight - 12],
      align: "left",
      valign: "center"
    });
  } else {
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(theme.text)
      .text("EMF", headerX + 12, headerY + 12, { width: logoWidth - 24 });
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(theme.text)
    .text(reportTitle, headerX + logoWidth, headerY + 12, {
      width: titleWidth,
      align: "center"
    });
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(formattedDate, headerX + logoWidth + titleWidth, headerY + 12, {
      width: dateWidth,
      align: "center"
    });

  return { headerX, headerY, headerHeight, headerWidth };
};

const renderStudentHeader = (
  doc,
  student,
  evaluationNumber,
  startY = 40,
  signatureBuffer
) => {
  const headerX = 40;
  const headerY = startY;
  const headerWidth = 515;
  const moduleBarHeight = 30;
  const infoRowHeight = 26;
  const infoColumnWidths = [170, 255, 90];
  const studentDisplayName = getStudentDisplayName(student);

  doc
    .lineWidth(0.6)
    .strokeColor(theme.text)
    .rect(headerX, headerY, headerWidth, moduleBarHeight)
    .fillAndStroke("#fbd2a3", theme.text)
    .fillColor(theme.text)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(
      buildModuleLabel(student.moduleNumber, student.moduleTitle),
      headerX,
      headerY + 8,
      {
      width: headerWidth,
      align: "center"
    }
    );

  const infoRowY = headerY + moduleBarHeight + 8;
  const middleColumnX = headerX + infoColumnWidths[0];
  const rightColumnX = middleColumnX + infoColumnWidths[1];

  infoColumnWidths.reduce((x, width) => {
    doc
      .rect(x, infoRowY, width, infoRowHeight)
      .stroke()
      .rect(x, infoRowY + infoRowHeight, width, infoRowHeight)
      .stroke();
    return x + width;
  }, headerX);

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(theme.text)
    .text("Apprenant(e)", headerX + 8, infoRowY + 4, {
      width: infoColumnWidths[0] - 16
    })
    .font("Helvetica")
    .fontSize(8)
    .text("Nom + prénom / classe", headerX + 8, infoRowY + 15, {
      width: infoColumnWidths[0] - 16
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(studentDisplayName || "-", middleColumnX, infoRowY + 6, {
      width: infoColumnWidths[1],
      align: "center"
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(student.className || "-", rightColumnX, infoRowY + 4, {
      width: infoColumnWidths[2],
      align: "center"
    });

  const teacherRowY = infoRowY + infoRowHeight;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Enseignants", headerX + 8, teacherRowY + 4, {
      width: infoColumnWidths[0] - 16
    })
    .font("Helvetica")
    .fontSize(8)
    .text("Prénom + nom / signature", headerX + 8, teacherRowY + 15, {
      width: infoColumnWidths[0] - 16
    });

  doc
    .font("Helvetica-Oblique")
    .fontSize(11)
    .text(student.teacher || "-", middleColumnX, teacherRowY + 6, {
      width: infoColumnWidths[1],
      align: "center"
    });

  if (signatureBuffer) {
    doc.image(signatureBuffer, rightColumnX + 6, teacherRowY + 4, {
      fit: [infoColumnWidths[2] - 12, infoRowHeight - 8],
      align: "center",
      valign: "center"
    });
  }

  return { headerBottomY: infoRowY + infoRowHeight * 2 };
};

const drawStudentInfoTable = (doc, student, infoBoxY, signatureBuffer) => {
  const studentDisplayName = getStudentDisplayName(student);
  const infoRowHeight = 26;
  const infoRows = 2;
  const infoBoxHeight = infoRowHeight * infoRows;
  const infoTableX = 40;
  const infoColumnWidths = [260, 190, 65];

  doc.lineWidth(0.6).strokeColor(theme.text).font("Helvetica").fontSize(9);

  infoColumnWidths.reduce((x, width) => {
    for (let rowIndex = 0; rowIndex < infoRows; rowIndex += 1) {
      doc
        .rect(x, infoBoxY + rowIndex * infoRowHeight, width, infoRowHeight)
        .stroke();
    }
    return x + width;
  }, infoTableX);

  const leftColumnX = infoTableX + 8;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Apprenant(e)", leftColumnX, infoBoxY + 5, {
      width: infoColumnWidths[0] - 16
    })
    .font("Helvetica")
    .fontSize(8)
    .text("Nom + prénom / classe", leftColumnX, infoBoxY + 16, {
      width: infoColumnWidths[0] - 16
    });

  const secondRowY = infoBoxY + infoRowHeight;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Enseignants", leftColumnX, secondRowY + 5, {
      width: infoColumnWidths[0] - 16
    })
    .font("Helvetica")
    .fontSize(8)
    .text("Prénom + nom / signature", leftColumnX, secondRowY + 16, {
      width: infoColumnWidths[0] - 16
    });

  const middleColumnX = infoTableX + infoColumnWidths[0] + 8;
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(studentDisplayName || "-", middleColumnX, infoBoxY + 6, {
      width: infoColumnWidths[1] - 16
    })
    .font("Helvetica-Oblique")
    .fontSize(11)
    .text(student.teacher || "-", middleColumnX, secondRowY + 6, {
      width: infoColumnWidths[1] - 16
    });

  const rightColumnX = infoTableX + infoColumnWidths[0] + infoColumnWidths[1];
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(student.className || "-", rightColumnX, infoBoxY + 6, {
      width: infoColumnWidths[2],
      align: "center"
    });

  if (signatureBuffer) {
    doc.image(signatureBuffer, rightColumnX + 6, secondRowY + 4, {
      fit: [infoColumnWidths[2] - 12, infoRowHeight - 8],
      align: "center",
      valign: "center"
    });
  }

  return { infoBoxHeight, infoRowHeight };
};

const drawCoachingInfoTable = (doc, student, infoBoxY) => {
  const studentDisplayName = getStudentDisplayName(student);
  const evaluationNumber = getEvaluationNumber(student.evaluationType);
  const noteValue = student.note || "-";
  const noteLabel = `Note du rapport d'évaluation sommative${
    evaluationNumber ? ` ${evaluationNumber}` : ""
  } =`;
  const infoRowHeight = 26;
  const noteRowHeight = 28;
  const infoBoxHeight = infoRowHeight + noteRowHeight;
  const infoTableX = 40;
  const infoColumnWidths = [170, 255, 90];

  doc.lineWidth(0.6).strokeColor(theme.text).font("Helvetica").fontSize(9);

  infoColumnWidths.reduce((x, width) => {
    doc.rect(x, infoBoxY, width, infoRowHeight).stroke();
    return x + width;
  }, infoTableX);

  const noteRowY = infoBoxY + infoRowHeight;
  const mergedWidth = infoColumnWidths[0] + infoColumnWidths[1];
  const rightColumnX = infoTableX + mergedWidth;

  doc.rect(infoTableX, noteRowY, mergedWidth, noteRowHeight).stroke();
  doc.rect(rightColumnX, noteRowY, infoColumnWidths[2], noteRowHeight).stroke();

  const leftColumnX = infoTableX + 8;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Apprenant(e)", leftColumnX, infoBoxY + 5, {
      width: infoColumnWidths[0] - 16
    })
    .font("Helvetica")
    .fontSize(8)
    .text("Nom + prénom / classe", leftColumnX, infoBoxY + 16, {
      width: infoColumnWidths[0] - 16
    });

  const middleColumnX = infoTableX + infoColumnWidths[0];
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(studentDisplayName || "-", middleColumnX, infoBoxY + 6, {
      width: infoColumnWidths[1],
      align: "center"
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(student.className || "-", rightColumnX, infoBoxY + 6, {
      width: infoColumnWidths[2],
      align: "center"
    });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(theme.text)
    .text(noteLabel, infoTableX, noteRowY + 8, {
      width: mergedWidth,
      align: "center"
    })
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#d10000")
    .text(noteValue, rightColumnX, noteRowY + 4, {
      width: infoColumnWidths[2],
      align: "center"
    })
    .fillColor(theme.text)
    .font("Helvetica");

  return { infoBoxHeight, infoRowHeight };
};

const renderStudentReport = (doc, student) => {
  const evaluationNumber = getEvaluationNumber(student.evaluationType);
  const reportTitle = `Rapport d’évaluation sommative${
    evaluationNumber ? ` ${evaluationNumber}` : ""
  }`;
  const signatureBuffer = getSignatureBuffer(student.signatureData);
  const { headerY, headerHeight } = renderReportHeader(
    doc,
    reportTitle,
    student.evaluationDate
  );
  const { headerBottomY } = renderStudentHeader(
    doc,
    student,
    evaluationNumber,
    headerY + headerHeight + 8,
    signatureBuffer
  );

  const operationalTitleY = headerBottomY + 12;
  const operationalBodyY = operationalTitleY + 12;
  const objectivesTitleY = operationalBodyY + 22;
  const objectivesBodyY = objectivesTitleY + 12;
  const objectivesList = (student.competencyOptions || [])
    .map((option) => `${option.code}: ${option.description}`)
    .join("\n");

  doc
    .fontSize(9)
    .fillColor(theme.text)
    .text("Compétences opérationnelles :", 40, operationalTitleY)
    .fontSize(8)
    .fillColor(theme.muted)
    .text(student.operationalCompetence || "-", 40, operationalBodyY, {
      width: 515
    })
    .fontSize(9)
    .fillColor(theme.text)
    .text("Objectifs opérationnels", 40, objectivesTitleY)
    .fontSize(8)
    .fillColor(theme.muted)
    .text(objectivesList || "-", 40, objectivesBodyY, { width: 515 });

  let cursorY = doc.y + 16;
  if (cursorY + summaryTable.headerHeight > 740) {
    doc.addPage();
    cursorY = 40;
  }

  drawSummaryHeaderRow(doc, cursorY);
  cursorY += summaryTable.headerHeight;

  const summaryRows = student.summaryByCompetencies
    ? getCompetencySummaryRows(student)
    : (student.competencies || []).map((section) => ({
        label: getSummaryLabel(student, section),
        result: section.result
      }));

  summaryRows.forEach((row) => {
    const summaryLabel = row.label || "";
    const rowHeight = getSummaryRowHeight(doc, summaryLabel);
    if (cursorY + rowHeight > 760) {
      doc.addPage();
      cursorY = 40;
      drawSummaryHeaderRow(doc, cursorY);
      cursorY += summaryTable.headerHeight;
    }
    drawSummaryRow(doc, summaryLabel, row.result, cursorY, rowHeight);
    cursorY += rowHeight;
  });

  if (cursorY + summaryTable.noteRowHeight > 760) {
    doc.addPage();
    cursorY = 40;
    drawSummaryHeaderRow(doc, cursorY);
    cursorY += summaryTable.headerHeight;
  }
  drawSummaryNoteRow(doc, student.note, cursorY, summaryTable.noteRowHeight);
  cursorY += summaryTable.noteRowHeight;
  cursorY += 16;
  student.competencies?.forEach((section, sectionIndex) => {
    if (cursorY + competencyTable.headerHeight > 740) {
      doc.addPage();
      cursorY = 40;
    }
    drawCompetencyHeaderRow(doc, section.category, sectionIndex, cursorY);
    cursorY += competencyTable.headerHeight;

    section.items?.forEach((item) => {
      const taskLabel = item.task || item.label || "-";
      const rowHeight = getCompetencyRowHeight(
        doc,
        taskLabel,
        item.comment
      );

      if (cursorY + rowHeight > 760) {
        doc.addPage();
        cursorY = 40;
      }

      drawCompetencyRow(
        doc,
        taskLabel,
        item.competencyId || "-",
        item.status,
        item.comment,
        cursorY,
        rowHeight
      );
      cursorY += rowHeight;
    });

    cursorY += 12;
  });

  const remediationValue = shouldShowRemediationField(student)
    ? getRemediationValue(student.competencies)
    : "-";
  const remediationHeight = 18;
  const remarksHeight = 22;
  const remarksBlockHeight = remediationHeight + remarksHeight;

  if (cursorY + remarksBlockHeight > 760) {
    doc.addPage();
    cursorY = 40;
  }

  doc
    .rect(40, cursorY, 515, remediationHeight)
    .stroke(theme.text)
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(theme.text)
    .text("A remédier :", 46, cursorY + 4)
    .font("Helvetica")
    .text(remediationValue, 120, cursorY + 4, { width: 430 });

  cursorY += remediationHeight;

  doc
    .rect(40, cursorY, 515, remarksHeight)
    .stroke(theme.text)
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(theme.text)
    .text("Remarques :", 46, cursorY + 5)
    .font("Helvetica")
    .text(student.remarks || "-", 120, cursorY + 5, { width: 430 });
};

const renderCoachingReport = (doc, student) => {
  const { headerY, headerHeight } = renderReportHeader(
    doc,
    "Demande de coaching",
    student.evaluationDate
  );
  const moduleBarY = headerY + headerHeight + 8;
  const moduleBarHeight = 28;

  doc
    .rect(40, moduleBarY, 515, moduleBarHeight)
    .fillAndStroke("#fbd2a3", theme.text)
    .fillColor(theme.text)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(
      buildModuleLabel(student.moduleNumber, student.moduleTitle),
      40,
      moduleBarY + 8,
      {
        width: 515,
        align: "center"
      }
    );

  const infoBoxY = moduleBarY + moduleBarHeight + 8;
  const { infoBoxHeight } = drawCoachingInfoTable(doc, student, infoBoxY);
  let coachingBoxY = infoBoxY + infoBoxHeight + 16;

  if (coachingBoxY > 720) {
    doc.addPage();
    coachingBoxY = 40;
  }

  const coachingBoxHeight = 760 - coachingBoxY;
  doc
    .rect(40, coachingBoxY, 515, coachingBoxHeight)
    .stroke(theme.text);

  const coachingBoxX = 40;
  const coachingBoxWidth = 515;
  const contentX = coachingBoxX + 10;
  const contentWidth = coachingBoxWidth - 20;
  const coachingDate = formatDate(student.coachingDate) || "-";

  let cursorY = coachingBoxY + 12;

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(theme.text)
    .text(
      "Un accompagnement pédagogique appelé \"coaching\" vous est proposé sur une base volontaire (voir la directive spécifique présentant le concept).",
      contentX,
      cursorY,
      { width: contentWidth }
    );

  cursorY = doc.y + 8;
  const checkboxSize = 10;
  const checkboxLabelX = coachingBoxX + coachingBoxWidth - 120;

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Je suis volontaire pour un coaching (cocher)", coachingBoxX, cursorY, {
      width: coachingBoxWidth - 140,
      align: "center"
    });

  doc
    .fontSize(8)
    .text("OUI", checkboxLabelX + 6, cursorY - 2)
    .text("NON", checkboxLabelX + 56, cursorY - 2);

  doc
    .rect(checkboxLabelX + 6, cursorY + 10, checkboxSize, checkboxSize)
    .stroke(theme.text);
  doc
    .rect(checkboxLabelX + 56, cursorY + 10, checkboxSize, checkboxSize)
    .stroke(theme.text);

  cursorY += 32;
  const coachingDateOptions = Array.isArray(student.coachingDates)
    ? student.coachingDates
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
    : [];

  if (coachingDateOptions.length) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(
        "Si oui, merci de choisir les dates auxquelles vous serez présent(e) :",
        contentX,
        cursorY,
        { width: contentWidth }
      );
    cursorY = doc.y + 6;
    const checkboxListX = contentX;
    const entryLabelWidth = contentWidth - (checkboxSize + 6);

    coachingDateOptions.forEach((entry) => {
      const entryHeight = Math.max(
        checkboxSize,
        doc.heightOfString(entry, { width: entryLabelWidth })
      );
      doc.rect(checkboxListX, cursorY, checkboxSize, checkboxSize).stroke(theme.text);
      doc.text(entry, checkboxListX + checkboxSize + 6, cursorY, {
        width: entryLabelWidth
      });
      cursorY += entryHeight + 4;
      doc.y = cursorY;
    });
    cursorY += 6;
  }

  const signatureLabelWidth = 300;
  const signatureLineStart = coachingBoxX + signatureLabelWidth + 16;
  const signatureLineEnd = coachingBoxX + coachingBoxWidth - 10;

  const drawSignatureLine = (label, y) => {
    doc.font("Helvetica").fontSize(9).text(label, contentX, y, {
      width: signatureLabelWidth
    });
    const labelHeight = doc.heightOfString(label, {
      width: signatureLabelWidth
    });
    const lineY = y + labelHeight - 2;
    doc
      .dash(1, { space: 2 })
      .moveTo(signatureLineStart, lineY)
      .lineTo(signatureLineEnd, lineY)
      .stroke(theme.text)
      .undash();
    return y + labelHeight + 10;
  };

  cursorY = drawSignatureLine("Ma signature :", cursorY);
  cursorY = drawSignatureLine(
    "Signature du représentant légal (obligatoire) :",
    cursorY
  );
  cursorY = drawSignatureLine(
    "Autre professeur souhaité pour le coaching :\n(uniquement avec son accord préalable)",
    cursorY
  );

  const footerHeight = 16;
  const footerY = coachingBoxY + coachingBoxHeight - footerHeight;
  const sectionStartY = cursorY + 8;
  const footerPadding = 6;
  const remediationHeight = 32;
  const objectivesHeaderHeight = 20;
  const availableHeight = footerY - sectionStartY - footerPadding;
  const objectivesBodyHeight = Math.max(
    0,
    availableHeight - remediationHeight - objectivesHeaderHeight
  );

  doc
    .rect(
      coachingBoxX + 2,
      sectionStartY,
      coachingBoxWidth - 4,
      remediationHeight
    )
    .fillAndStroke("#f8cf6b", theme.text)
    .fillColor(theme.text)
    .font("Helvetica")
    .fontSize(8)
    .text(
      "En cas de remédiation, la PEF sera libérée sans autres dès que les compétences seront acquises et que les éventuelles activités de remédiation prévues soient réalisées, réceptionnées et acceptées par l'enseignant.",
      coachingBoxX + 8,
      sectionStartY + 6,
      { width: coachingBoxWidth - 16, align: "center" }
    );

  const objectivesHeaderY = sectionStartY + remediationHeight;
  doc
    .rect(
      coachingBoxX + 2,
      objectivesHeaderY,
      coachingBoxWidth - 4,
      objectivesHeaderHeight
    )
    .fillAndStroke("#fff4b0", theme.text)
    .fillColor(theme.text)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(
      "Mes objectifs pour ce coaching",
      coachingBoxX + 2,
      objectivesHeaderY + 5,
      { width: coachingBoxWidth - 4, align: "center" }
    );

  const objectivesBodyY = objectivesHeaderY + objectivesHeaderHeight;
  if (objectivesBodyHeight > 0) {
    const cellHeight = objectivesBodyHeight / 3;
    const cellX = coachingBoxX + 2;
    const cellWidth = coachingBoxWidth - 4;

    doc.font("Helvetica").fontSize(9).fillColor(theme.text);

    Array.from({ length: 3 }).forEach((_, index) => {
      const rowTop = objectivesBodyY + cellHeight * index;
      const numberY = rowTop + 6;

      doc
        .rect(cellX, rowTop, cellWidth, cellHeight)
        .stroke(theme.text);
      doc.text(`${index + 1}.`, cellX + 10, numberY);
    });
  }

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(theme.text)
    .text(
      `Retour du document signé jusqu'au ${coachingDate}`,
      coachingBoxX,
      footerY,
      { width: coachingBoxWidth, align: "center" }
    );
};

const createReportBuffer = (student) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const stream = new PassThrough();
    const chunks = [];

    doc.on("error", reject);
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));

    doc.pipe(stream);
    renderStudentReport(doc, student);
    doc.end();
  });

const createCoachingBuffer = (student) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const stream = new PassThrough();
    const chunks = [];

    doc.on("error", reject);
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));

    doc.pipe(stream);
    renderCoachingReport(doc, student);
    doc.end();
  });

app.post("/api/report", requireAuth, (req, res) => {
  const student = normalizeStudentForReport(req.body, req);
  const reportFilename = buildReportFilename(student);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${reportFilename}"`
  );
  doc.pipe(res);

  renderStudentReport(doc, student);

  doc.end();
});

app.post("/api/report/coaching", requireAuth, (req, res) => {
  const student = normalizeStudentForReport(req.body, req);

  if (!shouldIncludeCoaching(student)) {
    res
      .status(400)
      .json({ error: "Aucun coaching à générer pour cette note." });
    return;
  }

  const coachingFilename = buildCoachingFilename(student);
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${coachingFilename}"`
  );
  doc.pipe(res);

  renderCoachingReport(doc, student);

  doc.end();
});

app.post("/api/report/export-all", requireAuth, async (req, res) => {
  const students = Array.isArray(req.body?.students)
    ? req.body.students.map((student) =>
        normalizeStudentForReport(student, req)
      )
    : [];
  const mailDraftSubject =
    typeof req.body?.mailDraftSubject === "string"
      ? req.body.mailDraftSubject
      : "";
  const mailDraftBody =
    typeof req.body?.mailDraftBody === "string" ? req.body.mailDraftBody : "";

  if (students.length === 0) {
    res.status(400).json({ error: "Aucun étudiant fourni pour l'export." });
    return;
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="rapports-evaluation.zip"'
  );

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (error) => {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.end();
    }
  });
  archive.pipe(res);

  const csvRows = [[
    "NomEtudiant",
    "EmailEtudiant",
    "FichierRapport",
    "FichierCoaching"
  ]];

  try {
    for (const student of students) {
      const reportFilename = buildReportFilename(student);
      const pdfBuffer = await createReportBuffer(student);
      archive.append(pdfBuffer, { name: reportFilename });

      let coachingFilename = "";
      if (shouldIncludeCoaching(student)) {
        coachingFilename = buildCoachingFilename(student);
        const coachingBuffer = await createCoachingBuffer(student);
        archive.append(coachingBuffer, { name: coachingFilename });
      }

      csvRows.push([
        getStudentDisplayName(student) || "-",
        student.email || "",
        reportFilename,
        coachingFilename
      ]);
    }

    const csvContent = `\uFEFF${csvRows
      .map((row) => row.map(csvEscape).join(","))
      .join("\n")}`;
    archive.append(csvContent, { name: "etudiants.csv" });
    archive.append(`\uFEFF${mailDraftSubject}`, {
      name: "mail-subject.txt"
    });
    archive.append(`\uFEFF${mailDraftBody}`, {
      name: "mail-body.txt"
    });
    archive.append(`\uFEFF${buildOutlookDraftScript()}`, {
      name: "creer-brouillons-outlook.ps1"
    });

    await archive.finalize();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.end();
    }
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(500).json({ error: "Erreur serveur." });
});

const shouldSkipFrontend = (req) =>
  req.path.startsWith("/api") || req.path === "/status";

const serveFrontend = async () => {
  if (isDev) {
    const { createServer } = await import("vite");
    vite = await createServer({
      root: ROOT_DIR,
      server: { middlewareMode: "ssr" }
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_DIR, { index: false }));
  }

  app.use("*", async (req, res, next) => {
    if (shouldSkipFrontend(req)) {
      next();
      return;
    }
    try {
      if (isDev && vite) {
        const template = fs.readFileSync(INDEX_HTML_PATH, "utf-8");
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
        return;
      }
      res.sendFile(path.join(DIST_DIR, "index.html"));
    } catch (error) {
      next(error);
    }
  });
};

const startServer = async () => {
  await serveFrontend();
  app.listen(PORT, () => {
    console.log(
      `Server running on http://localhost:${PORT} (${isDev ? "development" : "production"})`
    );
  });
};

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
