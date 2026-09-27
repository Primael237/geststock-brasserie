// Tests d'authentification : réinitialisation de mot de passe par le Super Admin.
const h = require('./_harness');

async function run() {
  const { call, db, teardown } = await h.setup();
  h.loginAs('super_admin', 'test_admin_auth');

  const bcrypt = require(require('path').join(__dirname, '..', 'node_modules', 'bcryptjs'));
  const { v4: uuidv4 } = require(require('path').join(__dirname, '..', 'node_modules', 'uuid'));
  const targetId = uuidv4();
  db.dbRun(`INSERT INTO users (id, username, password_hash, role, full_name, is_active, must_change_password) VALUES (?,?,?,?,?,1,0)`,
    [targetId, 'caissier_test', bcrypt.hashSync('AncienMdp@1', 4), 'caissier', 'Caissier Test']);

  // --- Le Super Admin peut réinitialiser le mot de passe d'un autre utilisateur ---
  {
    const before = db.dbGet('SELECT password_hash, must_change_password FROM users WHERE id=?', [targetId]);
    const r = call('users:reset-password', targetId, 'NouveauMdp@2');
    h.ok(r.success, 'Réinitialisation acceptée pour le Super Admin');
    const after = db.dbGet('SELECT password_hash, must_change_password FROM users WHERE id=?', [targetId]);
    h.ok(after.password_hash !== before.password_hash, 'Le hash du mot de passe a changé');
    h.eq(after.must_change_password, 1, "L'utilisateur devra changer son mot de passe à la prochaine connexion");
    h.ok(bcrypt.compareSync('NouveauMdp@2', after.password_hash), 'Le nouveau mot de passe fonctionne bien pour se connecter');
    h.ok(!bcrypt.compareSync('AncienMdp@1', after.password_hash), "L'ancien mot de passe ne fonctionne plus");
  }

  // --- Un mot de passe trop court est refusé ---
  {
    const r = call('users:reset-password', targetId, '123');
    h.ok(!r.success, 'Mot de passe trop court refusé');
  }

  // --- Un non-admin ne peut pas réinitialiser (garde-fou de rôle) ---
  {
    h.loginAs('caissier', 'test_caissier_auth');
    const r = call('users:reset-password', targetId, 'AutreMdp@3');
    h.ok(!r.success, 'Un caissier ne peut pas réinitialiser un mot de passe');
  }

  teardown();
  return h.summary('Authentification');
}

module.exports = { run };
if (require.main === module) run().then(ok => process.exit(ok ? 0 : 1));
