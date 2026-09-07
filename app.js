(() => {
  "use strict";
  const C = globalThis.AlcoholMonitor;
  const $ = (id) => document.getElementById(id);
  const form = $("drinkForm");
  const brand = $("brandSelect");
  const volume = $("volume");
  const alcohol = $("alcohol");
  const unit = $("volumeUnit");
  const date = $("drinkDate");
  const defaults = {
    beer: { brand: "啤酒", alcohol: 5, volume: 330, unit: "ml" },
    wine: { brand: "葡萄酒", alcohol: 13, volume: 150, unit: "ml" },
    spirit: { brand: "烈酒", alcohol: 40, volume: 30, unit: "ml" },
  };
  const seededBrands = [
    "茅台",
    "五粮液",
    "青岛啤酒",
    "雪花啤酒",
    "1664",
    "山崎12",
    "響",
    "Malibu",
    "朝日",
    "燕京纯生",
    "三得利金标啤酒",
    "Stella",
    "伏特加",
    "Gin",
    "鸡尾酒",
    "IPA",
    "巧克力世涛",
    "德式小麦",
    "古斯海盐",
    "燕京U8",
    "燕京白啤",
  ];
  let records = [];
  let visibleCount = 20;
  let today = C.localDate();
  let followToday = true;
  let undoAction = null;
  let toastTimer;
  let saveTimer;
  let busy = false;
  let readFailed = false;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function announce(text, action = null) {
    clearTimeout(toastTimer);
    undoAction = action;
    $("toastText").textContent = text;
    $("undoButton").hidden = !action;
    $("toast").hidden = false;
    // An undo stays available until another action or explicit dismissal.
    if (!action) toastTimer = setTimeout(closeToast, 4500);
  }
  function closeToast() {
    $("toast").hidden = true;
    undoAction = null;
    clearTimeout(toastTimer);
  }
  function showError(error, reading = false) {
    const message = error?.message || "";
    $("storageError").textContent = message.includes("原始数据")
      ? message
      : "浏览器未能读取或保存记录，可能是存储空间不足或存储权限受限。你的输入仍在，请解决后重试；不要清除已有记录。";
    $("storageError").hidden = false;
    if (reading) {
      readFailed = true;
      $("saveButton").disabled = true;
      for (const prefix of ["week", "today", "three"]) {
        $(prefix + "Units").textContent = "—";
        $(prefix + "Pure").textContent = "—";
        $(prefix + "Meter").removeAttribute("aria-valuenow");
        $(prefix + "Fill").style.width = "0%";
        $(prefix + "Warning").hidden = true;
      }
      $("historyList").replaceChildren(
        node("p", "empty-message", "暂时无法读取记录，请处理提示后刷新。"),
      );
      $("historyCount").textContent = "读取失败";
      $("showMore").hidden = true;
      $("recentSection").hidden = true;
    }
  }
  function commit(change) {
    try {
      // Read at mutation time to retain changes made in another tab.
      const current = C.readRecords(localStorage);
      const next = change(current);
      C.writeRecords(localStorage, next);
      records = next;
      readFailed = false;
      $("storageError").hidden = true;
      render();
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  }
  function reload() {
    try {
      records = C.readRecords(localStorage);
      readFailed = false;
      $("storageError").hidden = true;
      $("saveButton").disabled = busy;
      render();
    } catch (error) {
      showError(error, true);
    }
  }
  function renderStats() {
    for (const [prefix, days, limit, caution] of [
      ["week", 7, 14, 10],
      ["today", 1, 4.5, 3.5],
      ["three", 3, 13.5, 10.5],
    ]) {
      const pure = C.total(C.recent(records, days, today));
      const units = pure / 10;
      $(prefix + "Units").textContent = units.toFixed(1);
      $(prefix + "Pure").textContent = String(Math.round(pure * 10) / 10);
      $(prefix + "Fill").style.width =
        `${Math.min((units / limit) * 100, 100)}%`;
      const meter = $(prefix + "Meter");
      meter.setAttribute("aria-valuenow", String(Math.min(units, limit)));
      meter.setAttribute(
        "aria-valuetext",
        `${units.toFixed(1)} 单位，参考上限 ${limit} 单位`,
      );
      meter.classList.toggle("danger", units > limit);
      meter.classList.toggle("caution", units >= caution && units <= limit);
      const warning = $(prefix + "Warning");
      warning.hidden = units < caution;
      warning.textContent =
        units > limit
          ? `已超过 ${limit} 单位提醒值`
          : `已接近 ${limit} 单位提醒值`;
    }
  }
  function renderBrands() {
    let stored = [];
    try {
      const value = JSON.parse(localStorage.getItem(C.BRANDS_KEY) || "[]");
      if (Array.isArray(value))
        stored = value.filter((item) => typeof item === "string");
    } catch {
      /* Brand suggestions are optional; never overwrite their original data. */
    }
    const options = new Set([
      ...records.map((record) => record.brand),
      ...stored,
      ...seededBrands,
    ]);
    const fragment = document.createDocumentFragment();
    for (const name of options) {
      if (!name.trim()) continue;
      const option = node("option");
      option.value = name;
      fragment.append(option);
    }
    $("brandList").replaceChildren(fragment);
  }
  function renderRecent() {
    const seen = new Set();
    const fragment = document.createDocumentFragment();
    for (const record of C.sorted(records)) {
      const key = JSON.stringify([
        record.brand,
        record.alcohol,
        record.volume,
        record.unit,
      ]);
      if (seen.has(key)) continue;
      seen.add(key);
      const button = node(
        "button",
        "",
        `${record.brand || "未命名"} · ${record.volume} ${record.unit}`,
      );
      button.type = "button";
      button.title = `${record.brand || "未命名"}，${record.alcohol}%，${record.volume} ${record.unit}`;
      button.addEventListener("click", () => fill(record));
      fragment.append(button);
      if (seen.size === 4) break;
    }
    $("recentDrinks").replaceChildren(fragment);
    $("recentSection").hidden = seen.size === 0;
  }
  function dateLabel(value) {
    if (value === today) return "今天";
    if (value === C.offsetDate(today, -1)) return "昨天";
    return value.replaceAll("-", ".");
  }
  function renderHistory() {
    $("historyCount").textContent = `${records.length} 条记录`;
    const ordered = C.sorted(records);
    const fragment = document.createDocumentFragment();
    if (!records.length) {
      const empty = node("p", "empty-message");
      empty.append(
        node("strong", "", "还没有饮酒记录"),
        node("span", "", "在上方记下第一杯，从这里回看。"),
      );
      fragment.append(empty);
    }
    let group;
    let previousDate;
    for (const record of ordered.slice(0, visibleCount)) {
      if (record.date !== previousDate) {
        group = node("section", "history-group");
        const heading = node("h3", "history-date-heading");
        heading.append(node("span", "", dateLabel(record.date)));
        group.append(heading);
        fragment.append(group);
        previousDate = record.date;
      }
      const item = node("div", "history-item");
      const info = node("div", "history-info");
      info.append(node("div", "history-brand", record.brand || "未命名酒款"));
      info.append(
        node(
          "div",
          "history-details",
          `${record.volume} ${record.unit} · ${record.alcohol}% · ${(C.pureAlcohol(record) / 10).toFixed(1)} 单位`,
        ),
      );
      const actions = node("div", "history-actions");
      const repeat = node("button", "", "再记一杯");
      repeat.type = "button";
      repeat.dataset.action = "repeat";
      repeat.dataset.id = record.id;
      repeat.setAttribute(
        "aria-label",
        `再次填写 ${record.brand || "这杯酒"} 的记录`,
      );
      const remove = node("button", "btn-delete", "×");
      remove.type = "button";
      remove.dataset.action = "delete";
      remove.dataset.id = record.id;
      remove.setAttribute(
        "aria-label",
        `删除 ${record.date} 的 ${record.brand || "这杯酒"} 记录`,
      );
      actions.append(repeat, remove);
      item.append(info, actions);
      group.append(item);
    }
    $("historyList").replaceChildren(fragment);
    $("showMore").hidden = ordered.length <= visibleCount;
  }
  function render() {
    renderStats();
    renderBrands();
    renderRecent();
    renderHistory();
  }
  function updateDateUI() {
    $("headerDate").textContent = new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(C.parseDate(today));
    $("weekRange").textContent =
      `${C.offsetDate(today, -6).slice(5).replace("-", ".")} — ${today.slice(5).replace("-", ".")}`;
    date.max = today;
    $("dateToday").setAttribute("aria-pressed", String(date.value === today));
    $("dateYesterday").setAttribute(
      "aria-pressed",
      String(date.value === C.offsetDate(today, -1)),
    );
  }
  function handleRollover() {
    const next = C.localDate();
    if (next === today) return;
    today = next;
    if (followToday) date.value = today;
    updateDateUI();
    if (!readFailed) render();
  }
  function chooseDate(value, follow = false) {
    handleRollover();
    date.value = value;
    followToday = follow;
    updateDateUI();
  }
  function volumeChoices() {
    if (unit.value === "oz") return [1, 1.5, 2, 5, 12];
    if (Number(alcohol.value) >= 20) return [15, 30, 45, 60, 100];
    if (Number(alcohol.value) >= 8) return [75, 125, 150, 175, 250];
    return [150, 250, 330, 500, 750];
  }
  function updateEntry() {
    const values = {
      alcohol: alcohol.value,
      volume: volume.value,
      unit: unit.value,
      date: today,
    };
    const amount = C.validRecord(values)
      ? (C.pureAlcohol(values) / 10).toFixed(2)
      : "—";
    $("entryUnits").replaceChildren(
      document.createTextNode(amount + " "),
      node("span", "", "单位"),
    );
    const fragment = document.createDocumentFragment();
    for (const value of volumeChoices()) {
      const button = node("button", "", String(value));
      button.type = "button";
      button.setAttribute("aria-label", `${value} ${unit.value}`);
      button.setAttribute(
        "aria-pressed",
        String(Number(volume.value) === value),
      );
      button.addEventListener("click", () => {
        volume.value = value;
        updateEntry();
      });
      fragment.append(button);
    }
    $("volumeChips").replaceChildren(fragment);
    for (const button of $("presets").querySelectorAll("button")) {
      const preset = defaults[button.dataset.preset];
      button.setAttribute(
        "aria-pressed",
        String(
          brand.value === preset.brand &&
            Number(alcohol.value) === preset.alcohol &&
            Number(volume.value) === preset.volume &&
            unit.value === preset.unit,
        ),
      );
    }
    $("formError").hidden = true;
  }
  function fill(record, asToday = false) {
    brand.value = record.brand;
    alcohol.value = record.alcohol;
    volume.value = record.volume;
    unit.value = record.unit;
    if (asToday) chooseDate(C.localDate(), true);
    updateEntry();
  }
  $("presets").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-preset]");
    if (button) fill(defaults[button.dataset.preset]);
  });
  for (const input of [brand, volume, alcohol, unit])
    input.addEventListener("input", updateEntry);
  $("dateToday").addEventListener("click", () =>
    chooseDate(C.localDate(), true),
  );
  $("dateYesterday").addEventListener("click", () =>
    chooseDate(C.offsetDate(C.localDate(), -1)),
  );
  date.addEventListener("input", () => {
    followToday = false;
    updateDateUI();
    $("formError").hidden = true;
  });
  $("showMore").addEventListener("click", () => {
    visibleCount += 20;
    renderHistory();
  });
  $("closeToast").addEventListener("click", closeToast);
  $("undoButton").addEventListener("click", () => {
    if (!undoAction) return;
    const action = undoAction;
    if (commit(action)) announce("已撤销");
  });
  $("historyList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-id]");
    if (!button) return;
    const record = records.find((item) => item.id === button.dataset.id);
    if (!record) return;
    if (button.dataset.action === "repeat") {
      fill(record, true);
      form.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      $("formTitle").setAttribute("tabindex", "-1");
      $("formTitle").focus({ preventScroll: true });
      announce("已填入，日期设为今天。确认后保存。");
    } else {
      if (commit((items) => items.filter((item) => item.id !== record.id))) {
        announce("已删除记录", (items) =>
          items.some((item) => item.id === record.id)
            ? items
            : [...items, record],
        );
        $("undoButton").focus({ preventScroll: true });
      }
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || readFailed) return;
    handleRollover();
    const record = {
      brand: brand.value.trim(),
      alcohol: alcohol.value,
      volume: volume.value,
      unit: unit.value,
      date: date.value,
    };
    if (
      !C.validRecord(record) ||
      record.date > today ||
      !form.reportValidity()
    ) {
      $("formError").textContent =
        "请填写有效的饮酒量、酒精度与日期，不能记录未来日期。";
      $("formError").hidden = false;
      return;
    }
    record.alcohol = Number(record.alcohol);
    record.volume = Number(record.volume);
    record.id = crypto.randomUUID();
    record.timestamp = Date.now();
    busy = true;
    $("saveButton").disabled = true;
    if (commit((items) => [...items, record])) {
      announce(
        `已记录 ${record.volume} ${record.unit} · ${(C.pureAlcohol(record) / 10).toFixed(2)} 单位`,
        (items) => items.filter((item) => item.id !== record.id),
      );
      // Keep the drink details for another pour; return backdated entries to today.
      chooseDate(today, true);
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      $("saveButton").textContent = "✓ 已保存";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        busy = false;
        $("saveButton").disabled = readFailed;
        $("saveButton").textContent = "＋ 保存记录";
      }, 900);
    } else {
      busy = false;
      $("saveButton").disabled = readFailed;
    }
  });
  window.addEventListener("storage", (event) => {
    if (
      event.key === C.DRINKS_KEY ||
      event.key === C.BRANDS_KEY ||
      event.key === null
    )
      reload();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      handleRollover();
      reload();
    }
  });
  date.value = today;
  updateDateUI();
  updateEntry();
  reload();
  setInterval(handleRollover, 60000);
})();
