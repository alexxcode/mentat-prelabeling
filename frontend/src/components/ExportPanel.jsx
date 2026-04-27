/**
 * Modal de exportacion de dataset.
 * Permite elegir formato (YOLO / COCO), split train/val y filtro de aprobacion.
 */
import { useState } from "react";
import { exportDataset } from "../api/client";
import styles from "./ExportPanel.module.css";

export default function ExportPanel({ projectId, onClose }) {
  const [format, setFormat] = useState("yolo_seg");
  const [trainSplit, setTrainSplit] = useState(0.8);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportDataset(projectId, {
        format,
        train_split: trainSplit,
        approved_only: approvedOnly,
      });

      // Descargar el ZIP
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dataset_${format}_${projectId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error al exportar: " + (err.response?.data?.detail || err.message));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>Exportar dataset</h2>

        <div className={styles.field}>
          <label>Formato</label>
          <div className={styles.radioGroup}>
            {[
              { value: "yolo_seg", label: "YOLO Segmentation (recomendado)" },
              { value: "yolo", label: "YOLO Detection (.txt)" },
              { value: "coco", label: "COCO JSON" },
            ].map(({ value, label }) => (
              <label key={value} className={styles.radio}>
                <input
                  type="radio"
                  name="format"
                  value={value}
                  checked={format === value}
                  onChange={() => setFormat(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>Split train / val</label>
          <input
            type="range"
            min={0.5}
            max={0.95}
            step={0.05}
            value={trainSplit}
            onChange={(e) => setTrainSplit(Number(e.target.value))}
          />
          <span className={styles.splitValue}>
            Train {Math.round(trainSplit * 100)}% / Val {Math.round((1 - trainSplit) * 100)}%
          </span>
        </div>

        <div className={styles.field}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={approvedOnly}
              onChange={(e) => setApprovedOnly(e.target.checked)}
            />
            Solo exportar anotaciones aprobadas
          </label>
        </div>

        <div className={styles.actions}>
          <button className={styles.btnCancel} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={styles.btnExport}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Exportando..." : "Descargar ZIP"}
          </button>
        </div>
      </div>
    </div>
  );
}
