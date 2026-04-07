/**
 * Canvas interactivo de anotacion usando Konva.js.
 *
 * Funciones:
 *  - Click izquierdo (modo anotar): segmenta el objeto bajo el cursor (SAM 2)
 *  - Click derecho (modo anotar): punto negativo — excluye esa zona del objeto
 *  - Click izquierdo (modo seleccionar): resalta la anotacion clicada en el panel
 *  - Rueda del raton: zoom centrado en el cursor
 *  - Arrastrar (cuando hay zoom > 1): desplazar el encuadre
 */
import { useRef, useState, useMemo } from "react";
import { Stage, Layer, Image as KonvaImage, Rect } from "react-konva";
import useImage from "use-image";
import { segmentFrame } from "../api/client";
import useStore from "../store/useStore";
import { labelToColor } from "../utils/colors";
import styles from "./AnnotationCanvas.module.css";

function rleToMaskCanvas(rle, width, height, label = "", alpha = 130) {
  const { r, g, b } = labelToColor(label);
  const canvas = document.createElement("canvas");
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(width, height);
  const total = width * height;
  let val = rle.start;
  let idx = 0;
  for (const count of rle.rle) {
    for (let i = 0; i < count; i++) {
      if (val === 1 && idx < total) {
        imgData.data[idx * 4]     = r;
        imgData.data[idx * 4 + 1] = g;
        imgData.data[idx * 4 + 2] = b;
        imgData.data[idx * 4 + 3] = alpha;
      }
      idx++;
    }
    val = 1 - val;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export default function AnnotationCanvas({
  frameId,
  frameSrc,
  selectMode = false,
  selectedAnnotationId = null,
  onAnnotationSelect,
  proposalCanvases = [],   // [{canvas, score, colorR, colorG, colorB}]
}) {
  const stageRef = useRef(null);
  const [frameImage] = useImage(frameSrc);
  const [segmenting, setSegmenting] = useState(false);
  const [clickPoint, setClickPoint] = useState(null);
  const [zoom, setZoom] = useState(1);

  const { activeLabel, annotations, addAnnotation } = useStore();

  const containerW = Math.min(900, window.innerWidth - 300);
  const baseScale  = frameImage ? containerW / frameImage.naturalWidth : 1;
  const displayW   = frameImage ? frameImage.naturalWidth  * baseScale : containerW;
  const displayH   = frameImage ? frameImage.naturalHeight * baseScale : 500;

  const allMaskCanvases = useMemo(() => {
    if (!frameImage) return [];
    return annotations
      .filter((a) => a.mask_rle)
      .map((a) => {
        try {
          const rle   = JSON.parse(a.mask_rle);
          const alpha = selectedAnnotationId === a.id ? 210 : 130;
          return {
            id:     a.id,
            canvas: rleToMaskCanvas(rle, frameImage.naturalWidth, frameImage.naturalHeight, a.label, alpha),
          };
        } catch { return null; }
      })
      .filter(Boolean);
  }, [annotations, frameImage, selectedAnnotationId]);

  const getCoords = () => {
    const stage = stageRef.current;
    const ptr   = stage.getPointerPosition();
    const s     = stage.scaleX();
    const sx    = (ptr.x - stage.x()) / s;
    const sy    = (ptr.y - stage.y()) / s;
    return {
      absX: Math.round(sx / baseScale),
      absY: Math.round(sy / baseScale),
      stageCoordX: sx,
      stageCoordY: sy,
    };
  };

  const findClickedAnnotation = (scx, scy) => {
    const mx = Math.round(scx / baseScale);
    const my = Math.round(scy / baseScale);
    for (const { id, canvas } of [...allMaskCanvases].reverse()) {
      if (mx < 0 || my < 0 || mx >= canvas.width || my >= canvas.height) continue;
      const pixel = canvas.getContext("2d").getImageData(mx, my, 1, 1).data;
      if (pixel[3] > 0) return id;
    }
    return null;
  };

  const handleClick = async (e) => {
    if (segmenting) return;
    const { absX, absY, stageCoordX, stageCoordY } = getCoords();

    if (selectMode) {
      const id = findClickedAnnotation(stageCoordX, stageCoordY);
      if (id != null && onAnnotationSelect) onAnnotationSelect(id);
      return;
    }
    if (proposalCanvases.length > 0) return;
    if (!activeLabel) return;

    setClickPoint({ x: stageCoordX, y: stageCoordY });
    setSegmenting(true);
    try {
      const ann = await segmentFrame({ frame_id: frameId, label: activeLabel, point_x: absX, point_y: absY, point_label: 1 });
      addAnnotation(ann);
    } catch (err) { console.error("Segmentacion fallida:", err); }
    finally { setSegmenting(false); setClickPoint(null); }
  };

  const handleContextMenu = async (e) => {
    e.evt.preventDefault();
    if (segmenting || !activeLabel || selectMode || proposalCanvases.length > 0) return;
    const { absX, absY } = getCoords();
    setSegmenting(true);
    try {
      const ann = await segmentFrame({ frame_id: frameId, label: activeLabel, point_x: absX, point_y: absY, point_label: 0 });
      addAnnotation(ann);
    } catch (err) { console.error("Punto negativo fallido:", err); }
    finally { setSegmenting(false); }
  };

  const handleWheel = (e) => {
    e.evt.preventDefault();
    const stage    = stageRef.current;
    const oldScale = stage.scaleX();
    const ptr      = stage.getPointerPosition();
    const scaleBy  = 1.12;
    const newScale = Math.max(0.3, Math.min(12, e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy));
    const mpt = { x: (ptr.x - stage.x()) / oldScale, y: (ptr.y - stage.y()) / oldScale };
    stage.scale({ x: newScale, y: newScale });
    stage.x(ptr.x - mpt.x * newScale);
    stage.y(ptr.y - mpt.y * newScale);
    stage.batchDraw();
    setZoom(newScale);
  };

  const resetZoom = () => {
    const stage = stageRef.current;
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();
    setZoom(1);
  };

  const cursor = segmenting ? "wait" : selectMode ? "pointer" : "crosshair";

  return (
    <div className={styles.wrapper}>
      {segmenting && <div className={styles.overlay}>Segmentando con SAM 2…</div>}

      <div className={styles.toolbar}>
        {zoom !== 1 && (
          <button className={styles.btnResetZoom} onClick={resetZoom} title="Restablecer zoom (1:1)">
            ⊙ Reset zoom
          </button>
        )}
        <span className={styles.hint}>
          {selectMode
            ? "🔍 Clic sobre una máscara para seleccionarla"
            : "✏️  Clic izq: anotar  ·  Clic der: excluir zona  ·  Rueda: zoom"}
        </span>
      </div>

      <Stage
        ref={stageRef}
        width={displayW}
        height={displayH}
        draggable={zoom > 1}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        style={{ cursor, display: "block" }}
      >
        <Layer>
          {frameImage && <KonvaImage image={frameImage} width={displayW} height={displayH} />}

          {allMaskCanvases.map(({ id, canvas }) => (
            <KonvaImage key={id} image={canvas} width={displayW} height={displayH} />
          ))}

          {/* Propuestas multi-mask superpuestas */}
          {proposalCanvases.map(({ canvas }, i) => (
            <KonvaImage key={`prop-${i}`} image={canvas} width={displayW} height={displayH} opacity={0.65} />
          ))}

          {clickPoint && (
            <Rect x={clickPoint.x - 6} y={clickPoint.y - 6} width={12} height={12} fill="#f59e0b" cornerRadius={6} />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
