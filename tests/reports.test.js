// Tests des nouvelles fonctionnalités : inscription Super Admin, rapports
// d'activité (résumé + notes), et handler d'impression (liste imprimantes).
const h = require('./_harness');

async function run() {
  const { call, db, teardown } = await h.setup();

  // --- Inscription Super Admin (en plus du compte auto-créé) ---
  {
    const badCode = call('auth:register', 'CodeInvalide', 'patron0', 'MonMdp@123', 'MonMdp@123', 'Dépôt Test Yaoundé');
    h.ok(!badCode.success, "Un code d'accès incorrect bloque l'inscription");

    const verifyBad = call('auth:verify-register-code', 'CodeInvalide');
    h.ok(verifyBad.success && !verifyBad.valid, "verify-register-code renvoie valid=false pour un mauvais code");
    const verifyGood = call('auth:verify-register-code', 'NewPass2025');
    h.ok(verifyGood.success && verifyGood.valid, "verify-register-code renvoie valid=true pour le bon code");

    const r = call('auth:register', 'NewPass2025', 'patron', 'MonMdp@123', 'MonMdp@123', 'Dépôt Test Yaoundé');
    h.ok(r.success, 'Inscription Super Admin acceptée avec le bon code');
    h.eq(r.user.role, 'super_admin', 'Le compte créé a le rôle super_admin');
    h.eq(r.user.must_change_password, 0, "Pas de changement de mot de passe forcé (l'utilisateur l'a déjà choisi)");

    const setting = db.dbGet("SELECT value FROM settings WHERE key='depot_name'");
    h.eq(setting.value, 'Dépôt Test Yaoundé', 'Le nom du dépôt est enregistré dans les réglages');

    const dup = call('auth:register', 'NewPass2025', 'patron', 'Autre@1234', 'Autre@1234', 'Autre Dépôt');
    h.ok(!dup.success, "Un nom d'utilisateur déjà pris est refusé");

    const mismatch = call('auth:register', 'NewPass2025', 'patron2', 'Abc@1234', 'Autre@1234', 'Dépôt X');
    h.ok(!mismatch.success, 'Mots de passe non identiques refusés');

    const short = call('auth:register', 'NewPass2025', 'patron3', '123', '123', 'Dépôt Y');
    h.ok(!short.success, 'Mot de passe trop court refusé');

    const login = call('auth:login', 'patron', 'MonMdp@123');
    h.ok(login.success, 'Connexion possible avec le compte nouvellement inscrit');
  }

  // --- Rapports : notes/signalements + résumé d'activité ---
  {
    const caissier = h.loginAs('caissier', 'test_caissier_reports');

    const addNote = call('reports:add-note', "Écart de caisse constaté ce matin.");
    h.ok(addNote.success, 'Le caissier peut ajouter une note');
    h.eq(addNote.note.status, 'open', "La note démarre au statut 'open'");

    const ownNotes = call('reports:list-notes');
    h.eq(ownNotes.notes.length, 1, 'Le caissier voit sa propre note');

    const emptyNote = call('reports:add-note', '   ');
    h.ok(!emptyNote.success, 'Une note vide est refusée');

    // Une vente pour vérifier le résumé d'activité de ce caissier
    const product = db.dbGet("SELECT * FROM products WHERE name='33 Export 65cl' AND is_active=1");
    db.dbRun('UPDATE products SET stock_full_crates=10, stock_loose_bottles=0 WHERE id=?', [product.id]);
    const sale = call('sales:create', {
      client_id: '', payment_method: 'cash',
      items: [{ product_id: product.id, quantity_full_crates: 2, quantity_loose_bottles: 0, quantity_empties_returned: 2 }],
    });
    h.ok(sale.success, 'Vente du caissier créée pour le test de résumé');

    const today = new Date().toISOString().slice(0, 10);
    const summary = call('reports:summary', null, today, today);
    h.ok(summary.success, 'Résumé récupéré pour le caissier');
    h.eq(summary.summary.sales_count, 1, 'Le résumé compte bien la vente du jour');
    h.eq(summary.summary.crates_sold, 2, 'Le résumé compte les casiers vendus');

    // Le Super Admin voit toutes les notes, y compris celle du caissier
    h.loginAs('super_admin', 'test_admin_reports');
    const allNotes = call('reports:list-notes');
    h.ok(allNotes.notes.some(n => n.user_id === caissier.id), 'Le Super Admin voit la note du caissier');

    const targetNote = allNotes.notes.find(n => n.user_id === caissier.id);
    const ack = call('reports:ack-note', targetNote.id);
    h.ok(ack.success, 'Le Super Admin peut marquer une note comme vue');
    const afterAck = call('reports:list-notes', caissier.id);
    h.eq(afterAck.notes.find(n => n.id === targetNote.id).status, 'acknowledged', "La note passe au statut 'acknowledged'");

    // Un non-admin ne peut pas acquitter une note
    h.loginAs('caissier', 'test_caissier_reports2');
    const forbidAck = call('reports:ack-note', targetNote.id);
    h.ok(!forbidAck.success, "Un caissier ne peut pas marquer une note comme vue (garde-fou de rôle)");
  }

  // --- Impression : la liste des imprimantes ne plante pas hors Electron réel ---
  // (handler async → on attend la promesse renvoyée par le mock ipcMain)
  {
    const printers = await call('print:get-printers');
    h.ok(printers.success, "L'appel de listage des imprimantes ne plante pas");
    h.eq(printers.printers.length, 0, "Aucune fenêtre réelle en test → liste vide, sans erreur");
  }

  teardown();
  return h.summary('Inscription / Rapports / Impression');
}

module.exports = { run };
if (require.main === module) run().then(ok => process.exit(ok ? 0 : 1));
