import { PseudoMessageParser } from './pseudo-parser';

describe('PseudoMessageParser', () => {
  it('parses only the declared FIN-like SSI subset', () => {
    const message = new PseudoMessageParser().parse(
      'STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT742\nDIRECTION=INCOMING\nBUSINESS_FUNCTION=REIMBURSEMENT_CLAIM\n:57A:BBBBUS33',
      'FIN_LIKE',
    );
    expect(message.fields['57A']).toBe('BBBBUS33');
  });
  it('rejects unknown pseudo syntax', () => {
    expect(() => new PseudoMessageParser().parse('not-a-message', 'FIN_LIKE')).toThrow('Unsupported pseudo message line');
  });
});
