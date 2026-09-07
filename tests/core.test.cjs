const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");
const base = {
  id: "old-id",
  brand: "旧记录",
  volume: 330,
  alcohol: 5,
  unit: "ml",
  date: "2026-09-07",
  timestamp: 1,
};
function storage(initial) {
  const data = new Map(initial === undefined ? [] : [[C.DRINKS_KEY, initial]]);
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}
test("converts millilitres and US fluid ounces to UK units", () => {
  assert.equal(C.pureAlcohol(base) / 10, 1.65);
  assert.equal(
    C.pureAlcohol({ ...base, alcohol: 40, volume: 1, unit: "oz" }),
    11.8294,
  );
  assert.equal(C.pureAlcohol({ ...base, alcohol: 0 }), 0);
});
test("rolling seven days includes today and day -6, excludes day -7 and future dates", () => {
  const dates = [
    "2026-08-31",
    "2026-09-01",
    "2026-09-06",
    "2026-09-07",
    "2026-09-08",
  ];
  const records = dates.map((date) => ({ ...base, date }));
  assert.deepEqual(
    C.recent(records, 7, "2026-09-07").map((r) => r.date),
    dates.slice(1, 4),
  );
  assert.equal(C.recent(records, 1, "2026-09-07").length, 1);
  assert.equal(C.recent(records, 3, "2026-09-07").length, 2);
});
test("uses calendar days across leap days, year boundaries and daylight saving changes", () => {
  assert.equal(C.offsetDate("2024-03-01", -1), "2024-02-29");
  assert.equal(C.offsetDate("2026-01-01", -1), "2025-12-31");
  assert.equal(C.offsetDate("2026-03-09", -1), "2026-03-08");
  assert.equal(C.offsetDate("2026-11-02", -1), "2026-11-01");
  assert.equal(C.parseDate("2026-02-29"), null);
  assert.equal(C.parseDate("2026-02-30"), null);
  assert.equal(C.parseDate("2026-13-01"), null);
});
test("rejects blank, null, non-finite and invalid numeric fields without rejecting zero ABV", () => {
  for (const value of ["", null, false, NaN, Infinity, -1, 101])
    assert.equal(C.validRecord({ ...base, alcohol: value }), false);
  for (const value of ["", null, false, 0, -1, Infinity])
    assert.equal(C.validRecord({ ...base, volume: value }), false);
  assert.equal(C.validRecord({ ...base, alcohol: "0" }), true);
  assert.equal(C.validRecord({ ...base, unit: "litres" }), false);
});
test("reads and updates the original v2 records without changing storage keys", () => {
  const original = {
    ...base,
    volume: "330",
    alcohol: "5",
    customField: "retained",
  };
  const store = storage(JSON.stringify([original]));
  const read = C.readRecords(store);
  assert.equal(C.DRINKS_KEY, "alcohol_monitor_drinks_v2");
  assert.equal(read[0].id, "old-id");
  assert.equal(read[0].volume, 330);
  C.writeRecords(store, read);
  assert.equal(
    JSON.parse(store.getItem(C.DRINKS_KEY))[0].customField,
    "retained",
  );
});
test("corrupt JSON and malformed records are not silently erased", () => {
  for (const raw of ["{broken", "{}", JSON.stringify([base, { bad: true }])]) {
    const store = storage(raw);
    assert.throws(() => C.readRecords(store), /原始数据/);
    assert.equal(store.getItem(C.DRINKS_KEY), raw);
  }
});
test("missing or duplicate legacy IDs become distinct and stable without a write on read", () => {
  const original = JSON.stringify([base, base, { ...base, id: undefined }]);
  const store = storage(original);
  const first = C.readRecords(store);
  assert.equal(new Set(first.map((r) => r.id)).size, 3);
  assert.deepEqual(first, C.readRecords(store));
  assert.equal(store.getItem(C.DRINKS_KEY), original);
});
test("backdated entries sort by drinking date before creation timestamp", () => {
  const lateEntry = { ...base, date: "2026-08-31", timestamp: 999 };
  assert.equal(C.sorted([lateEntry, base])[0].date, "2026-09-07");
});
test("failed writes surface to callers and preserve existing data", () => {
  const store = storage(JSON.stringify([base]));
  const before = store.getItem(C.DRINKS_KEY);
  store.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  assert.throws(() => C.writeRecords(store, []), /QuotaExceededError/);
  assert.equal(store.getItem(C.DRINKS_KEY), before);
});
