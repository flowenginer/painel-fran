import { Routes, Route, Navigate } from "react-router-dom";

import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Fila } from "@/pages/Fila";
import { Conversas } from "@/pages/Conversas";
import { Instituicoes } from "@/pages/Instituicoes";
import { Whatsapp } from "@/pages/Whatsapp";
import { Configuracoes } from "@/pages/Configuracoes";
import { Usuarios } from "@/pages/Usuarios";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  PermissionRoute,
  RedirecionarInicio,
} from "@/components/PermissionRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster } from "@/components/ui/toaster";

function App() {
  return (
    <>
      <Routes>
        {/* Rota pública */}
        <Route path="/login" element={<Login />} />

        {/* Rotas protegidas com layout compartilhado + gating por permissão */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* Raiz: manda para a primeira página permitida do perfil */}
          <Route index element={<RedirecionarInicio />} />
          <Route
            path="/dashboard"
            element={
              <PermissionRoute pagina="dashboard">
                <Dashboard />
              </PermissionRoute>
            }
          />
          <Route
            path="/fila"
            element={
              <PermissionRoute pagina="fila">
                <Fila />
              </PermissionRoute>
            }
          />
          <Route
            path="/conversas"
            element={
              <PermissionRoute pagina="conversas">
                <Conversas />
              </PermissionRoute>
            }
          />
          <Route
            path="/instituicoes"
            element={
              <PermissionRoute pagina="instituicoes">
                <Instituicoes />
              </PermissionRoute>
            }
          />
          <Route
            path="/whatsapp"
            element={
              <PermissionRoute pagina="whatsapp">
                <Whatsapp />
              </PermissionRoute>
            }
          />
          <Route
            path="/configuracoes"
            element={
              <PermissionRoute pagina="configuracoes">
                <Configuracoes />
              </PermissionRoute>
            }
          />
          <Route
            path="/usuarios"
            element={
              <PermissionRoute pagina="usuarios" adminOnly>
                <Usuarios />
              </PermissionRoute>
            }
          />
        </Route>

        {/* 404: redireciona pra raiz (que decide o destino conforme o perfil) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
