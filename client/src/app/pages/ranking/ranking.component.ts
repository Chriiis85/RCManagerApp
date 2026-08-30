import { Component, ChangeDetectionStrategy, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  MAPPED_THEME_PARKS,
  WATER_PARKS_DATA,
  COASTERS_DATA,
  ATTRACTIONS_DATA,
  WATER_RIDES_DATA,
  SHOWS_DATA,
  FALLBACK_IMAGES
} from './theme-parks-data';

interface RankingItem {
  id: number | string;
  position: number;
  name: string;
  subtitle: string;
  park?: string;
  image: string;
  score: number;
  trend: 'up' | 'down' | 'stable';
  tipo?: string;
  gestor?: string;
}

interface RankingCategory {
  id: string;
  name: string;
  icon: string;
  items: RankingItem[];
}

@Component({
  selector: 'app-ranking',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ranking.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RankingComponent {
  activeCategoryId = signal<string>('theme_parks');
  isInitialLoading = signal<boolean>(true);
  isLoadingMore = signal<boolean>(false);
  displayLimit = signal<number>(10);

  private loadedImageIds = new Set<string | number>();

  constructor() {
    this.loadInitialData();
  }

  private async loadInitialData() {
    this.isInitialLoading.set(true);
    const visible = this.displayedItems();
    await this.loadImagesForItems(visible);
    this.isInitialLoading.set(false);
  }

  async selectCategory(id: string) {
    if (this.activeCategoryId() === id) return;
    this.activeCategoryId.set(id);
    this.displayLimit.set(10);
    
    const visible = this.displayedItems();
    const needsLoading = visible.some(item => !this.loadedImageIds.has(item.id));
    if (needsLoading) {
      this.isInitialLoading.set(true);
      await this.loadImagesForItems(visible);
      this.isInitialLoading.set(false);
    }
  }

  async loadMore() {
    if (this.isLoadingMore()) return;
    this.isLoadingMore.set(true);
    
    const currentLimit = this.displayLimit();
    const nextLimit = currentLimit + 10;
    const nextBatch = this.activeCategory().items.slice(currentLimit, nextLimit);

    // Cargamos las imágenes del siguiente lote ANTES de mostrarlas en pantalla
    await this.loadImagesForItems(nextBatch);

    this.displayLimit.set(nextLimit);
    this.isLoadingMore.set(false);
  }

  private async fetchWikipediaImage(searchQuery: string): Promise<string | null> {
    try {
      const encoded = encodeURIComponent(searchQuery);
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encoded}&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages) return null;
      const page = Object.values(pages)[0] as any;
      
      return page?.imageinfo?.[0]?.thumburl ?? page?.imageinfo?.[0]?.url ?? null;
    } catch {
      return null;
    }
  }

  private async loadImagesForItems(items: RankingItem[]) {
    const itemsToLoad = items.filter(item => !this.loadedImageIds.has(item.id));
    if (itemsToLoad.length === 0) return;

    itemsToLoad.forEach(item => this.loadedImageIds.add(item.id));

    // Procesamos en lotes de 4 peticiones concurrentes para máxima velocidad
    const batchSize = 4;
    for (let i = 0; i < itemsToLoad.length; i += batchSize) {
      const batch = itemsToLoad.slice(i, i + batchSize);
      await Promise.all(batch.map(async (item) => {
        const query = item.park ? `${item.name} ${item.park}` : item.name;
        const img = await this.fetchWikipediaImage(query);
        if (img) {
          this.categories.update(cats =>
            cats.map(c => ({
              ...c,
              items: c.items.map(it => it.id === item.id ? { ...it, image: img } : it)
            }))
          );
        }
      }));
    }
  }

  onImageError(item: RankingItem) {
    const safeFallback = 'https://images.unsplash.com/photo-1547675960-7634cf1b0856?auto=format&fit=crop&q=80&w=800';
    this.categories.update(cats =>
      cats.map(c => ({
        ...c,
        items: c.items.map(i => i.id === item.id ? { ...i, image: safeFallback } : i)
      }))
    );
  }

  categories = signal<RankingCategory[]>([
    {
      id: 'theme_parks',
      name: 'Mejor Parque Temático',
      icon: '🎡',
      items: MAPPED_THEME_PARKS
    },
    {
      id: 'water_parks',
      name: 'Mejor Parque Acuático',
      icon: '💦',
      items: WATER_PARKS_DATA
    },
    {
      id: 'coasters',
      name: 'Mejor Montaña Rusa',
      icon: '🎢',
      items: COASTERS_DATA
    },
    {
      id: 'attractions',
      name: 'Mejores Atracciones',
      icon: '🎠',
      items: ATTRACTIONS_DATA
    },
    {
      id: 'water_rides',
      name: 'Mejores Atracciones Acuáticas',
      icon: '🌊',
      items: WATER_RIDES_DATA
    },
    {
      id: 'shows',
      name: 'Mejores Shows',
      icon: '🎭',
      items: SHOWS_DATA
    }
  ]);

  activeCategory = computed(() => 
    this.categories().find(c => c.id === this.activeCategoryId()) || this.categories()[0]
  );

  displayedItems = computed(() => 
    this.activeCategory().items.slice(0, this.displayLimit())
  );

  hasMoreItems = computed(() => 
    this.activeCategory().items.length > this.displayLimit()
  );

  getScale(position: number): number {
    // Del 1 al 3
    if (position === 1) return 0.95;
    if (position === 2) return 0.90;
    if (position === 3) return 0.86;
    
    // Del 4 al 10 va bajando escalonadamente (ej. 0.83, 0.80, 0.78...)
    if (position >= 4 && position <= 10) {
      // Restamos progresivamente 0.02 o 0.03 por puesto
      const baseFor4 = 0.84;
      const step = 0.02;
      return +(baseFor4 - ((position - 4) * step)).toFixed(2);
    }
    
    // Del 11 en adelante se quedan igual al tamaño más pequeño del top 10
    return 0.72;
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
