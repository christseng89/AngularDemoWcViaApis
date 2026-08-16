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

  it('acknowledge() POSTs to the /acknowledge sub-path with acknowledgedBy', () => {
    service.acknowledge('MV-1', 'checker2');
    expect(http.post).toHaveBeenCalledWith('/balance-component/balance-movements/MV-1/acknowledge', { acknowledgedBy: 'checker2' });
  });

  it('submitByMaker() POSTs to the /maker-submit sub-path with makerSubmittedBy', () => {
    service.submitByMaker('MV-1', 'maker1');
    expect(http.post).toHaveBeenCalledWith('/balance-component/balance-movements/MV-1/maker-submit', { makerSubmittedBy: 'maker1' });
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
  });

  it('getSnapshot() GETs the /balance sub-path for the given contract id', () => {
    service.getSnapshot('BC-1');
    expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/BC-1/balance');
  });

  it('listMovements() GETs the /movements sub-path for the given contract id', () => {
    service.listMovements('BC-1');
    expect(http.get).toHaveBeenCalledWith('/balance-component/balance-contracts/BC-1/movements');
  });
});
