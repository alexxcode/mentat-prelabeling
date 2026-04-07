/**
 * Grid de miniaturas de frames para la barra lateral del canvas de anotacion.
 */
import styles from "./FrameGrid.module.css";

export default function FrameGrid({ frames, selectedIndex, onSelect, apiUrl = "" }) {
  return (
    <div className={styles.grid}>
      {frames.map((frame, idx) => (
        <div
          key={frame.id}
          className={`${styles.thumb} ${idx === selectedIndex ? styles.selected : ""}`}
          onClick={() => onSelect(idx)}
        >
          <img
            src={`${apiUrl}/storage/frames/${frame.video_id}/${frame.file_path.split("/").pop()}`}
            alt={`Frame ${frame.frame_index}`}
            loading="lazy"
          />
          <span className={styles.index}>{frame.frame_index}</span>
        </div>
      ))}
    </div>
  );
}
