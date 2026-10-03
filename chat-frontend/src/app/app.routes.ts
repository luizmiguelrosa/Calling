import { Routes } from "@angular/router";

import { authGuard, guestGuard } from "./guards/auth.guard";

// Every component is standalone, so each route is a dynamic import. The guards
// stay eager: they are a few lines, and they have to run before the lazy chunk
// that depends on them is even fetched.
export const routes: Routes = [
  // A bare redirect to /chat, no guard: Angular rejects `redirectTo` together
  // with `canActivate`, because the redirect runs before any guard could. The
  // guard on /chat does the deciding, so an unauthenticated visitor still lands
  // on /login — just by way of /chat.
  { path: '', redirectTo: '/chat', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./components/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./components/auth/register/register.component').then(m => m.RegisterComponent),
  },
  {
    // Reachable before signing in only: retargeting the backend mid-session
    // would send a token issued by one server to another.
    path: 'settings/server',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./components/settings/server-address/server-address-page.component').then(
        m => m.ServerAddressPageComponent,
      ),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    loadComponent: () => import('./components/chat/chat.component').then(m => m.ChatComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'rooms' },
      {
        path: 'rooms',
        loadComponent: () => import('./components/chat/room-list/room-list.component').then(m => m.RoomListComponent),
        // The selected room is a child so the list stays on the left.
        children: [
          {
            path: ':id',
            loadComponent: () => import('./components/chat/chat-room/chat-room.component').then(m => m.ChatRoomComponent),
          },
        ],
      },
      {
        path: 'dm',
        loadComponent: () => import('./components/chat/dm-list/dm-list.component').then(m => m.DmListComponent),
      },
      {
        path: 'room/:id',
        loadComponent: () => import('./components/chat/chat-room/chat-room.component').then(m => m.ChatRoomComponent),
      },
    ],
  },
  { path: '**', redirectTo: '/login' }
];
