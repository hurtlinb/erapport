import { useEffect, useMemo, useState } from "react";

const DEFAULT_COMPETENCIES = [
  {
    category: "Active Directory",
    items: [
      "Explain the role of a domain controller",
      "Create users and groups in an OU",
      "Join a workstation to the domain"
    ]
  },
  {
    category: "DNS",
    items: [
      "Create forward lookup zones",
      "Configure A and CNAME records",
      "Verify name resolution"
    ]
  },
  {
    category: "DHCP",
    items: [
      "Create a scope with options",
      "Reserve an address",
      "Validate client lease"
    ]
  }
];

const storageKey = "erapport.students";
const templateStorageKey = "erapport.template";

const defaultTemplate = {
  moduleTitle: "123 - Activer les services d'un serveur",
  note: "",
  competencies: DEFAULT_COMPETENCIES
};

const mapTemplateCompetencies = (template, existingCompetencies = []) => {
  const competencies = template?.competencies ?? [];

  return competencies.map((section) => {
    const existingSection = existingCompetencies.find(
      (candidate) => candidate.category === section.category
    );

    return {
      category: section.category,
      items: section.items.map((label) => {
        const existingItem = existingSection?.items?.find(
          (candidate) => candidate.label === label
        );

        return {
          label,
          status: existingItem?.status ?? "",
          comment: existingItem?.comment || ""
        };
      })
    };
  });
};

const applyTemplateToStudent = (template, student) => ({
  ...student,
  moduleTitle: template.moduleTitle || "",
  note: template.note || "",
  competencies: mapTemplateCompetencies(template, student.competencies)
});

const buildStudentFromTemplate = (template) => ({
  id: crypto.randomUUID(),
  name: "",
  cohort: "",
  evaluationDate: "",
  moduleTitle: template.moduleTitle || "",
  note: template.note || "",
  remarks: "",
  competencies: mapTemplateCompetencies(template)
});

function loadStudents() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
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
      return raw ? JSON.parse(raw) : defaultTemplate;
    } catch (error) {
      console.error(error);
      return defaultTemplate;
    }
  });
  const [students, setStudents] = useState(() => loadStudents());
  const [selectedId, setSelectedId] = useState(students[0]?.id || "");
  const [draft, setDraft] = useState(() => buildStudentFromTemplate(template));
  const [isEditing, setIsEditing] = useState(false);
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
      setDraft(selectedStudent);
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

  const handleStudentField = (field, value) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const updateCompetency = (sectionIndex, itemIndex, field, value) => {
    setDraft((prev) => ({
      ...prev,
      competencies: prev.competencies.map((section, sIndex) => {
        if (sIndex !== sectionIndex) return section;
        return {
          ...section,
          items: section.items.map((item, iIndex) =>
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
      competencies: prev.competencies.map((section, sIndex) =>
        sIndex === sectionIndex ? { ...section, category: value } : section
      )
    }));
  };

  const handleTemplateTaskChange = (sectionIndex, itemIndex, value) => {
    setTemplate((prev) => ({
      ...prev,
      competencies: prev.competencies.map((section, sIndex) => {
        if (sIndex !== sectionIndex) return section;
        return {
          ...section,
          items: section.items.map((item, iIndex) =>
            iIndex === itemIndex ? value : item
          )
        };
      })
    }));
  };

  const handleAddCategory = () => {
    setTemplate((prev) => ({
      ...prev,
      competencies: [
        ...prev.competencies,
        { category: "New category", items: ["New task"] }
      ]
    }));
  };

  const handleRemoveCategory = (sectionIndex) => {
    setTemplate((prev) => ({
      ...prev,
      competencies: prev.competencies.filter((_, index) => index !== sectionIndex)
    }));
  };

  const handleAddTask = (sectionIndex) => {
    setTemplate((prev) => ({
      ...prev,
      competencies: prev.competencies.map((section, sIndex) =>
        sIndex === sectionIndex
          ? { ...section, items: [...section.items, "New task"] }
          : section
      )
    }));
  };

  const handleRemoveTask = (sectionIndex, itemIndex) => {
    setTemplate((prev) => ({
      ...prev,
      competencies: prev.competencies.map((section, sIndex) => {
        if (sIndex !== sectionIndex) return section;
        return {
          ...section,
          items: section.items.filter((_, iIndex) => iIndex !== itemIndex)
        };
      })
    }));
  };

  const handleApplyTemplate = () => {
    setStudents((prev) =>
      prev.map((student) => applyTemplateToStudent(template, student))
    );
    setDraft((prev) => applyTemplateToStudent(template, prev));
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
            <button className="button primary" onClick={handleApplyTemplate}>
              Apply to all reports
            </button>
          </div>

          <div className="form-grid">
            <label>
              Default module title
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
                onChange={(event) => handleTemplateField("note", event.target.value)}
                placeholder="Text that will appear in the summary for new reports."
              />
            </label>
          </div>

          <div className="template-competency-grid">
            {template.competencies.map((section, sectionIndex) => (
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
                  {section.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="template-task-row">
                      <input
                        type="text"
                        value={item}
                        onChange={(event) =>
                          handleTemplateTaskChange(
                            sectionIndex,
                            itemIndex,
                            event.target.value
                          )
                        }
                      />
                      <button
                        className="button text"
                        onClick={() => handleRemoveTask(sectionIndex, itemIndex)}
                        aria-label="Remove task"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
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

          <div className="actions align-start">
            <button className="button ghost" onClick={handleAddCategory}>
              + Add category
            </button>
          </div>
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
                    {student.cohort || "No cohort"} •{" "}
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
              Cohort / program
              <input
                type="text"
                value={draft.cohort}
                onChange={(event) => handleStudentField("cohort", event.target.value)}
                placeholder="INFO-F12"
              />
            </label>
            <label>
              Evaluation date
              <input
                type="date"
                value={draft.evaluationDate}
                onChange={(event) =>
                  handleStudentField("evaluationDate", event.target.value)
                }
              />
            </label>
            <label>
              Module title
              <input
                type="text"
                value={draft.moduleTitle}
                onChange={(event) =>
                  handleStudentField("moduleTitle", event.target.value)
                }
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
            {draft.competencies.map((section, sectionIndex) => (
              <div key={section.category} className="competency-section">
                <h3>{section.category}</h3>
                <div className="competency-table">
                  {section.items.map((item, itemIndex) => (
                    <div key={item.label} className="competency-row">
                      <div>
                        <p className="competency-label">{item.label}</p>
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
                        <option value="OK">OK</option>
                        <option value="NOK">Needs improvement</option>
                        <option value="NA">Not assessed</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
