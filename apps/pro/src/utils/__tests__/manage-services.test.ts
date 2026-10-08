import { ProServiceStatus } from '@samona/types';
import { serviceRowModel } from '../manage-services';

describe('serviceRowModel', () => {
  it('offers Request for a service never requested', () => {
    const model = serviceRowModel(null);
    expect(model.action).toBe('request');
    expect(model.actionLabelKey).toBe('manageServices.action.request');
    expect(model.badgeTone).toBe('neutral');
    expect(model.badgeLabelKey).toBe('manageServices.status.notRequested');
    expect(model.canViewRejectionReason).toBe(false);
  });

  it('offers nothing while the request is pending review', () => {
    const model = serviceRowModel(ProServiceStatus.PENDING);
    expect(model.action).toBeNull();
    expect(model.actionLabelKey).toBeNull();
    expect(model.badgeTone).toBe('warning');
    expect(model.badgeLabelKey).toBe('manageServices.status.pending');
  });

  it('offers nothing once approved', () => {
    const model = serviceRowModel(ProServiceStatus.ACCEPTED);
    expect(model.action).toBeNull();
    expect(model.badgeTone).toBe('success');
    expect(model.badgeLabelKey).toBe('manageServices.status.approved');
    expect(model.canViewRejectionReason).toBe(false);
  });

  it('offers Request again and a way to view the reason when rejected', () => {
    const model = serviceRowModel(ProServiceStatus.REJECTED);
    expect(model.action).toBe('requestAgain');
    expect(model.actionLabelKey).toBe('manageServices.action.requestAgain');
    expect(model.badgeTone).toBe('danger');
    expect(model.badgeLabelKey).toBe('manageServices.status.rejected');
    expect(model.canViewRejectionReason).toBe(true);
  });
});
