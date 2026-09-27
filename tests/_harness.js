// ============================================================
// Harnais de test — exécute le VRAI code backend compilé (dist/main)
// hors Electron, sur une base de données JETABLE (jamais la vraie base).
// ============================================================
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DIST_MAIN = path.join(__dirname, '..', 'dist', 'main');
if (!fs.existsSync(path.join(DIST_MAIN, 'database.js'))) {
  console.error("dist/main introuvable — lancez d'abord `npm run build:main`.");
  process.exit(1);
}

// --- Mock du module 'electron' (aucune fenêtre, aucun IPC réel nécessaire) ---
const handlers = new Map();
const mockElectron = {
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
  app: { getPath: () => os.tmpdir(), isPackaged: false },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'electron') return 'electron-mock-virtual';
  return origResolve.call(this, request, ...args);
};
require.cache['electron-mock-virtual'] = {
  id: 'electron-mock-virtual', filename: 'electron-mock-virtual', loaded: true, exports: mockElectron,
};

const database = require(path.join(DIST_MAIN, 'database.js'));
const auth = require(path.join(DIST_MAIN, 'auth.js'));
const ipcHandlers = require(path.join(DIST_MAIN, 'ipc-handlers.js'));

let tmpDbPath = null;

// Crée une base fraîche (jetable) et enregistre les handlers IPC. À appeler une fois par fichier de test.
async function setup() {
  tmpDbPath = path.join(os.tmpdir(), `geststock-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  await database.initDatabase(tmpDbPath);
  ipcHandlers.registerIpcHandlers();
  return {
    call: (channel, ...args) => handlers.get(channel)({}, ...args),
    db: database,
    teardown,
  };
}

function teardown() {
  try { if (tmpDbPath && fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath); } catch (_) {}
}

// Crée un utilisateur de test et ouvre une session (auth.login) pour ce rôle.
function loginAs(role, username) {
  const bcrypt = require(path.join(__dirname, '..', 'node_modules', 'bcryptjs'));
  const { v4: uuidv4 } = require(path.join(__dirname, '..', 'node_modules', 'uuid'));
  const id = uuidv4();
  database.dbRun(
    `INSERT INTO users (id, username, password_hash, role, full_name, is_active, must_change_password) VALUES (?,?,?,?,?,1,0)`,
    [id, username, bcrypt.hashSync('Test@1234', 4), role, `Test ${role}`]
  );
  return auth.login(username, 'Test@1234').user;
}

// ------------------------- Mini assertions (compteurs remis à zéro après chaque summary()) -------------------------
let pass = 0, fail = 0;

function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}
function eq(actual, expected, name) {
  ok(actual === expected, `${name} (attendu ${expected}, obtenu ${actual})`);
}

function summary(suiteName) {
  const p = pass, f = fail;
  console.log(`\n${suiteName}: ${p} ✅ / ${f} ❌\n`);
  pass = 0; fail = 0;
  return f === 0;
}

module.exports = { setup, teardown, loginAs, ok, eq, summary };
