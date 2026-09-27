// ============================================================
// GestStock Brasserie v1.0 — Service d'authentification
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { dbGet, dbAll, dbRun, dbTransaction } from './database';
import { User, UserRole } from '../shared/types';
import { addAuditLog } from './audit';

const SALT_ROUNDS = 10;

// Code d'accès requis avant de pouvoir accéder au formulaire de création
// d'un Super Admin supplémentaire depuis l'écran de connexion.
const SUPER_ADMIN_SIGNUP_CODE = 'NewPass2025';

// Session active (mono-utilisateur local, simplifié)
let currentSession: { user: User } | null = null;

// ============================================================
// Vérification premier lancement
// ============================================================
export function isFirstRun(): boolean {
  const row = dbGet<{ count: number }>('SELECT COUNT(*) as count FROM users');
  return (row?.count ?? 0) === 0;
}

// ============================================================
// Création du Super Admin (premier lancement uniquement)
// ============================================================
export function createSuperAdmin(tempPassword: string): User {
  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(tempPassword, SALT_ROUNDS);

  dbRun(
    `INSERT INTO users (id, username, password_hash, role, full_name, must_change_password, is_active)
     VALUES (?, ?, ?, 'super_admin', 'Super Administrateur', 1, 1)`,
    [id, 'superadmin', passwordHash]
  );

  addAuditLog('system', 'user_created', 'user', id, { username: 'superadmin', role: 'super_admin' });

  return {
    id,
    username: 'superadmin',
    password_hash: passwordHash,
    role: 'super_admin',
    full_name: 'Super Administrateur',
    created_at: new Date().toISOString(),
    is_active: 1,
    must_change_password: 1,
  };
}

// ============================================================
// Vérification du code d'accès à l'inscription Super Admin
// ============================================================
export function verifySuperAdminSignupCode(code: string): boolean {
  return (code || '').trim() === SUPER_ADMIN_SIGNUP_CODE;
}

