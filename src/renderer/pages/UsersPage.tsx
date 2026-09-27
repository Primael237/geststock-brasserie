import { useState, useEffect } from 'react';
import PasswordInput from '../components/PasswordInput';

interface UserInfo {
  id: string;
  username: string;
  role: string;
  full_name: string;
  created_at: string;
  is_active: number;
  must_change_password: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Formulaire création
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState('gerant');

  // Réinitialisation de mot de passe
  const [resetTarget, setResetTarget] = useState<UserInfo | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetDone, setResetDone] = useState(false);

  const loadUsers = async () => {
    const result = await window.electronAPI.listUsers();
    if (result.success) {
      setUsers(result.users);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!newUsername.trim() || !newPassword.trim() || !newFullName.trim()) {
      setError('Tous les champs sont obligatoires.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    const result = await window.electronAPI.createUser(
      newUsername.trim(),
      newPassword,
      newRole,
      newFullName.trim()
    );

    if (result.success) {
      setSuccessMsg(`Utilisateur "${newUsername}" créé avec succès.`);
      setShowCreate(false);
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      setNewRole('gerant');
      loadUsers();
    } else {
      setError(result.error || 'Erreur lors de la création.');
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    const result = await window.electronAPI.updateUser(userId, !currentActive);
    if (result.success) {
      loadUsers();
    }
  };

  const openReset = (u: UserInfo) => { setResetTarget(u); setResetPassword(''); setResetDone(false); setError(''); };
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setError('');
    if (resetPassword.length < 6) { setError('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    const result = await (window.electronAPI as any).resetUserPassword(resetTarget.id, resetPassword);
    if (result.success) { setResetDone(true); loadUsers(); }
    else setError(result.error || 'Erreur lors de la réinitialisation.');
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">Super Admin</span>;
      case 'gerant':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Gérant</span>;
      case 'caissier':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">Caissier</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">{role}</span>;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">👥 Utilisateurs</h2>
          <p className="text-gray-500 text-sm mt-1">Gestion des comptes utilisateurs</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
          {showCreate ? 'Annuler' : '+ Nouvel utilisateur'}
        </button>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">
          {successMsg}
        </div>
      )}

      {/* Formulaire création */}
      {showCreate && (
        <div className="card mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Créer un utilisateur</h3>
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="input-field"
                  placeholder="Ex: Jean Dupont"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom d'utilisateur</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="input-field"
                  placeholder="Ex: jean.dupont"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                <PasswordInput
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="Minimum 6 caractères"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="input-field"
                >
                  <option value="gerant">Gérant</option>
                  <option value="caissier">Caissier</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn-primary">
              Créer l'utilisateur
            </button>
          </form>
        </div>
      )}

      {/* Tableau des utilisateurs */}
      <div className="card">
        {loading ? (
          <p className="text-sm text-gray-500">Chargement...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun utilisateur.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">Nom complet</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">Utilisateur</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">Rôle</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">Statut</th>
                  <th className="text-left py-3 px-2 font-semibold text-gray-600">Créé le</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2">
                      <span className="font-medium">{u.full_name}</span>
                    </td>
                    <td className="py-3 px-2 text-gray-600">{u.username}</td>
                    <td className="py-3 px-2">{getRoleBadge(u.role)}</td>
                    <td className="py-3 px-2">
                      {u.is_active ? (
                        <span className="text-green-600 font-medium">Actif</span>
                      ) : (
                        <span className="text-red-600 font-medium">Inactif</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-gray-500 text-xs">
                      {new Date(u.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 px-2 text-right space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => openReset(u)}
                        className="text-xs font-medium px-2 py-1 rounded text-primary-700 hover:bg-primary-50"
                      >
                        🔑 Réinitialiser
                      </button>
                      {u.role !== 'super_admin' && (
                        <button
                          onClick={() => handleToggleActive(u.id, u.is_active === 1)}
                          className={`text-xs font-medium px-2 py-1 rounded ${
                            u.is_active
                              ? 'text-red-700 hover:bg-red-50'
                              : 'text-green-700 hover:bg-green-50'
                          }`}
                        >
                          {u.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Réinitialisation mot de passe */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            {resetDone ? (
              <>
                <h3 className="text-lg font-bold mb-2">🔑 Mot de passe réinitialisé</h3>
                <p className="text-sm text-gray-600 mb-3">Nouveau mot de passe pour <strong>{resetTarget.full_name}</strong> ({resetTarget.username}) :</p>
                <p className="font-mono text-sm bg-gray-100 rounded-lg px-3 py-2 mb-3 select-all">{resetPassword}</p>
                <p className="text-xs text-amber-600 mb-4">⚠️ Note-le maintenant, il ne sera plus affiché. L'utilisateur devra le changer à sa prochaine connexion.</p>
                <button onClick={() => setResetTarget(null)} className="btn-primary w-full">Fermer</button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-1">🔑 Réinitialiser le mot de passe</h3>
                <p className="text-sm text-gray-500 mb-4">{resetTarget.full_name} ({resetTarget.username})</p>
                {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
                <form onSubmit={handleResetPassword} className="space-y-3">
                  <PasswordInput value={resetPassword} onChange={setResetPassword} placeholder="Nouveau mot de passe (min. 6 caractères)" autoFocus />
                  <div className="flex gap-2 justify-end pt-1">
                    <button type="button" onClick={() => setResetTarget(null)} className="btn-secondary">Annuler</button>
                    <button type="submit" className="btn-primary">Réinitialiser</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}