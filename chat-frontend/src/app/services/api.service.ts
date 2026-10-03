import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiConfigService } from './api-config.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly config = inject(ApiConfigService);

  // Authenticated methods
  get<T>(endpoint: string, params?: any): Observable<T> {
    return this.http.get<T>(`${this.config.apiUrl()}${endpoint}`, {
      headers: this.authService.getAuthHeaders(),
      params,
    });
  }

  post<T>(endpoint: string, body: any, params?: any): Observable<T> {
    return this.http.post<T>(`${this.config.apiUrl()}${endpoint}`, body, {
      headers: this.authService.getAuthHeaders(),
      params,
    });
  }

  put<T>(endpoint: string, id: string, body: any, params?: any): Observable<T> {
    return this.http.put<T>(`${this.config.apiUrl()}${endpoint}/${id}`, body, {
      headers: this.authService.getAuthHeaders(),
      params,
    });
  }

  delete<T>(endpoint: string, id?: string, params?: any): Observable<T> {
    const url = id ? `${this.config.apiUrl()}${endpoint}/${id}` : `${this.config.apiUrl()}${endpoint}`;
    return this.http.delete<T>(url, {
      headers: this.authService.getAuthHeaders(),
      params,
    });
  }

  // Public methods (no token)
  getPublic<T>(endpoint: string, params?: any): Observable<T> {
    return this.http.get<T>(`${this.config.apiUrl()}${endpoint}`, { params });
  }

  postPublic<T>(endpoint: string, body: any, params?: any): Observable<T> {
    return this.http.post<T>(`${this.config.apiUrl()}${endpoint}`, body, { params });
  }

  putPublic<T>(endpoint: string, id: string, body: any, params?: any): Observable<T> {
    return this.http.put<T>(`${this.config.apiUrl()}${endpoint}/${id}`, body, { params });
  }

  deletePublic<T>(endpoint: string, id?: string, params?: any): Observable<T> {
    const url = id ? `${this.config.apiUrl()}${endpoint}/${id}` : `${this.config.apiUrl()}${endpoint}`;
    return this.http.delete<T>(url, { params });
  }
}
