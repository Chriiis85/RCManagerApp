import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, FormsModule, CommonModule],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  showPassword = signal(false);
  isSubmitted = signal(false);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  isGoogleHint = signal(false);

  // ── 2FA Step ─────────────────────────────────────────────────────────────
  requires2FA     = signal(false);
  twoFactorType   = signal<'EMAIL' | 'APP'>('APP');
  tempToken       = signal<string | null>(null);
  maskedEmail     = signal<string>('');
  twoFACode       = signal('');
  resendLoading   = signal(false);
  resendSuccess   = signal<string | null>(null);
  resendCooldown  = signal(0);
  private resendTimer: any = null;

  loginForm = this.fb.nonNullable.group({
    identifier: ['', [Validators.required]],
    password: ['', [Validators.required]]
  });

  get identifier() { return this.loginForm.get('identifier'); }
  get email() { return this.loginForm.get('identifier'); }
  get password() { return this.loginForm.get('password'); }

  togglePassword() {
    this.showPassword.update(s => !s);
  }

  onSubmit() {
    this.isSubmitted.set(true);
    this.errorMessage.set(null);
    this.isGoogleHint.set(false);

    if (this.loginForm.invalid) return;

    const { identifier, password } = this.loginForm.getRawValue();
    const cleanIdentifier = identifier.trim();
    this.isLoading.set(true);

    this.authService.login({ identifier: cleanIdentifier, email: cleanIdentifier, password }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.requires2FA && res.tempToken) {
          this.requires2FA.set(true);
          this.tempToken.set(res.tempToken);
          this.twoFactorType.set(res.twoFactorType || 'APP');
          this.maskedEmail.set(res.maskedEmail || '');
          this.twoFACode.set('');
          this.resendSuccess.set(null);
        } else {
          this.router.navigate(['/profile']);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        let msg = err?.error?.error || 'Error al iniciar sesión. Inténtalo de nuevo.';
        
        // Limpiar cualquier mención a Apple si el backend remoto aún la envía
        msg = msg.replace(/\s*o\s+Apple/gi, '').replace(/Apple/gi, '');

        // Mostrar sugerencia de Google solo si el backend indica que es una cuenta sin contraseña manual
        if (err?.error?.isOAuthHint) {
          this.isGoogleHint.set(true);
        } else {
          this.isGoogleHint.set(false);
        }

        this.errorMessage.set(msg);
      }
    });
  }

  on2FAInput(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input) {
      const digitsOnly = input.value.replace(/\D/g, '').slice(0, 6);
      this.twoFACode.set(digitsOnly);
      input.value = digitsOnly;
    }
  }

  onSubmit2FA() {
    const code = this.twoFACode().trim();
    const temp = this.tempToken();
    this.errorMessage.set(null);

    if (!code || code.length !== 6) {
      this.errorMessage.set(
        this.twoFactorType() === 'EMAIL'
          ? 'Introduce el código de 6 dígitos que enviamos a tu correo.'
          : 'Introduce el código de 6 dígitos de tu app de autenticación.'
      );
      return;
    }
    if (!temp) return;

    this.isLoading.set(true);
    this.authService.login2FA(temp, code).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/profile']);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error?.error || 'Código de verificación incorrecto o expirado.');
      }
    });
  }

  resendEmailCode() {
    const temp = this.tempToken();
    if (!temp || this.resendCooldown() > 0 || this.resendLoading()) return;

    this.resendLoading.set(true);
    this.errorMessage.set(null);
    this.resendSuccess.set(null);

    this.authService.resendLogin2FAEmail(temp).subscribe({
      next: (res) => {
        this.resendLoading.set(false);
        this.resendSuccess.set(res.message || '¡Código reenviado a tu correo!');
        this.startCooldown();
      },
      error: (err) => {
        this.resendLoading.set(false);
        this.errorMessage.set(err?.error?.error || 'Error al reenviar el código.');
      }
    });
  }

  private startCooldown() {
    this.resendCooldown.set(60);
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendTimer = setInterval(() => {
      const next = this.resendCooldown() - 1;
      this.resendCooldown.set(next);
      if (next <= 0) clearInterval(this.resendTimer);
    }, 1000);
  }

  cancel2FA() {
    this.requires2FA.set(false);
    this.tempToken.set(null);
    this.twoFACode.set('');
    this.errorMessage.set(null);
    this.resendSuccess.set(null);
    if (this.resendTimer) clearInterval(this.resendTimer);
  }

  async onGoogleLogin() {
    this.errorMessage.set(null);
    this.isLoading.set(true);
    try {
      await this.authService.signInWithGoogle();
      // Notamos que Supabase redireccionará toda la página al proveedor OAuth.
    } catch (err: any) {
      this.isLoading.set(false);
      this.errorMessage.set(err.message || 'Error al conectar con Google.');
    }
  }
}
