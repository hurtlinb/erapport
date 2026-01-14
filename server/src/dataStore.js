import crypto from "crypto";
import { Pool } from "pg";

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

const getOptionalString = (value) =>
  typeof value === "string" && value.trim() ? value : undefined;

const pool = new Pool({
  connectionString: getOptionalString(process.env.DATABASE_URL),
  host: getOptionalString(process.env.PGHOST),
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: getOptionalString(process.env.PGDATABASE),
  user: getOptionalString(process.env.PGUSER),
  password: getOptionalString(process.env.PGPASSWORD)
});

let initializationPromise;

const seedSchoolYears = async (client) => {
  const result = await client.query("SELECT COUNT(*)::int AS count FROM school_years");
  if (result.rows[0].count > 0) return;
  const entries = SCHOOL_YEARS.map((label) => ({
    id: crypto.randomUUID(),
    label
  }));
  const placeholders = entries
    .map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`)
    .join(", ");
  const values = entries.flatMap((entry) => [entry.id, entry.label]);
  await client.query(
    `INSERT INTO school_years (id, label) VALUES ${placeholders}`,
    values
  );
};

const ensureInitialized = async () => {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          token TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS school_years (
          id UUID PRIMARY KEY,
          label TEXT NOT NULL UNIQUE
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS modules (
          id UUID PRIMARY KEY,
          school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
          title TEXT NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS module_templates (
          id UUID PRIMARY KEY,
          module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
          evaluation_type TEXT NOT NULL,
          template JSONB NOT NULL,
          UNIQUE (module_id, evaluation_type)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS students (
          id UUID PRIMARY KEY,
          teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
          module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
          evaluation_type TEXT NOT NULL,
          firstname TEXT,
          name TEXT,
          note TEXT,
          group_name TEXT,
          class_name TEXT,
          teacher_name TEXT,
          evaluation_date TEXT,
          coaching_date TEXT,
          operational_competence TEXT,
          competency_options JSONB,
          competencies JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await seedSchoolYears(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })();
  return initializationPromise;
};

const buildTemplatePayload = (template) => ({
  note: template.note || "",
  groupFeatureEnabled: Boolean(template.groupFeatureEnabled),
  className: template.className || "",
  teacher: template.teacher || "",
  evaluationDate: template.evaluationDate || "",
  coachingDate: template.coachingDate || "",
  operationalCompetence: template.operationalCompetence || "",
  competencyOptions: template.competencyOptions || EMPTY_TEMPLATE.competencyOptions,
  competencies: template.competencies || EMPTY_TEMPLATE.competencies
});

const readTemplatesByModule = (rows) => {
  return rows.reduce((acc, row) => {
    if (!acc[row.module_id]) {
      acc[row.module_id] = {};
    }
    acc[row.module_id][row.evaluation_type] = row.template;
    return acc;
  }, {});
};

export const loadState = async () => {
  await ensureInitialized();
  const [yearResult, moduleResult, templateResult, studentResult, userResult] =
    await Promise.all([
      pool.query("SELECT id, label FROM school_years ORDER BY label"),
      pool.query("SELECT id, school_year_id, title FROM modules"),
      pool.query(
        "SELECT module_id, evaluation_type, template FROM module_templates"
      ),
      pool.query("SELECT * FROM students"),
      pool.query("SELECT id, name, email, password_hash, salt, token FROM users")
    ]);

  const templatesByModule = readTemplatesByModule(templateResult.rows);
  const schoolYearMap = new Map(
    yearResult.rows.map((year) => [year.id, { ...year, modules: [] }])
  );

  moduleResult.rows.forEach((module) => {
    const year = schoolYearMap.get(module.school_year_id);
    if (!year) return;
    const modulePayload = {
      id: module.id,
      title: module.title,
      schoolYear: year.label,
      templates: templatesByModule[module.id] || {}
    };
    year.modules.push(modulePayload);
  });

  const schoolYears = Array.from(schoolYearMap.values());

  const moduleLookup = moduleResult.rows.reduce((acc, module) => {
    const schoolYear = schoolYearMap.get(module.school_year_id);
    acc[module.id] = {
      title: module.title,
      schoolYear: schoolYear?.label || "",
      templates: templatesByModule[module.id] || {}
    };
    return acc;
  }, {});

  const students = studentResult.rows.map((student) => {
    const moduleInfo = moduleLookup[student.module_id] || {
      title: "",
      schoolYear: "",
      templates: {}
    };
    const template =
      moduleInfo.templates?.[student.evaluation_type] || defaultTemplate;
    return normalizeStudent({
      id: student.id,
      moduleId: student.module_id,
      moduleTitle: moduleInfo.title || "",
      schoolYear: moduleInfo.schoolYear || "",
      evaluationType: student.evaluation_type || EVALUATION_TYPES[0],
      firstname: student.firstname || "",
      name: student.name || "",
      note: student.note ?? "",
      groupName: student.group_name || "",
      className: student.class_name || "",
      teacher: student.teacher_name || "",
      teacherId: student.teacher_id || "",
      evaluationDate: student.evaluation_date || "",
      coachingDate: student.coaching_date || "",
      operationalCompetence: student.operational_competence || "",
      competencyOptions:
        student.competency_options || template.competencyOptions || [],
      competencies: student.competencies || template.competencies || []
    });
  });

  const users = userResult.rows.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: user.password_hash,
    salt: user.salt,
    token: user.token
  }));

  return normalizeState({
    schoolYears,
    students,
    users
  });
};

export const saveState = async (nextState) => {
  await ensureInitialized();
  const normalizedState = normalizeState(nextState);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const users = normalizedState.users;
    const userIds = users.map((user) => user.id);
    await client.query("DELETE FROM users WHERE id <> ALL($1::uuid[])", [
      userIds
    ]);
    for (const user of users) {
      await client.query(
        `
          INSERT INTO users (id, name, email, password_hash, salt, token)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            salt = EXCLUDED.salt,
            token = EXCLUDED.token
        `,
        [
          user.id,
          user.name,
          user.email,
          user.passwordHash,
          user.salt,
          user.token
        ]
      );
    }

    const schoolYears = normalizedState.schoolYears;
    const schoolYearIds = schoolYears.map((year) => year.id);
    await client.query(
      "DELETE FROM school_years WHERE id <> ALL($1::uuid[])",
      [schoolYearIds]
    );
    for (const year of schoolYears) {
      await client.query(
        `
          INSERT INTO school_years (id, label)
          VALUES ($1, $2)
          ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label
        `,
        [year.id, year.label]
      );
    }

    const modules = schoolYears.flatMap((year) =>
      (year.modules || []).map((module) => ({
        ...module,
        schoolYearId: year.id
      }))
    );
    const moduleIds = modules.map((module) => module.id);
    await client.query("DELETE FROM modules WHERE id <> ALL($1::uuid[])", [
      moduleIds
    ]);
    for (const module of modules) {
      await client.query(
        `
          INSERT INTO modules (id, school_year_id, title)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE SET
            school_year_id = EXCLUDED.school_year_id,
            title = EXCLUDED.title
        `,
        [module.id, module.schoolYearId, module.title]
      );
    }

    const templateEntries = modules.flatMap((module) => {
      const templates = module.templates || {};
      return Object.entries(templates).map(([evaluationType, template]) => ({
        moduleId: module.id,
        evaluationType,
        template: buildTemplatePayload(template)
      }));
    });

    if (templateEntries.length === 0) {
      await client.query("DELETE FROM module_templates");
    } else {
      const templateValues = templateEntries.flatMap((entry) => [
        entry.moduleId,
        entry.evaluationType
      ]);
      const placeholders = templateEntries
        .map((_, index) => `($${index * 2 + 1}::uuid, $${index * 2 + 2})`)
        .join(", ");
      await client.query(
        `
          DELETE FROM module_templates
          WHERE (module_id, evaluation_type) NOT IN (${placeholders})
        `,
        templateValues
      );
    }

    for (const template of templateEntries) {
      await client.query(
        `
          INSERT INTO module_templates (id, module_id, evaluation_type, template)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (module_id, evaluation_type) DO UPDATE SET
            template = EXCLUDED.template
        `,
        [
          crypto.randomUUID(),
          template.moduleId,
          template.evaluationType,
          template.template
        ]
      );
    }

    const students = normalizedState.students;
    const studentIds = students.map((student) => student.id);
    await client.query("DELETE FROM students WHERE id <> ALL($1::uuid[])", [
      studentIds
    ]);
    for (const student of students) {
      await client.query(
        `
          INSERT INTO students (
            id,
            teacher_id,
            module_id,
            evaluation_type,
            firstname,
            name,
            note,
            group_name,
            class_name,
            teacher_name,
            evaluation_date,
            coaching_date,
            operational_competence,
            competency_options,
            competencies
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15
          )
          ON CONFLICT (id) DO UPDATE SET
            teacher_id = EXCLUDED.teacher_id,
            module_id = EXCLUDED.module_id,
            evaluation_type = EXCLUDED.evaluation_type,
            firstname = EXCLUDED.firstname,
            name = EXCLUDED.name,
            note = EXCLUDED.note,
            group_name = EXCLUDED.group_name,
            class_name = EXCLUDED.class_name,
            teacher_name = EXCLUDED.teacher_name,
            evaluation_date = EXCLUDED.evaluation_date,
            coaching_date = EXCLUDED.coaching_date,
            operational_competence = EXCLUDED.operational_competence,
            competency_options = EXCLUDED.competency_options,
            competencies = EXCLUDED.competencies
        `,
        [
          student.id,
          student.teacherId || null,
          student.moduleId,
          student.evaluationType || EVALUATION_TYPES[0],
          student.firstname || "",
          student.name || "",
          student.note ?? "",
          student.groupName || "",
          student.className || "",
          student.teacher || "",
          student.evaluationDate || "",
          student.coachingDate || "",
          student.operationalCompetence || "",
          student.competencyOptions || [],
          student.competencies || []
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return normalizedState;
};
