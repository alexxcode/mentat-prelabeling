import { create } from "zustand";

const useStore = create((set) => ({
  // Proyecto activo
  currentProject: null,
  setCurrentProject: (p) => set({ currentProject: p }),

  // Video activo
  currentVideo: null,
  setCurrentVideo: (v) => set({ currentVideo: v }),

  // Frame activo en el canvas de anotacion
  currentFrame: null,
  setCurrentFrame: (f) => set({ currentFrame: f }),

  // Anotaciones del frame activo
  annotations: [],
  setAnnotations: (annotations) =>
    set((s) => {
      const newLabels = annotations.map((a) => a.label).filter(Boolean);
      const merged = Array.from(new Set([...s.labelHistory, ...newLabels]));
      return { annotations, labelHistory: merged };
    }),
  addAnnotation: (ann) =>
    set((s) => ({
      annotations: [...s.annotations, ann],
      labelHistory: s.labelHistory.includes(ann.label)
        ? s.labelHistory
        : [...s.labelHistory, ann.label],
    })),
  removeAnnotation: (id) =>
    set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),

  // Etiqueta activa para la proxima segmentacion (vacia por defecto)
  activeLabel: "",
  setActiveLabel: (label) => set({ activeLabel: label }),

  // Historial de labels usadas en la sesion
  labelHistory: [],
  clearLabelHistory: () => set({ labelHistory: [] }),

  // Anotacion seleccionada en el canvas (highlight en panel)
  selectedAnnotationId: null,
  setSelectedAnnotationId: (id) => set({ selectedAnnotationId: id }),

  // Job de propagacion activo
  activeJob: null,
  setActiveJob: (job) => set({ activeJob: job }),

  // Etiquetas confirmadas del proyecto activo (viene de la BD via ProjectLabel)
  projectLabels: [],
  setProjectLabels: (labels) => set({ projectLabels: labels }),
}));

export default useStore;