// ============================================================
// Inscription d'un Super Admin supplémentaire (en plus du compte
// auto-créé au premier lancement) — depuis l'écran de connexion.
// ============================================================
export function registerSuperAdmin(
  code: string,
  username: string,
  password: string,
  confirmPassword: string,
  depotName: string
): User {
  if (!verifySuperAdminSignupCode(code)) {
    throw new Error("Code d'accès incorrect.");
  }

  const cleanUsername = username.trim();
  const cleanDepotName = depotName.trim();

  if (!cleanUsername || !password || !cleanDepotName) {
    throw new Error('Tous les champs sont obligatoires.');
  }
  if (password !== confirmPassword) {
    throw new Error('Les mots de passe ne correspondent pas.');
  }
  if (password.length < 6) {
    throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
  }

  const existing = dbGet<{ id: string }>('SELECT id FROM users WHERE username = ?', [cleanUsername]);
  if (existing) {
    throw new Error("Ce nom d'utilisateur existe déjà.");
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);

  dbRun(
    `INSERT INTO users (id, username, password_hash, role, full_name, must_change_password, is_active)
     VALUES (?, ?, ?, 'super_admin', ?, 0, 1)`,
    [id, cleanUsername, passwordHash, cleanDepotName]
  );

  dbRun(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('depot_name', ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [cleanDepotName]
  );

  addAuditLog(id, 'user_created', 'user', id, { username: cleanUsername, role: 'super_admin', via: 'signup' });

  return {
    id,
    username: cleanUsername,
    password_hash: passwordHash,
    role: 'super_admin',
    full_name: cleanDepotName,
    created_at: new Date().toISOString(),
    is_active: 1,
    must_change_password: 0,
  };
}

// ============================================================
// Login
// ============================================================
export function login(username: string, password: string): { user: User; mustChangePassword: boolean } {
  const user = dbGet<User>('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);

  if (!user) {
    throw new Error("Nom d'utilisateur ou mot de passe incorrect.");
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    dbRun(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
       VALUES (?, 'system', 'login_failed', 'user', ?, ?)`,
      [uuidv4(), user.id, JSON.stringify({ username })]
    );
    throw new Error("Nom d'utilisateur ou mot de passe incorrect.");
  }

  dbRun(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
     VALUES (?, ?, 'login_success', 'user', ?, ?)`,
    [uuidv4(), user.id, user.id, JSON.stringify({ username })]
  );

  currentSession = { user };

  return {
    user,
    mustChangePassword: user.must_change_password === 1,
  };
}

// ============================================================
// Changement de mot de passe
// ============================================================
export function changePassword(userId: string, oldPassword: string, newPassword: string, isFirstLogin: boolean): void {
  const user = dbGet<User>('SELECT * FROM users WHERE id = ?', [userId]);

  if (!user) {
    throw new Error('Utilisateur introuvable.');
  }

  if (!isFirstLogin) {
    const valid = bcrypt.compareSync(oldPassword, user.password_hash);
    if (!valid) {
      throw new Error('Ancien mot de passe incorrect.');
    }
  }

  if (newPassword.length < 6) {
    throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
  }

  const newHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  dbRun('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [newHash, userId]);

  addAuditLog(userId, 'password_changed', 'user', userId, {});

  // Mettre à jour la session
  if (currentSession && currentSession.user.id === userId) {
    currentSession.user.must_change_password = 0;
    currentSession.user.password_hash = newHash;
  }
}

// ============================================================
// Déconnexion
// ============================================================
export function logout(): void {
  if (currentSession) {
    addAuditLog(currentSession.user.id, 'logout', 'user', currentSession.user.id, {});
  }
  currentSession = null;
}

// ============================================================
// Session courante
// ============================================================
export function getCurrentUser(): User | null {
  return currentSession?.user || null;
}

export function requireAuth(): User {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('Non authentifié.');
  }
  return user;
}

export function requireRole(allowedRoles: UserRole[]): User {
  const user = requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new Error('Accès non autorisé.');
  }
  return user;
}

// ============================================================
// Gestion des utilisateurs (super_admin uniquement)
// ============================================================
export function listUsers(): Omit<User, 'password_hash'>[] {
  requireRole(['super_admin']);
  return dbAll<Omit<User, 'password_hash'>>(
    'SELECT id, username, role, full_name, created_at, is_active, must_change_password FROM users ORDER BY created_at DESC'
  );
}

export function createUser(username: string, password: string, role: UserRole, fullName: string): Omit<User, 'password_hash'> {
  const currentUser = requireRole(['super_admin']);

  if (!['gerant', 'caissier'].includes(role)) {
    throw new Error('Rôle invalide. Le super_admin peut créer uniquement gerant ou caissier.');
  }

  if (password.length < 6) {
    throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
  }

  // Vérifier unicité username
  const existing = dbGet<{ id: string }>('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    throw new Error("Ce nom d'utilisateur existe déjà.");
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);

  dbRun(
    `INSERT INTO users (id, username, password_hash, role, full_name, must_change_password, is_active)
     VALUES (?, ?, ?, ?, ?, 1, 1)`,
    [id, username, passwordHash, role, fullName]
  );

  addAuditLog(currentUser.id, 'user_created', 'user', id, { username, role });

  return dbGet<Omit<User, 'password_hash'>>(
    'SELECT id, username, role, full_name, created_at, is_active, must_change_password FROM users WHERE id = ?',
    [id]
  )!;
}

export function toggleUserActive(userId: string, isActive: boolean): void {
  const currentUser = requireRole(['super_admin']);

  if (userId === currentUser.id) {
    throw new Error('Vous ne pouvez pas désactiver votre propre compte.');
  }

  dbRun('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, userId]);

  addAuditLog(currentUser.id, isActive ? 'user_activated' : 'user_deactivated', 'user', userId, {});
}

// Réinitialisation par le Super Admin : les mots de passe sont hashés (bcrypt), donc
// irréversibles — impossible de "revoir" l'ancien. Le Super Admin en définit un nouveau ;
// l'utilisateur devra le changer à sa prochaine connexion.
export function adminResetPassword(userId: string, newPassword: string): void {
  const currentUser = requireRole(['super_admin']);

  const target = dbGet<User>('SELECT * FROM users WHERE id = ?', [userId]);
  if (!target) throw new Error('Utilisateur introuvable.');
  if (newPassword.length < 6) throw new Error('Le mot de passe doit contenir au moins 6 caractères.');

  const newHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  dbRun('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [newHash, userId]);

  addAuditLog(currentUser.id, 'password_reset_by_admin', 'user', userId, { username: target.username });
}