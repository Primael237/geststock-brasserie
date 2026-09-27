// Tests des brouillons de facture : aucun impact stock/client tant que non validés,
// suppression réservée aux brouillons.
const h = require('./_harness');

async function run() {
  const { call, db, teardown } = await h.setup();
  h.loginAs('super_admin', 'test_admin_drafts');

  const product = db.dbGet("SELECT * FROM products WHERE name='33 Export 65cl' AND is_active=1");
  db.dbRun('UPDATE products SET stock_full_crates=10, stock_loose_bottles=0, consigne_amount=1200 WHERE id=?', [product.id]);

  // --- Enregistrer un brouillon : aucun effet sur le stock ni les mouvements ---
  {
    const movementsBefore = db.dbAll("SELECT COUNT(*) as c FROM packaging_movements")[0].c;
    const r = call('sales:save-draft', {
      client_id: '', payment_method: 'cash',
      items: [{ product_id: product.id, quantity_full_crates: 3, quantity_loose_bottles: 0, quantity_empties_returned: 3 }],
    });
    h.ok(r.success, 'Brouillon enregistré');
    h.eq(r.sale.status, 'draft', "Statut = 'draft'");
    const stock = db.dbGet('SELECT stock_full_crates FROM products WHERE id=?', [product.id]);
    h.eq(stock.stock_full_crates, 10, 'Stock inchangé (un brouillon ne décrémente rien)');
    const movementsAfter = db.dbAll("SELECT COUNT(*) as c FROM packaging_movements")[0].c;
    h.eq(movementsAfter, movementsBefore, 'Aucun mouvement de stock créé pour un brouillon');

    // Il apparaît bien dans la liste des ventes (pour l'onglet Brouillons de l'historique)
    const list = call('sales:list');
    h.ok(list.sales.some(s => s.id === r.sale.id && s.status === 'draft'), 'Le brouillon apparaît dans sales:list');

    // Un brouillon ne doit pas compter dans le CA du jour (base fraîche : seul ce brouillon existe)
    h.eq(call('db:get-stats').stats.revenue_today, 0, "Le brouillon n'apparaît pas dans le CA du jour");

    // --- Suppression du brouillon ---
    const del = call('sales:delete-draft', r.sale.id);
    h.ok(del.success, 'Suppression du brouillon acceptée');
    const listAfter = call('sales:list');
    h.ok(!listAfter.sales.some(s => s.id === r.sale.id), 'Le brouillon a bien disparu après suppression');
  }

  // --- On ne peut pas supprimer une vente ACTIVE via delete-draft (garde-fou) ---
  {
    const sale = call('sales:create', {
      client_id: '', payment_method: 'cash',
      items: [{ product_id: product.id, quantity_full_crates: 1, quantity_loose_bottles: 0, quantity_empties_returned: 1 }],
    });
    const del = call('sales:delete-draft', sale.sale.id);
    h.ok(!del.success, 'delete-draft refuse de supprimer une vente active (garde-fou)');
    const stillThere = db.dbGet('SELECT * FROM sales WHERE id=?', [sale.sale.id]);
    h.ok(!!stillThere, 'La vente active existe toujours');
  }

  teardown();
  return h.summary('Brouillons');
}

module.exports = { run };
if (require.main === module) run().then(ok => process.exit(ok ? 0 : 1));
