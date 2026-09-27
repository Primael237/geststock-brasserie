// ============================================================
// GestStock Brasserie v1.0 — Génération HTML pour impression réelle
// (CSS inline, sans Tailwind — plus fiable dans une fenêtre isolée)
// ============================================================

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function wrap(bodyHtml: string, pageCss: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: 'Courier New', monospace; color: #111; }
    table { width: 100%; border-collapse: collapse; }
    ${pageCss}
  </style></head><body>${bodyHtml}</body></html>`;
}

export interface PrintTicketData {
  depotName: string;
  createdAt: string;
  seller: string;
  lines: { name: string; qty: number; unitLabel: string; total: number }[];
  totalLiquid: number;
  paymentLabel: string;
  cashReceived?: number;
  clientName: string;
  cratesTaken: number;
  bottlesTaken: number;
  emptyCratesReturned: number;
  emptyBottlesReturned: number;
  debtCrates: number;
  debtBottles: number;
  saleRef: string;
}

export type TicketWidth = '80mm' | '48mm';

export function buildTicketHtml(d: PrintTicketData, width: TicketWidth = '80mm'): string {
  const narrow = width === '48mm';
  const fs = narrow ? 8 : 10;
  const fsTitle = narrow ? 10 : 13;
  const margin = narrow ? 2 : 3;
  const rows = d.lines.map(l => `<tr><td style="font-size:${fs}px;">${escapeHtml(l.name)} x${l.qty} ${l.unitLabel}</td><td style="text-align:right;font-weight:bold;font-size:${fs}px;">${l.total.toLocaleString()}F</td></tr>`).join('');
  const debtLine = (d.debtCrates !== 0 || d.debtBottles !== 0)
    ? `<p style="font-size:${fs}px;font-weight:bold;">Dette d'emballage : ${d.debtCrates !== 0 ? `${d.debtCrates > 0 ? '+' : ''}${d.debtCrates} casier(s) ` : ''}${d.debtBottles !== 0 ? `${d.debtBottles > 0 ? '+' : ''}${d.debtBottles} bouteille(s)` : ''}</p>`
    : '';
  const body = `
    <div style="text-align:center;margin-bottom:6px;">
      <p style="font-weight:bold;font-size:${fsTitle}px;margin:0;">${escapeHtml(d.depotName)}</p>
      <p style="font-size:${fs}px;margin:2px 0;">${escapeHtml(d.createdAt)}</p>
      <p style="font-size:${fs}px;margin:0;">Vendeur: ${escapeHtml(d.seller)}</p>
      <hr style="border-top:1px dashed #999;margin:4px 0;"/>
    </div>
    <table>${rows}</table>
    <hr style="border-top:1px dashed #999;margin:4px 0;"/>
    <p style="font-weight:bold;font-size:${fsTitle}px;text-align:center;">TOTAL LIQUIDE: ${d.totalLiquid.toLocaleString()} FCFA</p>
    <p style="font-size:${fs}px;text-align:center;">${escapeHtml(d.paymentLabel)}</p>
    <hr style="border-top:1px dashed #999;margin:4px 0;"/>
    <p style="font-size:${fs}px;font-weight:bold;text-align:center;">Client: ${escapeHtml(d.clientName)}</p>
    <p style="font-size:${fs}px;text-align:center;">Casiers pris: ${d.cratesTaken}${d.bottlesTaken > 0 ? ` | Bouteilles: ${d.bottlesTaken}` : ''}</p>
    <p style="font-size:${fs}px;text-align:center;">Emballages rapportés: ${d.emptyCratesReturned} casier(s)${d.emptyBottlesReturned > 0 ? ` + ${d.emptyBottlesReturned} bout.` : ''}</p>
    <div style="text-align:center;">${debtLine}</div>
    <hr style="border-top:1px dashed #999;margin:4px 0;"/>
    <p style="text-align:center;font-size:${fs}px;">Merci pour votre confiance ! GestStock v1.0</p>
  `;
  return wrap(body, `@page { size: ${width} auto; margin: ${margin}mm; }`);
}

export interface PrintInvoiceData {
  depotName: string;
  invoiceNumber: string;
  createdAt: string;
  seller: string;
  clientName: string;
  lines: { name: string; qty: number; modeLabel: string; empties: number; total: number }[];
  totalLiquid: number;
  paymentLabel: string;
  cratesTaken: number;
  bottlesTaken: number;
  emptyCratesReturned: number;
  emptyBottlesReturned: number;
  debtCrates: number;
  debtBottles: number;
}

