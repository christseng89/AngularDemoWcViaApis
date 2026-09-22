/** Maintenance-only cleanup helpers. Business code never disables immutable-ledger triggers. */
export function suspendImmutableTriggers(db) {
  const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'immutable_%' ORDER BY name").all();
  for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name}"`);
  return triggers.map(({ sql }) => sql).filter(Boolean);
}

export function restoreImmutableTriggers(db, triggerSql) {
  for (const sql of triggerSql) db.exec(sql);
}

export function deleteAllExcessFacts(db) {
  db.exec(`
    DELETE FROM excess_allocations;
    DELETE FROM fx_rate_snapshots;
    DELETE FROM sg_capacity_events;
    DELETE FROM excess_ledger_events;
    DELETE FROM command_idempotency;
    DELETE FROM excess_accounts;
  `);
}

export function deleteExcessFactsForContracts(db, contractIds, logicalContractIds) {
  const contractPlaceholders = contractIds.map(() => '?').join(',');
  const logicalPlaceholders = logicalContractIds.map(() => '?').join(',');
  const movementIds = db
    .prepare(`SELECT movement_id FROM balance_movements WHERE balance_contract_id IN (${contractPlaceholders})`)
    .all(...contractIds)
    .map(({ movement_id }) => movement_id);
  const accountIds = db
    .prepare(`SELECT excess_account_id FROM excess_accounts WHERE owner_id IN (${logicalPlaceholders})`)
    .all(...logicalContractIds)
    .map(({ excess_account_id }) => excess_account_id);

  if (accountIds.length > 0) {
    const accountPlaceholders = accountIds.map(() => '?').join(',');
    const eventIds = db
      .prepare(`SELECT excess_event_id FROM excess_ledger_events WHERE excess_account_id IN (${accountPlaceholders})`)
      .all(...accountIds)
      .map(({ excess_event_id }) => excess_event_id);
    if (eventIds.length > 0) {
      const eventPlaceholders = eventIds.map(() => '?').join(',');
      db.prepare(
        `DELETE FROM excess_allocations
         WHERE adjustment_event_id IN (${eventPlaceholders}) OR approved_excess_event_id IN (${eventPlaceholders})`,
      ).run(...eventIds, ...eventIds);
    }
    db.prepare(`DELETE FROM excess_ledger_events WHERE excess_account_id IN (${accountPlaceholders})`).run(...accountIds);
    db.prepare(`DELETE FROM excess_accounts WHERE excess_account_id IN (${accountPlaceholders})`).run(...accountIds);
  }

  if (movementIds.length > 0) {
    const movementPlaceholders = movementIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM fx_rate_snapshots WHERE movement_id IN (${movementPlaceholders})`).run(...movementIds);
    db.prepare(`DELETE FROM sg_capacity_events WHERE source_movement_id IN (${movementPlaceholders})`).run(...movementIds);
  }
  db.prepare(`DELETE FROM sg_capacity_events WHERE sg_balance_contract_id IN (${contractPlaceholders})`).run(...contractIds);
  db.prepare(`DELETE FROM command_idempotency WHERE owner_id IN (${logicalPlaceholders})`).run(...logicalContractIds);
}
