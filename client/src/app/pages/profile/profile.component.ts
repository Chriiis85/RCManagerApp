import { BlockScrollDirective } from '../../core/directives/block-scroll.directive';
import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, map } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { RecordsService, CoasterCredit, AttractionRecord, ParkVisit } from '../../core/services/records.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { FriendsService, FriendRequest } from '../../core/services/friends.service';
import { TripsService } from '../../core/services/trips.service';

interface UserInfo {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string;
}

interface Friend {
  id: number;
  username: string;
  avatar: string;
}

interface TripSummary {
  id: number;
  parkName: string;
  date: string;
  image: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BlockScrollDirective],
  templateUrl: './profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  recordsService = inject(RecordsService);
  supabaseService = inject(SupabaseService);
  friendsService = inject(FriendsService);
  tripsService = inject(TripsService);
  
  private get _user() { return this.authService.currentUser(); }

  userInfo = signal<UserInfo>({
    username: this._user?.username || 'UsuarioAventurero',
    firstName: this._user?.firstName || '',
    lastName: this._user?.lastName || '',
    email: this._user?.email || '',
    avatar: this._user?.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(this._user?.username || 'User')}&background=1D4ED8&color=fff&size=200`
  });

  stats = signal({ credits: 0, parks: 0, attractions: 0 });
  isLoading = signal(true);

  // Listas completas de registros reales
  creditsList = signal<CoasterCredit[]>([]);
  attractionsList = signal<AttractionRecord[]>([]);
  parksList = signal<ParkVisit[]>([]);

  // ── Delete confirm modal ─────────────────────────────────────────────────
  showDeleteConfirmModal = signal(false);
  selectedItem          = signal<any>(null);
  selectedItemType      = signal<'credit' | 'attraction' | 'park' | ''>('');

  // ── Delete success modal ─────────────────────────────────────────────────
  showDeleteSuccessModal = signal(false);
  countdown              = signal(2);
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  // Computed display name for the modal
  get deleteItemDisplayName(): string {
    const item = this.selectedItem();
    const type = this.selectedItemType();
    if (!item) return '';
    if (type === 'credit')     return item.coaster?.name    || `Montaña Rusa #${item.coasterId}`;
    if (type === 'attraction') return item.attraction?.name || `Atracción #${item.attractionId}`;
    if (type === 'park')       return item.park?.name       || `Parque #${item.parkId}`;
    return '';
  }

  // Open confirm modal
  openDeleteConfirm(item: any, type: 'credit' | 'attraction' | 'park') {
    this.selectedItem.set(item);
    this.selectedItemType.set(type);
    this.showDeleteConfirmModal.set(true);
  }

  // Confirmed → call API, then show success modal with countdown
  confirmDelete() {
    const item = this.selectedItem();
    const type = this.selectedItemType();
    if (!item || !type) { this.showDeleteConfirmModal.set(false); return; }

    this.showDeleteConfirmModal.set(false);

    const afterDelete = () => {
      this.loadStats();
      this.openDeleteSuccessModal();
    };

    if (type === 'credit')     this.recordsService.removeCredit(item.coasterId).subscribe(afterDelete);
    if (type === 'attraction') this.recordsService.removeAttraction(item.attractionId).subscribe(afterDelete);
    if (type === 'park')       this.recordsService.removePark(item.parkId).subscribe(afterDelete);
  }

  // Show success modal + auto-close after 2 s
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
    this.selectedItem.set(null);
    this.selectedItemType.set('');
  }

  // ────────────────────────────────────────────────────────────────────────

  ngOnInit() { 
    this.loadStats(); 
    this.loadFriends();
    this.refreshUserProfile();
  }

  refreshUserProfile() {
    this.authService.fetchCurrentUser().subscribe({
      next: ({ user }) => {
        if (user) {
          this.isTwoFactorEnabled.set(!!user.twoFactorEnabled);
          this.current2FAType.set(user.twoFactorType || 'APP');
          this.userInfo.set({
            username: user.username || this.userInfo().username,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            email: user.email || '',
            avatar: user.profileImage || this.userInfo().avatar
          });
        }
      },
      error: (err) => console.error('Error refreshing user profile:', err)
    });
  }

  ngOnDestroy() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  loadStats() {
    this.isLoading.set(true);
    forkJoin({
      credits: this.recordsService.getCredits(),
      attractions: this.recordsService.getAttractions(),
      parks: this.recordsService.getParks()
    }).subscribe({
      next: ({ credits, attractions, parks }) => {
        this.creditsList.set(credits);
        this.attractionsList.set(attractions);
        this.parksList.set(parks);
        this.stats.set({
          credits: credits.length,
          attractions: attractions.length,
          parks: parks.length
        });
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }

  updateParkCount(parkId: number, currentCount: number | null, change: number) {
    const newCount = Math.max(1, (currentCount || 1) + change);
    this.recordsService.updateParkCount(parkId, newCount).subscribe({
      next: (updated) => {
        this.parksList.update(list => list.map(p => p.id === updated.id ? updated : p));
      },
      error: (err) => console.error('Error updating park count:', err)
    });
  }

  // ── Friends & Requests ──────────────────────────────────────────────────
  friendRequests = signal<FriendRequest[]>([]);
  showAddFriendModal = signal(false);
  searchUserQuery = signal('');
  suggestedUsers = signal<{id: number, username: string}[]>([]);
  private userSearch$ = new Subject<string>();

  // ── Edit Profile & Username Checking ───────────────────────────────────────
  isTwoFactorEnabled   = signal<boolean>(!!this._user?.twoFactorEnabled);
  showEditProfileModal = signal(false);
  editForm             = signal<UserInfo>({ ...this.userInfo() });

  usernameChecking     = signal(false);
  usernameStatus       = signal<'idle' | 'valid' | 'invalid' | 'same'>('same');
  usernameError        = signal<string | null>(null);
  usernameSuggestions  = signal<string[]>([]);
  profileSaving        = signal(false);
  profileError         = signal<string | null>(null);
  private usernameCheck$ = new Subject<string>();

  showFeedbackModal = signal(false);
  feedbackContent   = signal({ title: '', message: '', type: 'success' });

  constructor() {
    // Pipeline para búsqueda de usuarios para amigos
    this.userSearch$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(q => {
      if (q.length < 2) { this.suggestedUsers.set([]); return; }
      this.tripsService.searchUsers(q).subscribe({
        next: users => {
          const currentUserId = this._user?.id;
          // Filter out existing friends, sent requests, and oneself
          const existingIds = this.friendRequests().flatMap(r => [r.user_id, r.friend_id]);
          this.suggestedUsers.set(users.filter(u => u.id !== currentUserId && !existingIds.includes(u.id)));
        }
      });
    });

    // Pipeline para comprobación de disponibilidad de nombre de usuario en tiempo real
    this.usernameCheck$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(username => {
        const clean = (username || '').trim();
        if (!clean || clean.toLowerCase() === this.userInfo().username.toLowerCase()) {
          this.usernameChecking.set(false);
          this.usernameStatus.set('same');
          this.usernameError.set(null);
          this.usernameSuggestions.set([]);
          return of(null);
        }
        return this.authService.checkUsername(clean).pipe(
          catchError(() => {
            // Fallback en caso de que el backend esté en transición
            return this.tripsService.searchUsers(clean).pipe(
              map(users => {
                const currentUserId = this._user?.id;
                const exists = users.some(
                  u => u.username.toLowerCase() === clean.toLowerCase() && u.id !== currentUserId
                );
                return {
                  available: !exists,
                  exists,
                  suggestions: exists
                    ? [
                        `${clean}${Math.floor(10 + Math.random() * 90)}`,
                        `${clean}${Math.floor(100 + Math.random() * 900)}`,
                        `${clean}_${new Date().getFullYear().toString().slice(-2)}`
                      ]
                    : ([] as string[]),
                  message: exists ? 'Este nombre de usuario ya está en uso.' : 'Nombre de usuario disponible.'
                };
              }),
              catchError(() => of<{ available: boolean; exists?: boolean; suggestions?: string[]; message?: string }>({
                available: true,
                exists: false,
                suggestions: [],
                message: 'Nombre de usuario disponible.'
              }))
            );
          })
        );
      })
    ).subscribe(result => {
      this.usernameChecking.set(false);
      if (!result) return;
      if (result.available) {
        this.usernameStatus.set('valid');
        this.usernameError.set(null);
        this.usernameSuggestions.set([]);
      } else {
        this.usernameStatus.set('invalid');
        this.usernameError.set(result.message || 'Este nombre de usuario ya está en uso.');
        this.usernameSuggestions.set(result.suggestions || []);
      }
    });
  }

  showFeedback(title: string, message: string, type: 'success' | 'info' = 'success') {
    this.feedbackContent.set({ title, message, type });
    this.showFeedbackModal.set(true);
  }

  get myFriends(): FriendRequest[] {
    return this.friendRequests().filter(r => r.status === 'ACCEPTED');
  }

  get pendingIncoming(): FriendRequest[] {
    const currentUserId = this._user?.id;
    return this.friendRequests().filter(r => r.status === 'PENDING' && r.friend_id === currentUserId);
  }

  get pendingOutgoing(): FriendRequest[] {
    const currentUserId = this._user?.id;
    return this.friendRequests().filter(r => r.status === 'PENDING' && r.user_id === currentUserId);
  }

  getFriendUsername(req: FriendRequest): string {
    const currentUserId = this._user?.id;
    return req.user_id === currentUserId ? req.friend_username : req.user_username;
  }

  getFriendAvatar(req: FriendRequest): string {
    const name = this.getFriendUsername(req);
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1D4ED8&color=fff`;
  }

  loadFriends() {
    this.friendsService.getFriendships().subscribe({
      next: (reqs) => this.friendRequests.set(reqs),
      error: (err) => console.error('Error loading friends', err)
    });
  }

  onFriendSearchChange(q: string) {
    this.searchUserQuery.set(q);
    this.userSearch$.next(q);
  }

  sendFriendRequest(user: {id: number, username: string}) {
    this.friendsService.sendRequest(user.id, user.username).subscribe({
      next: (req) => {
        this.friendRequests.update(list => [req, ...list]);
        this.suggestedUsers.update(list => list.filter(u => u.id !== user.id));
        this.showFeedback('Solicitud Enviada', `Has enviado una solicitud de amistad a @${user.username}`, 'success');
      },
      error: () => this.showFeedback('Error', 'No se pudo enviar la solicitud.', 'info')
    });
  }

  acceptFriend(req: FriendRequest) {
    this.friendsService.respondRequest(req.id, 'ACCEPTED').subscribe({
      next: (updated) => {
        this.friendRequests.update(list => list.map(r => r.id === updated.id ? updated : r));
        this.showFeedback('Solicitud Aceptada', `Ahora eres amigo de @${this.getFriendUsername(updated)}`, 'success');
      }
    });
  }

  rejectFriend(req: FriendRequest) {
    this.friendsService.respondRequest(req.id, 'REJECTED').subscribe({
      next: (updated) => {
        this.friendRequests.update(list => list.map(r => r.id === updated.id ? updated : r));
      }
    });
  }

  removeFriend(req: FriendRequest) {
    this.friendsService.removeFriend(req.id).subscribe({
      next: () => {
        this.friendRequests.update(list => list.filter(r => r.id !== req.id));
      }
    });
  }

  upcomingTrips = signal<TripSummary[]>([
    { id: 1, parkName: 'Phantasialand', date: '15 Sep 2026', image: 'https://images.unsplash.com/photo-1769713727279-ee0eeee2efcf?auto=format&fit=crop&q=80&w=400' },
    { id: 2, parkName: 'Europa-Park',   date: '22 Oct 2026', image: 'https://images.unsplash.com/photo-1719640502390-5c6e85176ea9?auto=format&fit=crop&q=80&w=400' }
  ]);



  changeAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validación de seguridad de archivo
      if (!file.type || !file.type.startsWith('image/')) {
        this.showFeedback('Formato no válido', 'Por favor selecciona un archivo de imagen válido (JPEG, PNG, WebP).', 'info');
        return;
      }

      // Límite de tamaño: 5 MB (5 * 1024 * 1024 bytes)
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        this.showFeedback('Imagen demasiado grande', 'La imagen seleccionada no puede superar los 5 MB de tamaño.', 'info');
        return;
      }

      this.isLoading.set(true);
      try {
        const fileExt = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
        const cleanUser = (this.userInfo().username || 'user').replace(/[^a-zA-Z0-9_.-]/g, '');
        const fileName = `${cleanUser}_${Date.now()}.${fileExt}`;
        
        const { data, error } = await this.supabaseService.supabase
          .storage
          .from('ProfileImages')
          .upload(fileName, file);

        if (error) throw error;

        const { data: { publicUrl } } = this.supabaseService.supabase
          .storage
          .from('ProfileImages')
          .getPublicUrl(fileName);

        this.authService.updateProfile({ profileImage: publicUrl }).subscribe({
          next: (updatedUser) => {
            this.userInfo.set({
              ...this.userInfo(),
              avatar: updatedUser.profileImage || this.userInfo().avatar
            });
            this.isLoading.set(false);
            this.showFeedback('Foto Actualizada', 'Tu foto de perfil se ha guardado correctamente.', 'success');
          },
          error: (err) => {
            console.error(err);
            this.isLoading.set(false);
            this.showFeedback('Error', 'No se pudo guardar la foto en tu perfil.', 'info');
          }
        });
      } catch (error: any) {
        console.error(error);
        this.isLoading.set(false);
        this.showFeedback('Error de Subida', error.message || 'No se pudo subir la imagen.', 'info');
      }
    };
    input.click();
  }

  // ── Password Management ────────────────────────────────────────────────────
  showPasswordModal    = signal(false);
  passwordForm         = signal({ currentPassword: '', newPassword: '', confirmPassword: '' });
  showCurrentPassword  = signal(false);
  showNewPassword      = signal(false);
  showConfirmPassword  = signal(false);
  passwordLoading      = signal(false);
  passwordError        = signal<string | null>(null);

  // Computeds for strength and rules
  passwordStrength = computed(() => {
    const pw = this.passwordForm().newPassword || '';
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score += 25;
    if (/[A-Z]/.test(pw)) score += 25;
    if (/[0-9]/.test(pw)) score += 25;
    if (/[^A-Za-z0-9]/.test(pw)) score += 25;
    return score;
  });

  strengthColor = computed(() => {
    const s = this.passwordStrength();
    if (s === 0) return 'bg-slate-200 text-slate-400';
    if (s <= 25) return 'bg-red-500 text-red-600';
    if (s <= 50) return 'bg-amber-500 text-amber-600';
    if (s <= 75) return 'bg-yellow-400 text-yellow-600';
    return 'bg-emerald-500 text-emerald-600';
  });

  strengthLabel = computed(() => {
    const s = this.passwordStrength();
    if (s === 0) return '';
    if (s <= 25) return 'Débil';
    if (s <= 50) return 'Regular';
    if (s <= 75) return 'Buena';
    return 'Muy Fuerte';
  });

  hasMinLength = computed(() => (this.passwordForm().newPassword || '').length >= 8);
  hasUpperCase = computed(() => /[A-Z]/.test(this.passwordForm().newPassword || ''));
  hasNumber = computed(() => /[0-9]/.test(this.passwordForm().newPassword || ''));
  hasSpecialChar = computed(() => /[^A-Za-z0-9]/.test(this.passwordForm().newPassword || ''));
  
  passwordsMatch = computed(() => {
    const { newPassword, confirmPassword } = this.passwordForm();
    return !!newPassword && !!confirmPassword && newPassword === confirmPassword;
  });

  openPasswordModal() {
    this.passwordForm.set({ currentPassword: '', newPassword: '', confirmPassword: '' });
    this.showCurrentPassword.set(false);
    this.showNewPassword.set(false);
    this.showConfirmPassword.set(false);
    this.passwordError.set(null);
    this.passwordLoading.set(false);
    this.showPasswordModal.set(true);
  }

  closePasswordModal() {
    this.showPasswordModal.set(false);
    this.passwordError.set(null);
  }

  submitPasswordChange() {
    const { currentPassword, newPassword, confirmPassword } = this.passwordForm();
    this.passwordError.set(null);

    if (!newPassword || newPassword.length < 8) {
      this.passwordError.set('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      this.passwordError.set('Las contraseñas no coinciden.');
      return;
    }

    this.passwordLoading.set(true);
    this.authService.changePassword(newPassword, currentPassword ? currentPassword : undefined).subscribe({
      next: () => {
        this.passwordLoading.set(false);
        this.showPasswordModal.set(false);
        this.passwordForm.set({ currentPassword: '', newPassword: '', confirmPassword: '' });
        this.showFeedback('¡Contraseña Guardada!', 'Tu nueva contraseña ha sido establecida correctamente. Ahora puedes iniciar sesión tanto con Google como con tu correo y contraseña.', 'success');
      },
      error: (err) => {
        this.passwordLoading.set(false);
        const msg = err?.error?.error || 'No se pudo actualizar la contraseña. Revisa los datos e inténtalo de nuevo.';
        this.passwordError.set(msg);
      }
    });
  }

  // ── 2FA Management ──────────────────────────────────────────────────────────
  show2FASetupModal    = signal(false);
  show2FADisableModal  = signal(false);
  selected2FAType      = signal<'EMAIL' | 'APP'>('EMAIL');
  current2FAType       = signal<'EMAIL' | 'APP'>(this._user?.twoFactorType || 'APP');
  twoFASetupData       = signal<{ secret: string; qrCode: string; otpauthUrl: string } | null>(null);
  twoFACodeInput       = signal('');
  twoFALoading         = signal(false);
  twoFAError           = signal<string | null>(null);
  twoFACopied          = signal(false);
  emailCodeSent        = signal(false);
  emailCodeSending     = signal(false);

  toggleTwoFactor() {
    if (this.isTwoFactorEnabled()) {
      this.twoFACodeInput.set('');
      this.twoFAError.set(null);
      this.show2FADisableModal.set(true);
    } else {
      this.open2FASetup();
    }
  }

  set2FAMethod(type: 'EMAIL' | 'APP') {
    this.selected2FAType.set(type);
    this.twoFACodeInput.set('');
    this.twoFAError.set(null);

    if (type === 'APP' && !this.twoFASetupData()) {
      this.loadAppQR();
    }
  }

  open2FASetup() {
    this.twoFALoading.set(false);
    this.twoFAError.set(null);
    this.twoFACodeInput.set('');
    this.twoFACopied.set(false);
    this.emailCodeSent.set(false);
    this.selected2FAType.set(this._user?.twoFactorType || 'EMAIL');
    this.show2FASetupModal.set(true);

    if (this.selected2FAType() === 'APP') {
      this.loadAppQR();
    }
  }

  loadAppQR() {
    this.twoFALoading.set(true);
    this.authService.setup2FA().subscribe({
      next: (data) => {
        this.twoFASetupData.set(data);
        this.twoFALoading.set(false);
      },
      error: (err) => {
        this.twoFALoading.set(false);
        this.twoFAError.set(err?.error?.error || 'No se pudo generar el código QR.');
      }
    });
  }

  sendEmail2FACode() {
    this.emailCodeSending.set(true);
    this.twoFAError.set(null);

    this.authService.send2FAEmailCode().subscribe({
      next: () => {
        this.emailCodeSending.set(false);
        this.emailCodeSent.set(true);
      },
      error: (err) => {
        this.emailCodeSending.set(false);
        this.twoFAError.set(err?.error?.error || 'Error al enviar código al correo.');
      }
    });
  }

  on2FACodeInput(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input) {
      const digitsOnly = input.value.replace(/\D/g, '').slice(0, 6);
      this.twoFACodeInput.set(digitsOnly);
      input.value = digitsOnly;
    }
  }

  confirm2FAEnable() {
    const code = this.twoFACodeInput().trim();
    const type = this.selected2FAType();

    if (!code || code.length !== 6) {
      this.twoFAError.set('Introduce el código de 6 dígitos.');
      return;
    }

    this.twoFALoading.set(true);
    this.twoFAError.set(null);

    const payload: { type: 'EMAIL' | 'APP'; code: string; secret?: string } = {
      type,
      code,
      secret: type === 'APP' ? this.twoFASetupData()?.secret : undefined
    };

    this.authService.enable2FA(payload).subscribe({
      next: () => {
        this.twoFALoading.set(false);
        this.isTwoFactorEnabled.set(true);
        this.current2FAType.set(type);
        this.show2FASetupModal.set(false);
        this.showFeedback(
          '¡Verificación 2FA Activada!',
          `Tu cuenta ahora está protegida mediante ${type === 'EMAIL' ? 'código enviado a tu correo' : 'App Authenticator'}.`,
          'success'
        );
      },
      error: (err) => {
        this.twoFALoading.set(false);
        this.twoFAError.set(err?.error?.error || 'Código incorrecto. Inténtalo de nuevo.');
      }
    });
  }

  confirm2FADisable() {
    this.twoFALoading.set(true);
    this.twoFAError.set(null);

    this.authService.disable2FA().subscribe({
      next: () => {
        this.twoFALoading.set(false);
        this.isTwoFactorEnabled.set(false);
        this.show2FADisableModal.set(false);
        this.showFeedback('2FA Desactivado', 'La verificación en dos pasos ha sido desactivada en tu cuenta.', 'info');
      },
      error: (err) => {
        this.twoFALoading.set(false);
        this.twoFAError.set(err?.error?.error || 'No se pudo desactivar el 2FA.');
      }
    });
  }

  copy2FASecret() {
    const secret = this.twoFASetupData()?.secret;
    if (secret && typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(secret);
      this.twoFACopied.set(true);
      setTimeout(() => this.twoFACopied.set(false), 2500);
    }
  }

  openEditProfile() {
    this.editForm.set({ ...this.userInfo() });
    this.usernameStatus.set('same');
    this.usernameError.set(null);
    this.usernameSuggestions.set([]);
    this.usernameChecking.set(false);
    this.profileError.set(null);
    this.profileSaving.set(false);
    this.showEditProfileModal.set(true);
  }

  onUsernameChange(val: string) {
    this.editForm.update(f => ({ ...f, username: val }));
    const trimmed = (val || '').trim();

    if (!trimmed || trimmed.toLowerCase() === this.userInfo().username.toLowerCase()) {
      this.usernameStatus.set('same');
      this.usernameError.set(null);
      this.usernameSuggestions.set([]);
      this.usernameChecking.set(false);
      return;
    }

    if (trimmed.length < 3) {
      this.usernameStatus.set('invalid');
      this.usernameError.set('El nombre de usuario debe tener al menos 3 caracteres.');
      this.usernameSuggestions.set([]);
      this.usernameChecking.set(false);
      return;
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
      this.usernameStatus.set('invalid');
      this.usernameError.set('Solo se permiten letras, números, puntos y guiones.');
      this.usernameSuggestions.set([]);
      this.usernameChecking.set(false);
      return;
    }

    this.usernameStatus.set('idle');
    this.usernameError.set(null);
    this.usernameSuggestions.set([]);
    this.usernameChecking.set(true);
    this.usernameCheck$.next(trimmed);
  }

  selectSuggestion(suggestion: string) {
    this.editForm.update(f => ({ ...f, username: suggestion }));
    this.usernameSuggestions.set([]);
    this.usernameError.set(null);
    this.usernameStatus.set('valid');
  }

  saveProfile() {
    const form = this.editForm();
    const cleanUsername = (form.username || '').trim();
    const isUsernameChanged = cleanUsername.toLowerCase() !== this.userInfo().username.toLowerCase();

    if (isUsernameChanged) {
      if (cleanUsername.length < 3) {
        this.usernameError.set('El nombre de usuario debe tener al menos 3 caracteres.');
        this.usernameStatus.set('invalid');
        return;
      }
      if (cleanUsername.length > 30) {
        this.usernameError.set('El nombre de usuario no puede superar los 30 caracteres.');
        this.usernameStatus.set('invalid');
        return;
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
        this.usernameError.set('Solo se permiten letras, números, puntos y guiones.');
        this.usernameStatus.set('invalid');
        return;
      }
      if (this.usernameStatus() === 'invalid') {
        return;
      }
    }

    this.profileSaving.set(true);
    this.profileError.set(null);

    const dataToSave = {
      firstName: form.firstName ? form.firstName.trim().slice(0, 50) : '',
      lastName: form.lastName ? form.lastName.trim().slice(0, 50) : '',
      username: isUsernameChanged ? cleanUsername : undefined
    };

    this.authService.updateProfile(dataToSave).subscribe({
      next: (updatedUser) => {
        this.profileSaving.set(false);
        this.userInfo.set({
          ...this.userInfo(),
          firstName: updatedUser.firstName || '',
          lastName: updatedUser.lastName || '',
          username: updatedUser.username || this.userInfo().username
        });
        this.showEditProfileModal.set(false);
        this.showFeedback('Datos Guardados', 'Los datos de tu perfil se actualizaron correctamente.', 'success');
      },
      error: (err) => {
        this.profileSaving.set(false);
        console.error('Error al guardar perfil:', err);
        if (err.status === 409) {
          this.usernameStatus.set('invalid');
          const msg = err.error?.error || 'Este nombre de usuario ya está en uso.';
          this.usernameError.set(msg);
          if (err.error?.suggestions && err.error.suggestions.length > 0) {
            this.usernameSuggestions.set(err.error.suggestions);
          }
        } else {
          const msg = err.error?.error || err.error?.message || 'Hubo un problema guardando tu perfil.';
          this.profileError.set(msg);
        }
      }
    });
  }
}
