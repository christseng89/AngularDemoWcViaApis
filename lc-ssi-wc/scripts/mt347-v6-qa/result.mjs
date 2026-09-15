export const Status = Object.freeze({
  BLOCKED: "BLOCKED",
  FAIL: "FAIL",
  NOT_EXECUTED: "NOT_EXECUTED",
  PASS: "PASS",
});

export const result = (gate, status, evidence = {}, reason) => ({
  gate,
  status,
  ...(reason ? { reason } : {}),
  evidence,
});

export const summarize = (results) => {
  const counts = Object.fromEntries(
    Object.values(Status).map((status) => [
      status,
      results.filter((item) => item.status === status).length,
    ]),
  );
  const status = results.every((item) => item.status === Status.PASS)
    ? Status.PASS
    : Status.BLOCKED;
  return { status, counts, results };
};
