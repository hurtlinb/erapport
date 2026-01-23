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

const splitModuleLabel = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return { moduleNumber: "", moduleTitle: "" };
  }
  const match = normalized.match(/^(.+?)\s*-\s*(.+)$/);
  if (!match) {
    return { moduleNumber: "", moduleTitle: normalized };
  }
  return {
    moduleNumber: match[1].trim(),
    moduleTitle: match[2].trim()
  };
};

const defaultTemplate = {
  moduleId: "",
  moduleNumber: "123",
  moduleTitle: "Activer les services d'un serveur",
  schoolYear: "2024-2025",
  note: "",
  evaluationType: EVALUATION_TYPES[0],
  groupFeatureEnabled: false,
  summaryByCompetencies: false,
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
  const competencyOptions = normalizeCompetencyOptions(
    baseTemplate.competencyOptions || defaultTemplate.competencyOptions
  );
  const competencies = normalizeCompetencies(
    baseTemplate.competencies || defaultTemplate.competencies
  );
  return {
    ...defaultTemplate,
    ...baseTemplate,
    moduleId: module.id,
    moduleNumber: module.moduleNumber || "",
    moduleTitle: module.moduleTitle || "",
    schoolYear: schoolYearLabel || "",
    evaluationType:
      evaluationType || baseTemplate.evaluationType || defaultTemplate.evaluationType,
    groupFeatureEnabled: Boolean(baseTemplate.groupFeatureEnabled),
    summaryByCompetencies: Boolean(baseTemplate.summaryByCompetencies),
    competencyOptions,
    competencies
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
  const legacyTitle = overrides.title ?? "";
  const splitLegacyTitle = splitModuleLabel(legacyTitle);
  const module = {
    id: overrides.id ?? crypto.randomUUID(),
    moduleNumber:
      overrides.moduleNumber ?? splitLegacyTitle.moduleNumber ?? "",
    moduleTitle:
      overrides.moduleTitle ??
      splitLegacyTitle.moduleTitle ??
      defaultTemplate.moduleTitle,
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
    const legacyTitle = module.title ?? "";
    const splitLegacyTitle = splitModuleLabel(legacyTitle);
    const normalizedModule = {
      id: module.id || crypto.randomUUID(),
      moduleNumber:
        module.moduleNumber ?? splitLegacyTitle.moduleNumber ?? "",
      moduleTitle:
        module.moduleTitle ?? splitLegacyTitle.moduleTitle ?? legacyTitle ?? "",
      schoolYear: module.schoolYear || schoolYearLabel
    };
    const moduleWithDefaults = {
      ...module,
      moduleNumber: normalizedModule.moduleNumber,
      moduleTitle: normalizedModule.moduleTitle
    };

    return {
      ...normalizedModule,
      templates: normalizeModuleTemplates(
        {
          ...normalizedModule,
          templates: normalizeModuleTemplates(moduleWithDefaults, schoolYearLabel)
        },
        schoolYearLabel
      )
    };
  });
};

