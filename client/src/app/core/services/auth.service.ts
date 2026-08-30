import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  profileImage?: string;
  twoFactorEnabled?: boolean;
  twoFactorType?: 'EMAIL' | 'APP';
  createdAt: string;
}

export interface AuthResponse {
  message: string;
  token?: string;
  user?: User;
  requires2FA?: boolean;
  twoFactorType?: 'EMAIL' | 'APP';
  tempToken?: string;
  maskedEmail?: string;
}

export interface LoginPayload {
  email?: string;
  username?: string;
  identifier?: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

const API_BASE = 'https://rc-manager-api.vercel.app/api/auth';
const TOKEN_KEY = 'rcm_token';
const USER_KEY = 'rcm_user';
// Clave en sessionStorage para bloquear re-login durante logout incluso tras F5
const LOGOUT_FLAG_KEY = 'rcm_logging_out';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);

  private _token = signal<string | null>(this.getStoredToken());
  private _user = signal<User | null>(this.getStoredUser());

  readonly currentUser = this._user.asReadonly();
  readonly token = this._token.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token() && !!this._user());

  constructor() {
    // Si venimos de un logout (incluso tras F5), borramos cualquier sesion de Supabase que quede
    if (this.isLoggingOut()) {
      this.wipeSupabaseKeys();
      this.clearLogoutFlag();
    }

    this.supabaseService.supabase.auth.onAuthStateChange((event, session) => {
      // Ignorar eventos de Supabase si estamos en proceso de logout
      if (this.isLoggingOut()) return;

      if (session && event === 'SIGNED_IN') {
        this.http.post<AuthResponse>(`${API_BASE}/supabase`, { access_token: session.access_token }).subscribe({
          next: (res) => {
            this.handleAuthSuccess(res);
            const currentUrl = this.router.url;
            if (currentUrl.includes('/login') || currentUrl.includes('/register')) {
              this.router.navigate(['/profile']);
            }
          },
          error: (err) => {
            console.error('Error al intercambiar el token de Supabase con el backend:', err);
          }
        });
      }
    });
  }

  // ── Login normal (Email + Password) ────────────────────────────────────────
  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API_BASE}/login`, payload).pipe(
      tap((res) => {
        if (!res.requires2FA) {
          this.handleAuthSuccess(res);
        }
      }),
      catchError((err) => throwError(() => err))
    );
  }

  // ── Login 2FA (Verificar código 6 dígitos TOTP o EMAIL) ────────────────────
  login2FA(tempToken: string, code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API_BASE}/login/2fa`, { tempToken, code }).pipe(
      tap((res) => {
        this.handleAuthSuccess(res);
      }),
      catchError((err) => throwError(() => err))
    );
  }

  // ── Reenviar código de 2FA por Email en Login ──────────────────────────────
  resendLogin2FAEmail(tempToken: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${API_BASE}/login/2fa/resend`, { tempToken }).pipe(
      catchError(err => throwError(() => err))
    );
  }

  // ── Register con Google únicamente ─────────────────────────────────────────
  register(payload: RegisterPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API_BASE}/register`, payload).pipe(
      tap((res) => {
        this.handleAuthSuccess(res);
      }),
      catchError((err) => throwError(() => err))
    );
  }

  // ── 2FA Management ─────────────────────────────────────────────────────────
  setup2FA(): Observable<{ secret: string; qrCode: string; otpauthUrl: string }> {
    return this.http.post<{ secret: string; qrCode: string; otpauthUrl: string }>(
      `${API_BASE}/2fa/setup`,
      {},
      { headers: this.getAuthHeaders() }
    ).pipe(
      catchError(err => throwError(() => err))
    );
  }

  send2FAEmailCode(): Observable<{ message: string; email: string; maskedEmail: string }> {
    return this.http.post<{ message: string; email: string; maskedEmail: string }>(
      `${API_BASE}/2fa/send-email-code`,
      {},
      { headers: this.getAuthHeaders() }
    ).pipe(
      catchError(err => throwError(() => err))
    );
  }

  enable2FA(payload: { type: 'EMAIL' | 'APP'; code: string; secret?: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${API_BASE}/2fa/enable`,
      payload,
      { headers: this.getAuthHeaders() }
    ).pipe(
      tap(() => {
        const u = this._user();
        if (u) {
          const updated: User = { ...u, twoFactorEnabled: true, twoFactorType: payload.type };
          localStorage.setItem(USER_KEY, JSON.stringify(updated));
          this._user.set(updated);
        }
      }),
      catchError(err => throwError(() => err))
    );
  }

  disable2FA(code?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${API_BASE}/2fa/disable`,
      { code },
      { headers: this.getAuthHeaders() }
    ).pipe(
      tap(() => {
        const u = this._user();
        if (u) {
          const updated = { ...u, twoFactorEnabled: false };
          localStorage.setItem(USER_KEY, JSON.stringify(updated));
          this._user.set(updated);
        }
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ── Supabase Google Login ──────────────────────────────────────────────────
  async signInWithGoogle(): Promise<void> {
    // Asegurarse de limpiar el flag de logout antes de iniciar sesion
    this.clearLogoutFlag();

    const { error } = await this.supabaseService.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/login'
      }
    });

    if (error) {
      console.error('Error iniciando sesion con Google:', error.message);
      throw error;
    }
  }

  // ── Check Username Availability ───────────────────────────────────────────
  checkUsername(username: string): Observable<{ available: boolean; exists?: boolean; suggestions?: string[]; message?: string }> {
    return this.http.get<{ available: boolean; exists?: boolean; suggestions?: string[]; message?: string }>(
      'https://rc-manager-api.vercel.app/api/users/check-username',
      {
        headers: this.getAuthHeaders(),
        params: { username }
      }
    ).pipe(
      catchError(err => throwError(() => err))
    );
  }

  // ── Fetch Current User Profile from Server ────────────────────────────────
  fetchCurrentUser(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${API_BASE}/me`, {
      headers: this.getAuthHeaders()
    }).pipe(
      tap(({ user }) => {
        if (user) {
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          this._user.set(user);
        }
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ── Update Profile ─────────────────────────────────────────────────────────
  updateProfile(data: Partial<User>): Observable<User> {
    return this.http.put<User>('https://rc-manager-api.vercel.app/api/users/profile', data, {
      headers: this.getAuthHeaders()
    }).pipe(
      tap((updatedUser) => {
        // Actualizar la caché local fusionando con los datos existentes
        const current = this._user();
        const merged: User = { ...(current || {}), ...updatedUser };
        localStorage.setItem(USER_KEY, JSON.stringify(merged));
        this._user.set(merged);
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ── Change / Set Password ───────────────────────────────────────────────────
  changePassword(newPassword: string, currentPassword?: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(
      'https://rc-manager-api.vercel.app/api/users/password',
      { newPassword, currentPassword },
      { headers: this.getAuthHeaders() }
    ).pipe(
      catchError(err => throwError(() => err))
    );
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  logout(): void {
    // 1. Marcar en sessionStorage que estamos haciendo logout
    //    (persiste aunque el usuario haga F5 durante los proximos 5 segundos)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(LOGOUT_FLAG_KEY, '1');
    }

    // 2. Limpiar senales de Angular
    this._token.set(null);
    this._user.set(null);

    // 3. Borrar localStorage de forma sincrona
    this.wipeAllKeys();

    // 4. Navegar al inicio
    this.router.navigate(['/']);

    // 5. Cerrar sesion en Supabase de forma async
    this.supabaseService.supabase.auth.signOut().finally(() => {
      // Limpiar el flag tras completar el signOut (tipicamente menos de 1s)
      setTimeout(() => this.clearLogoutFlag(), 3000);
    });
  }

  // ── Get auth headers ───────────────────────────────────────────────────────
  getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this._token()}` });
  }

  // ── Helpers privados ───────────────────────────────────────────────────────
  private isLoggingOut(): boolean {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(LOGOUT_FLAG_KEY) === '1';
  }

  private clearLogoutFlag(): void {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(LOGOUT_FLAG_KEY);
    }
  }

  private wipeSupabaseKeys(): void {
    if (typeof window === 'undefined') return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-')) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }

  private wipeAllKeys(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.wipeSupabaseKeys();
  }

  private handleAuthSuccess(res: AuthResponse): void {
    if (res.token && res.user) {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      this._token.set(res.token);
      this._user.set(res.user);
    }
  }

  private getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    // Si estamos en proceso de logout, no devolver el token aunque exista
    if (sessionStorage.getItem(LOGOUT_FLAG_KEY) === '1') return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  private getStoredUser(): User | null {
    if (typeof window === 'undefined') return null;
    if (sessionStorage.getItem(LOGOUT_FLAG_KEY) === '1') return null;
    const raw = localStorage.getItem(USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
