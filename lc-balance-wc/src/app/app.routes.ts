import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'balance-accounts',
    loadComponent: () => import('./balance-account-maintenance/balance-account-maintenance.component').then((m) => m.BalanceAccountMaintenanceComponent),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./transaction-builder/transaction-builder.component').then((m) => m.TransactionBuilderComponent),
  },
  {
    path: 'business-cases',
    loadComponent: () => import('./business-case-runner/business-case-runner.component').then((m) => m.BusinessCaseRunnerComponent),
  },
  { path: '**', redirectTo: '' },
];
