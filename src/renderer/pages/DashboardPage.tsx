import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import RevenueChart from '../components/RevenueChart';

interface DashboardStats {
  products_count: number; clients_count: number;
  sales_today: number; revenue_today: number;
  revenue_cash: number; revenue_credit: number; revenue_mobile: number;
  total_clients_debt: number;
  crates_out_today: number; crates_in_today: number;
  low_stock_count: number; crate_shortage_count: number;
  sales_by_category: { category: string; total: number }[];
  daily_revenue: { date: string; total: number }[];
  last_closure: any;
}

const CATEGORY_LABELS: Record<string, string> = {
  biere: '🍺 Bières', jus: '🧃 Jus', eau: '💧 Eaux', vin_spiritueux: '🍷 Vins',
};
const CAT_COLORS: Record<string, string> = {
  biere: '#3b82f6', jus: '#f59e0b', eau: '#10b981', vin_spiritueux: '#8b5cf6',
};

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const isGerantOrAdmin = user?.role === 'super_admin' || user?.role === 'gerant';
  const isSuperAdmin = user?.role === 'super_admin';

  const [closures, setClosures] = useState<any[]>([]);
  const [closuresMonth, setClosuresMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.getStats().then(r => { if (r.success) setStats(r.stats); });
    if (isSuperAdmin) window.electronAPI.listCashClosures().then(r => { if (r.success) setClosures(r.closures); });
  }, []);

  if (!stats) return <div className="p-6 text-gray-500">Chargement...</div>;

  const monthClosures = closures.filter((c: any) => c.created_at?.slice(0, 7) === closuresMonth);
  const byUser = Object.values(
    monthClosures.reduce((acc: any, c: any) => {
      const key = c.user_id || 'inconnu';
      if (!acc[key]) acc[key] = { user_id: key, label: c.full_name || c.username || 'Inconnu', count: 0, theoretical: 0, real: 0, discrepancy: 0, rows: [] };
      acc[key].count++;
      acc[key].theoretical += c.theoretical_amount || 0;
      acc[key].real += c.real_amount || 0;
      acc[key].discrepancy += c.discrepancy || 0;
      acc[key].rows.push(c);
      return acc;
    }, {} as Record<string, any>)
  ).sort((a: any, b: any) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📊 Tableau de bord</h2>
          <p className="text-sm text-gray-500 mt-1">
            Bonjour, {user?.full_name || user?.username} — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* KPIs du jour */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'CA du jour', value: `${stats.revenue_today.toLocaleString()} F`, icon: '💰', color: 'bg-brand-gold-light/40 text-brand-amber-dark', action: ()=>navigate('/sales/history') },
          { label: 'Ventes', value: `${stats.sales_today}`, icon: '🧾', color: 'bg-green-50 text-green-700', action: ()=>navigate('/sales/history') },
          { label: 'Dettes clients', value: `${stats.total_clients_debt.toLocaleString()} F`, icon: '📝', color: stats.total_clients_debt>0?'bg-red-50 text-red-700':'bg-gray-50 text-gray-700', action: ()=>navigate('/sales/credits') },
          { label: 'Casiers sortis/entrés', value: `${stats.crates_out_today}/${stats.crates_in_today}`, icon: '♻️', color: 'bg-purple-50 text-purple-700', action: ()=>navigate('/inventory') },
        ].map(k => (
          <div key={k.label} className="card cursor-pointer hover:shadow-md transition-shadow" onClick={k.action}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${k.color} mb-2`}>{k.icon}</div>
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className="text-lg font-bold text-gray-900">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Détail paiements + Alertes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Répartition paiements */}
        <div className="card">
          <h4 className="text-sm font-bold text-gray-500 mb-3">💳 Paiements du jour</h4>
          <div className="space-y-2">
            {[
              { label: 'Espèces', value: stats.revenue_cash, pct: stats.revenue_today ? (stats.revenue_cash / stats.revenue_today * 100) : 0, color: 'bg-green-500' },
              { label: 'Crédit', value: stats.revenue_credit, pct: stats.revenue_today ? (stats.revenue_credit / stats.revenue_today * 100) : 0, color: 'bg-red-500' },
              { label: 'Mobile Money', value: stats.revenue_mobile, pct: stats.revenue_today ? (stats.revenue_mobile / stats.revenue_today * 100) : 0, color: 'bg-yellow-500' },
            ].map(p => (
              <div key={p.label}>
                <div className="flex justify-between text-xs mb-1"><span>{p.label}</span><span>{p.value.toLocaleString()} F</span></div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${p.color} transition-all`} style={{ width: `${Math.min(p.pct, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ventes par catégorie (7j) */}
        <div className="card">
          <h4 className="text-sm font-bold text-gray-500 mb-3">📦 Ventes par catégorie (7 jours)</h4>
          {stats.sales_by_category.length === 0 ? (
            <p className="text-xs text-gray-400">Aucune vente.</p>
          ) : (
            <div className="space-y-2">
              {stats.sales_by_category.map(c => {
                const maxCat = Math.max(...stats.sales_by_category.map(x => x.total), 1);
                return (
                  <div key={c.category}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{CATEGORY_LABELS[c.category] || c.category}</span>
                      <span>{c.total.toLocaleString()} F</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(c.total / maxCat) * 100}%`, backgroundColor: CAT_COLORS[c.category] || '#6b7280' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alertes critiques */}
        <div className="card">
          <h4 className="text-sm font-bold text-gray-500 mb-3">⚠️ Alertes critiques</h4>
          <div className="space-y-3">
            <div
              onClick={() => navigate('/inventory', { state: { statusFilter: 'alerte' } })}
              className={`p-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${stats.low_stock_count > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}
            >
              <p className="text-sm font-bold">{stats.low_stock_count} produit(s) sous le seuil</p>
              <p className="text-xs text-gray-600 mt-0.5">Stock liquide faible — voir dans l'Inventaire</p>
            </div>
            <div
              onClick={() => navigate('/inventory', { state: { statusFilter: 'rupture' } })}
              className={`p-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${stats.crate_shortage_count > 0 ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}
            >
              <p className="text-sm font-bold">{stats.crate_shortage_count} produit(s) en pénurie</p>
              <p className="text-xs text-gray-600 mt-0.5">Casiers vides insuffisants — voir dans l'Inventaire</p>
            </div>
            <div
              onClick={() => navigate('/clients')}
              className={`p-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${stats.total_clients_debt > 10000 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}
            >
              <p className="text-sm font-bold">{stats.total_clients_debt.toLocaleString()} F de dettes</p>
              <p className="text-xs text-gray-600 mt-0.5">Solde clients cumulé</p>
            </div>
          </div>
        </div>
      </div>

      {/* Graphique d'évolution 7 jours */}
      {isGerantOrAdmin && (
        <div className="card">
          <h4 className="text-sm font-bold text-gray-500 mb-2">📈 Évolution du CA — 7 derniers jours</h4>
          <RevenueChart data={stats.daily_revenue} />
        </div>
      )}

      {/* Clôtures de caisse — écarts par utilisateur (Super Admin) */}
      {isSuperAdmin && (
        <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h4 className="text-sm font-bold text-gray-500">🔒 Clôtures de caisse — écarts par utilisateur</h4>
            <input
              type="month"
              value={closuresMonth}
              onChange={e => setClosuresMonth(e.target.value)}
              className="input-field w-40 text-xs !py-1.5"
            />
          </div>
          {byUser.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune clôture ce mois-ci.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">Utilisateur</th>
                  <th className="text-center">Clôtures</th>
                  <th className="text-right">Théorique</th>
                  <th className="text-right">Réel</th>
                  <th className="text-right">Écart cumulé</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byUser.map((u: any) => (
                  <Fragment key={u.user_id}>
                    <tr key={u.user_id} className="border-b hover:bg-gray-50">
                      <td className="py-2 font-medium">{u.label}</td>
                      <td className="text-center">{u.count}</td>
                      <td className="text-right">{u.theoretical.toLocaleString()} F</td>
                      <td className="text-right">{u.real.toLocaleString()} F</td>
                      <td className={`text-right font-bold ${u.discrepancy === 0 ? 'text-green-600' : u.discrepancy > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {u.discrepancy > 0 ? '+' : ''}{u.discrepancy.toLocaleString()} F
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => setExpandedUser(expandedUser === u.user_id ? null : u.user_id)}
                          className="text-xs text-primary-600 hover:underline"
                        >
                          {expandedUser === u.user_id ? 'Masquer' : 'Détails'}
                        </button>
                      </td>
                    </tr>
                    {expandedUser === u.user_id && (
                      <tr key={`${u.user_id}-detail`}>
                        <td colSpan={6} className="bg-gray-50 p-3">
                          <table className="w-full text-xs">
                            <thead><tr className="text-gray-400 text-left"><th className="py-1">Date</th><th className="text-right">Théorique</th><th className="text-right">Réel</th><th className="text-right">Écart</th></tr></thead>
                            <tbody>
                              {u.rows.sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1)).map((c: any) => (
                                <tr key={c.id} className="border-t border-gray-200">
                                  <td className="py-1">{new Date(c.created_at).toLocaleString('fr-FR')}</td>
                                  <td className="text-right">{c.theoretical_amount?.toLocaleString()} F</td>
                                  <td className="text-right">{c.real_amount?.toLocaleString()} F</td>
                                  <td className={`text-right font-bold ${c.discrepancy === 0 ? 'text-green-600' : c.discrepancy > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {c.discrepancy > 0 ? '+' : ''}{c.discrepancy?.toLocaleString()} F
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Indicateurs système */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${stats.last_closure ? 'bg-green-500' : 'bg-yellow-500'}`} />
          <div>
            <p className="text-sm font-medium">Sauvegarde locale</p>
            <p className="text-xs text-gray-500">
              {stats.last_closure ? `Dernière clôture: ${new Date(stats.last_closure.created_at).toLocaleString('fr-FR')}` : 'Aucune clôture aujourd\'hui'}
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-blue-500" />
          <div>
            <p className="text-sm font-medium">Base de données</p>
            <p className="text-xs text-gray-500">{stats.products_count} produits · {stats.clients_count} clients · SQLite local</p>
          </div>
        </div>
      </div>
    </div>
  );
}