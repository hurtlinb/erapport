import cors from "cors";
import express from "express";
import PDFDocument from "pdfkit";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const theme = {
  text: "#0f172a",
  muted: "#334155",
  border: "#e2e8f0",
  primary: "#2563eb",
  primaryLight: "#eff6ff",
  surfaceMuted: "#f8fafc",
  status: {
    OK: { fill: "#dcfce7", text: "#16a34a", border: "#16a34a" },
    NEEDS_IMPROVEMENT: { fill: "#ffedd5", text: "#f97316", border: "#f97316" },
    NOT_ASSESSED: { fill: "#fecdd3", text: "#e11d48", border: "#e11d48" },
    DEFAULT: { fill: "#f8fafc", text: "#0f172a", border: "#e2e8f0" }
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

const getCompetencyLabel = (item, competencyOptions = []) => {
  const option = competencyOptions.find(
    (candidate) => candidate.code === item.competencyId
  );

  if (option) {
    return `${option.code} - ${option.description}`;
  }

  return "-";
};

const drawKeyValue = (doc, label, value, x, y) => {
  doc
    .fontSize(9)
    .fillColor(theme.text)
    .text(label, x, y)
    .font("Helvetica-Bold")
    .text(value || "-", x + 140, y)
    .font("Helvetica");
};

const drawSectionHeader = (doc, title, y) => {
  doc
    .roundedRect(40, y, 515, 18, 4)
    .fillAndStroke(theme.primaryLight, theme.primary)
    .fillColor(theme.text)
    .fontSize(10)
    .font("Helvetica-Bold")
    .text(title, 48, y + 4);
  doc.font("Helvetica");
};

const drawCompetencyRow = (doc, task, competency, status, comment, y) => {
  const statusStyle = getStatusStyle(status);
  doc
    .rect(40, y, 260, 18)
    .stroke(theme.border)
    .rect(300, y, 140, 18)
    .stroke(theme.border)
    .rect(440, y, 70, 18)
    .stroke(theme.border)
    .rect(510, y, 45, 18)
    .fillAndStroke(statusStyle.fill, statusStyle.border || theme.border);
  doc
    .fontSize(8)
    .fillColor(theme.text)
    .text(task, 44, y + 4, { width: 252 })
    .text(competency, 304, y + 4, { width: 132 });
  doc
    .fillColor(theme.muted)
    .text(comment || "-", 444, y + 4, { width: 62 });
  doc
    .fillColor(statusStyle.text)
    .font("Helvetica-Bold")
    .text(status || "-", 515, y + 4, { width: 40, align: "center" });
  doc.font("Helvetica");
};

app.post("/api/report", (req, res) => {
  const student = req.body;

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${student.name || "report"}.pdf"`
  );
  doc.pipe(res);

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(theme.text)
    .text("Rapport d'évaluation sommative", 40, 40)
    .font("Helvetica")
    .fontSize(9)
    .text(formatDate(student.evaluationDate), 450, 42, { align: "right" });

  doc
    .roundedRect(40, 64, 515, 24, 6)
    .fillAndStroke(theme.primaryLight, theme.primary)
    .fillColor(theme.text)
    .fontSize(10)
    .font("Helvetica-Bold")
    .text(student.moduleTitle || "Module", 48, 72);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(theme.text)
    .rect(40, 92, 515, 110)
    .stroke(theme.border);

  drawKeyValue(doc, "Apprenant", student.name, 48, 100);
  drawKeyValue(doc, "Classe", student.className || "", 48, 114);
  drawKeyValue(doc, "Enseignant", student.teacher || "", 48, 128);
  drawKeyValue(doc, "Type d'évaluation", student.evaluationType || "", 48, 142);
  drawKeyValue(doc, "Date d'évaluation", formatDate(student.evaluationDate), 48, 156);
  drawKeyValue(doc, "Date de coaching", formatDate(student.coachingDate), 48, 170);

  doc
    .fontSize(9)
    .fillColor(theme.text)
    .text("Note du module", 360, 104)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(student.score || "", 360, 118)
    .font("Helvetica");

  const summaryTitleY = 214;
  const summaryBodyY = summaryTitleY + 12;

  doc
    .fontSize(9)
    .fillColor(theme.text)
    .text("Résumé", 40, summaryTitleY)
    .fontSize(8)
    .fillColor(theme.muted)
    .text(student.note || "-", 40, summaryBodyY, { width: 515 });

  let cursorY = doc.y + 24;
  student.competencies?.forEach((section) => {
    if (cursorY > 700) {
      doc.addPage();
      cursorY = 40;
    }
    drawSectionHeader(doc, section.category, cursorY);
    cursorY += 24;

    doc
      .rect(40, cursorY, 260, 16)
      .fillAndStroke(theme.surfaceMuted, theme.border)
      .rect(300, cursorY, 140, 16)
      .fillAndStroke(theme.surfaceMuted, theme.border)
      .rect(440, cursorY, 70, 16)
      .fillAndStroke(theme.surfaceMuted, theme.border)
      .rect(510, cursorY, 45, 16)
      .fillAndStroke(theme.surfaceMuted, theme.border)
      .fontSize(8)
      .fillColor(theme.text)
      .text("Tâche", 44, cursorY + 4)
      .text("Compétence", 304, cursorY + 4)
      .text("Commentaire", 444, cursorY + 4)
      .text("Éval", 515, cursorY + 4, { width: 40, align: "center" });

    cursorY += 18;

    section.items?.forEach((item) => {
      if (cursorY > 760) {
        doc.addPage();
        cursorY = 40;
      }
      const taskLabel = item.task || item.label || "-";
      const competencyLabel = getCompetencyLabel(
        item,
        student.competencyOptions
      );
      drawCompetencyRow(
        doc,
        taskLabel,
        competencyLabel,
        item.status,
        item.comment,
        cursorY
      );
      cursorY += 18;
    });

    cursorY += 16;
  });

  if (cursorY > 720) {
    doc.addPage();
    cursorY = 40;
  }

  doc
    .roundedRect(40, cursorY, 515, 70, 6)
    .fillAndStroke(theme.primaryLight, theme.primary)
    .fillColor(theme.text)
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Remarques", 48, cursorY + 8)
    .font("Helvetica")
    .fontSize(8)
    .fillColor(theme.muted)
    .text(student.remarks || "-", 48, cursorY + 22, { width: 490 });

  doc.end();
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
