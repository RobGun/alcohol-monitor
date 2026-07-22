import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../饮酒监控器.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

class FakeClassList {
  values = new Set();
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
}

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.style = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  appendChild() {}
  append() {}
  closest() { return null; }
  focus() {}
  reset() {}
  scrollIntoView() {}
}

function createHarness(storedRecords = []) {
  const ids = [
    "drinkForm", "brandSelect", "brandList", "alcohol", "volume", "volumeUnit", "drinkDate",
    "pureAlcohol", "alcoholUnits", "progressText", "progressFill", "warning", "warningText",
    "dailyPureAlcohol", "dailyUnits", "dailyProgressText", "dailyProgressFill", "dailyWarning",
    "dailyWarningText", "threeDayPureAlcohol", "threeDayUnits", "threeDayProgressText",
    "threeDayProgressFill", "threeDayWarning", "threeDayWarningText", "historyList"
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement(id)]));
  elements.volumeUnit.value = "ml";

  const documentListeners = new Map();
  const storage = new Map([
    ["alcohol_monitor_drinks_v2", JSON.stringify(storedRecords)],
    ["alcohol_monitor_brands_v2", "[]"]
  ]);

  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [2026, 6, 22, 12, 0, 0, 0]));
    }
    static now() { return new FixedDate().getTime(); }
  }

  const context = vm.createContext({
    alert: message => { throw new Error(message); },
    crypto: { randomUUID: () => "test-id" },
    Date: FixedDate,
    document: {
      addEventListener: (type, listener) => documentListeners.set(type, listener),
      createElement: () => new FakeElement(),
      getElementById: id => elements[id]
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    window: { setInterval() {} }
  });

  vm.runInContext(script, context);
  documentListeners.get("DOMContentLoaded")();
  return { context, elements, storage };
}

test("today progress reads and normalizes a stored date with a time component", () => {
  const { elements } = createHarness([{
    id: "stored-today",
    brand: "test",
    alcohol: 5,
    volume: 330,
    unit: "ml",
    date: "2026-07-22T08:30:00+08:00",
    timestamp: 1
  }]);

  assert.equal(elements.dailyPureAlcohol.textContent, 17);
  assert.equal(elements.dailyUnits.textContent, "1.6");
  assert.equal(elements.dailyProgressText.textContent, "1.6 / 4.5 单位");
  assert.equal(elements.dailyProgressFill.style.width, "36.666666666666664%");
});

test("submitting today's drink updates the daily progress binding", () => {
  const { context, elements, storage } = createHarness();
  elements.alcohol.value = "5";
  elements.volume.value = "330";
  elements.volumeUnit.value = "ml";
  elements.drinkDate.value = "2026-07-22";

  const event = { preventDefault() {} };
  elements.drinkForm.listeners.get("submit").call(context, event);

  assert.equal(elements.dailyUnits.textContent, "1.6");
  assert.equal(elements.dailyProgressText.textContent, "1.6 / 4.5 单位");
  assert.equal(elements.dailyProgressFill.style.width, "36.666666666666664%");
  assert.equal(JSON.parse(storage.get("alcohol_monitor_drinks_v2"))[0].date, "2026-07-22");
});
