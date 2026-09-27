import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requirePasswordChanged?: boolean;
}

export function ProtectedRoute({ children, requireAuth, requirePasswordChanged }: ProtectedRouteProps) {
  const { isAuthenticated, mustChangePassword } = useAuthStore();

  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requirePasswordChanged && mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}