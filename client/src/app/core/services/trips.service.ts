import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface TripCompanion {
  id: number;
  userId: number;
  status: string;
  user: {
    id: number;
    username: string;
    email?: string;
    profileImage?: string;
  };
}

export interface TripModel {
  id: number;
  userId: number;
  parkId: number;
  title?: string;
  description?: string;
  targetDate: string;
  endDate?: string;
  park: {
    id: number;
    name: string;
    country: string;
    imageUrl?: string;
  };
  companions: TripCompanion[];
  user: {
    id: number;
    username: string;
    profileImage?: string;
  };
}

export interface CreateTripPayload {
  parkId: number;
  title?: string;
  description?: string;
  targetDate: string;
  endDate?: string;
  companions: number[];
}

@Injectable({
  providedIn: 'root'
})
export class TripsService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiUrl = 'https://rc-manager-api.vercel.app/api';

  getTrips(): Observable<TripModel[]> {
    return this.http.get<TripModel[]>(`${this.apiUrl}/trips`, { headers: this.authService.getAuthHeaders() });
  }

  createTrip(tripData: CreateTripPayload): Observable<TripModel> {
    return this.http.post<TripModel>(`${this.apiUrl}/trips`, tripData, { headers: this.authService.getAuthHeaders() });
  }

  addCompanions(tripId: number, companions: number[]): Observable<TripModel> {
    return this.http.post<TripModel>(`${this.apiUrl}/trips/${tripId}/companions`, { companions }, { headers: this.authService.getAuthHeaders() });
  }

  acceptTripInvitation(tripId: number): Observable<TripModel> {
    return this.http.put<TripModel>(`${this.apiUrl}/trips/${tripId}/companions/accept`, {}, { headers: this.authService.getAuthHeaders() });
  }

  rejectTripInvitation(tripId: number): Observable<TripModel> {
    return this.http.put<TripModel>(`${this.apiUrl}/trips/${tripId}/companions/reject`, {}, { headers: this.authService.getAuthHeaders() });
  }

  removeCompanionFromTrip(tripId: number, userId: number): Observable<TripModel> {
    return this.http.delete<TripModel>(`${this.apiUrl}/trips/${tripId}/companions/${userId}`, { headers: this.authService.getAuthHeaders() });
  }

  deleteTrip(tripId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/trips/${tripId}`, { headers: this.authService.getAuthHeaders() });
  }

  searchUsers(query: string): Observable<{ id: number, username: string }[]> {
    return this.http.get<{ id: number, username: string }[]>(`${this.apiUrl}/users/search`, {
      headers: this.authService.getAuthHeaders(),
      params: { q: query }
    });
  }

  getAllParks(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/parks`);
  }
}
