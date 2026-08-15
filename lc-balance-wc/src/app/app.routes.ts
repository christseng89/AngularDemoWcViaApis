import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./business-case-runner/business-case-runner.component').then(m => m.BusinessCaseRunnerComponent),
  },
  {
    path: 'transactions',
    loadComponent: () =>
      import('./transaction-builder/transaction-builder.component').then(m => m.TransactionBuilderComponent),
  },
  { path: '**', redirectTo: '' },
];
