import { BlockScrollDirective } from '../../core/directives/block-scroll.directive';
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  HostListener,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { RecordsService } from '../../core/services/records.service';

interface ThemePark {
  id: number;
  name: string;
  location: string;
  country: string;
  opened: number;
  coasters: number;
  attractions: number;
  shows: number;
  image: string;
  description: string;
  category: 'Resort' | 'Temático' | 'Acuático';
  status: 'Abierto' | 'Cerrado';
  crowds: 'Muy Baja' | 'Baja' | 'Normal' | 'Alta' | 'Muy Alta';
  hasTodayData?: boolean;
}

const WIKIPEDIA_IMAGE_CACHE = new Map<string, string>();

@Component({
  selector: 'app-parks',
  standalone: true,
  imports: [CommonModule, FormsModule, BlockScrollDirective],
  templateUrl: './parks.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParksComponent implements OnInit, OnDestroy {
  @ViewChild('rideListContainer') rideListContainer!: ElementRef;
  searchQuery = signal('');
  selectedCountries = signal<string[]>([]);
  selectedStatuses = signal<string[]>([]); // 'Abierto', 'Cerrado', 'Sin Datos'
  selectedCrowds = signal<string[]>([]);
  visibleParksLimit = signal(15);
  showFilters = signal(false);
  gridMode = signal<'large' | 'compact'>(typeof window !== 'undefined' && window.innerWidth < 768 ? 'compact' : 'large');

  showSuccessModal = signal(false);
  showDeleteSuccessModal = signal(false);
  showAddConfirmModal = signal(false);
  showDeleteConfirmModal = signal(false);
  showLoginPromptModal = signal(false);
  isSubmitting = signal(false);
  selectedParkAction = signal<ThemePark | null>(null);
  countdown = signal(2);
  successTimer: any;
  successInterval: any;

  authService = inject(AuthService);
  recordsService = inject(RecordsService);
  router = inject(Router);
  userParks = signal<Set<number>>(new Set());

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated()) {
        this.fetchUserParks();
      } else {
        this.userParks.set(new Set());
      }
    });

    effect(() => {
      // Lazy load de imágenes y estados: Solo cargamos datos de los parques actualmente visibles
      const visible = this.filteredParks();
      this.loadDataForVisibleParks(visible);
    }, { allowSignalWrites: true });
  }

  closeAddSuccess() {
    this.showSuccessModal.set(false);
    this.selectedParkAction.set(null);
    if (this.successTimer) clearTimeout(this.successTimer);
    if (this.successInterval) clearInterval(this.successInterval);
  }

  closeDeleteSuccess() {
    this.showDeleteSuccessModal.set(false);
    this.selectedParkAction.set(null);
    if (this.successTimer) clearTimeout(this.successTimer);
    if (this.successInterval) clearInterval(this.successInterval);
  }

  closeAddConfirm() {
    this.showAddConfirmModal.set(false);
    this.selectedParkAction.set(null);
  }

  closeDeleteConfirm() {
    this.showDeleteConfirmModal.set(false);
    this.selectedParkAction.set(null);
  }

  // Estados para el detalle del parque
  selectedPark = signal<ThemePark | null>(null);
  parkQueueTimes = signal<any | null>(null);
  rideSearchQuery = signal('');
  rideSortOrder = signal<'asc' | 'desc'>('desc');
  isLoadingQueue = signal(false);
  isInitialLoading = signal(true);
  hasError = signal(false);

  sortedRides = computed(() => {
    const data = this.parkQueueTimes();
    if (!data) return [];

    const query = this.rideSearchQuery().toLowerCase();
    const order = this.rideSortOrder();

    // Extraemos todas las atracciones (de la raíz y de las 'lands')
    let allRides: any[] = [];
    if (data.rides) {
      allRides = [...data.rides];
    }
    if (data.lands) {
      data.lands.forEach((land: any) => {
        if (land.rides) {
          const landRides = land.rides.map((r: any) => ({
            ...r,
            landName: land.name,
          }));
          allRides = [...allRides, ...landRides];
        }
      });
    }

    // Filtramos por búsqueda
    const filtered = allRides.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        (r.landName && r.landName.toLowerCase().includes(query)),
    );

    // Ordenamos: Abiertas primero + Mayor/Menor tiempo de espera
    return filtered.sort((a, b) => {
      // 1. Si uno está abierto y el otro no, el abierto va primero
      if (a.is_open && !b.is_open) return -1;
      if (!a.is_open && b.is_open) return 1;

      // 2. Si ambos tienen el mismo estado, ordenamos según 'order'
      return order === 'desc' ? b.wait_time - a.wait_time : a.wait_time - b.wait_time;
    });
  });

  // Imágenes por defecto por país/región si Wikipedia falla
  private readonly FALLBACK_IMAGES: Record<string, string> = {
    'United States': 'https://images.unsplash.com/photo-1563656157432-67560011e209?auto=format&fit=crop&q=80&w=800',
    'United Kingdom': 'https://images.unsplash.com/photo-1517086822157-2b0358e7684a?auto=format&fit=crop&q=80&w=800',
    'Germany':        'https://images.unsplash.com/photo-1571401835393-8c5f35328320?auto=format&fit=crop&q=80&w=800',
    'France':         'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&q=80&w=800',
    'Spain':          'https://images.unsplash.com/photo-1543783207-ec64e4d95325?auto=format&fit=crop&q=80&w=800',
    'Netherlands':    'https://images.unsplash.com/photo-1512470876302-972faa2aa9a4?auto=format&fit=crop&q=80&w=800',
    'Japan':          'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&q=80&w=800',
    'China':          'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&q=80&w=800',
    'DEFAULT':        'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&q=80&w=800',
  };

  private async fetchWikipediaImage(parkName: string): Promise<string | null> {
    if (WIKIPEDIA_IMAGE_CACHE.has(parkName)) {
      return WIKIPEDIA_IMAGE_CACHE.get(parkName) ?? null;
    }
    try {
      const encoded = encodeURIComponent(parkName);
      // Buscamos directamente fotos en Wikimedia Commons (namespace 6)
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encoded}&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages) return null;
      const page = Object.values(pages)[0] as any;
      
      // Intentamos usar la miniatura a 800px para no cargar fotos de 10MB, si no existe usamos la original
      const resultUrl = page?.imageinfo?.[0]?.thumburl ?? page?.imageinfo?.[0]?.url ?? null;
      if (resultUrl) {
        WIKIPEDIA_IMAGE_CACHE.set(parkName, resultUrl);
      }
      return resultUrl;
    } catch {
      return null;
    }
  }

  private getFallbackImage(country: string, id: number): string {
    const base = this.FALLBACK_IMAGES[country] ?? this.FALLBACK_IMAGES['DEFAULT'];
    // añadimos un parámetro único para evitar que el navegador use una única caché
    return `${base}&park_id=${id}`;
  }

  private loadedDataParkIds = new Set<number>();
  private isLoadingData = false;

  private async loadDataForVisibleParks(visibleParks: ThemePark[]) {
    const parksToLoad = visibleParks.filter(p => !this.loadedDataParkIds.has(p.id));
    
    if (parksToLoad.length === 0) {
      if (!this.isLoadingData && this.isInitialLoading() && this.parks().length > 0) {
        this.isInitialLoading.set(false);
      }
      return;
    }

    this.isLoadingData = true;

    // Marcar como cargando para que no se vuelvan a procesar
    parksToLoad.forEach(p => this.loadedDataParkIds.add(p.id));

    // Procesamos secuencialmente con un retraso para evitar límite 429
    for (const park of parksToLoad) {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Lanzamos la actualización de estado y la imagen a la vez para este parque
      this.checkAndUpdateStatus(park);
      const img = await this.fetchWikipediaImage(park.name);
      
      if (img) {
        this.parks.update(list =>
          list.map(p => p.id === park.id ? { ...p, image: img } : p)
        );
      }
    }

    this.isLoadingData = false;

    // Si estamos en la carga inicial, la quitamos al terminar la primera tanda de visibles
    if (this.isInitialLoading()) {
      this.isInitialLoading.set(false);
    }
  }

  ngOnInit() {
    this.fetchParks();
  }

  fetchParks() {
    this.isInitialLoading.set(true);
    this.hasError.set(false);
    
    fetch('/queue-times-api/parks.json', {
      method: 'GET',
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Error en el servidor de parques (${res.status})`);
        }
        return res.json();
      })
      .then((groups) => {
        if (!Array.isArray(groups)) {
          throw new Error('Respuesta inesperada al obtener parques');
        }
        const allParks = groups.flatMap((group: any) => group.parks || []);

        const mappedParks: ThemePark[] = allParks.map((p: any) => ({
          id: p.id,
          name: p.name,
          location: p.country || 'Resort',
          country: p.country || 'Desconocido',
          opened: 0,
          coasters: 0,
          attractions: 0,
          shows: 0,
          // Imagen de fallback por país mientras carga Wikipedia
          image: this.getFallbackImage(p.country || 'DEFAULT', p.id),
          description: `Disfruta de la mejor experiencia en ${p.name}.`,
          category: 'Temático' as const,
          status: 'Abierto' as const,
          crowds: 'Normal' as const,
        }));

        mappedParks.sort((a, b) => {
          const aIsSpain = a.country === 'Spain' || a.country === 'España' || a.country === 'Spain ';
          const bIsSpain = b.country === 'Spain' || b.country === 'España' || b.country === 'Spain ';
          if (aIsSpain && !bIsSpain) return -1;
          if (!aIsSpain && bIsSpain) return 1;
          return 0;
        });

        this.parks.set(mappedParks);
      })
      .catch((err) => {
        console.error('Error al conectar con la API de parques (queue-times):', err);
        this.hasError.set(true);
        this.isInitialLoading.set(false);
      });
  }

  ngOnDestroy() {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  private async updateAllParkStatuses(mappedParks: ThemePark[]) {
    const batchSize = 15;
    for (let i = 0; i < mappedParks.length; i += batchSize) {
      const batch = mappedParks.slice(i, i + batchSize);
      await Promise.all(batch.map((park) => this.checkAndUpdateStatus(park)));
    }
  }

  private async checkAndUpdateStatus(park: ThemePark) {
    try {
      const res = await fetch(`/queue-times-api/parks/${park.id}/queue_times.json`);
      if (!res.ok) return;

      const data = await res.json();
      const allRides: any[] = [];

      if (data.rides) allRides.push(...data.rides);
      if (data.lands) {
        data.lands.forEach((land: any) => {
          if (land.rides) allRides.push(...land.rides);
        });
      }

      if (allRides.length === 0) {
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const hasFreshData = allRides.some((r) => r.last_updated && r.last_updated.startsWith(today));

      if (!hasFreshData) {
        return;
      }

      const allClosed = allRides.every((r) => r.is_open === false);
      const allZeroWait = allRides.every((r) => r.wait_time === 0 || r.wait_time === null);

      const newStatus: 'Abierto' | 'Cerrado' = allClosed || allZeroWait ? 'Cerrado' : 'Abierto';

      let newCrowds: 'Muy Baja' | 'Baja' | 'Normal' | 'Alta' | 'Muy Alta' = 'Baja';
      const totalRides = allRides.length;
      if (totalRides > 0) {
        const totalWait = allRides.reduce((acc, r) => acc + (r.wait_time || 0), 0);
        const crowdIndex = totalWait / totalRides;

        if (crowdIndex > 50) newCrowds = 'Muy Alta';
        else if (crowdIndex > 30) newCrowds = 'Alta';
        else if (crowdIndex > 15) newCrowds = 'Normal';
        else if (crowdIndex > 5) newCrowds = 'Baja';
        else newCrowds = 'Muy Baja';
      }

      this.parks.update((parks) =>
        parks.map((p) =>
          p.id === park.id ? { ...p, status: newStatus, crowds: newCrowds, hasTodayData: true } : p,
        ),
      );
    } catch (error) {
      // Ignorar errores individuales
    }
  }

  showParkDetails(park: ThemePark) {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    this.selectedPark.set(park);
    this.isLoadingQueue.set(true);
    this.parkQueueTimes.set(null);

    fetch(`/queue-times-api/parks/${park.id}/queue_times.json`, {
      method: 'GET',
    })
      .then((res) => res.json())
      .then((data) => {
        this.parkQueueTimes.set(data);
        this.isLoadingQueue.set(false);

        const allRides: any[] = [];
        if (data.rides) allRides.push(...data.rides);
        if (data.lands) {
          data.lands.forEach((land: any) => {
            if (land.rides) allRides.push(...land.rides);
          });
        }
        if (allRides.length > 0) {
          const allClosed = allRides.every((r: any) => r.is_open === false);
          const allZeroWait = allRides.every((r: any) => r.wait_time === 0 || r.wait_time === null);
          const newStatus: 'Abierto' | 'Cerrado' = allClosed || allZeroWait ? 'Cerrado' : 'Abierto';

          this.parks.update((parks) =>
            parks.map((p) => (p.id === park.id ? { ...p, status: newStatus } : p)),
          );
        }
      })
      .catch((err) => {
        console.error('Error cargando tiempos:', err);
        this.isLoadingQueue.set(false);
      });
  }

  closeParkDetails() {
    this.selectedPark.set(null);
    this.parkQueueTimes.set(null);
    this.rideSearchQuery.set('');
    this.rideSortOrder.set('desc');
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  updateRideSearch(query: string) {
    this.rideSearchQuery.set(query);
  }

  toggleRideSort() {
    this.rideSortOrder.set(this.rideSortOrder() === 'desc' ? 'asc' : 'desc');

    if (this.rideListContainer) {
      this.rideListContainer.nativeElement.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  }

  fetchUserParks() {
    this.recordsService.getParks().subscribe({
      next: (visits) => {
        const ids = new Set(
          visits
            .map(v => v.park?.apiId)
            .filter((id): id is number => id != null)
        );
        this.userParks.set(ids);
      },
      error: (err) => console.error('Error fetching user parks:', err)
    });
  }

  handleAction(item: ThemePark) {
    if (!this.authService.isAuthenticated()) {
      this.showLoginPromptModal.set(true);
      return;
    }

    this.selectedParkAction.set(item);
    const hasVisit = this.userParks().has(item.id);

    if (hasVisit) {
      this.showDeleteConfirmModal.set(true);
    } else {
      this.showAddConfirmModal.set(true);
    }
  }

  confirmDelete() {
    const item = this.selectedParkAction();
    if (!item) return;

    this.recordsService.removePark(item.id).subscribe({
      next: () => {
        this.userParks.update(set => {
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
        console.error('Error al eliminar parque', err);
        this.showDeleteConfirmModal.set(false);
        this.selectedParkAction.set(null);
      }
    });
  }

  confirmAdd() {
    const item = this.selectedParkAction();
    if (!item) return;

    if (this.userParks().has(item.id)) {
      this.showAddConfirmModal.set(false);
      this.selectedParkAction.set(null);
      return;
    }

    this.isSubmitting.set(true);
    this.recordsService.addPark(item.id, undefined, { name: item.name, country: item.country }).subscribe({
      next: () => {
        this.userParks.update(set => {
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
          this.userParks.update(set => {
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
          console.error('Error al añadir parque', err);
          this.showAddConfirmModal.set(false);
          this.selectedParkAction.set(null);
        }
        this.isSubmitting.set(false);
      }
    });
  }

  parks = signal<ThemePark[]>([]);

  allFilteredParks = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const selCountries = this.selectedCountries();
    const selStatuses = this.selectedStatuses();
    const selCrowds = this.selectedCrowds();

    return this.parks()
      .filter((p) => {
        const matchesSearch =
          p.name.toLowerCase().includes(query) ||
          p.location.toLowerCase().includes(query) ||
          p.country.toLowerCase().includes(query);
        if (!matchesSearch) return false;

        if (selCountries.length > 0 && !selCountries.includes(p.country)) return false;

        if (selStatuses.length > 0) {
          const pStatus = p.hasTodayData ? p.status : 'Sin Datos';
          if (!selStatuses.includes(pStatus)) return false;
        }

        if (selCrowds.length > 0 && p.hasTodayData && !selCrowds.includes(p.crowds)) return false;

        return true;
      })
      .sort((a, b) => {
        const aIsSpain = a.country === 'Spain' || a.country === 'España' || a.country === 'Spain ';
        const bIsSpain = b.country === 'Spain' || b.country === 'España' || b.country === 'Spain ';
        if (aIsSpain && !bIsSpain) return -1;
        if (!aIsSpain && bIsSpain) return 1;

        if (a.status === 'Abierto' && b.status === 'Cerrado') return -1;
        if (a.status === 'Cerrado' && b.status === 'Abierto') return 1;

        return a.name.localeCompare(b.name);
      });
  });

  filteredParks = computed(() => {
    return this.allFilteredParks().slice(0, this.visibleParksLimit());
  });

  hasMoreParks = computed(() => {
    return this.allFilteredParks().length > this.visibleParksLimit();
  });

  isLoadingMore = signal(false);

  async loadMore() {
    this.isLoadingMore.set(true);
    
    const currentLimit = this.visibleParksLimit();
    const nextLimit = currentLimit + 12;
    
    const nextBatch = this.allFilteredParks().slice(currentLimit, nextLimit);
    await this.loadDataForVisibleParks(nextBatch);
    
    this.visibleParksLimit.update((limit) => limit + 12);
    this.isLoadingMore.set(false);
  }

  countries = computed(() => {
    const allC = this.parks().map((p) => p.country);
    return [...new Set(allC)].sort();
  });

  updateSearch(query: string) {
    this.searchQuery.set(query);
    this.visibleParksLimit.set(15);
  }

  toggleCountry(country: string) {
    this.selectedCountries.update((list) =>
      list.includes(country) ? list.filter((c) => c !== country) : [...list, country],
    );
    this.visibleParksLimit.set(15);
  }

  toggleStatus(status: string) {
    this.selectedStatuses.update((list) =>
      list.includes(status) ? list.filter((s) => s !== status) : [...list, status],
    );
    this.visibleParksLimit.set(15);
  }

  toggleCrowd(crowd: string) {
    this.selectedCrowds.update((list) =>
      list.includes(crowd) ? list.filter((c) => c !== crowd) : [...list, crowd],
    );
    this.visibleParksLimit.set(15);
  }

  clearAllFilters() {
    this.selectedCountries.set([]);
    this.selectedStatuses.set([]);
    this.selectedCrowds.set([]);
    this.searchQuery.set('');
    this.visibleParksLimit.set(15);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.showFilters()) return;

    const target = event.target as HTMLElement;
    const isFilterButton = target.closest('.filter-toggle-btn');
    const isFilterPanel = target.closest('.filter-panel');

    if (!isFilterButton && !isFilterPanel) {
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

  handleImageError(event: Event, park: ThemePark) {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&q=80&w=800';
      target.style.opacity = '1';
    }
  }
}
