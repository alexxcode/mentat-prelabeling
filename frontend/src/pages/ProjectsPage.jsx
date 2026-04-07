import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProjects, createProject, deleteProject } from "../api/client";
import styles from "./ProjectsPage.module.css";

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const load = () => getProjects().then(setProjects);

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await createProject({ name: newName.trim() });
      setNewName("");
      await load();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Eliminar proyecto "${name}"?`)) return;
    await deleteProject(id);
    load();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>EXPAI Pre-Labeling</h1>
      </header>

      <main className={styles.main}>
        <form className={styles.form} onSubmit={handleCreate}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del nuevo proyecto"
            className={styles.input}
          />
          <button type="submit" disabled={loading} className={styles.btnPrimary}>
            {loading ? "Creando..." : "Nuevo proyecto"}
          </button>
        </form>

        <div className={styles.grid}>
          {projects.map((p) => (
            <div key={p.id} className={styles.card}>
              <h2 onClick={() => navigate(`/projects/${p.id}`)}>{p.name}</h2>
              <p className={styles.date}>
                {new Date(p.created_at).toLocaleDateString("es")}
              </p>
              <button
                className={styles.btnDanger}
                onClick={() => handleDelete(p.id, p.name)}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
