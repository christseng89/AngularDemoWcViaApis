import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BALANCE_API = process.env['PLAYWRIGHT_BALANCE_API'] ?? 'http://localhost:4100';

async function routeToServices(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const source = new URL(route.request().url());
    await route.continue({ url: `http://localhost:4300${source.pathname}${source.search}` });
  });
  await page.route('**/balance-component/**', async (route) => {
    const source = new URL(route.request().url());
    await route.continue({ url: `${BALANCE_API}${source.pathname.replace('/balance-component', '')}${source.search}` });
  });
}

async function selectFunction(page: Page, side: 'Import LC' | 'Export Confirmed', code: string): Promise<void> {
  await page.getByRole('button', { name: side, exact: true }).click();
  const chip = page.locator('.tb-function-chip').filter({
    has: page.locator('.tb-function-chip__code', { hasText: new RegExp(`^${code}$`) }),
  });
  await chip.click();
  await expect(chip).toHaveClass(/tb-function-chip--active/);
}

async function release(request: APIRequestContext, movementId: string): Promise<void> {
  const response = await request.post(`${BALANCE_API}/balance-movements/${movementId}/release`, {
    headers: { 'Idempotency-Key': `live-release-${movementId}` },
    data: { releasedBy: 'checker1' },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function createAndRelease(request: APIRequestContext, data: Record<string, unknown>): Promise<any> {
  const created = await request.post(`${BALANCE_API}/balance-movements`, { data });
  expect(created.ok(), await created.text()).toBe(true);
  const body = await created.json();
  await release(request, body.movementId);
  return body;
}

async function logicalContractId(request: APIRequestContext, balanceContractId: string): Promise<string> {
  const response = await request.get(`${BALANCE_API}/balance-contracts/${balanceContractId}`);
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).logicalContractId as string;
}

async function waitForMovementSubmit(page: Page, action: () => Promise<void>): Promise<any> {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/balance-movements'),
  );
  await action();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function assertMakerResult(panel: ReturnType<Page['locator']>, displayStatus: 'EARMARKING' | 'PENDING'): Promise<void> {
  await expect(panel.getByRole('heading', { name: 'Maker Result' })).toBeVisible();
  await expect(panel.getByText(`Status: ${displayStatus}`, { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Account Entries' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Fix Pending' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Delete Pending' })).toBeVisible();
}

async function pickLc(panel: ReturnType<Page['locator']>, lcNumber: string): Promise<void> {
  const picker = panel.locator('app-index-picker:has(input)').first();
  await picker.locator('input').fill(lcNumber);
  await picker.getByRole('button', { name: 'Search' }).click();
  const row = picker.locator('.index-picker__row').filter({ hasText: lcNumber }).first();
  await expect(row).toBeVisible();
  await row.click();
}

test('real UI: A1 -> A3 OD, A1/A8 -> A3S OD, and B1 -> B3 OD all retain Maker Result actions', async ({ page, request }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await routeToServices(page);
  await page.goto('/transaction-builder');
  await expect(page.getByRole('heading', { name: 'Balance Component — Transaction Builder' })).toBeVisible();
  const panel = page.locator('app-maker-panel');
  const suffix = `${Date.now()}`;

  // Create/release the prerequisite through the public API; the reported OD transaction itself is
  // deliberately driven through the real browser from Index selection through Maker Result.
  const a3Lc = `UI-A3-${suffix}`;
  await createAndRelease(request, {
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: a3Lc },
    movementType: 'ISSUE',
    eventSeq: Date.now(),
    amount: '10000',
    currency: 'USD',
    tenorType: 'SIGHT',
    expiryDate: '2028-12-29',
    createdBy: 'maker1',
  });

  await selectFunction(page, 'Import LC', 'A3');
  await pickLc(panel, a3Lc);
  await panel.getByRole('textbox', { name: /^IB Number/ }).fill('B01');
  await panel.getByRole('textbox', { name: /^Amount/ }).fill('10200');
  await expect(panel.getByText(/This Exceed Amount/).locator('..')).toContainText('200.00 USD');
  const a3 = await waitForMovementSubmit(page, () => panel.getByRole('button', { name: 'Submit A3' }).click());
  expect(a3).toMatchObject({ status: 'PENDING', movementType: 'UTILIZE', amount: '10200' });
  expect(a3.contingentAccountEntry).toBeTruthy();
  await assertMakerResult(panel, 'EARMARKING');

  // A3S uses a separate released A1 + A8 prerequisite, then the actual OD Submit is browser-driven.
  const a3sLc = `UI-A3S-${suffix}`;
  const lc = await createAndRelease(request, {
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: a3sLc },
    movementType: 'ISSUE',
    eventSeq: Date.now() + 1,
    amount: '1000',
    currency: 'USD',
    tenorType: 'SIGHT',
    expiryDate: '2028-12-29',
    createdBy: 'maker1',
  });
  const lcContractResponse = await request.get(`${BALANCE_API}/balance-contracts/${lc.balanceContractId}`);
  expect(lcContractResponse.ok(), await lcContractResponse.text()).toBe(true);
  const lcContract = await lcContractResponse.json();
  await createAndRelease(request, {
    instrumentType: 'SHGT',
    naturalKey: { lcNumber: a3sLc, sgNumber: 'G01' },
    parentLogicalContractId: lcContract.logicalContractId,
    movementType: 'ISSUE',
    eventSeq: Date.now() + 2,
    amount: '1000',
    currency: 'USD',
    createdBy: 'maker1',
  });

  await selectFunction(page, 'Import LC', 'A3S');
  await pickLc(panel, a3sLc);
  await panel.getByRole('textbox', { name: /^IB Number/ }).fill('B02');
  await panel.getByRole('textbox', { name: /^Bill Amount/ }).fill('1100');
  await expect(panel.getByText(/This Exceed Amount/).locator('..')).toContainText('100.00 USD');
  await panel.getByRole('button', { name: 'Submit A3S' }).click();
  await assertMakerResult(panel, 'EARMARKING');

  // B1 prerequisite is API-created to keep the UI acceptance focused on B3's reported result regression.
  const b3Lc = `UI-B3-${suffix}`;
  await createAndRelease(request, {
    instrumentType: 'EPLC_CONFIRMATION',
    naturalKey: { lcNumber: b3Lc },
    movementType: 'ISSUE',
    eventSeq: Date.now() + 3,
    amount: '10000',
    currency: 'USD',
    tenorType: 'SIGHT',
    expiryDate: '2028-12-29',
    createdBy: 'maker1',
  });

  await selectFunction(page, 'Export Confirmed', 'B3');
  await pickLc(panel, b3Lc);
  await panel.locator('#maker-ib-number').fill('E01');
  await panel.getByRole('textbox', { name: /^Amount/ }).fill('10200');
  await expect(panel.getByText(/This Exceed Amount/).locator('..')).toContainText('200.00 USD');
  const b3 = await waitForMovementSubmit(page, () => panel.getByRole('button', { name: 'Submit B3' }).click());
  expect(b3).toMatchObject({ status: 'PENDING', movementType: 'CREATE', amount: '10200' });
  expect(b3.contingentAccountEntry).toBeTruthy();
  await assertMakerResult(panel, 'EARMARKING');

  expect(browserErrors).toEqual([]);
});

test('real UI: A4 waiver warning follows selected event This Exceed, not the LC aggregate', async ({ page, request }) => {
  const suffix = `${Date.now()}`;
  const lcNumber = `UI-A4-WAIVER-${suffix}`;
  const issue = await createAndRelease(request, {
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: Date.now(),
    amount: '1000',
    currency: 'USD',
    tenorType: 'SIGHT',
    expiryDate: '2028-12-29',
    createdBy: 'maker1',
  });

  const submitArrival = async (reference: 'B01' | 'B02', amount: '500' | '600', eventSeq: number) => {
    const created = await request.post(`${BALANCE_API}/balance-movements`, {
      headers: { 'Idempotency-Key': `ui-a4-${reference}-${suffix}` },
      data: {
        instrumentType: 'IPLC_LC',
        balanceContractId: issue.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq,
        amount,
        currency: 'USD',
        sourceTransactionRef: reference,
        createdBy: 'maker1',
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const movement = await created.json();
    const acknowledged = await request.post(`${BALANCE_API}/balance-movements/${movement.movementId}/acknowledge`, {
      headers: { 'Idempotency-Key': `ui-a4-${reference}-ack-${suffix}` },
      data: { acknowledgedBy: 'checker1' },
    });
    expect(acknowledged.ok(), await acknowledged.text()).toBe(true);
    const makerSubmitted = await request.post(`${BALANCE_API}/balance-movements/${movement.movementId}/maker-submit`, {
      data: { makerSubmittedBy: 'maker1' },
    });
    expect(makerSubmitted.ok(), await makerSubmitted.text()).toBe(true);
    return movement;
  };

  await submitArrival('B01', '500', Date.now() + 1);
  await submitArrival('B02', '600', Date.now() + 2);

  await routeToServices(page);
  await page.goto('/transaction-builder');
  await selectFunction(page, 'Import LC', 'A4');
  const checker = page.locator('app-checker-panel');
  await checker.locator('#checkerLcNumber').fill(lcNumber);
  await checker.getByRole('button', { name: 'Search' }).click();

  const b01 = checker.locator('.index-picker__row').filter({ hasText: 'B01' });
  const b02 = checker.locator('.index-picker__row').filter({ hasText: 'B02' });
  await expect(b01).toBeVisible();
  await expect(b02).toBeVisible();

  await b01.click();
  await expect(page.getByRole('group', { name: 'Excess Review' })).toHaveCount(0);

  await b02.click();
  const waiver = page.getByRole('group', { name: 'Excess Review' });
  await expect(waiver).toBeVisible();
  await expect(waiver).toContainText('This Exceed Amount:');
  await expect(waiver).toContainText('100.00 USD');
  await expect(waiver).toContainText('Checker Approve');
  await expect(waiver).not.toContainText('Applicant Waiver');
  await expect(page.getByRole('button', { name: 'Release', exact: true })).toBeDisabled();
  const waiverBox = await waiver.boundingBox();
  const a6CheckerIdBox = await page.locator('#checker-id').boundingBox();
  expect(waiverBox).not.toBeNull();
  expect(a6CheckerIdBox).not.toBeNull();
  expect(waiverBox!.y + waiverBox!.height).toBeLessThanOrEqual(a6CheckerIdBox!.y);
  await waiver.getByRole('checkbox', { name: 'Checker Approve' }).check();
  await expect(page.getByRole('button', { name: 'Release', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Release', exact: true }).click();
  await expect(page.getByText(/Release completed \(movement/)).toBeVisible();
});

test('real UI: A6 and B4 warnings follow B01/B02 event Excess, not contract aggregate', async ({ page, request }) => {
  const suffix = `${Date.now()}`;

  const usanceLc = `UI-A6-WAIVER-${suffix}`;
  const usanceIssue = await createAndRelease(request, {
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: usanceLc },
    movementType: 'ISSUE',
    eventSeq: Date.now(),
    amount: '1000',
    currency: 'USD',
    tenorType: 'SELLERS_USANCE',
    tenorDays: 30,
    expiryDate: '2028-12-29',
    createdBy: 'maker1',
  });
  const usanceParentLogicalId = await logicalContractId(request, usanceIssue.balanceContractId);

  const createArrivalAndAcceptance = async (reference: 'B01' | 'B02', amount: '500' | '600', eventSeq: number) => {
    const arrivalResponse = await request.post(`${BALANCE_API}/balance-movements`, {
      headers: { 'Idempotency-Key': `ui-a6-${reference}-${suffix}` },
      data: {
        instrumentType: 'IPLC_LC',
        balanceContractId: usanceIssue.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq,
        amount,
        currency: 'USD',
        sourceTransactionRef: reference,
        createdBy: 'maker1',
      },
    });
    expect(arrivalResponse.ok(), await arrivalResponse.text()).toBe(true);
    const arrival = await arrivalResponse.json();
    const acknowledged = await request.post(`${BALANCE_API}/balance-movements/${arrival.movementId}/acknowledge`, {
      headers: { 'Idempotency-Key': `ui-a6-${reference}-ack-${suffix}` },
      data: { acknowledgedBy: 'checker1' },
    });
    expect(acknowledged.ok(), await acknowledged.text()).toBe(true);

    const acceptanceResponse = await request.post(`${BALANCE_API}/balance-movements`, {
      data: {
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: usanceLc, ibNumber: reference },
        parentLogicalContractId: usanceParentLogicalId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount,
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 30,
        referencedTransactionId: arrival.movementId,
        createdBy: 'maker1',
      },
    });
    expect(acceptanceResponse.ok(), await acceptanceResponse.text()).toBe(true);
    await acceptanceResponse.json();
  };

  await createArrivalAndAcceptance('B01', '500', Date.now() + 1);
  await createArrivalAndAcceptance('B02', '600', Date.now() + 2);

  await routeToServices(page);
  await page.goto('/transaction-builder');
  await selectFunction(page, 'Import LC', 'A6');
  const checker = page.locator('app-checker-panel');
  await checker.locator('#checkerLcNumber').fill(usanceLc);
  await checker.locator('#checkerSecondaryRef').fill('B01');
  await checker.getByRole('button', { name: 'Search' }).click();
  await checker.locator('.index-picker__row').first().click();
  await expect(page.getByRole('group', { name: 'Excess Review' })).toHaveCount(0);

  await checker.locator('#checkerSecondaryRef').fill('B02');
  await checker.getByRole('button', { name: 'Search' }).click();
  await checker.locator('.index-picker__row').first().click();
  const waiver = page.getByRole('group', { name: 'Excess Review' });
  await expect(waiver).toBeVisible();
  await expect(waiver).toContainText('This Exceed Amount:');
  await expect(waiver).toContainText('100.00 USD');
  await expect(waiver).toContainText('Checker Approve');
  await expect(waiver).not.toContainText('Applicant Waiver');
  await expect(page.getByRole('button', { name: 'Release', exact: true })).toBeDisabled();
  const a6ReviewText = (await waiver.innerText()).replace(/\s+/g, ' ').trim();
  await waiver.getByRole('checkbox', { name: 'Checker Approve' }).check();
  await expect(page.getByRole('button', { name: 'Release', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Release', exact: true }).click();
  await expect(page.getByText(/Release completed \(movement/)).toBeVisible();

  const exportLc = `UI-B4-AUTH-${suffix}`;
  const confirmation = await createAndRelease(request, {
    instrumentType: 'EPLC_CONFIRMATION',
    naturalKey: { lcNumber: exportLc },
    movementType: 'ISSUE',
    eventSeq: Date.now() + 3,
    amount: '1000',
    currency: 'USD',
    tenorType: 'SIGHT',
    expiryDate: '2028-12-29',
    createdBy: 'maker1',
  });
  const confirmationLogicalId = await logicalContractId(request, confirmation.balanceContractId);

  const createPresentation = async (reference: 'B01' | 'B02', amount: '500' | '600') => {
    const presentationResponse = await request.post(`${BALANCE_API}/balance-movements`, {
      headers: { 'Idempotency-Key': `ui-b4-${reference}-${suffix}` },
      data: {
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: exportLc, ibNumber: reference },
        parentLogicalContractId: confirmationLogicalId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount,
        currency: 'USD',
        createdBy: 'maker1',
      },
    });
    expect(presentationResponse.ok(), await presentationResponse.text()).toBe(true);
    const presentation = await presentationResponse.json();
    await release(request, presentation.movementId);
    return presentation;
  };

  const createHonour = async (presentation: { movementId: string }, reference: 'B01' | 'B02', amount: '500' | '600', eventSeq: number) => {
    const honourResponse = await request.post(`${BALANCE_API}/balance-movements`, {
      data: {
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: confirmation.balanceContractId,
        movementType: 'HONOUR',
        eventSeq,
        amount,
        currency: 'USD',
        sourceTransactionRef: reference,
        referencedTransactionId: presentation.movementId,
        createdBy: 'maker1',
      },
    });
    expect(honourResponse.ok(), await honourResponse.text()).toBe(true);
    await honourResponse.json();
  };

  const exportB01Presentation = await createPresentation('B01', '500');
  const exportB02Presentation = await createPresentation('B02', '600');
  await createHonour(exportB01Presentation, 'B01', '500', Date.now() + 4);
  await createHonour(exportB02Presentation, 'B02', '600', Date.now() + 5);

  await selectFunction(page, 'Export Confirmed', 'B4');
  await checker.locator('#checkerLcNumber').fill(exportLc);
  await checker.getByRole('button', { name: 'Search' }).click();
  const exportB01 = checker.locator('.index-picker__row').filter({ hasText: 'B01' });
  const exportB02 = checker.locator('.index-picker__row').filter({ hasText: 'B02' });
  await exportB01.click();
  await expect(page.getByRole('group', { name: 'Excess Review' })).toHaveCount(0);

  await exportB02.click();
  const authorization = page.getByRole('group', { name: 'Excess Review' });
  await expect(authorization).toBeVisible();
  await expect(authorization).toContainText('This Exceed Amount:');
  await expect(authorization).toContainText('100.00 USD');
  await expect(authorization).toContainText('Checker Approve');
  await expect(authorization).not.toContainText('Export Authorization Claim');
  await expect(authorization).not.toContainText('Authorization status');
  expect((await authorization.innerText()).replace(/\s+/g, ' ').trim()).toBe(a6ReviewText);
  const authorizationBox = await authorization.boundingBox();
  const b4CheckerIdBox = await page.locator('#checker-id').boundingBox();
  expect(authorizationBox).not.toBeNull();
  expect(b4CheckerIdBox).not.toBeNull();
  expect(authorizationBox!.y + authorizationBox!.height).toBeLessThanOrEqual(b4CheckerIdBox!.y);

  await expect(page.getByRole('button', { name: 'Release', exact: true })).toBeDisabled();
  await authorization.getByRole('checkbox', { name: 'Checker Approve' }).check();
  await expect(page.getByRole('button', { name: 'Release', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Release', exact: true }).click();
  await expect(page.getByText(/Release completed \(movement/)).toBeVisible();
  await expect(page.locator('section[aria-label="B4 Authorization and Export Asset Inquiry"]')).toHaveCount(0);
});
