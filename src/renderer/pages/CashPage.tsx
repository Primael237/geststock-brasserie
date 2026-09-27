import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

const BILLS = [
  { value: 10000, label: '10 000 F' },
  { value: 5000, label: '5 000 F' },
  { value: 2000, label: '2 000 F' },
  { value: 1000, label: '1 000 F' },
  { value: 500, label: '500 F' },
];
const COINS = [
  { value: 100, label: '100 F' },
  { value: 50, label: '50 F' },
  { value: 25, label: '25 F' },
];

export default function CashPage() {
  const { user } = useAuthStore();
  const isGerantOrAdmin = user?.role === 'super_admin' || user?.role === 'gerant';
  const [stats, setStats] = useState<any>(null);
  const [billetage, setBilletage] = useState<Record<number, number>>({});
  const [packagingInv, setPackagingInv] = useState({ crates_full: 0, crates_empty: 0, bottles: 0 });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [closures, setClosures] = useState<any[]>([]);
  const [showExport, setShowExport] = useState(false);
  const [exportPath, setExportPath] = useState('');

  useEffect(() => {
    window.electronAPI.getStats().then(r => { if (r.success) setStats(r.stats); });
    window.electronAPI.listCashClosures().then(r => { if (r.success) setClosures(r.closures); });
    // Init billetage
    const init: Record<number, number> = {};
    [...BILLS, ...COINS].forEach(b => { init[b.value] = 0; });
    setBilletage(init);
  }, []);

  const theoreticalAmount = stats?.revenue_cash || 0;
  const realAmount = Object.entries(billetage).reduce((sum, [k, v]) => sum + Number(k) * (v || 0), 0);
  const discrepancy = realAmount - theoreticalAmount;

  const handleClose = async () => {
    setError('');
    const result = await window.electronAPI.closeCash({
      theoretical: theoreticalAmount,
      real: realAmount,
      billetage,
      packaging: packagingInv,
    });
    if (result.success) {
      setSuccess('✅ Clôture enregistrée !');
      window.electronAPI.getStats().then(r => { if (r.success) setStats(r.stats); });
      window.electronAPI.listCashClosures().then(r => { if (r.success) setClosures(r.closures); });
    } else {
      setError(result.error);
    }
  };

  const handleExport = async () => {
    setError('');
    const result = await window.electronAPI.exportDb(exportPath || undefined);
    if (result.success) {
      setSuccess(`💾 Base exportée et chiffrée : ${result.path}`);
      setShowExport(false);
    } else {
      setError(result.error);
    }
  };

  if (!stats) return <div className="p-6 text-gray-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">🔒 Caisse & Clôture</h2>
          <p className="text-sm text-gray-500 mt-1">{closures.length} clôture(s) enregistrée(s)</p>
        </div>
      </div>

      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">{success}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {isGerantOrAdmin ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Billetage de caisse */}
          <div className="card">
            <h3 className="text-lg font-bold mb-4">💵 Billetage de caisse</h3>
            <div className="space-y-3">
              <p className="text-sm text-gray-500 font-medium">Billets</p>
              {BILLS.map(b => (
                <div key={b.value} className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium">{b.label}</span>
                  <input
                    type="number" min={0}
                    className="input-field w-20 text-center"
                    value={billetage[b.value] || ''}
                    onChange={e => setBilletage(prev => ({ ...prev, [b.value]: +e.target.value || 0 }))}
                  />
                  <span className="text-xs text-gray-400">= {((billetage[b.value] || 0) * b.value).toLocaleString()} F</span>
                </div>
              ))}
              <p className="text-sm text-gray-500 font-medium mt-4">Pièces</p>
              {COINS.map(b => (
                <div key={b.value} className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium">{b.label}</span>
                  <input
                    type="number" min={0}
                    className="input-field w-20 text-center"
                    value={billetage[b.value] || ''}
                    onChange={e => setBilletage(prev => ({ ...prev, [b.value]: +e.target.value || 0 }))}
                  />
                  <span className="text-xs text-gray-400">= {((billetage[b.value] || 0) * b.value).toLocaleString()} F</span>
                </div>
              ))}

              {/* Résumé billetage */}
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span>Total compté (réel)</span>
                  <span className="font-bold text-lg">{realAmount.toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span>Théorique système</span>
                  <span className="font-bold">{theoreticalAmount.toLocaleString()} FCFA</span>
                </div>
                <div className={`flex justify-between text-sm mt-2 pt-2 border-t font-bold ${discrepancy === 0 ? 'text-green-600' : discrepancy > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <span>Écart</span>
                  <span className="text-lg">{discrepancy > 0 ? '+' : ''}{discrepancy.toLocaleString()} FCFA</span>
                </div>
              </div>
            </div>
          </div>

          {/* Inventaire emballages + Actions */}
          <div className="space-y-4">
            {/* Inventaire emballages */}
            <div className="card">
              <h3 className="text-lg font-bold mb-4">♻️ Inventaire emballages fin de journée</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-32 text-sm">Casiers pleins vendus</span>
                  <input type="number" min={0} className="input-field w-20 text-center"
                    value={packagingInv.crates_full || ''}
                    onChange={e => setPackagingInv(prev => ({ ...prev, crates_full: +e.target.value || 0 }))} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-32 text-sm">Casiers vides reçus</span>
                  <input type="number" min={0} className="input-field w-20 text-center"
                    value={packagingInv.crates_empty || ''}
                    onChange={e => setPackagingInv(prev => ({ ...prev, crates_empty: +e.target.value || 0 }))} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-32 text-sm">Solde physique</span>
                  <span className="font-bold text-lg">{packagingInv.crates_empty - packagingInv.crates_full}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="card space-y-3">
              <button onClick={handleClose} className="btn-primary w-full py-3 text-base font-bold">
                ✅ Valider clôture & Sauvegarder
              </button>
              <button onClick={() => setShowExport(true)} className="btn-secondary w-full text-sm">
                💾 Exporter base chiffrée (USB/Dossier)
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="text-gray-500 text-sm">🔒 Accès restreint — Seuls le Gérant et le Super Admin peuvent accéder à la clôture de caisse.</p>
          <p className="text-xs text-gray-400 mt-2">Connectez-vous avec un compte Gérant ou Super Admin pour effectuer la clôture.</p>
        </div>
      )}

      {/* Historique clôtures */}
      <div className="card overflow-x-auto">
        <h3 className="text-lg font-bold mb-4">📋 Historique des clôtures</h3>
        {closures.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune clôture enregistrée.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-2">Date</th><th className="py-2 px-2">Utilisateur</th>
                <th className="py-2 px-2 text-right">Théorique</th><th className="py-2 px-2 text-right">Réel</th>
                <th className="py-2 px-2 text-right">Écart</th>
              </tr>
            </thead>
            <tbody>
              {closures.map((c: any) => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2 text-xs">{new Date(c.created_at).toLocaleString('fr-FR')}</td>
                  <td className="py-2 px-2">{c.username}</td>
                  <td className="py-2 px-2 text-right">{c.theoretical_amount?.toLocaleString()} F</td>
                  <td className="py-2 px-2 text-right">{c.real_amount?.toLocaleString()} F</td>
                  <td className={`py-2 px-2 text-right font-bold ${c.discrepancy === 0 ? 'text-green-600' : c.discrepancy > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {c.discrepancy > 0 ? '+' : ''}{c.discrepancy?.toLocaleString()} F
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Export */}
      {showExport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4">💾 Exporter la base de données</h3>
            <p className="text-sm text-gray-500 mb-3">La base sera chiffrée avant export.</p>
            <input
              type="text" className="input-field mb-3"
              placeholder="Chemin (laisser vide = Bureau)"
              value={exportPath}
              onChange={e => setExportPath(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowExport(false)} className="btn-secondary">Annuler</button>
              <button onClick={handleExport} className="btn-primary">Exporter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}