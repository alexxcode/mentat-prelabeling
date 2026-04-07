import { Routes, Route, Navigate } from "react-router-dom";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import VideoPage from "./pages/VideoPage";
import AnnotatePage from "./pages/AnnotatePage";
import PropagationPage from "./pages/PropagationPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
      <Route path="/projects/:projectId/videos/:videoId" element={<VideoPage />} />
      <Route path="/projects/:projectId/videos/:videoId/annotate/:frameId" element={<AnnotatePage />} />
      <Route path="/projects/:projectId/videos/:videoId/propagation" element={<PropagationPage />} />
    </Routes>
  );
}
