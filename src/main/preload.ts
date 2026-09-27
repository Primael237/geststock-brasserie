// ============================================================
// GestStock Brasserie v1.0 — Preload Script
// ============================================================

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types';

const electronAPI = {
  // Auth
  checkFirstRun: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK_FIRST_RUN),
  login: (username: string, password: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, username, password),
  verifySuperAdminRegisterCode: (code: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_VERIFY_REGISTER_CODE, code),
  registerSuperAdmin: (code: string, username: string, password: string, confirmPassword: string, depotName: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_REGISTER, code, username, password, confirmPassword, depotName),
  changePassword: (userId: string, oldPassword: string, newPassword: string, isFirstLogin: boolean): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHANGE_PASSWORD, userId, oldPassword, newPassword, isFirstLogin),
  logout: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  getCurrentUser: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_CURRENT_USER),

  // Users
  listUsers: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.USERS_LIST),
  createUser: (username: string, password: string, role: string, fullName: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.USERS_CREATE, username, password, role, fullName),
  updateUser: (userId: string, isActive: boolean): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.USERS_UPDATE, userId, isActive),
  resetUserPassword: (userId: string, newPassword: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.USERS_RESET_PASSWORD, userId, newPassword),

  // Products
  listProducts: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_LIST),
  createProduct: (product: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_CREATE, product),
  updateProduct: (id: string, data: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_UPDATE, id, data),
  deleteProduct: (id: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_DELETE, id),

  // Breweries
  listBreweries: (): Promise<any> =>
    ipcRenderer.invoke('breweries:list'),
  createBrewery: (name: string): Promise<any> =>
    ipcRenderer.invoke('breweries:create', name),

  // Clients
  listClients: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIENTS_LIST),
  createClient: (data: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIENTS_CREATE, data),
  updateClient: (clientId: string, data: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIENTS_UPDATE, clientId, data),
  deleteClient: (clientId: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIENTS_DELETE, clientId),
  getClientHistory: (clientId: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIENT_HISTORY, clientId),
  clientRepayment: (data: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIENT_REPAYMENT, data),
  listClientRepayments: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLIENT_REPAYMENTS_LIST),

  // Sales
  listSales: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_LIST),
  createSale: (data: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_CREATE, data),
  cancelSale: (saleId: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.SALE_CANCEL, saleId),
  getSaleItems: (saleId: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.SALE_ITEMS, saleId),
  saveSaleDraft: (data: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_SAVE_DRAFT, data),
  deleteSaleDraft: (saleId: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_DELETE_DRAFT, saleId),

  // Packaging
  listPackagingMovements: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.PACKAGING_LIST),
  createPackagingMovement: (data: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.PACKAGING_CREATE, data),

  // Crate Types
  listCrateTypes: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.CRATE_TYPES_LIST),
  createCrateType: (data: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.CRATE_TYPES_CREATE, data),

  // Stock Entry
  stockEntry: (data: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_ENTRY, data),

  // Damage
  createDamage: (data: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.DAMAGE_CREATE, data),

  // Cash
  listCashClosures: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_CLOSURES_LIST),
  closeCash: (data: any): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_CLOSE, data),

  // Settings
  getSettings: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSetting: (key: string, value: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, key, value),

  // Stats
  getStats: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_GET_STATS),
  exportDb: (destPath?: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_EXPORT, destPath),

  // Printing
  getPrinters: (): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.PRINT_GET_PRINTERS),
  printHtml: (data: { html: string; pageSize: '80mm' | '48mm' | 'A4'; deviceName?: string }): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.PRINT_HTML, data),

  // Reports
  getReportSummary: (userId: string | null, from: string, to: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORTS_SUMMARY, userId, from, to),
  listReportNotes: (userId?: string | null): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORTS_LIST_NOTES, userId),
  addReportNote: (note: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORTS_ADD_NOTE, note),
  ackReportNote: (id: string): Promise<any> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORTS_ACK_NOTE, id),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;