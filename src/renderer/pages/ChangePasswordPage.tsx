import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import PasswordInput from '../components/PasswordInput';

export default function ChangePasswordPage() {
  const { user, changePassword, mustChangePassword, logout } = useAuthStore();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    if (!user) return;

    setLoading(true);
    const result = await changePassword(user.id, '', newPassword, mustChangePassword);
    setLoading(false);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1500);
    } else {
      setError(result.error || 'Erreur lors du changement de mot de passe.');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Mot de passe changé !</h2>
          <p className="text-gray-500 text-sm">Redirection vers le tableau de bord...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">🔐 Changement de mot de passe</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pour des raisons de sécurité, vous devez changer votre mot de passe.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nouveau mot de passe
              </label>
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Minimum 6 caractères"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirmer le mot de passe
              </label>
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Répéter le mot de passe"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5"
            >
              {loading ? 'Changement...' : 'Changer le mot de passe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}