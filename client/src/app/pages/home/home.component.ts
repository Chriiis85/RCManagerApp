import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  authService = inject(AuthService);

  scrollToDescubre() {
    const el = document.getElementById('descubre');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
