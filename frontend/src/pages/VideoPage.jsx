/**
 * VideoPage — Hub de un video dentro de un proyecto.
 * Muestra: stats de anotacion, etiquetas del proyecto, acciones (Anotar, Revisar, Exportar GCS).
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getProject,
  getVideoStats,
  getProjectLabels,
  addProjectLabel,
  deleteProjectLabel,
  exportToGCS,
  exportDataset,
  getJobStatus,
  getConfig,
} from "../api/client";
import useStore from "../store/useStore";
import { labelToColor } from "../utils/colors";
import styles from "./VideoPage.module.css";

export default function VideoPage() {
  const { projectId, videoId } = useParams();
  const navigate = useNavigate();

  const { setProjectLabels } = useStore();

  const [project, setProject]           = useState(null);
  const [stats, setStats]               = useState(null);
  const [labels, setLabels]             = useState([]);
  const [newLabel, setNewLabel]         = useState("");
  const [addingLabel, setAddingLabel]   = useState(false);

  // Config de la fábrica (cargado al montar)
  const [factoryBucket, setFactoryBucket]           = useState("");
  const [factoryUrl, setFactoryUrl]                 = useState("http://34.42.231.172");
  const [factoryDatasetsPrefix, setFactoryDatasetsPrefix] = useState("datasets/");

  // GCS Export state
  const [showGCSPanel, setShowGCSPanel] = useState(false);
  const [gcsBucket, setGcsBucket]       = useState("");
  const [gcsPrefix, setGcsPrefix]       = useState("");
  const [gcsFormat, setGcsFormat]       = useState("yolo_seg");
  const [gcsApprOnly, setGcsApprOnly]   = useState(true);
  const [exporting, setExporting]       = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportResult, setExportResult] = useState(null);
  const [exportError, setExportError]   = useState("");

  // Polling ref para el job de exportacion
  const pollRef = useRef(null);
  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };
  // Cleanup al desmontar
  useEffect(() => () => stopPolling(), []);

  const load = async () => {
    const [p, s, lbls] = await Promise.all([
      getProject(projectId),
      getVideoStats(projectId, videoId),
      getProjectLabels(projectId),
    ]);
    setProject(p);
    setStats(s);
    setLabels(lbls);
    setProjectLabels(lbls.map((l) => l.label_name));
  };

  useEffect(() => {
    load();
    getConfig().then((cfg) => {
      if (cfg.factory_bucket)      setFactoryBucket(cfg.factory_bucket);
      if (cfg.factory_url)         setFactoryUrl(cfg.factory_url);
      if (cfg.datasets_prefix)     setFactoryDatasetsPrefix(cfg.datasets_prefix);
    }).catch(() => {});
  }, [projectId, videoId]);

  const handleAddLabel = async (e) => {
    e.preventDefault();
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setAddingLabel(true);
    try {
      await addProjectLabel(projectId, trimmed);
      setNewLabel("");
      const lbls = await getProjectLabels(projectId);
      setLabels(lbls);
      setProjectLabels(lbls.map((l) => l.label_name));
    } finally {
      setAddingLabel(false);
    }
  };

  const handleDeleteLabel = async (labelName) => {
    await deleteProjectLabel(projectId, labelName);
    const lbls = await getProjectLabels(projectId);
    setLabels(lbls);
    setProjectLabels(lbls.map((l) => l.label_name));
  };

  const handleExportGCS = async (e) => {
    e.preventDefault();
    if (!gcsBucket.trim()) {
      setExportError("El nombre del bucket es obligatorio");
      return;
    }
    setExporting(true);
    setExportProgress(0);
    setExportResult(null);
    setExportError("");
    stopPolling();

    try {
      // El endpoint devuelve { job_id } inmediatamente
      const { job_id } = await exportToGCS(projectId, {
        bucket_name: gcsBucket.trim(),
        gcs_prefix: gcsPrefix.trim() || `mentat/project_${projectId}/video_${videoId}`,
        format: gcsFormat,
        train_split: 0.8,
        approved_only: gcsApprOnly,
        video_id: Number(videoId),
      });

      // Polling hasta que el job termine
      pollRef.current = setInterval(async () => {
        try {
          const job = await getJobStatus(job_id);
          setExportProgress(job.progress ?? 0);

          if (job.status === "success") {
            stopPolling();
            setExporting(false);
            try { setExportResult(JSON.parse(job.result)); }
            catch { setExportResult({ files_uploaded: "?" }); }
          } else if (job.status === "error") {
            stopPolling();
            setExporting(false);
            setExportError(job.error_message || "Error desconocido en el job de exportación");
          }
        } catch {
          stopPolling();
          setExporting(false);
          setExportError("Error al consultar estado del job");
        }
      }, 2000);

    } catch (err) {
      setExporting(false);
      setExportError(err?.response?.data?.detail || "Error al lanzar exportación a GCS");
    }
  };

  const handleExportToFactory = async () => {
    if (!factoryBucket) {
      setExportError("No hay bucket de fábrica configurado. Define ALPHA_PLUS_BUCKET en el backend.");
      return;
    }
    setExporting(true);
    setExportProgress(0);
    setExportResult(null);
    setExportError("");
    stopPolling();

    const prefix = `${factoryDatasetsPrefix}mentat/project_${projectId}/video_${videoId}`;
    try {
      const { job_id } = await exportToGCS(projectId, {
        bucket_name: factoryBucket,
        gcs_prefix: prefix,
        format: gcsFormat,
        train_split: 0.8,
        approved_only: gcsApprOnly,
        video_id: Number(videoId),
      });

      pollRef.current = setInterval(async () => {
        try {
          const job = await getJobStatus(job_id);
          setExportProgress(job.progress ?? 0);
          if (job.status === "success") {
            stopPolling();
            setExporting(false);
            try { setExportResult(JSON.parse(job.result)); }
            catch { setExportResult({ files_uploaded: "?" }); }
          } else if (job.status === "error") {
            stopPolling();
            setExporting(false);
            setExportError(job.error_message || "Error desconocido");
          }
        } catch {
          stopPolling();
          setExporting(false);
          setExportError("Error al consultar estado del job");
        }
      }, 2000);
    } catch (err) {
      setExporting(false);
      setExportError(err?.response?.data?.detail || "Error al lanzar exportación a la fábrica");
    }
  };

  const handleDownloadZip = async () => {
    try {
      setExporting(true);
      const blob = await exportDataset(projectId, {
        format: gcsFormat,
        train_split: 0.8,
        approved_only: gcsApprOnly,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dataset_${gcsFormat}_project${projectId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError("Error al generar ZIP");
    } finally {
      setExporting(false);
    }
  };

  if (!project || !stats) return <div className={styles.loading}>Cargando...</div>;

  const pct = stats.coverage_pct ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate(`/projects/${projectId}`)}>
          &larr; {project.name}
        </button>
        <div>
          <h1 className={styles.title}>Video #{videoId}</h1>
        </div>
      </header>

      <main className={styles.main}>
        {/* ── Stats ── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>📊 Progreso de anotación</h2>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <p className={styles.pctLabel}>{pct}% frames anotados</p>
          <div className={styles.statsGrid}>
            <Stat label="Frames totales"    value={stats.total_frames} />
            <Stat label="Frames anotados"   value={stats.annotated_frames} />
            <Stat label="Anotaciones total" value={stats.total_annotations} />
            <Stat label="Aprobadas"         value={stats.approved_annotations} color="#4ade80" />
            <Stat label="Propagadas"        value={stats.propagated_annotations} color="#60a5fa" />
          </div>
        </section>

        {/* ── Actions ── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>⚡ Acciones</h2>
          <div className={styles.actionRow}>
            <button
              className={styles.btnPrimary}
              onClick={() => navigate(`/projects/${projectId}/videos/${videoId}/annotate/0`)}
            >
              ✏️ Anotar
            </button>
            <button
              className={styles.btnSecondary}
              onClick={() => navigate(`/projects/${projectId}/videos/${videoId}/propagation`)}
            >
              🔍 Revisar propagación
            </button>
            <button
              className={`${styles.btnSecondary} ${showGCSPanel ? styles.active : ""}`}
              onClick={() => { setShowGCSPanel((v) => !v); setExportResult(null); setExportError(""); stopPolling(); setExporting(false); }}
            >
              ☁️ Exportar dataset
            </button>
          </div>

          {showGCSPanel && (
            <div className={styles.gcsPanel}>
              <h3 className={styles.subTitle}>Exportar dataset</h3>

              {/* ── Sección rápida: fábrica de modelos ── */}
              <div className={styles.factorySection}>
                <div className={styles.factorySectionHeader}>
                  <span className={styles.factorySectionTitle}>Fábrica de modelos</span>
                  {factoryBucket
                    ? <span className={styles.factoryBucketBadge}>gs://{factoryBucket}</span>
                    : <span className={styles.factoryBucketMissing}>ALPHA_PLUS_BUCKET no configurado</span>
                  }
                </div>
                <div className={styles.factoryControls}>
                  <label className={styles.gcsLabel} style={{ marginBottom: 0 }}>
                    Formato
                    <select value={gcsFormat} onChange={(e) => setGcsFormat(e.target.value)} className={styles.gcsSelect}>
                      <option value="yolo_seg">YOLO Segmentation (recomendado)</option>
                      <option value="yolo_det">YOLO Detection (bbox)</option>
                      <option value="coco">COCO JSON</option>
                    </select>
                  </label>
                  <label className={styles.gcsLabel} style={{ marginBottom: 0 }}>
                    <input
                      type="checkbox"
                      checked={gcsApprOnly}
                      onChange={(e) => setGcsApprOnly(e.target.checked)}
                    />
                    {" "}Solo aprobadas
                  </label>
                  <button
                    type="button"
                    className={styles.btnFactory}
                    onClick={handleExportToFactory}
                    disabled={exporting || !factoryBucket}
                  >
                    {exporting ? `Exportando… ${exportProgress}%` : "Exportar a fábrica"}
                  </button>
                </div>
              </div>

              <details className={styles.manualDetails}>
                <summary className={styles.manualSummary}>Exportar a otro bucket GCS</summary>
              <form onSubmit={handleExportGCS} className={styles.gcsForm}>
                <label className={styles.gcsLabel}>
                  Formato
                  <select value={gcsFormat} onChange={(e) => setGcsFormat(e.target.value)} className={styles.gcsSelect}>
                    <option value="yolo_seg">YOLO Segmentation (recomendado)</option>
                    <option value="yolo_det">YOLO Detection (bbox)</option>
                    <option value="coco">COCO JSON</option>
                  </select>
                </label>
                <label className={styles.gcsLabel}>
                  <input
                    type="checkbox"
                    checked={gcsApprOnly}
                    onChange={(e) => setGcsApprOnly(e.target.checked)}
                  />
                  {" "}Solo anotaciones aprobadas
                </label>
                <label className={styles.gcsLabel}>
                  Bucket GCS *
                  <input
                    className={styles.gcsInput}
                    placeholder="mi-bucket-gcp"
                    value={gcsBucket}
                    onChange={(e) => setGcsBucket(e.target.value)}
                    required
                  />
                </label>
                <label className={styles.gcsLabel}>
                  Prefijo GCS (ruta)
                  <input
                    className={styles.gcsInput}
                    placeholder={`mentat/project_${projectId}/video_${videoId}`}
                    value={gcsPrefix}
                    onChange={(e) => setGcsPrefix(e.target.value)}
                  />
                </label>
                <div className={styles.gcsButtons}>
                  <button type="submit" className={styles.btnPrimary} disabled={exporting}>
                    {exporting ? `Subiendo… ${exportProgress}%` : "☁️ Subir a GCS"}
                  </button>
                  <button type="button" className={styles.btnOutline} onClick={handleDownloadZip} disabled={exporting}>
                    {exporting ? "Generando…" : "💾 Descargar ZIP"}
                  </button>
                </div>
              </form>
              </details>

              {/* ── Estado compartido: progreso, error, resultado ── */}
              {exporting && (
                <div className={styles.jobProgress}>
                  <div className={styles.jobProgressBar}>
                    <div className={styles.jobProgressFill} style={{ width: `${exportProgress}%` }} />
                  </div>
                  <span className={styles.jobProgressLabel}>Exportando… {exportProgress}%</span>
                </div>
              )}
              {exportError && <p className={styles.errorMsg}>{exportError}</p>}
              {exportResult && (
                <div className={styles.successBox}>
                  <p>✅ {exportResult.files_uploaded} ficheros subidos a <strong>gs://{exportResult.bucket}/{exportResult.gcs_prefix}</strong></p>
                  {exportResult.uris_sample?.length > 0 && (
                    <ul className={styles.uriList}>
                      {exportResult.uris_sample.map((u, i) => <li key={i}>{u}</li>)}
                      {exportResult.files_uploaded > exportResult.uris_sample.length && (
                        <li>… y {exportResult.files_uploaded - exportResult.uris_sample.length} más</li>
                      )}
                    </ul>
                  )}
                  {exportResult.factory_dataset_id ? (
                    <a
                      className={styles.btnFactory}
                      href={`${factoryUrl}/datasets`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver en fábrica de modelos →
                    </a>
                  ) : (
                    <p className={styles.factoryNote}>
                      Dataset en GCS. Regístralo manualmente en la fábrica si es necesario.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Project Labels ── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>🏷️ Etiquetas del proyecto</h2>
          <p className={styles.hint}>
            Estas etiquetas se comparten entre todos los videos del proyecto.
            Se añaden automáticamente al aprobar anotaciones.
          </p>

          <div className={styles.labelGrid}>
            {labels.length === 0 && (
              <span className={styles.emptyLabels}>No hay etiquetas aún. Aprueba algunas anotaciones o añade manualmente.</span>
            )}
            {labels.map((lbl) => {
              const col = labelToColor(lbl.label_name);
              return (
                <div key={lbl.id} className={styles.labelChip}
                     style={{ borderColor: col.css, backgroundColor: `rgba(${col.r},${col.g},${col.b},0.15)` }}>
                  <span className={styles.labelDot} style={{ background: col.css }} />
                  <span className={styles.labelName}>{lbl.label_name}</span>
                  <button
                    className={styles.labelDel}
                    title="Eliminar etiqueta del proyecto"
                    onClick={() => handleDeleteLabel(lbl.label_name)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleAddLabel} className={styles.addLabelForm}>
            <input
              className={styles.addLabelInput}
              placeholder="Nueva etiqueta…"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <button className={styles.btnAdd} type="submit" disabled={addingLabel || !newLabel.trim()}>
              {addingLabel ? "…" : "+ Añadir"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className={styles.statItem}>
      <span className={styles.statValue} style={color ? { color } : {}}>
        {value ?? "—"}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
