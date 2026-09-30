import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore.js';
import { EditorPage } from './pages/EditorPage.js';
import { LandingPage } from './pages/LandingPage.js';
import { LabWorkspacePage } from './pages/LabWorkspacePage.js';

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/editor/:projectId?" element={<EditorPage />} />
      <Route path="/demos" element={<LabWorkspacePage />} />
      <Route path="/wavegen" element={<Navigate to="/demos" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
