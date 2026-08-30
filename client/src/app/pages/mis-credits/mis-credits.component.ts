import { BlockScrollDirective } from '../../core/directives/block-scroll.directive';
import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RecordsService, CoasterCredit } from '../../core/services/records.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-mis-credits',
  standalone: true,
  imports: [CommonModule, FormsModule, BlockScrollDirective],
  templateUrl: './mis-credits.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MisCreditsComponent implements OnInit, OnDestroy {
  recordsService = inject(RecordsService);
  authService = inject(AuthService);
  router = inject(Router);

  credits = signal<CoasterCredit[]>([]);
  isLoading = signal(true);
  hasError = signal(false);
  searchQuery = signal('');
  hideRemoved = signal(true);

  // Modal states
  showDeleteModal = signal(false);
  showDeleteSuccessModal = signal(false);
  showCountModal = signal(false);
  selectedCredit = signal<CoasterCredit | null>(null);
  rideCount = signal(1);
  isSubmitting = signal(false);
  countdown = signal(2);
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  filteredCredits = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const hide = this.hideRemoved();
    
    return this.credits().filter(c => {
      const status = (c.coaster?.status || '').toUpperCase();
      if (hide && (status === 'REMOVED' || status === 'ELIMINADA' || status === 'DEFUNCT' || status === 'CLOSED' || status === 'CERRADA')) return false;

      if (!q) return true;
      return (c.coaster?.name || '').toLowerCase().includes(q) ||
             (c.coaster?.park?.name || '').toLowerCase().includes(q);
    });
  });

  ngOnInit() {
    this.loadCredits();
  }

  loadCredits() {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.recordsService.getCredits().subscribe({
      next: (data) => {
        this.credits.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.hasError.set(true);
      }
    });
  }

  openDeleteModal(credit: CoasterCredit) {
    this.selectedCredit.set(credit);
    this.showDeleteModal.set(true);
  }

  confirmDelete() {
    const credit = this.selectedCredit();
    if (!credit) return;
    this.isSubmitting.set(true);

    const idToDelete = credit.coaster?.apiId || credit.coasterId;
    this.recordsService.removeCredit(idToDelete).subscribe({
      next: () => {
        this.credits.update(list => list.filter(c => c.id !== credit.id));
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
    this.selectedCredit.set(null);
  }

  ngOnDestroy() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  openCountModal(credit: CoasterCredit) {
    this.selectedCredit.set(credit);
    this.rideCount.set(credit.rating || 1);
    this.showCountModal.set(true);
  }

  incrementCount() {
    this.rideCount.update(c => Math.min(9999, c + 1));
  }

  decrementCount() {
    this.rideCount.update(c => Math.max(1, c - 1));
  }

  saveCount() {
    const credit = this.selectedCredit();
    if (!credit) return;
    this.isSubmitting.set(true);

    const idToUpdate = credit.coaster?.apiId || credit.coasterId;
    this.recordsService.updateCreditCount(idToUpdate, this.rideCount()).subscribe({
      next: (updated) => {
        this.credits.update(list => list.map(c => c.id === credit.id ? { ...c, rating: updated.rating } : c));
        this.showCountModal.set(false);
        this.isSubmitting.set(false);
      },
      error: () => this.isSubmitting.set(false)
    });
  }
}
