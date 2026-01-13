import archiver from "archiver";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { PassThrough } from "stream";
import { fileURLToPath } from "url";
import { loadState, saveState } from "./dataStore.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const hashPassword = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");

const createToken = () => crypto.randomUUID();

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.replace("Bearer ", "").trim();
};

const requireAuth = (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Missing token." });
    return;
  }
  const state = loadState();
  const user = state.users.find((entry) => entry.token === token);
  if (!user) {
    res.status(401).json({ error: "Invalid token." });
    return;
  }
  req.user = user;
  req.state = state;
  next();
};

app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    res.status(400).json({ error: "Name, email, and password are required." });
    return;
  }

  const state = loadState();
  const normalizedEmail = String(email).trim().toLowerCase();
  const existingUser = state.users.find(
    (user) => user.email.toLowerCase() === normalizedEmail
  );
  if (existingUser) {
    res.status(409).json({ error: "An account already exists for this email." });
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

  saveState({
    ...state,
    users: [...state.users, newUser]
  });

  res.json({
    user: { id: newUser.id, name: newUser.name, email: newUser.email },
    token
  });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const state = loadState();
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = state.users.find(
    (entry) => entry.email.toLowerCase() === normalizedEmail
  );
  if (!user) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const passwordHash = hashPassword(password, user.salt);
  if (passwordHash !== user.passwordHash) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const token = createToken();
  const updatedUsers = state.users.map((entry) =>
    entry.id === user.id ? { ...entry, token } : entry
  );
  saveState({ ...state, users: updatedUsers });

  res.json({
    user: { id: user.id, name: user.name, email: user.email },
    token
  });
});

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/")) {
    next();
    return;
  }
  requireAuth(req, res, next);
});

app.get("/api/state", requireAuth, (req, res) => {
  const { state, user } = req;
  const filteredStudents = (state.students || []).filter(
    (student) => student.teacherId === user.id
  );
  res.json({ schoolYears: state.schoolYears, students: filteredStudents });
});

app.put("/api/state", requireAuth, (req, res) => {
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
  const updatedState = saveState(nextState);
  const filteredStudents = updatedState.students.filter(
    (student) => student.teacherId === teacherId
  );
  res.json({ schoolYears: updatedState.schoolYears, students: filteredStudents });
});

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

const sanitizeFilename = (value) => {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return normalized ? normalized.slice(0, 60) : "report";
};

const sanitizeReportToken = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-z0-9]/gi, "");

const getModuleNumberToken = (moduleTitle) => {
  const firstWord = String(moduleTitle || "")
    .trim()
    .split(/\s+/)[0];
  return sanitizeReportToken(firstWord) || "module";
};

const getEvaluationLabel = (evaluationType) => {
  const normalized = String(evaluationType || "").trim().toUpperCase();
  return sanitizeReportToken(normalized) || "E1";
};

const getStudentNameToken = (student) => {
  const firstName = sanitizeReportToken(student?.firstname);
  const lastName = sanitizeReportToken(student?.name);
  return `${firstName}${lastName}` || "Student";
};

const buildReportFilename = (student) => {
  const moduleNumber = getModuleNumberToken(student?.moduleTitle);
  const evaluationLabel = getEvaluationLabel(student?.evaluationType);
  const studentName = getStudentNameToken(student);
  return `${moduleNumber}-${evaluationLabel}-${studentName}.pdf`;
};

