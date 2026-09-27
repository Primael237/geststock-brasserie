// ============================================================
// GestStock Brasserie v1.0 — Impression réelle (ticket 80mm / A4)
// ============================================================

import { BrowserWindow } from 'electron';

export async function getPrinters(parent: BrowserWindow | null): Promise<any[]> {
  if (!parent) return [];
  return parent.webContents.getPrintersAsync();
}

export function printHtml(
  html: string,
  pageSize: '80mm' | '48mm' | 'A4',
  deviceName?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: false },
    });

    const microns: Record<'80mm' | '48mm', { width: number; height: number }> = {
      '80mm': { width: 80000, height: 200000 },
      '48mm': { width: 48000, height: 200000 },
    };

    win.webContents.once('did-finish-load', () => {
      win.webContents.print(
        {
          silent: !!deviceName,
          deviceName,
          margins: { marginType: 'none' },
          pageSize: pageSize === 'A4' ? 'A4' : microns[pageSize],
        } as any,
        (success, errorType) => {
          win.close();
          if (success) resolve();
          else reject(new Error(errorType || "Échec de l'impression."));
        }
      );
    });

    win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
  });
}
