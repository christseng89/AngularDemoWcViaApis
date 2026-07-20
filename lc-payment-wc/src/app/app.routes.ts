import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/lc-payment/lc-payment.component').then(m => m.LcPaymentComponent),
  },
  { path: '**', redirectTo: '' },
];