const normalizeSchoolYears = (schoolYears = []) => {
  if (Array.isArray(schoolYears) && schoolYears.length > 0) {
    return schoolYears.map((schoolYear) => {
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
  }

  return [];
};

const normalizeTextValue = (value) => {
  if (typeof value === "string") {
    return value.normalize("NFC");
  }
  if (value === null || value === undefined) return "";
  return String(value).normalize("NFC");
};

const ensureId = (value) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : crypto.randomUUID();
};

const normalizeCompetencyOption = (option) => {
  const baseOption = option && typeof option === "object" ? option : {};
  return {
    id: ensureId(baseOption.id),
    code: normalizeTextValue(baseOption.code),
    description: normalizeTextValue(baseOption.description)
  };
};

const normalizeCompetencyItem = (item, defaultGroupEvaluation = false) => {
  const baseItem = item && typeof item === "object" ? item : {};
  const hasGroupEvaluation = "groupEvaluation" in baseItem;
  const groupEvaluation = hasGroupEvaluation
    ? Boolean(baseItem.groupEvaluation)
    : defaultGroupEvaluation;
  if (typeof item === "string") {
    return {
      id: ensureId(),
      task: normalizeTextValue(item),
      competencyId: "",
      evaluationMethod: "",
      groupEvaluation,
      status: "",
      comment: ""
    };
  }
  return {
    id: ensureId(baseItem.id),
    task: normalizeTextValue(baseItem.task),
    competencyId: normalizeTextValue(baseItem.competencyId),
    evaluationMethod: normalizeTextValue(baseItem.evaluationMethod),
    groupEvaluation,
    status: normalizeTextValue(baseItem.status),
    comment: normalizeTextValue(baseItem.comment)
  };
};

const normalizeCompetencySection = (section) => {
  const baseSection = section && typeof section === "object" ? section : {};
  const groupEvaluation = Boolean(baseSection.groupEvaluation);
  return {
    id: ensureId(baseSection.id),
    category: normalizeTextValue(baseSection.category),
    groupEvaluation,
    result: normalizeTextValue(baseSection.result),
    items: (baseSection.items || []).map((item) =>
      normalizeCompetencyItem(item, groupEvaluation)
    )
  };
};

const normalizeCompetencyOptions = (options = []) =>
  Array.isArray(options) ? options.map(normalizeCompetencyOption) : [];

const normalizeCompetencies = (competencies = []) =>
  Array.isArray(competencies)
    ? competencies.map(normalizeCompetencySection)
    : [];

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
    email: normalizeTextValue(baseStudent.email),
    evaluationType: baseStudent?.evaluationType || EVALUATION_TYPES[0],
    teacherId: baseStudent?.teacherId || "",
    summaryByCompetencies: Boolean(baseStudent?.summaryByCompetencies),
    competencySummaryOverrides: normalizeJsonValue(
      baseStudent.competencySummaryOverrides,
      {}
    ),
    competencyOptions: normalizeCompetencyOptions(
      normalizeJsonValue(baseStudent.competencyOptions, [])
    ),
    competencies: normalizeCompetencies(
      normalizeJsonValue(baseStudent.competencies, [])
    )
  };
};

const buildCompetencyOptionsFromRows = (rows) =>
  rows.map((row) => ({
    id: row.id,
    code: normalizeTextValue(row.code),
    description: normalizeTextValue(row.description)
  }));

const buildCompetencyCategoriesFromRows = (
  categories,
  tasksByCategory,
  competencyIdToCode = new Map()
) =>
  categories.map((category) => ({
    id: category.id,
    category: normalizeTextValue(category.name),
    groupEvaluation: Boolean(category.group_evaluation),
    result: normalizeTextValue(category.result),
    items: (tasksByCategory.get(category.id) || []).map((task) => ({
      id: task.id,
      task: normalizeTextValue(task.task),
      competencyId: normalizeTextValue(
        competencyIdToCode.get(task.competency_id) || task.competency_id
      ),
      evaluationMethod: normalizeTextValue(task.evaluation_method),
      groupEvaluation: Boolean(task.group_evaluation),
      status: normalizeTextValue(task.status),
      comment: normalizeTextValue(task.comment)
    }))
  }));

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
    schoolYears: normalizeSchoolYears(nextState.schoolYears),
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

