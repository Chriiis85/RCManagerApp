import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

export type LegalTab = 'terminos' | 'privacidad' | 'cookies' | 'aviso-legal';

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './legal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LegalComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  activeTab = signal<LegalTab>('terminos');
  lastUpdated = '25 de Agosto de 2026';
  contactEmail = 'rcmanager.support@gmail.com';

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const tab = params.get('tab') as LegalTab;
      if (tab && ['terminos', 'privacidad', 'cookies', 'aviso-legal'].includes(tab)) {
        this.activeTab.set(tab);
      }
    });

    // También soportar rutas directas basadas en la URL actual
    const url = this.router.url;
    if (url.includes('/privacidad')) {
      this.activeTab.set('privacidad');
    } else if (url.includes('/cookies')) {
      this.activeTab.set('cookies');
    } else if (url.includes('/aviso-legal')) {
      this.activeTab.set('aviso-legal');
    } else if (url.includes('/terminos')) {
      this.activeTab.set('terminos');
    }
  }

  setTab(tab: LegalTab): void {
    this.activeTab.set(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  printDocument(): void {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }
}
