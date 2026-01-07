import { useEffect, useMemo, useState } from "react";

const DEFAULT_COMPETENCY_OPTIONS = [
  {
    code: "OO1",
    description:
      "Définir la configuration des services du serveur nécessaires (service d’annuaire, DHCP, DNS, File, Print) conformément aux directives de l’entreprise."
  },
  {
    code: "OO2",
    description:
      "Installer et configurer les services réseau en appliquant les bonnes pratiques de sécurité."
  },
  {
    code: "OO3",
    description:
      "Valider le fonctionnement des services déployés et documenter la configuration."
  }
];

const DEFAULT_COMPETENCIES = [
  {
    category: "Active Directory",
    items: [
      {
        task:
          "Connait les principes théoriques et la terminologie associée au service et concepts d'annuaire",
        competencyId: "OO1"
      },
      {
        task:
          "Est capable d'installer le rôle Active Directory, de promouvoir un DC et de créer un admin du domaine",
        competencyId: "OO2"
      },
      {
        task: "Est capable de joindre des clients/serveurs au domaine",
        competencyId: "OO3"
      }
    ]
  },
  {
    category: "DNS",
    items: [
      {
        task:
          "Connait les principes théoriques, la terminologie et les outils liés aux services et concepts du DNS",
        competencyId: "OO1"
      },
      {
        task:
          "Connait les principes théoriques liés au déroulement d'une résolution DNS",
        competencyId: "OO1"
      },
      {
        task:
          "Est capable de configurer des zones de recherches directes et inverses",
        competencyId: "OO2"
      },
      {
        task:
          "Est capable de configurer des records dans des zones de recherches directes ou inverses et de les tester",
        competencyId: "OO2"
      }
    ]
  },
  {
    category: "DHCP",
    items: [
      {
        task:
          "Connait les principes théoriques et la terminologie associée aux services et concepts du DHCP",
        competencyId: "OO1"
      },
      {
        task:
          "Connait les principes théoriques liés au déroulement de l'attribution d'un bail DHCP",
        competencyId: "OO1"
      },
      {
        task:
          "Est capable d'installer, d'autoriser un service DHCP et de configurer un scope d'adresse et une réservation",
        competencyId: "OO2"
      },
      {
        task:
          "Est capable de configurer les options d'un scope et de tester l'attribution d'un bail à un client",
        competencyId: "OO2"
      }
    ]
  }
];

const EVALUATION_TYPES = ["E1", "E2", "E3"];
const TASK_EVALUATION_METHODS = [
  { value: "Evaluation écrite", label: "📝 Evaluation écrite" },
  { value: "Evaluation pratique", label: "🧪 Evaluation pratique" },
  { value: "Documentation", label: "📚 Documentation" }
];
const SCHOOL_YEARS = ["2024-2025", "2025-2026", "2026-2027"];

const storageKey = "erapport.students";
const templateStorageKey = "erapport.template";
const moduleStorageKey = "erapport.modules";
const statusVersionKey = "erapport.statusVersion";

const STATUS_VALUES = {
  OK: "OK",
  NEEDS_IMPROVEMENT: "~",
  NOT_ASSESSED: "NOK"
};

const getStatusClass = (status) => {
  if (status === STATUS_VALUES.OK) return "status-ok";
  if (status === STATUS_VALUES.NEEDS_IMPROVEMENT) return "status-nok";
  if (status === STATUS_VALUES.NOT_ASSESSED) return "status-na";
  return "status-empty";
};

const migrateStatus = (status) => {
  if (status === "NOK") return STATUS_VALUES.NEEDS_IMPROVEMENT;
  if (status === "NA") return STATUS_VALUES.NOT_ASSESSED;
  return status || "";
};

const defaultTemplate = {
  moduleId: "",
  moduleTitle: "123 - Activer les services d'un serveur",
  schoolYear: "2024-2025",
  note: "",
  evaluationType: EVALUATION_TYPES[0],
  className: "",
  teacher: "",
  evaluationDate: "",
  coachingDate: "",
  operationalCompetence: "",
  competencyOptions: DEFAULT_COMPETENCY_OPTIONS,
  competencies: DEFAULT_COMPETENCIES
};

const normalizeTemplate = (template, module) => {
  const baseTemplate = template || {};
  return {
    ...defaultTemplate,
    ...baseTemplate,
    moduleId: module.id,
    moduleTitle: module.title || "",
    schoolYear: module.schoolYear || "",
    competencyOptions:
      baseTemplate.competencyOptions || defaultTemplate.competencyOptions,
    competencies: baseTemplate.competencies || defaultTemplate.competencies
  };
};

const buildDefaultModule = (overrides = {}, templateOverrides = {}) => {
  const module = {
    id: crypto.randomUUID(),
    title: overrides.title ?? defaultTemplate.moduleTitle,
    schoolYear: overrides.schoolYear ?? defaultTemplate.schoolYear
  };

  return {
    ...module,
    template: normalizeTemplate(templateOverrides, module)
  };
};

