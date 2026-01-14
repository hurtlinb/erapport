import crypto from "crypto";
import mysql from "mysql2/promise";

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

const normalizeTextValue = (value) => {
  if (typeof value === "string") {
    return value.normalize("NFC");
  }
  if (value === null || value === undefined) return "";
  return String(value).normalize("NFC");
};

const normalizeJsonValue = (value, fallback) => {
  if (value && typeof value === "object") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (error) {
      return fallback;
    }
  }
  return fallback;
};

const normalizeStudent = (student) => {
  const baseStudent = student && typeof student === "object" ? student : {};
  return {
    ...baseStudent,
    firstname: normalizeTextValue(baseStudent.firstname),
    name: normalizeTextValue(baseStudent.name),
    evaluationType: baseStudent?.evaluationType || EVALUATION_TYPES[0],
    teacherId: baseStudent?.teacherId || "",
    competencyOptions: normalizeJsonValue(baseStudent.competencyOptions, []),
    competencies: normalizeJsonValue(baseStudent.competencies, [])
  };
};

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

const databaseUrl = getOptionalString(process.env.DATABASE_URL);
const poolConfig = databaseUrl
  ? { uri: databaseUrl }
  : {
      host: getOptionalString(process.env.MARIADB_HOST),
      port: process.env.MARIADB_PORT ? Number(process.env.MARIADB_PORT) : undefined,
      database: getOptionalString(process.env.MARIADB_DATABASE),
      user: getOptionalString(process.env.MARIADB_USER),
      password: getOptionalString(process.env.MARIADB_PASSWORD)
    };
const pool = mysql.createPool({
  ...poolConfig,
  connectionLimit: 10
});

let initializationPromise;

const seedSchoolYears = async (client) => {
  const [rows] = await client.query(
    "SELECT COUNT(*) AS count FROM school_years"
  );
  if (Number(rows[0]?.count ?? 0) > 0) return;
  const entries = SCHOOL_YEARS.map((label) => ({
    id: crypto.randomUUID(),
    label
  }));
  const placeholders = entries.map(() => "(?, ?)").join(", ");
  const values = entries.flatMap((entry) => [entry.id, entry.label]);
  await client.query(
    `INSERT INTO school_years (id, label) VALUES ${placeholders}`,
    values
  );
};

