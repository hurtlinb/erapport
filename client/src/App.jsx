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
        task: "Explain the role of a domain controller",
        competencyId: "OO1"
      },
      {
        task: "Create users and groups in an OU",
        competencyId: "OO1"
      },
      {
        task: "Join a workstation to the domain",
        competencyId: "OO3"
      }
    ]
  },
  {
    category: "DNS",
    items: [
      { task: "Create forward lookup zones", competencyId: "OO2" },
      { task: "Configure A and CNAME records", competencyId: "OO2" },
      { task: "Verify name resolution", competencyId: "OO3" }
    ]
  },
  {
    category: "DHCP",
    items: [
      { task: "Create a scope with options", competencyId: "OO2" },
      { task: "Reserve an address", competencyId: "OO2" },
      { task: "Validate client lease", competencyId: "OO3" }
    ]
  }
];

const storageKey = "erapport.students";
const templateStorageKey = "erapport.template";
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
  moduleTitle: "123 - Activer les services d'un serveur",
  note: "",
  evaluationType: "E1",
  className: "",
  teacher: "",
  evaluationDate: "",
  coachingDate: "",
  competencyOptions: DEFAULT_COMPETENCY_OPTIONS,
  competencies: DEFAULT_COMPETENCIES
};

const normalizeTemplateItem = (item) => {
  if (typeof item === "string") {
    return { task: item, competencyId: "" };
  }
  return {
    task: item?.task || "",
    competencyId: item?.competencyId || ""
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
  moduleTitle: template.moduleTitle || "",
  note: template.note || "",
  evaluationType: template.evaluationType || "",
  className: template.className || "",
  teacher: template.teacher || "",
  evaluationDate: template.evaluationDate || "",
  coachingDate: template.coachingDate || "",
  competencyOptions: template.competencyOptions || [],
  competencies: mapTemplateCompetencies(template, student.competencies)
});

