import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { BarChart3, Send, Check, User, Banknote, CreditCard, Package, AlertTriangle } from 'lucide-react';

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { user } = useAuthStore();
  const isSA = user?.role === 'super_admin';

  const [users, setUsers] = useState<any[]>([]);
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [summary, setSummary] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteText, setNoteText] = useState('');
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  useEffect(() => {
    if (isSA) window.electronAPI.listUsers().then((r: any) => { if (r.success) setUsers(r.users); });
  }, [isSA]);

  const loadSummary = () => {
    (window.electronAPI as any).getReportSummary?.(isSA ? (targetUserId || null) : null, from, to).then((r: any) => {
      if (r.success) setSummary(r.summary); else setErr(r.error);
    });
  };
  const loadNotes = () => {
    (window.electronAPI as any).listReportNotes?.(isSA ? (targetUserId || null) : null).then((r: any) => {
      if (r.success) setNotes(r.notes); else setErr(r.error);
    });
  };

  useEffect(() => { loadSummary(); }, [targetUserId, from, to, isSA]);
  useEffect(() => { loadNotes(); }, [targetUserId, isSA]);

  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setOk('');
    if (!noteText.trim()) { setErr('La note ne peut pas être vide.'); return; }
    const r = await (window.electronAPI as any).addReportNote(noteText.trim());
    if (r.success) { setOk('Note envoyée.'); setNoteText(''); loadNotes(); } else setErr(r.error);
  };

  const ackNote = async (id: string) => {
    const r = await (window.electronAPI as any).ackReportNote(id);
    if (r.success) loadNotes(); else setErr(r.error);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 size={20} /> Rapports d'activité</h2>
          <p className="text-xs text-gray-400">{isSA ? "Résumé d'activité et signalements par utilisateur" : "Votre activité et vos signalements"}</p>
        </div>
      </div>

      {err && <div className="bg-red-50 border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}
      {ok && <div className="bg-green-50 border-green-200 text-green-700 text-sm rounded-lg p-3">{ok}</div>}

      <div className="card flex flex-wrap gap-3 items-end">
        {isSA && (
          <div>
            <label className="text-xs text-gray-400">Utilisateur</label>
            <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)} className="input-field text-sm w-52">
              <option value="">Tous (résumé global)</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
            </select>
          </div>
        )}
        <div><label className="text-xs text-gray-400">Du</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-field text-sm" /></div>
        <div><label className="text-xs text-gray-400">Au</label><input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-field text-sm" /></div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="card">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary-50 text-primary-600 mb-2"><User size={20} /></div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Ventes</p>
            <p className="text-2xl font-bold text-gray-900">{summary.sales_count}</p>
          </div>
          <div className="card">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 mb-2"><Banknote size={20} /></div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Chiffre d'affaires</p>
            <p className="text-2xl font-bold text-gray-900">{summary.revenue.toLocaleString()} F</p>
            <p className="text-[11px] text-gray-400">Espèces: {summary.revenue_cash.toLocaleString()} F</p>
          </div>
          <div className="card">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600 mb-2"><CreditCard size={20} /></div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Ventes à crédit</p>
            <p className="text-2xl font-bold text-gray-900">{summary.revenue_credit.toLocaleString()} F</p>
          </div>
          <div className="card">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 mb-2"><Package size={20} /></div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Casiers vendus</p>
            <p className="text-2xl font-bold text-gray-900">{summary.crates_sold}</p>
          </div>
          <div className="card">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-50 text-red-600 mb-2"><AlertTriangle size={20} /></div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Écarts de caisse</p>
            <p className="text-2xl font-bold text-gray-900">{summary.total_discrepancy.toLocaleString()} F</p>
            <p className="text-[11px] text-gray-400">{summary.closures_count} clôture(s)</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {!isSA && (
          <div className="card">
            <h4 className="text-sm font-bold text-gray-700 mb-3">Ajouter une note / signaler un incident</h4>
            <form onSubmit={submitNote} className="space-y-2">
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} className="input-field w-full text-sm" placeholder="Ex: écart de caisse constaté, client difficile, produit avarié..." />
              <button type="submit" className="btn-primary text-sm flex items-center gap-2 py-2"><Send size={14} /> Envoyer au Super Admin</button>
            </form>
          </div>
        )}

        <div className="card p-0 overflow-hidden lg:col-span-1">
          <div className="p-4 border-b"><h4 className="text-sm font-bold text-gray-700">{isSA ? 'Notes / signalements' : 'Mes notes envoyées'}</h4></div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {notes.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Aucune note.</p>}
            {notes.map((n: any) => (
              <div key={n.id} className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {isSA && <p className="text-xs font-medium text-gray-700">{n.user_name}</p>}
                  <p className="text-sm text-gray-800 mt-0.5">{n.note}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString('fr-FR')}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${n.status === 'acknowledged' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {n.status === 'acknowledged' ? 'Vu' : 'Ouvert'}
                  </span>
                  {isSA && n.status !== 'acknowledged' && (
                    <button onClick={() => ackNote(n.id)} title="Marquer comme vu" className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><Check size={14} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
