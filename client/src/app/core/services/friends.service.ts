import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FriendRequest {
  id: number;
  user_id: number;
  friend_id: number;
  user_username: string;
  friend_username: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class FriendsService {
  private http = inject(HttpClient);
  private apiUrl = 'https://rc-manager-api.vercel.app/api/friends';

  // Obtener todas las relaciones donde el usuario esté involucrado
  getFriendships(): Observable<FriendRequest[]> {
    return this.http.get<FriendRequest[]>(this.apiUrl);
  }

  // Enviar una solicitud de amistad
  sendRequest(friendId: number, friendUsername: string): Observable<FriendRequest> {
    return this.http.post<FriendRequest>(`${this.apiUrl}/request`, { friendId, friendUsername });
  }

  // Responder a una solicitud (aceptar o rechazar)
  respondRequest(requestId: number, status: 'ACCEPTED' | 'REJECTED'): Observable<FriendRequest> {
    return this.http.put<FriendRequest>(`${this.apiUrl}/${requestId}`, { status });
  }

  // Eliminar un amigo o cancelar solicitud
  removeFriend(requestId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${requestId}`);
  }
}
