import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface Product {
  id: string; barcode: string; name: string; brewery_id: string; brewery_name: string;
  category: string; format: string; volume_cl: number; units_per_crate: number;
  buy_price_liquid: number; sell_price_liquid: number; consigne_amount: number;
  stock_full_crates: number; stock_loose_bottles: number; alert_threshold_crates: number;
  is_active: number;
}
interface Brewery { id: string; name: string; }

const CAT_LABELS: Record<string, string> = {
  bieres: '🍺 Bières', jus_sodas: '🧃 Jus/Sodas', eaux: '💧 Eaux',
  spiritueux_mix: '🍷 Spiritueux/Mix', energy_drinks: '⚡ Energy Drinks',
};
const FMT_LABELS: Record<string, string> = {
  verre_consigne: '🍾 Verre consigné', pet: '🫗 PET', canette: '🥫 Canette', fut: '🛢️ Fût',
};

export default function ProductsPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [breweries, setBreweries] = useState<Brewery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBrewery, setFilterBrewery] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Formulaires
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', brewery_id: '', category: 'bieres', format: 'verre_consigne', volume_cl: 65, units_per_crate: 24, buy_price_liquid: 0, sell_price_liquid: 0, consigne_amount: 0, alert_threshold_crates: 5, barcode: '' });
  const [showBreweryForm, setShowBreweryForm] = useState(false);
  const [breweryName, setBreweryName] = useState('');

  const isSuperAdmin = user?.role === 'super_admin';
  const isGerantOrAdmin = user?.role === 'super_admin' || user?.role === 'gerant';

  const loadData = async () => {
    const [pr, br] = await Promise.all([
      window.electronAPI.listProducts(),
      (window.electronAPI as any).listBreweries?.() || Promise.resolve({ success: true, breweries: [] }),
    ]);
    if (pr.success) setProducts(pr.products);
    if (br.success) setBreweries(br.breweries);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = products.filter(p => {
    if (filterBrewery && p.brewery_id !== filterBrewery) return false;
    if (filterCat && p.category !== filterCat) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const alertCount = products.filter(p => p.stock_full_crates + p.stock_loose_bottles <= p.alert_threshold_crates).length;

  const openCreate = () => { setEditingId(null); setForm({ name: '', brewery_id: breweries[0]?.id || '', category: 'bieres', format: 'verre_consigne', volume_cl: 65, units_per_crate: 24, buy_price_liquid: 0, sell_price_liquid: 0, consigne_amount: 0, alert_threshold_crates: 5, barcode: '' }); setShowForm(true); };
  const openEdit = (p: Product) => { setEditingId(p.id); setForm({ name: p.name, brewery_id: p.brewery_id, category: p.category, format: p.format, volume_cl: p.volume_cl, units_per_crate: p.units_per_crate, buy_price_liquid: p.buy_price_liquid, sell_price_liquid: p.sell_price_liquid, consigne_amount: p.consigne_amount || 0, alert_threshold_crates: p.alert_threshold_crates, barcode: p.barcode || '' }); setShowForm(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    const r = editingId
      ? await window.electronAPI.updateProduct(editingId, form)
      : await window.electronAPI.createProduct(form);
    if (r.success) { setSuccess(editingId ? 'Produit modifié !' : 'Produit créé !'); setShowForm(false); loadData(); }
    else setError(r.error);
  };

  const handleBreweryCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    const r = await (window.electronAPI as any).createBrewery?.(breweryName) || { success: false, error: 'Non disponible' };
    if (r.success) { setSuccess('Brasserie créée !'); setShowBreweryForm(false); setBreweryName(''); loadData(); }
    else setError(r.error);
  };

  if (loading) return <div className="p-6 text-gray-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📦 Catalogue Produits</h2>
          <p className="text-sm text-gray-500 mt-1">{products.length} produit(s) · {alertCount} alerte(s)</p>
        </div>
        <div className="flex gap-2">
          {isSuperAdmin && <button onClick={() => setShowBreweryForm(true)} className="btn-secondary text-sm">+ Brasserie</button>}
          {isSuperAdmin && <button onClick={openCreate} className="btn-primary text-sm">+ Produit</button>}
          {isGerantOrAdmin && !isSuperAdmin && <span className="text-xs text-gray-400 self-center">Lecture seule (Gérant)</span>}
        </div>
      </div>

      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">{success}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {/* Filtres */}
      <div className="card flex flex-wrap gap-3 items-center">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher..." className="input-field w-56" />
        <select value={filterBrewery} onChange={e => setFilterBrewery(e.target.value)} className="input-field w-52">
          <option value="">Toutes brasseries</option>
          {breweries.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="input-field w-40">
          <option value="">Toutes catégories</option>
          {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} résultat(s)</span>
      </div>

      {/* Tableau */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 px-2">Produit</th><th className="py-2 px-2">Brasserie</th>
              <th className="py-2 px-2">Cat.</th><th className="py-2 px-2">Format</th>
              <th className="py-2 px-2 text-center">Vol.</th>
              <th className="py-2 px-2 text-right">Consigne</th>
              <th className="py-2 px-2 text-center">Casiers</th>
              <th className="py-2 px-2 text-right">Achat</th><th className="py-2 px-2 text-right">Vente</th><th className="py-2 px-2 text-right">Marge</th>
              <th className="py-2 px-2">Alerte</th>
              {isGerantOrAdmin && <th className="py-2 px-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const totalUnits = p.stock_full_crates * p.units_per_crate + p.stock_loose_bottles;
              const alertLow = totalUnits <= p.alert_threshold_crates * p.units_per_crate;
              return (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2 font-medium">{p.name}</td>
                  <td className="py-2 px-2 text-xs text-gray-500">{p.brewery_name}</td>
                  <td className="py-2 px-2 text-xs">{CAT_LABELS[p.category]?.split(' ')[0]}</td>
                  <td className="py-2 px-2 text-xs">{FMT_LABELS[p.format] || p.format}</td>
                  <td className="py-2 px-2 text-center text-xs">{p.volume_cl}cl</td>
                  <td className="py-2 px-2 text-right text-xs text-gray-500">{p.consigne_amount || 0} F</td>
                  <td className="py-2 px-2 text-center font-bold">{p.stock_full_crates}</td>
                  <td className="py-2 px-2 text-right text-xs">{p.buy_price_liquid} F</td>
                  <td className="py-2 px-2 text-right font-medium">{p.sell_price_liquid} F</td>
                  <td className="py-2 px-2 text-right text-xs"><span className={p.sell_price_liquid>p.buy_price_liquid?'text-green-600':'text-red-600'}>{(p.sell_price_liquid-p.buy_price_liquid).toLocaleString()} F ({p.buy_price_liquid>0?Math.round((p.sell_price_liquid-p.buy_price_liquid)/p.buy_price_liquid*100):0}%)</span></td>
                  <td className="py-2 px-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${alertLow ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                      {alertLow ? '⚠️ Bas' : '✅ OK'}
                    </span>
                  </td>
                  {isGerantOrAdmin && (
                    <td className="py-2 px-2 text-right">
                      <div className="flex gap-1 justify-end">
                        {isSuperAdmin && <button onClick={() => openEdit(p)} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">✏️</button>}
                        <button onClick={() => navigate('/inventory', { state: { openEntryFor: p.id } })} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded">+ Stock</button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Produit */}
      {showForm && isSuperAdmin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editingId ? 'Modifier' : 'Nouveau'} Produit</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <input className="input-field" placeholder="Nom" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              <div className="grid grid-cols-2 gap-3">
                <select className="input-field" value={form.brewery_id} onChange={e => setForm({...form, brewery_id: e.target.value})} required>
                  <option value="">Brasserie</option>
                  {breweries.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select className="input-field" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                  {Object.entries(CAT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className="input-field" value={form.format} onChange={e => setForm({...form, format: e.target.value})}>
                  {Object.entries(FMT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="number" className="input-field" placeholder="Volume (cl)" value={form.volume_cl} onChange={e => setForm({...form, volume_cl: +e.target.value})} />
                <input type="number" className="input-field" placeholder="Unités/casier" value={form.units_per_crate} onChange={e => setForm({...form, units_per_crate: +e.target.value})} />
                <input type="number" className="input-field" placeholder="Prix achat" value={form.buy_price_liquid} onChange={e => setForm({...form, buy_price_liquid: +e.target.value})} />
                <input type="number" className="input-field" placeholder="Prix vente" value={form.sell_price_liquid} onChange={e => setForm({...form, sell_price_liquid: +e.target.value})} />
                <input type="number" className="input-field" placeholder="Consignation (par casier)" value={form.consigne_amount} onChange={e => setForm({...form, consigne_amount: +e.target.value})} />
                <input type="number" className="input-field" placeholder="Seuil alerte (casiers)" value={form.alert_threshold_crates} onChange={e => setForm({...form, alert_threshold_crates: +e.target.value})} />
              </div>
              <div className="flex gap-2 justify-end pt-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Annuler</button>
                <button type="submit" className="btn-primary">{editingId ? 'Modifier' : 'Créer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bouton Décasser/Reconstituer */}
      {isGerantOrAdmin && (
        <div className="card mt-4">
          <h3 className="text-sm font-bold mb-2">🔄 Décasser / Reconstituer</h3>
          <p className="text-xs text-gray-500 mb-2">Convertir des casiers pleins en bouteilles nues (ou l'inverse).</p>
          <button onClick={async () => {
            const pid = prompt('ID du produit (copiez depuis le tableau)');
            if (!pid) return;
            const action = prompt('Action: "decasser" (casier→bouteilles) ou "reconstituer" (bouteilles→casier)');
            const qty = parseInt(prompt('Nombre de casiers à convertir') || '0');
            if (!qty || qty <= 0) return;
            const prod = products.find(p => p.id === pid);
            if (!prod) { setError('Produit introuvable'); return; }
            if (action === 'decasser') {
              if (prod.stock_full_crates < qty) { setError('Pas assez de casiers'); return; }
              await window.electronAPI.updateProduct(pid, { stock_full_crates: prod.stock_full_crates - qty, stock_loose_bottles: prod.stock_loose_bottles + (qty * prod.units_per_crate) });
            } else {
              const needed = qty * prod.units_per_crate;
              if (prod.stock_loose_bottles < needed) { setError('Pas assez de bouteilles nues'); return; }
              await window.electronAPI.updateProduct(pid, { stock_full_crates: prod.stock_full_crates + qty, stock_loose_bottles: prod.stock_loose_bottles - needed });
            }
            setSuccess('Conversion effectuée !'); loadData();
          }} className="btn-secondary text-sm">⚡ Convertir</button>
        </div>
      )}

      {/* Modal Brasserie */}
      {showBreweryForm && isSuperAdmin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4">Nouvelle Brasserie</h3>
            <form onSubmit={handleBreweryCreate} className="space-y-3">
              <input className="input-field" placeholder="Nom" value={breweryName} onChange={e => setBreweryName(e.target.value)} required />
              <div className="flex gap-2 justify-end"><button type="button" onClick={() => setShowBreweryForm(false)} className="btn-secondary">Annuler</button><button type="submit" className="btn-primary">Créer</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}