const normalizeTemplateItem = (item) => {
  if (typeof item === "string") {
    return { task: item, competencyId: "", evaluationMethod: "" };
  }
  return {
    task: item?.task || "",
    competencyId: item?.competencyId || "",
    evaluationMethod: item?.evaluationMethod || ""
  };
};

const mapTemplateCompetencies = (template, existingCompetencies = []) => {
  const competencies = template?.competencies ?? [];

  return competencies.map((section) => {
    const existingSection = existingCompetencies.find(
      (candidate) => candidate.category === section.category
    );

    const items = section.items || [];

    return {
      category: section.category,
      result: existingSection?.result ?? "",
      items: items.map((item) => {
        const normalizedItem = normalizeTemplateItem(item);
        const existingItem = existingSection?.items?.find((candidate) => {
          return (
            candidate.task === normalizedItem.task ||
            candidate.label === normalizedItem.task
          );
        });

        return {
          task: normalizedItem.task,
          competencyId: normalizedItem.competencyId || existingItem?.competencyId || "",
          evaluationMethod: normalizedItem.evaluationMethod || "",
          status: existingItem?.status ?? "",
          comment: existingItem?.comment || ""
        };
      })
    };
  });
};

const getCompetencyLabel = (item, competencyOptions = []) => {
  const option = competencyOptions.find(
    (candidate) => candidate.code === item.competencyId
  );

  if (option) {
    return `${option.code} - ${option.description}`;
  }

  return "";
};

const applyTemplateToStudent = (template, student) => ({
  ...student,
  moduleId: template.moduleId || "",
  moduleTitle: template.moduleTitle || "",
  schoolYear: template.schoolYear || "",
  note: student.note ?? template.note ?? "",
  evaluationType: template.evaluationType || "",
  className: template.className || "",
  teacher: template.teacher || "",
  evaluationDate: template.evaluationDate || "",
  coachingDate: template.coachingDate || "",
  operationalCompetence: template.operationalCompetence || "",
  competencyOptions: template.competencyOptions || [],
  competencies: mapTemplateCompetencies(template, student.competencies)
});

const getStudentDisplayName = (student) => {
  const firstName = student.firstname?.trim() || "";
  const lastName = student.name?.trim() || "";
  return [firstName, lastName].filter(Boolean).join(" ");
};

const hasStudentIdentity = (student) => getStudentDisplayName(student).length > 0;

const buildStudentFromTemplate = (template) => ({
  id: crypto.randomUUID(),
  name: "",
  firstname: "",
  email: "",
  moduleId: template.moduleId || "",
  moduleTitle: template.moduleTitle || "",
  schoolYear: template.schoolYear || "",
  note: template.note || "",
  remarks: "",
  evaluationType: template.evaluationType || "",
  className: template.className || "",
  teacher: template.teacher || "",
  evaluationDate: template.evaluationDate || "",
  coachingDate: template.coachingDate || "",
  operationalCompetence: template.operationalCompetence || "",
  competencyOptions: template.competencyOptions || [],
  competencies: mapTemplateCompetencies(template)
});

function loadStudents() {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    const students = Array.isArray(parsed) ? parsed : [];
    const shouldMigrateStatuses =
      (localStorage.getItem(statusVersionKey) || "") !== "v2";

    const normalizedStudents = students.map((student) => ({
      ...student,
      firstname: student.firstname || "",
      email: student.email || "",
      competencies: (student.competencies || []).map((section) => ({
        ...section,
        items: (section.items || []).map((item) => ({
          ...item,
          status: shouldMigrateStatuses ? migrateStatus(item.status) : item.status || ""
        }))
      }))
    }));

    if (shouldMigrateStatuses) {
      localStorage.setItem(statusVersionKey, "v2");
    }

    return normalizedStudents;
  } catch (error) {
    console.error(error);
    return [];
  }
}

function saveStudents(students) {
  localStorage.setItem(storageKey, JSON.stringify(students));
}

function loadModules() {
  try {
    const legacyTemplate = (() => {
      try {
        const raw = localStorage.getItem(templateStorageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
          ...defaultTemplate,
          ...parsed,
          competencyOptions:
            parsed.competencyOptions || defaultTemplate.competencyOptions,
          competencies: parsed.competencies || defaultTemplate.competencies
        };
      } catch (error) {
        console.error(error);
        return null;
      }
    })();
    const raw = localStorage.getItem(moduleStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [buildDefaultModule({}, legacyTemplate || {})];
    }
    return parsed.map((module) => ({
      id: module.id || crypto.randomUUID(),
      title: module.title || "",
      schoolYear: module.schoolYear || "",
      template: normalizeTemplate(
        module.template || legacyTemplate || {},
        {
          id: module.id || crypto.randomUUID(),
          title: module.title || "",
          schoolYear: module.schoolYear || ""
        }
      )
    }));
  } catch (error) {
    console.error(error);
    return [buildDefaultModule()];
  }
}

