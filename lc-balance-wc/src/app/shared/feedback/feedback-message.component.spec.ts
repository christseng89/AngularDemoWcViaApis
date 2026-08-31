import { TestBed } from '@angular/core/testing';
import { FeedbackMessageComponent } from './feedback-message.component';

describe('FeedbackMessageComponent', () => {
  it('renders an error with assertive alert semantics and optional guidance', () => {
    const fixture = TestBed.createComponent(FeedbackMessageComponent);
    fixture.componentRef.setInput('message', {
      severity: 'ERROR',
      title: 'Request could not be completed',
      message: 'Your changes were not submitted.',
      nextAction: 'Try again.',
      supportCode: 'BAL-UI-UNEXPECTED',
    });
    fixture.detectChanges();

    const feedback = fixture.nativeElement.querySelector('.tb-feedback') as HTMLElement;
    expect(feedback.classList).toContain('tb-feedback--error');
    expect(feedback.getAttribute('role')).toBe('alert');
    expect(feedback.getAttribute('aria-live')).toBe('assertive');
    expect(fixture.nativeElement.textContent).toContain('Try again.');
    expect(fixture.nativeElement.textContent).toContain('BAL-UI-UNEXPECTED');
  });

  it('renders info as a polite status and emits retry intent', () => {
    const fixture = TestBed.createComponent(FeedbackMessageComponent);
    fixture.componentRef.setInput('message', {
      severity: 'INFO',
      title: 'No matching transaction',
      message: 'No transaction matched your search.',
      retryable: true,
    });
    let retries = 0;
    fixture.componentInstance.retry.subscribe(() => retries++);
    fixture.detectChanges();

    const feedback = fixture.nativeElement.querySelector('.tb-feedback') as HTMLElement;
    expect(feedback.getAttribute('role')).toBe('status');
    expect(feedback.getAttribute('aria-live')).toBe('polite');
    (fixture.nativeElement.querySelector('.tb-feedback__retry') as HTMLButtonElement).click();
    expect(retries).toBe(1);
  });
});
