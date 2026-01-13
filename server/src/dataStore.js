import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, "data.json");

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
const SCHOOL_YEARS = ["2024-2025", "2025-2026"];

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
    competencyOptions:
      baseTemplate.competencyOptions || defaultTemplate.competencyOptions,
    competencies: baseTemplate.competencies || defaultTemplate.competencies
  };
};

const normalizeModuleTemplates = (module, schoolYearLabel) => {
  const baseTemplates =
    module.templates && typeof module.templates === "object"
      ? { ...module.templates }
      : {};
  if (module.template && !baseTemplates[EVALUATION_TYPES[0]]) {
    baseTemplates[EVALUATION_TYPES[0]] = module.template;
  }

  const normalizedTemplates = {};
  const defaultType = EVALUATION_TYPES[0];
  normalizedTemplates[defaultType] = normalizeTemplate(
    baseTemplates[defaultType] || {},
    module,
    schoolYearLabel,
    defaultType
  );

  EVALUATION_TYPES.slice(1).forEach((type) => {
    if (!baseTemplates[type]) return;
    normalizedTemplates[type] = normalizeTemplate(
      baseTemplates[type] || {},
      module,
      schoolYearLabel,
      type
    );
  });

  return normalizedTemplates;
};

const buildDefaultModule = (
  overrides = {},
  templateOverrides = {},
  schoolYearLabel = defaultTemplate.schoolYear
) => {
  const module = {
    id: overrides.id ?? crypto.randomUUID(),
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

const normalizeModules = (modules = [], schoolYearLabel) => {
  if (!Array.isArray(modules) || modules.length === 0) {
    return [buildDefaultModule({}, {}, schoolYearLabel)];
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

const normalizeStudent = (student) => ({
  ...student,
  evaluationType: student?.evaluationType || EVALUATION_TYPES[0],
  teacherId: student?.teacherId || ""
});

const normalizeUsers = (users = []) => {
  if (!Array.isArray(users)) return [];
  return users
    .filter((user) => user && typeof user === "object")
    .map((user) => ({
      id: user.id || crypto.randomUUID(),
      name: user.name || "",
      email: user.email || "",
      passwordHash: user.passwordHash || "",
      salt: user.salt || "",
      token: user.token || ""
    }));
};

const normalizeState = (state) => {
  const nextState = state || {};
  return {
    schoolYears: normalizeSchoolYears(nextState.schoolYears, nextState.modules),
    students: Array.isArray(nextState.students)
      ? nextState.students.map(normalizeStudent)
      : [],
    users: normalizeUsers(nextState.users)
  };
};

export const loadState = () => {
  if (!fs.existsSync(DATA_PATH)) {
    const initialState = normalizeState({});
    fs.writeFileSync(DATA_PATH, JSON.stringify(initialState, null, 2));
    return initialState;
  }

  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (error) {
    console.error(error);
    const fallbackState = normalizeState({});
    fs.writeFileSync(DATA_PATH, JSON.stringify(fallbackState, null, 2));
    return fallbackState;
  }
};

export const saveState = (nextState) => {
  const normalizedState = normalizeState(nextState);
  fs.writeFileSync(DATA_PATH, JSON.stringify(normalizedState, null, 2));
  return normalizedState;
};