function saveModules(modules) {
  localStorage.setItem(moduleStorageKey, JSON.stringify(modules));
}

function App() {
  const initialModules = useMemo(() => loadModules(), []);
  const [modules, setModules] = useState(initialModules);
  const [template, setTemplate] = useState(
    initialModules[0]?.template || defaultTemplate
  );
  const [activeModuleId, setActiveModuleId] = useState(
    () => template.moduleId || initialModules[0]?.id || ""
  );
  const [students, setStudents] = useState(() => loadStudents());
  const [selectedId, setSelectedId] = useState(students[0]?.id || "");
  const [draft, setDraft] = useState(() => buildStudentFromTemplate(template));
  const [isEditing, setIsEditing] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isImportStudentModalOpen, setIsImportStudentModalOpen] = useState(false);
  const [importStudentText, setImportStudentText] = useState("");
  const [importStudentError, setImportStudentError] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const moduleStudents = useMemo(
    () => students.filter((student) => student.moduleId === activeModuleId),
    [activeModuleId, students]
  );
  const selectedStudent = moduleStudents.find(
    (student) => student.id === selectedId
  );

  useEffect(() => {
    saveStudents(students);
  }, [students]);

  useEffect(() => {
    saveModules(modules);
  }, [modules]);

  useEffect(() => {
    if (selectedStudent) {
      setDraft(applyTemplateToStudent(template, selectedStudent));
      setIsEditing(true);
    } else {
      setDraft(buildStudentFromTemplate(template));
      setIsEditing(false);
    }
  }, [selectedStudent, template]);

  useEffect(() => {
    setStudents((prev) =>
      prev.map((student) =>
        student.moduleId === template.moduleId
          ? applyTemplateToStudent(template, student)
          : student
      )
    );
    setDraft((prev) =>
      prev.moduleId === template.moduleId
        ? applyTemplateToStudent(template, prev)
        : prev
    );
  }, [template]);

  useEffect(() => {
    if (!modules.length) return;
    if (!activeModuleId || !modules.some((module) => module.id === activeModuleId)) {
      setActiveModuleId(modules[0]?.id || "");
    }
  }, [activeModuleId, modules]);

  useEffect(() => {
    setSelectedId((prev) => {
      if (moduleStudents.some((student) => student.id === prev)) {
        return prev;
      }
      return moduleStudents[0]?.id || "";
    });
  }, [moduleStudents]);

  useEffect(() => {
    const activeModule = modules.find((module) => module.id === activeModuleId);
    if (!activeModule) return;
    setTemplate(normalizeTemplate(activeModule.template || {}, activeModule));
  }, [activeModuleId, modules]);

  const studentCountLabel = useMemo(() => {
    return moduleStudents.length === 1
      ? "1 student"
      : `${moduleStudents.length} students`;
  }, [moduleStudents.length]);

  const activeModuleLabel = useMemo(() => {
    if (!template.moduleTitle && !template.schoolYear) return "Not set";
    if (!template.schoolYear) return template.moduleTitle || "Not set";
    return `${template.moduleTitle || "Module"} (${template.schoolYear})`;
  }, [template.moduleTitle, template.schoolYear]);

  const activeModule = useMemo(
    () => modules.find((module) => module.id === activeModuleId) || null,
    [activeModuleId, modules]
  );
  const activeModuleSchoolYear = useMemo(() => {
    if (!activeModule) return SCHOOL_YEARS[0];
    return SCHOOL_YEARS.includes(activeModule.schoolYear)
      ? activeModule.schoolYear
      : SCHOOL_YEARS[0];
  }, [activeModule]);

  const moduleCountLabel = useMemo(() => {
    return modules.length === 1 ? "1 module" : `${modules.length} modules`;
  }, [modules.length]);

  const persistDraftChanges = (updater) => {
    setDraft((prevDraft) => {
      const nextDraft =
        typeof updater === "function" ? updater(prevDraft) : updater;

      setStudents((prevStudents) => {
        const exists = prevStudents.some(
          (student) => student.id === nextDraft.id
        );

        if (exists) {
          return prevStudents.map((student) =>
            student.id === nextDraft.id ? { ...nextDraft } : student
          );
        }

        if (!hasStudentIdentity(nextDraft)) {
          return prevStudents;
        }

        return [...prevStudents, { ...nextDraft }];
      });

      if (hasStudentIdentity(nextDraft)) {
        setSelectedId(nextDraft.id);
        setIsEditing(true);
      }

      return nextDraft;
    });
  };

  const templateCompetencyCount = useMemo(
    () => template.competencyOptions?.length || 0,
    [template.competencyOptions]
  );

  const templateTaskCount = useMemo(() => {
    const sections = template.competencies || [];
    return sections.reduce(
      (total, section) => total + (section.items?.length || 0),
      0
    );
  }, [template.competencies]);

  const handleStudentField = (field, value) => {
    persistDraftChanges((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const updateCompetency = (sectionIndex, itemIndex, field, value) => {
    persistDraftChanges((prev) => ({
      ...prev,
      competencies: (prev.competencies || []).map((section, sIndex) => {
        if (sIndex !== sectionIndex) return section;
        return {
          ...section,
          items: (section.items || []).map((item, iIndex) =>
            iIndex === itemIndex ? { ...item, [field]: value } : item
          )
        };
      })
    }));
  };

  const updateCategoryResult = (sectionIndex, value) => {
    persistDraftChanges((prev) => ({
      ...prev,
      competencies: (prev.competencies || []).map((section, sIndex) =>
        sIndex === sectionIndex ? { ...section, result: value } : section
      )
    }));
  };

  const handleDeleteStudent = (id) => {
    if (!confirm("Delete this student?")) return;
    setStudents((prev) => prev.filter((student) => student.id !== id));
    if (selectedId === id) {
      setSelectedId("");
    }
  };

  const handleImportStudents = () => {
    setImportStudentText("");
    setImportStudentError("");
    setIsImportStudentModalOpen(true);
  };

  const parseImportLines = (text) => {
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!rows.length) return [];

    const headerRow = rows[0].toLowerCase();
    const hasHeader =
      headerRow.includes("nom") && headerRow.includes("prenom");

    const dataRows = hasHeader ? rows.slice(1) : rows;

    return dataRows
      .map((row) => row.split("\t").map((value) => value.trim()))
      .filter((columns) => columns.length >= 2);
  };

  const handleCreateStudentsFromImport = (event) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }

    const rows = parseImportLines(importStudentText);

    if (!rows.length) {
      setImportStudentError(
        "Paste at least one row with a last name and first name."
      );
      return;
    }

    const importedStudents = rows.map(([lastName, firstName, email]) => ({
      ...buildStudentFromTemplate(template),
      name: lastName || "",
      firstname: firstName || "",
      email: email || ""
    }));

    setStudents((prev) => [...prev, ...importedStudents]);
    setSelectedId(importedStudents[0]?.id || "");
    setIsEditing(true);
    setIsImportStudentModalOpen(false);
    setImportStudentText("");
    setImportStudentError("");
  };

  const handleGeneratePdf = async () => {
    if (!hasStudentIdentity(draft)) {
      alert("Please enter the student's name.");
      return;
    }
    const response = await fetch("http://localhost:3001/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });

    if (!response.ok) {
      alert("Unable to generate the PDF.");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${getStudentDisplayName(draft)}-evaluation-report.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const updateTemplate = (updater) => {
    setTemplate((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      setModules((prevModules) =>
        prevModules.map((module) =>
          module.id === activeModuleId
            ? { ...module, template: normalizeTemplate(next, module) }
            : module
        )
      );
      return next;
    });
  };

  const handleTemplateField = (field, value) => {
    updateTemplate((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTemplateCategoryChange = (sectionIndex, value) => {
    updateTemplate((prev) => ({
      ...prev,
      competencies: (prev.competencies || []).map((section, sIndex) =>
        sIndex === sectionIndex ? { ...section, category: value } : section
      )
    }));
  };

  const handleTemplateTaskFieldChange = (
    sectionIndex,
    itemIndex,
    field,
    value
  ) => {
    updateTemplate((prev) => ({
      ...prev,
      competencies: (prev.competencies || []).map((section, sIndex) => {
        if (sIndex !== sectionIndex) return section;
        return {
          ...section,
          items: (section.items || []).map((item, iIndex) => {
            if (iIndex !== itemIndex) return item;
            const normalizedItem = normalizeTemplateItem(item);
            return { ...normalizedItem, [field]: value };
          })
        };
      })
    }));
  };

  const handleAddCategory = () => {
    updateTemplate((prev) => ({
      ...prev,
      competencies: [
        ...(prev.competencies || []),
        {
          category: "New category",
          items: [
            {
              task: "New task",
              competencyId: prev.competencyOptions?.[0]?.code || "",
              evaluationMethod: ""
            }
          ]
        }
      ]
    }));
  };

  const handleRemoveCategory = (sectionIndex) => {
    updateTemplate((prev) => ({
      ...prev,
      competencies: (prev.competencies || []).filter(
        (_, index) => index !== sectionIndex
      )
    }));
  };

  const handleAddCompetencyOption = () => {
    updateTemplate((prev) => ({
      ...prev,
      competencyOptions: [
        ...(prev.competencyOptions || []),
        {
          code: `OO${(prev.competencyOptions?.length || 0) + 1}`,
          description: "Nouvelle compétence"
        }
      ]
    }));
  };

  const handleCompetencyOptionChange = (index, field, value) => {
    updateTemplate((prev) => ({
      ...prev,
      competencyOptions: (prev.competencyOptions || []).map(
        (option, optIndex) =>
          optIndex === index ? { ...option, [field]: value } : option
      )
    }));
  };

  const handleRemoveCompetencyOption = (index) => {
    updateTemplate((prev) => {
      const removedCode = prev.competencyOptions?.[index]?.code;
      const updatedOptions = (prev.competencyOptions || []).filter(
        (_, optIndex) => optIndex !== index
      );

      return {
        ...prev,
        competencyOptions: updatedOptions,
        competencies: (prev.competencies || []).map((section) => ({
          ...section,
          items: (section.items || []).map((item) => {
            const normalizedItem = normalizeTemplateItem(item);
            if (normalizedItem.competencyId === removedCode) {
              return { ...normalizedItem, competencyId: "" };
            }
            return normalizedItem;
          })
        }))
      };
    });
  };

  const handleAddTask = (sectionIndex) => {
    updateTemplate((prev) => ({
      ...prev,
      competencies: (prev.competencies || []).map((section, sIndex) =>
        sIndex === sectionIndex
          ? {
              ...section,
              items: [
                ...(section.items || []),
                {
                  task: "New task",
                  competencyId: prev.competencyOptions?.[0]?.code || "",
                  evaluationMethod: ""
                }
              ]
            }
          : section
      )
    }));
  };

  const handleRemoveTask = (sectionIndex, itemIndex) => {
    updateTemplate((prev) => ({
      ...prev,
      competencies: (prev.competencies || []).map((section, sIndex) => {
        if (sIndex !== sectionIndex) return section;
        return {
          ...section,
          items: (section.items || []).filter(
            (_, iIndex) => iIndex !== itemIndex
          )
        };
      })
    }));
  };

  const handleAddModule = () => {
    const newModule = buildDefaultModule({
      title: "New module",
      schoolYear: defaultTemplate.schoolYear
    });
    setModules((prev) => [...prev, newModule]);
    setActiveModuleId(newModule.id);
  };

  const handleModuleFieldChange = (moduleId, field, value) => {
    setModules((prev) =>
      prev.map((module) => {
        if (module.id !== moduleId) return module;
        const updatedModule = { ...module, [field]: value };
        return {
          ...updatedModule,
          template: normalizeTemplate(module.template || {}, updatedModule)
        };
      })
    );
  };

  const handleRemoveModule = (moduleId) => {
    if (!confirm("Delete this module?")) return;
    setModules((prev) => prev.filter((module) => module.id !== moduleId));
    if (activeModuleId === moduleId) {
      setActiveModuleId("");
    }
  };

  const handleApplyTemplate = () => {
    setStudents((prev) =>
      prev.map((student) =>
        student.moduleId === template.moduleId
          ? applyTemplateToStudent(template, student)
          : student
      )
    );
    setDraft((prev) =>
      prev.moduleId === template.moduleId
        ? applyTemplateToStudent(template, prev)
        : prev
    );
    setIsTemplateModalOpen(false);
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Evaluation Report Builder</p>
          <h1>Generate student evaluation reports in minutes</h1>
          <p className="subtitle">
            Manage your student list, fill in competencies, and export PDFs that
            match the official summary sheet.
          </p>
        </div>
        <div className="hero-card">
          <div>
            <p className="label">Students</p>
            <p className="value">{studentCountLabel}</p>
          </div>
          <div>
            <p className="label">Active module</p>
            <p className="value">{activeModuleLabel}</p>
          </div>
          <div>
            <p className="label">Modules</p>
            <p className="value">{moduleCountLabel}</p>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="panel template-panel">
          <div className="panel-header">
            <div>
              <h2>Report template</h2>
              <p className="helper-text">
                Configure the shared information and task list used for every new
                report.
              </p>
            </div>
            <div className="actions">
              <button
                className="button primary"
                type="button"
                onClick={() => setIsTemplateModalOpen(true)}
              >
                Modify template
              </button>
              <button className="button primary" onClick={handleAddModule}>
                New module
              </button>
            </div>
          </div>

          <div className="module-selector">
            <label>
              Active module
              <select
                value={activeModuleId}
                onChange={(event) => setActiveModuleId(event.target.value)}
              >
                {modules.map((module) => {
                  const title = module.title || "Module";
                  const yearLabel = module.schoolYear
                    ? ` (${module.schoolYear})`
                    : "";
                  return (
                    <option key={module.id} value={module.id}>
                      {title}
                      {yearLabel}
                    </option>
                  );
                })}
              </select>
            </label>
            <p className="helper-text">
              Switch modules to load their specific template and student list.
            </p>
          </div>

          <div className="template-summary">
            <div className="summary-pill">
              <span className="pill-label">Module</span>
              <span className="pill-value">
                {activeModuleLabel}
              </span>
            </div>
            <div className="summary-pill">
              <span className="pill-label">School year</span>
              <span className="pill-value">
                {template.schoolYear || "Not set"}
              </span>
            </div>
            <div className="summary-pill">
              <span className="pill-label">Competencies</span>
              <span className="pill-value">{templateCompetencyCount}</span>
            </div>
            <div className="summary-pill">
              <span className="pill-label">Categories</span>
              <span className="pill-value">
                {(template.competencies || []).length}
              </span>
            </div>
            <div className="summary-pill">
              <span className="pill-label">Tasks</span>
              <span className="pill-value">{templateTaskCount}</span>
            </div>
          </div>

          <p className="helper-text">
            Use the Modify template button to edit details, update competencies, and
            apply them to all existing reports.
          </p>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Student list</h2>
            <button className="button ghost" onClick={handleImportStudents}>
              Import students
            </button>
          </div>
          <ul className="student-list">
            {moduleStudents.length === 0 && (
              <li className="empty">
                No students yet for this module. Import a list to get started.
              </li>
            )}
            {moduleStudents.map((student) => (
              <li
                key={student.id}
                className={
                  selectedId === student.id
                    ? "student-card active"
                    : "student-card"
                }
                onClick={() => setSelectedId(student.id)}
              >
                <div>
                  <p className="student-name">
                    {getStudentDisplayName(student) || "Unnamed student"}
                  </p>
                </div>
                <button
                  className="button text"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteStudent(student.id);
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel form-panel">
          <div className="panel-header">
            <h2>
              {isEditing
                ? getStudentDisplayName(draft) || "Edit report"
                : "New report"}
            </h2>
            <div className="actions">
              <button className="button primary" onClick={handleGeneratePdf}>
                Generate PDF
              </button>
            </div>
          </div>

          <div className="details-toggle-row">
            <button
              type="button"
              className="button ghost details-toggle"
              onClick={() => setShowDetails((prev) => !prev)}
              aria-expanded={showDetails}
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
          </div>
          {showDetails && (
            <div className="form-grid details-grid">
              <label>
                Last name
                <input
                  type="text"
                  value={draft.name}
                  readOnly
                  placeholder="Doe"
                />
              </label>
              <label>
                First name
                <input
                  type="text"
                  value={draft.firstname}
                  readOnly
                  placeholder="Jane"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={draft.email}
                  readOnly
                  placeholder="student@example.com"
                />
              </label>
              <label>
                School year
                <input
                  type="text"
                  value={draft.schoolYear}
                  readOnly
                  disabled
                  placeholder="2024-2025"
                />
              </label>
              <label>
                Evaluation type
                <input
                  type="text"
                  value={draft.evaluationType}
                  readOnly
                  disabled
                  placeholder="E1, E2, or E3"
                />
              </label>
              <label>
                Class
                <input
                  type="text"
                  value={draft.className}
                  readOnly
                  disabled
                  placeholder="Class set in template"
                />
              </label>
              <label>
                Teacher
                <input
                  type="text"
                  value={draft.teacher}
                  readOnly
                  disabled
                  placeholder="Teacher set in template"
                />
              </label>
              <label>
                Evaluation date
                <input
                  type="date"
                  value={draft.evaluationDate}
                  readOnly
                  disabled
                />
              </label>
              <label>
                Coaching date
                <input
                  type="date"
                  value={draft.coachingDate}
                  readOnly
                  disabled
                />
              </label>
              <label>
                Module title
                <input
                  type="text"
                  value={draft.moduleTitle}
                  readOnly
                  disabled
                />
              </label>
              <label>
                Operational competence
                <input
                  type="text"
                  value={draft.operationalCompetence}
                  readOnly
                  disabled
                  placeholder="Set in template"
                />
              </label>
            </div>
          )}

          <div className="textarea-block">
            <label>
              Teacher remarks
              <textarea
                rows="3"
                value={draft.remarks}
                onChange={(event) =>
                  handleStudentField("remarks", event.target.value)
                }
                placeholder="Additional notes, remediation plan, etc."
              />
            </label>
          </div>

          <div className="report-summary">
            <div className="report-summary-header">
              <h3>Summary</h3>
              <p className="helper-text">
                Categories and results overview (read-only).
              </p>
            </div>
            {(draft.competencies || []).length ? (
              <table className="report-summary-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {(draft.competencies || []).map((section, sectionIndex) => {
                    const statusClass = getStatusClass(section.result);
                    return (
                      <tr
                        key={`${section.category}-${sectionIndex}`}
                        className={`report-summary-row ${statusClass}`}
                      >
                        <td className="summary-category">
                          {section.category || "—"}
                        </td>
                        <td className="summary-result">
                          <span className="summary-result-value">
                            {section.result || "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="report-summary-note-row">
                    <td className="summary-category summary-note-spacer">
                      &nbsp;
                    </td>
                    <td className="summary-result summary-note-cell">
                      <span className="summary-note-label">Note du module</span>
                      <select
                        className="summary-note-select"
                        value={draft.note}
                        onChange={(event) =>
                          handleStudentField("note", event.target.value)
                        }
                        aria-label="Note du module"
                      >
                        <option value="">Select note</option>
                        {[6, 5, 4, 3, 2, 1].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="helper-text">No categories yet.</p>
            )}
          </div>

          <div className="competency-grid">
            {(draft.competencies || []).map((section, sectionIndex) => (
              <div key={section.category} className="competency-section">
                <div className="competency-section-header">
                  <label className="category-result">
                    <select
                      className={`status-select ${getStatusClass(section.result)}`}
                      value={section.result}
                      aria-label="Category result"
                      onChange={(event) =>
                        updateCategoryResult(sectionIndex, event.target.value)
                      }
                    >
                      <option value="">Select result</option>
                      <option value={STATUS_VALUES.OK}>OK</option>
                      <option value={STATUS_VALUES.NEEDS_IMPROVEMENT}>~</option>
                      <option value={STATUS_VALUES.NOT_ASSESSED}>NOK</option>
                    </select>
                  </label>
                  <h3>{section.category}</h3>
                </div>
                <div className="competency-table">
                  {(section.items || []).map((item, itemIndex) => {
                    const competencyLabel = getCompetencyLabel(
                      item,
                      draft.competencyOptions
                    );
                    const taskLabel = item.task || item.label || "Task";
                    const statusClass = getStatusClass(item.status);

                    return (
                      <div
                        key={`${item.task}-${itemIndex}`}
                        className={`competency-row ${statusClass}`}
                      >
                        <div>
                          <p className="competency-label">{taskLabel}</p>
                          <div className="competency-meta-row">
                            <p className="competency-tag">
                              {competencyLabel || "No competency linked"}
                            </p>
                          </div>
                          <input
                            type="text"
                            value={item.comment}
                            onChange={(event) =>
                              updateCompetency(
                                sectionIndex,
                                itemIndex,
                                "comment",
                                event.target.value
                              )
                            }
                            placeholder="Optional comment"
                          />
                        </div>
                        <select
                          className={`status-select ${statusClass}`}
                          value={item.status}
                          onChange={(event) =>
                            updateCompetency(
                              sectionIndex,
                              itemIndex,
                              "status",
                              event.target.value
                            )
                          }
                        >
                          <option value="">Select status</option>
                          <option value={STATUS_VALUES.OK}>OK</option>
                          <option value={STATUS_VALUES.NEEDS_IMPROVEMENT}>~</option>
                          <option value={STATUS_VALUES.NOT_ASSESSED}>NOK</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {isImportStudentModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal modal--compact">
            <div className="modal-header">
              <div>
                <h2>Import students</h2>
                <p className="helper-text">
                  Paste rows from Excel with columns: nom, prenom, email.
                </p>
              </div>
              <button
                className="button ghost"
                onClick={() => setIsImportStudentModalOpen(false)}
              >
                Close
              </button>
            </div>
            <form onSubmit={handleCreateStudentsFromImport}>
              <label>
                Student list
                <textarea
                  rows="6"
                  value={importStudentText}
                  onChange={(event) => {
                    setImportStudentText(event.target.value);
                    setImportStudentError("");
                  }}
                  placeholder="nom	prenom	email"
                  autoFocus
                />
              </label>
              {importStudentError && (
                <p className="helper-text error-text">{importStudentError}</p>
              )}
              <div className="actions align-start modal-actions">
                <div className="action-row">
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => setIsImportStudentModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="button primary">
                    Import students
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {isTemplateModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2>Modify template</h2>
                <p className="helper-text">
                  Edit the default module info and competencies for new reports.
                </p>
              </div>
              <button
                className="button ghost"
                onClick={() => setIsTemplateModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="template-competency-grid">
              <div className="template-competency">
                <div className="template-competency-header">
                  <div className="category-name">
                    <span className="badge">Active module</span>
                    <p className="helper-text">
                      Update the module information used in the active template.
                    </p>
                  </div>
                </div>
                {activeModule ? (
                  <>
                    <div className="form-grid">
                      <label>
                        Module title
                        <input
                          type="text"
                          value={activeModule.title}
                          onChange={(event) =>
                            handleModuleFieldChange(
                              activeModule.id,
                              "title",
                              event.target.value
                            )
                          }
                          placeholder="123 - Activer les services d'un serveur"
                        />
                      </label>
                      <label>
                        School year
                        <select
                          value={activeModuleSchoolYear}
                          onChange={(event) =>
                            handleModuleFieldChange(
                              activeModule.id,
                              "schoolYear",
                              event.target.value
                            )
                          }
                        >
                          {SCHOOL_YEARS.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="module-evaluations">
                      {EVALUATION_TYPES.map((type) => (
                        <span key={type} className="module-chip">
                          {type}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="helper-text">
                    No active module selected.
                  </p>
                )}
              </div>
            </div>

            <div className="form-grid">
              <label>
                Default summary
                <textarea
                  rows="2"
                  value={template.note}
                  onChange={(event) =>
                    handleTemplateField("note", event.target.value)
                  }
                  placeholder="Text that will appear in the summary for new reports."
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Evaluation type
                <select
                  value={template.evaluationType}
                  onChange={(event) =>
                    handleTemplateField("evaluationType", event.target.value)
                  }
                >
                  {EVALUATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Class
                <input
                  type="text"
                  value={template.className}
                  onChange={(event) =>
                    handleTemplateField("className", event.target.value)
                  }
                  placeholder="INFO-F12, LOG-B21..."
                />
              </label>
              <label>
                Teacher
                <input
                  type="text"
                  value={template.teacher}
                  onChange={(event) =>
                    handleTemplateField("teacher", event.target.value)
                  }
                  placeholder="Prof. Martin"
                />
              </label>
              <label>
                Evaluation date
                <input
                  type="date"
                  value={template.evaluationDate}
                  onChange={(event) =>
                    handleTemplateField("evaluationDate", event.target.value)
                  }
                />
              </label>
              <label>
                Coaching date
                <input
                  type="date"
                  value={template.coachingDate}
                  onChange={(event) =>
                    handleTemplateField("coachingDate", event.target.value)
                  }
                />
              </label>
              <label>
                Operational competence
                <input
                  type="text"
                  value={template.operationalCompetence}
                  onChange={(event) =>
                    handleTemplateField("operationalCompetence", event.target.value)
                  }
                  placeholder="OP1, OP2, etc."
                />
              </label>
            </div>

            <div className="template-competency-grid">
              <div className="template-competency">
                <div className="template-competency-header">
                  <div className="category-name">
                    <span className="badge">Competency list</span>
                    <p className="helper-text">
                      Configure numbered competencies available for every task.
                    </p>
                  </div>
                  <button
                    className="button ghost"
                    onClick={handleAddCompetencyOption}
                  >
                    + Add competency
                  </button>
                </div>
                <div className="template-tasks">
                  {template.competencyOptions?.map((option, index) => (
                    <div key={option.code} className="template-task-row">
                      <input
                        type="text"
                        value={option.code}
                        onChange={(event) =>
                          handleCompetencyOptionChange(
                            index,
                            "code",
                            event.target.value
                          )
                        }
                        placeholder="OO1"
                      />
                      <textarea
                        rows="2"
                        value={option.description}
                        onChange={(event) =>
                          handleCompetencyOptionChange(
                            index,
                            "description",
                            event.target.value
                          )
                        }
                        placeholder="Définir la configuration..."
                      />
                      <button
                        className="button text"
                        onClick={() => handleRemoveCompetencyOption(index)}
                        aria-label="Remove competency"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="template-competency-grid">
              {(template.competencies || []).map((section, sectionIndex) => (
                <div key={sectionIndex} className="template-competency">
                  <div className="template-competency-header">
                    <div className="category-name">
                      <span className="badge">Category</span>
                      <input
                        type="text"
                        className="category-input"
                        value={section.category}
                        onChange={(event) =>
                          handleTemplateCategoryChange(
                            sectionIndex,
                            event.target.value
                          )
                        }
                      />
                    </div>
                    <button
                      className="button text"
                      onClick={() => handleRemoveCategory(sectionIndex)}
                      aria-label="Remove category"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="template-tasks">
                    {section.items.map((item, itemIndex) => {
                      const normalizedItem = normalizeTemplateItem(item);
                      return (
                        <div
                          key={itemIndex}
                          className="template-task-row template-task-row--task"
                        >
                          <input
                            type="text"
                            value={normalizedItem.task}
                            onChange={(event) =>
                              handleTemplateTaskFieldChange(
                                sectionIndex,
                                itemIndex,
                                "task",
                                event.target.value
                              )
                            }
                          />
                          <select
                            value={normalizedItem.competencyId}
                            onChange={(event) =>
                              handleTemplateTaskFieldChange(
                                sectionIndex,
                                itemIndex,
                                "competencyId",
                                event.target.value
                              )
                            }
                          >
                            <option value="">Select competency</option>
                            {template.competencyOptions?.map((option) => (
                              <option key={option.code} value={option.code}>
                                {option.code}
                              </option>
                            ))}
                          </select>
                          <select
                            value={normalizedItem.evaluationMethod}
                            onChange={(event) =>
                              handleTemplateTaskFieldChange(
                                sectionIndex,
                                itemIndex,
                                "evaluationMethod",
                                event.target.value
                              )
                            }
                          >
                            <option value="">Select evaluation</option>
                            {TASK_EVALUATION_METHODS.map((method) => (
                              <option key={method.value} value={method.value}>
                                {method.label}
                              </option>
                            ))}
                          </select>
                          <button
                            className="button text"
                            onClick={() =>
                              handleRemoveTask(sectionIndex, itemIndex)
                            }
                            aria-label="Remove task"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                    <button
                      className="button ghost"
                      onClick={() => handleAddTask(sectionIndex)}
                    >
                      + Add task
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="actions align-start modal-actions">
              <div className="action-row">
                <button className="button ghost" onClick={handleAddCategory}>
                  + Add category
                </button>
                <button className="button primary" onClick={handleApplyTemplate}>
                  Apply to all reports
                </button>
              </div>
              <p className="helper-text">
                Applying will update every existing student report with the latest
                template values.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
