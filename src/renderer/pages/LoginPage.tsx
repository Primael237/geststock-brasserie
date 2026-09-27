import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import PasswordInput from '../components/PasswordInput';
import appIcon from '../assets/app-icon.png';

type Mode = 'login' | 'signup-code' | 'signup-form';

export default function LoginPage() {
  const { login, mustChangePassword } = useAuthStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const [info, setInfo] = useState('');

  // Étape 1 de l'inscription : code d'accès
  const [suCode, setSuCode] = useState('');
  const [suCodeError, setSuCodeError] = useState('');
  const [suCodeLoading, setSuCodeLoading] = useState(false);

  // Étape 2 de l'inscription : création du compte Super Admin
  const [suUsername, setSuUsername] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suConfirm, setSuConfirm] = useState('');
  const [suDepotName, setSuDepotName] = useState('');
  const [suError, setSuError] = useState('');
  const [suLoading, setSuLoading] = useState(false);

  useEffect(() => {
    window.electronAPI.checkFirstRun().then(setIsFirstRun);
  }, []);

  const goToLogin = () => {
    setMode('login');
    setSuCode(''); setSuCodeError('');
    setSuUsername(''); setSuPassword(''); setSuConfirm(''); setSuDepotName(''); setSuError('');
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuCodeError('');

    if (!suCode.trim()) {
      setSuCodeError("Veuillez entrer le code d'accès.");
      return;
    }

    setSuCodeLoading(true);
    const result = await window.electronAPI.verifySuperAdminRegisterCode(suCode.trim());
    setSuCodeLoading(false);

    if (result.success && result.valid) {
      setMode('signup-form');
    } else {
      setSuCodeError("Code d'accès incorrect.");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuError('');

    if (!suUsername.trim() || !suPassword.trim() || !suConfirm.trim() || !suDepotName.trim()) {
      setSuError('Veuillez remplir tous les champs.');
      return;
    }
    if (suPassword !== suConfirm) {
      setSuError('Les mots de passe ne correspondent pas.');
      return;
    }

    setSuLoading(true);
    const result = await window.electronAPI.registerSuperAdmin(suCode.trim(), suUsername.trim(), suPassword, suConfirm, suDepotName.trim());
    setSuLoading(false);

    if (result.success) {
      setInfo(`Compte "${suUsername.trim()}" créé. Vous pouvez maintenant vous connecter.`);
      setUsername(suUsername.trim());
      goToLogin();
    } else {
      setSuError(result.error || "Erreur lors de l'inscription.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Veuillez remplir tous les champs.');
      return;
    }

    setLoading(true);
    const result = await login(username.trim(), password);
    setLoading(false);

    if (result.success) {
      // Rediriger selon mustChangePassword
      const state = useAuthStore.getState();
      if (state.mustChangePassword) {
        navigate('/change-password', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } else {
      setError(result.error || 'Erreur de connexion.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo / Titre */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg overflow-hidden ring-2 ring-brand-gold/70 ring-offset-2 ring-offset-primary-50">
            <img src={appIcon} alt="GestStock Brasserie" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">GestStock Brasserie</h1>
          <p className="text-sm text-gray-500 mt-1">Gestion de sous-dépôt — v1.0</p>
        </div>

        {/* Info premier lancement */}
        {isFirstRun && mode === 'login' && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">🔐 Premier lancement</p>
            <p>Un compte Super Administrateur a été créé :</p>
            <p className="mt-2 font-mono bg-amber-100 rounded px-2 py-1">
              <strong>Identifiant :</strong> superadmin
            </p>
            <p className="mt-1 font-mono bg-amber-100 rounded px-2 py-1">
              <strong>Mot de passe :</strong> Admin@2024
            </p>
            <p className="mt-2 text-xs">Vous devrez changer ce mot de passe à la première connexion.</p>
          </div>
        )}

        {info && mode === 'login' && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">
            {info}
          </div>
        )}

        {/* Formulaire */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {mode === 'login' && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Connexion</h2>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom d'utilisateur
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input-field"
                    placeholder="superadmin"
                    autoFocus
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mot de passe
                  </label>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-2.5"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Connexion...
                    </span>
                  ) : (
                    'Se connecter'
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => { setMode('signup-code'); setInfo(''); setSuCodeError(''); setSuCode(''); }}
                className="w-full text-center text-sm text-primary-700 hover:text-primary-800 font-medium mt-6 pt-5 border-t border-gray-100"
              >
                Inscription Super Administrateur
              </button>
            </>
          )}

          {mode === 'signup-code' && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Inscription Super Administrateur</h2>
              <p className="text-xs text-gray-400 mb-5">Entrez le code d'accès pour continuer.</p>

              {suCodeError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  {suCodeError}
                </div>
              )}

              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code d'accès</label>
                  <input
                    type="text"
                    value={suCode}
                    onChange={(e) => setSuCode(e.target.value)}
                    className="input-field"
                    placeholder="Code d'accès"
                    autoFocus
                  />
                </div>

                <button type="submit" disabled={suCodeLoading} className="btn-primary w-full py-2.5">
                  {suCodeLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Vérification...
                    </span>
                  ) : (
                    'Valider'
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={goToLogin}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-5"
              >
                Retour à la connexion
              </button>
            </>
          )}

          {mode === 'signup-form' && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Créer un compte Super Admin</h2>
              <p className="text-xs text-gray-400 mb-5">Le compte "superadmin" par défaut reste disponible.</p>

              {suError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  {suError}
                </div>
              )}

              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom d'utilisateur</label>
                  <input
                    type="text"
                    value={suUsername}
                    onChange={(e) => setSuUsername(e.target.value)}
                    className="input-field"
                    placeholder="ex: patron"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom du dépôt</label>
                  <input
                    type="text"
                    value={suDepotName}
                    onChange={(e) => setSuDepotName(e.target.value)}
                    className="input-field"
                    placeholder="ex: Dépôt Central Yaoundé"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Ce nom apparaîtra sur les tickets et factures imprimés.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                  <PasswordInput value={suPassword} onChange={setSuPassword} placeholder="••••••••" autoComplete="new-password" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmation du mot de passe</label>
                  <PasswordInput value={suConfirm} onChange={setSuConfirm} placeholder="••••••••" autoComplete="new-password" />
                </div>

                <button type="submit" disabled={suLoading} className="btn-primary w-full py-2.5">
                  {suLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Création...
                    </span>
                  ) : (
                    'Créer le compte'
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={goToLogin}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-5"
              >
                Annuler
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          GestStock Brasserie v1.0 — Fonctionne 100% hors-ligne
        </p>
      </div>
    </div>
  );
}
