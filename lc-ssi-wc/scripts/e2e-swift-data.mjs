import { chromium } from '@playwright/test';

const api='http://localhost:3100/api';
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const [rmas,nostros,currencies,ssis]=await Promise.all([fetch(`${api}/rma-authorisations`).then((r)=>r.json()),fetch(`${api}/nostro-accounts`).then((r)=>r.json()),fetch(`${api}/reference/currencies`).then((r)=>r.json()),fetch(`${api}/ssis`).then((r)=>r.json())]);
assert(rmas.filter((row)=>row.status==='ACTIVE').length===40,'Expected 40 ACTIVE RMA records');
assert(nostros.filter((row)=>row.status==='ACTIVE').length===20,'Expected 20 ACTIVE Nostro records');
for(const currency of currencies){const count=ssis.filter((row)=>row.status==='ACTIVE'&&row.route?.currency===currency.code).length;assert(count>=2&&count<=5,`Expected 2-5 ACTIVE SSI records for ${currency.code}, found ${count}`);}
const rma=await fetch(`${api}/rma-authorisations/check`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ownBic:'DEMOHKHH',counterpartyBic:'CHASUS33',service:'FIN',direction:'OUTBOUND',messageType:'MT300'})}).then((r)=>r.json());
assert(rma.authorised===true,'MT300 RMA should be authorised');
const nostro=await fetch(`${api}/nostro-accounts/resolve`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountServicerBic:'CHASUS33',currency:'CAD',purpose:'SETTLEMENT'})}).then((r)=>r.json());
assert(nostro.decision==='RESOLVED'&&nostro.maskedAccountRef.endsWith('PRIMARY'),'Nostro primary resolution failed');

const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  await page.goto('http://localhost:4400/',{waitUntil:'networkidle'});
  const navigation=await page.locator('aside nav button').allTextContents();
  assert(navigation[0]?.trim()==='SWIFT Data Service','SWIFT Data Service should be the first navigation item');
  assert(navigation.map((item)=>item.replace(/\s+\d+$/,'').trim()).join('|')==='SWIFT Data Service|Checker 審批|SSI Resolution|MT／MX Tag Lab|稽核與事件','Unexpected primary navigation order');
  await page.getByRole('button',{name:'SSI Resolution'}).click();
  await page.locator('.task-panel select').nth(2).selectOption('HKD');
  const hkdSsi=page.locator('.task-panel select').nth(1);
  const hkdOptions=await hkdSsi.locator('option').count();
  assert(hkdOptions>=2&&hkdOptions<=5,'Expected 2-5 selectable HKD SSI records, found '+hkdOptions);
  const initialHkdSsi=await hkdSsi.inputValue();
  const alternateHkdSsi=await hkdSsi.locator('option').nth(1).getAttribute('value');
  if(alternateHkdSsi&&alternateHkdSsi!==initialHkdSsi)await hkdSsi.selectOption(alternateHkdSsi);
  assert(await hkdSsi.inputValue()!==initialHkdSsi,'Expected Active SSI selection to change');
  await page.getByRole('button',{name:'SWIFT Data Service'}).click();
  await page.getByText('OAS → SCREEN PARAMETERS → REUSABLE CRUD').waitFor();
  const resourceTabs=await page.locator('.resource-tabs button').allTextContents();
  assert(resourceTabs.map((item)=>item.trim()).join('|')==='RMA Authorisation|SSI|Nostro Account','Expected RMA, SSI, Nostro tabs');
  await page.locator('.theme-picker select').selectOption('dark');
  const inactiveTabStyle=await page.getByRole('button',{name:'SSI',exact:true}).evaluate((element)=>{const style=getComputedStyle(element);return{color:style.color,background:style.backgroundColor};});
  assert(inactiveTabStyle.color!==inactiveTabStyle.background,'Dark theme inactive resource tab has insufficient visible contrast');
  await page.locator('.theme-picker select').selectOption('system');
  await page.getByText('DEMOHKHH').first().waitFor();
  await page.getByRole('button',{name:'SSI',exact:true}).click();
  await page.getByText('BANK-CITI-US').first().waitFor();
  const currencyHeading=page.getByRole('button',{name:/Currency/}).first();
  await currencyHeading.click();
  assert(await currencyHeading.locator('xpath=..').getAttribute('aria-sort')==='ascending','Currency heading should sort ascending on first click');
  assert(await page.locator('.toolbar .upload-button').count()===2,'SSI should expose Dry-run JSON and Import JSON');
  await page.getByRole('button',{name:'Nostro Account'}).click();
  await page.getByText('DEMO-NOSTRO-001-PRIMARY').waitFor();
  await page.getByRole('button',{name:'MT／MX Tag Lab'}).click();
  await page.locator('.selection-flow select').nth(0).selectOption('TREASURY');
  await page.locator('.selection-flow select').nth(1).selectOption('TREASURY_FX');
  await page.locator('input[name="tagDirection"][value="OUTGOING"]').check();
  await page.locator('.catalog-grid button').filter({hasText:'MT300'}).click();
  await page.getByRole('button',{name:'取消 / Cancel'}).waitFor();
  await page.getByRole('button',{name:/由所選 Active SSI 生成 Tags/}).click();
  await page.getByText('AUTHORISED').waitFor();
  await page.getByText('RESOLVED').waitFor();
  const generated=await page.locator('.generated-fields').innerText();
  for(const tag of ['B1.53A','B1.56A','B1.57A','B1.58A'])assert(generated.includes(tag),`Missing generated ${tag}`);
  console.log(JSON.stringify({ui:'PASS',activeRma:40,activeNostro:20,rma:rma.decision,nostro:nostro.decision,tags:['B1.53A','B1.56A','B1.57A','B1.58A']},null,2));
}finally{await browser.close();}
