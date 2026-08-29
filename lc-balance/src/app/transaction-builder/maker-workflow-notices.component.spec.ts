import { TestBed } from '@angular/core/testing';
import { MakerWorkflowNoticesComponent } from './maker-workflow-notices.component';

describe('MakerWorkflowNoticesComponent', () => {
  it('renders success, Fix Pending, and Delete Pending states', () => {
    const fixture = TestBed.createComponent(MakerWorkflowNoticesComponent);
    fixture.componentRef.setInput('releaseSuccessHint', 'Released successfully');
    fixture.componentRef.setInput('fixPendingMode', true);
    fixture.componentRef.setInput('deletePendingReviewMode', true);
    fixture.componentRef.setInput('functionCode', 'A3');
    fixture.componentRef.setInput('movementId', 'movement-1');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Released successfully');
    expect(element.textContent).toContain('FIX PENDING');
    expect(element.textContent).toContain('DELETE PENDING — REVIEW');
    expect(element.textContent).toContain('movement-1');
    expect(element.querySelectorAll('[role="alert"]')).toHaveLength(2);
  });
});
