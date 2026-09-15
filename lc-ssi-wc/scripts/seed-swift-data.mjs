import { readFile } from 'node:fs/promises';

const api=process.env.SSI_BFF_URL??'http://localhost:3100/api';
const catalogue=JSON.parse(await readFile(new URL('../fixtures/ten-bank-ssi.seed.json',import.meta.url),'utf8'));
const get=async(path)=>{const response=await fetch(`${api}/${path}`);if(!response.ok)throw new Error(`GET ${path}: ${response.status}`);return response.json();};
const send=async(path,method,body)=>{const response=await fetch(`${api}/${path}`,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(value)}`);return value;};
const activate=async(endpoint,record,maker,checker)=>{let current=record;if(current.status==='DRAFT')current=await send(`${endpoint}/${current.id}/submit`,'POST',{actor:maker});if(current.status==='PENDING_APPROVAL')current=await send(`${endpoint}/${current.id}/approve`,'POST',{actor:checker});if(current.status==='APPROVED')current=await send(`${endpoint}/${current.id}/activate`,'POST',{actor:checker});return current;};

let rmas=await get('rma-authorisations');
let nostros=await get('nostro-accounts');
let entities=await get('booking-branch-entities');
for(const entity of [{branchCode:'HK01',branchName:'Hong Kong Branch',legalEntityCode:'BASELINE-HK',legalEntityName:'Baseline Bank Hong Kong',countryCode:'HK'},{branchCode:'SG01',branchName:'Singapore Branch',legalEntityCode:'BASELINE-SG',legalEntityName:'Baseline Bank Singapore',countryCode:'SG'},{branchCode:'GB01',branchName:'London Branch',legalEntityCode:'BASELINE-GB',legalEntityName:'Baseline Bank London',countryCode:'GB'},{branchCode:'US01',branchName:'New York Branch',legalEntityCode:'BASELINE-US',legalEntityName:'Baseline Bank New York',countryCode:'US'},{branchCode:'TW01',branchName:'Taipei Branch',legalEntityCode:'DEMO-TW',legalEntityName:'Demo Bank Taiwan',countryCode:'TW'},{branchCode:'ZA01',branchName:'Johannesburg Branch',legalEntityCode:'DEMO-ZA',legalEntityName:'Demo Bank South Africa',countryCode:'ZA'},{branchCode:'AE01',branchName:'Dubai Branch',legalEntityCode:'DEMO-AE',legalEntityName:'Demo Bank UAE',countryCode:'AE'},{branchCode:'DE01',branchName:'Frankfurt Branch',legalEntityCode:'DEMO-DE',legalEntityName:'Demo Bank Germany',countryCode:'DE'},{branchCode:'CN01',branchName:'Shanghai Branch',legalEntityCode:'DEMO-CN',legalEntityName:'Demo Bank China',countryCode:'CN'},{branchCode:'KR01',branchName:'Seoul Branch',legalEntityCode:'DEMO-KR',legalEntityName:'Demo Bank South Korea',countryCode:'KR'}]){let record=entities.find((item)=>item.branchCode===entity.branchCode&&item.status==='ACTIVE');if(!record)record=await send('booking-branch-entities','POST',{...entity,validFrom:'2026-01-01',validTo:'2099-12-31',maker:'maker.entity'});await activate('booking-branch-entities',record,'maker.entity','checker.entity');entities=await get('booking-branch-entities');}
const activeSsis=(await get('ssis')).filter((item)=>item.status==='ACTIVE'&&(String(item.route?.sampleSet??'').startsWith('DEMO')||String(item.route?.sampleSet??'').startsWith('TEN_BANK_SR2026_PUBLIC_BIC')));
for(const item of activeSsis){
  const messages=String(item.route.messageTypes).split(',').map((value)=>value.trim());
  for(const service of ['FIN','FINPLUS']){
    const scoped=messages.filter((message)=>service==='FIN'?message.startsWith('MT'):message.startsWith('pacs.'));
    if(!scoped.length)continue;
    for(const direction of ['INBOUND','OUTBOUND']){
      const receiver=item.route.actualReceiverBic??item.route.accountWithBic;
      let record=rmas.find((value)=>value.ownBic==='DEMOHKHH'&&value.counterpartyBic===receiver&&value.service===service&&value.direction===direction&&value.status!=='REVOKED'&&(value.status!=='DRAFT'||value.maker==='maker.swiftdata'));
      if(!record)record=await send('rma-authorisations','POST',{ownBic:'DEMOHKHH',counterpartyBic:receiver,service,direction,messageTypes:scoped,validFrom:'2026-01-01',validTo:'2027-12-31',maker:'maker.swiftdata',source:'SYNTHETIC_DEMO'});
      else if(scoped.some((message)=>!record.messageTypes.includes(message))){
        const messageTypes=[...new Set([...record.messageTypes,...scoped])];
        record=await send(`rma-authorisations/${record.id}/revise`,'POST',{maker:'maker.swiftdata'});
        record=await send(`rma-authorisations/${record.id}`,'PUT',{ownBic:record.ownBic,counterpartyBic:record.counterpartyBic,service:record.service,direction:record.direction,messageTypes,validFrom:record.validFrom,validTo:record.validTo,maker:'maker.swiftdata',source:'SYNTHETIC_DEMO'});
      }
      await activate('rma-authorisations',record,'maker.swiftdata','checker.swiftdata');
    }
  }
  for(const [suffix,priority] of [['PRIMARY',10],['BACKUP',20]]){
    const maskedAccountRef=`${item.route.accountId}-${suffix}`;
    let record=nostros.find((value)=>value.ownLegalEntityId===(item.route.bookingEntity??'HK01')&&value.accountServicerBic===item.route.accountWithBic&&value.currency===item.route.currency&&value.maskedAccountRef===maskedAccountRef&&(value.status==='ACTIVE'||(value.status==='DRAFT'&&value.maker==='maker.swiftdata')));
    if(!record)record=await send('nostro-accounts','POST',{ownLegalEntityId:item.route.bookingEntity??'HK01',allowedBookingEntities:['ANY'],accountServicerBic:item.route.accountWithBic,currency:item.route.currency,maskedAccountRef,accountReference:item.route.accountId,purpose:'SETTLEMENT',priority,validFrom:'2026-01-01',validTo:'2027-12-31',maker:'maker.swiftdata',source:'SYNTHETIC_DEMO'});
    else if(record.accountReference!==item.route.accountId){record=await send(`nostro-accounts/${record.id}/revise`,'POST',{maker:'maker.swiftdata'});record=await send(`nostro-accounts/${record.id}`,'PUT',{ownLegalEntityId:item.route.bookingEntity??'HK01',allowedBookingEntities:['ANY'],accountServicerBic:item.route.accountWithBic,currency:item.route.currency,maskedAccountRef,accountReference:item.route.accountId,purpose:'SETTLEMENT',priority,validFrom:'2026-01-01',validTo:'2027-12-31',maker:'maker.swiftdata',source:'SYNTHETIC_DEMO'});}
    await activate('nostro-accounts',record,'maker.swiftdata','checker.swiftdata');
  }
  rmas=await get('rma-authorisations');nostros=await get('nostro-accounts');
}
const activeRma=rmas.filter((record)=>record.status==='ACTIVE');
const activeNostro=nostros.filter((record)=>record.status==='ACTIVE');
console.log(JSON.stringify({catalogueVersion:catalogue.catalogueVersion,disclaimer:catalogue.disclaimer,activeRma:activeRma.length,activeNostro:activeNostro.length,activeEntities:entities.filter((record)=>record.status==='ACTIVE').length,coveredActiveSsis:activeSsis.length},null,2));
