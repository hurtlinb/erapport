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

const emptyStudent = {
  id: "",
  name: "",
  cohort: "",
  evaluationDate: "",
  moduleTitle: "123 - Activer les services d'un serveur",
  note: "",
  remarks: "",
  competencies: DEFAULT_COMPETENCIES.map((section) => ({
    category: section.category,
    items: section.items.map((label) => ({
      label,
      status: "OK",
      comment: ""
    }))
  }))
};

const storageKey = "erapport.students";

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
  const [students, setStudents] = useState(() => loadStudents());
  const [selectedId, setSelectedId] = useState(students[0]?.id || "");
  const [draft, setDraft] = useState(emptyStudent);
  const [isEditing, setIsEditing] = useState(false);
  const selectedStudent = students.find((student) => student.id === selectedId);

  useEffect(() => {
    saveStudents(students);
  }, [students]);

  useEffect(() => {
    if (selectedStudent) {
      setDraft(selectedStudent);
      setIsEditing(true);
    } else {
      setDraft({ ...emptyStudent, id: crypto.randomUUID() });
      setIsEditing(false);
    }
  }, [selectedStudent]);

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
    const response = await fetch("/api/report", {
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
