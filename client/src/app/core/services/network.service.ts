import { Injectable, signal, PLATFORM_ID, inject, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class NetworkService implements OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  isOnline = signal<boolean>(this.isBrowser ? navigator.onLine : true);
  showReconnected = signal<boolean>(false);
  private reconnectedTimer: any = null;

  private onlineHandler = () => {
    this.isOnline.set(true);
    this.showReconnected.set(true);
    if (this.reconnectedTimer) clearTimeout(this.reconnectedTimer);
    this.reconnectedTimer = setTimeout(() => {
      this.showReconnected.set(false);
    }, 3500);
  };

  private offlineHandler = () => {
    this.isOnline.set(false);
    this.showReconnected.set(false);
    if (this.reconnectedTimer) clearTimeout(this.reconnectedTimer);
  };

  constructor() {
    if (this.isBrowser) {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
    }
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      window.removeEventListener('online', this.onlineHandler);
      window.removeEventListener('offline', this.offlineHandler);
      if (this.reconnectedTimer) clearTimeout(this.reconnectedTimer);
    }
  }
}