const buildStudentFromTemplate = (template) => ({
  id: crypto.randomUUID(),
  name: "",
  moduleTitle: template.moduleTitle || "",
  note: template.note || "",
  remarks: "",
  evaluationType: template.evaluationType || "",
  className: template.className || "",
  teacher: template.teacher || "",
  evaluationDate: template.evaluationDate || "",
  coachingDate: template.coachingDate || "",
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

function App() {
  const [template, setTemplate] = useState(() => {
    try {
      const raw = localStorage.getItem(templateStorageKey);
      if (!raw) return defaultTemplate;
      const parsed = JSON.parse(raw);
      return {
        ...defaultTemplate,
        ...parsed,
        competencyOptions: parsed.competencyOptions || defaultTemplate.competencyOptions,
        competencies: parsed.competencies || defaultTemplate.competencies
      };
    } catch (error) {
      console.error(error);
      return defaultTemplate;
    }
  });
  const [students, setStudents] = useState(() => loadStudents());
  const [selectedId, setSelectedId] = useState(students[0]?.id || "");
  const [draft, setDraft] = useState(() => buildStudentFromTemplate(template));
  const [isEditing, setIsEditing] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const selectedStudent = students.find((student) => student.id === selectedId);

  useEffect(() => {
    saveStudents(students);
  }, [students]);

  useEffect(() => {
    try {
      localStorage.setItem(templateStorageKey, JSON.stringify(template));
    } catch (error) {
      console.error(error);
    }
  }, [template]);

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
      prev.map((student) => applyTemplateToStudent(template, student))
    );
    setDraft((prev) => applyTemplateToStudent(template, prev));
  }, [template]);

  const studentCountLabel = useMemo(() => {
    return students.length === 1 ? "1 student" : `${students.length} students`;
  }, [students.length]);

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
    setDraft((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const updateCompetency = (sectionIndex, itemIndex, field, value) => {
    setDraft((prev) => ({
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

  const handleSaveStudent = () => {
    if (!draft.name.trim()) {
      alert("Please enter the student's name.");
      return;
    }
    setStudents((prev) => {
      const exists = prev.some((student) => student.id === draft.id);
      if (exists) {
        return prev.map((student) =>
          student.id === draft.id ? { ...draft } : student
        );
      }
      return [...prev, { ...draft }];
    });
    setSelectedId(draft.id);
  };

  const handleDeleteStudent = (id) => {
    if (!confirm("Delete this student?")) return;
    setStudents((prev) => prev.filter((student) => student.id !== id));
    if (selectedId === id) {
      setSelectedId("");
    }
  };

  const handleNewStudent = () => {
    setSelectedId("");
  };

  const handleGeneratePdf = async () => {
    if (!draft.name.trim()) {
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
    link.download = `${draft.name}-evaluation-report.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleTemplateField = (field, value) => {
    setTemplate((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTemplateCategoryChange = (sectionIndex, value) => {
    setTemplate((prev) => ({
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
    setTemplate((prev) => ({
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
    setTemplate((prev) => ({
      ...prev,
      competencies: [
        ...(prev.competencies || []),
        {
          category: "New category",
          items: [
            {
              task: "New task",
              competencyId: prev.competencyOptions?.[0]?.code || ""
            }
          ]
        }
      ]
    }));
  };

  const handleRemoveCategory = (sectionIndex) => {
    setTemplate((prev) => ({
      ...prev,
      competencies: (prev.competencies || []).filter(
        (_, index) => index !== sectionIndex
      )
    }));
  };

  const handleAddCompetencyOption = () => {
    setTemplate((prev) => ({
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
    setTemplate((prev) => ({
      ...prev,
      competencyOptions: (prev.competencyOptions || []).map(
        (option, optIndex) =>
          optIndex === index ? { ...option, [field]: value } : option
      )
    }));
  };

  const handleRemoveCompetencyOption = (index) => {
    setTemplate((prev) => {
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
    setTemplate((prev) => ({
      ...prev,
      competencies: (prev.competencies || []).map((section, sIndex) =>
        sIndex === sectionIndex
          ? {
              ...section,
              items: [
                ...(section.items || []),
                {
                  task: "New task",
                  competencyId: prev.competencyOptions?.[0]?.code || ""
                }
              ]
            }
          : section
      )
    }));
  };

  const handleRemoveTask = (sectionIndex, itemIndex) => {
    setTemplate((prev) => ({
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

  const handleApplyTemplate = () => {
    setStudents((prev) =>
      prev.map((student) => applyTemplateToStudent(template, student))
    );
    setDraft((prev) => applyTemplateToStudent(template, prev));
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
            <p className="value">{draft.moduleTitle || "Not set"}</p>
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
            <button
              className="button primary"
              type="button"
              onClick={() => setIsTemplateModalOpen(true)}
            >
              Modify template
            </button>
          </div>

          <div className="template-summary">
            <div className="summary-pill">
              <span className="pill-label">Module</span>
              <span className="pill-value">
                {template.moduleTitle || "Not set"}
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
            <button className="button ghost" onClick={handleNewStudent}>
              + New student
            </button>
          </div>
          <ul className="student-list">
            {students.length === 0 && (
              <li className="empty">No students yet. Add one to get started.</li>
            )}
            {students.map((student) => (
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
                  <p className="student-name">{student.name}</p>
                  <p className="student-meta">
                    {student.className || "No class"} •{" "}
                    {student.evaluationDate || "No date"}
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
            <h2>{isEditing ? "Edit report" : "New report"}</h2>
            <div className="actions">
              <button className="button" onClick={handleSaveStudent}>
                Save student
              </button>
              <button className="button primary" onClick={handleGeneratePdf}>
                Generate PDF
              </button>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Student name
              <input
                type="text"
                value={draft.name}
                onChange={(event) => handleStudentField("name", event.target.value)}
                placeholder="Barbara Ayoub"
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
          </div>

          <div className="textarea-block">
            <label>
              Report summary
              <textarea
                rows="3"
                value={draft.note}
                onChange={(event) => handleStudentField("note", event.target.value)}
                placeholder="Overall feedback for the student..."
              />
            </label>
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

          <div className="competency-grid">
            {(draft.competencies || []).map((section, sectionIndex) => (
              <div key={section.category} className="competency-section">
                <h3>{section.category}</h3>
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

            <div className="form-grid">
              <label>
                Module title
                <input
                  type="text"
                  value={template.moduleTitle}
                  onChange={(event) =>
                    handleTemplateField("moduleTitle", event.target.value)
                  }
                  placeholder="123 - Activer les services d'un serveur"
                />
              </label>
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
                  <option value="E1">E1</option>
                  <option value="E2">E2</option>
                  <option value="E3">E3</option>
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
                        <div key={itemIndex} className="template-task-row">
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
