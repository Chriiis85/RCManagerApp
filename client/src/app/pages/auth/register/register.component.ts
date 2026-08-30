import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './register.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private authService = inject(AuthService);

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  async onGoogleLogin() {
    this.errorMessage.set(null);
    this.isLoading.set(true);
    try {
      await this.authService.signInWithGoogle();
    } catch (err: any) {
      this.isLoading.set(false);
      this.errorMessage.set(err.message || 'Error al conectar con Google.');
    }
  }
}
