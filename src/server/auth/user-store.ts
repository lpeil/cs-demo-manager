/**
 * Armazenamento simples de usuários
 * Para autenticação simples (Opção B)
 *
 * Por padrão, cria um usuário admin com senha "admin"
 * Em produção, isso deve ser configurado via variáveis de ambiente ou arquivo de configuração
 */

import crypto from 'node:crypto';

export type User = {
  username: string;
  passwordHash: string; // Hash da senha (SHA-256 simples para autenticação básica)
  createdAt: number;
};

class UserStore {
  private users = new Map<string, User>();

  constructor() {
    // Criar usuário padrão admin/admin
    this.createUser('admin', 'admin');
  }

  /**
   * Cria um novo usuário
   */
  createUser(username: string, password: string): User {
    const passwordHash = this.hashPassword(password);
    const user: User = {
      username,
      passwordHash,
      createdAt: Date.now(),
    };

    this.users.set(username, user);
    return user;
  }

  /**
   * Verifica credenciais
   */
  verifyCredentials(username: string, password: string): boolean {
    const user = this.users.get(username);
    if (!user) {
      return false;
    }

    const passwordHash = this.hashPassword(password);
    return user.passwordHash === passwordHash;
  }

  /**
   * Obtém um usuário
   */
  getUser(username: string): User | undefined {
    return this.users.get(username);
  }

  /**
   * Lista todos os usuários (sem senhas)
   */
  listUsers(): Omit<User, 'passwordHash'>[] {
    return Array.from(this.users.values(), ({ passwordHash, ...user }) => user);
  }

  /**
   * Remove um usuário
   */
  deleteUser(username: string): boolean {
    return this.users.delete(username);
  }

  /**
   * Atualiza senha de um usuário
   */
  updatePassword(username: string, newPassword: string): boolean {
    const user = this.users.get(username);
    if (!user) {
      return false;
    }

    user.passwordHash = this.hashPassword(newPassword);
    return true;
  }

  /**
   * Hash simples de senha (SHA-256)
   * Para autenticação simples, isso é suficiente
   * Para produção, considerar bcrypt ou similar
   */
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }
}

export const userStore = new UserStore();
