import { SsiMappingEngine, type SsiMapping } from '../../lib/mapping';
import { PseudoMessageParser } from '../../lib/pseudo-parser';
const base: SsiMapping = { standardsRelease:'SR2026', messageType:'MT742', direction:'INCOMING', businessFunction:'CLAIM', path:'57A', canonicalRole:'ACCOUNT_WITH', reusableCandidate:true };
const message = { standardsRelease:'SR2026', messageType:'MT742', direction:'INCOMING' as const, businessFunction:'CLAIM', fields:{ '57A':'BBBBUS33' } };
describe('mapping and parser coverage', () => {
  it('extracts, warns and detects ambiguity', () => {
    expect(new SsiMappingEngine([base]).extract(message).roles[0]?.role).toBe('ACCOUNT_WITH');
    expect(new SsiMappingEngine([]).extract(message).diagnostics[0]?.code).toBe('UNMAPPED_SSI_FIELD');
    expect(new SsiMappingEngine([base,{...base,canonicalRole:'OTHER'}]).extract(message).diagnostics[0]?.code).toBe('AMBIGUOUS_SSI_MAPPING');
  });
  it('generates mapped roles and ignores absent roles or other contexts', () => {
    const engine = new SsiMappingEngine([base,{...base,messageType:'MT700',path:'58A'}]);
    expect(engine.generate({ standardsRelease:'SR2026',messageType:'MT742',direction:'INCOMING',businessFunction:'CLAIM' },{ACCOUNT_WITH:'B'})).toEqual({'57A':'B'});
    expect(engine.generate({ standardsRelease:'SR2026',messageType:'MT742',direction:'INCOMING',businessFunction:'CLAIM' },{})).toEqual({});
  });
  it('parses FIN and JSON and rejects malformed inputs', () => {
    const parser = new PseudoMessageParser();
    expect(parser.parse('STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT742\nDIRECTION=INCOMING\nBUSINESS_FUNCTION=CLAIM\n:57A:B','FIN_LIKE').fields['57A']).toBe('B');
    expect(parser.parse(JSON.stringify(message),'MX_JSON').messageType).toBe('MT742');
    expect(() => parser.parse('{','MX_JSON')).toThrow('Invalid pseudo MX JSON');
    expect(() => parser.parse('[]','MX_JSON')).toThrow('Object expected');
    expect(() => parser.parse('{}','MX_JSON')).toThrow('STANDARDS_RELEASE');
    expect(() => parser.parse(JSON.stringify({...message,direction:'SIDEWAYS'}),'MX_JSON')).toThrow('Direction');
    expect(() => parser.parse('bad','FIN_LIKE')).toThrow('Unsupported pseudo message line');
  });
});