const ensureInitialized = async () => {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    const client = await pool.getConnection();
    try {
      await client.beginTransaction();
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id CHAR(36) PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          token TEXT NOT NULL DEFAULT '',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS school_years (
          id CHAR(36) PRIMARY KEY,
          label TEXT NOT NULL UNIQUE
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS modules (
          id CHAR(36) PRIMARY KEY,
          school_year_id CHAR(36) NOT NULL,
          title TEXT NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS module_templates (
          id CHAR(36) PRIMARY KEY,
          module_id CHAR(36) NOT NULL,
          evaluation_type TEXT NOT NULL,
          template JSON NOT NULL,
          UNIQUE (module_id, evaluation_type)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS students (
          id CHAR(36) PRIMARY KEY,
          teacher_id CHAR(36) NULL,
          module_id CHAR(36) NOT NULL,
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
          competency_options JSON,
          competencies JSON,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        ALTER TABLE modules
        ADD CONSTRAINT modules_school_year_fk
          FOREIGN KEY (school_year_id) REFERENCES school_years(id)
          ON DELETE CASCADE
      `).catch(() => {});
      await client.query(`
        ALTER TABLE module_templates
        ADD CONSTRAINT module_templates_module_fk
          FOREIGN KEY (module_id) REFERENCES modules(id)
          ON DELETE CASCADE
      `).catch(() => {});
      await client.query(`
        ALTER TABLE students
        ADD CONSTRAINT students_module_fk
          FOREIGN KEY (module_id) REFERENCES modules(id)
          ON DELETE CASCADE
      `).catch(() => {});
      await client.query(`
        ALTER TABLE students
        ADD CONSTRAINT students_teacher_fk
          FOREIGN KEY (teacher_id) REFERENCES users(id)
          ON DELETE SET NULL
      `).catch(() => {});
      await seedSchoolYears(client);
      await client.commit();
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  })();
  return initializationPromise;
};

const serializeJsonValue = (value, fallback) =>
  JSON.stringify(normalizeJsonValue(value, fallback));

const buildTemplatePayload = (template) =>
  serializeJsonValue(
    {
      note: template.note || "",
      groupFeatureEnabled: Boolean(template.groupFeatureEnabled),
      className: template.className || "",
      teacher: template.teacher || "",
      evaluationDate: template.evaluationDate || "",
      coachingDate: template.coachingDate || "",
      operationalCompetence: template.operationalCompetence || "",
      competencyOptions:
        template.competencyOptions || EMPTY_TEMPLATE.competencyOptions,
      competencies: template.competencies || EMPTY_TEMPLATE.competencies
    },
    EMPTY_TEMPLATE
  );

const readTemplatesByModule = (rows) => {
  return rows.reduce((acc, row) => {
    if (!acc[row.module_id]) {
      acc[row.module_id] = {};
    }
    acc[row.module_id][row.evaluation_type] = normalizeJsonValue(
      row.template,
      EMPTY_TEMPLATE
    );
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
  const [yearRows] = yearResult;
  const [moduleRows] = moduleResult;
  const [templateRows] = templateResult;
  const [studentRows] = studentResult;
  const [userRows] = userResult;

  const templatesByModule = readTemplatesByModule(templateRows);
  const schoolYearMap = new Map(
    yearRows.map((year) => [year.id, { ...year, modules: [] }])
  );

  moduleRows.forEach((module) => {
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

  const moduleLookup = moduleRows.reduce((acc, module) => {
    const schoolYear = schoolYearMap.get(module.school_year_id);
    acc[module.id] = {
      title: module.title,
      schoolYear: schoolYear?.label || "",
      templates: templatesByModule[module.id] || {}
    };
    return acc;
  }, {});

  const students = studentRows.map((student) => {
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

  const users = userRows.map((user) => ({
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
  const client = await pool.getConnection();
  const deleteWhereNotIn = async (table, idColumn, ids) => {
    if (ids.length === 0) {
      await client.query(`DELETE FROM ${table}`);
      return;
    }
    const placeholders = ids.map(() => "?").join(", ");
    await client.query(
      `DELETE FROM ${table} WHERE ${idColumn} NOT IN (${placeholders})`,
      ids
    );
  };

  try {
    await client.beginTransaction();

    const users = normalizedState.users;
    const userIds = users.map((user) => user.id);
    await deleteWhereNotIn("users", "id", userIds);
    for (const user of users) {
      await client.query(
        `
          INSERT INTO users (id, name, email, password_hash, salt, token)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            email = VALUES(email),
            password_hash = VALUES(password_hash),
            salt = VALUES(salt),
            token = VALUES(token)
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
    await deleteWhereNotIn("school_years", "id", schoolYearIds);
    for (const year of schoolYears) {
      await client.query(
        `
          INSERT INTO school_years (id, label)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE label = VALUES(label)
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
    await deleteWhereNotIn("modules", "id", moduleIds);
    for (const module of modules) {
      await client.query(
        `
          INSERT INTO modules (id, school_year_id, title)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            school_year_id = VALUES(school_year_id),
            title = VALUES(title)
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
      const placeholders = templateEntries.map(() => "(?, ?)").join(", ");
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
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            template = VALUES(template)
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
    await deleteWhereNotIn("students", "id", studentIds);
    for (const student of students) {
      const competencyOptions = normalizeJsonValue(
        student.competencyOptions,
        []
      );
      const competencies = normalizeJsonValue(student.competencies, []);
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
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
          ON DUPLICATE KEY UPDATE
            teacher_id = VALUES(teacher_id),
            module_id = VALUES(module_id),
            evaluation_type = VALUES(evaluation_type),
            firstname = VALUES(firstname),
            name = VALUES(name),
            note = VALUES(note),
            group_name = VALUES(group_name),
            class_name = VALUES(class_name),
            teacher_name = VALUES(teacher_name),
            evaluation_date = VALUES(evaluation_date),
            coaching_date = VALUES(coaching_date),
            operational_competence = VALUES(operational_competence),
            competency_options = VALUES(competency_options),
            competencies = VALUES(competencies)
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
          competencyOptions,
          competencies
        ]
      );
    }

    await client.commit();
  } catch (error) {
    await client.rollback();
    throw error;
  } finally {
    client.release();
  }

  return normalizedState;
};
