// ============================================================
// GestStock Brasserie v1.0 — Base de données SQLite (sql.js)
// V2 — Produits par brasserie, stock en casiers + bouteilles nues
// ============================================================

import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let SQL: SqlJsStatic | null = null;
let db: SqlJsDatabase | null = null;
let dbPath: string = '';

export function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'geststock.db');
}

export async function initDatabase(customPath?: string): Promise<SqlJsDatabase> {
  dbPath = customPath || getDbPath();
  SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  createTables();
  migrateV2();
  migrateV3();
  migrateV4();
  migrateV5();
  migrateV6();
  seedData();
  saveToDisk();
  return db;
}

export function getDatabase(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized.');
  return db;
}

export function saveToDisk(): void {
  if (!db || !dbPath) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbPath, buffer);
}

export function closeDatabase(): void { if (db) { saveToDisk(); db.close(); db = null; } }

// Helpers
// `db.export()` (called by saveToDisk) silently terminates any open SQLite transaction —
// so writes inside dbTransaction must not trigger a save until after COMMIT/ROLLBACK.
let inTransaction = false;
export function dbRun(sql: string, params: any[] = []): void { getDatabase().run(sql, params); if (!inTransaction) saveToDisk(); }
export function dbGet<T = any>(sql: string, params: any[] = []): T | undefined {
  const d = getDatabase(); const stmt = d.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  if (stmt.step()) { const cols = stmt.getColumnNames(); const vals = stmt.get(); const row: any = {};
    cols.forEach((c: string, i: number) => { row[c] = vals[i]; }); stmt.free(); return row as T; }
  stmt.free(); return undefined;
}
export function dbAll<T = any>(sql: string, params: any[] = []): T[] {
  const d = getDatabase(); const results: T[] = []; const stmt = d.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  while (stmt.step()) { const cols = stmt.getColumnNames(); const vals = stmt.get(); const row: any = {};
    cols.forEach((c: string, i: number) => { row[c] = vals[i]; }); results.push(row as T); }
  stmt.free(); return results;
}
export function dbExec(sql: string): void { getDatabase().run(sql); saveToDisk(); }
export function dbTransaction<T>(fn: () => T): T {
  const d = getDatabase();
  inTransaction = true;
  try {
    d.run('BEGIN TRANSACTION');
    const r = fn();
    d.run('COMMIT');
    inTransaction = false;
    saveToDisk();
    return r;
  } catch (e) {
    inTransaction = false;
    try { d.run('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

// ============================================================
// Création des tables V2
// ============================================================
function createTables(): void {
  dbExec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('super_admin','gerant','caissier')),
      full_name TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS breweries (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
      crate_consigne_price REAL NOT NULL DEFAULT 1200,
      bottle_consigne_price REAL NOT NULL DEFAULT 50,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, barcode TEXT DEFAULT '', name TEXT NOT NULL,
      brewery_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'bieres' CHECK(category IN ('bieres','jus_sodas','eaux','spiritueux_mix','energy_drinks')),
      format TEXT NOT NULL DEFAULT 'verre_consigne' CHECK(format IN ('verre_consigne','pet','canette','fut')),
      volume_cl INTEGER NOT NULL DEFAULT 65,
      units_per_crate INTEGER NOT NULL DEFAULT 24,
      buy_price_liquid REAL NOT NULL DEFAULT 0,
      sell_price_liquid REAL NOT NULL DEFAULT 0,
      consigne_amount REAL NOT NULL DEFAULT 0,
      stock_full_crates INTEGER NOT NULL DEFAULT 0,
      stock_loose_bottles INTEGER NOT NULL DEFAULT 0,
      alert_threshold_crates INTEGER NOT NULL DEFAULT 5,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (brewery_id) REFERENCES breweries(id)
    );

    CREATE TABLE IF NOT EXISTS crate_types (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 24,
      consigne_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '', financial_balance REAL NOT NULL DEFAULT 0,
      material_balance_crates INTEGER NOT NULL DEFAULT 0,
      material_balance_bottles INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, user_id TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      total_liquid REAL NOT NULL DEFAULT 0,
      total_consigne REAL NOT NULL DEFAULT 0,
      packaging_debt_crates INTEGER NOT NULL DEFAULT 0,
      packaging_debt_bottles INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash','credit','orange_money','mtn_momo')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled','draft')),
      sale_date TEXT NOT NULL DEFAULT (date('now','localtime')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (client_id) REFERENCES clients(id), FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, product_id TEXT NOT NULL,
      quantity_full_crates INTEGER NOT NULL DEFAULT 0,
      quantity_loose_bottles INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL, total_price REAL NOT NULL,
      consigne_amount REAL NOT NULL DEFAULT 0,
      consigne_total REAL NOT NULL DEFAULT 0,
      consigne_status TEXT NOT NULL DEFAULT 'consignation' CHECK(consigne_status IN ('echange','consignation','deconsignation')),
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS packaging_movements (
      id TEXT PRIMARY KEY, client_id TEXT, user_id TEXT NOT NULL, product_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('entree','sortie','echange','casse','restitution')),
      quantity_crates INTEGER NOT NULL DEFAULT 0, quantity_bottles INTEGER NOT NULL DEFAULT 0,
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (client_id) REFERENCES clients(id), FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS cash_closures (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      theoretical_amount REAL NOT NULL DEFAULT 0, real_amount REAL NOT NULL DEFAULT 0,
      discrepancy REAL NOT NULL DEFAULT 0, billetage TEXT NOT NULL DEFAULT '{}',
      packaging_inventory TEXT NOT NULL DEFAULT '{}',
      closed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT '', entity_id TEXT,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_brewery ON products(brewery_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
  `);
}

// Migration V2 (depuis V1)
function migrateV2(): void {
  try {
    // Vérifier si la migration est déjà faite
    dbGet("SELECT * FROM breweries LIMIT 1");
  } catch {
    // Supprimer l'ancienne table products et sale_items (V1)
    try { dbExec('DROP TABLE IF EXISTS products_old'); } catch (_) {}
    try { dbExec('ALTER TABLE products RENAME TO products_old'); } catch (_) {}
    try { dbExec('DROP TABLE IF EXISTS sale_items_old'); } catch (_) {}
    try { dbExec('ALTER TABLE sale_items RENAME TO sale_items_old'); } catch (_) {}
    try { dbExec('DROP TABLE IF EXISTS crate_types'); } catch (_) {}
    // Recréer les tables vides
    dbExec(`CREATE TABLE IF NOT EXISTS breweries (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))`);
    dbExec(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, barcode TEXT DEFAULT '', name TEXT NOT NULL, brewery_id TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'bieres', format TEXT NOT NULL DEFAULT 'verre_consigne', volume_cl INTEGER NOT NULL DEFAULT 65, units_per_crate INTEGER NOT NULL DEFAULT 24, buy_price_liquid REAL NOT NULL DEFAULT 0, sell_price_liquid REAL NOT NULL DEFAULT 0, stock_full_crates INTEGER NOT NULL DEFAULT 0, stock_loose_bottles INTEGER NOT NULL DEFAULT 0, alert_threshold_crates INTEGER NOT NULL DEFAULT 5, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), FOREIGN KEY (brewery_id) REFERENCES breweries(id))`);
    // Migrer les ventes : renommer les colonnes
    try {
      const oldSales = dbAll("SELECT * FROM sales");
      if (oldSales.length > 0) {
        try { dbExec('ALTER TABLE sales ADD COLUMN total_amount REAL NOT NULL DEFAULT 0'); } catch (_) {}
        for (const s of oldSales as any[]) {
          dbRun('UPDATE sales SET total_amount = ? WHERE id = ?', [(s.total_liquid||0) + (s.total_consigne||0), s.id]);
        }
      }
    } catch (_) {}
    saveToDisk();
  }
}

// Migration V3 : ajoute le statut de consigne par ligne (échange/consignation/déconsignation)
function migrateV3(): void {
  try { dbExec("ALTER TABLE sale_items ADD COLUMN consigne_status TEXT NOT NULL DEFAULT 'consignation'"); } catch (_) {}
}

// Migration V4 : suivi du nombre d'emballages rendus par ligne + correction du calcul du prix liquide
// (bug historique : le total facturait `qté × unités/casier × prix` au lieu de `qté × prix casier`)
function migrateV4(): void {
  try { dbExec("ALTER TABLE sale_items ADD COLUMN quantity_empties_returned INTEGER NOT NULL DEFAULT 0"); } catch (_) {}

  const already = dbGet<any>("SELECT value FROM settings WHERE key='v4_price_fix_done'");
  if (already) return;

  try {
    dbTransaction(() => {
      const items = dbAll<any>(`
        SELECT si.id, si.quantity_full_crates, si.quantity_loose_bottles, si.consigne_total, si.consigne_status,
               p.consigne_amount as p_consigne_amount, p.units_per_crate as p_units_per_crate, p.sell_price_liquid as p_sell_price
        FROM sale_items si LEFT JOIN products p ON si.product_id = p.id
      `);
      for (const it of items) {
        const qtyCrates = it.quantity_full_crates || 0;
        const qtyLoose = it.quantity_loose_bottles || 0;
        const sellPrice = it.p_sell_price || 0;
        const unitsPerCrate = it.p_units_per_crate || 1;
        const correctLiquid = (qtyCrates * sellPrice) + (qtyLoose * (sellPrice / unitsPerCrate));

        const unitConsigne = qtyCrates > 0 ? (it.p_consigne_amount || 0) : ((it.p_consigne_amount || 0) / unitsPerCrate);
        const takenQty = qtyCrates > 0 ? qtyCrates : qtyLoose;
        let emptiesReturned = it.consigne_status === 'echange' ? takenQty : 0;
        if (unitConsigne > 0) {
          const derived = Math.round(takenQty - (it.consigne_total || 0) / unitConsigne);
          if (Number.isFinite(derived)) emptiesReturned = Math.max(0, derived);
        }

        dbRun('UPDATE sale_items SET total_price = ?, quantity_empties_returned = ? WHERE id = ?', [correctLiquid, emptiesReturned, it.id]);
      }

      const sales = dbAll<any>('SELECT * FROM sales');
      for (const s of sales) {
        const agg = dbGet<any>('SELECT COALESCE(SUM(total_price),0) as liquid, COALESCE(SUM(consigne_total),0) as consigne FROM sale_items WHERE sale_id = ?', [s.id]);
        const newLiquid = agg?.liquid || 0;
        const newConsigne = agg?.consigne || 0;
        const newTotal = newLiquid + newConsigne;
        const delta = newTotal - (s.total_amount || 0);
        dbRun('UPDATE sales SET total_liquid = ?, total_consigne = ?, total_amount = ? WHERE id = ?', [newLiquid, newConsigne, newTotal, s.id]);
        if (s.status === 'active' && s.payment_method === 'credit' && Math.abs(delta) > 0.01) {
          dbRun('UPDATE clients SET financial_balance = financial_balance + ? WHERE id = ?', [delta, s.client_id]);
        }
      }

      dbRun("INSERT INTO settings (key, value) VALUES ('v4_price_fix_done', '1')");
    });
  } catch (e) {
    console.error('[migrateV4] Correction des montants historiques échouée:', e);
  }
}

// Migration V5 : autorise le statut 'draft' (brouillon) sur les ventes.
// SQLite ne permet pas d'altérer une contrainte CHECK : on recrée la table.
function migrateV5(): void {
  const tableDef = dbGet<any>("SELECT sql FROM sqlite_master WHERE type='table' AND name='sales'");
  if (!tableDef) return; // table pas encore créée (sera créée avec le bon schéma par createTables())
  if (tableDef.sql && tableDef.sql.includes("'draft'")) return; // déjà migré

  try {
    dbTransaction(() => {
      dbRun('DROP TABLE IF EXISTS sales_v5_old');
      dbRun('ALTER TABLE sales RENAME TO sales_v5_old');
      dbRun(`CREATE TABLE sales (
        id TEXT PRIMARY KEY, client_id TEXT NOT NULL, user_id TEXT NOT NULL,
        total_amount REAL NOT NULL DEFAULT 0,
        total_liquid REAL NOT NULL DEFAULT 0,
        total_consigne REAL NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash','credit','orange_money','mtn_momo')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled','draft')),
        sale_date TEXT NOT NULL DEFAULT (date('now','localtime')),
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (client_id) REFERENCES clients(id), FOREIGN KEY (user_id) REFERENCES users(id)
      )`);
      dbRun(`INSERT INTO sales (id, client_id, user_id, total_amount, total_liquid, total_consigne, payment_method, status, sale_date, created_at)
             SELECT id, client_id, user_id, total_amount, total_liquid, total_consigne, payment_method, status, sale_date, created_at FROM sales_v5_old`);
      dbRun('DROP TABLE sales_v5_old');
    });
  } catch (e) {
    console.error('[migrateV5] Migration du statut brouillon échouée:', e);
  }
}

// Migration V6 : dette d'emballage stockée par vente (remplace la consignation
// monétaire) + table des notes/rapports d'activité par utilisateur.
function migrateV6(): void {
  try { dbExec('ALTER TABLE sales ADD COLUMN packaging_debt_crates INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { dbExec('ALTER TABLE sales ADD COLUMN packaging_debt_bottles INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  dbExec(`
    CREATE TABLE IF NOT EXISTS activity_reports (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      report_date TEXT NOT NULL DEFAULT (date('now','localtime')),
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

// ============================================================
// Seeding — Produits du marché camerounais
// ============================================================
function seedData(): void {
  const count = dbGet<{c:number}>("SELECT COUNT(*) as c FROM breweries");
  if (count && count.c > 0) return;

  console.log('🌱 Seeding données camerounaises...');

  const { v4: uuidv4 } = require('uuid');
  const bids: Record<string, string> = {};

  // Brasseries
  const breweries = ['Boissons du Cameroun', 'Guinness Cameroon', 'UCB'];
  for (const b of breweries) {
    const id = uuidv4(); bids[b] = id;
    dbRun("INSERT INTO breweries (id, name) VALUES (?,?)", [id, b]);
  }

  // Helper pour ajouter un produit
  const addProd = (name: string, brewery: string, category: string, format: string, volume_cl: number, units_per_crate: number, buy: number, sell: number) => {
    const barcode = `${volume_cl}${name.replace(/\s/g,'').slice(0,4)}${Math.floor(Math.random()*1000)}`;
    dbRun(`INSERT INTO products (id, barcode, name, brewery_id, category, format, volume_cl, units_per_crate, buy_price_liquid, sell_price_liquid, stock_full_crates, stock_loose_bottles, alert_threshold_crates, is_active)
           VALUES (?,?,?,?,?,?,?,?,?,?,0,0,5,1)`,
      [uuidv4(), barcode, name, bids[brewery], category, format, volume_cl, units_per_crate, buy, sell]);
  };

  // === BOISSONS DU CAMEROUN (ex-SABC) ===
  const bdc = 'Boissons du Cameroun';
  // Bières
  addProd('33 Export 65cl', bdc, 'bieres', 'verre_consigne', 65, 24, 400, 650);
  addProd('33 Export 33cl', bdc, 'bieres', 'verre_consigne', 33, 24, 250, 400);
  addProd('Castel Beer 65cl', bdc, 'bieres', 'verre_consigne', 65, 24, 400, 650);
  addProd('Castel Beer 33cl', bdc, 'bieres', 'verre_consigne', 33, 24, 250, 400);
  addProd('Mützig 65cl', bdc, 'bieres', 'verre_consigne', 65, 24, 420, 700);
  addProd('Mützig 33cl', bdc, 'bieres', 'verre_consigne', 33, 24, 280, 450);
  addProd('Beaufort Lager 65cl', bdc, 'bieres', 'verre_consigne', 65, 24, 380, 600);
  addProd('Beaufort Light 65cl', bdc, 'bieres', 'verre_consigne', 65, 24, 380, 600);
  addProd('Beaufort Lager 33cl', bdc, 'bieres', 'verre_consigne', 33, 24, 250, 400);
  addProd('Amstel 65cl', bdc, 'bieres', 'verre_consigne', 65, 24, 400, 650);
  addProd('Tuborg 65cl', bdc, 'bieres', 'verre_consigne', 65, 24, 400, 650);
  addProd('Chill Citron 65cl', bdc, 'bieres', 'verre_consigne', 65, 24, 380, 600);
  addProd('Chill Citron 33cl', bdc, 'bieres', 'verre_consigne', 33, 24, 250, 400);
  // TOP
  addProd('TOP Pamplemousse 65cl', bdc, 'jus_sodas', 'verre_consigne', 65, 24, 350, 550);
  addProd('TOP Pamplemousse 30cl', bdc, 'jus_sodas', 'verre_consigne', 30, 24, 200, 300);
  addProd('TOP Pamplemousse PET 1.5L', bdc, 'jus_sodas', 'pet', 150, 1, 500, 800);
  addProd('TOP Pamplemousse PET 50cl', bdc, 'jus_sodas', 'pet', 50, 1, 250, 400);
  addProd('TOP Orange 65cl', bdc, 'jus_sodas', 'verre_consigne', 65, 24, 350, 550);
  addProd('TOP Orange PET 1.5L', bdc, 'jus_sodas', 'pet', 150, 1, 500, 800);
  addProd('TOP Ananas 65cl', bdc, 'jus_sodas', 'verre_consigne', 65, 24, 350, 550);
  addProd('TOP Grenadine 65cl', bdc, 'jus_sodas', 'verre_consigne', 65, 24, 350, 550);
  // D'jino
  addProd("D'jino 65cl", bdc, 'jus_sodas', 'verre_consigne', 65, 24, 350, 550);
  addProd("D'jino PET 1.5L", bdc, 'jus_sodas', 'pet', 150, 1, 600, 1000);
  // Booster Mix
  addProd('Booster Mix 65cl', bdc, 'energy_drinks', 'verre_consigne', 65, 24, 350, 550);
  addProd('Booster Mix 30cl', bdc, 'energy_drinks', 'verre_consigne', 30, 24, 200, 300);
  // Eaux
  addProd('Source Tangui PET 1.5L', bdc, 'eaux', 'pet', 150, 1, 200, 350);
  addProd('Source Tangui PET 1L', bdc, 'eaux', 'pet', 100, 1, 150, 250);
  addProd('Source Tangui PET 50cl', bdc, 'eaux', 'pet', 50, 1, 100, 150);
  addProd('Eau Vitale PET 1.5L', bdc, 'eaux', 'pet', 150, 1, 200, 350);

  // === GUINNESS CAMEROON ===
  const guinness = 'Guinness Cameroon';
  addProd('Guinness Foreign Extra Stout 65cl', guinness, 'bieres', 'verre_consigne', 65, 24, 500, 800);
  addProd('Guinness Foreign Extra Stout 33cl', guinness, 'bieres', 'verre_consigne', 33, 24, 350, 500);
  addProd('Guinness Foreign Extra Stout Canette 33cl', guinness, 'bieres', 'canette', 33, 24, 350, 500);
  addProd('Guinness Foreign Extra Stout Canette 50cl', guinness, 'bieres', 'canette', 50, 24, 450, 700);
  addProd('Guinness Smooth 65cl', guinness, 'bieres', 'verre_consigne', 65, 24, 450, 750);
  addProd('Guinness Smooth 33cl', guinness, 'bieres', 'verre_consigne', 33, 24, 300, 450);
  addProd('Malta Guinness 33cl', guinness, 'jus_sodas', 'verre_consigne', 33, 24, 250, 400);
  addProd('Malta Guinness Canette 33cl', guinness, 'jus_sodas', 'canette', 33, 24, 250, 400);
  addProd('Malta Guinness PET 50cl', guinness, 'jus_sodas', 'pet', 50, 1, 300, 500);
  addProd('Harp Lager 65cl', guinness, 'bieres', 'verre_consigne', 65, 24, 380, 600);
  addProd('Harp Lager 33cl', guinness, 'bieres', 'verre_consigne', 33, 24, 250, 400);
  addProd('Smirnoff Ice 33cl', guinness, 'spiritueux_mix', 'verre_consigne', 33, 24, 400, 650);
  addProd('Smirnoff Ice 65cl', guinness, 'spiritueux_mix', 'verre_consigne', 65, 24, 600, 1000);
  addProd('Orijin 65cl', guinness, 'spiritueux_mix', 'verre_consigne', 65, 24, 450, 750);
  addProd('Orijin 33cl', guinness, 'spiritueux_mix', 'verre_consigne', 33, 24, 300, 500);

  // === UCB ===
  const ucb = 'UCB';
  addProd('KADJI Beer 65cl', ucb, 'bieres', 'verre_consigne', 65, 24, 350, 550);
  addProd('KADJI Beer 33cl', ucb, 'bieres', 'verre_consigne', 33, 24, 230, 350);
  addProd('KBS 65cl', ucb, 'bieres', 'verre_consigne', 65, 24, 350, 550);
  addProd('King Beer 65cl', ucb, 'bieres', 'verre_consigne', 65, 24, 380, 600);
  // Spécial
  addProd('Spécial Pamplemousse 65cl', ucb, 'jus_sodas', 'verre_consigne', 65, 24, 300, 500);
  addProd('Spécial Pamplemousse 33cl', ucb, 'jus_sodas', 'verre_consigne', 33, 24, 200, 300);
  addProd('Spécial Orange 65cl', ucb, 'jus_sodas', 'verre_consigne', 65, 24, 300, 500);
  addProd('Spécial Grenadine 65cl', ucb, 'jus_sodas', 'verre_consigne', 65, 24, 300, 500);
  addProd('Spécial Ananas 65cl', ucb, 'jus_sodas', 'verre_consigne', 65, 24, 300, 500);
  addProd('Spécial Cola 65cl', ucb, 'jus_sodas', 'verre_consigne', 65, 24, 300, 500);
  addProd('Spécial PET 1.5L', ucb, 'jus_sodas', 'pet', 150, 1, 500, 800);
  addProd('Spécial PET 1L', ucb, 'jus_sodas', 'pet', 100, 1, 400, 600);
  // Razzl
  addProd('Razzl PET 1L', ucb, 'jus_sodas', 'pet', 100, 1, 400, 600);
  addProd('Razzl 33cl', ucb, 'jus_sodas', 'verre_consigne', 33, 24, 200, 300);
  // KIQ
  addProd('KIQ Energy Drink 33cl', ucb, 'energy_drinks', 'canette', 33, 24, 250, 400);
  addProd('KIQ Energy Drink 50cl', ucb, 'energy_drinks', 'canette', 50, 24, 350, 550);
  // Eau
  addProd('Eau Madiba PET 1.5L', ucb, 'eaux', 'pet', 150, 1, 150, 300);
  addProd('Eau Madiba PET 1L', ucb, 'eaux', 'pet', 100, 1, 100, 200);
  addProd('Eau Madiba PET 50cl', ucb, 'eaux', 'pet', 50, 1, 75, 150);

  console.log('✅ Seeding terminé');
}