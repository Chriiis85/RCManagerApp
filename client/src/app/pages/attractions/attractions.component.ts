import { BlockScrollDirective } from '../../core/directives/block-scroll.directive';
import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, HostListener, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { RecordsService } from '../../core/services/records.service';

interface Attraction {
  id: number;
  name: string;
  park: string;
  country: string;
  type: string;
  manufacturer: string;
  openingYear: number;
  status: string;
  image: string;
  description: string;
}

let cachedAttractions: Attraction[] | null = null;

@Component({
  selector: 'app-attractions',
  standalone: true,
  imports: [CommonModule, FormsModule, BlockScrollDirective],
  templateUrl: './attractions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttractionsComponent implements OnInit {
  searchQuery = signal('');
  selectedCountries = signal<string[]>([]);
  selectedTypes = signal<string[]>([]);
  selectedManufacturers = signal<string[]>([]);
  selectedParks = signal<string[]>([]);
  hideRemoved = signal(true);
  
  isLoading = signal(true);
  hasError = signal(false);
  showFilters = signal(false);
  mobileGridMode = signal<'large' | 'compact'>(typeof window !== 'undefined' && window.innerWidth < 768 ? 'compact' : 'large');

  showSuccessModal = signal(false);
  showLoginPromptModal = signal(false);
  authService = inject(AuthService);
  recordsService = inject(RecordsService);
  router = inject(Router);
  route = inject(ActivatedRoute);

  attractions = signal<Attraction[]>([]);
  userAttractions = signal<Set<number>>(new Set());

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        this.fetchUserAttractions();
      } else {
        this.userAttractions.set(new Set());
      }
    });
  }

  visibleCount = signal(20);

  visibleAttractions = computed(() => {
    return this.filteredAttractions().slice(0, this.visibleCount());
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
    this.fetchAttractions();
  }

  fetchUserAttractions() {
    this.recordsService.getAttractions().subscribe({
      next: (records) => {
        const ids = new Set<number>();
        records.forEach(r => {
          ids.add(r.attractionId);
          if (r.attraction?.apiId) ids.add(r.attraction.apiId);
        });
        this.userAttractions.set(ids);
      },
      error: (err) => console.error('Error fetching user attractions:', err)
    });
  }

  fetchAttractions() {
    if (cachedAttractions && cachedAttractions.length > 0) {
      this.attractions.set(cachedAttractions);
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.hasError.set(false);
    fetch('https://rc-manager-api.vercel.app/api/attractions')
      .then(res => {
        if (!res.ok) throw new Error('Error al consultar atracciones');
        return res.json();
      })
      .then(data => {
        const mappedData: Attraction[] = data.map((a: any) => ({
          id: a.id,
          name: a.name,
          park: a.park?.name || 'Desconocido',
          country: a.park?.country || 'Desconocido',
          type: this.mapType(a.type),
          manufacturer: a.manufacturer || 'Desconocido',
          openingYear: a.openingYear || 0,
          status: this.mapStatus(a.status),
          image: a.imageUrl || `https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&q=80&w=800&id=${a.id}`,
          description: `Disfruta de la emocionante atracción ${a.name} en ${a.park?.name}.`
        }));
        // Barajar (shuffle) las atracciones para que salgan en orden aleatorio
        for (let i = mappedData.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [mappedData[i], mappedData[j]] = [mappedData[j], mappedData[i]];
        }

        cachedAttractions = mappedData;
        this.attractions.set(mappedData);
        this.isLoading.set(false);
      })
      .catch(err => {
        console.error('Error fetching attractions:', err);
        this.hasError.set(true);
        this.isLoading.set(false);
      });
  }

  private mapType(type: string): string {
    const types: Record<string, string> = {
      'WATER_RIDE': 'Acuática',
      'FLAT_RIDE': 'Flat Ride',
      'DARK_RIDE': 'Dark Ride',
      'OTHER': 'Otros',
      'ROLLER_COASTER': 'Montaña Rusa'
    };
    return types[type] || type;
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

  filteredAttractions = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const selCountries = this.selectedCountries();
    const selTypes = this.selectedTypes();
    const selManufacturers = this.selectedManufacturers();
    const selParks = this.selectedParks();
    const hide = this.hideRemoved();

    return this.attractions().filter(a => {
      if (hide && (a.status === 'Eliminada' || a.status === 'Cerrada')) return false;

      const matchesSearch = a.name.toLowerCase().includes(query) || 
                          a.park.toLowerCase().includes(query) ||
                          a.country.toLowerCase().includes(query);
      
      if (!matchesSearch) return false;

      if (selCountries.length > 0 && !selCountries.includes(a.country)) return false;
      if (selTypes.length > 0 && !selTypes.includes(a.type)) return false;
      if (selManufacturers.length > 0 && !selManufacturers.includes(a.manufacturer)) return false;
      if (selParks.length > 0 && !selParks.includes(a.park)) return false;

      return true;
    });
  });

  countries = computed(() => [...new Set(this.attractions().map(a => a.country))].sort());
  types = computed(() => [...new Set(this.attractions().map(a => a.type))].sort());
  manufacturers = computed(() => [...new Set(this.attractions().map(a => a.manufacturer))].sort());
  parks = computed(() => [...new Set(this.attractions().map(a => a.park))].sort());

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

  togglePark(name: string) {
    this.selectedParks.update(list => 
      list.includes(name) ? list.filter(i => i !== name) : [...list, name]
    );
    this.visibleCount.set(20);
  }

  clearAllFilters() {
    this.selectedCountries.set([]);
    this.selectedTypes.set([]);
    this.selectedManufacturers.set([]);
    this.selectedParks.set([]);
    this.hideRemoved.set(true);
    this.searchQuery.set('');
    this.visibleCount.set(20);
  }

  showDeleteSuccessModal = signal(false);
  showDeleteConfirmModal = signal(false);
  showAddConfirmModal = signal(false);
  isSubmitting = signal(false);
  selectedAttraction = signal<Attraction | null>(null);

  countdown = signal(2);
  successInterval: any;
  successTimer: any;

  handleAction(item: Attraction) {
    if (!this.authService.isAuthenticated()) {
      this.showLoginPromptModal.set(true);
      return;
    }

    this.selectedAttraction.set(item);
    const hasRecord = this.userAttractions().has(item.id);

    if (hasRecord) {
      this.showDeleteConfirmModal.set(true);
    } else {
      this.showAddConfirmModal.set(true);
    }
  }

  confirmDelete() {
    const item = this.selectedAttraction();
    if (!item) return;

    this.recordsService.removeAttraction(item.id).subscribe({
      next: () => {
        this.userAttractions.update(set => {
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
        console.error('Error al eliminar atracción', err);
        this.showDeleteConfirmModal.set(false);
        this.selectedAttraction.set(null);
      }
    });
  }

  confirmAdd() {
    const item = this.selectedAttraction();
    if (!item) return;

    if (this.userAttractions().has(item.id)) {
      this.showAddConfirmModal.set(false);
      this.selectedAttraction.set(null);
      return;
    }

    this.isSubmitting.set(true);
    this.recordsService.addAttraction(item.id, undefined, undefined, {
      name: item.name,
      park: item.park,
      country: item.country,
      manufacturer: item.manufacturer
    }).subscribe({
      next: () => {
        this.userAttractions.update(set => {
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
        if (err.status === 409) {
          this.userAttractions.update(set => {
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
          console.error('Error al añadir atracción', err);
          this.showAddConfirmModal.set(false);
          this.selectedAttraction.set(null);
        }
        this.isSubmitting.set(false);
      }
    });
  }

  closeAddSuccess() {
    this.showSuccessModal.set(false);
    this.selectedAttraction.set(null);
    if (this.successTimer) clearTimeout(this.successTimer);
    if (this.successInterval) clearInterval(this.successInterval);
  }

  closeDeleteSuccess() {
    this.showDeleteSuccessModal.set(false);
    this.selectedAttraction.set(null);
    if (this.successTimer) clearTimeout(this.successTimer);
    if (this.successInterval) clearInterval(this.successInterval);
  }

  closeAddConfirm() {
    this.showAddConfirmModal.set(false);
    this.selectedAttraction.set(null);
  }

  closeDeleteConfirm() {
    this.showDeleteConfirmModal.set(false);
    this.selectedAttraction.set(null);
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
