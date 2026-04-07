/**
 * Pagina de revision del resultado de la propagacion.
 * Muestra un "flipbook" de todos los frames con sus mascaras propagadas.
 * El operario puede aprobar, rechazar o eliminar anotaciones frame a frame,
 * o aprobar todo el video de un solo click.
 *
 * Atajos de teclado:
 *   ← / →   : navegar entre frames
 *   A        : aprobar todas las anotaciones del frame actual
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getFrames,
  getFrameAnnotations,
  updateAnnotation,
  deleteAnnotation,
  deleteFrame,
  approveBulk,
} from "../api/client";
import ExportPanel from "../components/ExportPanel";
import { labelToColor } from "../utils/colors";
import styles from "./PropagationPage.module.css";

const API_URL = import.meta.env.VITE_API_URL || "";

function rleToDataUrl(rle_str, label = "") {
  if (!rle_str) return null;
  try {
    const data = JSON.parse(rle_str);
    // data.shape = [height, width]  (convencion numpy)
    const height = data.shape[0];
    const width  = data.shape[1];
    const canvas = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(width, height);
    const col = labelToColor(label, 160);
    let val = data.start;
    let idx = 0;
    for (const count of data.rle) {
      for (let i = 0; i < count; i++) {
        if (val === 1 && idx < width * height) {
          imgData.data[idx * 4]     = col.r;
          imgData.data[idx * 4 + 1] = col.g;
          imgData.data[idx * 4 + 2] = col.b;
          imgData.data[idx * 4 + 3] = col.alpha;
        }
        idx++;
      }
      val = 1 - val;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL();
  } catch {
    return null;
  }
}

export default function PropagationPage() {
  const { projectId, videoId } = useParams();
  const navigate = useNavigate();

  const [frames, setFrames] = useState([]);
  const [frameAnnotations, setFrameAnnotations] = useState({});
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

  useEffect(() => {
    const load = async () => {
      const fs = await getFrames(projectId, videoId);
      setFrames(fs);
      const annMap = {};
      await Promise.all(
        fs.map(async (frame) => {
          const anns = await getFrameAnnotations(frame.id);
          annMap[frame.id] = anns;
        })
      );
      setFrameAnnotations(annMap);
      setLoading(false);
    };
    load();
  }, [projectId, videoId]);

  const refreshFrame = useCallback(async (frameId) => {
    const anns = await getFrameAnnotations(frameId);
    setFrameAnnotations((prev) => ({ ...prev, [frameId]: anns }));
  }, []);

  // --- Aprobar / desaprobar anotacion individual ---
  const handleToggleApprove = async (ann) => {
    await updateAnnotation(ann.id, { is_approved: !ann.is_approved });
    await refreshFrame(frames[selectedIdx].id);
  };

  // --- Aprobar todas las anotaciones del frame actual ---
  const handleApproveFrame = useCallback(async () => {
    const frame = frames[selectedIdx];
    if (!frame) return;
    const anns = frameAnnotations[frame.id] || [];
    const ids = anns.filter((a) => !a.is_approved).map((a) => a.id);
    if (!ids.length) return;
    await approveBulk(ids);
    await refreshFrame(frame.id);
  }, [frames, selectedIdx, frameAnnotations, refreshFrame]);

  // --- Aprobar TODAS las anotaciones del video ---
  const handleApproveAll = async () => {
    if (!confirm("¿Aprobar TODAS las anotaciones del video?")) return;
    setApprovingAll(true);
    const allIds = Object.values(frameAnnotations)
      .flat()
      .filter((a) => !a.is_approved)
      .map((a) => a.id);
    if (allIds.length) {
      await approveBulk(allIds);
      // Refrescar estado local sin hacer 263 peticiones
      setFrameAnnotations((prev) => {
        const next = {};
        for (const [fid, anns] of Object.entries(prev)) {
          next[fid] = anns.map((a) => ({ ...a, is_approved: true }));
        }
        return next;
      });
    }
    setApprovingAll(false);
  };

  // --- Eliminar anotacion ---
  const handleDelete = async (ann) => {
    if (!confirm(`¿Eliminar anotacion "${ann.label}"?`)) return;
    await deleteAnnotation(ann.id);
    await refreshFrame(frames[selectedIdx].id);
  };

  // --- Eliminar frame completo ---
  const handleDeleteFrame = async () => {
    const frame = frames[selectedIdx];
    if (!frame) return;
    if (!confirm(`¿Eliminar el frame ${frame.frame_index} y todas sus anotaciones?`)) return;
    await deleteFrame(projectId, videoId, frame.id);
    const newFrames = frames.filter((_, i) => i !== selectedIdx);
    setFrames(newFrames);
    // Limpiar anotaciones del frame eliminado
    setFrameAnnotations((prev) => {
      const next = { ...prev };
      delete next[frame.id];
      return next;
    });
    setSelectedIdx((i) => Math.min(i, newFrames.length - 1));
  };

  // --- Atajos de teclado ---
  useEffect(() => {
    const onKey = (e) => {
      // Ignorar si el foco esta en un input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight")
        setSelectedIdx((i) => Math.min(i + 1, frames.length - 1));
      if (e.key === "ArrowLeft")
        setSelectedIdx((i) => Math.max(i - 1, 0));
      if (e.key === "a" || e.key === "A")
        handleApproveFrame();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frames.length, handleApproveFrame]);

  const currentFrame = frames[selectedIdx];
  const currentAnnotations = currentFrame ? (frameAnnotations[currentFrame.id] || []) : [];
  const approvedCount = Object.values(frameAnnotations).flat().filter((a) => a.is_approved).length;
  const totalCount   = Object.values(frameAnnotations).flat().length;

  if (loading) return <div className={styles.loading}>Cargando propagacion...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          className={styles.back}
          onClick={() => navigate(`/projects/${projectId}/videos/${videoId}/annotate/0`)}
        >
          &larr; Anotar
        </button>
        <h1>Revision de propagacion</h1>
        <span className={styles.statsChip}>
          {approvedCount} / {totalCount} aprobadas
        </span>
        <button
          className={styles.btnApproveAll}
          onClick={handleApproveAll}
          disabled={approvingAll}
          title="Aprobar todas las anotaciones del video"
        >
          {approvingAll ? "Aprobando..." : "✓ Aprobar todo"}
        </button>
        <button className={styles.btnExport} onClick={() => setShowExport(true)}>
          Exportar dataset
        </button>
      </header>

      <div className={styles.layout}>
        {/* Filmstrip */}
        <aside className={styles.filmstrip}>
          {frames.map((frame, idx) => {
            const anns = frameAnnotations[frame.id] || [];
            const allApproved = anns.length > 0 && anns.every((a) => a.is_approved);
            const someApproved = anns.some((a) => a.is_approved);
            const hasPropagated = anns.some((a) => a.is_propagated);
            return (
              <div
                key={frame.id}
                className={`${styles.thumb} ${idx === selectedIdx ? styles.selected : ""} ${allApproved ? styles.approved : someApproved ? styles.partial : ""}`}
                onClick={() => setSelectedIdx(idx)}
              >
                <img
                  src={`${API_URL}/storage/frames/${videoId}/${frame.file_path.split("/").pop()}`}
                  alt=""
                  loading="lazy"
                />
                <span className={styles.idx}>{frame.frame_index}</span>
                {hasPropagated && !allApproved && <span className={styles.dot} />}
              </div>
            );
          })}
        </aside>

        {/* Visualizador principal */}
        <main className={styles.viewer}>
          {currentFrame && (
            <div className={styles.frameWrapper}>
              <img
                className={styles.frameImg}
                src={`${API_URL}/storage/frames/${videoId}/${currentFrame.file_path.split("/").pop()}`}
                alt=""
              />
              {currentAnnotations.map((ann) => {
                if (!ann.mask_rle) return null;
                const maskUrl = rleToDataUrl(ann.mask_rle, ann.label);
                return maskUrl ? (
                  <img
                    key={ann.id}
                    className={styles.maskOverlay}
                    src={maskUrl}
                    alt="mask"
                  />
                ) : null;
              })}
            </div>
          )}

          {/* Panel de anotaciones */}
          <div className={styles.annPanel}>
            <div className={styles.annPanelHeader}>
              <h3>Frame {currentFrame?.frame_index}</h3>
              {currentAnnotations.length > 0 && (
                <button
                  className={styles.btnApproveFrame}
                  onClick={handleApproveFrame}
                  title="Aprobar todas las anotaciones de este frame (atajo: A)"
                >
                  Aprobar frame
                </button>
              )}
              <button
                className={styles.btnDeleteFrame}
                onClick={handleDeleteFrame}
                title="Eliminar este frame completo"
              >
                🗑 Frame
              </button>
            </div>

            {currentAnnotations.length === 0 && (
              <p className={styles.empty}>Sin anotaciones</p>
            )}

            {currentAnnotations.map((ann) => {
              const col = labelToColor(ann.label);
              return (
                <div key={ann.id} className={styles.annRow}>
                  <span
                    className={styles.labelDot}
                    style={{ background: col.css }}
                  />
                  <span className={styles.annLabel}>{ann.label}</span>
                  {ann.is_propagated && (
                    <span className={styles.tagProp}>propagado</span>
                  )}
                  <button
                    className={ann.is_approved ? styles.btnApproved : styles.btnApprove}
                    onClick={() => handleToggleApprove(ann)}
                  >
                    {ann.is_approved ? "Aprobado" : "Aprobar"}
                  </button>
                  <button
                    className={styles.btnDeleteAnn}
                    onClick={() => handleDelete(ann)}
                    title="Eliminar anotacion"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Navegacion */}
          <div className={styles.nav}>
            <button
              className={styles.navBtn}
              disabled={selectedIdx === 0}
              onClick={() => setSelectedIdx((i) => i - 1)}
            >
              &larr; Anterior
            </button>
            <span>{selectedIdx + 1} / {frames.length}</span>
            <button
              className={styles.navBtn}
              disabled={selectedIdx === frames.length - 1}
              onClick={() => setSelectedIdx((i) => i + 1)}
            >
              Siguiente &rarr;
            </button>
          </div>
          <p className={styles.keyHint}>← → navegar · A aprobar frame</p>
        </main>
      </div>

      {showExport && (
        <ExportPanel projectId={projectId} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}
