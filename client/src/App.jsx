import { useEffect, useMemo, useRef, useState } from "react";

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
const SCHOOL_YEARS = ["2024-2025", "2025-2026"];
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const AUTH_STORAGE_KEY = "erapport.auth";

const STATUS_VALUES = {
  OK: "OK",
  NEEDS_IMPROVEMENT: "~",
  NOT_ASSESSED: "NOK"
};
const EVALUATION_COPY_PAIRS = [
  { source: "E1", target: "E2" },
  { source: "E2", target: "E3" }
];

const loadStoredAuth = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user) return null;
    return parsed;
  } catch (error) {
    console.error(error);
    return null;
  }
};

const persistStoredAuth = (payload) => {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error(error);
  }
};

const clearStoredAuth = () => {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (error) {
    console.error(error);
  }
};

const getStatusClass = (status) => {
  if (status === STATUS_VALUES.OK) return "status-ok";
  if (status === STATUS_VALUES.NEEDS_IMPROVEMENT) return "status-nok";
  if (status === STATUS_VALUES.NOT_ASSESSED) return "status-na";
  return "status-empty";
};

const getStudentNoteClass = (note) => {
  const numericNote = Number(note);
  if ([4, 5, 6].includes(numericNote)) return "note-ok";
  if ([1, 2, 3].includes(numericNote)) return "note-nok";
  return "";
};

const defaultTemplate = {
  moduleId: "",
  moduleTitle: "123 - Activer les services d'un serveur",
  schoolYear: "2024-2025",
  note: "",
  evaluationType: EVALUATION_TYPES[0],
  groupFeatureEnabled: false,
  className: "",
  teacher: "",
  evaluationDate: "",
  coachingDate: "",
  operationalCompetence: "",
  competencyOptions: DEFAULT_COMPETENCY_OPTIONS,
  competencies: DEFAULT_COMPETENCIES
};

const EMPTY_TEMPLATE = {
  competencyOptions: [],
  competencies: []
};

const normalizeTemplate = (template, module, schoolYearLabel, evaluationType) => {
  const baseTemplate = template || {};
  return {
    ...defaultTemplate,
    ...baseTemplate,
    moduleId: module.id,
    moduleTitle: module.title || "",
    schoolYear: schoolYearLabel || "",
    evaluationType:
      evaluationType || baseTemplate.evaluationType || defaultTemplate.evaluationType,
    groupFeatureEnabled: Boolean(baseTemplate.groupFeatureEnabled),
    competencyOptions:
      baseTemplate.competencyOptions || defaultTemplate.competencyOptions,
    competencies: baseTemplate.competencies || defaultTemplate.competencies
  };
};

const normalizeModuleTemplates = (module, schoolYearLabel) => {
  const hasExplicitTemplates =
    module.templates && typeof module.templates === "object";
  const baseTemplates = hasExplicitTemplates ? { ...module.templates } : {};
  if (!hasExplicitTemplates && module.template && !baseTemplates[EVALUATION_TYPES[0]]) {
    baseTemplates[EVALUATION_TYPES[0]] = module.template;
  }

  const normalizedTemplates = {};
  const templateTypes = Object.keys(baseTemplates).filter((type) =>
    EVALUATION_TYPES.includes(type)
  );
  if (templateTypes.length === 0) {
    const defaultType = EVALUATION_TYPES[0];
    normalizedTemplates[defaultType] = normalizeTemplate(
      {},
      module,
      schoolYearLabel,
      defaultType
    );
    return normalizedTemplates;
  }

  templateTypes.forEach((type) => {
    normalizedTemplates[type] = normalizeTemplate(
      baseTemplates[type] || {},
      module,
      schoolYearLabel,
      type
    );
  });

  return normalizedTemplates;
};

const getAvailableEvaluationTypes = (module) => {
  if (!module?.templates) return [EVALUATION_TYPES[0]];
  const availableTypes = EVALUATION_TYPES.filter((type) =>
    Boolean(module.templates[type])
  );
  return availableTypes.length ? availableTypes : [];
};

const isEvaluationTypeAvailable = (module, type) =>
  Boolean(module?.templates?.[type]);

const buildDefaultModule = (
  overrides = {},
  templateOverrides = {},
  schoolYearLabel = defaultTemplate.schoolYear
) => {
  const module = {
    id: crypto.randomUUID(),
    title: overrides.title ?? defaultTemplate.moduleTitle,
    schoolYear: overrides.schoolYear ?? schoolYearLabel
  };

  return {
    ...module,
    templates: normalizeModuleTemplates(
      {
        ...module,
        templates: {
          [EVALUATION_TYPES[0]]: templateOverrides
        }
      },
      schoolYearLabel
    )
  };
};

const getStudentEvaluationType = (student) =>
  student.evaluationType || EVALUATION_TYPES[0];

const getModuleTemplate = (module, schoolYearLabel, evaluationType) => {
  const templates = normalizeModuleTemplates(module, schoolYearLabel);
  return templates[evaluationType] || templates[EVALUATION_TYPES[0]];
};

