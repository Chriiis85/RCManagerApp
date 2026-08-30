import { Routes } from '@angular/router';
import { authGuard, unAuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { 
    path: '', 
    loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent), 
    canActivate: [unAuthGuard] 
  },
  { 
    path: 'viajes', 
    loadComponent: () => import('./pages/viajes/viajes.component').then(m => m.ViajesComponent), 
    canActivate: [authGuard] 
  },
  { 
    path: 'login', 
    loadComponent: () => import('./pages/auth/login/login.component').then(m => m.LoginComponent), 
    canActivate: [unAuthGuard] 
  },
  { 
    path: 'register', 
    loadComponent: () => import('./pages/auth/register/register.component').then(m => m.RegisterComponent), 
    canActivate: [unAuthGuard] 
  },
  { 
    path: 'credits', 
    loadComponent: () => import('./pages/credits/credits.component').then(m => m.CreditsComponent) 
  },
  { 
    path: 'atracciones', 
    loadComponent: () => import('./pages/attractions/attractions.component').then(m => m.AttractionsComponent) 
  },
  { 
    path: 'parques', 
    loadComponent: () => import('./pages/parks/parks.component').then(m => m.ParksComponent) 
  },
  { 
    path: 'ranking', 
    loadComponent: () => import('./pages/ranking/ranking.component').then(m => m.RankingComponent) 
  },
  { 
    path: 'profile', 
    loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent), 
    canActivate: [authGuard] 
  },
  { 
    path: 'mis-credits', 
    loadComponent: () => import('./pages/mis-credits/mis-credits.component').then(m => m.MisCreditsComponent), 
    canActivate: [authGuard] 
  },
  { 
    path: 'mis-atracciones', 
    loadComponent: () => import('./pages/mis-atracciones/mis-atracciones.component').then(m => m.MisAtraccionesComponent), 
    canActivate: [authGuard] 
  },
  { 
    path: 'mis-parques', 
    loadComponent: () => import('./pages/mis-parques/mis-parques.component').then(m => m.MisParquesComponent), 
    canActivate: [authGuard] 
  },
  { 
    path: 'legal', 
    loadComponent: () => import('./pages/legal/legal.component').then(m => m.LegalComponent) 
  },
  { 
    path: 'legal/:tab', 
    loadComponent: () => import('./pages/legal/legal.component').then(m => m.LegalComponent) 
  },
  { path: 'terminos', redirectTo: 'legal/terminos', pathMatch: 'full' },
  { path: 'privacidad', redirectTo: 'legal/privacidad', pathMatch: 'full' },
  { path: 'cookies', redirectTo: 'legal/cookies', pathMatch: 'full' },
  { path: 'aviso-legal', redirectTo: 'legal/aviso-legal', pathMatch: 'full' }
];
