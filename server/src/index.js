import cors from "cors";
import express from "express";
import PDFDocument from "pdfkit";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR");
};

const getStatusStyle = (status) => {
  if (status === "OK") {
    return { fill: "#bbf7d0", text: "#166534" };
  }
  if (status === "NOK") {
    return { fill: "#fed7aa", text: "#9a3412" };
  }
  if (status === "NA") {
    return { fill: "#fecdd3", text: "#9f1239" };
  }
  return { fill: "#f8fafc", text: "#0f172a" };
};

const buildCompetencyLabel = (item, competencyOptions = []) => {
  const taskLabel = item.task || item.label || "";
  const option = competencyOptions.find(
    (candidate) => candidate.code === item.competencyId
  );

  if (option && taskLabel) {
    return `${taskLabel} (${option.code} - ${option.description})`;
  }

  if (option) {
    return `${option.code} - ${option.description}`;
  }

  return taskLabel || "-";
};

const drawKeyValue = (doc, label, value, x, y) => {
  doc
    .fontSize(9)
    .fillColor("#0f172a")
    .text(label, x, y)
    .font("Helvetica-Bold")
    .text(value || "-", x + 140, y)
    .font("Helvetica");
};

const drawSectionHeader = (doc, title, y) => {
  doc
    .roundedRect(40, y, 515, 18, 4)
    .fillAndStroke("#fde68a", "#f59e0b")
    .fillColor("#0f172a")
    .fontSize(10)
    .font("Helvetica-Bold")
    .text(title, 48, y + 4);
  doc.font("Helvetica");
};

const drawCompetencyRow = (doc, label, status, comment, y) => {
  const statusStyle = getStatusStyle(status);
  doc
    .rect(40, y, 400, 18)
    .stroke("#cbd5f5")
    .rect(440, y, 70, 18)
    .stroke("#cbd5f5")
    .rect(510, y, 45, 18)
    .fillAndStroke(statusStyle.fill, "#cbd5f5");
  doc
    .fontSize(8)
    .fillColor("#0f172a")
    .text(label, 44, y + 4, { width: 392 });
  doc
    .fillColor("#334155")
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
    .text("Rapport d'évaluation sommative", 40, 40)
    .font("Helvetica")
    .fontSize(9)
    .text(formatDate(student.evaluationDate), 450, 42, { align: "right" });

  doc
    .roundedRect(40, 64, 515, 24, 6)
    .fillAndStroke("#fcd34d", "#f59e0b")
    .fillColor("#0f172a")
    .fontSize(10)
    .font("Helvetica-Bold")
    .text(student.moduleTitle || "Module", 48, 72);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#0f172a")
    .rect(40, 92, 515, 60)
    .stroke("#cbd5f5");

  drawKeyValue(doc, "Apprenant", student.name, 48, 100);
  drawKeyValue(doc, "Programme", student.cohort, 48, 114);
  drawKeyValue(doc, "Enseignant", student.teacher || "", 48, 128);

  doc
    .fontSize(9)
    .fillColor("#0f172a")
    .text("Note du module", 360, 104)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(student.score || "", 360, 118)
    .font("Helvetica");

  doc
    .fontSize(9)
    .fillColor("#0f172a")
    .text("Résumé", 40, 164)
    .fontSize(8)
    .fillColor("#334155")
    .text(student.note || "-", 40, 176, { width: 515 });

  let cursorY = 210;
  student.competencies?.forEach((section) => {
    if (cursorY > 700) {
      doc.addPage();
      cursorY = 40;
    }
    drawSectionHeader(doc, section.category, cursorY);
    cursorY += 24;

    doc
      .rect(40, cursorY, 400, 16)
      .stroke("#cbd5f5")
      .rect(440, cursorY, 70, 16)
      .stroke("#cbd5f5")
      .rect(510, cursorY, 45, 16)
      .stroke("#cbd5f5")
      .fontSize(8)
      .fillColor("#0f172a")
      .text("Compétence", 44, cursorY + 4)
      .text("Commentaire", 444, cursorY + 4)
      .text("Éval", 515, cursorY + 4, { width: 40, align: "center" });

    cursorY += 18;

    section.items?.forEach((item) => {
      if (cursorY > 760) {
        doc.addPage();
        cursorY = 40;
      }
      const competencyLabel = buildCompetencyLabel(
        item,
        student.competencyOptions
      );
      drawCompetencyRow(
        doc,
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
    .fillAndStroke("#fee2e2", "#fecaca")
    .fillColor("#0f172a")
    .fontSize(9)
    .font("Helvetica-Bold")
    .text("Remarques", 48, cursorY + 8)
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#334155")
    .text(student.remarks || "-", 48, cursorY + 22, { width: 490 });

  doc.end();
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
