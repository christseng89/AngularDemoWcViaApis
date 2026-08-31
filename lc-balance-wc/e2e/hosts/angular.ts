import 'zone.js';
import '@angular/compiler';
import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { BalanceComponentAdapterComponent } from '../../src/adapters/angular/balance-component-adapter.component';
import { exposeHost } from './host-api';

@Component({
  selector: 'app-e2e-host',
  standalone: true,
  imports: [BalanceComponentAdapterComponent],
  template: `<app-balance-component-adapter #adapter [config]="config" />`,
})
class E2eHostComponent implements AfterViewInit {
  readonly config = { version: '1' as const, theme: 'system' as const };
  @ViewChild('adapter', { static: true }) adapter!: BalanceComponentAdapterComponent;
  ngAfterViewInit(): void {
    const element = document.querySelector('balance-component-app')!;
    exposeHost(element, this.adapter);
  }
}

void bootstrapApplication(E2eHostComponent);