const normalizeModules = (modules = [], schoolYearLabel) => {
  if (!Array.isArray(modules) || modules.length === 0) {
    return [];
  }

  return modules.map((module) => {
    const normalizedModule = {
      id: module.id || crypto.randomUUID(),
      title: module.title || "",
      schoolYear: module.schoolYear || schoolYearLabel
    };

    return {
      ...normalizedModule,
      templates: normalizeModuleTemplates(
        {
          ...normalizedModule,
          templates: normalizeModuleTemplates(module, schoolYearLabel)
        },
        schoolYearLabel
      )
    };
  });
};

const normalizeSchoolYears = (schoolYears = [], modules = []) => {
  if (Array.isArray(schoolYears) && schoolYears.length > 0) {
    const normalizedYears = schoolYears.map((schoolYear) => {
      const label =
        schoolYear.label ||
        schoolYear.schoolYear ||
        schoolYear.year ||
        defaultTemplate.schoolYear;
      return {
        id: schoolYear.id || crypto.randomUUID(),
        label,
        modules: normalizeModules(schoolYear.modules || [], label)
      };
    });
    const existingLabels = new Set(normalizedYears.map((year) => year.label));
    SCHOOL_YEARS.forEach((label) => {
      if (existingLabels.has(label)) return;
      normalizedYears.push({
        id: crypto.randomUUID(),
        label,
        modules: normalizeModules([], label)
      });
    });
    return normalizedYears;
  }

  if (Array.isArray(modules) && modules.length > 0) {
    const groupedModules = modules.reduce((acc, module) => {
      const label = module.schoolYear || defaultTemplate.schoolYear;
      if (!acc[label]) {
        acc[label] = [];
      }
      const { schoolYear, ...rest } = module;
      acc[label].push(rest);
      return acc;
    }, {});

    const normalizedYears = Object.entries(groupedModules).map(
      ([label, yearModules]) => ({
        id: crypto.randomUUID(),
        label,
        modules: normalizeModules(yearModules, label)
      })
    );
    const existingLabels = new Set(normalizedYears.map((year) => year.label));
    SCHOOL_YEARS.forEach((label) => {
      if (existingLabels.has(label)) return;
      normalizedYears.push({
        id: crypto.randomUUID(),
        label,
        modules: normalizeModules([], label)
      });
    });
    return normalizedYears;
  }

  return SCHOOL_YEARS.map((label) => ({
    id: crypto.randomUUID(),
    label,
    modules: normalizeModules([], label)
  }));
};

const buildDefaultSchoolYear = (label = defaultTemplate.schoolYear) => ({
  id: crypto.randomUUID(),
  label,
  modules: normalizeModules([], label)
});

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
      groupEvaluation: section.groupEvaluation ?? false,
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

