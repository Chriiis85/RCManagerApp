import {
  Component, ChangeDetectionStrategy, signal, computed,
  output, input, HostListener
} from '@angular/core';

interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isDisabled: boolean;
  isToday: boolean;
}

@Component({
  selector: 'app-trip-calendar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Date summary pills -->
    <div class="flex items-center gap-3 mb-4">
      <div class="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all"
        [class]="startDate() ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400 ring-1 ring-slate-200'">
        <span class="text-[10px] uppercase tracking-widest font-bold block" [class]="startDate() ? 'text-slate-400' : 'text-slate-300'">Llegada</span>
        {{ startDate() ? formatDisplay(startDate()!) : 'Añadir fecha' }}
      </div>
      <svg class="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
      </svg>
      <div class="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all"
        [class]="endDate() ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400 ring-1 ring-slate-200'">
        <span class="text-[10px] uppercase tracking-widest font-bold block" [class]="endDate() ? 'text-slate-400' : 'text-slate-300'">Salida</span>
        {{ endDate() ? formatDisplay(endDate()!) : 'Añadir fecha' }}
      </div>
    </div>

    <!-- Calendar container -->
    <div class="rounded-2xl border border-slate-200 bg-white overflow-hidden select-none">
      <!-- Navigation header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <button type="button" (click)="prevMonth()" [disabled]="!canGoPrev()"
          class="w-9 h-9 rounded-full flex items-center justify-center transition-all
                 hover:bg-slate-100 active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed">
          <svg class="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div class="flex gap-8 sm:gap-16 items-center">
          <h3 class="text-sm font-extrabold text-slate-800 tracking-tight">
            {{ monthNames[viewMonth()] }} {{ viewYear() }}
          </h3>
          @if (showDualMonth()) {
            <h3 class="text-sm font-extrabold text-slate-800 tracking-tight">
              {{ monthNames[secondMonth()] }} {{ secondYear() }}
            </h3>
          }
        </div>
        <button type="button" (click)="nextMonth()"
          class="w-9 h-9 rounded-full flex items-center justify-center transition-all
                 hover:bg-slate-100 active:scale-90">
          <svg class="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      <!-- Months grid -->
      <div class="flex flex-col sm:flex-row">
        <!-- Month 1 -->
        <div class="flex-1 px-3 pt-3 pb-4" [class.sm:border-r]="showDualMonth()" [class.border-slate-100]="showDualMonth()">
          <!-- Weekday headers -->
          <div class="grid grid-cols-7 mb-1">
            @for (wd of weekdays; track wd) {
              <div class="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider py-1">{{ wd }}</div>
            }
          </div>
          <!-- Days grid -->
          <div class="grid grid-cols-7">
            @for (day of month1Days(); track trackDay($index, day)) {
              @if (day) {
                <button type="button" draggable="false"
                  [disabled]="day.isDisabled || !day.isCurrentMonth"
                  (mousedown)="onMouseDown(day)" (mouseup)="onMouseUp(day)"
                  (mouseenter)="onDayHover(day)"
                  class="relative h-10 sm:h-11 flex items-center justify-center text-sm transition-colors duration-100"
                  [class]="getDayClasses(day)">
                  <span class="relative z-10">{{ day.day }}</span>
                  @if (day.isToday && !isSelected(day) && !isInRange(day)) {
                    <span class="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600"></span>
                  }
                </button>
              } @else {
                <div class="h-10 sm:h-11"></div>
              }
            }
          </div>
        </div>

        <!-- Month 2 (desktop only) -->
        @if (showDualMonth()) {
          <div class="flex-1 px-3 pt-3 pb-4">
            <div class="grid grid-cols-7 mb-1">
              @for (wd of weekdays; track wd) {
                <div class="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider py-1">{{ wd }}</div>
              }
            </div>
            <div class="grid grid-cols-7">
              @for (day of month2Days(); track trackDay($index, day)) {
                @if (day) {
                  <button type="button" draggable="false"
                    [disabled]="day.isDisabled || !day.isCurrentMonth"
                    (mousedown)="onMouseDown(day)" (mouseup)="onMouseUp(day)"
                    (mouseenter)="onDayHover(day)"
                    class="relative h-10 sm:h-11 flex items-center justify-center text-sm transition-colors duration-100"
                    [class]="getDayClasses(day)">
                    <span class="relative z-10">{{ day.day }}</span>
                    @if (day.isToday && !isSelected(day) && !isInRange(day)) {
                      <span class="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600"></span>
                    }
                  </button>
                } @else {
                  <div class="h-10 sm:h-11"></div>
                }
              }
            </div>
          </div>
        }
      </div>

      <!-- Clear button -->
      @if (startDate()) {
        <div class="border-t border-slate-100 px-4 py-2.5 flex justify-end">
          <button type="button" (click)="clearDates()"
            class="text-xs font-bold text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors">
            Borrar fechas
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class TripCalendarComponent {
  // Inputs
  minDate = input<Date>(new Date());

  // Outputs
  dateRangeChange = output<{ start: string; end: string }>();

  // State
  startDate = signal<Date | null>(null);
  endDate = signal<Date | null>(null);
  hoveredDate = signal<Date | null>(null);
  showDualMonth = signal(typeof window !== 'undefined' ? window.innerWidth >= 640 : true);

  isDragging = false;

  visualStart = computed(() => {
    const s = this.startDate();
    const e = this.endDate() || this.hoveredDate();
    if (!s) return null;
    if (!e) return s;
    return s < e ? s : e;
  });

  visualEnd = computed(() => {
    const s = this.startDate();
    const e = this.endDate() || this.hoveredDate();
    if (!s) return null;
    if (!e) return s;
    return s < e ? e : s;
  });

  // Current view
  viewMonth = signal(new Date().getMonth());
  viewYear = signal(new Date().getFullYear());

  // Second month (computed)
  secondMonth = computed(() => {
    const m = this.viewMonth() + 1;
    return m > 11 ? 0 : m;
  });
  secondYear = computed(() => {
    return this.viewMonth() + 1 > 11 ? this.viewYear() + 1 : this.viewYear();
  });

  canGoPrev = computed(() => {
    const now = new Date();
    return this.viewYear() > now.getFullYear() ||
      (this.viewYear() === now.getFullYear() && this.viewMonth() > now.getMonth());
  });

  readonly monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  readonly weekdays = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

  // Generate days for month 1
  month1Days = computed(() => this.generateDays(this.viewYear(), this.viewMonth()));

  // Generate days for month 2
  month2Days = computed(() => this.generateDays(this.secondYear(), this.secondMonth()));

  @HostListener('window:resize')
  onResize() {
    if (typeof window !== 'undefined') {
      this.showDualMonth.set(window.innerWidth >= 640);
    }
  }

  trackDay(index: number, day: CalendarDay | null): string {
    if (!day) return `empty-${index}`;
    return `${day.date.getFullYear()}-${day.date.getMonth()}-${day.date.getDate()}`;
  }

  private generateDays(year: number, month: number): (CalendarDay | null)[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const min = this.minDate();
    const minNorm = new Date(min.getFullYear(), min.getMonth(), min.getDate());

    const firstDay = new Date(year, month, 1);
    // Monday=0 offset (getDay returns 0=Sun, we want 0=Mon)
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: (CalendarDay | null)[] = [];

    // Empty slots for offset
    for (let i = 0; i < startOffset; i++) {
      result.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const isToday = date.getTime() === today.getTime();
      const isDisabled = date < minNorm;

      result.push({
        date,
        day: d,
        isCurrentMonth: true,
        isDisabled,
        isToday
      });
    }

    return result;
  }

  onMouseDown(day: CalendarDay) {
    if (day.isDisabled || !day.isCurrentMonth) return;
    
    this.isDragging = true;
    
    const start = this.startDate();
    const end = this.endDate();
    
    if (!start || (start && end)) {
      this.startDate.set(day.date);
      this.endDate.set(null);
      this.hoveredDate.set(null);
      this.emitRange(day.date, null);
    } else {
      if (day.date < start) {
        this.startDate.set(day.date);
        this.endDate.set(null);
        this.hoveredDate.set(null);
        this.emitRange(day.date, null);
      } else if (day.date.getTime() === start.getTime()) {
        this.endDate.set(day.date);
        this.hoveredDate.set(null);
        this.emitRange(start, day.date);
        this.isDragging = false;
      }
    }
  }

  onDayHover(day: CalendarDay) {
    if (day.isDisabled || !day.isCurrentMonth) return;
    if (this.startDate() && !this.endDate()) {
      this.hoveredDate.set(day.date);
    }
  }

  @HostListener('window:mouseup')
  onWindowMouseUp() {
    if (this.isDragging) {
      const start = this.startDate();
      const h = this.hoveredDate();
      if (start && h && !this.endDate()) {
        if (h > start) {
          this.endDate.set(h);
          this.hoveredDate.set(null);
          this.emitRange(start, h);
        } else if (h < start) {
          this.startDate.set(h);
          this.endDate.set(start);
          this.hoveredDate.set(null);
          this.emitRange(h, start);
        }
      }
      this.isDragging = false;
    }
  }

  onMouseUp(day: CalendarDay) {
    if (day.isDisabled || !day.isCurrentMonth) return;
    
    if (this.isDragging) {
      const start = this.startDate();
      if (start && !this.endDate()) {
        if (day.date > start) {
          this.endDate.set(day.date);
          this.hoveredDate.set(null);
          this.emitRange(start, day.date);
        } else if (day.date < start) {
          this.startDate.set(day.date);
          this.endDate.set(start);
          this.hoveredDate.set(null);
          this.emitRange(day.date, start);
        }
      }
      this.isDragging = false;
    }
  }

  clearDates() {
    this.startDate.set(null);
    this.endDate.set(null);
    this.hoveredDate.set(null);
    this.emitRange(null, null);
  }

  prevMonth() {
    if (!this.canGoPrev()) return;
    let m = this.viewMonth() - 1;
    let y = this.viewYear();
    if (m < 0) { m = 11; y--; }
    this.viewMonth.set(m);
    this.viewYear.set(y);
  }

  nextMonth() {
    let m = this.viewMonth() + 1;
    let y = this.viewYear();
    if (m > 11) { m = 0; y++; }
    this.viewMonth.set(m);
    this.viewYear.set(y);
  }

  // ── Visual helpers ──────────────────────────────────
  isSelected(day: CalendarDay): boolean {
    if (!day.isCurrentMonth) return false;
    const s = this.startDate();
    const e = this.endDate();
    return (!!s && this.sameDay(day.date, s)) || (!!e && this.sameDay(day.date, e));
  }

  isInRange(day: CalendarDay): boolean {
    if (!day.isCurrentMonth) return false;
    const vs = this.visualStart();
    const ve = this.visualEnd();
    if (!vs || !ve) return false;
    return day.date > vs && day.date < ve;
  }

  getDayClasses(day: CalendarDay): string {
    if (!day.isCurrentMonth) return 'text-transparent cursor-default';
    if (day.isDisabled) return 'text-slate-300 cursor-not-allowed line-through';

    const vStart = this.visualStart();
    const vEnd = this.visualEnd();
    const h = this.hoveredDate();
    const e = this.endDate();

    const isVStart = !!vStart && this.sameDay(day.date, vStart);
    const isVEnd = !!vEnd && this.sameDay(day.date, vEnd);
    const isSelected = this.isSelected(day);
    const inRange = this.isInRange(day);
    const hasActualRange = !!vStart && !!vEnd && vStart.getTime() !== vEnd.getTime();

    let classes = 'cursor-pointer ';

    if (isVStart && hasActualRange) {
      if (h && this.sameDay(day.date, h) && !e) {
        classes += 'bg-slate-200 text-slate-800 font-semibold rounded-l-lg';
      } else {
        classes += 'bg-slate-900 text-white font-bold rounded-l-lg';
      }
    } else if (isVEnd && hasActualRange) {
      if (h && this.sameDay(day.date, h) && !e) {
        classes += 'bg-slate-200 text-slate-800 font-semibold rounded-r-lg';
      } else {
        classes += 'bg-slate-900 text-white font-bold rounded-r-lg';
      }
    } else if (isSelected) {
      classes += 'bg-slate-900 text-white font-bold rounded-lg';
    } else if (inRange) {
      classes += 'bg-slate-100 text-slate-800';
    } else {
      classes += 'text-slate-700 hover:bg-slate-100 rounded-lg font-medium';
    }

    return classes;
  }

  formatDisplay(date: Date): string {
    const d = date.getDate();
    const m = this.monthNames[date.getMonth()].substring(0, 3);
    const y = date.getFullYear();
    return `${d} ${m} ${y}`;
  }

  // ── Private helpers ─────────────────────────────────
  private sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  private emitRange(start: Date | null, end: Date | null) {
    const pad = (n: number) => n < 10 ? `0${n}` : `${n}`;
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    this.dateRangeChange.emit({
      start: start ? fmt(start) : '',
      end: end ? fmt(end) : ''
    });
  }
}
