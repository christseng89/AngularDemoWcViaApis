import { SsiMappingEngine, type SsiMapping } from '../../lib/mapping';
import { PseudoMessageParser } from '../../lib/pseudo-parser';
const map: SsiMapping = {standardsRelease:'SR2026',messageType:'MT742',direction:'INCOMING',businessFunction:'CLAIM',path:'57A',canonicalRole:'ACCOUNT',reusableCandidate:true};
const msg = {standardsRelease:'SR2026',messageType:'MT742',direction:'INCOMING' as const,businessFunction:'CLAIM',fields:{'57A':'B'}};
describe('mapping branch matrix',()=>{
  it.each([
    {...map,standardsRelease:'SR2025'}, {...map,messageType:'MT700'}, {...map,direction:'OUTGOING' as const}, {...map,businessFunction:'OTHER'}, {...map,path:'58A'}
  ])('does not apply a mapping with a mismatched key %#',(candidate)=>{ expect(new SsiMappingEngine([candidate]).extract(msg).roles).toHaveLength(0); });
  it('covers JSON fields fallbacks and blank FIN lines',()=>{
    const p=new PseudoMessageParser();
    const base={standardsRelease:'SR2026',messageType:'MT742',direction:'INCOMING',businessFunction:'CLAIM'};
    expect(p.parse(JSON.stringify({...base,fields:null}),'MX_JSON').fields).toEqual({});
    expect(p.parse(JSON.stringify({...base,fields:[]}),'MX_JSON').fields).toEqual({});
    expect(p.parse(`\nSTANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT742\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=CLAIM\n`,'FIN_LIKE').fields).toEqual({});
    expect(()=>p.parse('null','MX_JSON')).toThrow('Object expected');
  });
});
