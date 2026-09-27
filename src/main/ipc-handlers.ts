// ============================================================
// GestStock Brasserie v1.0 — Handlers IPC
// ============================================================

import { ipcMain, app } from 'electron';
import path from 'path';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbAll, dbRun, dbTransaction } from './database';
import {
  isFirstRun,
  createSuperAdmin,
  registerSuperAdmin,
  verifySuperAdminSignupCode,
  login,
  changePassword,
  logout,
  getCurrentUser,
  listUsers,
  createUser,
  toggleUserActive,
  adminResetPassword,
} from './auth';
import { addAuditLog } from './audit';
import { getPrinters, printHtml } from './print';
import { IPC_CHANNELS } from '../shared/types';

export function registerIpcHandlers(getMainWindow: () => any = () => null): void {
  // ============================================================
  // AUTH
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.AUTH_CHECK_FIRST_RUN, () => {
    return isFirstRun();
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, (_event, username: string, password: string) => {
    try {
      const result = login(username, password);
      return { success: true, ...result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_CHANGE_PASSWORD,
    (_event, userId: string, oldPassword: string, newPassword: string, isFirstLogin: boolean) => {
      try {
        changePassword(userId, oldPassword, newPassword, isFirstLogin);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_VERIFY_REGISTER_CODE, (_event, code: string) => {
    return { success: true, valid: verifySuperAdminSignupCode(code) };
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_REGISTER,
    (_event, code: string, username: string, password: string, confirmPassword: string, depotName: string) => {
      try {
        const user = registerSuperAdmin(code, username, password, confirmPassword, depotName);
        const { password_hash, ...safeUser } = user;
        return { success: true, user: safeUser };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, () => {
    logout();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_GET_CURRENT_USER, () => {
    const user = getCurrentUser();
    if (!user) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
  });

  // ============================================================
  // USERS
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.USERS_LIST, () => {
    try {
      return { success: true, users: listUsers() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.USERS_CREATE,
    (_event, username: string, password: string, role: string, fullName: string) => {
      try {
        const user = createUser(username, password, role as any, fullName);
        return { success: true, user };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.USERS_UPDATE,
    (_event, userId: string, isActive: boolean) => {
      try {
        toggleUserActive(userId, isActive);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.USERS_RESET_PASSWORD,
    (_event, userId: string, newPassword: string) => {
      try {
        adminResetPassword(userId, newPassword);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ============================================================
  // BREWERIES
  // ============================================================

  ipcMain.handle('breweries:list', () => {
    const breweries = dbAll('SELECT * FROM breweries ORDER BY name');
    return { success: true, breweries };
  });

  ipcMain.handle('breweries:create', (_event, data: any) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser || currentUser.role !== 'super_admin') throw new Error('Accès réservé au Super Admin.');
      const id = uuidv4();
      dbRun('INSERT INTO breweries (id, name, crate_consigne_price, bottle_consigne_price) VALUES (?, ?, ?, ?)',
        [id, data.name, data.crate_consigne_price||1200, data.bottle_consigne_price||50]);
      addAuditLog(currentUser.id, 'brewery_created', 'brewery', id, { name: data.name });
      return { success: true, brewery: dbGet('SELECT * FROM breweries WHERE id=?', [id]) };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  // ============================================================
  // PRODUCTS (RBAC: super_admin uniquement pour CRUD)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.PRODUCTS_LIST, () => {
    const products = dbAll(`
      SELECT p.*, b.name as brewery_name
      FROM products p LEFT JOIN breweries b ON p.brewery_id = b.id
      WHERE p.is_active = 1 ORDER BY b.name, p.name
    `);
    return { success: true, products };
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTS_CREATE, (_event, data: any) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser || currentUser.role !== 'super_admin') throw new Error('Accès réservé au Super Admin.');

      const id = uuidv4();
      dbRun(`INSERT INTO products (id, barcode, name, brewery_id, category, format, volume_cl, units_per_crate, buy_price_liquid, sell_price_liquid, consigne_amount, alert_threshold_crates)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, data.barcode||'', data.name, data.brewery_id, data.category, data.format, data.volume_cl, data.units_per_crate, data.buy_price_liquid, data.sell_price_liquid, data.consigne_amount||0, data.alert_threshold_crates||5]);
      addAuditLog(currentUser.id, 'product_created', 'product', id, { name: data.name });
      return { success: true, product: dbGet('SELECT p.*, b.name as brewery_name FROM products p LEFT JOIN breweries b ON p.brewery_id=b.id WHERE p.id=?', [id]) };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTS_UPDATE, (_event, id: string, data: any) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser || currentUser.role !== 'super_admin') throw new Error('Accès réservé au Super Admin.');

      const allowedFields = ['name','barcode','brewery_id','category','format','volume_cl','units_per_crate','buy_price_liquid','sell_price_liquid','consigne_amount','stock_full_crates','stock_loose_bottles','alert_threshold_crates','is_active'];
      const filtered: any = {};
      for (const k of allowedFields) if (data[k] !== undefined) filtered[k] = data[k];

      const fields = Object.keys(filtered).map(k => `${k}=?`).join(',');
      const values = Object.values(filtered);
      dbRun(`UPDATE products SET ${fields}, updated_at=datetime('now','localtime') WHERE id=?`, [...values, id]);
      addAuditLog(currentUser.id, 'product_updated', 'product', id, filtered);
      return { success: true, product: dbGet('SELECT p.*, b.name as brewery_name FROM products p LEFT JOIN breweries b ON p.brewery_id=b.id WHERE p.id=?', [id]) };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  ipcMain.handle(IPC_CHANNELS.PRODUCTS_DELETE, (_event, id: string) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser || currentUser.role !== 'super_admin') throw new Error('Accès réservé au Super Admin.');
      dbRun("UPDATE products SET is_active=0 WHERE id=?", [id]);
      addAuditLog(currentUser.id, 'product_deactivated', 'product', id, {});
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  // ============================================================
  // CLIENTS
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.CLIENTS_LIST, () => {
    const clients = dbAll('SELECT * FROM clients ORDER BY name');
    return { success: true, clients };
  });

  ipcMain.handle(IPC_CHANNELS.CLIENTS_CREATE,
    (_event, data: any) => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser || (currentUser.role !== 'super_admin' && currentUser.role !== 'gerant')) throw new Error('Accès refusé.');
        const id = uuidv4();
        dbRun(`INSERT INTO clients (id, name, phone, address, financial_balance, material_balance_crates, material_balance_bottles)
               VALUES (?,?,?,?,0,0,0)`,
          [id, data.name, data.phone||'', data.address||'']);
        addAuditLog(currentUser.id, 'client_created', 'client', id, { name: data.name });
        return { success: true, client: dbGet('SELECT * FROM clients WHERE id=?', [id]) };
      } catch (err: any) { return { success: false, error: err.message }; }
    }
  );

  // ============================================================
  // SALES
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.SALES_LIST, () => {
    const sales = dbAll(
      `SELECT s.*, c.name as client_name, COALESCE(u.full_name, u.username) as seller_name
       FROM sales s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.user_id = u.id
       ORDER BY s.created_at DESC`
    );
    return { success: true, sales };
  });

  ipcMain.handle(IPC_CHANNELS.SALE_ITEMS, (_event, saleId: string) => {
    const items = dbAll(
      `SELECT si.*, p.name as product_name, p.units_per_crate
       FROM sale_items si LEFT JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = ?`,
      [saleId]
    );
    return { success: true, items };
  });

  ipcMain.handle(IPC_CHANNELS.SALES_CREATE,
    (_event, data: {
      client_id: string;
      payment_method: string;
      items: { product_id: string; quantity_full_crates: number; quantity_loose_bottles: number; quantity_empties_returned?: number }[];
    }) => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Non authentifié.');

        const saleId = uuidv4();
        let totalLiquid = 0;
        let packagingDebtCrates = 0;
        let packagingDebtBottles = 0;

        dbTransaction(() => {
          for (const item of data.items) {
            const product = dbGet<any>('SELECT * FROM products WHERE id = ?', [item.product_id]);
            if (!product) throw new Error(`Produit introuvable.`);

            const qtyCrates = item.quantity_full_crates || 0;
            const qtyLoose = item.quantity_loose_bottles || 0;
            const emptiesReturned = Math.max(0, item.quantity_empties_returned || 0);

            // Vérifier le stock
            if (qtyCrates > product.stock_full_crates) throw new Error(`Stock casiers insuffisant pour ${product.name}.`);
            if (qtyLoose > product.stock_loose_bottles) throw new Error(`Stock bouteilles nues insuffisant pour ${product.name}.`);

            // Prix : sell_price_liquid = prix du CASIER. Prix bouteille = sell_price_liquid / units_per_crate.
            const itemLiquid = (qtyCrates * product.sell_price_liquid) + (qtyLoose * (product.sell_price_liquid / (product.units_per_crate || 1)));
            // Emballages : (qté prise - emballages rendus). Positif = dette d'emballage (pas d'argent), négatif = crédit d'emballage.
            const takenQty = qtyCrates > 0 ? qtyCrates : qtyLoose;
            const packagingDelta = takenQty - emptiesReturned;
            const consigneStatus = packagingDelta === 0 ? 'echange' : packagingDelta > 0 ? 'consignation' : 'deconsignation';
            totalLiquid += itemLiquid;
            if (qtyCrates > 0) packagingDebtCrates += packagingDelta;
            else if (qtyLoose > 0) packagingDebtBottles += packagingDelta;

            dbRun(
              `INSERT INTO sale_items (id, sale_id, product_id, quantity_full_crates, quantity_loose_bottles, unit_price, total_price, consigne_amount, consigne_total, consigne_status, quantity_empties_returned)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
              [uuidv4(), saleId, item.product_id, qtyCrates, qtyLoose, product.sell_price_liquid, itemLiquid, product.consigne_amount, consigneStatus, emptiesReturned]
            );

            // Décrémenter le stock
            dbRun(
              `UPDATE products SET stock_full_crates = stock_full_crates - ?, stock_loose_bottles = stock_loose_bottles - ?, updated_at = datetime('now','localtime') WHERE id = ?`,
              [qtyCrates, qtyLoose, item.product_id]
            );

            // Mouvement de stock : sortie du produit facturé
            dbRun(
              `INSERT INTO packaging_movements (id, client_id, user_id, product_id, type, quantity_crates, quantity_bottles, comment)
               VALUES (?, ?, ?, ?, 'sortie', ?, ?, ?)`,
              [uuidv4(), data.client_id || null, currentUser.id, product.id, qtyCrates, qtyLoose, `Vente ${saleId.slice(0,8).toUpperCase()}`]
            );

            // Mouvement de stock : emballages récupérés du client (si échange partiel ou consignation en retour)
            if (emptiesReturned > 0) {
              dbRun(
                `INSERT INTO packaging_movements (id, client_id, user_id, product_id, type, quantity_crates, quantity_bottles, comment)
                 VALUES (?, ?, ?, ?, 'restitution', ?, ?, ?)`,
                [uuidv4(), data.client_id || null, currentUser.id, product.id, qtyCrates > 0 ? emptiesReturned : 0, qtyCrates > 0 ? 0 : emptiesReturned, `Emballages récupérés — Vente ${saleId.slice(0,8).toUpperCase()}`]
              );
            }
          }

          // Une dette d'emballage doit être rattachée à un client pour être suivie.
          if (!data.client_id && (packagingDebtCrates > 0 || packagingDebtBottles > 0)) {
            throw new Error('Un client doit être sélectionné : des emballages restent dus pour cette vente.');
          }

          dbRun(
            `INSERT INTO sales (id, client_id, user_id, total_amount, total_liquid, total_consigne, packaging_debt_crates, packaging_debt_bottles, payment_method, status)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'active')`,
            [saleId, data.client_id || '', currentUser.id, totalLiquid, totalLiquid, packagingDebtCrates, packagingDebtBottles, data.payment_method]
          );

          if (data.payment_method === 'credit' && data.client_id) {
            dbRun('UPDATE clients SET financial_balance = financial_balance + ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?',
              [totalLiquid, data.client_id]);
          }

          if (data.client_id && (packagingDebtCrates !== 0 || packagingDebtBottles !== 0)) {
            dbRun('UPDATE clients SET material_balance_crates = material_balance_crates + ?, material_balance_bottles = material_balance_bottles + ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?',
              [packagingDebtCrates, packagingDebtBottles, data.client_id]);
          }
        });

        addAuditLog(currentUser.id, 'sale_created', 'sale', saleId, { total: totalLiquid, packagingDebtCrates, packagingDebtBottles });
        return { success: true, sale: dbGet('SELECT s.*, c.name as client_name FROM sales s LEFT JOIN clients c ON s.client_id=c.id WHERE s.id=?', [saleId]) };
      } catch (err: any) { return { success: false, error: err.message }; }
    }
  );

  // Enregistre une facture en cours comme BROUILLON : aucun impact sur le stock,
  // les emballages ou le solde client tant qu'elle n'est pas reprise et validée.
  ipcMain.handle(IPC_CHANNELS.SALES_SAVE_DRAFT,
    (_event, data: {
      client_id: string;
      payment_method: string;
      items: { product_id: string; quantity_full_crates: number; quantity_loose_bottles: number; quantity_empties_returned?: number }[];
    }) => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Non authentifié.');
        if (!data.items || data.items.length === 0) throw new Error('Le brouillon doit contenir au moins un article.');

        const saleId = uuidv4();
        let totalLiquid = 0;
        let packagingDebtCrates = 0;
        let packagingDebtBottles = 0;

        dbTransaction(() => {
          for (const item of data.items) {
            const product = dbGet<any>('SELECT * FROM products WHERE id = ?', [item.product_id]);
            if (!product) throw new Error('Produit introuvable.');

            const qtyCrates = item.quantity_full_crates || 0;
            const qtyLoose = item.quantity_loose_bottles || 0;
            const emptiesReturned = Math.max(0, item.quantity_empties_returned || 0);

            const itemLiquid = (qtyCrates * product.sell_price_liquid) + (qtyLoose * (product.sell_price_liquid / (product.units_per_crate || 1)));
            const takenQty = qtyCrates > 0 ? qtyCrates : qtyLoose;
            const packagingDelta = takenQty - emptiesReturned;
            const consigneStatus = packagingDelta === 0 ? 'echange' : packagingDelta > 0 ? 'consignation' : 'deconsignation';
            totalLiquid += itemLiquid;
            if (qtyCrates > 0) packagingDebtCrates += packagingDelta;
            else if (qtyLoose > 0) packagingDebtBottles += packagingDelta;

            dbRun(
              `INSERT INTO sale_items (id, sale_id, product_id, quantity_full_crates, quantity_loose_bottles, unit_price, total_price, consigne_amount, consigne_total, consigne_status, quantity_empties_returned)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
              [uuidv4(), saleId, item.product_id, qtyCrates, qtyLoose, product.sell_price_liquid, itemLiquid, product.consigne_amount, consigneStatus, emptiesReturned]
            );
            // Pas de mouvement de stock, pas de décrément, pas d'impact client : c'est juste une facture sauvegardée.
          }

          dbRun(
            `INSERT INTO sales (id, client_id, user_id, total_amount, total_liquid, total_consigne, packaging_debt_crates, packaging_debt_bottles, payment_method, status)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'draft')`,
            [saleId, data.client_id || '', currentUser.id, totalLiquid, totalLiquid, packagingDebtCrates, packagingDebtBottles, data.payment_method]
          );
        });

        addAuditLog(currentUser.id, 'sale_draft_saved', 'sale', saleId, { total: totalLiquid });
        return { success: true, sale: dbGet('SELECT s.*, c.name as client_name FROM sales s LEFT JOIN clients c ON s.client_id=c.id WHERE s.id=?', [saleId]) };
      } catch (err: any) { return { success: false, error: err.message }; }
    }
  );

  ipcMain.handle(IPC_CHANNELS.SALES_DELETE_DRAFT, (_event, saleId: string) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error('Non authentifié.');
      if (currentUser.role !== 'super_admin') throw new Error('Accès réservé au Super Admin.');
      const sale = dbGet<any>('SELECT * FROM sales WHERE id = ?', [saleId]);
      if (!sale) throw new Error('Brouillon introuvable.');
      if (sale.status !== 'draft') throw new Error('Seul un brouillon peut être supprimé de cette façon.');
      dbRun('DELETE FROM sales WHERE id = ?', [saleId]);
      addAuditLog(currentUser.id, 'sale_draft_deleted', 'sale', saleId, {});
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  // ============================================================
  // PACKAGING MOVEMENTS
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.PACKAGING_LIST, () => {
    const movements = dbAll(
      `SELECT pm.*, p.name as product_name, c.name as client_name, u.username
       FROM packaging_movements pm
       LEFT JOIN products p ON pm.product_id = p.id
       LEFT JOIN clients c ON pm.client_id = c.id
       LEFT JOIN users u ON pm.user_id = u.id
       ORDER BY pm.created_at DESC`
    );
    return { success: true, movements };
  });

  ipcMain.handle(IPC_CHANNELS.PACKAGING_CREATE,
    (_event, data: {
      client_id: string | null;
      product_id: string;
      type: string;
      quantity_crates: number;
      quantity_bottles: number;
      comment: string;
    }) => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Non authentifié.');

        const id = uuidv4();
        dbRun(
          `INSERT INTO packaging_movements (id, client_id, user_id, product_id, type, quantity_crates, quantity_bottles, comment)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, data.client_id, currentUser.id, data.product_id, data.type, data.quantity_crates, data.quantity_bottles, data.comment]
        );

        if (data.client_id) {
          const multiplier = data.type === 'entree' || data.type === 'restitution' ? -1 : 1;
          dbRun(
            `UPDATE clients
             SET material_balance_crates = material_balance_crates + ?,
                 material_balance_bottles = material_balance_bottles + ?,
                 updated_at = datetime('now', 'localtime')
             WHERE id = ?`,
            [data.quantity_crates * multiplier, data.quantity_bottles * multiplier, data.client_id]
          );
        }

        addAuditLog(currentUser.id, 'packaging_movement', 'packaging', id, data as any);

        const movement = dbGet('SELECT * FROM packaging_movements WHERE id = ?', [id]);
        return { success: true, movement };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ============================================================
  // CASH CLOSURES
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.CASH_CLOSURES_LIST, () => {
    const closures = dbAll(
      `SELECT cc.*, u.username, u.full_name
       FROM cash_closures cc
       LEFT JOIN users u ON cc.user_id = u.id
       ORDER BY cc.created_at DESC`
    );
    return { success: true, closures };
  });

  ipcMain.handle(IPC_CHANNELS.CASH_CLOSE,
    (_event, data: { theoretical: number; real: number; billetage: Record<string, number>; packaging: Record<string, number> }) => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Non authentifié.');

        const id = uuidv4();
        const discrepancy = data.real - data.theoretical;

        dbRun(
          `INSERT INTO cash_closures (id, user_id, theoretical_amount, real_amount, discrepancy, billetage, packaging_inventory)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, currentUser.id, data.theoretical, data.real, discrepancy,
            JSON.stringify(data.billetage), JSON.stringify(data.packaging)]
        );

        addAuditLog(currentUser.id, 'cash_closure', 'cash', id, {
          theoretical: data.theoretical,
          real: data.real,
          discrepancy,
        });

        const closure = dbGet('SELECT * FROM cash_closures WHERE id = ?', [id]);
        return { success: true, closure };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ============================================================
  // SETTINGS
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    const rows = dbAll<{ key: string; value: string }>('SELECT key, value FROM settings');
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return { success: true, settings };
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE,
    (_event, key: string, value: string) => {
      try {
        dbRun(
          `INSERT INTO settings (key, value, updated_at)
           VALUES (?, ?, datetime('now', 'localtime'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [key, value]
        );
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ============================================================
  // STATS
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.DB_GET_STATS, () => {
      try {
        const today = "date('now', 'localtime')";

        const stats = {
          products_count: (dbGet<{ c: number }>('SELECT COUNT(*) as c FROM products'))?.c ?? 0,
          clients_count: (dbGet<{ c: number }>('SELECT COUNT(*) as c FROM clients'))?.c ?? 0,
          sales_today: (dbGet<{ c: number }>(`SELECT COUNT(*) as c FROM sales WHERE sale_date = ${today} AND status='active'`))?.c ?? 0,
          revenue_today: (dbGet<{ total: number }>(`SELECT COALESCE(SUM(total_liquid + total_consigne), 0) as total FROM sales WHERE sale_date = ${today} AND status='active'`))?.total ?? 0,
          revenue_cash: (dbGet<{ total: number }>(`SELECT COALESCE(SUM(total_liquid + total_consigne), 0) as total FROM sales WHERE sale_date = ${today} AND status='active' AND payment_method='cash'`))?.total ?? 0,
          revenue_credit: (dbGet<{ total: number }>(`SELECT COALESCE(SUM(total_liquid + total_consigne), 0) as total FROM sales WHERE sale_date = ${today} AND status='active' AND payment_method='credit'`))?.total ?? 0,
          revenue_mobile: (dbGet<{ total: number }>(`SELECT COALESCE(SUM(total_liquid + total_consigne), 0) as total FROM sales WHERE sale_date = ${today} AND status='active' AND payment_method IN ('orange_money','mtn_momo')`))?.total ?? 0,
          total_clients_debt: (dbGet<{ total: number }>('SELECT COALESCE(SUM(financial_balance), 0) as total FROM clients'))?.total ?? 0,
          crates_out_today: (dbGet<{ total: number }>(`SELECT COALESCE(SUM(quantity_crates), 0) as total FROM packaging_movements WHERE type='sortie' AND date(created_at) = ${today}`))?.total ?? 0,
          crates_in_today: (dbGet<{ total: number }>(`SELECT COALESCE(SUM(quantity_crates), 0) as total FROM packaging_movements WHERE type IN ('entree','restitution') AND date(created_at) = ${today}`))?.total ?? 0,
          low_stock_count: (dbGet<{ c: number }>('SELECT COUNT(*) as c FROM products WHERE (stock_full_crates * units_per_crate + stock_loose_bottles) <= (alert_threshold_crates * units_per_crate)'))?.c ?? 0,
          crate_shortage_count: (dbGet<{ c: number }>("SELECT COUNT(*) as c FROM products WHERE format='verre_consigne' AND stock_full_crates < alert_threshold_crates"))?.c ?? 0,
          // Ventes par catégorie (7 jours)
          sales_by_category: dbAll(
            `SELECT p.category, COALESCE(SUM(si.total_price), 0) as total
             FROM sale_items si
             JOIN products p ON si.product_id = p.id
             JOIN sales s ON si.sale_id = s.id
             WHERE s.status='active' AND s.sale_date >= date('now', '-7 days', 'localtime')
             GROUP BY p.category ORDER BY total DESC`
          ),
          // Évolution 7 jours
          daily_revenue: dbAll(
            `SELECT sale_date as date, COALESCE(SUM(total_amount), 0) as total
             FROM sales WHERE status='active' AND sale_date >= date('now', '-7 days', 'localtime')
             GROUP BY sale_date ORDER BY sale_date`
          ),
          // Dernière clôture
          last_closure: dbGet('SELECT * FROM cash_closures ORDER BY created_at DESC LIMIT 1'),
        };
        return { success: true, stats };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

  // ============================================================
  // CRATE TYPES
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.CRATE_TYPES_LIST, () => {
    const types = dbAll('SELECT * FROM crate_types ORDER BY name');
    return { success: true, types };
  });

  ipcMain.handle(IPC_CHANNELS.CRATE_TYPES_CREATE,
    (_event, data: { name: string; capacity: number; consigne_amount: number }) => {
      try {
        const id = uuidv4();
        dbRun(
          'INSERT INTO crate_types (id, name, capacity, consigne_amount) VALUES (?, ?, ?, ?)',
          [id, data.name, data.capacity, data.consigne_amount]
        );
        const created = dbGet('SELECT * FROM crate_types WHERE id = ?', [id]);
        return { success: true, type: created };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ============================================================
  // STOCK ENTRY (entrée de stock / réapprovisionnement)
  // Seuls gérant et super_admin peuvent faire des entrées
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.STOCK_ENTRY,
    (_event, data: { product_id: string; quantity_crates: any; quantity_loose: any; comment?: string; bl_number?: string; new_buy_price?: number }) => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Non authentifié.');
        if (currentUser.role !== 'super_admin' && currentUser.role !== 'gerant') throw new Error('Accès refusé.');

        const qtyCrates = parseInt(data.quantity_crates) || 0;
        const qtyLoose = parseInt(data.quantity_loose) || 0;
        const bl = data.bl_number || '';

        dbRun(
          `UPDATE products SET stock_full_crates = stock_full_crates + ?, stock_loose_bottles = stock_loose_bottles + ?, updated_at = datetime('now','localtime') WHERE id = ?`,
          [qtyCrates, qtyLoose, data.product_id]
        );

        // Mise à jour prix d'achat si fourni
        if (data.new_buy_price && data.new_buy_price > 0) {
          dbRun('UPDATE products SET buy_price_liquid = ? WHERE id = ?', [data.new_buy_price, data.product_id]);
        }

        dbRun(
          `INSERT INTO packaging_movements (id, client_id, user_id, product_id, type, quantity_crates, quantity_bottles, comment)
           VALUES (?, NULL, ?, ?, 'entree', ?, ?, ?)`,
          [uuidv4(), currentUser.id, data.product_id, qtyCrates, qtyLoose, bl ? `Entrée de stock — BL ${bl}` : 'Entrée de stock']
        );

        addAuditLog(currentUser.id, 'stock_entry', 'product', data.product_id, { qtyCrates, qtyLoose, bl });
        const updated = dbGet('SELECT p.*, b.name as brewery_name FROM products p LEFT JOIN breweries b ON p.brewery_id=b.id WHERE p.id=?', [data.product_id]);
        return { success: true, product: updated };
      } catch (err: any) { return { success: false, error: err.message }; }
    }
  );

  // ============================================================
  // DAMAGE / AVARIES (casse)
  // Seuls gérant et super_admin peuvent déclarer des avaries
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.DAMAGE_CREATE,
    (_event, data: {
      product_id: string;
      quantity_liquid: number;
      quantity_crates: number;
      quantity_bottles: number;
      comment?: string;
    }) => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Non authentifié.');
        if (currentUser.role !== 'super_admin' && currentUser.role !== 'gerant') {
          throw new Error('Accès refusé : seuls le Gérant et le Super Admin peuvent déclarer des avaries.');
        }

        dbTransaction(() => {
          const product = dbGet<any>('SELECT * FROM products WHERE id = ?', [data.product_id]);
          if (!product) throw new Error('Produit introuvable.');

          // quantity_liquid = bouteilles nues cassées, quantity_crates = casiers pleins cassés
          const qtyLoose = data.quantity_liquid || 0;
          const qtyCrates = data.quantity_crates || 0;

          if (qtyLoose > 0 && product.stock_loose_bottles < qtyLoose) {
            throw new Error(`Stock bouteilles nues insuffisant pour ${product.name}. Disponible: ${product.stock_loose_bottles}`);
          }
          if (qtyCrates > 0 && product.stock_full_crates < qtyCrates) {
            throw new Error(`Stock de casiers insuffisant pour ${product.name}. Disponible: ${product.stock_full_crates}`);
          }

          // Déduire le stock bouteilles nues
          if (qtyLoose > 0) {
            dbRun(
              'UPDATE products SET stock_loose_bottles = stock_loose_bottles - ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?',
              [qtyLoose, data.product_id]
            );
          }

          // Déduire les casiers pleins
          if (qtyCrates > 0) {
            dbRun(
              'UPDATE products SET stock_full_crates = stock_full_crates - ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?',
              [qtyCrates, data.product_id]
            );
          }

          // Enregistrer le mouvement de casse
          dbRun(
            `INSERT INTO packaging_movements (id, client_id, user_id, product_id, type, quantity_crates, quantity_bottles, comment)
             VALUES (?, NULL, ?, ?, 'casse', ?, ?, ?)`,
            [uuidv4(), currentUser.id, data.product_id, qtyCrates, qtyLoose, data.comment || 'Avarie / Casse']
          );

          addAuditLog(currentUser.id, 'damage_recorded', 'product', data.product_id, {
            quantity_liquid: qtyLoose,
            quantity_crates: qtyCrates,
          });
        });

        const updated = dbGet('SELECT * FROM products WHERE id = ?', [data.product_id]);
        return { success: true, product: updated };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ============================================================
  // SALE CANCELLATION (gérant / super_admin uniquement)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.SALE_CANCEL, (_event, saleId: string) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error('Non authentifié.');
      if (currentUser.role !== 'super_admin' && currentUser.role !== 'gerant') {
        throw new Error('Accès refusé : seuls le Gérant et le Super Admin peuvent annuler une vente.');
      }

      const sale = dbGet<any>('SELECT * FROM sales WHERE id = ?', [saleId]);
      if (!sale) throw new Error('Vente introuvable.');
      if (sale.status === 'cancelled') throw new Error('Cette vente est déjà annulée.');

      dbTransaction(() => {
        // Restaurer les stocks (nouveau modèle)
        const items = dbAll<any>('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);
        for (const item of items) {
          dbRun(
            `UPDATE products SET stock_full_crates = stock_full_crates + ?, stock_loose_bottles = stock_loose_bottles + ?, updated_at = datetime('now','localtime') WHERE id = ?`,
            [item.quantity_full_crates || 0, item.quantity_loose_bottles || 0, item.product_id]
          );
        }

        // Annuler la vente
        dbRun("UPDATE sales SET status = 'cancelled' WHERE id = ?", [saleId]);

        // Si c'était un crédit, annuler l'impact sur le solde client
        if (sale.payment_method === 'credit') {
          dbRun(
            'UPDATE clients SET financial_balance = financial_balance - ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?',
            [sale.total_amount, sale.client_id]
          );
        }

        // Annuler la dette d'emballage (stockée par vente, donc fiable même pour les ventes
        // créées avant l'introduction de cette colonne — elles valent 0 et ne sont pas affectées).
        if (sale.client_id && ((sale.packaging_debt_crates || 0) !== 0 || (sale.packaging_debt_bottles || 0) !== 0)) {
          dbRun(
            'UPDATE clients SET material_balance_crates = material_balance_crates - ?, material_balance_bottles = material_balance_bottles - ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?',
            [sale.packaging_debt_crates || 0, sale.packaging_debt_bottles || 0, sale.client_id]
          );
        }
      });

      addAuditLog(currentUser.id, 'sale_cancelled', 'sale', saleId, {
        original_total: sale.total_liquid + sale.total_consigne,
        cancelled_by: currentUser.username,
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ============================================================
  // CLIENT HISTORY (opérations complètes d'un client)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.CLIENT_HISTORY, (_event, clientId: string) => {
    try {
      // Ventes à crédit
      const sales = dbAll(
        `SELECT s.id, s.total_liquid, s.total_consigne, s.payment_method, s.status, s.created_at,
                'Vente' as operation_type
         FROM sales s WHERE s.client_id = ? ORDER BY s.created_at DESC`,
        [clientId]
      );

      // Mouvements d'emballages
      const packaging = dbAll(
        `SELECT pm.id, pm.type, pm.quantity_crates, pm.quantity_bottles, pm.comment, pm.created_at,
                'Emballage' as operation_type, p.name as product_name, u.username
         FROM packaging_movements pm
         LEFT JOIN products p ON pm.product_id = p.id
         LEFT JOIN users u ON pm.user_id = u.id
         WHERE pm.client_id = ? ORDER BY pm.created_at DESC`,
        [clientId]
      );

      // Fusionner et trier
      const history = [
        ...sales.map((s: any) => ({
          id: s.id, type: 'sale', date: s.created_at,
          label: s.status === 'cancelled' ? 'Vente ANNULÉE' : 'Vente à crédit',
          amount: s.status === 'cancelled' ? -(s.total_liquid + s.total_consigne) : (s.total_liquid + s.total_consigne),
          detail: `${s.total_liquid}F liquide + ${s.total_consigne}F consigne`,
        })),
        ...packaging.map((p: any) => {
          const typeLabel: Record<string, string> = { entree: 'Entrée', sortie: 'Sortie', echange: 'Échange', casse: 'Casse', restitution: 'Retour client' };
          return {
            id: p.id, type: 'packaging', date: p.created_at,
            label: `${typeLabel[p.type] || p.type} — ${p.product_name || ''}`,
            amount: 0,
            detail: `${p.quantity_crates} casiers, ${p.quantity_bottles} bouteilles — ${p.comment}`,
          };
        }),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return { success: true, history };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ============================================================
  // CLIENT REPAYMENT (remboursement financier)
  // Seuls gérant et super_admin
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.CLIENT_REPAYMENT,
    (_event, data: { client_id: string; amount: number; method: string; comment?: string }) => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Non authentifié.');
        if (currentUser.role !== 'super_admin' && currentUser.role !== 'gerant') {
          throw new Error('Accès refusé : seuls le Gérant et le Super Admin peuvent enregistrer un remboursement.');
        }

        if (data.amount <= 0) throw new Error('Le montant doit être positif.');

        const client = dbGet<any>('SELECT * FROM clients WHERE id = ?', [data.client_id]);
        if (!client) throw new Error('Client introuvable.');

        dbRun(
          'UPDATE clients SET financial_balance = financial_balance - ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?',
          [data.amount, data.client_id]
        );

        addAuditLog(currentUser.id, 'client_repayment', 'client', data.client_id, {
          amount: data.amount,
          method: data.method,
          comment: data.comment,
        });

        const updated = dbGet('SELECT * FROM clients WHERE id = ?', [data.client_id]);
        return { success: true, client: updated };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.CLIENT_REPAYMENTS_LIST, () => {
    const rows = dbAll<any>(
      `SELECT al.id, al.entity_id as client_id, al.details, al.created_at,
              c.name as client_name, COALESCE(u.full_name, u.username) as processed_by
       FROM audit_logs al
       LEFT JOIN clients c ON al.entity_id = c.id
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.action = 'client_repayment'
       ORDER BY al.created_at DESC`
    );
    const repayments = rows.map(r => {
      let details: any = {};
      try { details = JSON.parse(r.details || '{}'); } catch (_) {}
      return {
        id: r.id, client_id: r.client_id, client_name: r.client_name || 'Client supprimé',
        amount: details.amount || 0, method: details.method || 'cash', comment: details.comment || '',
        processed_by: r.processed_by, created_at: r.created_at,
      };
    });
    return { success: true, repayments };
  });

  // ============================================================
  // CLIENT UPDATE (modification fiche)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.CLIENTS_UPDATE,
    (_event, clientId: string, data: { name?: string; phone?: string; address?: string }) => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Non authentifié.');
        if (currentUser.role !== 'super_admin' && currentUser.role !== 'gerant') {
          throw new Error('Accès refusé.');
        }

        const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
        const values = Object.values(data);
        dbRun(`UPDATE clients SET ${fields}, updated_at = datetime('now', 'localtime') WHERE id = ?`, [...values, clientId]);

        const updated = dbGet('SELECT * FROM clients WHERE id = ?', [clientId]);
        return { success: true, client: updated };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ============================================================
  // CLIENT DELETE (Super Admin uniquement)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.CLIENTS_DELETE, (_event, clientId: string) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error('Non authentifié.');
      if (currentUser.role !== 'super_admin') throw new Error('Accès réservé au Super Admin.');

      const client = dbGet<any>('SELECT * FROM clients WHERE id = ?', [clientId]);
      if (!client) throw new Error('Client introuvable.');
      if (client.financial_balance !== 0 || client.material_balance_crates !== 0 || client.material_balance_bottles !== 0) {
        throw new Error('Impossible de supprimer : ce client a un solde financier ou matériel non nul.');
      }
      const salesCount = dbGet<any>('SELECT COUNT(*) as n FROM sales WHERE client_id = ?', [clientId]);
      if (salesCount?.n > 0) throw new Error('Impossible de supprimer : ce client a des factures dans l\'historique.');

      dbRun('DELETE FROM clients WHERE id = ?', [clientId]);
      addAuditLog(currentUser.id, 'client_deleted', 'client', clientId, { name: client.name });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ============================================================
  // IMPRESSION (ticket 80mm / A4)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.PRINT_GET_PRINTERS, async () => {
    try {
      const printers = await getPrinters(getMainWindow());
      return { success: true, printers };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PRINT_HTML,
    async (_event, data: { html: string; pageSize: '80mm' | '48mm' | 'A4'; deviceName?: string }) => {
      try {
        await printHtml(data.html, data.pageSize, data.deviceName);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ============================================================
  // RAPPORTS D'ACTIVITÉ (résumé + notes/signalements)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.REPORTS_SUMMARY,
    (_event, userId: string | null, from: string, to: string) => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Non authentifié.');
        const targetUserId = currentUser.role === 'super_admin' && userId ? userId : currentUser.id;

        const salesAgg = dbGet<any>(
          `SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue,
                  COALESCE(SUM(CASE WHEN payment_method='cash' THEN total_amount ELSE 0 END),0) as revenue_cash,
                  COALESCE(SUM(CASE WHEN payment_method='credit' THEN total_amount ELSE 0 END),0) as revenue_credit
           FROM sales WHERE user_id=? AND status='active' AND sale_date BETWEEN ? AND ?`,
          [targetUserId, from, to]
        );
        const cratesAgg = dbGet<any>(
          `SELECT COALESCE(SUM(si.quantity_full_crates),0) as crates_sold
           FROM sale_items si JOIN sales s ON si.sale_id = s.id
           WHERE s.user_id=? AND s.status='active' AND s.sale_date BETWEEN ? AND ?`,
          [targetUserId, from, to]
        );
        const closuresAgg = dbGet<any>(
          `SELECT COUNT(*) as count, COALESCE(SUM(discrepancy),0) as total_discrepancy
           FROM cash_closures WHERE user_id=? AND date(closed_at) BETWEEN ? AND ?`,
          [targetUserId, from, to]
        );

        return {
          success: true,
          summary: {
            sales_count: salesAgg?.count || 0,
            revenue: salesAgg?.revenue || 0,
            revenue_cash: salesAgg?.revenue_cash || 0,
            revenue_credit: salesAgg?.revenue_credit || 0,
            crates_sold: cratesAgg?.crates_sold || 0,
            closures_count: closuresAgg?.count || 0,
            total_discrepancy: closuresAgg?.total_discrepancy || 0,
          },
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.REPORTS_LIST_NOTES, (_event, userId?: string | null) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error('Non authentifié.');

      let notes;
      if (currentUser.role === 'super_admin') {
        notes = userId
          ? dbAll(
              `SELECT ar.*, COALESCE(u.full_name,u.username) as user_name FROM activity_reports ar
               LEFT JOIN users u ON ar.user_id = u.id WHERE ar.user_id = ? ORDER BY ar.created_at DESC`,
              [userId]
            )
          : dbAll(
              `SELECT ar.*, COALESCE(u.full_name,u.username) as user_name FROM activity_reports ar
               LEFT JOIN users u ON ar.user_id = u.id ORDER BY ar.created_at DESC`
            );
      } else {
        notes = dbAll(
          `SELECT ar.*, COALESCE(u.full_name,u.username) as user_name FROM activity_reports ar
           LEFT JOIN users u ON ar.user_id = u.id WHERE ar.user_id = ? ORDER BY ar.created_at DESC`,
          [currentUser.id]
        );
      }
      return { success: true, notes };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_ADD_NOTE, (_event, note: string) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error('Non authentifié.');
      if (!note || !note.trim()) throw new Error('La note ne peut pas être vide.');

      const id = uuidv4();
      dbRun(
        `INSERT INTO activity_reports (id, user_id, note) VALUES (?, ?, ?)`,
        [id, currentUser.id, note.trim()]
      );
      addAuditLog(currentUser.id, 'report_note_added', 'activity_report', id, {});
      return { success: true, note: dbGet('SELECT * FROM activity_reports WHERE id = ?', [id]) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_ACK_NOTE, (_event, id: string) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error('Non authentifié.');
      if (currentUser.role !== 'super_admin') throw new Error('Accès réservé au Super Admin.');

      dbRun("UPDATE activity_reports SET status = 'acknowledged' WHERE id = ?", [id]);
      addAuditLog(currentUser.id, 'report_note_acknowledged', 'activity_report', id, {});
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ============================================================
  // DB EXPORT (sauvegarde chiffrée)
  // ============================================================

  ipcMain.handle(IPC_CHANNELS.DB_EXPORT, async (_event, destPath?: string) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error('Non authentifié.');
      if (currentUser.role !== 'super_admin' && currentUser.role !== 'gerant') {
        throw new Error('Accès refusé.');
      }

      const { saveToDisk, getDbPath } = require('./database');
      saveToDisk();
      const srcPath = getDbPath();
      const exportPath = destPath || path.join(app.getPath('desktop'), `geststock-backup-${new Date().toISOString().slice(0,10)}.db`);

      const fs = require('fs');
      const data = fs.readFileSync(srcPath);
      // Chiffrement AES-256
      const key = 'GESTSTOCK_SECURE_KEY_2024_CAMEROON';
      const encrypted = CryptoJS.AES.encrypt(data.toString('base64'), key).toString();
      fs.writeFileSync(exportPath, encrypted);

      addAuditLog(currentUser.id, 'db_export', 'system', null, { path: exportPath });
      return { success: true, path: exportPath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}