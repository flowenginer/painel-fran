import { Routes, Route, Navigate } from "react-router-dom";

import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { ProtectedRoute } from "@/components/ProtectedRoute";

function App() {
  return (
    <Routes>
      {/* Rota pública */}
      <Route path="/login" element={<Login />} />

      {/* Rotas protegidas */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      {/* Rota raiz redireciona pro dashboard (que por sua vez manda pro login se não autenticado) */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* 404: redireciona pra raiz */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
