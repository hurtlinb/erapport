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
  const infoBoxY = 40;
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
  const moduleCodeY = operationalBodyY + 20;
  const objectivesBoxY = moduleCodeY + 12;
  const objectivesPadding = 8;
  const objectivesContentWidth = 515 - objectivesPadding * 2;
  const objectivesEntries = student.competencyOptions?.length
    ? student.competencyOptions.map((option) => {
        const description = option.description ? `: ${option.description}` : "";
        return `${option.code || "-"}${description}`;
      })
    : ["-"];
  const objectivesText = objectivesEntries.join("\n");
  const objectivesTextHeight = doc.heightOfString(objectivesText, {
    width: objectivesContentWidth,
    lineGap: 2
  });
  const objectivesBoxHeight = objectivesTextHeight + objectivesPadding * 2 + 12;
  const objectivesTitleY = objectivesBoxY + objectivesPadding - 2;
  const objectivesTextY = objectivesTitleY + 12;

  doc
    .fontSize(10)
    .fillColor(theme.text)
    .font("Helvetica-Bold")
    .text("Compétences opérationnelles :", 40, operationalTitleY)
    .font("Helvetica")
    .fontSize(8)
    .fillColor(theme.text)
    .text(student.operationalCompetence || "-", 40, operationalBodyY, {
      width: 515
    })
    .fontSize(9)
    .fillColor(theme.text)
    .font("Helvetica")
    .text(student.moduleTitle || "-", 40, moduleCodeY, { width: 515 });

  doc
    .lineWidth(0.8)
    .strokeColor("#15803d")
    .rect(40, objectivesBoxY, 515, objectivesBoxHeight)
    .stroke();
  doc
    .fillColor(theme.text)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Objectifs opérationnels", 40 + objectivesPadding, objectivesTitleY, {
      width: objectivesContentWidth
    })
    .font("Helvetica")
    .fontSize(8)
    .fillColor(theme.text)
    .text(objectivesText, 40 + objectivesPadding, objectivesTextY, {
      width: objectivesContentWidth,
      lineGap: 2
    });

  let cursorY = objectivesBoxY + objectivesBoxHeight + 16;
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
