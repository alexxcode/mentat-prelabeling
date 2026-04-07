import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getProject, getVideos, uploadVideo } from "../api/client";
import styles from "./ProjectDetailPage.module.css";

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [videos, setVideos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const load = async () => {
    const [p, vs] = await Promise.all([
      getProject(projectId),
      getVideos(projectId),
    ]);
    setProject(p);
    setVideos(vs);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      await uploadVideo(projectId, file, setUploadProgress);
      await load();
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = "";
    }
  };

  if (!project) return <div className={styles.loading}>Cargando...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate("/projects")}>
          &larr; Proyectos
        </button>
        <h1>{project.name}</h1>
      </header>

      <main className={styles.main}>
        <div className={styles.uploadZone}>
          <label className={uploading ? styles.uploading : styles.uploadLabel}>
            {uploading
              ? `Subiendo... ${uploadProgress}%`
              : "Subir video (.mp4, .avi, .mov)"}
            <input
              type="file"
              accept="video/*"
              hidden
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        </div>

        <h2 className={styles.sectionTitle}>Videos del proyecto</h2>

        <div className={styles.videoList}>
          {videos.length === 0 && (
            <p className={styles.empty}>No hay videos aun. Sube uno para empezar.</p>
          )}
          {videos.map((v) => (
            <div key={v.id} className={styles.videoCard}>
              <div className={styles.videoInfo}>
                <span className={styles.videoName}>{v.original_name}</span>
                <span className={`${styles.badge} ${styles[v.status]}`}>
                  {v.status}
                </span>
              </div>
              {v.total_frames && (
                <p className={styles.meta}>
                  {v.total_frames} frames &bull; {v.fps?.toFixed(1)} fps &bull;{" "}
                  {v.width}x{v.height}
                </p>
              )}
              {v.status === "ready" && (
                <button
                  className={styles.btnPrimary}
                  onClick={() => navigate(`/projects/${projectId}/videos/${v.id}`)}
                >
                  Ver →
                </button>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
