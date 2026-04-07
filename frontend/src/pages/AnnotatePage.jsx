/**
 * Pagina principal de anotacion.
 * Layout: canvas + panel derecho (arriba) + filmstrip horizontal (abajo).
 */
import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getFrames,
  getFrameAnnotations,
  getProjectLabels,
  propagateMask,
  getJobStatus,
  deleteAnnotation,
  deleteFrame,
  segmentOptions,
  saveMask,
} from "../api/client";
import AnnotationCanvas from "../components/AnnotationCanvas";
import useStore from "../store/useStore";
import { labelToColor } from "../utils/colors";
import styles from "./AnnotatePage.module.css";

const API_URL = import.meta.env.VITE_API_URL || "";

// Colores fijos para las 3 propuestas multi-mask
const PROPOSAL_COLORS = [
  { r: 20,  g: 184, b: 166 }, // teal
  { r: 249, g: 115, b: 22  }, // naranja
  { r: 236, g: 72,  b: 153 }, // rosa
];

function rleToCanvas(rleStr, fw, fh, col, alpha = 170) {
  const rle    = JSON.parse(rleStr);
  const canvas = document.createElement("canvas");
  canvas.width  = fw;
  canvas.height = fh;
  const ctx    = canvas.getContext("2d");
  const imgD   = ctx.createImageData(fw, fh);
  let val = rle.start, idx = 0;
  for (const c of rle.rle) {
    for (let i = 0; i < c; i++) {
      if (val === 1 && idx < fw * fh) {
        imgD.data[idx*4]=col.r; imgD.data[idx*4+1]=col.g;
        imgD.data[idx*4+2]=col.b; imgD.data[idx*4+3]=alpha;
      }
      idx++;
    }
    val = 1 - val;
  }
  ctx.putImageData(imgD, 0, 0);
  return canvas;
}

