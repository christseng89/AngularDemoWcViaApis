import { AfterViewInit, CUSTOM_ELEMENTS_SCHEMA, Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild } from '@angular/core';
import {
  BalanceComponentConfig,
  BalanceComponentElement,
  BalanceComponentEventMap,
  BalanceComponentView,
} from '../../app/web-component/balance-component-element.contract';

@Component({
  selector: 'app-balance-component-adapter',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<balance-component-app
    #element
    (balance-ready)="ready.emit($event)"
    (balance-navigation)="navigation.emit($event)"
    (balance-refresh)="refreshed.emit($event)"
    (balance-error)="failed.emit($event)"
  />`,
})
export class BalanceComponentAdapterComponent implements OnChanges, AfterViewInit {
  @Input() config: Partial<BalanceComponentConfig> | null | undefined;
  @Output() readonly ready = new EventEmitter<BalanceComponentEventMap['balance-ready']>();
  @Output() readonly navigation = new EventEmitter<BalanceComponentEventMap['balance-navigation']>();
  @Output() readonly refreshed = new EventEmitter<BalanceComponentEventMap['balance-refresh']>();
  @Output() readonly failed = new EventEmitter<BalanceComponentEventMap['balance-error']>();
  @ViewChild('element', { static: true }) private elementRef!: ElementRef<BalanceComponentElement>;

  ngOnChanges(): void {
    if (this.elementRef) this.elementRef.nativeElement.config = this.config;
  }
  ngAfterViewInit(): void {
    this.elementRef.nativeElement.config = this.config;
  }
  navigate(view: BalanceComponentView): Promise<void> {
    return this.elementRef.nativeElement.navigate(view);
  }
  refresh(): Promise<void> {
    return this.elementRef.nativeElement.refresh();
  }
}