const migrateCompetencyTables = async (client) => {
  const [studentRows] = await client.query(
    "SELECT id, competency_options, competencies FROM students"
  );
  if (studentRows.length === 0) return;

  const [existingCompetencyRows] = await client.query(
    "SELECT student_id, id, code, sort_order FROM competencies"
  );
  const [existingCategoryRows] = await client.query(
    "SELECT DISTINCT student_id FROM categories"
  );
  const competencyLookupByStudent = existingCompetencyRows.reduce(
    (acc, row) => {
      if (!acc[row.student_id]) {
        acc[row.student_id] = {
          codeToId: new Map(),
          idSet: new Set(),
          nextSortOrder: 0
        };
      }
      const entry = acc[row.student_id];
      entry.codeToId.set(row.code, row.id);
      entry.idSet.add(row.id);
      entry.nextSortOrder = Math.max(entry.nextSortOrder, row.sort_order + 1);
      return acc;
    },
    {}
  );
  const categoryStudents = new Set(
    existingCategoryRows.map((row) => row.student_id)
  );

  for (const student of studentRows) {
    const competencyOptions = normalizeCompetencyOptions(
      normalizeJsonValue(student.competency_options, [])
    );
    const competencies = normalizeCompetencies(
      normalizeJsonValue(student.competencies, [])
    );
    const lookup =
      competencyLookupByStudent[student.id] || {
        codeToId: new Map(),
        idSet: new Set(),
        nextSortOrder: 0
      };
    competencyLookupByStudent[student.id] = lookup;

    if (competencyOptions.length > 0) {
      for (const [index, option] of competencyOptions.entries()) {
        if (lookup.codeToId.has(option.code)) {
          const existingId = lookup.codeToId.get(option.code);
          await client.query(
            `
              UPDATE competencies
              SET code = ?, description = ?, sort_order = ?
              WHERE id = ?
            `,
            [option.code, option.description, index, existingId]
          );
          continue;
        }
        await client.query(
          `
            INSERT INTO competencies (id, student_id, code, description, sort_order)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              code = VALUES(code),
              description = VALUES(description),
              sort_order = VALUES(sort_order)
          `,
          [option.id, student.id, option.code, option.description, index]
        );
        lookup.codeToId.set(option.code, option.id);
        lookup.idSet.add(option.id);
        lookup.nextSortOrder = Math.max(lookup.nextSortOrder, index + 1);
      }
    }

    if (!categoryStudents.has(student.id) && competencies.length > 0) {
      for (const [categoryIndex, category] of competencies.entries()) {
        await client.query(
          `
            INSERT INTO categories (id, student_id, name, group_evaluation, result, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              name = VALUES(name),
              group_evaluation = VALUES(group_evaluation),
              result = VALUES(result),
              sort_order = VALUES(sort_order)
          `,
          [
            category.id,
            student.id,
            category.category,
            category.groupEvaluation ? 1 : 0,
            category.result,
            categoryIndex
          ]
        );
        for (const [itemIndex, item] of category.items.entries()) {
          let resolvedCompetencyId = null;
          if (item.competencyId) {
            if (lookup.idSet.has(item.competencyId)) {
              resolvedCompetencyId = item.competencyId;
            } else if (lookup.codeToId.has(item.competencyId)) {
              resolvedCompetencyId = lookup.codeToId.get(item.competencyId);
            } else {
              const newId = crypto.randomUUID();
              await client.query(
                `
                  INSERT INTO competencies (id, student_id, code, description, sort_order)
                  VALUES (?, ?, ?, ?, ?)
                  ON DUPLICATE KEY UPDATE
                    code = VALUES(code),
                    description = VALUES(description),
                    sort_order = VALUES(sort_order)
                `,
                [
                  newId,
                  student.id,
                  item.competencyId,
                  "",
                  lookup.nextSortOrder
                ]
              );
              lookup.codeToId.set(item.competencyId, newId);
              lookup.idSet.add(newId);
              lookup.nextSortOrder += 1;
              resolvedCompetencyId = newId;
            }
          }
          await client.query(
            `
              INSERT INTO tasks (
                id,
                category_id,
                task,
                competency_id,
                evaluation_method,
                group_evaluation,
                status,
                comment,
                sort_order
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                task = VALUES(task),
                competency_id = VALUES(competency_id),
                evaluation_method = VALUES(evaluation_method),
                group_evaluation = VALUES(group_evaluation),
                status = VALUES(status),
                comment = VALUES(comment),
                sort_order = VALUES(sort_order)
            `,
            [
              item.id,
              category.id,
              item.task,
              resolvedCompetencyId,
              item.evaluationMethod,
              item.groupEvaluation ? 1 : 0,
              item.status,
              item.comment,
              itemIndex
            ]
          );
        }
      }
    }
  }
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
          title TEXT NOT NULL,
          module_number TEXT NOT NULL DEFAULT ''
        )
      `);
      await client.query(`
        ALTER TABLE modules
        ADD COLUMN module_number TEXT NOT NULL DEFAULT ''
      `).catch(() => {});
      await client.query(`
        UPDATE modules
        SET module_number = TRIM(SUBSTRING_INDEX(title, '-', 1)),
            title = TRIM(SUBSTRING(title, LOCATE('-', title) + 1))
        WHERE module_number = '' AND title LIKE '%-%'
      `).catch(() => {});
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
          email TEXT,
          note TEXT,
          group_name TEXT,
          class_name TEXT,
          teacher_name TEXT,
          evaluation_date TEXT,
          coaching_date TEXT,
          operational_competence TEXT,
          summary_by_competencies TINYINT(1) NOT NULL DEFAULT 0,
          competency_summary_overrides JSON,
          competency_options JSON,
          competencies JSON,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS competencies (
          id CHAR(36) PRIMARY KEY,
          student_id CHAR(36) NOT NULL,
          code TEXT NOT NULL,
          description TEXT NOT NULL,
          sort_order INT NOT NULL DEFAULT 0
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS categories (
          id CHAR(36) PRIMARY KEY,
          student_id CHAR(36) NOT NULL,
          name TEXT NOT NULL,
          group_evaluation TINYINT(1) NOT NULL DEFAULT 0,
          result TEXT,
          sort_order INT NOT NULL DEFAULT 0
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id CHAR(36) PRIMARY KEY,
          category_id CHAR(36) NOT NULL,
          task TEXT NOT NULL,
          competency_id CHAR(36) NULL,
          evaluation_method TEXT,
          group_evaluation TINYINT(1) NOT NULL DEFAULT 0,
          status TEXT,
          comment TEXT,
          sort_order INT NOT NULL DEFAULT 0
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
      await client.query(`
        ALTER TABLE competencies
        ADD CONSTRAINT competencies_student_fk
          FOREIGN KEY (student_id) REFERENCES students(id)
          ON DELETE CASCADE
      `).catch(() => {});
      await client.query(`
        ALTER TABLE categories
        ADD CONSTRAINT categories_student_fk
          FOREIGN KEY (student_id) REFERENCES students(id)
          ON DELETE CASCADE
      `).catch(() => {});
      await client.query(`
        ALTER TABLE tasks
        ADD CONSTRAINT tasks_category_fk
          FOREIGN KEY (category_id) REFERENCES categories(id)
          ON DELETE CASCADE
      `).catch(() => {});
      await client.query(`
        ALTER TABLE tasks
        ADD CONSTRAINT tasks_competency_fk
          FOREIGN KEY (competency_id) REFERENCES competencies(id)
          ON DELETE SET NULL
      `).catch(() => {});
      await client.query(`
        ALTER TABLE students
        ADD COLUMN summary_by_competencies TINYINT(1) NOT NULL DEFAULT 0
      `).catch(() => {});
      await client.query(`
        ALTER TABLE students
        ADD COLUMN email TEXT
      `).catch(() => {});
      await client.query(`
        ALTER TABLE students
        ADD COLUMN competency_summary_overrides JSON
      `).catch(() => {});
      await migrateCompetencyTables(client);
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
      summaryByCompetencies: Boolean(template.summaryByCompetencies),
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

const replaceStudentCompetencies = async (client, student) => {
  await client.query(
    `
      DELETE FROM tasks
      WHERE category_id IN (SELECT id FROM categories WHERE student_id = ?)
    `,
    [student.id]
  );
  await client.query("DELETE FROM categories WHERE student_id = ?", [
    student.id
  ]);
  await client.query("DELETE FROM competencies WHERE student_id = ?", [
    student.id
  ]);

  const competencyOptions = student.competencyOptions || [];
  const competencyIdByCode = new Map();
  let nextSortOrder = competencyOptions.length;
  for (const [index, option] of competencyOptions.entries()) {
    await client.query(
      `
        INSERT INTO competencies (id, student_id, code, description, sort_order)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          code = VALUES(code),
          description = VALUES(description),
          sort_order = VALUES(sort_order)
      `,
      [option.id, student.id, option.code, option.description, index]
    );
    if (option.code) {
      competencyIdByCode.set(option.code, option.id);
    }
    if (option.id) {
      competencyIdByCode.set(option.id, option.id);
    }
  }

  const categories = student.competencies || [];
  for (const [categoryIndex, category] of categories.entries()) {
    await client.query(
      `
        INSERT INTO categories (id, student_id, name, group_evaluation, result, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          group_evaluation = VALUES(group_evaluation),
          result = VALUES(result),
          sort_order = VALUES(sort_order)
      `,
      [
        category.id,
        student.id,
        category.category,
        category.groupEvaluation ? 1 : 0,
        category.result,
        categoryIndex
      ]
    );

    const taskCompetencyIds = category.items
      .map((item) => item.competencyId)
      .filter((id) => id);
    for (const competencyId of taskCompetencyIds) {
      if (competencyIdByCode.has(competencyId)) continue;
      const newId = crypto.randomUUID();
      await client.query(
        `
          INSERT INTO competencies (id, student_id, code, description, sort_order)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            code = VALUES(code),
            description = VALUES(description),
            sort_order = VALUES(sort_order)
        `,
        [newId, student.id, competencyId, "", nextSortOrder]
      );
      competencyIdByCode.set(competencyId, newId);
      nextSortOrder += 1;
    }

    for (const [itemIndex, item] of category.items.entries()) {
      await client.query(
        `
          INSERT INTO tasks (
            id,
            category_id,
            task,
            competency_id,
            evaluation_method,
            group_evaluation,
            status,
            comment,
            sort_order
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            task = VALUES(task),
            competency_id = VALUES(competency_id),
            evaluation_method = VALUES(evaluation_method),
            group_evaluation = VALUES(group_evaluation),
            status = VALUES(status),
            comment = VALUES(comment),
            sort_order = VALUES(sort_order)
        `,
        [
          item.id,
          category.id,
          item.task,
          competencyIdByCode.get(item.competencyId) || null,
          item.evaluationMethod,
          item.groupEvaluation ? 1 : 0,
          item.status,
          item.comment,
          itemIndex
        ]
      );
    }
  }
};

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

export const checkDatabaseStatus = async () => {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.ping();
    } finally {
      connection.release();
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

export const loadState = async () => {
  await ensureInitialized();
  const [
    yearResult,
    moduleResult,
    templateResult,
    studentResult,
    userResult,
    competencyResult,
    categoryResult,
    taskResult
  ] = await Promise.all([
    pool.query("SELECT id, label FROM school_years ORDER BY label"),
    pool.query("SELECT id, school_year_id, title, module_number FROM modules"),
    pool.query(
      "SELECT module_id, evaluation_type, template FROM module_templates"
    ),
    pool.query("SELECT * FROM students"),
    pool.query("SELECT id, name, email, password_hash, salt, token FROM users"),
    pool.query(
      "SELECT id, student_id, code, description, sort_order FROM competencies ORDER BY sort_order"
    ),
    pool.query(
      "SELECT id, student_id, name, group_evaluation, result, sort_order FROM categories ORDER BY sort_order"
    ),
    pool.query(
      `SELECT
        id,
        category_id,
        task,
        competency_id,
        evaluation_method,
        group_evaluation,
        status,
        comment,
        sort_order
      FROM tasks
      ORDER BY sort_order`
    )
  ]);
  const [yearRows] = yearResult;
  const [moduleRows] = moduleResult;
  const [templateRows] = templateResult;
  const [studentRows] = studentResult;
  const [userRows] = userResult;
  const [competencyRows] = competencyResult;
  const [categoryRows] = categoryResult;
  const [taskRows] = taskResult;

  const templatesByModule = readTemplatesByModule(templateRows);
  const schoolYearMap = new Map(
    yearRows.map((year) => [year.id, { ...year, modules: [] }])
  );

  const competenciesByStudent = competencyRows.reduce((acc, row) => {
    if (!acc[row.student_id]) acc[row.student_id] = [];
    acc[row.student_id].push(row);
    return acc;
  }, {});
  const competencyIdToCodeByStudent = competencyRows.reduce((acc, row) => {
    if (!acc[row.student_id]) acc[row.student_id] = new Map();
    acc[row.student_id].set(row.id, row.code);
    return acc;
  }, {});

  const categoriesByStudent = categoryRows.reduce((acc, row) => {
    if (!acc[row.student_id]) acc[row.student_id] = [];
    acc[row.student_id].push(row);
    return acc;
  }, {});

  const tasksByCategory = taskRows.reduce((acc, row) => {
    if (!acc.has(row.category_id)) {
      acc.set(row.category_id, []);
    }
    acc.get(row.category_id).push(row);
    return acc;
  }, new Map());

  moduleRows.forEach((module) => {
    const year = schoolYearMap.get(module.school_year_id);
    if (!year) return;
    const legacySplit = splitModuleLabel(module.title);
    const modulePayload = {
      id: module.id,
      moduleNumber: module.module_number || legacySplit.moduleNumber || "",
      moduleTitle: legacySplit.moduleTitle || module.title || "",
      schoolYear: year.label,
      templates: templatesByModule[module.id] || {}
    };
    year.modules.push(modulePayload);
  });

  const schoolYears = Array.from(schoolYearMap.values());

  const moduleLookup = moduleRows.reduce((acc, module) => {
    const schoolYear = schoolYearMap.get(module.school_year_id);
    const legacySplit = splitModuleLabel(module.title);
    acc[module.id] = {
      moduleNumber: module.module_number || legacySplit.moduleNumber || "",
      moduleTitle: legacySplit.moduleTitle || module.title || "",
      schoolYear: schoolYear?.label || "",
      templates: templatesByModule[module.id] || {}
    };
    return acc;
  }, {});

  const students = studentRows.map((student) => {
    const moduleInfo = moduleLookup[student.module_id] || {
      moduleNumber: "",
      moduleTitle: "",
      schoolYear: "",
      templates: {}
    };
    const template =
      moduleInfo.templates?.[student.evaluation_type] || defaultTemplate;
    const competencyOptionRows = competenciesByStudent[student.id];
    const categoryRowsForStudent = categoriesByStudent[student.id];
    const competencyIdToCode = competencyIdToCodeByStudent[student.id];
    return normalizeStudent({
      id: student.id,
      moduleId: student.module_id,
      moduleNumber: moduleInfo.moduleNumber || "",
      moduleTitle: moduleInfo.moduleTitle || "",
      schoolYear: moduleInfo.schoolYear || "",
      evaluationType: student.evaluation_type || EVALUATION_TYPES[0],
      firstname: student.firstname || "",
      name: student.name || "",
      email: student.email || "",
      note: student.note ?? "",
      groupName: student.group_name || "",
      className: student.class_name || "",
      teacher: student.teacher_name || "",
      teacherId: student.teacher_id || "",
      evaluationDate: student.evaluation_date || "",
      coachingDate: student.coaching_date || "",
      operationalCompetence: student.operational_competence || "",
      summaryByCompetencies: Boolean(student.summary_by_competencies),
      competencySummaryOverrides: student.competency_summary_overrides || {},
      competencyOptions:
        competencyOptionRows?.length
          ? buildCompetencyOptionsFromRows(competencyOptionRows)
          : student.competency_options || template.competencyOptions || [],
      competencies:
        categoryRowsForStudent?.length
          ? buildCompetencyCategoriesFromRows(
              categoryRowsForStudent,
              tasksByCategory,
              competencyIdToCode
            )
          : student.competencies || template.competencies || []
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
          INSERT INTO modules (id, school_year_id, title, module_number)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            school_year_id = VALUES(school_year_id),
            title = VALUES(title),
            module_number = VALUES(module_number)
        `,
        [
          module.id,
          module.schoolYearId,
          module.moduleTitle || "",
          module.moduleNumber || ""
        ]
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
      const competencyOptions = serializeJsonValue(
        student.competencyOptions,
        []
      );
      const competencySummaryOverrides = serializeJsonValue(
        student.competencySummaryOverrides,
        {}
      );
      const competencies = serializeJsonValue(student.competencies, []);
      await client.query(
        `
          INSERT INTO students (
            id,
            teacher_id,
            module_id,
            evaluation_type,
            firstname,
            name,
            email,
            note,
            group_name,
            class_name,
            teacher_name,
            evaluation_date,
            coaching_date,
            operational_competence,
            summary_by_competencies,
            competency_summary_overrides,
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
            email = VALUES(email),
            note = VALUES(note),
            group_name = VALUES(group_name),
            class_name = VALUES(class_name),
            teacher_name = VALUES(teacher_name),
            evaluation_date = VALUES(evaluation_date),
            coaching_date = VALUES(coaching_date),
            operational_competence = VALUES(operational_competence),
            summary_by_competencies = VALUES(summary_by_competencies),
            competency_summary_overrides = VALUES(competency_summary_overrides),
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
          student.email || "",
          student.note ?? "",
          student.groupName || "",
          student.className || "",
          student.teacher || "",
          student.evaluationDate || "",
          student.coachingDate || "",
          student.operationalCompetence || "",
          student.summaryByCompetencies ? 1 : 0,
          competencySummaryOverrides,
          competencyOptions,
          competencies
        ]
      );
      await replaceStudentCompetencies(client, student);
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