export default function AnnotatePage() {
  const { projectId, videoId, frameId: frameIdParam } = useParams();
  const navigate = useNavigate();

  const [frames, setFrames]                           = useState([]);
  const [selectedFrameIdx, setSelectedFrameIdx]       = useState(Number(frameIdParam) || 0);
  const [propagating, setPropagating]                 = useState(false);
  const [propagationProgress, setPropagationProgress] = useState(0);
  const [propagatingLabel, setPropagatingLabel]       = useState("");
  const [loadingAnns, setLoadingAnns]                 = useState(false);

  // Modos
  const [selectMode, setSelectMode]     = useState(false);
  const [multiMaskMode, setMultiMaskMode] = useState(false);

  // Multi-mask proposals
  const [proposals, setProposals]       = useState([]);  // raw MaskProposal[]
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [pendingClick, setPendingClick] = useState(null); // {absX, absY} para mostrar propuestas

  const {
    annotations, activeLabel, setActiveLabel,
    setAnnotations, addAnnotation, removeAnnotation,
    labelHistory, selectedAnnotationId, setSelectedAnnotationId,
    projectLabels, setProjectLabels,
  } = useStore();

  // Refs para scroll a la anotacion seleccionada
  const annRefs = useRef({});
  const filmRef  = useRef(null);
  const filmThumbRefs = useRef({});

  useEffect(() => {
    getFrames(projectId, videoId).then(setFrames);
    // Cargar etiquetas del proyecto para pre-llenar el historial de labels
    getProjectLabels(projectId).then((lbls) => {
      const names = lbls.map((l) => l.label_name);
      setProjectLabels(names);
      // Seed labelHistory con las etiquetas del proyecto si aun no están
      useStore.setState((s) => ({
        labelHistory: Array.from(new Set([...names, ...s.labelHistory])),
      }));
    }).catch(() => {}); // silencioso si no hay etiquetas
  }, [projectId, videoId]);

  const currentFrame   = frames[selectedFrameIdx];
  const currentFrameId = currentFrame?.id;

  useEffect(() => {
    if (!currentFrameId) return;
    setLoadingAnns(true);
    setProposals([]);
    setSelectedAnnotationId(null);
    getFrameAnnotations(currentFrameId)
      .then(setAnnotations)
      .finally(() => setLoadingAnns(false));
  }, [currentFrameId]);

  // Scroll al filmstrip thumb seleccionado
  useEffect(() => {
    const el = filmThumbRefs.current[selectedFrameIdx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedFrameIdx]);

  // Scroll al annotation row seleccionado en el panel
  useEffect(() => {
    if (selectedAnnotationId == null) return;
    const el = annRefs.current[selectedAnnotationId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedAnnotationId]);

  const unpropagated = annotations.filter((a) => !a.is_propagated);

  // ----- Propuestas multi-mask -----
  // Las propuestas se decodifican en canvases con los colores de PROPOSAL_COLORS
  const proposalCanvases = useMemo(() => {
    if (!proposals.length) return [];
    // Necesitamos las dimensiones del frame — usamos el primer canvas de allMaskCanvases
    // o simplemente renderizamos bajo demanda pasando el imageElement
    return proposals.map((p, i) => {
      try {
        return { canvas: rleToCanvas(p.mask_rle, p._fw, p._fh, PROPOSAL_COLORS[i] || PROPOSAL_COLORS[0]), score: p.score };
      } catch { return null; }
    }).filter(Boolean);
  }, [proposals]);

  // Cuando el usuario clica en modo multi-mask, se llama esto desde el canvas
  // Pero en realidad, para multi-mask usamos un botón "3 opciones" explícito
  const handleMultiMaskRequest = async (absX, absY) => {
    if (!activeLabel || !currentFrame) return;
    setLoadingProposals(true);
    setPendingClick({ absX, absY });
    try {
      const raw = await segmentOptions({ frame_id: currentFrameId, label: activeLabel, point_x: absX, point_y: absY, point_label: 1 });
      // Para renderizar las propuestas necesitamos las dimensiones del frame
      // Las obtenemos de la imagen (se carga a través del src del frame)
      const img = new window.Image();
      img.onload = () => {
        const fw = img.naturalWidth;
        const fh = img.naturalHeight;
        setProposals(raw.map((p) => ({ ...p, _fw: fw, _fh: fh })));
        setLoadingProposals(false);
      };
      img.onerror = () => setLoadingProposals(false);
      img.src = `${API_URL}/storage/frames/${videoId}/${currentFrame.file_path.split("/").pop()}`;
    } catch (err) {
      console.error("Error obteniendo propuestas:", err);
      setLoadingProposals(false);
    }
  };

  const handleAcceptProposal = async (idx) => {
    const p = proposals[idx];
    if (!p) return;
    try {
      const ann = await saveMask({ frame_id: currentFrameId, label: activeLabel, mask_rle: p.mask_rle, bbox_x: p.bbox_x, bbox_y: p.bbox_y, bbox_w: p.bbox_w, bbox_h: p.bbox_h });
      addAnnotation(ann);
    } catch (err) { console.error("Error guardando mascara:", err); }
    setProposals([]);
    setPendingClick(null);
  };

  // ----- Eliminar -----
  const handleDelete = async (ann) => {
    if (!confirm(`¿Eliminar anotación "${ann.label}"?`)) return;
    await deleteAnnotation(ann.id);
    removeAnnotation(ann.id);
    if (selectedAnnotationId === ann.id) setSelectedAnnotationId(null);
  };

  const handleDeleteFrame = async (frame, idx) => {
    if (!confirm(`¿Eliminar frame ${frame.frame_index}? Se perderán todas sus anotaciones.`)) return;
    await deleteFrame(projectId, videoId, frame.id);
    const newFrames = frames.filter((_, i) => i !== idx);
    setFrames(newFrames);
    setSelectedFrameIdx((prev) => Math.min(prev, newFrames.length - 1));
  };

  // ----- Propagacion -----
  const runPropagation = async (ann, frameIndex, totalJobs = 1, jobIndex = 0) => {
    const job = await propagateMask({ annotation_id: ann.id, start_frame_index: frameIndex });
    return new Promise((resolve, reject) => {
      const poll = setInterval(async () => {
        const updated = await getJobStatus(job.id);
        setPropagationProgress(Math.round((jobIndex / totalJobs) * 100 + (1 / totalJobs) * updated.progress));
        if (updated.status === "success" || updated.status === "error") {
          clearInterval(poll);
          updated.status === "success" ? resolve() : reject(new Error(updated.error_message));
        }
      }, 2000);
    });
  };

  const handlePropagateLast = async () => {
    if (!unpropagated.length) return;
    const ann = unpropagated[unpropagated.length - 1];
    setPropagatingLabel(ann.label); setPropagating(true); setPropagationProgress(0);
    try { await runPropagation(ann, currentFrame.frame_index); navigate(`/projects/${projectId}/videos/${videoId}/propagation`); }
    catch (err) { alert("Error: " + err.message); }
    finally { setPropagating(false); }
  };

  const handlePropagateOne = async (ann) => {
    setPropagatingLabel(ann.label); setPropagating(true); setPropagationProgress(0);
    try { await runPropagation(ann, currentFrame.frame_index); navigate(`/projects/${projectId}/videos/${videoId}/propagation`); }
    catch (err) { alert("Error: " + err.message); }
    finally { setPropagating(false); }
  };

  const handlePropagateAll = async () => {
    if (!unpropagated.length) return;
    setPropagating(true); setPropagationProgress(0);
    const total = unpropagated.length;
    try {
      for (let i = 0; i < total; i++) {
        const ann = unpropagated[i];
        setPropagatingLabel(`${ann.label} (${i + 1}/${total})`);
        await runPropagation(ann, currentFrame.frame_index, total, i);
      }
      navigate(`/projects/${projectId}/videos/${videoId}/propagation`);
    } catch (err) { alert("Error: " + err.message); }
    finally { setPropagating(false); }
  };

  if (!frames.length) return <div className={styles.loading}>Cargando frames…</div>;

  const frameSrc = currentFrame
    ? `${API_URL}/storage/frames/${videoId}/${currentFrame.file_path.split("/").pop()}`
    : "";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate(`/projects/${projectId}/videos/${videoId}`)}>← Video</button>
        <h1>Anotación — Video {videoId}</h1>
        <span className={styles.frameCounter}>Frame {selectedFrameIdx + 1} / {frames.length}</span>
      </header>

      <div className={styles.topRow}>
        {/* Canvas central */}
        <main className={styles.canvasArea}>
          {currentFrame && (
            <AnnotationCanvas
              key={currentFrame.id}
              frameId={currentFrame.id}
              frameSrc={frameSrc}
              selectMode={selectMode}
              selectedAnnotationId={selectedAnnotationId}
              onAnnotationSelect={(id) => {
                setSelectedAnnotationId(id);
                setSelectMode(false); // volver a modo anotar tras seleccionar
              }}
              proposalCanvases={proposalCanvases}
            />
          )}

          {/* Panel de propuestas multi-mask */}
          {(proposals.length > 0 || loadingProposals) && (
            <div className={styles.proposalPanel}>
              {loadingProposals
                ? <span className={styles.loadingProposals}>Generando opciones…</span>
                : (
                  <>
                    <p className={styles.proposalTitle}>Elige la mejor máscara:</p>
                    <div className={styles.proposalRow}>
                      {proposals.map((p, i) => (
                        <button
                          key={i}
                          className={styles.proposalBtn}
                          style={{ borderColor: `rgb(${PROPOSAL_COLORS[i]?.r},${PROPOSAL_COLORS[i]?.g},${PROPOSAL_COLORS[i]?.b})` }}
                          onClick={() => handleAcceptProposal(i)}
                        >
                          <span className={styles.proposalNum} style={{ background: `rgb(${PROPOSAL_COLORS[i]?.r},${PROPOSAL_COLORS[i]?.g},${PROPOSAL_COLORS[i]?.b})` }}>{i + 1}</span>
                          Score {(p.score * 100).toFixed(0)}%
                        </button>
                      ))}
                      <button className={styles.proposalCancel} onClick={() => { setProposals([]); setPendingClick(null); }}>✕</button>
                    </div>
                  </>
                )
              }
            </div>
          )}
        </main>

        {/* Panel derecho: controles */}
        <aside className={styles.controls}>

          {/* Etiqueta activa */}
          <section className={styles.section}>
            <label className={styles.sectionLabel}>Etiqueta activa</label>
            <input
              className={styles.input}
              value={activeLabel}
              onChange={(e) => setActiveLabel(e.target.value)}
              placeholder="Nombre del objeto…"
            />
            {labelHistory.length > 0 && (
              <div className={styles.labelChips}>
                {labelHistory.map((lbl) => (
                  <button
                    key={lbl}
                    className={`${styles.labelChip} ${activeLabel === lbl ? styles.labelChipActive : ""}`}
                    onClick={() => setActiveLabel(lbl)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Modos de interaccion */}
          <section className={styles.section}>
            <label className={styles.sectionLabel}>Modo</label>
            <div className={styles.modeRow}>
              <button
                className={`${styles.modeBtn} ${!selectMode && !multiMaskMode ? styles.modeBtnActive : ""}`}
                onClick={() => { setSelectMode(false); setMultiMaskMode(false); setProposals([]); }}
              >✏️ Anotar</button>
              <button
                className={`${styles.modeBtn} ${selectMode ? styles.modeBtnActive : ""}`}
                onClick={() => { setSelectMode(true); setMultiMaskMode(false); setProposals([]); }}
              >🔍 Seleccionar</button>
              <button
                className={`${styles.modeBtn} ${multiMaskMode ? styles.modeBtnActive : ""}`}
                onClick={() => { setMultiMaskMode(!multiMaskMode); setSelectMode(false); setProposals([]); }}
                title="SAM2 mostrará 3 opciones de máscara para elegir"
              >🎯 3 opciones</button>
            </div>
            {multiMaskMode && activeLabel && (
              <button
                className={styles.btnGetOptions}
                disabled={loadingProposals}
                onClick={() => {
                  // El usuario debe indicar el punto — se pide coordenadas del frame activo
                  // Simplificación: mostramos un mensaje para que haga clic en el canvas
                  alert("Haz clic en el canvas para generar las 3 opciones de máscara.");
                }}
              >
                {loadingProposals ? "Generando…" : "Haz clic en el canvas →"}
              </button>
            )}
          </section>

          {/* Lista de anotaciones */}
          <section className={styles.section}>
            <label className={styles.sectionLabel}>
              Anotaciones ({annotations.length})
              {loadingAnns && <span className={styles.spinner}> ⏳</span>}
            </label>
            <div className={styles.annList}>
              {annotations.map((a) => {
                const col     = labelToColor(a.label);
                const isSelected = selectedAnnotationId === a.id;
                return (
                  <div
                    key={a.id}
                    ref={(el) => { annRefs.current[a.id] = el; }}
                    className={`${styles.annItem} ${isSelected ? styles.annItemSelected : ""}`}
                    onClick={() => setSelectedAnnotationId(isSelected ? null : a.id)}
                  >
                    <span className={styles.labelDot} style={{ background: col.css }} />
                    <span className={styles.annName}>{a.label}</span>
                    {a.is_approved && <span className={styles.badgeOk}>✓</span>}
                    {a.is_propagated && !a.is_approved && <span className={styles.badgeProp}>prop</span>}
                    <div className={styles.annActions}>
                      {!a.is_propagated && (
                        <button className={styles.btnPropOne} title="Propagar" onClick={(e) => { e.stopPropagation(); handlePropagateOne(a); }} disabled={propagating}>▶</button>
                      )}
                      <button className={styles.btnDel} title="Eliminar" onClick={(e) => { e.stopPropagation(); handleDelete(a); }} disabled={propagating}>✕</button>
                    </div>
                  </div>
                );
              })}
              {annotations.length === 0 && !loadingAnns && (
                <p className={styles.hint}>Haz clic sobre un objeto para segmentarlo.</p>
              )}
            </div>
          </section>

          {/* Propagar */}
          <section className={styles.section}>
            {propagating ? (
              <div className={styles.progressWrap}>
                <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${propagationProgress}%` }} /></div>
                <span>{propagationProgress}% — {propagatingLabel}…</span>
              </div>
            ) : (
              <div className={styles.propagateButtons}>
                {unpropagated.length === 1 && (
                  <button className={styles.btnPropagate} onClick={handlePropagateLast}>
                    Propagar "{unpropagated[0]?.label}"
                  </button>
                )}
                {unpropagated.length > 1 && (
                  <button className={styles.btnPropagateAll} onClick={handlePropagateAll}>
                    Propagar nuevas ({unpropagated.length})
                  </button>
                )}
                {unpropagated.length === 0 && annotations.length > 0 && (
                  <button className={styles.btnPropagate} onClick={() => navigate(`/projects/${projectId}/videos/${videoId}/propagation`)}>
                    Ver propagación →
                  </button>
                )}
                {unpropagated.length === 0 && annotations.length === 0 && (
                  <p className={styles.hint}>Segmenta un objeto para propagarlo.</p>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* Filmstrip horizontal inferior */}
      <div className={styles.filmstrip} ref={filmRef}>
        {frames.map((frame, idx) => (
          <div
            key={frame.id}
            ref={(el) => { filmThumbRefs.current[idx] = el; }}
            className={`${styles.filmThumb} ${idx === selectedFrameIdx ? styles.filmThumbSelected : ""}`}
            onClick={() => setSelectedFrameIdx(idx)}
          >
            <img
              src={`${API_URL}/storage/frames/${videoId}/${frame.file_path.split("/").pop()}`}
              alt=""
              loading="lazy"
            />
            <span className={styles.filmIdx}>{frame.frame_index}</span>
            <button
              className={styles.btnDelFrame}
              title="Eliminar frame"
              onClick={(e) => { e.stopPropagation(); handleDeleteFrame(frame, idx); }}
            >✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
