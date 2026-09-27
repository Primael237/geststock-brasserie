"use strict";
// ============================================================
// GestStock Brasserie v1.0 — Types partagés
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
// IPC channel names
exports.IPC_CHANNELS = {
    AUTH_LOGIN: 'auth:login',
    AUTH_CHANGE_PASSWORD: 'auth:change-password',
    AUTH_LOGOUT: 'auth:logout',
    AUTH_GET_CURRENT_USER: 'auth:get-current-user',
    AUTH_CHECK_FIRST_RUN: 'auth:check-first-run',
    USERS_LIST: 'users:list',
    USERS_CREATE: 'users:create',
    USERS_UPDATE: 'users:update',
    USERS_DELETE: 'users:delete',
    PRODUCTS_LIST: 'products:list',
    PRODUCTS_CREATE: 'products:create',
    PRODUCTS_UPDATE: 'products:update',
    PRODUCTS_DELETE: 'products:delete',
    CLIENTS_LIST: 'clients:list',
    CLIENTS_CREATE: 'clients:create',
    CLIENTS_UPDATE: 'clients:update',
    SALES_LIST: 'sales:list',
    SALES_CREATE: 'sales:create',
    CASH_CLOSURES_LIST: 'cash:closures-list',
    CASH_CLOSE: 'cash:close',
    PACKAGING_LIST: 'packaging:list',
    PACKAGING_CREATE: 'packaging:create',
    SETTINGS_GET: 'settings:get',
    SETTINGS_UPDATE: 'settings:update',
    DB_GET_STATS: 'db:get-stats',
};
//# sourceMappingURL=types.js.map