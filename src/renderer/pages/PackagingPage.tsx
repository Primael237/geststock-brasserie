import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

interface Movement {
  id: string;
  client_id: string | null;
  user_id: string;
  product_id: string;
  type: string;
  quantity_crates: number;
  quantity_bottles: number;
  comment: string;
  created_at: string;
  product_name?: string;
  client_name?: string;
  username?: string;
}

const TYPE_LABELS: Record<string, string> = {
  entree: '📥 Entrée',
  sortie: '📤 Sortie',
  echange: '🔄 Échange',
  casse: '💔 Casse',
  restitution: '↩️ Restitution',
};
const TYPE_COLORS: Record<string, string> = {
  entree: 'bg-green-100 text-green-800',
  sortie: 'bg-blue-100 text-blue-800',
  echange: 'bg-purple-100 text-purple-800',
  casse: 'bg-red-100 text-red-800',
  restitution: 'bg-amber-100 text-amber-800',
};

export default function PackagingPage() {
  const { user } = useAuthStore();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const canManageStock = user?.role === 'super_admin' || user?.role === 'gerant';

  // Nouveau mouvement
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    product_id: '', client_id: '', type: 'entree',
    quantity_crates: 0, quantity_bottles: 0, comment: '',
  });
  const [products, setProducts] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    const [movRes, prodRes] = await Promise.all([
      window.electronAPI.listPackagingMovements(),
      window.electronAPI.listProducts(),
    ]);
    if (movRes.success) setMovements(movRes.movements);
    if (prodRes.success) setProducts(prodRes.products);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = filterType ? movements.filter(m => m.type === filterType) : movements;

  // Calculer le solde global des emballages (casiers vides récupérés = entrées + restitutions - sorties)
  const totals = movements.reduce((acc, m) => {
    if (m.type === 'entree' || m.type === 'restitution') acc.crates += (m.quantity_crates || 0);
    else if (m.type === 'sortie' || m.type === 'casse') acc.crates -= (m.quantity_crates || 0);
    return acc;
  }, { crates: 0 });

  const recentCasse = movements.filter(m => m.type === 'casse').slice(0, 5);
  const casseTotal = recentCasse.reduce((s, m) => s + m.quantity_crates + m.quantity_bottles, 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await window.electronAPI.createPackagingMovement(form);
    if (result.success) {
      setSuccess('Mouvement enregistré !');
      setShowForm(false);
      setForm({ product_id: '', client_id: '', type: 'entree', quantity_crates: 0, quantity_bottles: 0, comment: '' });
      loadData();
    } else {
      setError(result.error);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">♻️ Emballages</h2>
          <p className="text-sm text-gray-500 mt-1">{movements.length} mouvement(s)</p>
        </div>
        {canManageStock && (
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Nouveau Mouvement</button>
        )}
      </div>

      {/* Messages */}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">{success}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {/* Solde global */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary-700">{totals.crates}</p>
          <p className="text-sm text-gray-500">Casiers vides en stock</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-red-600">{casseTotal}</p>
          <p className="text-sm text-gray-500">Unités cassées (récent)</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">
            {movements.filter(m => m.type === 'entree').length}
          </p>
          <p className="text-sm text-gray-500">Entrées enregistrées</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="card flex gap-3 items-center">
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input-field w-48">
          <option value="">Tous les types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-xs text-gray-400">{filtered.length} résultat(s)</span>
      </div>

      {/* Historique */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-3 px-2 font-semibold text-gray-600">Date</th>
              <th className="py-3 px-2 font-semibold text-gray-600">Type</th>
              <th className="py-3 px-2 font-semibold text-gray-600">Produit</th>
              <th className="py-3 px-2 font-semibold text-gray-600">Client</th>
              <th className="py-3 px-2 font-semibold text-gray-600 text-center">Casiers</th>
              <th className="py-3 px-2 font-semibold text-gray-600 text-center">Bouteilles</th>
              <th className="py-3 px-2 font-semibold text-gray-600">Commentaire</th>
              <th className="py-3 px-2 font-semibold text-gray-600">Utilisateur</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-2 text-xs text-gray-500">
                  {new Date(m.created_at).toLocaleString('fr-FR')}
                </td>
                <td className="py-3 px-2">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${TYPE_COLORS[m.type] || 'bg-gray-100'}`}>
                    {TYPE_LABELS[m.type] || m.type}
                  </span>
                </td>
                <td className="py-3 px-2">{m.product_name || m.product_id}</td>
                <td className="py-3 px-2 text-gray-600">{m.client_name || '—'}</td>
                <td className="py-3 px-2 text-center font-medium">{m.quantity_crates}</td>
                <td className="py-3 px-2 text-center font-medium">{m.quantity_bottles}</td>
                <td className="py-3 px-2 text-xs text-gray-500 max-w-[150px] truncate">{m.comment}</td>
                <td className="py-3 px-2 text-xs text-gray-500">{m.username}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-gray-400">Aucun mouvement.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Nouveau Mouvement */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Nouveau Mouvement d'Emballage</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <select className="input-field" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="input-field" value={form.product_id} onChange={e => setForm({...form, product_id: e.target.value})} required>
                <option value="">Sélectionner un produit</option>
                {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Casiers</label>
                  <input type="number" className="input-field" value={form.quantity_crates || ''} onChange={e => setForm({...form, quantity_crates: +e.target.value})} min={0} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Bouteilles</label>
                  <input type="number" className="input-field" value={form.quantity_bottles || ''} onChange={e => setForm({...form, quantity_bottles: +e.target.value})} min={0} />
                </div>
              </div>
              <input type="text" placeholder="Commentaire" className="input-field" value={form.comment} onChange={e => setForm({...form, comment: e.target.value})} />
              <div className="flex gap-2 justify-end pt-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Annuler</button>
                <button type="submit" className="btn-primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}