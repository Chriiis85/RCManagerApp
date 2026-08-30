import { BlockScrollDirective } from '../../core/directives/block-scroll.directive';
import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, HostListener, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { RecordsService } from '../../core/services/records.service';

interface Coaster {
  id: number;
  name: string;
  park: string;
  country: string;
  type: string;
  height: string;
  speed: string;
  length: string;
  image: string;
  manufacturer: string;
  status: string;
}

let cachedCoasters: Coaster[] | null = null;

@Component({
  selector: 'app-credits',
  standalone: true,
  imports: [CommonModule, FormsModule, BlockScrollDirective],
  templateUrl: './credits.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditsComponent implements OnInit {
  searchQuery = signal('');
  showFilters = signal(false);
  mobileGridMode = signal<'large' | 'compact'>(typeof window !== 'undefined' && window.innerWidth < 768 ? 'compact' : 'large');
  hideRemoved = signal(true);
  
  selectedCountries = signal<string[]>([]);
  selectedParks = signal<string[]>([]);
  selectedTypes = signal<string[]>([]);
  selectedManufacturers = signal<string[]>([]);

  showSuccessModal = signal(false);
  showDeleteSuccessModal = signal(false);
  showLoginPromptModal = signal(false);
  showDeleteConfirmModal = signal(false);
  showAddConfirmModal = signal(false);
  isSubmitting = signal(false);
  selectedCoaster = signal<Coaster | null>(null);
  countdown = signal(2);
  isLoading = signal(true);
  hasError = signal(false);

  successTimer: any;
  successInterval: any;

  closeAddSuccess() {
    if (this.successTimer) clearTimeout(this.successTimer);
    if (this.successInterval) clearInterval(this.successInterval);
    this.showSuccessModal.set(false);
    this.selectedCoaster.set(null);
  }

  closeDeleteSuccess() {
    if (this.successTimer) clearTimeout(this.successTimer);
    if (this.successInterval) clearInterval(this.successInterval);
    this.showDeleteSuccessModal.set(false);
    this.selectedCoaster.set(null);
  }
  authService = inject(AuthService);
  recordsService = inject(RecordsService);
  router = inject(Router);
  route = inject(ActivatedRoute);

  coasters = signal<Coaster[]>([]);
  userCredits = signal<Set<number>>(new Set());

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        this.fetchUserCredits();
      } else {
        this.userCredits.set(new Set());
      }
    });
  }

  visibleCount = signal(20);

  visibleCoasters = computed(() => {
    return this.filteredCoasters().slice(0, this.visibleCount());
  });

  loadMore() {
    this.visibleCount.update(c => c + 20);
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const search = params['search'] || params['park'];
      if (search) {
        this.searchQuery.set(search);
      }
    });
    this.fetchCoasters();
  }

  async fetchUserCredits() {
    this.recordsService.getCredits().subscribe({
      next: (credits) => {
        // Store both the local DB id and the apiId so we can match external IDs
        const creditIds = new Set<number>();
        credits.forEach(c => {
          creditIds.add(c.coasterId);
          if (c.coaster?.apiId) creditIds.add(c.coaster.apiId);
        });
        this.userCredits.set(creditIds);
      },
      error: (err) => console.error('Error fetching user credits:', err)
    });
  }

  private mapStatus(status: string): string {
    if (!status) return 'Desconocido';
    const s = status.toUpperCase();
    const statuses: Record<string, string> = {
      'OPERATING': 'Operativa',
      'SBNO': 'Cerrada Temporalmente',
      'REMOVED': 'Eliminada',
      'CLOSED': 'Cerrada',
      'CONSTRUCTION': 'En Construcción',
      'UNDER CONSTRUCTION': 'En Construcción',
      'DEFUNCT': 'Eliminada'
    };
    return statuses[s] || status;
  }

  async fetchCoasters() {
    if (cachedCoasters && cachedCoasters.length > 0) {
      this.coasters.set(cachedCoasters);
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.hasError.set(false);
    try {
      const response = await fetch('https://rc-manager-api.vercel.app/api/coasters');
      if (!response.ok) throw new Error('Error al consultar el catálogo de montañas rusas');
      const data = await response.json();
      
      const mappedCoasters: Coaster[] = data.map((c: any) => ({
        id: c.id,
        name: c.name,
        park: c.park?.name || 'Desconocido',
        country: c.park?.country || 'Desconocido',
        type: c.model || 'N/A',
        height: c.height ? `${c.height}m` : 'N/A',
        speed: c.speed ? `${c.speed} km/h` : 'N/A',
        length: c.length ? `${c.length}m` : 'N/A',
        status: this.mapStatus(c.status),
        image: c.imageUrl || `https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&q=80&w=800&id=${c.id}`,
        manufacturer: c.manufacturer || 'Desconocido'
      }));

      // Barajar (shuffle) los coasters para que salgan en orden aleatorio
      for (let i = mappedCoasters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mappedCoasters[i], mappedCoasters[j]] = [mappedCoasters[j], mappedCoasters[i]];
      }

      cachedCoasters = mappedCoasters;
      this.coasters.set(mappedCoasters);
    } catch (error) {
      console.error('Error fetching coasters:', error);
      this.hasError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  handleAction(item: Coaster) {
    if (!this.authService.isAuthenticated()) {
      this.showLoginPromptModal.set(true);
      return;
    }

    this.selectedCoaster.set(item);
    const hasCredit = this.userCredits().has(item.id);

    if (hasCredit) {
      this.showDeleteConfirmModal.set(true);
    } else {
      this.showAddConfirmModal.set(true);
    }
  }

  confirmDelete() {
    const item = this.selectedCoaster();
    if (!item) return;

    this.recordsService.removeCredit(item.id).subscribe({
      next: () => {
        this.userCredits.update(set => {
          const newSet = new Set(set);
          newSet.delete(item.id);
          return newSet;
        });
        this.showDeleteConfirmModal.set(false);
        this.showDeleteSuccessModal.set(true);
        this.countdown.set(2);
        if (this.successTimer) clearTimeout(this.successTimer);
        if (this.successInterval) clearInterval(this.successInterval);

        this.successInterval = setInterval(() => {
          this.countdown.update(c => Math.max(0, c - 1));
        }, 1000);

        this.successTimer = setTimeout(() => {
          this.closeDeleteSuccess();
        }, 2000);
      },
      error: (err) => {
        console.error('Error al eliminar credit', err);
        this.showDeleteConfirmModal.set(false);
        this.selectedCoaster.set(null);
      }
    });
  }

  closeAddConfirm() {
    this.showAddConfirmModal.set(false);
    this.selectedCoaster.set(null);
  }

  confirmAdd() {
    const item = this.selectedCoaster();
    if (!item) return;

    // Comprobación defensiva antes de llamar a la API
    if (this.userCredits().has(item.id)) {
      this.showAddConfirmModal.set(false);
      this.selectedCoaster.set(null);
      return;
    }

    this.isSubmitting.set(true);
    this.recordsService.addCredit(item.id, undefined, undefined, undefined, {
      name: item.name,
      park: item.park,
      country: item.country,
      manufacturer: item.manufacturer
    }).subscribe({
      next: () => {
        this.userCredits.update(set => {
          const newSet = new Set(set);
          newSet.add(item.id);
          return newSet;
        });
        this.showAddConfirmModal.set(false);
        this.isSubmitting.set(false);
        this.showSuccessModal.set(true);
        this.countdown.set(2);
        if (this.successTimer) clearTimeout(this.successTimer);
        if (this.successInterval) clearInterval(this.successInterval);

        this.successInterval = setInterval(() => {
          this.countdown.update(c => Math.max(0, c - 1));
        }, 1000);

        this.successTimer = setTimeout(() => {
          this.closeAddSuccess();
        }, 2000);
      },
      error: (err) => {
        // Si la API responde 409 (ya existe), actualizamos el estado local sin mostrar error
        if (err.status === 409) {
          this.userCredits.update(set => {
            const newSet = new Set(set);
            newSet.add(item.id);
            return newSet;
          });
          this.showAddConfirmModal.set(false);
          this.showSuccessModal.set(true);
          this.countdown.set(2);
          if (this.successTimer) clearTimeout(this.successTimer);
          if (this.successInterval) clearInterval(this.successInterval);

          this.successInterval = setInterval(() => {
            this.countdown.update(c => Math.max(0, c - 1));
          }, 1000);

          this.successTimer = setTimeout(() => {
            this.closeAddSuccess();
          }, 2000);
        } else {
          console.error('Error al añadir credit', err);
          this.showAddConfirmModal.set(false);
          this.selectedCoaster.set(null);
        }
        this.isSubmitting.set(false);
      }
    });
  }

  filteredCoasters = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const selCountries = this.selectedCountries();
    const selParks = this.selectedParks();
    const selTypes = this.selectedTypes();
    const selManufacturers = this.selectedManufacturers();
    const hide = this.hideRemoved();

    return this.coasters().filter(c => {
      if (hide && (c.status === 'Eliminada' || c.status === 'Cerrada')) return false;

      // 1. Search Query
      const matchesSearch = c.name.toLowerCase().includes(query) ||
        c.park.toLowerCase().includes(query) ||
        c.country.toLowerCase().includes(query) ||
        c.manufacturer.toLowerCase().includes(query);
      if (!matchesSearch) return false;

      // 2. Multi-select Filters
      if (selCountries.length > 0 && !selCountries.includes(c.country)) return false;
      if (selParks.length > 0 && !selParks.includes(c.park)) return false;
      if (selTypes.length > 0 && !selTypes.includes(c.type)) return false;
      if (selManufacturers.length > 0 && !selManufacturers.includes(c.manufacturer)) return false;

      return true;
    });
  });

  countries = computed(() => {
    const all = this.coasters().map(c => c.country);
    return [...new Set(all)].sort();
  });

  parks = computed(() => {
    const all = this.coasters().map(c => c.park);
    return [...new Set(all)].sort();
  });

  types = computed(() => {
    const all = this.coasters().map(c => c.type);
    return [...new Set(all)].sort();
  });

  manufacturers = computed(() => {
    const all = this.coasters().map(c => c.manufacturer);
    return [...new Set(all)].sort();
  });

  updateSearch(query: string) {
    this.searchQuery.set(query);
    this.visibleCount.set(20);
  }

  toggleCountry(name: string) {
    this.selectedCountries.update(list => 
      list.includes(name) ? list.filter(i => i !== name) : [...list, name]
    );
    this.visibleCount.set(20);
  }

  togglePark(name: string) {
    this.selectedParks.update(list => 
      list.includes(name) ? list.filter(i => i !== name) : [...list, name]
    );
    this.visibleCount.set(20);
  }

  toggleType(name: string) {
    this.selectedTypes.update(list => 
      list.includes(name) ? list.filter(i => i !== name) : [...list, name]
    );
    this.visibleCount.set(20);
  }

  toggleManufacturer(name: string) {
    this.selectedManufacturers.update(list => 
      list.includes(name) ? list.filter(i => i !== name) : [...list, name]
    );
    this.visibleCount.set(20);
  }

  clearAllFilters() {
    this.selectedCountries.set([]);
    this.selectedParks.set([]);
    this.selectedTypes.set([]);
    this.selectedManufacturers.set([]);
    this.hideRemoved.set(true);
    this.searchQuery.set('');
    this.visibleCount.set(20);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.showFilters()) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.filter-toggle-btn') && !target.closest('.filter-panel')) {
      this.showFilters.set(false);
    }
  }

  showScrollTop = signal(false);

  @HostListener('window:scroll')
  onWindowScroll() {
    this.showScrollTop.set(window.scrollY > 400);
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
