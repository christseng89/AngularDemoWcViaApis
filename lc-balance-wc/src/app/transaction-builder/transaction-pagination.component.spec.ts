import { TestBed } from '@angular/core/testing';
import { TransactionPaginationComponent } from './transaction-pagination.component';

describe('TransactionPaginationComponent', () => {
  it('renders the page summary and emits enabled navigation requests', () => {
    const fixture = TestBed.createComponent(TransactionPaginationComponent);
    fixture.componentRef.setInput('page', 2);
    fixture.componentRef.setInput('totalPages', 3);
    fixture.componentRef.setInput('total', 25);
    fixture.detectChanges();
    let previous = 0;
    let next = 0;
    fixture.componentInstance.previousRequested.subscribe(() => previous++);
    fixture.componentInstance.nextRequested.subscribe(() => next++);

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[0].click();
    buttons[1].click();

    expect(fixture.nativeElement.textContent).toContain('Page 2 / 3 (25 total)');
    expect(previous).toBe(1);
    expect(next).toBe(1);
    expect(buttons[0].classList).toContain('tb-btn--outline');
    expect(buttons[1].classList).toContain('tb-btn--outline');
  });

  it('disables previous/next at boundaries and both controls while loading', () => {
    const fixture = TestBed.createComponent(TransactionPaginationComponent);
    fixture.componentRef.setInput('page', 1);
    fixture.componentRef.setInput('totalPages', 1);
    fixture.detectChanges();
    let buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);

    fixture.componentRef.setInput('page', 2);
    fixture.componentRef.setInput('totalPages', 3);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);
  });
});
