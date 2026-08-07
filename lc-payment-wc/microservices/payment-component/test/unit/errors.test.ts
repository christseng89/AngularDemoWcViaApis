import { ApiError, RequestValidationError, BusinessValidationError, NotFoundError } from '../../src/errors';

describe('errors', () => {
  describe('RequestValidationError', () => {
    it('is a 400 with a fixed code', () => {
      const err = new RequestValidationError('bad request body');
      expect(err).toBeInstanceOf(ApiError);
      expect(err.httpStatus).toBe(400);
      expect(err.code).toBe('REQUEST_VALIDATION_FAILED');
      expect(err.message).toBe('bad request body');
      expect(err.toBody()).toEqual({ code: 'REQUEST_VALIDATION_FAILED', message: 'bad request body' });
    });
  });

  describe('BusinessValidationError', () => {
    it('is a 409 with a caller-supplied code', () => {
      const err = new BusinessValidationError('LEGS_UNBALANCED', 'legs do not balance');
      expect(err).toBeInstanceOf(ApiError);
      expect(err.httpStatus).toBe(409);
      expect(err.code).toBe('LEGS_UNBALANCED');
      expect(err.toBody()).toEqual({ code: 'LEGS_UNBALANCED', message: 'legs do not balance' });
    });

    it('carries a different code per instance', () => {
      const err = new BusinessValidationError('SWIFT_ADV_COV_MISMATCH', 'mismatch');
      expect(err.code).toBe('SWIFT_ADV_COV_MISMATCH');
    });
  });

  describe('NotFoundError', () => {
    it('is a 404 with a fixed code', () => {
      const err = new NotFoundError('no such instruction');
      expect(err).toBeInstanceOf(ApiError);
      expect(err.httpStatus).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.toBody()).toEqual({ code: 'NOT_FOUND', message: 'no such instruction' });
    });
  });
});
