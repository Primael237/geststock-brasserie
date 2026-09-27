import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { buildInventoryA4Html } from '../utils/print';
import {
  Search, Plus, Download, Package, AlertTriangle, XCircle, Archive, Bell,
  Eye, ArrowUpCircle, ArrowDownCircle, Pencil, RotateCcw, MoreVertical, X, FileText, Printer,
} from 'lucide-react';

const CAT_LABELS: Record<string, string> = {
  bieres: 'Bières', jus_sodas: 'Jus/Sodas', eaux: 'Eaux',
  spiritueux_mix: 'Spiritueux/Mix', energy_drinks: 'Energy Drinks',
};

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
}

export default function InventoryPage() {
  const { user } = useAuthStore();
  const { depotName } = useSettingsStore();
  const location = useLocation();
  const navigate = useNavigate();
  const isGA = user?.role === 'super_admin' || user?.role === 'gerant';
  const isSA = user?.role === 'super_admin';

  const [products, setProducts] = useState<any[]>([]);
  const [breweries, setBreweries] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  // Filtres
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterBrewery, setFilterBrewery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>((location.state as any)?.statusFilter || '');
  const [page, setPage] = useState(1);
  const perPage = 10;

  // Modales
  const [showEntry, setShowEntry] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [showHistory, setShowHistory] = useState<any>(null);
  const [showA4, setShowA4] = useState(false);
  const [a4Brewery, setA4Brewery] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [physCounts, setPhysCounts] = useState<Record<string, { crates: number; bottles: number }>>({});
  const [printers, setPrinters] = useState<any[]>([]); const [selectedPrinter, setSelectedPrinter] = useState('');
  const [printing, setPrinting] = useState(false); const [printErr, setPrintErr] = useState('');

  const [formProd, setFormProd] = useState('');
  const [formCrates, setFormCrates] = useState(0);
  const [formBottles, setFormBottles] = useState(0);
  const [formMotif, setFormMotif] = useState('');
  const [formBL, setFormBL] = useState('');
  const [adjustCrates, setAdjustCrates] = useState(0);
  const [adjustBottles, setAdjustBottles] = useState(0);

  const load = async () => {
    const [pr, br, pm] = await Promise.all([
      window.electronAPI.listProducts(),
      (window.electronAPI as any).listBreweries?.() || Promise.resolve({ success: true, breweries: [] }),
      window.electronAPI.listPackagingMovements(),
    ]);
    if (pr.success) setProducts(pr.products);
    if (br.success) setBreweries(br.breweries);
    if (pm.success) setMovements(pm.movements);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    (window.electronAPI as any).getPrinters?.().then((r: any) => {
      if (r.success) { setPrinters(r.printers); const def = r.printers.find((p: any) => p.isDefault) || r.printers[0]; if (def) setSelectedPrinter(def.name); }
    });
  }, []);

  const openA4 = () => {
    const init: Record<string, { crates: number; bottles: number }> = {};
    products.forEach(p => { init[p.id] = { crates: p.stock_full_crates, bottles: p.stock_loose_bottles }; });
    setPhysCounts(init);
    setShowA4(true);
  };

  const printInventorySheet = async () => {
    setPrintErr(''); setPrinting(true);
    const rows = filteredA4.map(p => {
      const phys = physCounts[p.id] || { crates: p.stock_full_crates, bottles: p.stock_loose_bottles };
      return {
        code: p.id?.slice(0, 8) || '', name: p.name, breweryName: p.brewery_name, format: p.format,
        theoCrates: p.stock_full_crates, theoBottles: p.stock_loose_bottles,
        physCrates: phys.crates, physBottles: phys.bottles,
      };
    });
    const html = buildInventoryA4Html(depotName, a4Brewery ? `Brasserie : ${a4Brewery}` : 'Toutes brasseries', rows);
    const r = await (window.electronAPI as any).printHtml({ html, pageSize: 'A4', deviceName: selectedPrinter || undefined });
    setPrinting(false);
    if (!r.success) setPrintErr(r.error || "Erreur d'impression.");
  };

  // Arrivée depuis une autre page (Produits: "+ Stock", Dashboard: alertes critiques)
  useEffect(() => {
    const state = location.state as any;
    if (state?.openEntryFor) { setFormProd(state.openEntryFor); setShowEntry(true); }
    if (state?.statusFilter) setFilterStatus(state.statusFilter);
    if (state?.openEntryFor || state?.statusFilter) navigate(location.pathname, { replace: true });
  }, []);

  const stockStatus = (p: any) => {
    const totalUnits = p.stock_full_crates * p.units_per_crate + p.stock_loose_bottles;
    if (totalUnits === 0) return 'rupture';
    if (totalUnits <= p.alert_threshold_crates * p.units_per_crate) return 'faible';
    return 'normal';
  };

  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat && p.category !== filterCat) return false;
    if (filterBrewery && p.brewery_id !== filterBrewery) return false;
    if (filterStatus === 'alerte' && stockStatus(p) === 'normal') return false;
    if (filterStatus && filterStatus !== 'alerte' && stockStatus(p) !== filterStatus) return false;
    return true;
  });
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  // KPIs
  const kpiProductsInStock = products.length;
  const kpiEmballages = movements.filter((m: any) => m.type === 'restitution').reduce((s: number, m: any) => s + (m.quantity_crates || 0), 0);
  const kpiFaible = products.filter(p => stockStatus(p) === 'faible').length;
  const kpiRupture = products.filter(p => stockStatus(p) === 'rupture').length;
  const kpiValeur = products.reduce((s, p) => s + p.stock_full_crates * p.buy_price_liquid + p.stock_loose_bottles * (p.buy_price_liquid / (p.units_per_crate || 1)), 0);

  const productMovements = (productId: string) => movements.filter((m: any) => m.product_id === productId).slice(0, 15);

  const resetForm = () => { setFormProd(''); setFormCrates(0); setFormBottles(0); setFormMotif(''); setFormBL(''); };

  const handleEntry = async () => {
    if (!formProd || (formCrates <= 0 && formBottles <= 0)) { setErr('Sélectionnez un produit et une quantité.'); return; }
    setErr('');
    const r = await window.electronAPI.stockEntry({ product_id: formProd, quantity_crates: formCrates, quantity_loose: formBottles, bl_number: formBL });
    if (r.success) { setOk('Entrée de stock enregistrée.'); setShowEntry(false); resetForm(); load(); }
    else setErr(r.error);
  };

  const handleExit = async () => {
    if (!formProd || (formCrates <= 0 && formBottles <= 0) || !formMotif) { setErr('Tous les champs sont requis.'); return; }
    setErr('');
    const p = products.find(x => x.id === formProd);
    if (!p) return;
    if (formCrates > p.stock_full_crates || formBottles > p.stock_loose_bottles) { setErr('Stock insuffisant pour cette sortie.'); return; }

    if (formMotif === 'Casse / Avarie') {
      const r = await window.electronAPI.createDamage({ product_id: formProd, quantity_liquid: formBottles, quantity_crates: formCrates, quantity_bottles: 0, comment: 'Casse / Avarie (Inventaire)' });
      if (!r.success) { setErr(r.error); return; }
    } else {
      const r = await window.electronAPI.updateProduct(formProd, {
        stock_full_crates: p.stock_full_crates - formCrates,
        stock_loose_bottles: p.stock_loose_bottles - formBottles,
      });
      if (!r.success) { setErr(r.error); return; }
      await window.electronAPI.createPackagingMovement({
        client_id: null, product_id: formProd, type: 'sortie',
        quantity_crates: formCrates, quantity_bottles: formBottles, comment: `Sortie de stock — ${formMotif}`,
      });
    }
    setOk(`Sortie enregistrée : -${formCrates} casier(s), -${formBottles} bouteille(s).`);
    setShowExit(false); resetForm(); load();
  };

  const openAdjust = (p: any) => { setFormProd(p.id); setAdjustCrates(p.stock_full_crates); setAdjustBottles(p.stock_loose_bottles); setShowAdjust(true); };
  const handleAdjust = async () => {
    const p = products.find(x => x.id === formProd);
    if (!p) return;
    setErr('');
    const deltaCrates = adjustCrates - p.stock_full_crates;
    const deltaBottles = adjustBottles - p.stock_loose_bottles;
    const r = await window.electronAPI.updateProduct(formProd, { stock_full_crates: adjustCrates, stock_loose_bottles: adjustBottles });
    if (!r.success) { setErr(r.error); return; }
    if (deltaCrates !== 0 || deltaBottles !== 0) {
      await window.electronAPI.createPackagingMovement({
        client_id: null, product_id: formProd, type: (deltaCrates + deltaBottles) >= 0 ? 'entree' : 'sortie',
        quantity_crates: Math.abs(deltaCrates), quantity_bottles: Math.abs(deltaBottles),
        comment: `Ajustement inventaire (${deltaCrates >= 0 ? '+' : ''}${deltaCrates}c / ${deltaBottles >= 0 ? '+' : ''}${deltaBottles}u)`,
      });
    }
    setOk('Stock ajusté.'); setShowAdjust(false); resetForm(); load();
  };

  const handleEditThreshold = async (p: any) => {
    const v = window.prompt(`Nouveau seuil d'alerte (en casiers) pour ${p.name}`, String(p.alert_threshold_crates));
    if (v === null) return;
    const n = parseInt(v);
    if (isNaN(n) || n < 0) { setErr('Valeur invalide.'); return; }
    const r = await window.electronAPI.updateProduct(p.id, { alert_threshold_crates: n });
    if (r.success) { setOk('Seuil mis à jour.'); load(); } else setErr(r.error);
  };

  const handleDeactivate = async (p: any) => {
    if (!confirm(`Désactiver ${p.name} ? Il n'apparaîtra plus dans les ventes.`)) return;
    const r = await window.electronAPI.deleteProduct(p.id);
    if (r.success) { setOk('Produit désactivé.'); load(); } else setErr(r.error);
    setOpenMenu(null);
  };

  const exportCsv = () => {
    const header = ['Produit', 'Categorie', 'Fournisseur', 'Stock casiers', 'Stock bouteilles', 'Stock min (casiers)', 'Cout unitaire', 'Valeur totale', 'Etat'];
    const rows = filtered.map(p => [
      p.name, CAT_LABELS[p.category] || p.category, p.brewery_name, p.stock_full_crates, p.stock_loose_bottles,
      p.alert_threshold_crates, p.buy_price_liquid, Math.round(p.stock_full_crates * p.buy_price_liquid + p.stock_loose_bottles * (p.buy_price_liquid / (p.units_per_crate || 1))),
      stockStatus(p),
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `inventaire-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filteredA4 = a4Brewery ? products.filter(p => p.brewery_name === a4Brewery) : products;
  const breweryList = [...new Set(products.map(p => p.brewery_name))];

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Inventaire</h2>
          <p className="text-xs text-gray-400">{filtered.length} produit(s)</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button title={`${kpiRupture + kpiFaible} alerte(s) stock`} className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <Bell size={18} />
            {(kpiRupture + kpiFaible) > 0 && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{kpiRupture + kpiFaible}</span>}
          </button>
          <div title={user?.full_name || user?.username} className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
            {initials(user?.full_name || user?.username || '?')}
          </div>
        </div>
      </div>

      {err && <div className="bg-red-50 border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}
      {ok && <div className="bg-green-50 border-green-200 text-green-700 text-sm rounded-lg p-3">{ok}</div>}

      {/* Filtres */}
      <div className="card flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-gray-400">Recherche</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Rechercher un produit..." className="input-field text-sm !pl-9" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400">Catégorie</label>
          <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }} className="input-field text-sm w-40">
            <option value="">Toutes</option>
            {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Dépôt</label>
          <select disabled className="input-field text-sm w-40 opacity-60 cursor-not-allowed" title="Un seul dépôt configuré pour le moment">
            <option>Dépôt principal</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Fournisseur</label>
          <select value={filterBrewery} onChange={e => { setFilterBrewery(e.target.value); setPage(1); }} className="input-field text-sm w-44">
            <option value="">Tous</option>
            {breweries.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">État</label>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="input-field text-sm w-36">
            <option value="">Tous</option>
            <option value="normal">Normal</option>
            <option value="faible">Faible</option>
            <option value="rupture">Rupture</option>
            <option value="alerte">Faible + Rupture</option>
          </select>
        </div>
        <button onClick={openA4} className="btn-primary flex items-center gap-2 text-sm py-2"><Plus size={15} /> Nouvel inventaire</button>
        <button onClick={exportCsv} className="btn-secondary flex items-center gap-2 text-sm py-2"><Download size={15} /> Exporter</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="card">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 mb-2"><Package size={20} /></div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Produits en stock</p>
          <p className="text-2xl font-bold text-gray-900">{kpiProductsInStock}</p>
          <p className="text-[11px] text-gray-400">Tous produits disponibles</p>
        </div>
        <div className="card">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600 mb-2"><Archive size={20} /></div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Emballages en stock</p>
          <p className="text-2xl font-bold text-gray-900">{kpiEmballages}</p>
          <p className="text-[11px] text-gray-400">Casiers vides récupérés (ventes)</p>
        </div>
        <div className="card">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-50 text-orange-600 mb-2"><AlertTriangle size={20} /></div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Stock faible</p>
          <p className="text-2xl font-bold text-gray-900">{kpiFaible}</p>
          <p className="text-[11px] text-gray-400">Produits sous le seuil minimum</p>
        </div>
        <div className="card">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-50 text-red-600 mb-2"><XCircle size={20} /></div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Rupture de stock</p>
          <p className="text-2xl font-bold text-gray-900">{kpiRupture}</p>
          <p className="text-[11px] text-gray-400">Produits en rupture</p>
        </div>
        <div className="card">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 mb-2"><Package size={20} /></div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Valeur totale du stock</p>
          <p className="text-2xl font-bold text-gray-900">{Math.round(kpiValeur).toLocaleString()} <span className="text-sm font-normal">FCFA</span></p>
          <p className="text-[11px] text-gray-400">Valeur au coût d'achat</p>
        </div>
      </div>

      {/* Tableau */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-sm">Liste des produits en inventaire</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500 bg-gray-50">
              <th className="py-2 px-3">#</th><th className="px-2">Produit</th><th className="px-2">Catégorie</th>
              <th className="px-2 text-center">Stock actuel</th><th className="px-2 text-center">Stock min.</th>
              <th className="px-2">Unité</th><th className="px-2 text-right">Coût unitaire</th>
              <th className="px-2 text-right">Valeur totale</th><th className="px-2 text-center">État</th>
              <th className="px-2 text-right">Actions</th>
            </tr></thead>
            <tbody>
              {paged.map((p, i) => {
                const status = stockStatus(p);
                const value = p.stock_full_crates * p.buy_price_liquid + p.stock_loose_bottles * (p.buy_price_liquid / (p.units_per_crate || 1));
                return (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3 text-xs text-gray-400">{(page - 1) * perPage + i + 1}</td>
                    <td className="px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold shrink-0">{initials(p.name)}</div>
                        <div><p className="font-medium text-xs">{p.name}</p><p className="text-[10px] text-gray-400">{p.brewery_name}</p></div>
                      </div>
                    </td>
                    <td className="px-2 text-xs">{CAT_LABELS[p.category] || p.category}</td>
                    <td className="px-2 text-center"><span className="font-bold">{p.stock_full_crates}</span><span className="text-gray-400 text-xs"> c</span>{p.stock_loose_bottles > 0 && <span className="text-gray-400 text-xs"> + {p.stock_loose_bottles}u</span>}</td>
                    <td className="px-2 text-center text-xs text-gray-500">{p.alert_threshold_crates}</td>
                    <td className="px-2 text-xs">Casier</td>
                    <td className="px-2 text-right text-xs">{p.buy_price_liquid.toLocaleString()} F</td>
                    <td className="px-2 text-right text-xs font-medium">{Math.round(value).toLocaleString()} F</td>
                    <td className="px-2 text-center">
                      <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${status === 'normal' ? 'bg-green-100 text-green-800' : status === 'faible' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                        {status === 'normal' ? 'Normal' : status === 'faible' ? 'Faible' : 'Rupture'}
                      </span>
                    </td>
                    <td className="px-2">
                      <div className="flex items-center justify-end gap-0.5 relative">
                        <button title="Voir" onClick={() => setShowDetail(p)} className="p-1.5 rounded hover:bg-gray-200 text-gray-500"><Eye size={14} /></button>
                        {isGA && <button title="Entrée de stock" onClick={() => { setFormProd(p.id); setShowEntry(true); }} className="p-1.5 rounded hover:bg-green-100 text-green-600"><ArrowUpCircle size={14} /></button>}
                        {isGA && <button title="Sortie de stock" onClick={() => { setFormProd(p.id); setShowExit(true); }} className="p-1.5 rounded hover:bg-red-100 text-red-600"><ArrowDownCircle size={14} /></button>}
                        {isSA && <button title="Modifier seuil" onClick={() => handleEditThreshold(p)} className="p-1.5 rounded hover:bg-gray-200 text-gray-500"><Pencil size={14} /></button>}
                        <button title="Historique" onClick={() => setShowHistory(p)} className="p-1.5 rounded hover:bg-gray-200 text-gray-500"><RotateCcw size={14} /></button>
                        {isSA && (
                          <button title="Plus" onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)} className="p-1.5 rounded hover:bg-gray-200 text-gray-500"><MoreVertical size={14} /></button>
                        )}
                        {openMenu === p.id && (
                          <div className="absolute right-0 top-8 bg-white border rounded-lg shadow-lg z-10 py-1 w-44">
                            <button onClick={() => openAdjust(p)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">Ajuster ce produit</button>
                            <button onClick={() => handleDeactivate(p)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 text-red-600">Désactiver le produit</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-gray-400">Aucun produit.</td></tr>}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-gray-500">
          <span>Affichage de {filtered.length === 0 ? 0 : (page - 1) * perPage + 1} à {Math.min(page * perPage, filtered.length)} sur {filtered.length} élément(s)</span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-2 py-1 rounded border disabled:opacity-40">Précédent</button>
            <span className="px-2">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-2 py-1 rounded border disabled:opacity-40">Suivant</button>
          </div>
        </div>
      </div>

      {/* Actions rapides + Légende */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isGA && (
          <div className="card">
            <h4 className="text-sm font-bold text-gray-500 mb-3">Actions rapides</h4>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowEntry(true)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100"><ArrowUpCircle size={14} /> Entrée de stock</button>
              <button onClick={() => setShowExit(true)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"><ArrowDownCircle size={14} /> Sortie de stock</button>
              <button onClick={() => { const first = products[0]; if (first) openAdjust(first); }} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"><Pencil size={14} /> Ajustement de stock</button>
              <button onClick={() => setOk("Un seul dépôt est configuré pour le moment — le transfert entre dépôts sera disponible avec la gestion multi-dépôts.")} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100">↔ Transfert entre dépôts</button>
            </div>
          </div>
        )}
        <div className="card">
          <h4 className="text-sm font-bold text-gray-500 mb-3">Légende des états</h4>
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Normal : stock suffisant</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Faible : stock inférieur au minimum</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Rupture : aucun stock disponible</div>
          </div>
        </div>
      </div>

      {/* Modal Entrée de stock */}
      {showEntry && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold flex items-center gap-2"><ArrowUpCircle size={18} className="text-green-600" /> Entrée de stock</h3><button onClick={() => { setShowEntry(false); resetForm(); }}><X size={18} /></button></div>
            <div className="space-y-3">
              <select className="input-field" value={formProd} onChange={e => setFormProd(e.target.value)}><option value="">Produit</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.stock_full_crates}c)</option>)}</select>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500">Casiers reçus</label><input type="number" className="input-field" value={formCrates || ''} onChange={e => setFormCrates(+e.target.value)} /></div>
                <div><label className="text-xs text-gray-500">Bouteilles nues</label><input type="number" className="input-field" value={formBottles || ''} onChange={e => setFormBottles(+e.target.value)} /></div>
              </div>
              <input type="text" className="input-field" placeholder="N° BL (optionnel)" value={formBL} onChange={e => setFormBL(e.target.value)} />
              <div className="flex gap-2 justify-end pt-2"><button onClick={() => { setShowEntry(false); resetForm(); }} className="btn-secondary">Annuler</button><button onClick={handleEntry} className="btn-primary">Enregistrer</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sortie de stock */}
      {showExit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold flex items-center gap-2"><ArrowDownCircle size={18} className="text-red-600" /> Sortie de stock</h3><button onClick={() => { setShowExit(false); resetForm(); }}><X size={18} /></button></div>
            <div className="space-y-3">
              <select className="input-field" value={formProd} onChange={e => setFormProd(e.target.value)}><option value="">Produit</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.stock_full_crates}c)</option>)}</select>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500">Casiers sortis</label><input type="number" className="input-field" value={formCrates || ''} onChange={e => setFormCrates(+e.target.value)} /></div>
                <div><label className="text-xs text-gray-500">Bouteilles nues</label><input type="number" className="input-field" value={formBottles || ''} onChange={e => setFormBottles(+e.target.value)} /></div>
              </div>
              <select className="input-field" value={formMotif} onChange={e => setFormMotif(e.target.value)}>
                <option value="">Motif</option>
                <option value="Casse / Avarie">Casse / Avarie</option>
                <option value="Transfert vers un autre point de vente">Transfert vers un autre point de vente</option>
                <option value="Retour au fournisseur">Retour au fournisseur</option>
                <option value="Usage interne">Usage interne</option>
                <option value="Autre">Autre</option>
              </select>
              <div className="flex gap-2 justify-end pt-2"><button onClick={() => { setShowExit(false); resetForm(); }} className="btn-secondary">Annuler</button><button onClick={handleExit} className="btn-danger">Enregistrer</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajustement de stock */}
      {showAdjust && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold flex items-center gap-2"><Pencil size={18} className="text-blue-600" /> Ajustement de stock</h3><button onClick={() => { setShowAdjust(false); resetForm(); }}><X size={18} /></button></div>
            <div className="space-y-3">
              <select className="input-field" value={formProd} onChange={e => { const p = products.find(x => x.id === e.target.value); setFormProd(e.target.value); if (p) { setAdjustCrates(p.stock_full_crates); setAdjustBottles(p.stock_loose_bottles); } }}>
                <option value="">Produit</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-xs text-gray-400">Entrez le stock physique réellement compté. L'écart avec le stock système sera journalisé.</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-500">Casiers comptés</label><input type="number" className="input-field" value={adjustCrates} onChange={e => setAdjustCrates(+e.target.value)} /></div>
                <div><label className="text-xs text-gray-500">Bouteilles comptées</label><input type="number" className="input-field" value={adjustBottles} onChange={e => setAdjustBottles(+e.target.value)} /></div>
              </div>
              <div className="flex gap-2 justify-end pt-2"><button onClick={() => { setShowAdjust(false); resetForm(); }} className="btn-secondary">Annuler</button><button onClick={handleAdjust} className="btn-primary" disabled={!formProd}>Valider</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Détail produit */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDetail(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4"><h3 className="text-lg font-bold">{showDetail.name}</h3><button onClick={() => setShowDetail(null)}><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><p className="text-gray-400">Fournisseur</p><p className="font-medium">{showDetail.brewery_name}</p></div>
              <div><p className="text-gray-400">Catégorie</p><p className="font-medium">{CAT_LABELS[showDetail.category] || showDetail.category}</p></div>
              <div><p className="text-gray-400">Format</p><p className="font-medium">{showDetail.format} · {showDetail.volume_cl}cl</p></div>
              <div><p className="text-gray-400">Unités/casier</p><p className="font-medium">{showDetail.units_per_crate}</p></div>
              <div><p className="text-gray-400">Stock</p><p className="font-medium">{showDetail.stock_full_crates} casiers + {showDetail.stock_loose_bottles} bout.</p></div>
              <div><p className="text-gray-400">Seuil alerte</p><p className="font-medium">{showDetail.alert_threshold_crates} casiers</p></div>
              <div><p className="text-gray-400">Prix achat (casier)</p><p className="font-medium">{showDetail.buy_price_liquid.toLocaleString()} F</p></div>
              <div><p className="text-gray-400">Prix vente (casier)</p><p className="font-medium">{showDetail.sell_price_liquid.toLocaleString()} F</p></div>
              <div><p className="text-gray-400">Consigne (casier)</p><p className="font-medium">{showDetail.consigne_amount?.toLocaleString() || 0} F</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historique produit */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowHistory(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4"><h3 className="text-lg font-bold flex items-center gap-2"><RotateCcw size={16} /> Historique — {showHistory.name}</h3><button onClick={() => setShowHistory(null)}><X size={18} /></button></div>
            {productMovements(showHistory.id).length === 0 ? <p className="text-sm text-gray-400">Aucun mouvement enregistré.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-gray-400"><th className="py-1">Date</th><th>Type</th><th className="text-center">Casiers</th><th className="text-center">Bout.</th><th>Commentaire</th></tr></thead>
                <tbody>{productMovements(showHistory.id).map((m: any) => (
                  <tr key={m.id} className="border-b"><td className="py-1">{new Date(m.created_at).toLocaleString('fr-FR')}</td><td>{m.type}</td><td className="text-center">{m.quantity_crates}</td><td className="text-center">{m.quantity_bottles}</td><td className="text-gray-500">{m.comment}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Fiche A4 (Nouvel inventaire) */}
      {showA4 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowA4(false)}>
          <div className="bg-white w-[820px] max-h-[85vh] overflow-y-auto p-8 shadow-2xl text-sm" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between border-b pb-4 mb-4">
              <div><h2 className="text-xl font-bold flex items-center gap-2"><FileText size={18} /> FICHE D'INVENTAIRE</h2><p className="text-xs">Dépôt {depotName}</p></div>
              <div className="text-right text-xs"><p>Date: {new Date().toLocaleString('fr-FR')}</p><select value={a4Brewery} onChange={e => setA4Brewery(e.target.value)} className="border rounded px-1 text-xs mt-1"><option value="">Toutes brasseries</option>{breweryList.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
            </div>
            <p className="text-xs text-gray-400 mb-2">Saisissez le stock physique compté ci-dessous : l'écart par rapport au stock théorique (déjà ajusté des ventes) se calcule automatiquement.</p>
            <table className="w-full text-[10px]"><thead><tr className="border-b"><th className="text-left py-1">Code</th><th className="text-left">Produit</th><th className="text-left">Brasserie</th><th>Format</th><th className="text-center">Stock Théorique</th><th className="text-center">Stock Physique Compté</th><th>Écart</th></tr></thead>
              <tbody>{filteredA4.map(p => {
                const phys = physCounts[p.id] || { crates: p.stock_full_crates, bottles: p.stock_loose_bottles };
                const ecartCrates = phys.crates - p.stock_full_crates;
                const ecartBottles = phys.bottles - p.stock_loose_bottles;
                const hasEcart = ecartCrates !== 0 || ecartBottles !== 0;
                return (
                  <tr key={p.id} className="border-b">
                    <td className="py-1 text-[9px]">{p.id?.slice(0, 8)}</td>
                    <td className="text-[10px]">{p.name}</td>
                    <td className="text-[10px]">{p.brewery_name}</td>
                    <td className="text-[10px]">{p.format}</td>
                    <td className="text-center">{p.stock_full_crates}c / {p.stock_loose_bottles}u</td>
                    <td className="text-center border-l border-r px-1 py-1.5">
                      <div className="flex items-center justify-center gap-1">
                        <input type="number" value={phys.crates} onChange={e => setPhysCounts(prev => ({ ...prev, [p.id]: { ...phys, crates: +e.target.value } }))} className="w-12 border rounded px-1 text-center text-[10px]" />c
                        <input type="number" value={phys.bottles} onChange={e => setPhysCounts(prev => ({ ...prev, [p.id]: { ...phys, bottles: +e.target.value } }))} className="w-12 border rounded px-1 text-center text-[10px]" />u
                      </div>
                    </td>
                    <td className={`px-2 text-center font-medium ${!hasEcart ? 'text-gray-400' : (ecartCrates < 0 || ecartBottles < 0) ? 'text-red-600' : 'text-green-600'}`}>
                      {!hasEcart ? '0' : `${ecartCrates !== 0 ? `${ecartCrates > 0 ? '+' : ''}${ecartCrates}c ` : ''}${ecartBottles !== 0 ? `${ecartBottles > 0 ? '+' : ''}${ecartBottles}u` : ''}`}
                    </td>
                  </tr>
                );
              })}</tbody></table>
            <div className="mt-8 grid grid-cols-2 gap-8 text-xs"><div><p className="border-t pt-2">Magasinier: _____________</p><p className="mt-1">Date: ____/____/________</p></div><div><p className="border-t pt-2">Gérant: _____________</p><p className="mt-1">Date: ____/____/________</p></div></div>
            <div className="mt-6 pt-4 border-t flex items-center gap-3">
              <select value={selectedPrinter} onChange={e => setSelectedPrinter(e.target.value)} className="input-field text-xs flex-1">
                {printers.length === 0 && <option value="">Imprimante par défaut</option>}
                {printers.map((p: any) => <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (défaut)' : ''}</option>)}
              </select>
              <button onClick={printInventorySheet} disabled={printing} className="btn-primary flex items-center gap-2 text-sm py-2 disabled:opacity-50"><Printer size={15} /> {printing ? 'Impression...' : 'Imprimer (A4)'}</button>
            </div>
            {printErr && <p className="text-xs text-red-600 mt-2">{printErr}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
