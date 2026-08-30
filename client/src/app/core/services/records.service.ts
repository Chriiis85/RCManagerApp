import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';

const API_BASE = 'https://rc-manager-api.vercel.app/api/me';

export interface CoasterCredit {
  id: number;
  userId: number;
  coasterId: number;
  rideDate: string | null;
  rating: number | null;
  review: string | null;
  coaster?: any;
}

export interface AttractionRecord {
  id: number;
  userId: number;
  attractionId: number;
  rideDate: string | null;
  rating: number | null;
  attraction?: any;
}

export interface ParkVisit {
  id: number;
  userId: number;
  parkId: number;
  visitDate: string | null;
  rating: number | null;
  park?: any;
}

@Injectable({
  providedIn: 'root'
})
export class RecordsService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private opts() {
    return { headers: this.authService.getAuthHeaders() };
  }

  private handleError(err: any) {
    if (err.status === 401) {
      this.authService.logout();
    }
    return throwError(() => err);
  }

  // ── COASTER CREDITS ────────────────────────────────────────────────────────

  getCredits(): Observable<CoasterCredit[]> {
    return this.http.get<CoasterCredit[]>(`${API_BASE}/credits`, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }

  addCredit(coasterId: number, rideDate?: Date, rating?: number, review?: string, coasterData?: { name: string; park?: string; country?: string; manufacturer?: string; parkApiId?: number }): Observable<CoasterCredit> {
    return this.http.post<CoasterCredit>(`${API_BASE}/credits`, { coasterId, rideDate, rating, review, coasterData }, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }

  removeCredit(coasterId: number): Observable<any> {
    return this.http.delete(`${API_BASE}/credits/${coasterId}`, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }

  updateCreditCount(creditId: number, count: number): Observable<CoasterCredit> {
    return this.http.patch<CoasterCredit>(`${API_BASE}/credits/${creditId}`, { rating: count }, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }

  // ── ATTRACTION RECORDS ───────────────────────────────────────────────────────

  getAttractions(): Observable<AttractionRecord[]> {
    return this.http.get<AttractionRecord[]>(`${API_BASE}/attractions`, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }

  addAttraction(attractionId: number, rideDate?: Date, rating?: number, attractionData?: { name: string; park?: string; country?: string; manufacturer?: string; parkApiId?: number }): Observable<AttractionRecord> {
    return this.http.post<AttractionRecord>(`${API_BASE}/attractions`, { attractionId, rideDate, rating, attractionData }, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }

  removeAttraction(attractionId: number): Observable<any> {
    return this.http.delete(`${API_BASE}/attractions/${attractionId}`, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }

  updateAttractionCount(attractionId: number, count: number): Observable<AttractionRecord> {
    return this.http.patch<AttractionRecord>(`${API_BASE}/attractions/${attractionId}`, { rating: count }, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }

  // ── PARK VISITS ──────────────────────────────────────────────────────────────

  getParks(): Observable<ParkVisit[]> {
    return this.http.get<ParkVisit[]>(`${API_BASE}/parks`, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }

  addPark(parkId: number, visitDate?: Date, parkData?: { name: string; country?: string }): Observable<ParkVisit> {
    return this.http.post<ParkVisit>(`${API_BASE}/parks`, { parkId, visitDate, parkData }, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }

  removePark(parkId: number): Observable<any> {
    return this.http.delete(`${API_BASE}/parks/${parkId}`, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }

  updateParkCount(parkId: number, count: number): Observable<ParkVisit> {
    return this.http.patch<ParkVisit>(`${API_BASE}/parks/${parkId}`, { rating: count }, this.opts()).pipe(
      catchError(err => this.handleError(err))
    );
  }
}
