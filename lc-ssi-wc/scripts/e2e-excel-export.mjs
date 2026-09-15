import { chromium } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory=resolve(process.cwd(),'artifacts');
await mkdir(outputDirectory,{recursive:true});
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
  const page=await browser.newPage({acceptDownloads:true});
  await page.goto(process.env.PORTAL_URL??'http://localhost:4600/',{waitUntil:'networkidle'});
  const resources=[
    {tab:'RMA Authorisation',id:'rma',endpoint:'rma-authorisations'},
    {tab:'SSI',id:'ssi',endpoint:'ssis'},
    {tab:'Nostro Account',id:'nostro',endpoint:'nostro-accounts'},
    {tab:'Entities',id:'entity',endpoint:'booking-branch-entities'},
  ];
  const results=[];
  for(const resource of resources){
    const apiRows=await fetch(`http://localhost:3100/api/${resource.endpoint}`).then((response)=>response.json());const expectedRecords=apiRows.filter((row)=>row.status==='ACTIVE').length;const expectedDrafts=apiRows.filter((row)=>row.status==='DRAFT').length;
    await page.getByRole('button',{name:resource.tab,exact:true}).click();
    await page.locator('.pager').waitFor();
    await page.waitForFunction(()=>document.querySelector('input[value="ACTIVE"]')?.checked===true);
    await page.locator('.pager').filter({hasText:`· ${expectedRecords} records`}).waitFor();
    assert(await page.getByLabel('Active').isChecked(),`${resource.id}: tab entry must reset filter to Active`);
    const firstSort=page.locator('.sort-heading').first();await firstSort.click();
    const pagerText=await page.locator('.pager').innerText();
    if(expectedRecords>0){const firstRow=page.locator('tbody .data-row').first();await firstRow.dblclick();await page.locator('.table-scroll').waitFor({state:'detached'});await page.locator('.pager').waitFor({state:'detached'});await page.getByRole('button',{name:'取消 / Cancel',exact:true}).click();await page.locator('.pager').waitFor();}

    const excelDownloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export Excel',exact:true}).click();
    const excelDownload=await excelDownloadPromise;
    const excelPath=resolve(outputDirectory,`${resource.id}-active-export.xlsx`);await excelDownload.saveAs(excelPath);
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(excelPath);
    const dataSheet=workbook.worksheets[0];
    assert(dataSheet&&dataSheet.rowCount-1===expectedRecords,`${resource.id}: Excel expected ${expectedRecords} records, found ${(dataSheet?.rowCount??1)-1}`);
    assert(workbook.getWorksheet('Export Metadata')!==undefined,`${resource.id}: Excel metadata worksheet missing`);
    if(resource.id==='ssi'){const headers=(dataSheet.getRow(1).values??[]).map(String);assert(headers.includes('Scope'),'ssi: Excel export must retain Scope for audit compatibility');}

    const jsonDownloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export JSON',exact:true}).click();
    const jsonDownload=await jsonDownloadPromise;
    const jsonPath=resolve(outputDirectory,`${resource.id}-active-export.json`);await jsonDownload.saveAs(jsonPath);
    const json=JSON.parse(await readFile(jsonPath,'utf8'));
    assert(json.metadata?.encoding==='UTF-8',`${resource.id}: JSON encoding metadata missing`);
    assert(json.metadata?.exportedRecords===expectedRecords,`${resource.id}: JSON metadata count mismatch`);
    assert(json.metadata?.disclaimer?.includes('Synthetic prototype data'),`${resource.id}: JSON disclaimer missing`);
    assert(Array.isArray(json.records)&&json.records.length===expectedRecords,`${resource.id}: JSON expected ${expectedRecords} records`);
    if(resource.id==='ssi'){assert(json.records.every((row)=>Object.hasOwn(row,'scope')&&row.scope),'ssi: JSON export must retain Scope for audit compatibility');}
    await page.locator('.status-options label',{hasText:'Draft'}).click();await page.locator('.pager').filter({hasText:`· ${expectedDrafts} records`}).waitFor();
    const draftExcelPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export Excel',exact:true}).click();const draftExcel=await draftExcelPromise;const draftExcelPath=resolve(outputDirectory,`${resource.id}-draft-export.xlsx`);await draftExcel.saveAs(draftExcelPath);const draftWorkbook=new ExcelJS.Workbook();await draftWorkbook.xlsx.readFile(draftExcelPath);const draftExcelRows=(draftWorkbook.worksheets[0]?.actualRowCount??1)-1;assert(draftExcelRows===expectedDrafts,`${resource.id}: Draft Excel expected ${expectedDrafts}, found ${draftExcelRows}`);
    const draftJsonPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();const draftJsonDownload=await draftJsonPromise;const draftJsonPath=resolve(outputDirectory,`${resource.id}-draft-export.json`);await draftJsonDownload.saveAs(draftJsonPath);const draftJson=JSON.parse(await readFile(draftJsonPath,'utf8'));assert(draftJson.metadata?.statusFilter==='DRAFT',`${resource.id}: Draft JSON metadata filter mismatch`);assert(draftJson.records?.length===expectedDrafts&&draftJson.records.every((row)=>row.status==='DRAFT'),`${resource.id}: Draft JSON contains non-DRAFT rows`);
    results.push({resource:resource.id,activeRecords:expectedRecords,draftRecords:expectedDrafts,excel:excelDownload.suggestedFilename(),json:jsonDownload.suggestedFilename()});
  }
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'SWIFT Data Service',exact:true}).click();await page.getByRole('button',{name:'Entities',exact:true}).click();await page.locator('.sort-heading').first().click();await page.waitForFunction(()=>document.querySelector('th')?.getAttribute('aria-sort')!=='none');const savedPager=await page.locator('.pager').innerText();const savedSort=await page.locator('th').first().getAttribute('aria-sort');const activeRow=page.locator('tbody .data-row').first();await activeRow.getByRole('button',{name:'修訂',exact:true}).click();await page.locator('.table-scroll').waitFor({state:'detached'});await page.locator('.pager').waitFor({state:'detached'});await page.getByRole('button',{name:'取消 / Cancel',exact:true}).click();assert(await page.getByLabel('Active').isChecked(),'entity: Cancel must restore status filter');assert(await page.locator('.pager').innerText()===savedPager,'entity: Cancel must restore index page');assert(await page.locator('th').first().getAttribute('aria-sort')===savedSort,'entity: Cancel must restore sort');
  console.log(JSON.stringify({exports:'PASS',results},null,2));
}finally{await browser.close();}
