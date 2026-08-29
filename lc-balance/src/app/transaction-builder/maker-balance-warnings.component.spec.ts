import { TestBed } from '@angular/core/testing';
import { MakerBalanceWarningsComponent } from './maker-balance-warnings.component';

describe('MakerBalanceWarningsComponent', () => {
  it('renders each policy message as an accessible alert', () => {
    const fixture = TestBed.createComponent(MakerBalanceWarningsComponent);
    fixture.componentRef.setInput('messages', ['First warning', 'Second warning']);
    fixture.detectChanges();
    const alerts = (fixture.nativeElement as HTMLElement).querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(2);
    expect(alerts[0].textContent).toContain('First warning');
  });
});
