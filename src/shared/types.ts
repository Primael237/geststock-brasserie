// ============================================================
// GestStock Brasserie v1.0 — Types partagés
// ============================================================

export type UserRole = 'super_admin' | 'gerant' | 'caissier';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  full_name: string;
  created_at: string;
  is_active: number; // SQLite boolean (0/1)
  must_change_password: number; // SQLite boolean (0/1)
}

export interface Product {
  id: string;
  name: string;
  category: string;
  format: string; // e.g. '65cl', '33cl', '1.5L'
  price_liquid: number;
  price_consigne: number;
  crate_type_id: string | null;
  stock_liquid: number;
  stock_crates_full: number;
  stock_crates_empty: number;
  alert_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface CrateType {
  id: string;
  name: string;
  capacity: number; // combien de bouteilles par casier
  consigne_amount: number;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  address: string;
  financial_balance: number; // solde financier (positif = doit, négatif = crédit)
  material_balance_crates: number; // casiers chez le client
  material_balance_bottles: number; // bouteilles chez le client
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  client_id: string;
  user_id: string;
  total_liquid: number;
  total_consigne: number;
  payment_method: 'cash' | 'credit';
  sale_date: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price_liquid: number;
  unit_price_consigne: number;
  total_liquid: number;
  total_consigne: number;
}

export interface PackagingMovement {
  id: string;
  client_id: string | null;
  user_id: string;
  product_id: string;
  type: 'entree' | 'sortie' | 'echange' | 'casse' | 'restitution';
  quantity_crates: number;
  quantity_bottles: number;
  comment: string;
  created_at: string;
}

export interface CashClosure {
  id: string;
  user_id: string;
  theoretical_amount: number;
  real_amount: number;
  discrepancy: number;
  billetage: string; // JSON string
  packaging_inventory: string; // JSON string
  closed_at: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string; // JSON string
  created_at: string;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export interface AppSettings {
  depot_name: string;
  depot_address: string;
  depot_phone: string;
  currency: string;
  language: string;
}

// IPC channel names
export const IPC_CHANNELS = {
  AUTH_LOGIN: 'auth:login',
  AUTH_CHANGE_PASSWORD: 'auth:change-password',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_CURRENT_USER: 'auth:get-current-user',
  AUTH_CHECK_FIRST_RUN: 'auth:check-first-run',
  AUTH_REGISTER: 'auth:register',
  AUTH_VERIFY_REGISTER_CODE: 'auth:verify-register-code',
  USERS_LIST: 'users:list',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  USERS_RESET_PASSWORD: 'users:reset-password',
  PRODUCTS_LIST: 'products:list',
  PRODUCTS_CREATE: 'products:create',
  PRODUCTS_UPDATE: 'products:update',
  PRODUCTS_DELETE: 'products:delete',
  CLIENTS_LIST: 'clients:list',
  CLIENTS_CREATE: 'clients:create',
  CLIENTS_UPDATE: 'clients:update',
  CLIENTS_DELETE: 'clients:delete',
  CLIENT_HISTORY: 'client:history',
  CLIENT_REPAYMENT: 'client:repayment',
  CLIENT_REPAYMENTS_LIST: 'client:repayments-list',
  SALES_LIST: 'sales:list',
  SALES_CREATE: 'sales:create',
  SALE_CANCEL: 'sale:cancel',
  SALE_ITEMS: 'sale:items',
  SALES_SAVE_DRAFT: 'sales:save-draft',
  SALES_DELETE_DRAFT: 'sales:delete-draft',
  CASH_CLOSURES_LIST: 'cash:closures-list',
  CASH_CLOSE: 'cash:close',
  PACKAGING_LIST: 'packaging:list',
  PACKAGING_CREATE: 'packaging:create',
  CRATE_TYPES_LIST: 'crate-types:list',
  CRATE_TYPES_CREATE: 'crate-types:create',
  STOCK_ENTRY: 'stock:entry',
  DAMAGE_CREATE: 'damage:create',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  DB_GET_STATS: 'db:get-stats',
  DB_EXPORT: 'db:export',
  PRINT_GET_PRINTERS: 'print:get-printers',
  PRINT_HTML: 'print:html',
  REPORTS_SUMMARY: 'reports:summary',
  REPORTS_LIST_NOTES: 'reports:list-notes',
  REPORTS_ADD_NOTE: 'reports:add-note',
  REPORTS_ACK_NOTE: 'reports:ack-note',
} as const;

export interface ActivityReportNote {
  id: string;
  user_id: string;
  report_date: string;
  note: string;
  status: 'open' | 'acknowledged';
  created_at: string;
}