import {
  Component, OnInit, OnDestroy,
  signal, WritableSignal, ChangeDetectionStrategy,
  inject, computed, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TripsService, TripModel } from '../../core/services/trips.service';
import { FriendsService } from '../../core/services/friends.service';
import { AuthService } from '../../core/services/auth.service';
import { Router } from '@angular/router';
import { TripCalendarComponent } from './trip-calendar.component';
import { BlockScrollDirective } from '../../core/directives/block-scroll.directive';

type Countdown = { days: number, hours: number, minutes: number, seconds: number };

interface UITrip extends TripModel {
  isPast?: boolean;
  time: WritableSignal<Countdown>;
}

@Component({
  selector: 'app-viajes',
  standalone: true,
  imports: [CommonModule, FormsModule, TripCalendarComponent, BlockScrollDirective],
  templateUrl: './viajes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViajesComponent implements OnInit, OnDestroy {
  private tripsService = inject(TripsService);
  private friendsService = inject(FriendsService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  authService = inject(AuthService);
  private timer: any;

  goToRegisterCredits(trip: UITrip) {
    const parkName = trip.park?.name;
    if (parkName) {
      this.router.navigate(['/credits'], { queryParams: { search: parkName } });
    } else {
      this.router.navigate(['/credits']);
    }
  }

  goToRegisterAttractions(trip: UITrip) {
    const parkName = trip.park?.name;
    if (parkName) {
      this.router.navigate(['/atracciones'], { queryParams: { search: parkName } });
    } else {
      this.router.navigate(['/atracciones']);
    }
  }

  // ── Main data ──────────────────────────────────
  trips = signal<UITrip[]>([]);
  isLoading = signal(true);
  hasError = signal(false);
  
  isPendingForCurrentUser = (t: UITrip): boolean => {
    const currentUserId = this.authService.currentUser()?.id;
    if (t.userId === currentUserId) return false;
    const me = t.companions.find(c => c.user?.id === currentUserId);
    return me?.status === 'PENDING';
  };

  pendingTrips = computed(() => this.trips().filter(t => this.isPendingForCurrentUser(t)));
  upcomingTrips = computed(() => this.trips().filter(t => !t.isPast && !this.isPendingForCurrentUser(t)));
  pastTrips = computed(() => this.trips().filter(t => t.isPast && !this.isPendingForCurrentUser(t)));

  acceptInvitation(tripId: number) {
    this.tripsService.acceptTripInvitation(tripId).subscribe({
      next: (updatedTrip) => {
        const uiTrip: UITrip = { ...updatedTrip, isPast: false, time: signal({ days: 0, hours: 0, minutes: 0, seconds: 0 }) };
        this.trips.update(list => list.map(t => t.id === tripId ? uiTrip : t));
        this.tickCountdowns();
      }
    });
  }

  rejectInvitation(tripId: number) {
    this.tripsService.rejectTripInvitation(tripId).subscribe({
      next: () => {
        // Quitamos el viaje de la lista para que desaparezca inmediatamente de la interfaz del usuario
        this.trips.update(list => list.filter(t => t.id !== tripId));
      }
    });
  }

  // ── Wizard ─────────────────────────────────────
  isWizardOpen = signal(false);
  wizardStep = signal(1);
  isSubmitting = signal(false);

  // Step 1
  allParks = signal<any[]>([]);
  searchParkQuery = signal('');
  selectedParkForTrip = signal<any>(null);
  filteredParks = computed(() => {
    const q = this.searchParkQuery().toLowerCase();
    if (!q || this.selectedParkForTrip()) return [];
    return this.allParks().filter(p => p.name.toLowerCase().includes(q)).slice(0, 7);
  });

  // Step 2 – dates
  tripStartDate = signal('');
  tripEndDate = signal('');
  tripDateLabel = signal(''); // human readable

  // Step 2 – details
  tripTitle = signal('');
  tripDescription = signal('');

  // Step 3 (Companions - Only accepted friends)
  searchUserQuery = signal('');
  selectedCompanions = signal<any[]>([]);
  suggestedUsers = signal<any[]>([]);
  acceptedFriends = signal<{ id: number; username: string; avatar?: string }[]>([]);

  readonly MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  constructor() {}

  // ── Validation ─────────────────────────────────
  get step1Valid() { return !!this.selectedParkForTrip(); }
  get step2Valid() { return !!this.tripStartDate(); }

  // ── Lifecycle ──────────────────────────────────
  ngOnInit() {
    this.loadTrips();
    this.loadParks();
    this.loadFriends();
    this.timer = setInterval(() => this.tickCountdowns(), 1000);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  // ── Data loading ───────────────────────────────
  loadTrips() {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.tripsService.getTrips().subscribe({
      next: data => {
        const now = Date.now();
        this.trips.set(data.map(t => ({
          ...t,
          isPast: new Date(t.targetDate).getTime() < now,
          time: signal({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        })));
        this.tickCountdowns();
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.hasError.set(true);
      }
    });
  }

  private loadParks() {
    this.tripsService.getAllParks().subscribe({
      next: parks => {
        const sortedParks = [...parks].sort((a, b) => {
          const aIsSpain = a.country === 'Spain' || a.country === 'España' || a.country === 'Spain ';
          const bIsSpain = b.country === 'Spain' || b.country === 'España' || b.country === 'Spain ';
          if (aIsSpain && !bIsSpain) return -1;
          if (!aIsSpain && bIsSpain) return 1;
          return a.name.localeCompare(b.name);
        });
        this.allParks.set(sortedParks);
      },
      error: err => console.error('Error fetching parks', err)
    });
  }

  private tickCountdowns() {
    const now = Date.now();
    this.trips().forEach(trip => {
      if (trip.isPast) return;
      const diff = new Date(trip.targetDate).getTime() - now;
      if (diff > 0) {
        trip.time.set({
          days: Math.floor(diff / 86400000),
          hours: Math.floor((diff % 86400000) / 3600000),
          minutes: Math.floor((diff % 3600000) / 60000),
          seconds: Math.floor((diff % 60000) / 1000)
        });
      } else { trip.isPast = true; }
    });
  }

  fmt(n: number) { return n < 10 ? `0${n}` : `${n}`; }

  getParkImage(park: any): string {
    if (!park) return 'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&q=80&w=800';
    if (park.imageUrl) return park.imageUrl;
    if (park.image_url) return park.image_url;
    
    // Fallback to searching in allParks in case the API didn't include the image in the nested park object
    const found = this.allParks().find(p => p.id === park.id);
    if (found && found.imageUrl) return found.imageUrl;
    if (found && found.image_url) return found.image_url;

    return 'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&q=80&w=800';
  }

  formatDateRange(startDate: string, endDate?: string | null): string {
    const s = new Date(startDate);
    const sStr = `${s.getDate()} ${this.MONTHS[s.getMonth()]}`;
    if (!endDate) return `${sStr} ${s.getFullYear()}`;
    const e = new Date(endDate);
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${s.getDate()} – ${e.getDate()} de ${this.MONTHS[s.getMonth()]} ${s.getFullYear()}`;
    }
    return `${sStr} – ${e.getDate()} ${this.MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  }

  // ── Calendar date handler ─────────────────────
  onCalendarDateChange(range: { start: string; end: string }) {
    this.tripStartDate.set(range.start);
    this.tripEndDate.set(range.end);

    if (range.start) {
      const s = new Date(range.start);
      const sStr = `${s.getDate()} ${this.MONTHS[s.getMonth()]}`;
      if (range.end) {
        const e = new Date(range.end);
        if (s.getMonth() === e.getMonth()) {
          this.tripDateLabel.set(`${s.getDate()} – ${e.getDate()} de ${this.MONTHS[s.getMonth()]} ${s.getFullYear()}`);
        } else {
          this.tripDateLabel.set(`${sStr} – ${e.getDate()} ${this.MONTHS[e.getMonth()]} ${e.getFullYear()}`);
        }
      } else {
        this.tripDateLabel.set(`${sStr} ${s.getFullYear()}`);
      }
    } else {
      this.tripDateLabel.set('');
    }
  }

  // ── Delete Modal State ─────────────────────────
  showDeleteModal = signal(false);
  showDeleteSuccessModal = signal(false);
  selectedTrip = signal<UITrip | null>(null);
  countdown = signal(2);
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  loadFriends() {
    this.friendsService.getFriendships().subscribe({
      next: (reqs) => {
        const myId = this.authService.currentUser()?.id;
        const accepted = reqs
          .filter(r => r.status === 'ACCEPTED')
          .map(r => {
            const isSender = r.user_id === myId;
            const username = isSender ? r.friend_username : r.user_username;
            const id = isSender ? r.friend_id : r.user_id;
            return {
              id,
              username,
              avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=1D4ED8&color=fff`
            };
          });
        this.acceptedFriends.set(accepted);
        this.filterSuggestedFriends(this.searchUserQuery());
      },
      error: (err) => console.error('Error loading friends in viajes:', err)
    });
  }

  filterSuggestedFriends(q: string = '') {
    const cleanQ = (q || '').trim().toLowerCase().replace(/^@/, '');
    const selectedIds = this.selectedCompanions().map(c => c.id);
    const tripIds = this.tripToAddCompanion()
      ? this.tripToAddCompanion()!.companions.map(c => c.user?.id || c.userId)
      : [];
    const myId = this.authService.currentUser()?.id;

    let friends = this.acceptedFriends().filter(f =>
      !selectedIds.includes(f.id) &&
      !tripIds.includes(f.id) &&
      f.id !== myId
    );

    if (cleanQ) {
      friends = friends.filter(f => f.username.toLowerCase().includes(cleanQ));
    }

    this.suggestedUsers.set(friends);
  }

  // ── Wizard controls ────────────────────────────
  openWizard() {
    this.isWizardOpen.set(true);
    this.wizardStep.set(1);
    this.searchParkQuery.set('');
    this.selectedParkForTrip.set(null);
    this.tripTitle.set('');
    this.tripDescription.set('');
    this.tripStartDate.set('');
    this.tripEndDate.set('');
    this.tripDateLabel.set('');
    this.searchUserQuery.set('');
    this.selectedCompanions.set([]);
    this.isSubmitting.set(false);
    this.loadFriends();
    this.filterSuggestedFriends('');
  }

  closeWizard() { this.isWizardOpen.set(false); }

  nextStep() {
    this.wizardStep.update(s => s + 1);
    if (this.wizardStep() === 3) {
      this.loadFriends();
      this.filterSuggestedFriends(this.searchUserQuery());
    }
  }

  prevStep() {
    this.wizardStep.update(s => s - 1);
  }

  selectPark(park: any) { this.selectedParkForTrip.set(park); this.searchParkQuery.set(park.name); }

  onUserSearchChange(q: string) { 
    this.searchUserQuery.set(q); 
    this.filterSuggestedFriends(q); 
  }
  
  addCompanion(user: any) {
    this.selectedCompanions.update(l => [...l, user]);
    this.searchUserQuery.set(''); 
    this.filterSuggestedFriends('');
  }
  
  removeCompanion(id: number) { 
    this.selectedCompanions.update(l => l.filter(c => c.id !== id));
    this.filterSuggestedFriends(this.searchUserQuery());
  }

  finishTripCreation() {
    if (this.isSubmitting() || !this.step2Valid) return;
    this.isSubmitting.set(true);
    this.tripsService.createTrip({
      parkId: this.selectedParkForTrip().id,
      title: this.tripTitle() || undefined,
      description: this.tripDescription(),
      targetDate: this.tripStartDate(),
      endDate: this.tripEndDate() || undefined,
      companions: this.selectedCompanions().map(c => c.id)
    }).subscribe({
      next: newTrip => {
        const ui: UITrip = { ...newTrip, isPast: false, time: signal({ days: 0, hours: 0, minutes: 0, seconds: 0 }) };
        this.trips.update(l => [ui, ...l]);
        this.tickCountdowns();
        this.closeWizard();
        this.isSubmitting.set(false);
      },
      error: () => this.isSubmitting.set(false)
    });
  }

  // ── Add Companion Modal ────────────────────────
  showAddCompanionModal = signal(false);
  tripToAddCompanion = signal<UITrip | null>(null);

  openAddCompanionModal(trip: UITrip) {
    this.tripToAddCompanion.set(trip);
    this.searchUserQuery.set('');
    this.selectedCompanions.set([]);
    this.showAddCompanionModal.set(true);
    this.loadFriends();
    this.filterSuggestedFriends('');
  }

  closeAddCompanionModal() {
    this.showAddCompanionModal.set(false);
    this.tripToAddCompanion.set(null);
  }

  confirmAddCompanions() {
    const trip = this.tripToAddCompanion();
    if (!trip || this.selectedCompanions().length === 0) return;
    this.isSubmitting.set(true);
    const companionIds = this.selectedCompanions().map(c => c.id);
    
    this.tripsService.addCompanions(trip.id, companionIds).subscribe({
      next: (updatedTrip: TripModel) => {
        const uiTrip: UITrip = { ...updatedTrip, isPast: trip.isPast, time: trip.time };
        this.trips.update(list => list.map(t => t.id === trip.id ? uiTrip : t));
        this.closeAddCompanionModal();
        this.isSubmitting.set(false);
      },
      error: () => this.isSubmitting.set(false)
    });
  }

  removeExistingCompanion(userId: number) {
    const trip = this.tripToAddCompanion();
    if (!trip) return;
    this.isSubmitting.set(true);
    this.tripsService.removeCompanionFromTrip(trip.id, userId).subscribe({
      next: (updatedTrip: TripModel) => {
        const uiTrip: UITrip = { ...updatedTrip, isPast: trip.isPast, time: trip.time };
        this.trips.update(list => list.map(t => t.id === trip.id ? uiTrip : t));
        this.tripToAddCompanion.set(uiTrip);
        this.isSubmitting.set(false);
      },
      error: () => this.isSubmitting.set(false)
    });
  }

  dismissRejection(tripId: number, userId: number) {
    this.tripsService.removeCompanionFromTrip(tripId, userId).subscribe({
      next: (updatedTrip: TripModel) => {
        this.trips.update(list => list.map(t => {
          if (t.id === tripId) {
            return { ...updatedTrip, isPast: t.isPast, time: t.time };
          }
          return t;
        }));
      }
    });
  }

  // ── Delete ─────────────────────────────────────
  openDeleteModal(trip: UITrip) {
    this.selectedTrip.set(trip);
    this.showDeleteModal.set(true);
  }

  confirmDelete() {
    const trip = this.selectedTrip();
    if (!trip) return;
    this.isSubmitting.set(true);
    
    const currentUserId = this.authService.currentUser()?.id;
    
    if (trip.userId !== currentUserId && currentUserId) {
      // It's not my trip, so "deleting" it means leaving it
      // Usamos rejectTripInvitation en lugar de remove para que el estado pase a REJECTED y el creador vea el aviso
      this.tripsService.rejectTripInvitation(trip.id).subscribe({
        next: () => {
          this.trips.update(list => list.filter(t => t.id !== trip.id));
          this.showDeleteModal.set(false);
          this.isSubmitting.set(false);
          this.openDeleteSuccessModal();
        },
        error: () => this.isSubmitting.set(false)
      });
    } else {
      // It's my trip, delete it completely
      this.tripsService.deleteTrip(trip.id).subscribe({
        next: () => {
          this.trips.update(list => list.filter(t => t.id !== trip.id));
          this.showDeleteModal.set(false);
          this.isSubmitting.set(false);
          this.openDeleteSuccessModal();
        },
        error: () => this.isSubmitting.set(false)
      });
    }
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
    this.selectedTrip.set(null);
  }
}
