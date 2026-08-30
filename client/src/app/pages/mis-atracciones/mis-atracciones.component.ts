import { BlockScrollDirective } from '../../core/directives/block-scroll.directive';
import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RecordsService, AttractionRecord } from '../../core/services/records.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-mis-atracciones',
  standalone: true,
  imports: [CommonModule, FormsModule, BlockScrollDirective],
  templateUrl: './mis-atracciones.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MisAtraccionesComponent implements OnInit, OnDestroy {
  recordsService = inject(RecordsService);
  authService = inject(AuthService);
  router = inject(Router);

  attractions = signal<AttractionRecord[]>([]);
  isLoading = signal(true);
  hasError = signal(false);
  searchQuery = signal('');
  hideRemoved = signal(true);

  // Modal states
  showDeleteModal = signal(false);
  showDeleteSuccessModal = signal(false);
  showCountModal = signal(false);
  selectedAttraction = signal<AttractionRecord | null>(null);
  rideCount = signal(1);
  isSubmitting = signal(false);
  countdown = signal(2);
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  filteredAttractions = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const hide = this.hideRemoved();
    
    return this.attractions().filter(a => {
      const status = (a.attraction?.status || '').toUpperCase();
      if (hide && (status === 'REMOVED' || status === 'ELIMINADA' || status === 'DEFUNCT' || status === 'CLOSED' || status === 'CERRADA')) return false;

      if (!q) return true;
      return (a.attraction?.name || '').toLowerCase().includes(q) ||
             (a.attraction?.park?.name || '').toLowerCase().includes(q);
    });
  });

  ngOnInit() {
    this.loadAttractions();
  }

  loadAttractions() {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.recordsService.getAttractions().subscribe({
      next: (data) => {
        this.attractions.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.hasError.set(true);
      }
    });
  }

  openDeleteModal(attraction: AttractionRecord) {
    this.selectedAttraction.set(attraction);
    this.showDeleteModal.set(true);
  }

  confirmDelete() {
    const attraction = this.selectedAttraction();
    if (!attraction) return;
    this.isSubmitting.set(true);

    const idToDelete = attraction.attraction?.apiId || attraction.attractionId;
    this.recordsService.removeAttraction(idToDelete).subscribe({
      next: () => {
        this.attractions.update(list => list.filter(a => a.id !== attraction.id));
        this.showDeleteModal.set(false);
        this.isSubmitting.set(false);
        this.openDeleteSuccessModal();
      },
      error: () => this.isSubmitting.set(false)
    });
  }

  openDeleteSuccessModal() {
    this.countdown.set(2);
    this.showDeleteSuccessModal.set(true);
    this.countdownInterval = setInterval(() => {
      const c = this.countdown() - 1;
      this.countdown.set(c);
      if (c <= 0) this.closeDeleteSuccess();
    }, 1000);
  }

  closeDeleteSuccess() {
    if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
    this.showDeleteSuccessModal.set(false);
    this.selectedAttraction.set(null);
  }

  ngOnDestroy() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  openCountModal(attraction: AttractionRecord) {
    this.selectedAttraction.set(attraction);
    this.rideCount.set(attraction.rating || 1);
    this.showCountModal.set(true);
  }

  incrementCount() {
    this.rideCount.update(c => Math.min(9999, c + 1));
  }

  decrementCount() {
    this.rideCount.update(c => Math.max(1, c - 1));
  }

  saveCount() {
    const attraction = this.selectedAttraction();
    if (!attraction) return;
    this.isSubmitting.set(true);

    const idToUpdate = attraction.attraction?.apiId || attraction.attractionId;
    this.recordsService.updateAttractionCount(idToUpdate, this.rideCount()).subscribe({
      next: (updated) => {
        this.attractions.update(list => list.map(a => a.id === attraction.id ? { ...a, rating: updated.rating } : a));
        this.showCountModal.set(false);
        this.isSubmitting.set(false);
      },
      error: () => this.isSubmitting.set(false)
    });
  }
}