const applyTemplateToStudent = (template, student, teacherId = "") => ({
  ...student,
  moduleId: template.moduleId || "",
  moduleTitle: template.moduleTitle || "",
  schoolYear: template.schoolYear || "",
  note: student.note ?? template.note ?? "",
  groupName: student.groupName || "",
  evaluationType: template.evaluationType || "",
  className: template.className || "",
  teacher: template.teacher || "",
  teacherId: student.teacherId || teacherId || "",
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

const hasStudentIdentity = (student) => getStudentDisplayName(student).length > 0;
const getStudentGroupName = (student) => student.groupName?.trim() || "";

const syncGroupEvaluations = (student, groupName, studentsPool) => {
  if (!groupName) {
    return { ...student, groupName };
  }

  const peerStudent = studentsPool.find(
    (candidate) =>
      candidate.id !== student.id &&
      candidate.moduleId === student.moduleId &&
      getStudentEvaluationType(candidate) === getStudentEvaluationType(student) &&
      getStudentGroupName(candidate) === groupName
  );

  if (!peerStudent) {
    return { ...student, groupName };
  }

  const peerCompetencies = peerStudent.competencies || [];
  const updatedCompetencies = (student.competencies || []).map(
    (section, sectionIndex) => {
      if (!section.groupEvaluation) return section;
      const peerSection = peerCompetencies[sectionIndex];
      if (!peerSection) return section;
      return {
        ...section,
        result: peerSection.result ?? "",
        items: (section.items || []).map((item, itemIndex) => {
          const peerItem = peerSection.items?.[itemIndex];
          if (!peerItem) return item;
          return {
            ...item,
            status: peerItem.status ?? "",
            comment: peerItem.comment ?? ""
          };
        })
      };
    }
  );

  return {
    ...student,
    groupName,
    competencies: updatedCompetencies
  };
};

const buildStudentFromTemplate = (template, teacherId = "") => ({
  id: crypto.randomUUID(),
  name: "",
  firstname: "",
  email: "",
  moduleId: template.moduleId || "",
  moduleTitle: template.moduleTitle || "",
  schoolYear: template.schoolYear || "",
  note: template.note || "",
  remarks: "",
  groupName: "",
  evaluationType: template.evaluationType || "",
  className: template.className || "",
  teacher: template.teacher || "",
  teacherId,
  evaluationDate: template.evaluationDate || "",
  coachingDate: template.coachingDate || "",
  operationalCompetence: template.operationalCompetence || "",
  competencyOptions: template.competencyOptions || [],
  competencies: mapTemplateCompetencies(template)
});

const cloneStudentReport = (student, evaluationType) => {
  const clonedStudent = JSON.parse(JSON.stringify(student));
  return {
    ...clonedStudent,
    id: crypto.randomUUID(),
    evaluationType
  };
};

function App() {
  const [authUser, setAuthUser] = useState(() => loadStoredAuth()?.user || null);
  const [authToken, setAuthToken] = useState(() => loadStoredAuth()?.token || "");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [schoolYears, setSchoolYears] = useState([]);
  const [template, setTemplate] = useState(defaultTemplate);
  const [activeSchoolYearId, setActiveSchoolYearId] = useState("");
  const [activeModuleId, setActiveModuleId] = useState("");
  const [activeEvaluationType, setActiveEvaluationType] = useState(
    EVALUATION_TYPES[0]
  );
  const [students, setStudents] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(() =>
    buildStudentFromTemplate(defaultTemplate, authUser?.id)
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isImportStudentModalOpen, setIsImportStudentModalOpen] = useState(false);
  const [isCopyStudentsModalOpen, setIsCopyStudentsModalOpen] = useState(false);
  const [importStudentText, setImportStudentText] = useState("");
  const [importStudentError, setImportStudentError] = useState("");
  const [copyStudentSelections, setCopyStudentSelections] = useState({});
  const [copyConfig, setCopyConfig] = useState(EVALUATION_COPY_PAIRS[0]);
  const [showDetails, setShowDetails] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const isHydratedRef = useRef(false);
  const isAuthenticated = Boolean(authToken && authUser);
  const teacherId = authUser?.id || "";
  const teacherName = useMemo(
    () => authUser?.name || authUser?.email || "",
    [authUser]
  );
  const moduleStudents = useMemo(
    () =>
      students.filter(
        (student) =>
          student.moduleId === activeModuleId &&
          getStudentEvaluationType(student) === activeEvaluationType
      ),
    [activeEvaluationType, activeModuleId, students]
  );
  const groupOptions = useMemo(() => {
    const groupSet = new Set();
    moduleStudents.forEach((student) => {
      const groupName = getStudentGroupName(student);
      if (groupName) {
        groupSet.add(groupName);
      }
    });
    return Array.from(groupSet);
  }, [moduleStudents]);
  const selectedStudent = moduleStudents.find(
    (student) => student.id === selectedId
  );
  const activeSchoolYear = useMemo(
    () => schoolYears.find((year) => year.id === activeSchoolYearId) || null,
    [activeSchoolYearId, schoolYears]
  );
  const activeModules = useMemo(
    () =>
      (activeSchoolYear?.modules || []).filter(
        (module) => module.schoolYear === activeSchoolYear?.label
      ),
    [activeSchoolYear]
  );
  const e1Students = useMemo(
    () =>
      students.filter(
        (student) =>
          student.moduleId === activeModuleId &&
          getStudentEvaluationType(student) === "E1"
      ),
    [activeModuleId, students]
  );
  const e2Students = useMemo(
    () =>
      students.filter(
        (student) =>
          student.moduleId === activeModuleId &&
          getStudentEvaluationType(student) === "E2"
      ),
    [activeModuleId, students]
  );
  const copySourceStudents = useMemo(
    () =>
      students.filter(
        (student) =>
          student.moduleId === activeModuleId &&
          getStudentEvaluationType(student) === copyConfig.source
      ),
    [activeModuleId, copyConfig.source, students]
  );

  const resetAppState = (nextTeacherId = "") => {
    isHydratedRef.current = false;
    setSchoolYears([]);
    setTemplate(defaultTemplate);
    setActiveSchoolYearId("");
    setActiveModuleId("");
    setActiveEvaluationType(EVALUATION_TYPES[0]);
    setStudents([]);
    setSelectedId("");
    setDraft(buildStudentFromTemplate(defaultTemplate, nextTeacherId));
    setIsEditing(false);
    setLoadError("");
    setIsLoading(false);
  };

  useEffect(() => {
    if (!authToken) {
      resetAppState("");
      return;
    }

    const loadState = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/state`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (response.status === 401) {
          clearStoredAuth();
          setAuthUser(null);
          setAuthToken("");
          setAuthError("Your session expired. Please sign in again.");
          resetAppState("");
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to fetch stored data.");
        }
        const data = await response.json();
        setSchoolYears(normalizeSchoolYears(data.schoolYears, data.modules));
        setStudents(data.students || []);
        setLoadError("");
        isHydratedRef.current = true;
      } catch (error) {
        console.error(error);
        setLoadError(
          "Unable to load saved data from the server. Please try again."
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadState();
  }, [authToken]);

  useEffect(() => {
    if (!isHydratedRef.current || !isAuthenticated) return;
    const persistState = async () => {
      try {
        await fetch(`${API_BASE_URL}/api/state`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({ schoolYears, students })
        });
      } catch (error) {
        console.error(error);
      }
    };

    persistState();
  }, [authToken, isAuthenticated, schoolYears, students]);

  useEffect(() => {
    if (selectedStudent) {
      setDraft(applyTemplateToStudent(template, selectedStudent, teacherId));
      setIsEditing(true);
    } else {
      setDraft(buildStudentFromTemplate(template, teacherId));
      setIsEditing(false);
    }
  }, [selectedStudent, template, teacherId]);

  useEffect(() => {
    if (!teacherName) return;
    setTemplate((prev) =>
      prev.teacher === teacherName ? prev : { ...prev, teacher: teacherName }
    );
  }, [teacherName]);

  useEffect(() => {
    if (template.evaluationType !== activeEvaluationType) return;
    setStudents((prev) =>
      prev.map((student) =>
        student.moduleId === template.moduleId &&
        getStudentEvaluationType(student) === activeEvaluationType
          ? applyTemplateToStudent(template, student, teacherId)
          : student
      )
    );
    setDraft((prev) =>
      prev.moduleId === template.moduleId &&
      getStudentEvaluationType(prev) === activeEvaluationType
        ? applyTemplateToStudent(template, prev, teacherId)
        : prev
    );
  }, [activeEvaluationType, template, teacherId]);

  useEffect(() => {
    if (!schoolYears.length) return;
    if (
      !activeSchoolYearId ||
      !schoolYears.some((year) => year.id === activeSchoolYearId)
    ) {
      setActiveSchoolYearId(schoolYears[0]?.id || "");
    }
  }, [activeSchoolYearId, schoolYears]);

  useEffect(() => {
    if (!activeModules.length) {
      setActiveModuleId("");
      return;
    }
    if (
      !activeModuleId ||
      !activeModules.some((module) => module.id === activeModuleId)
    ) {
      setActiveModuleId(activeModules[0]?.id || "");
    }
  }, [activeModuleId, activeModules]);

  useEffect(() => {
    setSelectedId((prev) => {
      if (moduleStudents.some((student) => student.id === prev)) {
        return prev;
      }
      return moduleStudents[0]?.id || "";
    });
  }, [moduleStudents]);

  useEffect(() => {
    const activeModule = activeModules.find(
      (module) => module.id === activeModuleId
    );
    if (!activeModule || !activeSchoolYear) return;
    setTemplate(
      getModuleTemplate(activeModule, activeSchoolYear.label, activeEvaluationType)
    );
  }, [activeEvaluationType, activeModuleId, activeModules, activeSchoolYear]);

  const activeModule = useMemo(
    () => activeModules.find((module) => module.id === activeModuleId) || null,
    [activeModuleId, activeModules]
  );

  useEffect(() => {
    if (!activeModule) return;
    const availableTypes = getAvailableEvaluationTypes(activeModule);
    if (!availableTypes.includes(activeEvaluationType)) {
      setActiveEvaluationType(availableTypes[0]);
    }
  }, [activeEvaluationType, activeModule]);

  const persistDraftChanges = (updater) => {
    setDraft((prevDraft) => {
      const nextDraft =
        typeof updater === "function" ? updater(prevDraft) : updater;
      const nextWithTeacher = teacherId
        ? { ...nextDraft, teacherId: nextDraft.teacherId || teacherId }
        : nextDraft;

      setStudents((prevStudents) => {
        const exists = prevStudents.some(
          (student) => student.id === nextWithTeacher.id
        );

        if (exists) {
          return prevStudents.map((student) =>
            student.id === nextWithTeacher.id ? { ...nextWithTeacher } : student
          );
        }

        if (!hasStudentIdentity(nextWithTeacher)) {
          return prevStudents;
        }

        return [...prevStudents, { ...nextWithTeacher }];
      });

      if (hasStudentIdentity(nextWithTeacher)) {
        setSelectedId(nextWithTeacher.id);
        setIsEditing(true);
      }

      return nextWithTeacher;
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

  const handleAuthFieldChange = (field, value) => {
    setAuthForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAuthSubmit = async (event) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    setAuthError("");
    if (!authForm.email || !authForm.password) {
      setAuthError("Please enter your email and password.");
      return;
    }
    if (authMode === "register") {
      if (!authForm.name) {
        setAuthError("Please enter your name.");
        return;
      }
      if (authForm.password !== authForm.confirmPassword) {
        setAuthError("Passwords do not match.");
        return;
      }
    }

    const payload =
      authMode === "register"
        ? {
            name: authForm.name,
            email: authForm.email,
            password: authForm.password
          }
        : { email: authForm.email, password: authForm.password };

    try {
      setAuthLoading(true);
      const response = await fetch(
        `${API_BASE_URL}/api/auth/${authMode === "register" ? "register" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json();
      if (!response.ok) {
        setAuthError(data?.error || "Unable to authenticate.");
        return;
      }
      setAuthUser(data.user);
      setAuthToken(data.token);
      persistStoredAuth({ user: data.user, token: data.token });
      setAuthForm({ name: "", email: "", password: "", confirmPassword: "" });
    } catch (error) {
      console.error(error);
      setAuthError("Unable to authenticate. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredAuth();
    setAuthUser(null);
    setAuthToken("");
    setAuthMode("login");
    resetAppState("");
  };

  const handleStudentField = (field, value) => {
    persistDraftChanges((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const syncGroupCategory = (sectionIndex, updater) => {
    setDraft((prevDraft) => {
      const nextDraft = updater(prevDraft);
      const groupName = getStudentGroupName(nextDraft);
      const shouldSync =
        template.groupFeatureEnabled &&
        groupName &&
        nextDraft.competencies?.[sectionIndex]?.groupEvaluation;

      setStudents((prevStudents) =>
        prevStudents.map((student) => {
          if (student.id === nextDraft.id) {
            return updater(student);
          }
          if (!shouldSync) return student;
          if (student.moduleId !== activeModuleId) return student;
          if (getStudentEvaluationType(student) !== activeEvaluationType) {
            return student;
          }
          if (getStudentGroupName(student) !== groupName) return student;
          return updater(student);
        })
      );

      return nextDraft;
    });
  };

  const updateCompetency = (sectionIndex, itemIndex, field, value) => {
    syncGroupCategory(sectionIndex, (student) => ({
      ...student,
      competencies: (student.competencies || []).map((section, sIndex) => {
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
    syncGroupCategory(sectionIndex, (student) => ({
      ...student,
      competencies: (student.competencies || []).map((section, sIndex) =>
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

  const handleOpenCopyStudentsModal = (source, target) => {
    const sourceStudents = students.filter(
      (student) =>
        student.moduleId === activeModuleId &&
        getStudentEvaluationType(student) === source
    );
    const defaultSelections = sourceStudents.reduce((acc, student) => {
      const noteValue = Number(student.note);
      const shouldSelect =
        student.note !== "" && Number.isFinite(noteValue) && noteValue < 4;
      acc[student.id] = shouldSelect;
      return acc;
    }, {});
    setCopyConfig({ source, target });
    setCopyStudentSelections(defaultSelections);
    setIsCopyStudentsModalOpen(true);
  };

  const handleToggleCopyStudent = (studentId) => {
    setCopyStudentSelections((prev) => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  const handleSelectAllCopyStudents = (nextValue) => {
    setCopyStudentSelections((prev) => {
      const updatedSelections = { ...prev };
      copySourceStudents.forEach((student) => {
        updatedSelections[student.id] = nextValue;
      });
      return updatedSelections;
    });
  };

  const handleConfirmCopyStudents = () => {
    const selectedStudents = copySourceStudents.filter(
      (student) => copyStudentSelections[student.id]
    );
    if (!selectedStudents.length) return;
    const copiedStudents = selectedStudents.map((student) =>
      cloneStudentReport(student, copyConfig.target)
    );
    setStudents((prev) => [...prev, ...copiedStudents]);
    if (
      activeModule &&
      activeSchoolYear &&
      !isEvaluationTypeAvailable(activeModule, copyConfig.target)
    ) {
      const sourceTemplate = getModuleTemplate(
        activeModule,
        activeSchoolYear.label,
        copyConfig.source
      );
      setSchoolYears((prev) =>
        prev.map((year) =>
          year.id === activeSchoolYearId
            ? {
                ...year,
                modules: year.modules.map((module) =>
                  module.id === activeModuleId
                    ? {
                        ...module,
                        templates: {
                          ...normalizeModuleTemplates(module, year.label),
                          [copyConfig.target]: normalizeTemplate(
                            sourceTemplate,
                            module,
                            year.label,
                            copyConfig.target
                          )
                        }
                      }
                    : module
                )
              }
            : year
        )
      );
    }
    setActiveEvaluationType(copyConfig.target);
    setIsCopyStudentsModalOpen(false);
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
      ...buildStudentFromTemplate(template, teacherId),
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
    const response = await fetch(`${API_BASE_URL}/api/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`
      },
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
    link.download = buildReportFilename(draft);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportAllReports = async () => {
    if (moduleStudents.length === 0) {
      alert("No students available to export.");
      return;
    }
    setIsExporting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/report/export-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ students: moduleStudents })
      });

      if (!response.ok) {
        alert("Unable to export the reports.");
        return;
      }

      const moduleLabel = sanitizeFilename(activeModule?.title || "module");
      const evaluationLabel = sanitizeFilename(activeEvaluationType || "report");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${moduleLabel}-${evaluationLabel}-reports.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const updateTemplate = (updater) => {
    setTemplate((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      setSchoolYears((prevYears) =>
        prevYears.map((year) =>
          year.id === activeSchoolYearId
            ? {
                ...year,
                modules: year.modules.map((module) =>
                  module.id === activeModuleId
                    ? {
                        ...module,
                        templates: {
                          ...normalizeModuleTemplates(module, year.label),
                          [activeEvaluationType]: normalizeTemplate(
                            next,
                            module,
                            year.label,
                            activeEvaluationType
                          )
                        }
                      }
                    : module
                )
              }
            : year
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

  const handleEvaluationTypeChange = (nextType) => {
    setActiveEvaluationType(nextType);
  };

  const handleTemplateCategoryChange = (sectionIndex, value) => {
    updateTemplate((prev) => ({
      ...prev,
      competencies: (prev.competencies || []).map((section, sIndex) =>
        sIndex === sectionIndex ? { ...section, category: value } : section
      )
    }));
  };

  const handleTemplateCategoryGroupChange = (sectionIndex, value) => {
    updateTemplate((prev) => ({
      ...prev,
      competencies: (prev.competencies || []).map((section, sIndex) =>
        sIndex === sectionIndex ? { ...section, groupEvaluation: value } : section
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
          groupEvaluation: false,
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

  const handleStudentGroupChange = (studentId, value) => {
    setStudents((prev) => {
      let updatedStudent = null;
      const nextStudents = prev.map((student) => {
        if (student.id !== studentId) return student;
        const nextStudent = template.groupFeatureEnabled
          ? syncGroupEvaluations({ ...student, groupName: value }, value, prev)
          : { ...student, groupName: value };
        updatedStudent = nextStudent;
        return nextStudent;
      });

      if (selectedId === studentId && updatedStudent) {
        setDraft(updatedStudent);
      }

      return nextStudents;
    });
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
    if (!activeSchoolYear) {
      const fallbackSchoolYear = buildDefaultSchoolYear();
      setSchoolYears((prev) => [...prev, fallbackSchoolYear]);
      setActiveSchoolYearId(fallbackSchoolYear.id);
      setActiveModuleId(fallbackSchoolYear.modules[0]?.id || "");
      return;
    }
    const newModule = buildDefaultModule(
      {
        title: "New module"
      },
      EMPTY_TEMPLATE,
      activeSchoolYear.label
    );
    setSchoolYears((prev) =>
      prev.map((year) =>
        year.id === activeSchoolYearId
          ? {
              ...year,
              modules: [...year.modules, newModule]
            }
          : year
      )
    );
    setActiveModuleId(newModule.id);
    setActiveEvaluationType(EVALUATION_TYPES[0]);
  };

  const handleModuleFieldChange = (moduleId, field, value) => {
    setSchoolYears((prev) =>
      prev.map((year) =>
        year.id === activeSchoolYearId
          ? {
              ...year,
              modules: year.modules.map((module) => {
                if (module.id !== moduleId) return module;
                const updatedModule = { ...module, [field]: value };
                return {
                  ...updatedModule,
                  templates: normalizeModuleTemplates(
                    {
                      ...updatedModule,
                      templates: normalizeModuleTemplates(module, year.label)
                    },
                    year.label
                  )
                };
              })
            }
          : year
      )
    );
  };

  const handleRemoveModule = (moduleId) => {
    if (!confirm("Delete this module?")) return;
    setSchoolYears((prev) =>
      prev.map((year) => {
        if (year.id !== activeSchoolYearId) return year;
        const remainingModules = year.modules.filter(
          (module) => module.id !== moduleId
        );
        return {
          ...year,
          modules:
            remainingModules.length > 0
              ? remainingModules
              : [buildDefaultModule({}, EMPTY_TEMPLATE, year.label)]
        };
      })
    );
    if (activeModuleId === moduleId) {
      setActiveModuleId("");
    }
  };

  const handleRemoveReportType = (evaluationType) => {
    if (!activeModule || !activeSchoolYear) return;
    const availableTypes = getAvailableEvaluationTypes(activeModule);
    if (!availableTypes.includes(evaluationType)) return;

    const isLastType = availableTypes.length === 1;
    const confirmMessage = isLastType
      ? "Delete this report type? This is the last report type and will delete the entire module and all related students."
      : "Delete this report type and all related students?";
    if (!confirm(confirmMessage)) return;

    setStudents((prev) =>
      prev.filter((student) => {
        if (student.moduleId !== activeModuleId) return true;
        if (isLastType) return false;
        return getStudentEvaluationType(student) !== evaluationType;
      })
    );

    setSchoolYears((prev) =>
      prev.map((year) => {
        if (year.id !== activeSchoolYearId) return year;
        if (isLastType) {
          return {
            ...year,
            modules: year.modules.filter((module) => module.id !== activeModuleId)
          };
        }
        return {
          ...year,
          modules: year.modules.map((module) => {
            if (module.id !== activeModuleId) return module;
            const templates = { ...(module.templates || {}) };
            delete templates[evaluationType];
            return {
              ...module,
              templates
            };
          })
        };
      })
    );

    if (activeEvaluationType === evaluationType) {
      const remainingTypes = availableTypes.filter(
        (type) => type !== evaluationType
      );
      setActiveEvaluationType(remainingTypes[0] || EVALUATION_TYPES[0]);
    }
  };

  const handleApplyTemplate = () => {
    setStudents((prev) =>
      prev.map((student) =>
        student.moduleId === template.moduleId &&
        getStudentEvaluationType(student) === activeEvaluationType
          ? applyTemplateToStudent(template, student, teacherId)
          : student
      )
    );
    setDraft((prev) =>
      prev.moduleId === template.moduleId &&
      getStudentEvaluationType(prev) === activeEvaluationType
        ? applyTemplateToStudent(template, prev, teacherId)
        : prev
    );
    setIsTemplateModalOpen(false);
  };

  const selectedCopyStudentsCount = useMemo(
    () =>
      copySourceStudents.filter((student) => copyStudentSelections[student.id])
        .length,
    [copyStudentSelections, copySourceStudents]
  );

  if (!isAuthenticated) {
    return (
      <div className="app auth-page">
        <header className="hero">
          <div>
            <h1>Sign in to access your student reports</h1>
            <p className="subtitle">
              Each teacher sees only their own reports. Create an account or
              sign in to continue.
            </p>
          </div>
        </header>

        <main className="layout auth-layout">
          <section className="panel auth-panel">
            <div className="panel-header">
              <h2>{authMode === "login" ? "Teacher login" : "New account"}</h2>
              <span className="helper-text">
                {authMode === "login"
                  ? "Use your teacher account to access reports."
                  : "Create a teacher account to keep reports private."}
              </span>
            </div>
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {authMode === "register" && (
                <label>
                  Full name
                  <input
                    type="text"
                    value={authForm.name}
                    onChange={(event) =>
                      handleAuthFieldChange("name", event.target.value)
                    }
                    placeholder="Prof. Martin"
                  />
                </label>
              )}
              <label>
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) =>
                    handleAuthFieldChange("email", event.target.value)
                  }
                  placeholder="teacher@example.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    handleAuthFieldChange("password", event.target.value)
                  }
                  placeholder="********"
                />
              </label>
              {authMode === "register" && (
                <label>
                  Confirm password
                  <input
                    type="password"
                    value={authForm.confirmPassword}
                    onChange={(event) =>
                      handleAuthFieldChange("confirmPassword", event.target.value)
                    }
                    placeholder="********"
                  />
                </label>
              )}
              {authError && (
                <p className="helper-text error-text" role="alert">
                  {authError}
                </p>
              )}
              <div className="actions auth-actions">
                <button
                  type="submit"
                  className="button primary"
                  disabled={authLoading}
                >
                  {authLoading
                    ? "Please wait..."
                    : authMode === "login"
                      ? "Sign in"
                      : "Create account"}
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => {
                    setAuthMode(authMode === "login" ? "register" : "login");
                    setAuthError("");
                  }}
                >
                  {authMode === "login"
                    ? "Create a new account"
                    : "Back to login"}
                </button>
              </div>
            </form>
          </section>

          <section className="panel auth-panel-info">
            <h2>Private teacher workspaces</h2>
            <p className="helper-text">
              Your account ensures only you can see and edit your student
              reports. Use the same login on any device to continue where you
              left off.
            </p>
            <ul className="auth-benefits">
              <li>Separate reports per teacher.</li>
              <li>Automatic filtering of your student list.</li>
              <li>Secure access for PDF exports.</li>
            </ul>
          </section>
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="app">
        <main className="layout">
          <p className="helper-text">Loading data from the server...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <h1>Evaluation Report Builder</h1>
        </div>
        <div className="hero-card">
          <div>
            <p className="label">Signed in as</p>
            <p className="value">{authUser?.name || authUser?.email}</p>
          </div>
          <button className="button ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="layout">
        {loadError && (
          <p className="helper-text error-text" role="alert">
            {loadError}
          </p>
        )}
        <section className="panel template-panel">
          <div className="panel-header">
            <div>
              <h2>Template</h2>
            </div>
            <div className="actions">
              <button
                className="button ghost"
                type="button"
                onClick={handleExportAllReports}
                disabled={moduleStudents.length === 0 || isExporting}
                title={
                  moduleStudents.length === 0
                    ? "No students available to export."
                    : "Export all reports for this module and report type"
                }
              >
                {isExporting ? "Exporting..." : "Export all"}
              </button>
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
              School year
              <select
                value={activeSchoolYearId}
                onChange={(event) => setActiveSchoolYearId(event.target.value)}
              >
                {schoolYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Active module
              <select
                value={activeModuleId}
                onChange={(event) => setActiveModuleId(event.target.value)}
              >
                {activeModules.map((module) => {
                  const title = module.title || "Module";
                  return (
                    <option key={module.id} value={module.id}>
                      {title}
                    </option>
                  );
                })}
              </select>
            </label>
            <fieldset className="module-evaluation-selector">
              <legend>Report type</legend>
              {EVALUATION_TYPES.map((type) => {
                const isAvailable = isEvaluationTypeAvailable(activeModule, type);
                return (
                  <label key={type} className="module-evaluation-option">
                    <input
                      type="radio"
                      name="module-evaluation-type"
                      value={type}
                      checked={activeEvaluationType === type}
                      onChange={(event) =>
                        handleEvaluationTypeChange(event.target.value)
                      }
                      disabled={!isAvailable}
                    />
                    <span>{type}</span>
                  </label>
                );
              })}
            </fieldset>
            <div className="module-actions">
              <button
                className="button ghost"
                onClick={() => handleOpenCopyStudentsModal("E1", "E2")}
                disabled={e1Students.length === 0}
                title={
                  e1Students.length === 0
                    ? "No E1 students available to copy."
                    : "Copy E1 reports into E2"
                }
              >
                Copy E1 → E2
              </button>
              <button
                className="button ghost"
                onClick={() => handleOpenCopyStudentsModal("E2", "E3")}
                disabled={e2Students.length === 0}
                title={
                  e2Students.length === 0
                    ? "No E2 students available to copy."
                    : "Copy E2 reports into E3"
                }
              >
                Copy E2 → E3
              </button>
              <button
                className="button danger"
                type="button"
                onClick={() => handleRemoveReportType(activeEvaluationType)}
                disabled={
                  !isEvaluationTypeAvailable(activeModule, activeEvaluationType)
                }
              >
                Remove {activeEvaluationType} report
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Student list</h2>
            <div className="actions">
              <button className="button ghost" onClick={handleImportStudents}>
                Import students
              </button>
            </div>
          </div>
          {template.groupFeatureEnabled && (
            <div className="group-controls">
              <p className="helper-text">
                Assign students to a group to share results for group-evaluated
                categories.
              </p>
              <datalist id="group-options">
                {groupOptions.map((groupName) => (
                  <option key={groupName} value={groupName} />
                ))}
              </datalist>
            </div>
          )}
          <ul className="student-list">
            {moduleStudents.length === 0 && (
              <li className="empty">
                No students yet for this module. Import a list to get started.
              </li>
            )}
            {moduleStudents.map((student) => (
              <li
                key={student.id}
                className={[
                  "student-card",
                  getStudentNoteClass(student.note),
                  selectedId === student.id ? "active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelectedId(student.id)}
              >
                <div className="student-card-content">
                  <p className="student-name">
                    {getStudentDisplayName(student) || "Unnamed student"}
                  </p>
                  {template.groupFeatureEnabled && (
                    <p className="student-meta">
                      {getStudentGroupName(student)
                        ? `Group: ${getStudentGroupName(student)}`
                        : "No group assigned"}
                    </p>
                  )}
                  {template.groupFeatureEnabled && (
                    <div
                      className="student-group-field"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <label>
                        Group
                        <input
                          type="text"
                          list="group-options"
                          value={student.groupName || ""}
                          onChange={(event) =>
                            handleStudentGroupChange(
                              student.id,
                              event.target.value
                            )
                          }
                          placeholder="Group A"
                        />
                      </label>
                    </div>
                  )}
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

      <footer className="app-footer">
        <p className="helper-text">
          Serveur backend utilisé :{" "}
          <span className="backend-url">{API_BASE_URL}</span>
        </p>
      </footer>

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

      {isCopyStudentsModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal modal--compact">
            <div className="modal-header">
              <div>
                <h2>
                  Copy {copyConfig.source} reports to {copyConfig.target}
                </h2>
                <p className="helper-text">
                  Select the students to copy. Notes below 4 are pre-selected.
                </p>
              </div>
              <button
                className="button ghost"
                onClick={() => setIsCopyStudentsModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="copy-students-controls">
              <button
                type="button"
                className="button ghost"
                onClick={() => handleSelectAllCopyStudents(true)}
              >
                Select all
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() => handleSelectAllCopyStudents(false)}
              >
                Clear
              </button>
              <span className="helper-text">
                {selectedCopyStudentsCount} of {copySourceStudents.length} selected
              </span>
            </div>
            <div className="copy-students-list">
              {copySourceStudents.map((student) => {
                const displayName =
                  getStudentDisplayName(student) || "Unnamed student";
                const noteLabel = student.note ? `Note: ${student.note}` : "No note";
                return (
                  <label key={student.id} className="copy-student-row">
                    <input
                      type="checkbox"
                      checked={Boolean(copyStudentSelections[student.id])}
                      onChange={() => handleToggleCopyStudent(student.id)}
                    />
                    <span>
                      <strong>{displayName}</strong>
                      <span className="copy-student-meta">{noteLabel}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="actions align-start modal-actions">
              <div className="action-row">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setIsCopyStudentsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={handleConfirmCopyStudents}
                  disabled={selectedCopyStudentsCount === 0}
                >
                  {selectedCopyStudentsCount > 0
                    ? `Copy ${selectedCopyStudentsCount} report${
                        selectedCopyStudentsCount === 1 ? "" : "s"
                      }`
                    : "Copy reports"}
                </button>
              </div>
            </div>
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
                        <input
                          type="text"
                          value={activeSchoolYear?.label || "Not set"}
                          readOnly
                          disabled
                        />
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
                  value={activeEvaluationType}
                  onChange={(event) =>
                    handleEvaluationTypeChange(event.target.value)
                  }
                >
                  {EVALUATION_TYPES.map((type) => (
                    <option
                      key={type}
                      value={type}
                      disabled={!isEvaluationTypeAvailable(activeModule, type)}
                    >
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-field">
                <span>Enable group evaluations</span>
                <input
                  type="checkbox"
                  checked={template.groupFeatureEnabled}
                  onChange={(event) =>
                    handleTemplateField("groupFeatureEnabled", event.target.checked)
                  }
                />
                <span className="helper-text">
                  Allow categories to be shared between students in the same group.
                </span>
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
                  value={teacherName}
                  readOnly
                  disabled
                  placeholder="Signed-in teacher"
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
                    <label className="category-group-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(section.groupEvaluation)}
                        onChange={(event) =>
                          handleTemplateCategoryGroupChange(
                            sectionIndex,
                            event.target.checked
                          )
                        }
                        disabled={!template.groupFeatureEnabled}
                      />
                      Group evaluation
                    </label>
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