const csvEscape = (value) => {
  const stringValue = String(value ?? "");
  if (/["\n,]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
};

const buildOutlookDraftScript = () => `# Creates Outlook draft emails from students.csv
$csvPath = Join-Path $PSScriptRoot "students.csv"
if (-not (Test-Path $csvPath)) {
  Write-Error "students.csv not found in the same folder as this script."
  exit 1
}

$outlook = New-Object -ComObject Outlook.Application
$students = Import-Csv $csvPath

foreach ($student in $students) {
  if (-not $student.StudentEmail) {
    continue
  }

  $mail = $outlook.CreateItem(0)
  $mail.To = $student.StudentEmail
  $mail.Subject = "Evaluation report - $($student.StudentName)"
  $attachmentPath = Join-Path $PSScriptRoot $student.ReportFilename

  if (Test-Path $attachmentPath) {
    $null = $mail.Attachments.Add($attachmentPath)
  }

  $mail.Save()
}
`;

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

const getSummaryRowHeight = (doc, category) => {
  const textPadding = 4;
  const categoryHeight = doc.heightOfString(category || "", {
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

const renderStudentReport = (doc, student) => {
  const studentDisplayName = getStudentDisplayName(student);
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const logoPath = path.join(__dirname, "emf.png");
  const headerX = 40;
  const headerY = 40;
  const headerWidth = 515;
  const headerHeight = 40;
  const logoWidth = 150;
  const dateWidth = 90;
  const titleWidth = headerWidth - logoWidth - dateWidth;
  const evaluationNumber = getEvaluationNumber(student.evaluationType);
  const reportTitle = `Rapport d'évaluation sommative${
    evaluationNumber ? ` ${evaluationNumber}` : ""
  }`;

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
    .text(formatDate(new Date()), headerX + logoWidth + titleWidth, headerY + 12, {
      width: dateWidth,
      align: "center"
    });

  const moduleBarY = headerY + headerHeight + 8;
  const moduleBarHeight = 28;

  doc
    .rect(40, moduleBarY, 515, moduleBarHeight)
    .fillAndStroke("#fbd2a3", theme.text)
    .fillColor(theme.text)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(student.moduleTitle || "Module", 40, moduleBarY + 8, {
      width: 515,
      align: "center"
    });

  const infoBoxY = moduleBarY + moduleBarHeight + 8;
  const infoRowHeight = 26;
  const infoRows = 2;
  const infoBoxHeight = infoRowHeight * infoRows;
  const infoTableX = 40;
  const infoColumnWidths = [260, 190, 65];
  const sigPath = path.join(__dirname, "sig.png");

  doc.lineWidth(0.6).strokeColor(theme.text).font("Helvetica").fontSize(9);

  infoColumnWidths.reduce((x, width, columnIndex) => {
    for (let rowIndex = 0; rowIndex < infoRows; rowIndex += 1) {
      doc.rect(x, infoBoxY + rowIndex * infoRowHeight, width, infoRowHeight).stroke();
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

  if (fs.existsSync(sigPath)) {
    doc.image(sigPath, rightColumnX + 6, secondRowY + 4, {
      fit: [infoColumnWidths[2] - 12, infoRowHeight - 8],
      align: "center",
      valign: "center"
    });
  }

  const operationalTitleY = infoBoxY + infoBoxHeight + 12;
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

  (student.competencies || []).forEach((section) => {
    const rowHeight = getSummaryRowHeight(doc, section.category);
    if (cursorY + rowHeight > 760) {
      doc.addPage();
      cursorY = 40;
      drawSummaryHeaderRow(doc, cursorY);
      cursorY += summaryTable.headerHeight;
    }
    drawSummaryRow(doc, section.category, section.result, cursorY, rowHeight);
    cursorY += rowHeight;
  });

  const noteRowHeight = summaryTable.noteRowHeight;
  if (cursorY + noteRowHeight > 760) {
    doc.addPage();
    cursorY = 40;
    drawSummaryHeaderRow(doc, cursorY);
    cursorY += summaryTable.headerHeight;
  }
  drawSummaryNoteRow(doc, student.note, cursorY, noteRowHeight);
  cursorY += noteRowHeight;

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

  if (cursorY > 720) {
    doc.addPage();
    cursorY = 40;
  }

  const remediationValue = getRemediationValue(student.competencies);
  const remediationHeight = 18;
  const remarksHeight = 22;

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

app.post("/api/report", requireAuth, (req, res) => {
  const student = req.body;
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

app.post("/api/report/export-all", requireAuth, async (req, res) => {
  const students = Array.isArray(req.body?.students) ? req.body.students : [];

  if (students.length === 0) {
    res.status(400).json({ error: "No students provided for export." });
    return;
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="evaluation-reports.zip"'
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

  const csvRows = [["StudentName", "StudentEmail", "ReportFilename"]];

  try {
    for (const student of students) {
      const reportFilename = buildReportFilename(student);
      const pdfBuffer = await createReportBuffer(student);
      archive.append(pdfBuffer, { name: reportFilename });

      csvRows.push([
        getStudentDisplayName(student) || "-",
        student.email || "",
        reportFilename
      ]);
    }

    const csvContent = csvRows
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    archive.append(csvContent, { name: "students.csv" });
    archive.append(buildOutlookDraftScript(), {
      name: "create-outlook-drafts.ps1"
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
