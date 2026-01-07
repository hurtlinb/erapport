import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";

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
    .text(student.name || "-", middleColumnX, infoBoxY + 6, {
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
  const summaryTitleY = operationalBodyY + 20;
  const summaryBodyY = summaryTitleY + 12;

  doc
    .fontSize(9)
    .fillColor(theme.text)
    .text("Compétence opérationnelle", 40, operationalTitleY)
    .fontSize(8)
    .fillColor(theme.muted)
    .text(student.operationalCompetence || "-", 40, operationalBodyY, {
      width: 515
    })
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
