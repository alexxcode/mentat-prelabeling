import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 300000, // 5 min para uploads y propagaciones largas
});

// ---- Proyectos ----
export const getProjects = () => api.get("/projects").then((r) => r.data);
export const createProject = (data) => api.post("/projects", data).then((r) => r.data);
export const getProject = (id) => api.get(`/projects/${id}`).then((r) => r.data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);

// ---- Videos ----
export const uploadVideo = (projectId, file, onProgress) => {
  const form = new FormData();
  form.append("file", file);
  return api
    .post(`/projects/${projectId}/videos`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    })
    .then((r) => r.data);
};
export const getVideos = (projectId) =>
  api.get(`/projects/${projectId}/videos`).then((r) => r.data);

// ---- Frames ----
export const getFrames = (projectId, videoId) =>
  api.get(`/projects/${projectId}/videos/${videoId}/frames`).then((r) => r.data);

export const deleteFrame = (projectId, videoId, frameId) =>
  api.delete(`/projects/${projectId}/videos/${videoId}/frames/${frameId}`);

// ---- Anotaciones ----
export const segmentFrame = (data) =>
  api.post("/annotations/segment", data).then((r) => r.data);

// Devuelve 3 mascaras candidatas sin guardarlas (multimask SAM2)
export const segmentOptions = (data) =>
  api.post("/annotations/segment-options", data).then((r) => r.data);

// Guarda la mascara elegida por el operario
export const saveMask = (data) =>
  api.post("/annotations/save-mask", data).then((r) => r.data);

export const propagateMask = (data) =>
  api.post("/annotations/propagate", data).then((r) => r.data);
export const updateAnnotation = (id, data) =>
  api.put(`/annotations/${id}`, data).then((r) => r.data);
export const deleteAnnotation = (id) => api.delete(`/annotations/${id}`);
export const getFrameAnnotations = (frameId) =>
  api.get(`/annotations/frame/${frameId}`).then((r) => r.data);

export const approveBulk = (ids) =>
  api.post("/annotations/approve-bulk", { annotation_ids: ids }).then((r) => r.data);

// ---- Jobs ----
export const getJobStatus = (jobId) =>
  api.get(`/jobs/${jobId}`).then((r) => r.data);

// ---- Project Labels ----
export const getProjectLabels = (projectId) =>
  api.get(`/projects/${projectId}/labels`).then((r) => r.data);
export const addProjectLabel = (projectId, labelName) =>
  api.post(`/projects/${projectId}/labels`, { label_name: labelName }).then((r) => r.data);
export const deleteProjectLabel = (projectId, labelName) =>
  api.delete(`/projects/${projectId}/labels/${encodeURIComponent(labelName)}`);

// ---- Video Stats ----
export const getVideoStats = (projectId, videoId) =>
  api.get(`/projects/${projectId}/videos/${videoId}/stats`).then((r) => r.data);

// ---- Export ----
export const exportDataset = (projectId, data) =>
  api
    .post(`/projects/${projectId}/export`, data, { responseType: "blob" })
    .then((r) => r.data);

export const exportToGCS = (projectId, data) =>
  api.post(`/projects/${projectId}/export/gcs`, data).then((r) => r.data);

// ---- Config ----
export const getConfig = () => api.get("/config").then((r) => r.data);
