import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Plus, FileText, Printer, RefreshCw, Banknote, CreditCard,
  Check, X, Minus, Trash2, Package, Wine, User, Bell, ShoppingCart, ReceiptText,
  Smartphone, Hash, Calendar,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { buildTicketHtml, buildInvoiceA4Html, TicketWidth } from '../utils/print';

const CATS: { key: string; label: string }[] = [
  { key: '', label: 'Tous' },
  { key: 'bieres', label: 'Bières' },
  { key: 'jus_sodas', label: 'Jus & Sodas' },
  { key: 'eaux', label: 'Eaux' },
  { key: 'spiritueux_mix', label: 'Spiritueux' },
  { key: 'energy_drinks', label: 'Energy' },
];

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
}

const PM_LABELS: Record<string,string> = { cash: 'Espèces', credit: 'Crédit', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo' };
function pmLabel(pm: string) { return PM_LABELS[pm] || pm; }
function PmIcon({ pm, size = 12 }: { pm: string; size?: number }) {
  if (pm === 'cash') return <Banknote size={size} className="text-gray-400" />;
  if (pm === 'orange_money' || pm === 'mtn_momo') return <Smartphone size={size} className="text-gray-400" />;
  return <CreditCard size={size} className="text-gray-400" />;
}

function formatPackagingDelta(deltaCrates: number, deltaBottles: number) {
  const parts: string[] = [];
  if (deltaCrates) parts.push(`${deltaCrates>0?'+':''}${deltaCrates} casier(s)`);
  if (deltaBottles) parts.push(`${deltaBottles>0?'+':''}${deltaBottles} bouteille(s)`);
  if (parts.length === 0) return '';
  const isDebt = deltaCrates > 0 || deltaBottles > 0;
  return `${parts.join(' / ')} ${isDebt ? 'dus par le client' : 'crédités au client'}`;
}

function summarizeMovement(items: { quantity_full_crates?: number; quantity_loose_bottles?: number; quantity_empties_returned?: number }[]) {
  let cratesTaken = 0, bottlesTaken = 0, emptyCratesReturned = 0, emptyBottlesReturned = 0;
  for (const it of items) {
    const crates = it.quantity_full_crates || 0;
    const bottles = it.quantity_loose_bottles || 0;
    const returned = it.quantity_empties_returned || 0;
    cratesTaken += crates;
    bottlesTaken += bottles;
    if (crates > 0) emptyCratesReturned += returned;
    else if (bottles > 0) emptyBottlesReturned += returned;
  }
  return { cratesTaken, bottlesTaken, emptyCratesReturned, emptyBottlesReturned };
}

function Barcode({ seed }: { seed: string }) {
  const bars = useMemo(() => {
    let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return Array.from({ length: 34 }, () => { h = (h * 1103515245 + 12345) >>> 0; return 1 + (h % 3); });
  }, [seed]);
  return (
    <div className="flex items-end justify-center gap-[1.5px] h-8 mt-1">
      {bars.map((w, i) => <span key={i} className="bg-gray-900" style={{ width: w, height: '100%' }} />)}
    </div>
  );
}

// Liste des produits d'une vente enregistrée (items venant de getSaleItems)
function SaleItemLines({ items, className = '' }: { items: any[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <table className={`w-full text-[10px] ${className}`}><tbody>{items.map((it:any,i:number)=>{
      const crate=(it.quantity_full_crates||0)>0;
      return(<tr key={i}><td className="text-left">{it.product_name} x{crate?it.quantity_full_crates:it.quantity_loose_bottles} {crate?'c':'u'}</td><td className="text-right font-bold">{(it.total_price||0).toLocaleString()}F</td></tr>);
    })}</tbody></table>
  );
}

interface Product { id: string; name: string; category: string; format: string; brewery_name: string; sell_price_liquid: number; units_per_crate: number; consigne_amount: number; stock_full_crates: number; stock_loose_bottles: number; }
type SellMode = 'crate' | 'loose';
interface TicketItem { product: Product; quantity: number; mode: SellMode; emballagesApportes: number; }
interface Client { id: string; name: string; phone: string; financial_balance: number; material_balance_crates: number; }

export default function SalesPage() {
  const { user } = useAuthStore(); const { depotName } = useSettingsStore(); const sr = useRef<HTMLInputElement>(null);
  const location = useLocation(); const navigate = useNavigate();
  const view: 'sell'|'history'|'credits' = location.pathname.endsWith('/credits') ? 'credits' : location.pathname.endsWith('/history') ? 'history' : 'sell';
  const goSell = () => navigate('/sales'); const goHistory = () => navigate('/sales/history'); const goCredits = () => navigate('/sales/credits');
  const [prods,setProds]=useState<Product[]>([]); const [clients,setClients]=useState<Client[]>([]);
  const [sales,setSales]=useState<any[]>([]); const [search,setSearch]=useState('');
  const [catFilter,setCatFilter]=useState('');
  const [results,setResults]=useState<Product[]>([]); const [ticket,setTicket]=useState<TicketItem[]>([]);
  const [client,setClient]=useState<Client|null>(null); const [pmode,setPmode]=useState('cash');
  const [cashReceived,setCashReceived]=useState<number|''>('');
  const [clientLocked,setClientLocked]=useState(false);
  const [draftIdBeingEdited,setDraftIdBeingEdited]=useState<string|null>(null);
  const [err,setErr]=useState(''); const [ok,setOk]=useState('');
  const [showPrint,setShowPrint]=useState(false); const [showInvoice,setShowInvoice]=useState(false);
  const [lastSale,setLastSale]=useState<any>(null); const [lastSaleClient,setLastSaleClient]=useState<Client|null>(null);
  const [lastTicketSnapshot,setLastTicketSnapshot]=useState<TicketItem[]>([]);
  const [lastPmode,setLastPmode]=useState('cash'); const [lastCashReceived,setLastCashReceived]=useState<number|''>('');
  const [reprintTarget,setReprintTarget]=useState<any>(null);
  const [histSearch,setHistSearch]=useState(''); const [histUser,setHistUser]=useState(''); const [histPmt,setHistPmt]=useState('');
  const [selectedSale,setSelectedSale]=useState<any>(null);
  const [selectedSaleItems,setSelectedSaleItems]=useState<any[]>([]);
  const [repayments,setRepayments]=useState<any[]>([]);
  const [printers,setPrinters]=useState<any[]>([]); const [selectedPrinter,setSelectedPrinter]=useState('');
  const [ticketWidth,setTicketWidth]=useState<TicketWidth>('80mm');
  const [printing,setPrinting]=useState(false); const [printErr,setPrintErr]=useState('');
  const isSA = user?.role==='super_admin'; const isGA = isSA||user?.role==='gerant';
  const validated = !!lastSale;
  const invoiceNumber = `FAC-${new Date().getFullYear()}-${String(sales.length+1).padStart(5,'0')}`;
  const [nowTick,setNowTick]=useState(()=>new Date());

  useEffect(()=>{window.electronAPI.listProducts().then(r=>{if(r.success)setProds(r.products)});window.electronAPI.listClients().then(r=>{if(r.success)setClients(r.clients)});window.electronAPI.listSales().then(r=>{if(r.success)setSales(r.sales)});(window.electronAPI as any).listClientRepayments?.().then((r:any)=>{if(r.success)setRepayments(r.repayments)});(window.electronAPI as any).getPrinters?.().then((r:any)=>{if(r.success){setPrinters(r.printers);const def=r.printers.find((p:any)=>p.isDefault)||r.printers[0];if(def)setSelectedPrinter(def.name)}});sr.current?.focus()},[]);

  const doPrint=async(html:string,pageSize:TicketWidth|'A4')=>{
    setPrintErr(''); setPrinting(true);
    const r=await (window.electronAPI as any).printHtml({html,pageSize,deviceName:selectedPrinter||undefined});
    setPrinting(false);
    if(!r.success) setPrintErr(r.error||"Erreur d'impression.");
  };

  const printSaleTicket=(sale:any,items:any[])=>{
    const mv=summarizeMovement(items);
    const html=buildTicketHtml({
      depotName, createdAt:new Date(sale.created_at).toLocaleString('fr-FR'), seller:sale.seller_name||'',
      lines:items.map((it:any)=>({name:it.product_name,qty:it.quantity_full_crates>0?it.quantity_full_crates:it.quantity_loose_bottles,unitLabel:it.quantity_full_crates>0?'c':'u',total:it.total_price})),
      totalLiquid:sale.total_amount||0, paymentLabel:pmLabel(sale.payment_method), clientName:sale.client_name||'Client comptoir',
      cratesTaken:mv.cratesTaken, bottlesTaken:mv.bottlesTaken, emptyCratesReturned:mv.emptyCratesReturned, emptyBottlesReturned:mv.emptyBottlesReturned,
      debtCrates:sale.packaging_debt_crates||0, debtBottles:sale.packaging_debt_bottles||0, saleRef:sale.id,
    },ticketWidth);
    doPrint(html,ticketWidth);
  };

  const printSaleInvoice=(sale:any,items:any[])=>{
    const mv=summarizeMovement(items);
    const html=buildInvoiceA4Html({
      depotName, invoiceNumber:`F-${sale.id?.slice(0,8).toUpperCase()}`, createdAt:new Date(sale.created_at).toLocaleDateString('fr-FR'), seller:sale.seller_name||'',
      clientName:sale.client_name||'Client comptoir',
      lines:items.map((it:any)=>({name:it.product_name,qty:it.quantity_full_crates>0?it.quantity_full_crates:it.quantity_loose_bottles,modeLabel:it.quantity_full_crates>0?'Casier':'Bouteille',empties:it.quantity_empties_returned||0,total:it.total_price})),
      totalLiquid:sale.total_amount||0, paymentLabel:pmLabel(sale.payment_method),
      cratesTaken:mv.cratesTaken, bottlesTaken:mv.bottlesTaken, emptyCratesReturned:mv.emptyCratesReturned, emptyBottlesReturned:mv.emptyBottlesReturned,
      debtCrates:sale.packaging_debt_crates||0, debtBottles:sale.packaging_debt_bottles||0,
    });
    doPrint(html,'A4');
  };

  const printLastSaleTicket=()=>{
    const mv=summarizeMovement(lastTicketSnapshot.map(t=>({quantity_full_crates:t.mode==='crate'?t.quantity:0,quantity_loose_bottles:t.mode==='loose'?t.quantity:0,quantity_empties_returned:t.emballagesApportes})));
    const tot=lastSale?.total_amount??grandTotal;
    const html=buildTicketHtml({
      depotName, createdAt:new Date(lastSale?.created_at||Date.now()).toLocaleString('fr-FR'), seller:user?.full_name||user?.username||'',
      lines:lastTicketSnapshot.map(t=>({name:t.product.name,qty:t.quantity,unitLabel:t.mode==='crate'?'c':'u',total:t.mode==='crate'?t.product.sell_price_liquid*t.quantity:t.product.sell_price_liquid/t.product.units_per_crate*t.quantity})),
      totalLiquid:tot, paymentLabel:pmLabel(lastPmode), clientName:lastSaleClient?.name||lastSale?.client_name||'Client comptoir',
      cratesTaken:mv.cratesTaken, bottlesTaken:mv.bottlesTaken, emptyCratesReturned:mv.emptyCratesReturned, emptyBottlesReturned:mv.emptyBottlesReturned,
      debtCrates:mv.cratesTaken-mv.emptyCratesReturned, debtBottles:mv.bottlesTaken-mv.emptyBottlesReturned, saleRef:lastSale?.id||'',
    },ticketWidth);
    doPrint(html,ticketWidth);
  };

  const printLastSaleInvoice=()=>{
    const mv=summarizeMovement(lastTicketSnapshot.map(t=>({quantity_full_crates:t.mode==='crate'?t.quantity:0,quantity_loose_bottles:t.mode==='loose'?t.quantity:0,quantity_empties_returned:t.emballagesApportes})));
    const tot=lastSale?.total_amount??grandTotal;
    const html=buildInvoiceA4Html({
      depotName, invoiceNumber, createdAt:new Date(lastSale?.created_at||Date.now()).toLocaleDateString('fr-FR'), seller:user?.full_name||user?.username||'',
      clientName:lastSaleClient?.name||lastSale?.client_name||'Client comptoir',
      lines:lastTicketSnapshot.map(t=>({name:t.product.name,qty:t.quantity,modeLabel:t.mode==='crate'?'Casier':'Bouteille',empties:t.emballagesApportes,total:t.mode==='crate'?t.product.sell_price_liquid*t.quantity:t.product.sell_price_liquid/t.product.units_per_crate*t.quantity})),
      totalLiquid:tot, paymentLabel:pmLabel(lastPmode),
      cratesTaken:mv.cratesTaken, bottlesTaken:mv.bottlesTaken, emptyCratesReturned:mv.emptyCratesReturned, emptyBottlesReturned:mv.emptyBottlesReturned,
      debtCrates:mv.cratesTaken-mv.emptyCratesReturned, debtBottles:mv.bottlesTaken-mv.emptyBottlesReturned,
    });
    doPrint(html,'A4');
  };
  useEffect(()=>{const t=setInterval(()=>setNowTick(new Date()),30000);return()=>clearInterval(t)},[]);
  useEffect(()=>{setErr('');setOk('')},[view]);
  useEffect(()=>{
    if(!selectedSale){setSelectedSaleItems([]);return}
    window.electronAPI.getSaleItems(selectedSale.id).then(r=>{if(r.success)setSelectedSaleItems(r.items)});
  },[selectedSale?.id]);
  useEffect(()=>{
    setResults(prods.filter(p=>(!catFilter||p.category===catFilter)&&(search.length<1||p.name.toLowerCase().includes(search.toLowerCase()))));
  },[search,catFilter,prods]);

  // Prix: sell_price_liquid = prix CASIER. Bouteille = sell_price_liquid / units_per_crate
  const totalLiquid = ticket.reduce((s,t)=>s+(t.mode==='crate'?t.product.sell_price_liquid*t.quantity:t.product.sell_price_liquid/t.product.units_per_crate*t.quantity),0);
  const grandTotal = totalLiquid; // La consignation n'est plus facturée en argent — voir dette d'emballage ci-dessous
  const ticketMv = summarizeMovement(ticket.map(t=>({quantity_full_crates:t.mode==='crate'?t.quantity:0,quantity_loose_bottles:t.mode==='loose'?t.quantity:0,quantity_empties_returned:t.emballagesApportes})));
  const packagingDebtCrates = ticketMv.cratesTaken - ticketMv.emptyCratesReturned;
  const packagingDebtBottles = ticketMv.bottlesTaken - ticketMv.emptyBottlesReturned;

  const addToTicket=(p:Product)=>{setTicket(prev=>[...prev,{product:p,quantity:1,mode:'crate',emballagesApportes:1}]);setSearch('');sr.current?.focus()};
  const upQty=(i:number,d:number)=>{setTicket(prev=>prev.map((t,idx)=>idx===i?{...t,quantity:Math.max(0,t.quantity+d)}:t).filter(t=>t.quantity>0))};
  const toggleMode=(i:number)=>{setTicket(prev=>prev.map((t,idx)=>idx===i?{...t,mode:t.mode==='crate'?'loose':'crate'}:t))};
  const upEmb=(i:number,v:number)=>{setTicket(prev=>prev.map((t,idx)=>idx===i?{...t,emballagesApportes:Math.max(0,v)}:t))};

  const validate=async()=>{
    if(ticket.length===0){setErr('Ajoutez un article.');return}
    if(!clientLocked){setErr('Sélectionnez le client (ou confirmez "Client comptoir") avant de valider la facture.');return}
    if(pmode==='credit'&&!client){setErr('Client requis pour crédit.');return}
    if(!client&&(packagingDebtCrates>0||packagingDebtBottles>0)){setErr('Un client doit être sélectionné : des emballages restent dus pour cette vente.');return}
    setErr('');
    const r=await window.electronAPI.createSale({
      client_id:client?.id||'',payment_method:pmode,
      items:ticket.map(t=>({product_id:t.product.id,quantity_full_crates:t.mode==='crate'?t.quantity:0,quantity_loose_bottles:t.mode==='loose'?t.quantity:0,quantity_empties_returned:t.emballagesApportes}))
    });
    if(r.success){
      if(draftIdBeingEdited){window.electronAPI.deleteSaleDraft(draftIdBeingEdited);setDraftIdBeingEdited(null)}
      setOk(`✅ Vente validée — ${grandTotal.toLocaleString()} FCFA`); setLastSale(r.sale);
      setLastSaleClient(client); setLastTicketSnapshot(ticket); setLastPmode(pmode); setLastCashReceived(cashReceived);
      setTicket([]); setClient(null); setSearch(''); setCashReceived(''); setClientLocked(false);
      window.electronAPI.listSales().then(r=>{if(r.success)setSales(r.sales)});
      window.electronAPI.listProducts().then(r=>{if(r.success)setProds(r.products)});
      window.electronAPI.listClients().then(r=>{if(r.success)setClients(r.clients)});
      sr.current?.focus();
    }else setErr(r.error);
  };

  const saveDraft=async()=>{
    if(ticket.length===0){setErr('Ajoutez un article avant d\'enregistrer un brouillon.');return}
    setErr('');
    const r=await window.electronAPI.saveSaleDraft({
      client_id:client?.id||'',payment_method:pmode,
      items:ticket.map(t=>({product_id:t.product.id,quantity_full_crates:t.mode==='crate'?t.quantity:0,quantity_loose_bottles:t.mode==='loose'?t.quantity:0,quantity_empties_returned:t.emballagesApportes}))
    });
    if(r.success){
      if(draftIdBeingEdited)window.electronAPI.deleteSaleDraft(draftIdBeingEdited);
      setOk('📝 Facture enregistrée en brouillon.'); setDraftIdBeingEdited(null);
      setTicket([]); setClient(null); setSearch(''); setCashReceived(''); setClientLocked(false);
      window.electronAPI.listSales().then(r=>{if(r.success)setSales(r.sales)});
      sr.current?.focus();
    }else setErr(r.error);
  };

  const clear=()=>{setTicket([]);setClient(null);setLastSale(null);setLastSaleClient(null);setLastTicketSnapshot([]);setErr('');setCashReceived('');setClientLocked(false);setDraftIdBeingEdited(null);sr.current?.focus()};
  const cancelSale=async(id:string)=>{const r=await window.electronAPI.cancelSale(id);if(r.success){setOk('Annulé.');window.electronAPI.listSales().then(r=>{if(r.success)setSales(r.sales)});setSelectedSale((s:any)=>s?{...s,status:'cancelled'}:s)}else setErr(r.error)};

  const resumeDraft=async(sale:any)=>{
    const r=await window.electronAPI.getSaleItems(sale.id);
    if(!r.success){setErr(r.error);return}
    const rebuilt:TicketItem[]=r.items.map((it:any)=>{
      const product=prods.find(p=>p.id===it.product_id);
      if(!product)return null;
      const mode:SellMode=it.quantity_full_crates>0?'crate':'loose';
      return {product,quantity:mode==='crate'?it.quantity_full_crates:it.quantity_loose_bottles,mode,emballagesApportes:it.quantity_empties_returned||0};
    }).filter(Boolean) as TicketItem[];
    if(rebuilt.length===0){setErr('Produit(s) du brouillon introuvable(s) — a-t-il été désactivé ?');return}
    const saleClient=sale.client_id?clients.find(c=>c.id===sale.client_id)||null:null;
    setTicket(rebuilt); setClient(saleClient); setClientLocked(true); setPmode(sale.payment_method||'cash');
    setDraftIdBeingEdited(sale.id);
    navigate('/sales');
  };

  const hk=useCallback((e:KeyboardEvent)=>{
    if(view!=='sell') return;
    if(e.key==='F2'){e.preventDefault();setPmode('cash')}if(e.key==='F5'){e.preventDefault();if(validated){setShowPrint(true);printLastSaleTicket()}}
    if(e.key==='F8'){e.preventDefault();setPmode('credit')}if(e.key==='Enter'&&document.activeElement===sr.current){e.preventDefault();if(results.length>0)addToTicket(results[0])}
    if(e.key==='Escape'){e.preventDefault();clear()}
  },[results,ticket,validated,view]);
  useEffect(()=>{window.addEventListener('keydown',hk);return()=>window.removeEventListener('keydown',hk)},[hk]);

  const filteredSales=sales.filter((s:any)=>{
    if(histUser&&s.seller_name!==histUser)return false;
    if(histPmt==='cancelled'){ if(s.status!=='cancelled')return false; }
    else if(histPmt==='draft'){ if(s.status!=='draft')return false; }
    else {
      if(s.status==='cancelled'||s.status==='draft')return false;
      if(histPmt&&s.payment_method!==histPmt)return false;
    }
    if(histSearch&&!(s.client_name||'Client Passage').toLowerCase().includes(histSearch.toLowerCase()))return false;
    return true;
  });
  const sellers=[...new Set(sales.map((s:any)=>s.seller_name))];

  // Facture sélectionnée : garder la sélection synchro avec la liste filtrée
  useEffect(()=>{
    if(view!=='history')return;
    if(selectedSale&&filteredSales.some((s:any)=>s.id===selectedSale.id))return;
    setSelectedSale(filteredSales[0]||null);
  },[view,filteredSales.length]); // eslint-disable-line

  if(view==='history') {
  const creditAlerts = clients.filter(c=>c.financial_balance>0).length;
  const tabs: {key:string,label:string,count:number}[] = [
    {key:'',label:'Toutes',count:sales.filter((s:any)=>s.status!=='cancelled'&&s.status!=='draft').length},
    {key:'cash',label:'Espèces',count:sales.filter((s:any)=>s.status!=='cancelled'&&s.status!=='draft'&&s.payment_method==='cash').length},
    {key:'credit',label:'Crédit',count:sales.filter((s:any)=>s.status!=='cancelled'&&s.status!=='draft'&&s.payment_method==='credit').length},
    {key:'repayments',label:'Remboursements',count:repayments.length},
    {key:'draft',label:'Brouillons',count:sales.filter((s:any)=>s.status==='draft').length},
    {key:'cancelled',label:'Annulées',count:sales.filter((s:any)=>s.status==='cancelled').length},
  ];
  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Factures de ventes</h2>
          <p className="text-xs text-gray-400">{filteredSales.length} facture(s)</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={goSell} className="btn-primary flex items-center gap-2 text-sm py-2.5">
            <Plus size={16}/> Nouvelle facture
          </button>
          <div className="flex items-center gap-1.5 pl-2 border-l">
            <button onClick={goCredits} title={`${creditAlerts} client(s) avec impayés — voir Ventes à crédit`} className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500">
              <Bell size={18}/>
              {creditAlerts>0&&<span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{creditAlerts}</span>}
            </button>
            <button onClick={()=>{if(selectedSale){setReprintTarget(selectedSale);setShowPrint(true);printSaleTicket(selectedSale,selectedSaleItems)}}} disabled={!selectedSale} title="Imprimer" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30">
              <Printer size={18}/>
            </button>
            <div title={user?.full_name||user?.username} className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
              {initials(user?.full_name||user?.username||'?')}
            </div>
          </div>
        </div>
      </div>

      {err&&<div className="bg-red-50 border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}
      {ok&&<div className="bg-green-50 border-green-200 text-green-700 text-sm rounded-lg p-3">{ok}</div>}

      <div className="card space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={histSearch} onChange={e=>setHistSearch(e.target.value)} placeholder="Rechercher un client..." className="input-field text-sm w-full !pl-9 rounded-full"/>
          </div>
          <select value={histUser} onChange={e=>setHistUser(e.target.value)} className="input-field text-xs w-48"><option value="">Tous les vendeurs</option>{sellers.map(s=><option key={s} value={s}>{s}</option>)}</select>
        </div>
        <div className="flex gap-1 flex-wrap">
          {tabs.map(t=>(
            <button key={t.key} onClick={()=>setHistPmt(t.key)} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${histPmt===t.key?'bg-primary-600 text-white':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {t.label} <span className="opacity-70">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {histPmt==='repayments'?(
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500 bg-gray-50"><th className="py-2 px-3">Client</th><th className="px-2 text-right">Montant remboursé</th><th className="px-2">Méthode</th><th className="px-2">Traité par</th><th className="px-2">Date</th></tr></thead>
            <tbody>
              {repayments.filter((r:any)=>!histSearch||r.client_name.toLowerCase().includes(histSearch.toLowerCase())).length===0&&<tr><td colSpan={5} className="py-8 text-center text-gray-400">Aucun remboursement enregistré.</td></tr>}
              {repayments.filter((r:any)=>!histSearch||r.client_name.toLowerCase().includes(histSearch.toLowerCase())).map((r:any)=>(
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[10px] font-bold">{initials(r.client_name)}</div><span className="font-medium">{r.client_name}</span></div></td>
                  <td className="px-2 text-right font-bold text-green-600">{r.amount.toLocaleString()} F</td>
                  <td className="px-2"><span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100"><PmIcon pm={r.method}/> {pmLabel(r.method)}</span></td>
                  <td className="px-2 text-xs text-gray-500">{r.processed_by}</td>
                  <td className="px-2 text-xs text-gray-500">{new Date(r.created_at).toLocaleString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ):(
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_300px] gap-4 items-start">
        {/* Colonne 1 : liste des factures */}
        <div className="card p-0 overflow-hidden flex flex-col" style={{maxHeight:'680px'}}>
          <div className="flex-1 overflow-y-auto divide-y">
            {filteredSales.length===0&&<p className="text-sm text-gray-400 text-center py-8">Aucune vente.</p>}
            {filteredSales.map((s:any)=>(
              <button key={s.id} onClick={()=>setSelectedSale(s)} className={`w-full text-left px-4 py-3 hover:bg-primary-50 transition-colors flex items-center gap-3 ${selectedSale?.id===s.id?'bg-primary-50 border-l-4 border-primary-600':'border-l-4 border-transparent'}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${s.status==='cancelled'?'bg-gray-100 text-gray-400':s.status==='draft'?'bg-brand-gold-light/50 text-brand-amber-dark':'bg-primary-100 text-primary-700'}`}>
                  {initials(s.client_name||'Client Passage')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <p className={`text-sm font-medium truncate flex items-center gap-1.5 ${s.status==='cancelled'?'line-through text-gray-400':'text-gray-900'}`}>{s.client_name||'Client Passage'}{s.status==='draft'&&<span className="text-[9px] font-bold bg-brand-gold-light/50 text-brand-amber-dark px-1.5 py-0.5 rounded-full shrink-0">BROUILLON</span>}</p>
                    <span className={`text-sm font-bold shrink-0 ${s.status==='cancelled'?'text-gray-400 line-through':'text-gray-900'}`}>{s.total_amount?.toLocaleString()} F</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <PmIcon pm={s.payment_method}/>
                    <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Colonne 2 : détail facture — Vente nette en avant */}
        <div className="card space-y-4">
          {!selectedSale?(
            <div className="text-center py-16 text-gray-400"><ReceiptText size={40} className="mx-auto mb-3 opacity-40"/><p className="text-sm">Sélectionnez une facture dans la liste</p></div>
          ):(
            <>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Total Liquide</p>
                  <p className="text-3xl font-bold text-gray-900">{selectedSale.total_amount?.toLocaleString()} FCFA</p>
                  {((selectedSale.packaging_debt_crates||0)!==0||(selectedSale.packaging_debt_bottles||0)!==0)&&<p className={`text-xs mt-1 ${((selectedSale.packaging_debt_crates||0)>0||(selectedSale.packaging_debt_bottles||0)>0)?'text-red-500':'text-green-600'}`}>Emballages : {formatPackagingDelta(selectedSale.packaging_debt_crates||0,selectedSale.packaging_debt_bottles||0)}</p>}
                </div>
                <span className={`px-2 py-1 text-xs rounded-full font-medium ${selectedSale.status==='cancelled'?'bg-red-100 text-red-700':selectedSale.status==='draft'?'bg-brand-gold-light/50 text-brand-amber-dark':'bg-green-100 text-green-700'}`}>{selectedSale.status==='cancelled'?'Annulée':selectedSale.status==='draft'?'Brouillon':'Active'}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs border-t border-b py-3">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold shrink-0">{initials(selectedSale.client_name||'Client Passage')}</div>
                  <div><p className="text-gray-400">Client</p><p className="font-medium text-sm">{selectedSale.client_name||'Client Passage'}</p></div>
                </div>
                <div><p className="text-gray-400">Vendeur</p><p className="font-medium text-sm">{selectedSale.seller_name}</p></div>
                <div><p className="text-gray-400">Date d'émission</p><p className="font-medium text-sm">{new Date(selectedSale.created_at).toLocaleString('fr-FR')}</p></div>
                <div><p className="text-gray-400">N° de facture</p><p className="font-medium text-sm">F-{selectedSale.id?.slice(0,8).toUpperCase()}</p></div>
              </div>

              {(()=>{const mv=summarizeMovement(selectedSaleItems);return(
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-blue-50 rounded-lg p-2"><p className="text-gray-500">Casiers pris</p><p className="font-bold text-sm text-blue-700">{mv.cratesTaken}{mv.bottlesTaken>0?` (+${mv.bottlesTaken} bout.)`:''}</p></div>
                  <div className="bg-amber-50 rounded-lg p-2"><p className="text-gray-500">Emballages rapportés</p><p className="font-bold text-sm text-amber-700">{mv.emptyCratesReturned} casier(s){mv.emptyBottlesReturned>0?` + ${mv.emptyBottlesReturned} bout.`:''}</p></div>
                </div>
              );})()}

              <div className="text-xs"><p className="text-gray-400 mb-1">Paiement</p><span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100"><PmIcon pm={selectedSale.payment_method}/> {pmLabel(selectedSale.payment_method)}</span></div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                {selectedSale.status==='draft'?(
                  <>
                    <button onClick={()=>resumeDraft(selectedSale)} className="btn-primary flex items-center gap-1.5 text-xs py-2"><FileText size={14}/> Reprendre le brouillon</button>
                    {isSA&&<button onClick={async()=>{if(!confirm('Supprimer ce brouillon ?'))return;const r=await window.electronAPI.deleteSaleDraft(selectedSale.id);if(r.success){setOk('Brouillon supprimé.');window.electronAPI.listSales().then(r=>{if(r.success)setSales(r.sales)});setSelectedSale(null)}else setErr(r.error)}} className="flex items-center gap-1.5 text-xs text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg font-medium"><Trash2 size={14}/> Supprimer</button>}
                  </>
                ):(
                  <>
                    <button onClick={()=>{setReprintTarget(selectedSale);setShowPrint(true);printSaleTicket(selectedSale,selectedSaleItems)}} className="btn-primary flex items-center gap-1.5 text-xs py-2"><Printer size={14}/> Ticket {ticketWidth}</button>
                    <button onClick={()=>{setLastSale(selectedSale);setClient(selectedSale.client_name?{id:selectedSale.client_id,name:selectedSale.client_name,phone:'',financial_balance:0,material_balance_crates:0}:null);setShowInvoice(true);printSaleInvoice(selectedSale,selectedSaleItems)}} className="btn-secondary flex items-center gap-1.5 text-xs py-2"><FileText size={14}/> Facture A4</button>
                    {isSA&&selectedSale.status!=='cancelled'&&<button onClick={()=>cancelSale(selectedSale.id)} className="flex items-center gap-1.5 text-xs text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg font-medium"><X size={14}/> Annuler la vente</button>}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Colonne 3 : impression ticket */}
        <div className="card space-y-3">
          <h4 className="text-sm font-bold flex items-center gap-2"><Printer size={16}/> Impression ticket</h4>
          <div>
            <label className="text-xs text-gray-400">Format</label>
            <div className="grid grid-cols-2 gap-1.5 mt-0.5">
              <button type="button" onClick={()=>setTicketWidth('80mm')} className={`text-xs py-1.5 rounded-lg border-2 ${ticketWidth==='80mm'?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-500'}`}>80mm</button>
              <button type="button" onClick={()=>setTicketWidth('48mm')} className={`text-xs py-1.5 rounded-lg border-2 ${ticketWidth==='48mm'?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200 text-gray-500'}`}>48mm</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400">Imprimante</label>
            <select value={selectedPrinter} onChange={e=>setSelectedPrinter(e.target.value)} className="input-field text-xs w-full">
              {printers.length===0&&<option value="">Imprimante par défaut</option>}
              {printers.map((p:any)=><option key={p.name} value={p.name}>{p.name}{p.isDefault?' (défaut)':''}</option>)}
            </select>
          </div>
          {printErr&&<p className="text-xs text-red-600">{printErr}</p>}
          <button onClick={()=>{if(selectedSale){setReprintTarget(selectedSale);setShowPrint(true);printSaleTicket(selectedSale,selectedSaleItems)}}} disabled={!selectedSale||printing} className="btn-primary w-full py-2.5 text-sm disabled:opacity-40 flex items-center justify-center gap-2"><Printer size={15}/> {printing?'Impression...':'Imprimer le ticket'}</button>
          {selectedSale?(
            <div className="bg-gray-50 border rounded-lg p-3 font-mono text-[10px] text-center space-y-1">
              <p className="font-bold text-xs">{depotName}</p>
              <p>{new Date(selectedSale.created_at).toLocaleString('fr-FR')}</p>
              <hr className="border-dashed"/>
              <SaleItemLines items={selectedSaleItems}/>
              {selectedSaleItems.length>0&&<hr className="border-dashed"/>}
              <p className="font-bold text-sm">TOTAL LIQUIDE: {selectedSale.total_amount?.toLocaleString()} FCFA</p>
              <p>{pmLabel(selectedSale.payment_method)} | {selectedSale.seller_name}</p>
              <hr className="border-dashed"/>
              <p className="font-bold">Client: {selectedSale.client_name||'Client comptoir'}</p>
              {(()=>{const mv=summarizeMovement(selectedSaleItems);return(<>
                <p>Casiers pris: {mv.cratesTaken}{mv.bottlesTaken>0?` | Bout: ${mv.bottlesTaken}`:''}</p>
                <p>Emballages rapportés: {mv.emptyCratesReturned}c{mv.emptyBottlesReturned>0?`+${mv.emptyBottlesReturned}b`:''}</p>
              </>);})()}
              <hr className="border-dashed"/>
              <p>Merci pour votre confiance !</p>
              <p className="text-gray-400">www.geststock-brasserie.cm</p>
              <Barcode seed={selectedSale.id||'x'}/>
            </div>
          ):<p className="text-xs text-gray-400 text-center py-6">Aucune facture sélectionnée</p>}
        </div>
      </div>
      )}

      {reprintTarget&&showPrint&&(()=>{const mv=summarizeMovement(selectedSaleItems);return(<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={()=>{setShowPrint(false);setReprintTarget(null)}}><div className="bg-white w-[300px] font-mono text-xs p-4 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="text-center mb-2"><p className="font-bold text-sm">{depotName}</p><p className="text-[10px]">{new Date(reprintTarget.created_at).toLocaleString('fr-FR')}</p><hr className="my-1 border-dashed"/></div><SaleItemLines items={selectedSaleItems}/>{selectedSaleItems.length>0&&<hr className="my-1 border-dashed"/>}<p className="text-center font-bold text-lg">TOTAL LIQUIDE: {reprintTarget.total_amount?.toLocaleString()} FCFA</p><p className="text-center text-[10px]">{pmLabel(reprintTarget.payment_method)} | {reprintTarget.seller_name}</p><hr className="my-1 border-dashed"/><p className="text-[10px] font-bold text-center">Client: {reprintTarget.client_name||'Client comptoir'}</p><p className="text-[10px] text-center">Casiers pris: {mv.cratesTaken}{mv.bottlesTaken>0?` | Bout: ${mv.bottlesTaken}`:''}</p><p className="text-[10px] text-center">Emballages rapportés: {mv.emptyCratesReturned} casier(s){mv.emptyBottlesReturned>0?` + ${mv.emptyBottlesReturned} bout.`:''}</p><hr className="my-1 border-dashed"/><p className="text-center text-[10px]">DUPLICATA — Merci !</p><Barcode seed={reprintTarget.id||'x'}/></div></div>);})()}
      {showInvoice&&selectedSale&&(()=>{const mv=summarizeMovement(selectedSaleItems);return(<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={()=>setShowInvoice(false)}><div className="bg-white w-[650px] max-h-[85vh] overflow-y-auto p-8 shadow-2xl text-sm" onClick={e=>e.stopPropagation()}><div className="flex justify-between border-b pb-4 mb-4"><div><h2 className="text-xl font-bold">FACTURE</h2><p className="text-xs">{depotName}</p></div><div className="text-right text-xs"><p>Date: {new Date(selectedSale.created_at).toLocaleDateString('fr-FR')}</p><p>N°: F-{selectedSale.id?.slice(0,8).toUpperCase()}</p><p>Vendeur: {selectedSale.seller_name}</p></div></div>
        <p className="font-bold mb-2">{selectedSale.client_name||'Client comptoir'}</p>
        <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
          <div className="bg-blue-50 rounded-lg p-2"><p className="text-gray-500">Casiers pris</p><p className="font-bold text-lg text-blue-700">{mv.cratesTaken}{mv.bottlesTaken>0?` (+${mv.bottlesTaken} bout.)`:''}</p></div>
          <div className="bg-amber-50 rounded-lg p-2"><p className="text-gray-500">Emballages rapportés</p><p className="font-bold text-lg text-amber-700">{mv.emptyCratesReturned} casier(s){mv.emptyBottlesReturned>0?` + ${mv.emptyBottlesReturned} bout.`:''}</p></div>
        </div>
        <h4 className="font-bold mb-2">DÉTAIL</h4><table className="w-full mb-4 text-xs"><thead><tr className="border-b"><th>Produit</th><th className="text-center">Qté</th><th>Mode</th><th className="text-center">Emballages rendus</th><th className="text-right">Prix</th></tr></thead><tbody>{selectedSaleItems.map((it:any,i:number)=>{const crate=(it.quantity_full_crates||0)>0;const q=crate?it.quantity_full_crates:it.quantity_loose_bottles;return(<tr key={i} className="border-b"><td>{it.product_name}</td><td className="text-center">{q}</td><td>{crate?'Casier':'Bouteille'}</td><td className="text-center">{it.quantity_empties_returned||0}/{q}</td><td className="text-right font-bold">{(it.total_price||0).toLocaleString()}F</td></tr>)})}</tbody></table>
        <div className="border-t pt-3"><div className="space-y-1 text-sm"><div className="flex justify-between font-bold text-lg"><span>TOTAL LIQUIDE</span><span>{selectedSale.total_amount?.toLocaleString()} FCFA</span></div>{((selectedSale.packaging_debt_crates||0)!==0||(selectedSale.packaging_debt_bottles||0)!==0)&&<p className="text-xs text-gray-500">Emballages : {formatPackagingDelta(selectedSale.packaging_debt_crates||0,selectedSale.packaging_debt_bottles||0)}</p>}</div><p className="text-xs mt-2">{pmLabel(selectedSale.payment_method)}</p></div></div></div>);})()}
    </div>
  );
  }

  if(view==='credits') {
    const debtClients=clients.filter(c=>c.financial_balance>0).sort((a,b)=>b.financial_balance-a.financial_balance);
    const totalDebt=debtClients.reduce((s,c)=>s+c.financial_balance,0);
    const creditSalesByClient=(clientId:string)=>sales.filter((s:any)=>s.client_id===clientId&&s.payment_method==='credit'&&s.status==='active');
    const filteredDebt=debtClients.filter(c=>c.name.toLowerCase().includes(histSearch.toLowerCase()));
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Ventes à crédit</h2>
            <p className="text-xs text-gray-400">{debtClients.length} client(s) avec une dette en cours</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={goSell} className="btn-primary flex items-center gap-2 text-sm py-2.5"><Plus size={16}/> Nouvelle facture</button>
            <div title={user?.full_name||user?.username} className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">{initials(user?.full_name||user?.username||'?')}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card"><p className="text-xs text-gray-400 uppercase">Total des dettes</p><p className="text-2xl font-bold text-red-600">{totalDebt.toLocaleString()} F</p></div>
          <div className="card"><p className="text-xs text-gray-400 uppercase">Clients concernés</p><p className="text-2xl font-bold text-gray-900">{debtClients.length}</p></div>
          <div className="card"><p className="text-xs text-gray-400 uppercase">Ventes à crédit actives</p><p className="text-2xl font-bold text-gray-900">{sales.filter((s:any)=>s.payment_method==='credit'&&s.status==='active').length}</p></div>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="p-3 border-b relative">
            <Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={histSearch} onChange={e=>setHistSearch(e.target.value)} placeholder="Rechercher un client..." className="input-field text-sm w-full !pl-9"/>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500 bg-gray-50"><th className="py-2 px-3">Client</th><th className="px-2">Téléphone</th><th className="px-2 text-center">Ventes à crédit</th><th className="px-2 text-right">Solde dû</th><th className="px-2 text-right">Actions</th></tr></thead>
            <tbody>
              {filteredDebt.length===0&&<tr><td colSpan={5} className="py-8 text-center text-gray-400">Aucune dette client.</td></tr>}
              {filteredDebt.map(c=>(
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-[10px] font-bold">{initials(c.name)}</div><span className="font-medium">{c.name}</span></div></td>
                  <td className="px-2 text-xs text-gray-500">{(c as any).phone||'—'}</td>
                  <td className="px-2 text-center">{creditSalesByClient(c.id).length}</td>
                  <td className="px-2 text-right font-bold text-red-600">{c.financial_balance.toLocaleString()} F</td>
                  <td className="px-2 text-right"><button onClick={()=>navigate('/clients',{state:{selectedClientId:c.id}})} className="text-xs text-primary-600 hover:underline">Voir / Rembourser</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Vente / Facturation</h2>
          <p className="text-xs text-gray-400">Nouvelle vente en cours</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={goHistory} className="btn-secondary flex items-center gap-2 text-sm py-2.5">
            <FileText size={16}/> Historique des ventes
          </button>
          <div className="flex items-center gap-1.5 pl-2 border-l">
            <button onClick={goCredits} title={`${clients.filter(c=>c.financial_balance>0).length} client(s) avec impayés — voir Ventes à crédit`} className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500">
              <Bell size={18}/>
              {clients.filter(c=>c.financial_balance>0).length>0&&<span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{clients.filter(c=>c.financial_balance>0).length}</span>}
            </button>
            <div title={user?.full_name||user?.username} className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
              {initials(user?.full_name||user?.username||'?')}
            </div>
          </div>
        </div>
      </div>

      {err&&<div className="bg-red-50 border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}
      {ok&&<div className="bg-green-50 border-green-200 text-green-700 text-sm rounded-lg p-3">{ok}</div>}

      {/* Facture en cours */}
      <div className="card">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-3 text-primary-700"><ReceiptText size={16}/> Facture en cours</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div><label className="text-gray-400 flex items-center gap-1"><Hash size={11}/> N° Facture</label><p className="font-semibold text-sm mt-0.5">{invoiceNumber}</p></div>
          <div><label className="text-gray-400 flex items-center gap-1"><Calendar size={11}/> Date</label><p className="font-semibold text-sm mt-0.5">{nowTick.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</p></div>
          <div>
            <label className="text-gray-400 flex items-center gap-1"><User size={11}/> Client</label>
            {!clientLocked?(
              <div className="flex gap-1 mt-0.5">
                <select className="input-field text-xs !py-1.5 flex-1" value={client?.id||''} onChange={e=>{const c=clients.find(x=>x.id===e.target.value);setClient(c||null);setClientLocked(true)}}>
                  <option value="">— Choisir —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" onClick={()=>{setClient(null);setClientLocked(true)}} className="text-[10px] px-2 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 whitespace-nowrap">Comptoir</button>
              </div>
            ):(
              <div className="flex items-center justify-between mt-0.5">
                <p className="font-semibold text-sm">{client?.name||'Client comptoir'}</p>
                <button type="button" onClick={()=>setClientLocked(false)} className="text-[10px] text-primary-600 hover:underline">Changer</button>
              </div>
            )}
          </div>
          <div><label className="text-gray-400 flex items-center gap-1"><User size={11}/> Vendeur</label><p className="font-semibold text-sm mt-0.5">{user?.full_name||user?.username}</p></div>
        </div>
        {!clientLocked&&<p className="text-[11px] text-amber-600 mt-2">⚠️ Choisissez le client (ou "Comptoir") avant de valider la facture.</p>}
        {client&&<div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 rounded p-2 mt-3"><User size={13}/> Solde: <b className={client.financial_balance>0?'text-red-600':'text-green-600'}>{client.financial_balance.toLocaleString()} F</b> | Casiers dus: {client.material_balance_crates||0}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="card space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input ref={sr} type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un produit (nom, brasserie...)" className="input-field w-full !pl-9" autoFocus/>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {CATS.map(c=>(
                <button key={c.key} onClick={()=>setCatFilter(c.key)} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${catFilter===c.key?'bg-primary-600 text-white':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{c.label}</button>
              ))}
            </div>
          </div>
          {results.length>0&&(<div className="border rounded-lg divide-y max-h-64 overflow-y-auto bg-white">{results.map(p=>(<button key={p.id} onClick={()=>addToTicket(p)} className="w-full text-left px-4 py-3 hover:bg-primary-50 flex justify-between"><div><span className="font-medium">{p.name}</span><span className="text-xs text-gray-500 ml-2">{p.brewery_name}</span></div><span className="text-sm font-bold text-primary-700">{p.sell_price_liquid.toLocaleString()} F</span></button>))}</div>)}

          <div className="card"><h3 className="text-lg font-bold mb-3 flex items-center gap-2"><ShoppingCart size={18}/> Panier</h3>
            {ticket.length===0?<p className="text-gray-400 text-sm py-4 text-center">Vide.</p>:(
              <table className="w-full text-sm"><thead><tr className="border-b text-left text-gray-500"><th>Article</th><th className="text-center">Qté</th><th>Mode</th><th className="text-center">Emballages apportés</th><th className="text-right">Total</th><th></th></tr></thead>
                <tbody>{ticket.map((t,i)=>{const liq=t.mode==='crate'?t.product.sell_price_liquid*t.quantity:t.product.sell_price_liquid/t.product.units_per_crate*t.quantity;const delta=t.quantity-t.emballagesApportes;const unit=t.mode==='crate'?'casier':'bouteille';return(<tr key={i} className="border-b"><td className="py-2 font-medium text-xs">{t.product.name}</td><td className="py-2 text-center"><div className="flex items-center justify-center gap-1"><button onClick={()=>upQty(i,-1)} className="w-5 h-5 rounded bg-gray-200 flex items-center justify-center"><Minus size={11}/></button><span className="w-8 text-center font-bold">{t.quantity}</span><button onClick={()=>upQty(i,1)} className="w-5 h-5 rounded bg-gray-200 flex items-center justify-center"><Plus size={11}/></button></div></td><td className="py-2"><button onClick={()=>toggleMode(i)} className={`text-xs px-2 py-0.5 rounded inline-flex items-center gap-1 ${t.mode==='crate'?'bg-blue-100 text-blue-800':'bg-purple-100 text-purple-800'}`}>{t.mode==='crate'?<><Package size={11}/> Casier</>:<><Wine size={11}/> Bouteille</>}</button></td><td className="py-2"><div className="flex items-center justify-center gap-1"><input type="number" min={0} value={t.emballagesApportes} onChange={e=>upEmb(i,+e.target.value)} className="w-14 text-xs border rounded px-1 py-0.5 text-center"/><span className="text-[10px] text-gray-400">/{t.quantity}</span></div></td><td className="py-2 text-right font-bold text-xs">{liq.toLocaleString()} F{delta!==0&&<span className={delta>0?'text-red-500':'text-green-500'}> {delta>0?`+${delta} ${unit}${delta>1?'s':''} dû`:`${Math.abs(delta)} ${unit}${Math.abs(delta)>1?'s':''} en crédit`}</span>}</td><td className="py-2"><button onClick={()=>setTicket(prev=>prev.filter((_,j)=>j!==i))} className="text-red-500"><Trash2 size={14}/></button></td></tr>)})}</tbody></table>)}
          </div>
        </div>

        <div className="space-y-4">
          {pmode==='credit'&&(<div className="card border-red-200 bg-red-50"><h4 className="text-sm font-bold text-red-800 mb-2 flex items-center gap-1.5"><User size={14}/> Vente à crédit</h4>{client?<p className="text-xs">{client.name} — Dette actuelle : <b className="text-red-700">{client.financial_balance?.toLocaleString()} F</b></p>:<p className="text-xs text-red-700">Sélectionnez un client dans la Facture en cours ci-dessus.</p>}</div>)}

          {/* Total Liquide = produit + consignation/déconsignation */}
          <div className="card">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Liquide</p>
            <p className="text-3xl font-bold text-gray-900">{grandTotal.toLocaleString()} FCFA</p>
            {(packagingDebtCrates!==0||packagingDebtBottles!==0)&&<p className={`text-xs mt-1 ${(packagingDebtCrates>0||packagingDebtBottles>0)?'text-red-500':'text-green-600'}`}>Emballages : {formatPackagingDelta(packagingDebtCrates,packagingDebtBottles)}</p>}
          </div>

          <div className="card"><h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5"><CreditCard size={14}/> Paiement</h4><div className="grid grid-cols-2 gap-2">
            <button onClick={()=>setPmode('cash')} className={`p-3 rounded-lg text-sm border-2 flex flex-col items-center gap-1 ${pmode==='cash'?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200'}`}><Banknote size={20}/><span className="text-[11px]">Espèces (F2)</span></button>
            <button onClick={()=>setPmode('credit')} className={`p-3 rounded-lg text-sm border-2 flex flex-col items-center gap-1 ${pmode==='credit'?'border-primary-500 bg-primary-50 text-primary-700':'border-gray-200'}`}><FileText size={20}/><span className="text-[11px]">Crédit (F8)</span></button>
          </div>
          {pmode==='cash'&&(
            <div className="mt-3 pt-3 border-t space-y-1.5">
              <label className="text-xs text-gray-500">Montant reçu</label>
              <input type="number" className="input-field text-sm" placeholder={`${grandTotal.toLocaleString()} FCFA`} value={cashReceived} onChange={e=>setCashReceived(e.target.value===''?'':+e.target.value)} />
              {cashReceived!==''&&cashReceived>=grandTotal&&(
                <div className="bg-primary-50 text-primary-700 rounded-lg p-2 flex justify-between text-sm font-bold"><span>Monnaie à rendre</span><span>{(cashReceived-grandTotal).toLocaleString()} FCFA</span></div>
              )}
              {cashReceived!==''&&cashReceived<grandTotal&&(
                <p className="text-xs text-red-500">Montant insuffisant ({(grandTotal-cashReceived).toLocaleString()} F manquants)</p>
              )}
            </div>
          )}
          </div>
          <button onClick={validate} className="btn-primary w-full py-3 font-bold flex items-center justify-center gap-2" disabled={ticket.length===0||!clientLocked||(!client&&(packagingDebtCrates>0||packagingDebtBottles>0))} title={!clientLocked?'Choisissez le client avant de valider':(!client&&(packagingDebtCrates>0||packagingDebtBottles>0))?'Un client doit être sélectionné : des emballages restent dus':''}><Check size={16}/> Valider (Entrée)</button>
          <button onClick={saveDraft} className="btn-secondary w-full text-sm flex items-center justify-center gap-2" disabled={ticket.length===0}><FileText size={15}/> Enregistrer en brouillon</button>
          <button onClick={clear} className="btn-secondary w-full text-sm flex items-center justify-center gap-2"><X size={15}/> Annuler (Échap)</button>
          {validated&&(<><button onClick={()=>{setShowPrint(true);printLastSaleTicket()}} className="btn-secondary w-full text-sm flex items-center justify-center gap-2"><Printer size={15}/> Ticket {ticketWidth} (F5)</button><button onClick={()=>{setShowInvoice(true);printLastSaleInvoice()}} className="btn-secondary w-full text-sm flex items-center justify-center gap-2"><FileText size={15}/> Facture A4</button></>)}
          {!validated&&<p className="text-xs text-gray-400 text-center">Validez pour imprimer</p>}
        </div>
      </div>

      {showPrint&&validated&&(()=>{
        const mv=summarizeMovement(lastTicketSnapshot.map(t=>({quantity_full_crates:t.mode==='crate'?t.quantity:0,quantity_loose_bottles:t.mode==='loose'?t.quantity:0,quantity_empties_returned:t.emballagesApportes})));
        const liq=lastSale?.total_liquid??totalLiquid; const tot=lastSale?.total_amount??grandTotal;
        const debtCrates=mv.cratesTaken-mv.emptyCratesReturned; const debtBottles=mv.bottlesTaken-mv.emptyBottlesReturned;
        return (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={()=>setShowPrint(false)}><div className="bg-white w-[300px] font-mono text-xs p-4 shadow-2xl" onClick={e=>e.stopPropagation()}><div className="text-center mb-2"><p className="font-bold text-sm">{depotName}</p><p className="text-[10px]">{new Date(lastSale?.created_at||Date.now()).toLocaleString('fr-FR')}</p><p className="text-[10px]">Vendeur: {user?.full_name||user?.username}</p><hr className="my-1 border-dashed"/></div><table className="w-full text-[10px]"><tbody>{lastTicketSnapshot.map((t,i)=>{const l=t.mode==='crate'?t.product.sell_price_liquid*t.quantity:t.product.sell_price_liquid/t.product.units_per_crate*t.quantity;return(<tr key={i}><td>{t.product.name} x{t.quantity} {t.mode==='crate'?'c':'u'}</td><td className="text-right font-bold">{l.toLocaleString()}F</td></tr>)})}</tbody></table><hr className="my-1 border-dashed"/><p className="font-bold text-sm">TOTAL LIQUIDE: {tot.toLocaleString()} FCFA</p><p className="text-[10px] mt-1">{pmLabel(lastPmode)}</p>{lastPmode==='cash'&&lastCashReceived!==''&&lastCashReceived>=tot&&(<><p className="text-[10px]">Montant reçu: {Number(lastCashReceived).toLocaleString()} FCFA</p><p className="text-[10px] font-bold">Monnaie à rendre: {(Number(lastCashReceived)-tot).toLocaleString()} FCFA</p></>)}<hr className="my-1 border-dashed"/><p className="text-[10px] font-bold">Client: {lastSaleClient?.name||lastSale?.client_name||'Client comptoir'}</p><p className="text-[10px]">Casiers pris: {mv.cratesTaken}{mv.bottlesTaken>0?` | Bouteilles: ${mv.bottlesTaken}`:''}</p><p className="text-[10px]">Emballages rapportés: {mv.emptyCratesReturned} casier(s){mv.emptyBottlesReturned>0?` + ${mv.emptyBottlesReturned} bout.`:''}</p>{(debtCrates!==0||debtBottles!==0)&&<p className="text-[10px] font-bold">Dette d'emballage : {formatPackagingDelta(debtCrates,debtBottles)}</p>}{lastSaleClient&&<p className="text-[10px]">Nouveau solde: ~{(lastSaleClient.financial_balance+tot).toLocaleString()} F</p>}<hr className="my-1 border-dashed"/><p className="text-center text-[10px]">Merci ! GestStock v1.0</p><Barcode seed={lastSale?.id||String(Date.now())}/></div></div>);
      })()}

      {showInvoice&&validated&&(()=>{
        const mv=summarizeMovement(lastTicketSnapshot.map(t=>({quantity_full_crates:t.mode==='crate'?t.quantity:0,quantity_loose_bottles:t.mode==='loose'?t.quantity:0,quantity_empties_returned:t.emballagesApportes})));
        const liq=lastSale?.total_liquid??totalLiquid; const tot=lastSale?.total_amount??grandTotal;
        const debtCrates=mv.cratesTaken-mv.emptyCratesReturned; const debtBottles=mv.bottlesTaken-mv.emptyBottlesReturned;
        return (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={()=>setShowInvoice(false)}><div className="bg-white w-[650px] max-h-[85vh] overflow-y-auto p-8 shadow-2xl text-sm" onClick={e=>e.stopPropagation()}><div className="flex justify-between border-b pb-4 mb-4"><div><h2 className="text-xl font-bold">FACTURE</h2><p className="text-xs">{depotName}</p></div><div className="text-right text-xs"><p>Date: {new Date(lastSale?.created_at||Date.now()).toLocaleDateString('fr-FR')}</p><p>N°: {invoiceNumber}</p><p>Vendeur: {user?.full_name||user?.username}</p></div></div>
        <p className="font-bold mb-1">{lastSaleClient?.name||lastSale?.client_name||'Client comptoir'}</p>
        {lastSaleClient&&<p className="text-xs text-gray-500 mb-2">{lastSaleClient.phone} — Ancien solde: {lastSaleClient.financial_balance?.toLocaleString()} F — Nouveau solde: ~{(lastSaleClient.financial_balance+tot).toLocaleString()} F</p>}
        <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
          <div className="bg-blue-50 rounded-lg p-2"><p className="text-gray-500">Casiers pris</p><p className="font-bold text-lg text-blue-700">{mv.cratesTaken}{mv.bottlesTaken>0?` (+${mv.bottlesTaken} bout.)`:''}</p></div>
          <div className="bg-amber-50 rounded-lg p-2"><p className="text-gray-500">Emballages rapportés</p><p className="font-bold text-lg text-amber-700">{mv.emptyCratesReturned} casier(s){mv.emptyBottlesReturned>0?` + ${mv.emptyBottlesReturned} bout.`:''}</p></div>
        </div>
        {(debtCrates!==0||debtBottles!==0)&&<p className={`text-xs mb-4 font-medium ${debtCrates>0||debtBottles>0?'text-red-600':'text-green-600'}`}>Dette d'emballage : {formatPackagingDelta(debtCrates,debtBottles)}</p>}
        <h4 className="font-bold mb-2">DÉTAIL</h4><table className="w-full mb-4 text-xs"><thead><tr className="border-b"><th>Produit</th><th className="text-center">Qté</th><th>Mode</th><th className="text-center">Emballages rendus</th><th className="text-right">Prix</th></tr></thead><tbody>{lastTicketSnapshot.map((t,i)=>{const l=t.mode==='crate'?t.product.sell_price_liquid*t.quantity:t.product.sell_price_liquid/t.product.units_per_crate*t.quantity;return(<tr key={i} className="border-b"><td>{t.product.name}</td><td className="text-center">{t.quantity}</td><td>{t.mode==='crate'?'Casier':'Bouteille'}</td><td className="text-center">{t.emballagesApportes}/{t.quantity}</td><td className="text-right font-bold">{l.toLocaleString()}F</td></tr>)})}</tbody></table>
        <div className="border-t pt-3"><div className="space-y-1 text-sm"><div className="flex justify-between font-bold text-lg"><span>TOTAL LIQUIDE</span><span>{tot.toLocaleString()} FCFA</span></div></div><p className="text-xs mt-2">{pmLabel(lastPmode)}</p>{lastPmode==='cash'&&lastCashReceived!==''&&lastCashReceived>=tot&&(<div className="flex justify-between text-sm mt-2 pt-2 border-t"><span>Montant reçu / Monnaie à rendre</span><span>{Number(lastCashReceived).toLocaleString()} F / {(Number(lastCashReceived)-tot).toLocaleString()} F</span></div>)}</div></div></div>);
      })()}
    </div>
  );}
