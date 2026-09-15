import { chromium } from '@playwright/test';
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const page=await browser.newPage();await page.goto(process.env.PORTAL_URL??'http://localhost:4600/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'SSI Resolution',exact:true}).click();
  const country=page.getByLabel('Settlement Country（advanced optional override）');const clearing=page.getByLabel('Clearing System（advanced optional override）');const currency=page.getByLabel('Currency (ISO 4217)');
  assert(await country.inputValue()===''&&await clearing.inputValue()==='','Overrides must default to Derive from eligible route');
  const countryOptions=await country.locator('option').allTextContents();assert(countryOptions[0]?.includes('Derive from eligible route')&&countryOptions.some((value)=>value.includes('US · United States')),'Country dropdown must use Country Standing Data');
  await currency.selectOption('USD');await page.waitForFunction(()=>[...document.querySelectorAll('select')].some((select)=>select.labels?.[0]?.textContent?.includes('Clearing System')&&[...select.options].some((option)=>option.value==='FEDWIRE')));await clearing.selectOption('FEDWIRE');
  await country.selectOption('');await currency.selectOption('GBP');await page.waitForFunction(()=>[...document.querySelectorAll('select')].some((select)=>select.labels?.[0]?.textContent?.includes('Clearing System')&&select.value===''));assert(await clearing.inputValue()==='','Currency change must clear an incompatible clearing override');
  const gbOptions=await clearing.locator('option').allTextContents();assert(gbOptions.some((value)=>value.includes('CHAPS'))&&!gbOptions.some((value)=>value.includes('FEDWIRE')),'Clearing options must be filtered by Currency');
  await currency.selectOption('USD');await country.selectOption('US');await clearing.selectOption('FEDWIRE');await page.getByRole('button',{name:'2. Preview Resolution',exact:true}).click();await page.locator('.decision-pass').waitFor();const resolved=await page.locator('.decision-pass').innerText();assert(/RESOLVED|MULTIPLE_CANDIDATES/.test(resolved),'Selected compatible overrides should resolve');
  await country.selectOption('GB');await page.getByRole('button',{name:'2. Preview Resolution',exact:true}).click();await page.locator('.decision-fail').waitFor();assert((await page.locator('.decision-fail').innerText()).includes('NO_ELIGIBLE_ROUTE'),'Incompatible selected override must return NO_ELIGIBLE_ROUTE');
  console.log(JSON.stringify({resolutionOverrides:'PASS',defaultMode:'DERIVE',countries:countryOptions.length-1,usdClearing:'FEDWIRE',gbClearing:'CHAPS',compatibleDecision:resolved,incompatibleDecision:'NO_ELIGIBLE_ROUTE'},null,2));
}finally{await browser.close();}
