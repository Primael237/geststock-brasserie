import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useSettingsStore } from './store/settingsStore';
import { ProtectedRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ProductsPage from './pages/ProductsPage';
import PackagingPage from './pages/PackagingPage';
import InventoryPage from './pages/InventoryPage';
import SalesPage from './pages/SalesPage';
import ClientsPage from './pages/ClientsPage';
import CashPage from './pages/CashPage';
import ReportsPage from './pages/ReportsPage';

export default function App() {
  const { checkAuth, isLoading, isAuthenticated, mustChangePassword } = useAuthStore();
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    checkAuth();
    loadSettings();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        {/* Routes publiques */}
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to={mustChangePassword ? '/change-password' : '/dashboard'} replace />
            ) : (
              <LoginPage />
            )
          }
        />

        {/* Changement mot de passe obligatoire */}
        <Route
          path="/change-password"
          element={
            <ProtectedRoute requireAuth>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
        />

        {/* Routes protégées par Layout */}
        <Route
          element={
            <ProtectedRoute requireAuth requirePasswordChanged>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/sales/history" element={<SalesPage />} />
          <Route path="/sales/credits" element={<SalesPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/cash" element={<CashPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>

        {/* Redirection par défaut */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </HashRouter>
  );
}