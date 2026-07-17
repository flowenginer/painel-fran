import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PermissionRoute, RedirecionarInicio } from "@/components/PermissionRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Pacientes } from "@/pages/Pacientes";
import { Conversas } from "@/pages/Conversas";
import { Agenda } from "@/pages/Agenda";
import { Configuracoes } from "@/pages/Configuracoes";
import { Usuarios } from "@/pages/Usuarios";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
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
          path="/pacientes"
          element={
            <PermissionRoute pagina="pacientes">
              <Pacientes />
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
          path="/agenda"
          element={
            <PermissionRoute pagina="agenda">
              <Agenda />
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
