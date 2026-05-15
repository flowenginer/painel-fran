import { Routes, Route, Navigate } from "react-router-dom";

import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Instituicoes } from "@/pages/Instituicoes";
import { Whatsapp } from "@/pages/Whatsapp";
import { Configuracoes } from "@/pages/Configuracoes";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster } from "@/components/ui/toaster";

function App() {
  return (
    <>
      <Routes>
        {/* Rota pública */}
        <Route path="/login" element={<Login />} />

        {/* Rotas protegidas com layout compartilhado */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/instituicoes" element={<Instituicoes />} />
          <Route path="/whatsapp" element={<Whatsapp />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
        </Route>

        {/* Rota raiz redireciona pro dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* 404: redireciona pra raiz */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
