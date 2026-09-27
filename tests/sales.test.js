// Tests des ventes : calcul du prix, consignation/déconsignation/échange,
// mouvements de stock, atomicité de la transaction (non-régression des bugs corrigés).
const h = require('./_harness');

async function run() {
  const { call, db, teardown } = await h.setup();
  h.loginAs('super_admin', 'test_admin_sales');

  let product = db.dbGet("SELECT * FROM products WHERE name='33 Export 65cl' AND is_active=1");
  h.ok(!!product, 'Produit de référence trouvé dans le catalogue de base');
  // Consigne fixée explicitement : les produits fraîchement semés ont consigne_amount=0 par défaut,
  // ce qui rendrait les assertions sur la consignation triviales (0 == 0).
  db.dbRun('UPDATE products SET stock_full_crates=?, stock_loose_bottles=?, consigne_amount=? WHERE id=?', [10, 50, 1200, product.id]);
  product = db.dbGet('SELECT * FROM products WHERE id=?', [product.id]);

  // --- Prix : casier = prix produit, bouteille = prix / unités par casier ---
  {
    const r = call('sales:create', {
      client_id: '', payment_method: 'cash',
      items: [{ product_id: product.id, quantity_full_crates: 3, quantity_loose_bottles: 0, quantity_empties_returned: 3 }],
    });
    h.ok(r.success, 'Vente 3 casiers (échange complet) créée');
    h.eq(r.sale.total_liquid, 3 * product.sell_price_liquid, 'Prix casier = qté × prix casier (pas × unités/casier)');
    h.eq(r.sale.total_consigne, 0, 'Échange complet → consigne nette = 0');
  }

  // --- La consignation n'est plus facturée en argent : une vente sans client
  // (comptoir) et avec un écart d'emballage positif doit être REFUSÉE, car la
  // dette d'emballage n'aurait nulle part où être enregistrée. ---
  {
    const r = call('sales:create', {
      client_id: '', payment_method: 'cash',
      items: [{ product_id: product.id, quantity_full_crates: 2, quantity_loose_bottles: 0, quantity_empties_returned: 0 }],
    });
    h.ok(!r.success, 'Vente comptoir avec emballages manquants refusée (aucun client pour porter la dette)');
  }

  // --- Dette d'emballage : moins d'emballages rendus que pris → dette matérielle
  // sur le client, pas d'argent dans le total facturé. ---
  {
    const { v4: uuidv4 } = require(require('path').join(__dirname, '..', 'node_modules', 'uuid'));
    const clientId = uuidv4();
    db.dbRun("INSERT INTO clients (id, name, phone) VALUES (?,?,?)", [clientId, 'Client Consignation', '000']);
    const r = call('sales:create', {
      client_id: clientId, payment_method: 'cash',
      items: [{ product_id: product.id, quantity_full_crates: 2, quantity_loose_bottles: 0, quantity_empties_returned: 0 }],
    });
    h.ok(r.success, 'Vente 2 casiers sans emballage rendu créée (client sélectionné)');
    h.eq(r.sale.total_consigne, 0, "La consignation n'est plus facturée en argent (total_consigne toujours 0)");
    h.eq(r.sale.total_amount, r.sale.total_liquid, 'Total facturé = uniquement le prix des produits');
    h.eq(r.sale.packaging_debt_crates, 2, 'Dette d\'emballage stockée sur la vente = 2 casiers');
    const items = call('sale:items', r.sale.id).items;
    h.eq(items[0].consigne_status, 'consignation', "Statut dérivé (informatif) = 'consignation'");
    const client = db.dbGet('SELECT * FROM clients WHERE id=?', [clientId]);
    h.eq(client.material_balance_crates, 2, 'Le solde matériel du client augmente de 2 casiers dus');
    h.eq(client.financial_balance, 0, 'Le solde financier du client est inchangé (aucun argent en jeu)');

    // --- Annulation : la dette d'emballage doit être retirée du client ---
    const cancel = call('sale:cancel', r.sale.id);
    h.ok(cancel.success, 'Annulation de la vente acceptée');
    const clientAfterCancel = db.dbGet('SELECT * FROM clients WHERE id=?', [clientId]);
    h.eq(clientAfterCancel.material_balance_crates, 0, "Dette d'emballage annulée après l'annulation de la vente");
  }

  // --- Déconsignation : plus d'emballages rendus que pris (en bouteilles) → crédit
  // matériel, une vente comptoir reste acceptée puisqu'il n'y a pas de dette à porter. ---
  {
    const r = call('sales:create', {
      client_id: '', payment_method: 'cash',
      items: [{ product_id: product.id, quantity_full_crates: 0, quantity_loose_bottles: 5, quantity_empties_returned: 8 }],
    });
    h.ok(r.success, 'Vente 5 bouteilles, 8 emballages rendus créée (comptoir, crédit d\'emballage)');
    h.eq(r.sale.total_consigne, 0, "La déconsignation n'est plus facturée en argent");
    const items = call('sale:items', r.sale.id).items;
    h.eq(items[0].consigne_status, 'deconsignation', "Statut dérivé = 'deconsignation'");
  }

  // --- Mouvements de stock générés (sortie produit + restitution emballages) ---
  {
    const before = db.dbAll("SELECT COUNT(*) as c FROM packaging_movements WHERE type IN ('sortie','restitution')")[0].c;
    const r = call('sales:create', {
      client_id: '', payment_method: 'cash',
      items: [{ product_id: product.id, quantity_full_crates: 1, quantity_loose_bottles: 0, quantity_empties_returned: 1 }],
    });
    const after = db.dbAll("SELECT COUNT(*) as c FROM packaging_movements WHERE type IN ('sortie','restitution')")[0].c;
    h.ok(r.success && after === before + 2, 'La vente crée bien un mouvement "sortie" + un "restitution"');
  }

  // --- Stock insuffisant : la vente doit échouer ET ne rien modifier (atomicité) ---
  {
    const before = db.dbGet('SELECT stock_full_crates FROM products WHERE id=?', [product.id]);
    const itemsBefore = db.dbAll('SELECT COUNT(*) as c FROM sale_items')[0].c;
    const r = call('sales:create', {
      client_id: '', payment_method: 'cash',
      items: [
        { product_id: product.id, quantity_full_crates: 1, quantity_loose_bottles: 0, quantity_empties_returned: 1 },
        { product_id: product.id, quantity_full_crates: 999, quantity_loose_bottles: 0, quantity_empties_returned: 999 },
      ],
    });
    h.ok(!r.success, 'Vente avec stock insuffisant sur la 2e ligne est rejetée');
    const after = db.dbGet('SELECT stock_full_crates FROM products WHERE id=?', [product.id]);
    const itemsAfter = db.dbAll('SELECT COUNT(*) as c FROM sale_items')[0].c;
    h.eq(after.stock_full_crates, before.stock_full_crates, "Stock inchangé après l'échec (rollback complet, y compris la 1ère ligne valide)");
    h.eq(itemsAfter, itemsBefore, 'Aucune ligne de vente insérée après le rollback');
  }

  // --- Vente à crédit : le solde du client augmente du bon montant ---
  {
    const { v4: uuidv4 } = require(require('path').join(__dirname, '..', 'node_modules', 'uuid'));
    const clientId = uuidv4();
    db.dbRun("INSERT INTO clients (id, name, phone) VALUES (?,?,?)", [clientId, 'Client Test Harnais', '000']);
    const r = call('sales:create', {
      client_id: clientId, payment_method: 'credit',
      items: [{ product_id: product.id, quantity_full_crates: 1, quantity_loose_bottles: 0, quantity_empties_returned: 1 }],
    });
    const client = db.dbGet('SELECT * FROM clients WHERE id=?', [clientId]);
    h.eq(client.financial_balance, r.sale.total_amount, 'Solde client = montant exact de la vente à crédit');
  }

  teardown();
  return h.summary('Ventes');
}

module.exports = { run };
if (require.main === module) run().then(ok => process.exit(ok ? 0 : 1));
