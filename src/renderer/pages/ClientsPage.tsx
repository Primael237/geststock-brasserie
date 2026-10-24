import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Users, Plus, Search, Filter, Eye, Pencil, ArrowLeft, ChevronLeft, ChevronRight,
  ReceiptText, UserRound, Banknote, UserCheck,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface Client {
  id: string; name: string; phone: string; address: string;
  financial_balance: number; material_balance_crates: number; material_balance_bottles: number;
  created_at: string;
}
interface HistoryItem {
  id: string; type: string; date: string; label: string; amount: number; detail: string;
}
type StatusFilter = '' | 'debt' | 'ok' | 'credit';

const PAGE_SIZE = 10;
const fmt = (n: number) => (n || 0).toLocaleString('fr-FR');

function StatusBadge({ balance }: { balance: number }) {
  if (balance > 0) return <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-red-50 text-red-600 border border-red-100">En dette</span>;
  if (balance < 0) return <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-blue-50 text-blue-700 border border-blue-100">Avoir</span>;
  return <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-primary-50 text-primary-700 border border-primary-100">À jour</span>;
}

function KpiCard({ icon, iconBg, label, value, valueClass = 'text-gray-900' }: { icon: React.ReactNode; iconBg: string; label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-xl font-bold ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const { user } = useAuthStore();
  const location = useLocation();
  const [clients, setClients] = useState<Client[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [selected, setSelected] = useState<Client | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const isGerantOrAdmin = user?.role === 'super_admin' || user?.role === 'gerant';
  const isSuperAdmin = user?.role === 'super_admin';

  // Liste : recherche, filtre, pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);

  // Formulaires
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Client | null>(null);
  const [showRepay, setShowRepay] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '' });
  const [repayAmount, setRepayAmount] = useState(0);
  const [repayMethod, setRepayMethod] = useState('cash');
  const [returnCrates, setReturnCrates] = useState(0);
  const [returnBottles, setReturnBottles] = useState(0);

  const loadClients = async () => {
    const r = await window.electronAPI.listClients();
    if (r.success) setClients(r.clients);
    setLoading(false);
  };
  const loadRepayments = () => {
    (window.electronAPI as any).listClientRepayments?.().then((r: any) => { if (r.success) setRepayments(r.repayments); });
  };

  useEffect(() => {
    loadClients();
    loadRepayments();
    window.electronAPI.listSales().then(r => { if (r.success) setSales(r.sales); });
  }, []);

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

  // Date de la dernière vente validée par client
  const lastSaleByClient = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sales) {
      if (s.status !== 'active' || !s.client_id) continue;
      if (!map[s.client_id] || s.created_at > map[s.client_id]) map[s.client_id] = s.created_at;
    }
    return map;
  }, [sales]);

  const kpis = useMemo(() => {
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return {
      totalDebt: clients.reduce((s, c) => s + (c.financial_balance > 0 ? c.financial_balance : 0), 0),
      debtors: clients.filter(c => c.financial_balance > 0).length,
      paidThisMonth: repayments.filter(r => String(r.created_at || '').startsWith(monthPrefix)).reduce((s, r) => s + (r.amount || 0), 0),
      active: clients.length,
    };
  }, [clients, repayments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter(c => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.phone || '').toLowerCase().includes(q)) return false;
      if (statusFilter === 'debt') return c.financial_balance > 0;
      if (statusFilter === 'ok') return c.financial_balance === 0;
      if (statusFilter === 'credit') return c.financial_balance < 0;
      return true;
    });
  }, [clients, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

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

  const openEdit = (c: Client) => {
    setEditTarget(c);
    setEditForm({ name: c.name, phone: c.phone || '', address: c.address || '' });
    setError(''); setSuccess('');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editForm.name.trim()) { setError('Le nom est obligatoire.'); return; }
    setError('');
    const r = await window.electronAPI.updateClient(editTarget.id, {
      name: editForm.name.trim(), phone: editForm.phone.trim(), address: editForm.address.trim(),
    });
    if (r.success) {
      setSuccess('Client modifié.');
      setEditTarget(null);
      loadClients();
      if (selected?.id === editTarget.id) setSelected({ ...selected, ...r.client });
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
      loadRepayments();
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

  const messages = (
    <>
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">{success}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
    </>
  );

  return (
    <div className="space-y-6">
      {!selected ? (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users size={22} className="text-primary-700" /> Clients</h2>
              <p className="text-sm text-gray-500 mt-1">{clients.length} client(s)</p>
            </div>
            {isGerantOrAdmin && (
              <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-1.5"><Plus size={16} /> Nouveau client</button>
            )}
          </div>

          {messages}

          {/* Indicateurs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={<ReceiptText size={20} className="text-red-600" />} iconBg="bg-red-50" label="Total des créances" value={`${fmt(kpis.totalDebt)} FCFA`} valueClass="text-red-600" />
            <KpiCard icon={<UserRound size={20} className="text-blue-600" />} iconBg="bg-blue-50" label="Clients débiteurs" value={kpis.debtors} />
            <KpiCard icon={<Banknote size={20} className="text-primary-700" />} iconBg="bg-primary-50" label="Paiements reçus (ce mois)" value={`${fmt(kpis.paidThisMonth)} FCFA`} valueClass="text-primary-700" />
            <KpiCard icon={<UserCheck size={20} className="text-indigo-600" />} iconBg="bg-indigo-50" label="Clients actifs" value={kpis.active} />
          </div>

          {/* Tableau des clients */}
          <div className="card p-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" className="input-field pl-9" placeholder="Rechercher un client (nom, téléphone...)" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="relative">
                <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select className="input-field pl-8 w-48" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
                  <option value="">Tous les statuts</option>
                  <option value="debt">En dette</option>
                  <option value="ok">À jour</option>
                  <option value="credit">Avoir</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="py-3 px-4 font-medium">N°</th>
                    <th className="py-3 px-4 font-medium">Nom du client</th>
                    <th className="py-3 px-4 font-medium">Téléphone</th>
                    <th className="py-3 px-4 font-medium">Emballages dus</th>
                    <th className="py-3 px-4 font-medium">Solde / Dette</th>
                    <th className="py-3 px-4 font-medium">Statut</th>
                    <th className="py-3 px-4 font-medium">Dernière vente</th>
                    <th className="py-3 px-4 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-gray-400">{clients.length === 0 ? 'Aucun client.' : 'Aucun client ne correspond à la recherche.'}</td></tr>
                  ) : pageRows.map((c, i) => {
                    const last = lastSaleByClient[c.id];
                    const crates = c.material_balance_crates || 0; const bottles = c.material_balance_bottles || 0;
                    return (
                      <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-500">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                        <td className="py-3 px-4 font-semibold text-gray-900 uppercase">{c.name}</td>
                        <td className="py-3 px-4 text-gray-600">{c.phone || '—'}</td>
                        <td className="py-3 px-4 text-gray-600">{crates === 0 && bottles === 0 ? '—' : [crates ? `${crates} c` : '', bottles ? `${bottles} b` : ''].filter(Boolean).join(' + ')}</td>
                        <td className={`py-3 px-4 font-bold ${c.financial_balance > 0 ? 'text-red-600' : 'text-primary-700'}`}>{fmt(Math.abs(c.financial_balance))} FCFA</td>
                        <td className="py-3 px-4"><StatusBadge balance={c.financial_balance} /></td>
                        <td className="py-3 px-4 text-gray-600">{last ? new Date(last).toLocaleDateString('fr-FR') : '—'}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => selectClient(c)} title="Voir la fiche" className="p-1 text-gray-500 hover:text-primary-700"><Eye size={17} /></button>
                            {isGerantOrAdmin && <button onClick={() => openEdit(c)} title="Modifier" className="p-1 text-gray-500 hover:text-primary-700"><Pencil size={16} /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-500">
              <span>
                {filtered.length === 0 ? 'Aucun résultat' : `Affichage de ${(currentPage - 1) * PAGE_SIZE + 1} à ${Math.min(currentPage * PAGE_SIZE, filtered.length)} sur ${filtered.length} client(s)`}
              </span>
              <div className="flex items-center gap-1">
                <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={14} /></button>
                {Array.from({ length: pageCount }, (_, k) => k + 1).map(n => (
                  <button key={n} onClick={() => setPage(n)} className={`w-7 h-7 rounded text-xs font-semibold ${n === currentPage ? 'bg-primary-700 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>{n}</button>
                ))}
                <button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Fiche client */
        <div className="space-y-4">
          <button onClick={() => { setSelected(null); setError(''); setSuccess(''); }} className="text-sm font-semibold text-primary-700 hover:text-primary-800 flex items-center gap-1.5">
            <ArrowLeft size={16} /> Retour à la liste
          </button>

          {messages}

          {/* Infos client */}
          <div className="card">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">{selected.name} <StatusBadge balance={selected.financial_balance} /></h3>
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
                <button onClick={() => openEdit(selected)} className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1">
                  <Pencil size={12} /> Modifier
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

      {/* Modal Modification Client */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4">Modifier le client</h3>
            {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-2">{error}</div>}
            <form onSubmit={handleEdit} className="space-y-3">
              <input type="text" className="input-field" placeholder="Nom complet" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} required />
              <input type="text" className="input-field" placeholder="Téléphone" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
              <input type="text" className="input-field" placeholder="Adresse" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} />
              <div className="flex gap-2 justify-end pt-3">
                <button type="button" onClick={() => setEditTarget(null)} className="btn-secondary">Annuler</button>
                <button type="submit" className="btn-primary">Enregistrer</button>
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
