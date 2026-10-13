import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/helpdesk.models';

const TOKEN_KEY = 'helpdesk_auth_token';
const USER_KEY = 'helpdesk_auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiUrl;

  private readonly tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private readonly userSignal = signal<User | null>(readStoredUser());

  readonly token = this.tokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly isLoggedIn = computed(() => Boolean(this.tokenSignal() && this.userSignal()));

  readonly displayName = computed(() => {
    const u = this.userSignal();
    return u ? `${u.firstName} ${u.lastName}` : '';
  });

  readonly isAgent = computed(() => {
    const role = this.userSignal()?.role;
    return role === 'AGENT' || role === 'ADMIN';
  });

  readonly isRequester = computed(() => {
    const role = this.userSignal()?.role;
    return role === 'USER' || role === 'STAFF';
  });

  homeAfterLogin(): string {
    return this.isAgent() ? '/helpdesk/dashboard' : '/helpdesk/my';
  }

  login(email: string, password: string): Observable<User> {
    return this.http
      .post<{ token: string; user: User }>(`${this.base}/auth/login`, {
        email: email.trim().toLowerCase(),
        password,
      })
      .pipe(
        tap((res) => this.persist(res.token, res.user)),
        map((res) => res.user)
      );
  }

  logout(navigate = true): void {
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    if (navigate) {
      void this.router.navigateByUrl('/helpdesk');
    }
  }

  /** Odśwież profil z API (przy starcie aplikacji). */
  restoreSession(): Observable<User | null> {
    const token = this.tokenSignal();
    if (!token) {
      return of(null);
    }
    return this.http.get<User>(`${this.base}/auth/me`).pipe(
      tap((user) => this.persist(token, user)),
      catchError(() => {
        this.logout(false);
        return of(null);
      })
    );
  }

  private persist(token: string, user: User): void {
    this.tokenSignal.set(token);
    this.userSignal.set(user);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
