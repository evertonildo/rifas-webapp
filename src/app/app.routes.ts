import { Routes } from '@angular/router';
import { adminGuard, sysopGuard } from './core/services/auth.service';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/publicas/rifas-list.component').then((m) => m.RifasListComponent),
    title: 'Rifas Audita | Escolha sua rifa',
  },
  {
    path: 'rifa/:id',
    loadComponent: () => import('./features/publicas/rifa-detalhe.component').then((m) => m.RifaDetalheComponent),
    title: 'Rifas Audita | Reservar números',
  },
  {
    path: 'rifa/:rifaId/reserva/:reservaId',
    loadComponent: () => import('./features/publicas/reserva.component').then((m) => m.ReservaComponent),
    title: 'Rifas Audita | Sua reserva',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
    title: 'Rifas Audita | Login do administrador',
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-rifas.component').then((m) => m.AdminRifasComponent),
    title: 'Rifas Audita | Painel do administrador',
  },
  {
    path: 'admin/nova',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/rifa-form.component').then((m) => m.RifaFormComponent),
    title: 'Rifas Audita | Nova rifa',
  },
  {
    path: 'admin/rifa/:id/editar',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/rifa-form.component').then((m) => m.RifaFormComponent),
    title: 'Rifas Audita | Editar rifa',
  },
  {
    path: 'admin/rifa/:id',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/rifa-admin.component').then((m) => m.RifaAdminComponent),
    title: 'Rifas Audita | Gerenciar rifa',
  },
  {
    path: 'admin/admins',
    canActivate: [sysopGuard],
    loadComponent: () => import('./features/admin/admins.component').then((m) => m.AdminsComponent),
    title: 'Rifas Audita | Administradores',
  },
  {
    path: 'admin/previas',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/previas.component').then((m) => m.PreviasComponent),
    title: 'Rifas Audita | Prévias de compartilhamento',
  },
  {
    path: 'admin/dashboard',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/dashboard.component').then((m) => m.DashboardComponent),
    title: 'Rifas Audita | Dashboard',
  },
  { path: '**', redirectTo: '' },
];
