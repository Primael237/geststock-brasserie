import { useState, useEffect } from 'react';
import { Lock, Package, Scale, CheckCircle2, Upload } from 'lucide-react';
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

  const fmt = (n: number) => n.toLocaleString('fr-FR');
  const signed = (n: number) => `${n > 0 ? '+' : ''}${fmt(n)}`;
  const discrepancyText = discrepancy < 0 ? 'text-red-600' : 'text-primary-600';
  const packagingBalance = packagingInv.crates_empty - packagingInv.crates_full;

  const denominationRow = (b: { value: number; label: string }) => (
    <tr key={b.value}>
      <td className="py-1.5 font-medium text-gray-700">{b.label}</td>
      <td className="py-1.5">
        <input
          type="number" min={0}
          className="input-field w-20 mx-auto block text-center py-1"
          value={billetage[b.value] || ''}
          onChange={e => setBilletage(prev => ({ ...prev, [b.value]: +e.target.value || 0 }))}
        />
      </td>
      <td className="py-1.5 text-right text-gray-600">{fmt((billetage[b.value] || 0) * b.value)} FCFA</td>
    </tr>
  );

  const packagingTile = (icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <div className="border border-gray-200 rounded-xl p-3 flex items-center gap-3">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 leading-tight">{label}</p>
        <div className="mt-1 text-center">{value}</div>
      </div>
    </div>
  );

  const packagingInput = (key: 'crates_full' | 'crates_empty') => (
    <input
      type="number" min={0}
      className="w-full text-center text-2xl font-bold text-gray-900 border-0 border-b border-transparent hover:border-gray-200 focus:border-brand-gold focus:outline-none focus:ring-0 bg-transparent"
      value={packagingInv[key] || ''}
      placeholder="0"
      onChange={e => setPackagingInv(prev => ({ ...prev, [key]: +e.target.value || 0 }))}
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Lock size={22} className="text-brand-gold" /> Caisse & Clôture</h2>
        <p className="text-sm text-gray-500 mt-1">{closures.length} clôture(s) enregistrée(s)</p>
      </div>

      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">{success}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {isGerantOrAdmin ? (
        <>
          {/* Bandeau récapitulatif (rouge si la caisse est en manque) */}
          <div className={`rounded-xl shadow-sm text-white grid grid-cols-3 divide-x divide-white/20 ${discrepancy < 0 ? 'bg-red-700' : 'bg-primary-700'}`}>
            <div className="p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Théorique système</p>
              <p className="text-2xl font-bold mt-1">{fmt(theoreticalAmount)} <span className="text-sm font-semibold">FCFA</span></p>
            </div>
            <div className="p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Total compté (réel)</p>
              <p className="text-2xl font-bold mt-1">{fmt(realAmount)} <span className="text-sm font-semibold">FCFA</span></p>
            </div>
            <div className="p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Écart</p>
              <p className="text-2xl font-bold mt-1">{signed(discrepancy)} <span className="text-sm font-semibold">FCFA</span></p>
              <p className="text-[11px] text-white/70">(Écart = Réel − Théorique)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Billetage de caisse */}
            <div className="card lg:col-span-2">
              <h3 className="text-base font-bold mb-3">Billetage de caisse</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500">
                    <th className="text-left font-medium pb-2">Dénomination</th>
                    <th className="font-medium pb-2">Quantité</th>
                    <th className="text-right font-medium pb-2">Sous-total</th>
                  </tr>
                </thead>
                <tbody>{BILLS.map(denominationRow)}</tbody>
                <tbody className="border-t border-gray-200">
                  <tr><td colSpan={3} className="pt-2" /></tr>
                  {COINS.map(denominationRow)}
                </tbody>
              </table>
              <div className="mt-4 bg-primary-50 rounded-lg px-4 py-3 flex justify-between items-center">
                <span className="text-xs font-bold uppercase text-gray-700">Total compté (réel)</span>
                <span className="font-bold text-primary-700">{fmt(realAmount)} FCFA</span>
              </div>
            </div>

            {/* Inventaire emballages */}
            <div className="card">
              <h3 className="text-base font-bold mb-3">Inventaire emballages fin de journée</h3>
              <div className="space-y-3">
                {packagingTile(<Package size={32} className="text-primary-600" />, 'Casiers pleins vendus', packagingInput('crates_full'))}
                {packagingTile(<Package size={32} className="text-brand-amber" />, 'Casiers vides reçus', packagingInput('crates_empty'))}
                {packagingTile(<Scale size={32} className="text-gray-700" />, 'Solde physique', <p className="text-2xl font-bold text-gray-900">{packagingBalance}</p>)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Résumé de la clôture */}
            <div className="card lg:col-span-2">
              <h3 className="text-base font-bold mb-3">Résumé de la clôture</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Théorique système</span><span className="font-bold">{fmt(theoreticalAmount)} FCFA</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Total compté (réel)</span><span className="font-bold">{fmt(realAmount)} FCFA</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Écart (Réel − Théorique)</span><span className={`font-bold ${discrepancyText}`}>{signed(discrepancy)} FCFA</span></div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button onClick={handleClose} className="btn-primary w-full py-4 text-base font-bold flex items-center justify-center gap-2">
                <CheckCircle2 size={18} /> Valider la clôture
              </button>
              <button onClick={() => setShowExport(true)} className="w-full py-3 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2">
                <Upload size={16} /> Exporter les données (USB/Dossier)
              </button>
            </div>
          </div>
        </>
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