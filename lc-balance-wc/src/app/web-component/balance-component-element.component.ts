import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
  OnInit,
  Output,
  Type,
  ViewChild,
  ViewContainerRef,
  ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  BALANCE_COMPONENT_CONTRACT_VERSION,
  BalanceComponentConfig,
  BalanceComponentTheme,
  BalanceComponentView,
  BalanceErrorDetail,
  BalanceNavigationDetail,
  BalanceReadyDetail,
  BalanceRefreshDetail,
  NormalizedBalanceComponentConfig,
  isBalanceComponentView,
  normalizeBalanceComponentConfig,
} from './balance-component-element.contract';
import { BALANCE_COMPONENT_COMMAND_EVENT, BalanceComponentCommandDetail } from './balance-component-element.command';

const VIEW_LOADERS: Record<BalanceComponentView, () => Promise<Type<unknown>>> = {
  'balance-accounts': () => import('../balance-account-maintenance/balance-account-maintenance.component').then((module) => module.BalanceAccountMaintenanceComponent),
  'transaction-builder': () => import('../transaction-builder/transaction-builder.component').then((module) => module.TransactionBuilderComponent),
  'business-cases': () => import('../business-case-runner/business-case-runner.component').then((module) => module.BusinessCaseRunnerComponent),
};

@Component({
  selector: 'app-balance-component-element',
  imports: [],
  templateUrl: './balance-component-element.component.html',
  styleUrl: './balance-component-element.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class BalanceComponentElementComponent implements OnInit, AfterViewInit, OnDestroy {
  // Angular Elements forwards output aliases as DOM event names. Kebab-case is intentional here: these
  // names are a framework-neutral Custom Element contract, not Angular parent-template bindings.
  // eslint-disable-next-line @angular-eslint/no-output-rename
  @Output('balance-ready') readonly balanceReady = new EventEmitter<BalanceReadyDetail>();
  // eslint-disable-next-line @angular-eslint/no-output-rename
  @Output('balance-navigation') readonly balanceNavigation = new EventEmitter<BalanceNavigationDetail>();
  // eslint-disable-next-line @angular-eslint/no-output-rename
  @Output('balance-refresh') readonly balanceRefresh = new EventEmitter<BalanceRefreshDetail>();
  // eslint-disable-next-line @angular-eslint/no-output-rename
  @Output('balance-error') readonly balanceError = new EventEmitter<BalanceErrorDetail>();

  protected activeView: BalanceComponentView = 'transaction-builder';
  protected activeComponent: Type<unknown> | null = null;
  protected loading = true;

  protected stylesheetResourceUrl: SafeResourceUrl = '';
  private stylesheetUrlValue = '';

  @Input()
  set stylesheetUrl(value: string) {
    this.stylesheetUrlValue = value;
    this.stylesheetResourceUrl = value ? this.sanitizer.bypassSecurityTrustResourceUrl(value) : '';
  }

  get stylesheetUrl(): string {
    return this.stylesheetUrlValue;
  }
  @HostBinding('attr.data-theme') protected effectiveTheme: 'light' | 'dark' = 'light';
  @HostBinding('attr.data-bs-theme') protected get bootstrapTheme(): 'light' | 'dark' {
    return this.effectiveTheme;
  }

  @ViewChild('viewHost', { read: ViewContainerRef }) private viewHost!: ViewContainerRef;
  @ViewChild('componentStyles') private componentStyles?: ElementRef<HTMLLinkElement>;

  private normalizedConfig: NormalizedBalanceComponentConfig = normalizeBalanceComponentConfig(undefined);
  private initialized = false;
  private systemThemeQuery: MediaQueryList | null = null;
  private readonly handleSystemThemeChange = (): void => this.applyTheme('system');

  constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly sanitizer: DomSanitizer,
  ) {}

  @Input()
  set config(value: Partial<BalanceComponentConfig> | null | undefined) {
    try {
      this.normalizedConfig = normalizeBalanceComponentConfig(value);
      this.applyTheme(this.normalizedConfig.theme);
      if (this.initialized) {
        void this.activateView(this.normalizedConfig.initialView, false, false, 'configure').catch(() => undefined);
      }
    } catch (error) {
      const code = value?.version && value.version !== BALANCE_COMPONENT_CONTRACT_VERSION ? 'INVALID_CONFIG_VERSION' : 'INVALID_CONFIG';
      this.emitError(code, 'configure', error);
    }
  }

  ngOnInit(): void {
    this.initialized = true;
    this.applyTheme(this.normalizedConfig.theme);
    this.elementRef.nativeElement.addEventListener(BALANCE_COMPONENT_COMMAND_EVENT, this.handleCommand);
  }

  ngAfterViewInit(): void {
    void this.initializeView();
  }

  ngOnDestroy(): void {
    this.elementRef.nativeElement.removeEventListener(BALANCE_COMPONENT_COMMAND_EVENT, this.handleCommand);
    this.removeSystemThemeListener();
  }

  navigate(view: BalanceComponentView): Promise<void> {
    if (!isBalanceComponentView(view)) {
      const error = new Error(`Unsupported Balance Component view: ${String(view)}`);
      this.emitError('INVALID_VIEW', 'navigate', error);
      return Promise.reject(error);
    }
    return this.activateView(view, true, false, 'navigate');
  }

  refresh(): Promise<void> {
    return this.activateView(this.activeView, false, false, 'refresh', true).then(() => {
      this.balanceRefresh.emit({ view: this.activeView });
    });
  }

  protected navigateTo(view: BalanceComponentView): void {
    void this.navigate(view).catch(() => undefined);
  }

  protected isActive(view: BalanceComponentView): boolean {
    return this.activeView === view;
  }

  private readonly handleCommand = (event: Event): void => {
    const commandEvent = event as CustomEvent<BalanceComponentCommandDetail>;
    commandEvent.stopPropagation();
    const { command, resolve, reject } = commandEvent.detail;
    const operation = command.type === 'navigate' ? this.navigate(command.view) : this.refresh();
    void operation.then(resolve, reject);
  };

  private async initializeView(): Promise<void> {
    try {
      await this.waitForStylesheet();
      await this.activateView(this.normalizedConfig.initialView, false, true, 'initialize');
    } catch {
      // The specific initialization error has already been emitted at its source boundary.
    }
  }

  private waitForStylesheet(): Promise<void> {
    const link = this.componentStyles?.nativeElement;
    if (!this.stylesheetUrl || !link || link.sheet) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      link.addEventListener('load', () => resolve(), { once: true });
      link.addEventListener(
        'error',
        () => {
          const error = new Error(`Could not load Balance Component stylesheet: ${this.stylesheetUrl}`);
          this.emitError('STYLESHEET_LOAD_FAILED', 'initialize', error);
          reject(error);
        },
        { once: true },
      );
    });
  }

  private applyTheme(mode: BalanceComponentTheme): void {
    this.removeSystemThemeListener();
    if (mode === 'system') {
      this.systemThemeQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      this.systemThemeQuery?.addEventListener('change', this.handleSystemThemeChange);
      this.effectiveTheme = this.systemThemeQuery?.matches ? 'dark' : 'light';
    } else {
      this.effectiveTheme = mode;
    }
    this.changeDetectorRef.markForCheck();
  }

  private removeSystemThemeListener(): void {
    this.systemThemeQuery?.removeEventListener('change', this.handleSystemThemeChange);
    this.systemThemeQuery = null;
  }

  private async activateView(
    view: BalanceComponentView,
    emitNavigation: boolean,
    emitReady = false,
    operation: BalanceErrorDetail['operation'] = 'navigate',
    forceRender = false,
  ): Promise<void> {
    const previousView = this.activeView;
    if (!forceRender && this.activeComponent && previousView === view) return;
    this.loading = true;

    try {
      const component = await VIEW_LOADERS[view]();
      this.viewHost.clear();
      this.viewHost.createComponent(component);
      this.activeComponent = component;
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
      this.emitError('VIEW_LOAD_FAILED', operation, error, view);
      throw error;
    }
  }

  private emitError(code: BalanceErrorDetail['code'], operation: BalanceErrorDetail['operation'], error: unknown, view?: BalanceComponentView): void {
    this.balanceError.emit({
      code,
      operation,
      message: error instanceof Error ? error.message : String(error),
      ...(view ? { view } : {}),
    });
  }
}
