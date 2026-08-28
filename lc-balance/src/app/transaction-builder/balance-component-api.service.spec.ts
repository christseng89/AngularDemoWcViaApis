import { BalanceComponentApiService, NaturalKey, CreateMovementRequest } from './balance-component-api.service';

describe('BalanceComponentApiService', () => {
  let http: { get: jest.Mock; post: jest.Mock };
  let service: BalanceComponentApiService;

  beforeEach(() => {
    http = { get: jest.fn().mockReturnValue('OBS'), post: jest.fn().mockReturnValue('OBS') };
    service = new BalanceComponentApiService(http as any);
  });

  it('createMovement() POSTs to /balance-component/balance-movements with observe:response and the raw request body', () => {
    const req: CreateMovementRequest = {
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'S001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      createdBy: 'maker1',
    };
    const result = service.createMovement(req);
    expect(http.post).toHaveBeenCalledWith('/balance-component/balance-movements', req, { observe: 'response' });
    expect(result).toBe('OBS');
  });

  it('release() POSTs to the /release sub-path with releasedBy', () => {
    service.release('MV-1', 'checker1');
    expect(http.post).toHaveBeenCalledWith('/balance-component/balance-movements/MV-1/release', { releasedBy: 'checker1' });
  });

  it('reject() POSTs to the /reject sub-path with releasedBy/reasonCode/remarks', () => {
    service.reject('MV-1', 'checker1', 'BAD_DOCS', 'missing signature');
    expect(http.post).toHaveBeenCalledWith('/balance-component/balance-movements/MV-1/reject', {
      releasedBy: 'checker1',
      reasonCode: 'BAD_DOCS',
      remarks: 'missing signature',
    });
  });

  it('reject() works with remarks omitted (optional param)', () => {
    service.reject('MV-1', 'checker1', 'BAD_DOCS');
    expect(http.post).toHaveBeenCalledWith('/balance-component/balance-movements/MV-1/reject', {
      releasedBy: 'checker1',
      reasonCode: 'BAD_DOCS',
      remarks: undefined,
    });
  });

  it('cancel() POSTs to the /cancel sub-path with cancelledBy plus optional reasonCode/remarks', () => {
    service.cancel('MV-1', 'maker1', 'EC', 'wrong amount');
    expect(http.post).toHaveBeenCalledWith('/balance-component/balance-movements/MV-1/cancel', {
      cancelledBy: 'maker1',
      reasonCode: 'EC',
      remarks: 'wrong amount',
    });
  });

  it('cancel() works with reasonCode/remarks both omitted', () => {
    service.cancel('MV-1', 'maker1');
    expect(http.post).toHaveBeenCalledWith('/balance-component/balance-movements/MV-1/cancel', {
      cancelledBy: 'maker1',
      reasonCode: undefined,
      remarks: undefined,
    });
  });

  it('submitByMaker() POSTs to the /maker-submit sub-path with makerSubmittedBy', () => {
    service.submitByMaker('MV-1', 'maker1');
    expect(http.post).toHaveBeenCalledWith('/balance-component/balance-movements/MV-1/maker-submit', { makerSubmittedBy: 'maker1' });
  });

  it('withdrawMakerSubmit() POSTs to the /withdraw-maker-submit sub-path with withdrawnBy', () => {
    service.withdrawMakerSubmit('MV-1', 'maker1');
    expect(http.post).toHaveBeenCalledWith('/balance-component/balance-movements/MV-1/withdraw-maker-submit', { withdrawnBy: 'maker1' });
  });

  it('editPending() POSTs to the /edit sub-path with the raw request body (Fix Pending, §2.2/§15/§19)', () => {
    service.editPending('MV-1', { amount: '95000', editedBy: 'maker2' });
    expect(http.post).toHaveBeenCalledWith('/balance-component/balance-movements/MV-1/edit', { amount: '95000', editedBy: 'maker2' });
  });

  describe('resolveContract()', () => {
    it('GETs balance-contracts with only instrumentType + lcNumber when ibNumber/sgNumber are absent', () => {
      const nk: NaturalKey = { lcNumber: 'S001' };
      service.resolveContract('IPLC_LC', nk);
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts', {
        params: { instrumentType: 'IPLC_LC', lcNumber: 'S001' },
      });
    });

    it('adds ibNumber to params when present', () => {
      const nk: NaturalKey = { lcNumber: 'S001', ibNumber: 'IB001' };
      service.resolveContract('IPLC_ACCEPTANCE', nk);
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts', {
        params: { instrumentType: 'IPLC_ACCEPTANCE', lcNumber: 'S001', ibNumber: 'IB001' },
      });
    });

    it('adds sgNumber to params when present', () => {
      const nk: NaturalKey = { lcNumber: 'S001', sgNumber: 'G01' };
      service.resolveContract('SHGT', nk);
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts', {
        params: { instrumentType: 'SHGT', lcNumber: 'S001', sgNumber: 'G01' },
      });
    });

    it('adds both ibNumber and sgNumber when both present', () => {
      const nk: NaturalKey = { lcNumber: 'S001', ibNumber: 'IB001', sgNumber: 'G01' };
      service.resolveContract('SHGT', nk);
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts', {
        params: { instrumentType: 'SHGT', lcNumber: 'S001', ibNumber: 'IB001', sgNumber: 'G01' },
      });
    });

    it('omits ibNumber/sgNumber when explicitly null (falsy branch)', () => {
      const nk: NaturalKey = { lcNumber: 'S001', ibNumber: null, sgNumber: null };
      service.resolveContract('IPLC_LC', nk);
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts', {
        params: { instrumentType: 'IPLC_LC', lcNumber: 'S001' },
      });
    });
  });

  describe('catalog()', () => {
    it('GETs the catalog with only instrumentType/page/pageSize when all optional filters are omitted', () => {
      service.catalog('IPLC_LC');
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/catalog', {
        params: { instrumentType: 'IPLC_LC', page: 1, pageSize: 10 },
      });
    });

    it('adds status when present', () => {
      service.catalog('IPLC_LC', 'ACTIVE');
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/catalog', {
        params: { instrumentType: 'IPLC_LC', page: 1, pageSize: 10, status: 'ACTIVE' },
      });
    });

    it('adds q when present', () => {
      service.catalog('IPLC_LC', undefined, 'S00');
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/catalog', {
        params: { instrumentType: 'IPLC_LC', page: 1, pageSize: 10, q: 'S00' },
      });
    });

    it('respects explicit page/pageSize', () => {
      service.catalog('IPLC_LC', undefined, undefined, 3, 25);
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/catalog', {
        params: { instrumentType: 'IPLC_LC', page: 3, pageSize: 25 },
      });
    });

    it('adds lcNumber when present (exact-match drill-down)', () => {
      service.catalog('IPLC_ACCEPTANCE', undefined, undefined, 1, 10, 'S001');
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/catalog', {
        params: { instrumentType: 'IPLC_ACCEPTANCE', page: 1, pageSize: 10, lcNumber: 'S001' },
      });
    });

    it('adds tenorFamily when present', () => {
      service.catalog('IPLC_LC', undefined, undefined, 1, 10, undefined, 'USANCE');
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/catalog', {
        params: { instrumentType: 'IPLC_LC', page: 1, pageSize: 10, tenorFamily: 'USANCE' },
      });
    });

    it('adds all optional filters together when all present', () => {
      service.catalog('IPLC_LC', 'ACTIVE', 'S00', 2, 20, 'S001', 'SIGHT');
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/catalog', {
        params: { instrumentType: 'IPLC_LC', page: 2, pageSize: 20, status: 'ACTIVE', q: 'S00', lcNumber: 'S001', tenorFamily: 'SIGHT' },
      });
    });

    // Bug fixed 2026-08-18 ("S10 still shown in A4 function which is wrong") — see this method's own
    // doc comment for the full rule.
    it('adds requireIssueReleased=true when passed true', () => {
      service.catalog('IPLC_LC', 'ACTIVE', undefined, 1, 10, undefined, undefined, true);
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/catalog', {
        params: { instrumentType: 'IPLC_LC', page: 1, pageSize: 10, status: 'ACTIVE', requireIssueReleased: 'true' },
      });
    });

    it('omits requireIssueReleased when false/omitted — the exclusion is opt-in, not the default', () => {
      service.catalog('IPLC_LC', 'ACTIVE', undefined, 1, 10, undefined, undefined, false);
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/catalog', {
        params: { instrumentType: 'IPLC_LC', page: 1, pageSize: 10, status: 'ACTIVE' },
      });
    });
  });

  describe('closeEligible() — A10/B6', () => {
    it('GETs the close-eligible endpoint with instrumentType and the default pageSize=200 when lcNumber is omitted', () => {
      service.closeEligible('IPLC_LC');
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/close-eligible', {
        params: { instrumentType: 'IPLC_LC', pageSize: 200 },
      });
    });

    it('adds lcNumber when present', () => {
      service.closeEligible('EPLC_CONFIRMATION', 'S001');
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/close-eligible', {
        params: { instrumentType: 'EPLC_CONFIRMATION', pageSize: 200, lcNumber: 'S001' },
      });
    });

    it('respects an explicit pageSize override', () => {
      service.closeEligible('IPLC_LC', undefined, 50);
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/close-eligible', {
        params: { instrumentType: 'IPLC_LC', pageSize: 50 },
      });
    });
  });

  describe('reopenEligible() — A11/B7 (Reopen, F1)', () => {
    it('GETs the reopen-eligible endpoint with instrumentType and the default pageSize=200 when lcNumber is omitted', () => {
      service.reopenEligible('IPLC_LC');
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/reopen-eligible', {
        params: { instrumentType: 'IPLC_LC', pageSize: 200 },
      });
    });

    it('adds lcNumber when present', () => {
      service.reopenEligible('EPLC_CONFIRMATION', 'S001');
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/reopen-eligible', {
        params: { instrumentType: 'EPLC_CONFIRMATION', pageSize: 200, lcNumber: 'S001' },
      });
    });

    it('respects an explicit pageSize override', () => {
      service.reopenEligible('IPLC_LC', undefined, 50);
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/reopen-eligible', {
        params: { instrumentType: 'IPLC_LC', pageSize: 50 },
      });
    });
  });

  it('getSnapshot() GETs the /balance sub-path for the given contract id', () => {
    service.getSnapshot('BC-1');
    expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/BC-1/balance');
  });

  it('listMovements() GETs the /movements sub-path for the given contract id', () => {
    service.listMovements('BC-1');
    expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/BC-1/movements');
  });

  it('getBalanceAsOfMovement() GETs the /balance-as-of sub-path for the given movement id', () => {
    const result = service.getBalanceAsOfMovement('MV-1');
    expect(http.get).toHaveBeenCalledWith('/balance-component/balance-movements/MV-1/balance-as-of');
    expect(result).toBe('OBS');
  });

  describe('listMyMovements() — Fix Pending/Delete Pending Phase 2 Maker Queue worklist (unpaginated, 2026-08-28)', () => {
    it('GETs /balance-movements with only createdBy when statuses/q are omitted', () => {
      const result = service.listMyMovements({ createdBy: 'maker1' });
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-movements', { params: { createdBy: 'maker1' } });
      expect(result).toBe('OBS');
    });

    it('joins statuses with a comma', () => {
      service.listMyMovements({ createdBy: 'maker1', statuses: ['PENDING', 'REJECTED'] });
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-movements', {
        params: { createdBy: 'maker1', status: 'PENDING,REJECTED' },
      });
    });

    it('omits the status param for an empty statuses array', () => {
      service.listMyMovements({ createdBy: 'maker1', statuses: [] });
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-movements', { params: { createdBy: 'maker1' } });
    });

    // User-directed 2026-08-28 ("Maker Queue 提供 LC Number Search 功能", "支援 LIKE / Partial Match")
    it('includes q when supplied', () => {
      service.listMyMovements({ createdBy: 'maker1', q: 'S001' });
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-movements', { params: { createdBy: 'maker1', q: 'S001' } });
    });

    it('omits q when blank/omitted', () => {
      service.listMyMovements({ createdBy: 'maker1', q: '' });
      expect(http.get).toHaveBeenCalledWith('/balance-component/balance-movements', { params: { createdBy: 'maker1' } });
    });
  });

  it('getContract() GETs /balance-contracts/:id directly by ID', () => {
    const result = service.getContract('BC-1');
    expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/BC-1');
    expect(result).toBe('OBS');
  });

  describe('listDeletePendingAudit() — Inquire Delete Pending (§11)', () => {
    it('GETs /delete-pending-audit with no params when every filter is omitted', () => {
      const result = service.listDeletePendingAudit({});
      expect(http.get).toHaveBeenCalledWith('/balance-component/delete-pending-audit', { params: {} });
      expect(result).toBe('OBS');
    });

    it('includes only the filters that are supplied, page/pageSize stringified', () => {
      service.listDeletePendingAudit({ lcNumber: 'S01', deletedBy: 'maker1', from: '2026-01-01', to: '2026-12-31', page: 2, pageSize: 5 });
      expect(http.get).toHaveBeenCalledWith('/balance-component/delete-pending-audit', {
        params: { lcNumber: 'S01', deletedBy: 'maker1', from: '2026-01-01', to: '2026-12-31', page: '2', pageSize: '5' },
      });
    });

    it('omits page/pageSize when not supplied', () => {
      service.listDeletePendingAudit({ lcNumber: 'S01' });
      expect(http.get).toHaveBeenCalledWith('/balance-component/delete-pending-audit', { params: { lcNumber: 'S01' } });
    });
  });
});
