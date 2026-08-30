import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { NetworkService } from './core/services/network.service';
import { filter } from 'rxjs/operators';
import { BlockScrollDirective } from './core/directives/block-scroll.directive';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, BlockScrollDirective],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full h-full',
  },
})
export class App implements OnInit {
  protected readonly title = signal('RCManager');
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  networkService = inject(NetworkService);
  router = inject(Router);
  
  ngOnInit() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      setTimeout(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      }, 50);
    });
  }
  
  isMenuOpen = signal(false);
  
  showLogoutModal = signal(false);
  logoutCountdown = signal(100);
  private logoutInterval: any;

  toggleMenu() {
    this.isMenuOpen.update(s => !s);
  }

  closeMenu() {
    this.isMenuOpen.set(false);
  }

  doLogout() {
    this.closeMenu();
    this.authService.logout();
  }

  legalModalTitle = signal('');
  legalModalText = signal('');
  showLegalModal = signal(false);

  openInfoModal(title: string, type: string) {
    this.legalModalTitle.set(title);
    if (type === 'privacy') {
      this.legalModalText.set('En RCManager respetamos tu privacidad. Los datos almacenados (parques visitados, créditos, información de perfil) se utilizan exclusivamente para ofrecerte la mejor experiencia en la plataforma y calcular tus estadísticas. No compartimos tus datos personales con terceros.');
    } else if (type === 'terms') {
      this.legalModalText.set('Al utilizar RCManager, aceptas utilizar la plataforma de forma cívica y respetuosa. La información sobre atracciones y parques es colaborativa. No nos hacemos responsables de posibles errores en las especificaciones de las atracciones.');
    } else if (type === 'cookies') {
      this.legalModalText.set('RCManager utiliza cookies y almacenamiento local estrictamente necesarios para mantener tu sesión activa y almacenar tus preferencias de inicio de sesión. No utilizamos cookies de rastreo publicitario de terceros.');
    } else if (type === 'contact') {
      this.legalModalText.set('¿Tienes algún problema, sugerencia o quieres colaborar con RCManager? Envíanos un correo a: rcmanager.support@gmail.com y te responderemos a la velocidad de Kingda Ka.');
    } else if (type === 'faq') {
      this.legalModalText.set('¿Qué es un "Credit"?\nUn credit es una montaña rusa en la que te has subido.\n\n¿Cómo añado un parque?\nBusca el parque en la sección "Parques Temáticos" y marca las atracciones en las que has estado.');
    } else if (type === 'suggest') {
      this.legalModalText.set('¿Falta tu parque favorito o se ha inaugurado una nueva montaña rusa? Estamos preparando un panel de comunidad para que tú mismo puedas añadirlas. Mientras tanto, contáctanos por email.');
    } else if (type === 'map') {
      this.legalModalText.set('La función de Mapa Mundial interactivo está actualmente en desarrollo. Pronto podrás ver todos los parques del mundo geolocalizados en un mapa 3D.');
    }
    this.showLegalModal.set(true);
  }

  closeInfoModal() {
    this.showLegalModal.set(false);
  }
}
