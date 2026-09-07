/* Shared calculation and storage logic. No network or browser dependency. */
(function (root) {
  "use strict";
  const DRINKS_KEY = "alcohol_monitor_drinks_v2";
  const BRANDS_KEY = "alcohol_monitor_brands_v2";
  const ML_PER_OZ = 29.5735;
  function localDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return null;
    const [y, m, d] = value.split("-").map(Number);
    const result = new Date(0);
    result.setFullYear(y, m - 1, d);
    result.setHours(12, 0, 0, 0);
    return result.getFullYear() === y &&
      result.getMonth() === m - 1 &&
      result.getDate() === d
      ? result
      : null;
  }
  function offsetDate(value, days) {
    const date = parseDate(value);
    if (!date) throw new Error("日期无效");
    date.setDate(date.getDate() + days);
    return localDate(date);
  }
  function numeric(value) {
    return (
      (typeof value === "number" ||
        (typeof value === "string" && value.trim() !== "")) &&
      Number.isFinite(Number(value))
    );
  }
  function validRecord(record) {
    return Boolean(
      record &&
      numeric(record.alcohol) &&
      Number(record.alcohol) >= 0 &&
      Number(record.alcohol) <= 100 &&
      numeric(record.volume) &&
      Number(record.volume) > 0 &&
      Number.isFinite(pureAlcohol(record)) &&
      (record.unit === "ml" || record.unit === "oz") &&
      parseDate(record.date) &&
      (record.brand == null || typeof record.brand === "string"),
    );
  }
  function pureAlcohol(record) {
    return (
      (Number(record.volume) *
        (record.unit === "oz" ? ML_PER_OZ : 1) *
        Number(record.alcohol)) /
      100
    );
  }
  function total(records) {
    return records.reduce((sum, record) => sum + pureAlcohol(record), 0);
  }
  function recent(records, days, today = localDate()) {
    const first = offsetDate(today, -(days - 1));
    return records.filter(
      (record) => record.date >= first && record.date <= today,
    );
  }
  function sorted(records) {
    return [...records].sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0),
    );
  }
  function readRecords(storage) {
    const raw = storage.getItem(DRINKS_KEY);
    if (raw === null) return [];
    let records;
    try {
      records = JSON.parse(raw);
    } catch {
      throw new Error("饮酒记录无法读取。原始数据已保留，请勿清除浏览器数据。");
    }
    if (!Array.isArray(records) || !records.every(validRecord)) {
      throw new Error("饮酒记录格式异常。原始数据已保留，请勿清除浏览器数据。");
    }
    const ids = new Set();
    return records.map((record, index) => {
      let id =
        typeof record.id === "string" && record.id
          ? record.id
          : `legacy-${index}`;
      while (ids.has(id)) id = `${id}-${index}`;
      ids.add(id);
      return {
        ...record,
        id,
        brand: record.brand || "",
        alcohol: Number(record.alcohol),
        volume: Number(record.volume),
      };
    });
  }
  function writeRecords(storage, records) {
    if (
      !Array.isArray(records) ||
      !records.every(validRecord) ||
      !Number.isFinite(total(records))
    )
      throw new Error("记录数据无效，未保存。");
    storage.setItem(DRINKS_KEY, JSON.stringify(records));
  }
  const api = {
    DRINKS_KEY,
    BRANDS_KEY,
    ML_PER_OZ,
    localDate,
    parseDate,
    offsetDate,
    validRecord,
    pureAlcohol,
    total,
    recent,
    sorted,
    readRecords,
    writeRecords,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AlcoholMonitor = api;
})(globalThis);