export function buildInvoiceA4Html(d: PrintInvoiceData): string {
  const rows = d.lines.map(l => `<tr style="border-bottom:1px solid #ddd;"><td>${escapeHtml(l.name)}</td><td style="text-align:center;">${l.qty}</td><td>${escapeHtml(l.modeLabel)}</td><td style="text-align:center;">${l.empties}/${l.qty}</td><td style="text-align:right;font-weight:bold;">${l.total.toLocaleString()}F</td></tr>`).join('');
  const debtLine = (d.debtCrates !== 0 || d.debtBottles !== 0)
    ? `<p style="font-size:12px;font-weight:bold;color:${d.debtCrates > 0 || d.debtBottles > 0 ? '#b91c1c' : '#15803d'};">Dette d'emballage : ${d.debtCrates !== 0 ? `${d.debtCrates > 0 ? '+' : ''}${d.debtCrates} casier(s) ` : ''}${d.debtBottles !== 0 ? `${d.debtBottles > 0 ? '+' : ''}${d.debtBottles} bouteille(s)` : ''}</p>`
    : '';
  const body = `
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:12px;">
      <div><h2 style="margin:0;font-size:20px;">FACTURE</h2><p style="font-size:11px;margin:2px 0;">${escapeHtml(d.depotName)}</p></div>
      <div style="text-align:right;font-size:11px;"><p style="margin:2px 0;">Date: ${escapeHtml(d.createdAt)}</p><p style="margin:2px 0;">N°: ${escapeHtml(d.invoiceNumber)}</p><p style="margin:2px 0;">Vendeur: ${escapeHtml(d.seller)}</p></div>
    </div>
    <p style="font-weight:bold;font-size:14px;">${escapeHtml(d.clientName)}</p>
    <div style="display:flex;gap:12px;margin:12px 0;font-size:12px;">
      <div style="background:#eff6ff;border-radius:8px;padding:8px 12px;flex:1;"><p style="margin:0;color:#666;">Casiers pris</p><p style="margin:0;font-weight:bold;font-size:16px;color:#1d4ed8;">${d.cratesTaken}${d.bottlesTaken > 0 ? ` (+${d.bottlesTaken} bout.)` : ''}</p></div>
      <div style="background:#fffbeb;border-radius:8px;padding:8px 12px;flex:1;"><p style="margin:0;color:#666;">Emballages rapportés</p><p style="margin:0;font-weight:bold;font-size:16px;color:#b45309;">${d.emptyCratesReturned} casier(s)${d.emptyBottlesReturned > 0 ? ` + ${d.emptyBottlesReturned} bout.` : ''}</p></div>
    </div>
    ${debtLine}
    <h4 style="margin:16px 0 8px;">DÉTAIL</h4>
    <table style="font-size:12px;"><thead><tr style="border-bottom:2px solid #333;"><th style="text-align:left;">Produit</th><th>Qté</th><th style="text-align:left;">Mode</th><th>Emballages rendus</th><th style="text-align:right;">Prix</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="border-top:2px solid #333;padding-top:12px;margin-top:12px;">
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:18px;"><span>TOTAL LIQUIDE</span><span>${d.totalLiquid.toLocaleString()} FCFA</span></div>
      <p style="font-size:12px;margin-top:8px;">${escapeHtml(d.paymentLabel)}</p>
    </div>
  `;
  return wrap(body, `@page { size: A4; margin: 15mm; }`);
}

export interface PrintInventoryRow {
  code: string;
  name: string;
  breweryName: string;
  format: string;
  theoCrates: number;
  theoBottles: number;
  physCrates: number;
  physBottles: number;
}

export function buildInventoryA4Html(depotName: string, breweryFilterLabel: string, rows: PrintInventoryRow[]): string {
  const body = `
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:12px;">
      <div><h2 style="margin:0;font-size:18px;">FICHE D'INVENTAIRE</h2><p style="font-size:11px;margin:2px 0;">Dépôt ${escapeHtml(depotName)}</p></div>
      <div style="text-align:right;font-size:11px;"><p style="margin:2px 0;">Date: ${new Date().toLocaleString('fr-FR')}</p><p style="margin:2px 0;">${escapeHtml(breweryFilterLabel)}</p></div>
    </div>
    <table style="font-size:10px;"><thead><tr style="border-bottom:2px solid #333;"><th style="text-align:left;">Code</th><th style="text-align:left;">Produit</th><th style="text-align:left;">Brasserie</th><th>Format</th><th>Stock Théorique</th><th>Stock Physique Compté</th><th>Écart</th></tr></thead>
      <tbody>${rows.map(r => {
        const ecartCrates = r.physCrates - r.theoCrates;
        const ecartBottles = r.physBottles - r.theoBottles;
        const hasEcart = ecartCrates !== 0 || ecartBottles !== 0;
        const color = !hasEcart ? '#888' : (ecartCrates < 0 || ecartBottles < 0) ? '#b91c1c' : '#15803d';
        const ecartText = !hasEcart ? '0' : `${ecartCrates !== 0 ? `${ecartCrates > 0 ? '+' : ''}${ecartCrates}c ` : ''}${ecartBottles !== 0 ? `${ecartBottles > 0 ? '+' : ''}${ecartBottles}u` : ''}`;
        return `<tr style="border-bottom:1px solid #ddd;"><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.breweryName)}</td><td>${escapeHtml(r.format)}</td><td style="text-align:center;">${r.theoCrates}c / ${r.theoBottles}u</td><td style="text-align:center;">${r.physCrates}c / ${r.physBottles}u</td><td style="text-align:center;color:${color};font-weight:bold;">${ecartText}</td></tr>`;
      }).join('')}</tbody>
    </table>
    <div style="display:flex;justify-content:space-between;margin-top:32px;font-size:11px;">
      <div><p style="border-top:1px solid #333;padding-top:8px;">Magasinier: _____________</p><p>Date: ____/____/________</p></div>
      <div><p style="border-top:1px solid #333;padding-top:8px;">Gérant: _____________</p><p>Date: ____/____/________</p></div>
    </div>
  `;
  return wrap(body, `@page { size: A4; margin: 12mm; }`);
}
