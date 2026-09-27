// Tests inventaire : entrée de stock, journalisation des mouvements,
// annulation de vente (restauration du stock).
const h = require('./_harness');

async function run() {
  const { call, db, teardown } = await h.setup();
  h.loginAs('super_admin', 'test_admin_inventory');

  const product = db.dbGet("SELECT * FROM products WHERE name='33 Export 33cl' AND is_active=1");
  h.ok(!!product, 'Produit de référence trouvé');
  db.dbRun('UPDATE products SET stock_full_crates=5, stock_loose_bottles=10 WHERE id=?', [product.id]);

  // --- Entrée de stock : met à jour le stock ET journalise un mouvement ---
  {
    const movementsBefore = db.dbAll("SELECT COUNT(*) as c FROM packaging_movements WHERE type='entree'")[0].c;
    const r = call('stock:entry', { product_id: product.id, quantity_crates: 5, quantity_loose: 20, bl_number: 'BL-001' });
    h.ok(r.success, 'Entrée de stock acceptée');
    const updated = db.dbGet('SELECT * FROM products WHERE id=?', [product.id]);
    h.eq(updated.stock_full_crates, 10, 'Casiers : 5 + 5 = 10');
    h.eq(updated.stock_loose_bottles, 30, 'Bouteilles : 10 + 20 = 30');
    const movementsAfter = db.dbAll("SELECT COUNT(*) as c FROM packaging_movements WHERE type='entree'")[0].c;
    h.eq(movementsAfter, movementsBefore + 1, "L'entrée de stock crée un mouvement 'entree' (traçabilité)");
  }

  // --- Annulation de vente : restaure le stock et neutralise le solde crédit ---
  {
    const { v4: uuidv4 } = require(require('path').join(__dirname, '..', 'node_modules', 'uuid'));
    const clientId = uuidv4();
    db.dbRun("INSERT INTO clients (id, name, phone) VALUES (?,?,?)", [clientId, 'Client Annulation', '000']);
    const before = db.dbGet('SELECT * FROM products WHERE id=?', [product.id]);
    const sale = call('sales:create', {
      client_id: clientId, payment_method: 'credit',
      items: [{ product_id: product.id, quantity_full_crates: 2, quantity_loose_bottles: 0, quantity_empties_returned: 2 }],
    });
    h.ok(sale.success, 'Vente à crédit créée pour test annulation');
    const clientAfterSale = db.dbGet('SELECT * FROM clients WHERE id=?', [clientId]);
    h.ok(clientAfterSale.financial_balance > 0, 'Le client a une dette après la vente');

    const cancel = call('sale:cancel', sale.sale.id);
    h.ok(cancel.success, 'Annulation de la vente acceptée (super admin)');
    const afterCancel = db.dbGet('SELECT * FROM products WHERE id=?', [product.id]);
    h.eq(afterCancel.stock_full_crates, before.stock_full_crates, 'Stock casiers restauré après annulation');
    const clientAfterCancel = db.dbGet('SELECT * FROM clients WHERE id=?', [clientId]);
    h.eq(clientAfterCancel.financial_balance, 0, "Solde client remis à 0 après annulation");
  }

  teardown();
  return h.summary('Inventaire');
}

module.exports = { run };
if (require.main === module) run().then(ok => process.exit(ok ? 0 : 1));
