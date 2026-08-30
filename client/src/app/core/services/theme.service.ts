import { Injectable, signal, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private readonly STORAGE_KEY = 'rcmanager_theme';

  isDarkMode = signal<boolean>(false);

  constructor() {
    if (this.isBrowser) {
      this.initTheme();
    }
  }

  private initTheme(): void {
    const savedTheme = localStorage.getItem(this.STORAGE_KEY) as ThemeMode | null;
    
    if (savedTheme) {
      this.isDarkMode.set(savedTheme === 'dark');
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.isDarkMode.set(prefersDark);
    }

    this.applyTheme(this.isDarkMode());

    // Listen for OS theme changes if user hasn't set explicit preference in localStorage
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
          this.isDarkMode.set(e.matches);
          this.applyTheme(e.matches);
        }
      });
    }
  }

  toggleTheme(): void {
    const nextDark = !this.isDarkMode();
    this.isDarkMode.set(nextDark);
    if (this.isBrowser) {
      localStorage.setItem(this.STORAGE_KEY, nextDark ? 'dark' : 'light');
      this.applyTheme(nextDark);
    }
  }

  setTheme(mode: ThemeMode): void {
    const isDark = mode === 'dark';
    this.isDarkMode.set(isDark);
    if (this.isBrowser) {
      localStorage.setItem(this.STORAGE_KEY, mode);
      this.applyTheme(isDark);
    }
  }

  private applyTheme(isDark: boolean): void {
    if (!this.isBrowser) return;
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}
