import { CommonModule, NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, Type } from '@angular/core';
import {
  BalanceComponentConfig,
  BalanceComponentView,
  BalanceErrorDetail,
  BalanceNavigationDetail,
  BalanceReadyDetail,
  NormalizedBalanceComponentConfig,
  normalizeBalanceComponentConfig,
} from './balance-component-element.contract';

const VIEW_LOADERS: Record<BalanceComponentView, () => Promise<Type<unknown>>> = {
  'transaction-builder': () => import('../transaction-builder/transaction-builder.component').then((module) => module.TransactionBuilderComponent),
  'business-cases': () => import('../business-case-runner/business-case-runner.component').then((module) => module.BusinessCaseRunnerComponent),
};

@Component({
  selector: 'app-balance-component-element',
  imports: [CommonModule, NgComponentOutlet],
  templateUrl: './balance-component-element.component.html',
  styleUrl: './balance-component-element.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceComponentElementComponent implements OnInit {
  // Angular Elements forwards output aliases as DOM event names. Kebab-case is intentional here: these
  // names are a framework-neutral Custom Element contract, not Angular parent-template bindings.
  // eslint-disable-next-line @angular-eslint/no-output-rename
  @Output('balance-ready') readonly balanceReady = new EventEmitter<BalanceReadyDetail>();
  // eslint-disable-next-line @angular-eslint/no-output-rename
  @Output('balance-navigation') readonly balanceNavigation = new EventEmitter<BalanceNavigationDetail>();
  // eslint-disable-next-line @angular-eslint/no-output-rename
  @Output('balance-error') readonly balanceError = new EventEmitter<BalanceErrorDetail>();

  protected activeView: BalanceComponentView = 'transaction-builder';
  protected activeComponent: Type<unknown> | null = null;
  protected loading = true;

  private normalizedConfig: NormalizedBalanceComponentConfig = normalizeBalanceComponentConfig(undefined);
  private initialized = false;

  constructor(private readonly changeDetectorRef: ChangeDetectorRef) {}

  @Input()
  set config(value: Partial<BalanceComponentConfig> | null | undefined) {
    try {
      this.normalizedConfig = normalizeBalanceComponentConfig(value);
      if (this.initialized) void this.activateView(this.normalizedConfig.initialView, false);
    } catch (error) {
      this.emitError('INVALID_CONFIG_VERSION', error);
    }
  }

  ngOnInit(): void {
    this.initialized = true;
    void this.activateView(this.normalizedConfig.initialView, false, true);
  }

  protected navigateTo(view: BalanceComponentView): void {
    void this.activateView(view, true);
  }

  protected isActive(view: BalanceComponentView): boolean {
    return this.activeView === view;
  }

  private async activateView(view: BalanceComponentView, emitNavigation: boolean, emitReady = false): Promise<void> {
    const previousView = this.activeView;
    this.loading = true;

    try {
      this.activeComponent = await VIEW_LOADERS[view]();
      this.activeView = view;
      this.loading = false;
      this.changeDetectorRef.markForCheck();

      if (emitNavigation && previousView !== view) {
        this.balanceNavigation.emit({ from: previousView, to: view });
      }
      if (emitReady) {
        this.balanceReady.emit({ version: this.normalizedConfig.version, view });
      }
    } catch (error) {
      this.loading = false;
      this.changeDetectorRef.markForCheck();
      this.emitError('VIEW_LOAD_FAILED', error);
    }
  }

  private emitError(code: BalanceErrorDetail['code'], error: unknown): void {
    this.balanceError.emit({ code, message: error instanceof Error ? error.message : String(error) });
  }
}
