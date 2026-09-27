import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface Client {
  id: string; name: string; phone: string; address: string;
  financial_balance: number; material_balance_crates: number; material_balance_bottles: number;
  created_at: string;
}
interface HistoryItem {
  id: string; type: string; date: string; label: string; amount: number; detail: string;
}

export default function ClientsPage() {
  const { user } = useAuthStore();
  const location = useLocation();
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<Client | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const isGerantOrAdmin = user?.role === 'super_admin' || user?.role === 'gerant';
  const isSuperAdmin = user?.role === 'super_admin';

  // Formulaires
  const [showCreate, setShowCreate] = useState(false);
  const [showRepay, setShowRepay] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [repayAmount, setRepayAmount] = useState(0);
  const [repayMethod, setRepayMethod] = useState('cash');
  const [returnCrates, setReturnCrates] = useState(0);
  const [returnBottles, setReturnBottles] = useState(0);

  const loadClients = async () => {
    const r = await window.electronAPI.listClients();
    if (r.success) setClients(r.clients);
    setLoading(false);
  };

  useEffect(() => { loadClients(); }, []);

  const [periodDays, setPeriodDays] = useState(30);

  const selectClient = async (client: Client) => {
    setSelected(client); setError(''); setSuccess('');
    const r = await window.electronAPI.getClientHistory(client.id);
    if (r.success) {
      // Filtrer par période
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - periodDays);
      setHistory(r.history.filter((h:any) => new Date(h.date) >= cutoff));
    }
  };

  // Recharger l'historique quand la période change
  useEffect(() => {
    if (selected) selectClient(selected);
  }, [periodDays]);

  // Présélection depuis une autre page (ex: "Ventes à crédit" -> "Voir / Rembourser")
  useEffect(() => {
    const id = (location.state as any)?.selectedClientId;
    if (id && clients.length > 0) {
      const c = clients.find(x => x.id === id);
      if (c) selectClient(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients.length]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const r = await window.electronAPI.createClient(form);
    if (r.success) {
      setSuccess('Client créé !');
      setShowCreate(false);
      setForm({ name: '', phone: '', address: '' });
      loadClients();
    } else setError(r.error);
  };

  const handleRepay = async () => {
    if (!selected || repayAmount <= 0) return;
    setError('');
    const r = await window.electronAPI.clientRepayment({
      client_id: selected.id, amount: repayAmount, method: repayMethod,
    });
    if (r.success) {
      setSuccess(`Remboursement de ${repayAmount.toLocaleString()} F enregistré.`);
      setShowRepay(false);
      setRepayAmount(0);
      loadClients();
      selectClient({ ...selected, financial_balance: r.client.financial_balance });
    } else setError(r.error);
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Supprimer définitivement ${selected.name} ? Cette action est irréversible.`)) return;
    setError(''); setSuccess('');
    const r = await window.electronAPI.deleteClient(selected.id);
    if (r.success) {
      setSuccess('Client supprimé.');
      setSelected(null);
      loadClients();
    } else setError(r.error);
  };

  const handleReturn = async () => {
    if (!selected) return;
    setError('');
    // Créer un mouvement de restitution + mettre à jour les soldes
    const products = await window.electronAPI.listProducts();
    const prod = products.products?.[0]; // Associer au premier produit dispo
    if (!prod) { setError('Aucun produit disponible.'); return; }

    const r = await window.electronAPI.createPackagingMovement({
      client_id: selected.id, product_id: prod.id, type: 'restitution',
      quantity_crates: returnCrates, quantity_bottles: returnBottles,
      comment: 'Restitution manuelle',
    });
    if (r.success) {
      setSuccess(`${returnCrates} casiers, ${returnBottles} bouteilles restitués.`);
      setShowReturn(false);
      setReturnCrates(0);
      setReturnBottles(0);
      loadClients();
      selectClient({ ...selected });
    } else setError(r.error);
  };

  if (loading) return <div className="p-6 text-gray-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">🏪 Clients</h2>
          <p className="text-sm text-gray-500 mt-1">{clients.length} client(s)</p>
        </div>
        {isGerantOrAdmin && (
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">+ Nouveau Client</button>
        )}
      </div>

      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">{success}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des clients */}
        <div className="lg:col-span-1">
          <div className="card max-h-[600px] overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-500 mb-3">DÉTAILLANTS</h3>
            {clients.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun client.</p>
            ) : (
              <div className="space-y-1">
                {clients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => selectClient(c)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selected?.id === c.id ? 'bg-primary-50 border border-primary-200' : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.phone}</p>
                    <p className={`text-xs font-bold mt-1 ${c.financial_balance > 0 ? 'text-red-600' : c.financial_balance < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {c.financial_balance > 0 ? `Doit: ${c.financial_balance.toLocaleString()} F` : c.financial_balance < 0 ? `Crédit: ${Math.abs(c.financial_balance).toLocaleString()} F` : 'Solde: 0 F'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fiche client */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="card text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">👈</p>
              <p>Sélectionnez un client dans la liste</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Infos client */}
              <div className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold">{selected.name}</h3>
                    <p className="text-sm text-gray-500">{selected.phone}</p>
                    <p className="text-xs text-gray-400">{selected.address}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Client depuis</p>
                    <p className="text-xs">{new Date(selected.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                </div>

                {/* Soldes */}
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className={`rounded-lg p-3 text-center ${selected.financial_balance > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                    <p className="text-2xl font-bold">{selected.financial_balance.toLocaleString()} F</p>
                    <p className="text-xs text-gray-600">Solde financier</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{selected.material_balance_crates}</p>
                    <p className="text-xs text-gray-600">Casiers dus</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-purple-700">{selected.material_balance_bottles}</p>
                    <p className="text-xs text-gray-600">Bouteilles dues</p>
                  </div>
                </div>

                {/* Actions rapides */}
                {isGerantOrAdmin && (
                  <div className="flex gap-2 mt-4 pt-4 border-t">
                    <button onClick={() => { setShowRepay(true); setRepayAmount(selected.financial_balance > 0 ? selected.financial_balance : 0); }} className="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg font-medium">
                      💵 Remboursement
                    </button>
                    <button onClick={() => setShowReturn(true)} className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg font-medium">
                      ♻️ Restitution emballages
                    </button>
                    {isSuperAdmin && (
                      <button onClick={handleDelete} className="text-xs bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-lg font-medium ml-auto">
                        🗑️ Supprimer le client
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Historique */}
              <div className="card">
                <h4 className="text-sm font-bold text-gray-500 mb-3">📜 HISTORIQUE
                <select value={periodDays} onChange={e=>setPeriodDays(+e.target.value)} className="ml-2 text-xs border rounded px-1 py-0.5">
                  <option value={1}>Aujourd'hui</option><option value={7}>7 jours</option><option value={30}>30 jours</option><option value={90}>3 mois</option><option value={365}>1 an</option>
                </select>
              </h4>
                {history.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">Aucune opération.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {history.map(h => (
                      <div key={h.id} className="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
                        <div>
                          <span className={`px-2 py-0.5 text-xs rounded ${h.type === 'sale' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                            {h.label}
                          </span>
                          <p className="text-xs text-gray-400 mt-0.5">{new Date(h.date).toLocaleString('fr-FR')}</p>
                        </div>
                        <div className="text-right">
                          {h.amount !== 0 && (
                            <span className={`font-bold ${h.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {h.amount > 0 ? '+' : ''}{h.amount.toLocaleString()} F
                            </span>
                          )}
                          <p className="text-xs text-gray-500">{h.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Création Client */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4">Nouveau Client</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <input type="text" className="input-field" placeholder="Nom complet" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              <input type="text" className="input-field" placeholder="Téléphone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              <input type="text" className="input-field" placeholder="Adresse" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
              <div className="flex gap-2 justify-end pt-3">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Annuler</button>
                <button type="submit" className="btn-primary">Créer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Remboursement */}
      {showRepay && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-2">💵 Remboursement</h3>
            <p className="text-sm text-gray-500 mb-4">{selected.name} — Solde: {selected.financial_balance.toLocaleString()} F</p>
            <div className="space-y-3">
              <input type="number" className="input-field" placeholder="Montant" value={repayAmount || ''} onChange={e => setRepayAmount(+e.target.value)} min={1} />
              <select className="input-field" value={repayMethod} onChange={e => setRepayMethod(e.target.value)}>
                <option value="cash">Espèces</option>
                <option value="orange_money">Orange Money</option>
                <option value="mtn_momo">MTN MoMo</option>
              </select>
              <div className="flex gap-2 justify-end pt-3">
                <button onClick={() => setShowRepay(false)} className="btn-secondary">Annuler</button>
                <button onClick={handleRepay} className="btn-primary">Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Restitution Emballages */}
      {showReturn && selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-2">♻️ Restitution Emballages</h3>
            <p className="text-sm text-gray-500 mb-4">{selected.name}</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm">Casiers restitués</label>
                <input type="number" className="input-field" value={returnCrates || ''} onChange={e => setReturnCrates(+e.target.value)} min={0} />
              </div>
              <div>
                <label className="text-sm">Bouteilles vides restituées</label>
                <input type="number" className="input-field" value={returnBottles || ''} onChange={e => setReturnBottles(+e.target.value)} min={0} />
              </div>
              <div className="flex gap-2 justify-end pt-3">
                <button onClick={() => setShowReturn(false)} className="btn-secondary">Annuler</button>
                <button onClick={handleReturn} className="btn-primary">Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}