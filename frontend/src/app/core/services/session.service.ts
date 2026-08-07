import { Injectable, signal, computed } from '@angular/core';
import { User } from '../models/helpdesk.models';

const STORAGE_KEY = 'helpdesk_active_user_id';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly activeUserId = signal<string | null>(
    localStorage.getItem(STORAGE_KEY)
  );
  private readonly users = signal<User[]>([]);

  readonly userId = this.activeUserId.asReadonly();
  readonly allUsers = this.users.asReadonly();

  readonly currentUser = computed(() => {
    const id = this.activeUserId();
    return this.users().find((u) => u.id === id) ?? null;
  });

  setUsers(users: User[]): void {
    this.users.set(users);
    const current = this.activeUserId();
    if (current && !users.some((u) => u.id === current)) {
      this.clearUser();
    }
    if (!this.activeUserId() && users.length) {
      const preferred =
        users.find((u) => u.role === 'AGENT') ??
        users.find((u) => u.role === 'ADMIN') ??
        users[0];
      this.setUser(preferred.id);
    }
  }

  setUser(id: string): void {
    this.activeUserId.set(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  clearUser(): void {
    this.activeUserId.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }
}
