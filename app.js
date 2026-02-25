/*
  Accountability Partner dashboard behavior.
  Handles local persistence, daily data entry, metric-driven rendering, weekly aggregation, and JSON import/export.
*/

(() => {
  const STORAGE_KEY = "accountability_daily_scorecard_v1";
  const METRIC_DEFINITIONS_KEY = "store.metric_definitions";
  const METRIC_DEFINITIONS_VERSION = 1;
  const $ = (id) => document.getElementById(id);

  const els = {
    weekLabel: $("weekLabel"),
    dashWeekRange: $("dashWeekRange"),

    dayDate: $("dayDate"),
    metricsForm: $("metricsForm"),

    prioritiesDefined: $("prioritiesDefined"),
    twoCompleted: $("twoCompleted"),
    weeklyReviewDone: $("weeklyReviewDone"),

    saveDayBtn: $("saveDayBtn"),
    deleteDayBtn: $("deleteDayBtn"),
    clearBtn: $("clearBtn"),
    daySavedPill: $("daySavedPill"),
    status: $("status"),

    exportWeekBtn: $("exportWeekBtn"),
    exportAllBtn: $("exportAllBtn"),
    importFile: $("importFile"),

    dashSleep: $("dashSleep"),
    dashSleepS: $("dashSleepS"),
    dashCaff: $("dashCaff"),
    dashCaffS: $("dashCaffS"),
    dashSugar: $("dashSugar"),
    dashMove: $("dashMove"),
    dashDWTech: $("dashDWTech"),
    dashDWCreat: $("dashDWCreat"),
    dashStruct: $("dashStruct"),
    dashStructS: $("dashStructS"),
    dashDays: $("dashDays"),

    weekDaysTable: $("weekDaysTable").querySelector("tbody"),
    weeksTable: $("weeksTable").querySelector("tbody"),
  };

  /**
   * Metric definition shape invariants:
   * - metric_id is stable and never repurposed for a different meaning.
   * - active_from / active_to are inclusive ISO dates used for date-scoped rendering.
   * - aggregation is metadata used by weekly summaries (avg, sum, count_true, latest, none).
   * - options is only populated for select-type metrics.
   */
  const DEFAULT_METRIC_DEFINITIONS = Object.freeze([
    {
      metric_id: "one_sentence",
      label: "One-sentence reflection",
      type: "text",
      unit: null,
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "latest",
      group: "Reflection",
      input_attrs: { maxlength: 200, placeholder: "Concrete: what moved, what leaked, what mattered." }
    },
    {
      metric_id: "sleep_hours",
      label: "Sleep",
      type: "number",
      unit: "hours",
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "avg",
      group: "Physiology",
      input_attrs: { min: 0, max: 24, step: 0.1, placeholder: "e.g., 7.4" }
    },
    {
      metric_id: "caffeine_drinks",
      label: "Caffeine",
      type: "number",
      unit: "drinks",
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "avg",
      group: "Physiology",
      input_attrs: { min: 0, max: 20, step: 0.1, placeholder: "e.g., 2" }
    },
    {
      metric_id: "sugar_binge",
      label: "Sugar binge",
      type: "boolean",
      unit: null,
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "count_true",
      group: "Physiology",
      input_attrs: {}
    },
    {
      metric_id: "movement_20m",
      label: "Movement 20+ mins",
      type: "boolean",
      unit: null,
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "count_true",
      group: "Physiology",
      input_attrs: {}
    },
    {
      metric_id: "deep_work_tech",
      label: "Deep work sessions (tech)",
      type: "integer",
      unit: "sessions",
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "sum",
      group: "Execution",
      input_attrs: { min: 0, max: 10, step: 1, placeholder: "0–10" }
    },
    {
      metric_id: "deep_work_creative",
      label: "Deep work sessions (creative)",
      type: "integer",
      unit: "sessions",
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "sum",
      group: "Execution",
      input_attrs: { min: 0, max: 10, step: 1, placeholder: "0–10" }
    },
    {
      metric_id: "weight_optional",
      label: "Optional: weight",
      type: "number",
      unit: "kg",
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "latest",
      group: "Execution",
      input_attrs: { min: 0, step: 0.1, placeholder: "optional" }
    },
    {
      metric_id: "artifact_technical",
      label: "Artifact (tech)",
      type: "text",
      unit: null,
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "none",
      group: "Execution",
      input_attrs: { maxlength: 140, placeholder: "e.g., committed input parsing + validation." }
    },
    {
      metric_id: "artifact_creative",
      label: "Artifact (creative)",
      type: "text",
      unit: null,
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "none",
      group: "Execution",
      input_attrs: { maxlength: 140, placeholder: "e.g., 600 words; revised Scene 1." }
    }
  ]);

  let metricDefinitions = loadMetricDefinitions();
  const metricInputEls = new Map();

  function pad(n) { return String(n).padStart(2, "0"); }
  function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseISODate(s) { const [y, m, dd] = s.split("-").map(Number); return new Date(y, m - 1, dd); }

  function startOfWeekMonday(d) {
    const day = d.getDay(); // Sun=0..Sat=6
    const diff = (day === 0) ? -6 : (1 - day);
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(12, 0, 0, 0);
    return monday;
  }
  function endOfWeekSunday(monday) {
    const s = new Date(monday);
    s.setDate(monday.getDate() + 6);
    return s;
  }

  function loadStore() {
    let store;
    try {
      store = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? { days: {}, weeks: {} };
    } catch {
      store = { days: {}, weeks: {} };
    }

    const { migratedStore, changed } = migrateLegacyDayEntries(store);
    if (changed) saveStore(migratedStore);
    return migratedStore;
  }
  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function setStatus(msg) { els.status.textContent = msg; }

  function numOrNull(v) { if (v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
  function intOrNull(v) { if (v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; }

  function valOrEmpty(v) { return (v === null || v === undefined || Number.isNaN(v)) ? "" : String(v); }

  function downloadJSON(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[c]);
  }

  function weekIdFromDayISO(dayISO) {
    const monday = startOfWeekMonday(parseISODate(dayISO));
    return toISODate(monday);
  }

  function currentDayISO() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return toISODate(d);
  }

  function loadMetricDefinitions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(METRIC_DEFINITIONS_KEY));
      if (parsed?.version === METRIC_DEFINITIONS_VERSION && Array.isArray(parsed?.definitions)) {
        return parsed.definitions;
      }
    } catch {
      // noop: fallback to defaults
    }

    const seeded = [...DEFAULT_METRIC_DEFINITIONS];
    localStorage.setItem(METRIC_DEFINITIONS_KEY, JSON.stringify({
      version: METRIC_DEFINITIONS_VERSION,
      definitions: seeded,
      updated_at_iso: new Date().toISOString()
    }));
    return seeded;
  }

  function isMetricActiveOnDate(definition, dayISO) {
    const starts = !definition.active_from || definition.active_from <= dayISO;
    const ends = !definition.active_to || definition.active_to >= dayISO;
    return starts && ends;
  }

  function getDefinitionsForDay(dayISO) {
    return metricDefinitions.filter((def) => isMetricActiveOnDate(def, dayISO));
  }

  function getMetricValue(entry, metricId, fallback = null) {
    if (entry?.metrics && Object.prototype.hasOwnProperty.call(entry.metrics, metricId)) {
      return entry.metrics[metricId];
    }
    return fallback;
  }

  /**
   * Date-scoped metric renderer invariants:
   * - Only definitions active on `dayISO` are rendered.
   * - Inputs are keyed by metric_id in `metricInputEls` for generic persistence logic.
   * - Renderer never mutates existing day values; it only rebuilds the active form surface.
   */
  function renderMetricFields(dayISO) {
    metricInputEls.clear();
    els.metricsForm.innerHTML = "";

    const defs = getDefinitionsForDay(dayISO);
    const grouped = defs.reduce((acc, def) => {
      const key = def.group || "Metrics";
      acc[key] = acc[key] || [];
      acc[key].push(def);
      return acc;
    }, {});

    for (const [groupName, groupDefs] of Object.entries(grouped)) {
      const sectionTitle = document.createElement("h3");
      sectionTitle.textContent = groupName;
      els.metricsForm.appendChild(sectionTitle);

      const grid = document.createElement("div");
      grid.className = "row";

      for (const def of groupDefs) {
        const wrap = document.createElement("div");
        const inputId = `metric_${def.metric_id}`;

        if (def.type === "boolean") {
          wrap.className = "check";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.id = inputId;
          wrap.appendChild(input);

          const label = document.createElement("label");
          label.setAttribute("for", inputId);
          label.style.margin = "0";
          label.textContent = def.label;
          wrap.appendChild(label);
          metricInputEls.set(def.metric_id, input);
        } else {
          const label = document.createElement("label");
          label.setAttribute("for", inputId);
          label.textContent = def.unit ? `${def.label} (${def.unit})` : def.label;
          wrap.appendChild(label);

          let input;
          if (def.type === "select") {
            input = document.createElement("select");
            (def.options || []).forEach((opt) => {
              const option = document.createElement("option");
              option.value = opt.value;
              option.textContent = opt.label;
              input.appendChild(option);
            });
          } else {
            input = document.createElement("input");
            input.type = (def.type === "number" || def.type === "integer") ? "number" : "text";
          }

          input.id = inputId;
          Object.entries(def.input_attrs || {}).forEach(([k, v]) => input.setAttribute(k, String(v)));
          wrap.appendChild(input);
          metricInputEls.set(def.metric_id, input);
        }

        grid.appendChild(wrap);
      }

      els.metricsForm.appendChild(grid);
      els.metricsForm.appendChild(document.createElement("div")).className = "hr";
    }
  }

  function readMetricInputValue(definition, inputEl) {
    if (definition.type === "boolean") return !!inputEl.checked;
    if (definition.type === "integer") return intOrNull(inputEl.value) ?? 0;
    if (definition.type === "number") return numOrNull(inputEl.value);
    return (inputEl.value || "").trim();
  }

  function writeMetricInputValue(definition, inputEl, value) {
    if (definition.type === "boolean") {
      inputEl.checked = !!value;
      return;
    }
    inputEl.value = valOrEmpty(value);
  }

  function computeWeekSummary(store, weekMondayISO) {
    const monday = parseISODate(weekMondayISO);
    const sunday = endOfWeekSunday(monday);
    const days = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = toISODate(d);
      const entry = store.days[iso];
      if (entry) days.push(entry);
    }

    const sleepVals = days.map((d) => getMetricValue(d, "sleep_hours", null)).filter((v) => v !== null && v !== undefined);
    const caffVals = days.map((d) => getMetricValue(d, "caffeine_drinks", null)).filter((v) => v !== null && v !== undefined);

    const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);

    const sugarDays = days.filter((d) => !!getMetricValue(d, "sugar_binge", false)).length;
    const moveDays = days.filter((d) => !!getMetricValue(d, "movement_20m", false)).length;

    const dwTechTotal = sum(days.map((d) => getMetricValue(d, "deep_work_tech", 0) ?? 0));
    const dwCreatTotal = sum(days.map((d) => getMetricValue(d, "deep_work_creative", 0) ?? 0));

    const weekStruct = store.weeks[weekMondayISO]?.structure ?? {
      priorities_defined: false,
      two_completed: false,
      weekly_review_done: false
    };
    const structScore = [weekStruct.priorities_defined, weekStruct.two_completed, weekStruct.weekly_review_done].filter(Boolean).length;

    return {
      schema: "accountability_scorecard.week.v2",
      week: {
        start_monday: weekMondayISO,
        end_sunday: toISODate(sunday),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local"
      },
      summary: {
        days_logged: days.length,
        physiology: {
          sleep_avg_hours: avg(sleepVals),
          sleep_days_logged: sleepVals.length,
          caffeine_avg_drinks: avg(caffVals),
          caffeine_days_logged: caffVals.length,
          sugar_binge_days: sugarDays,
          movement_days: moveDays
        },
        execution: {
          deep_work_sessions_technical_total: dwTechTotal,
          deep_work_sessions_creative_total: dwCreatTotal
        },
        structure: {
          ...weekStruct,
          score: structScore
        }
      },
      days: days
        .slice()
        .sort((a, b) => (a.day.iso_date).localeCompare(b.day.iso_date)),
      meta: {
        exported_at_iso: new Date().toISOString()
      }
    };
  }

  function updateWeekLabels(weekMondayISO) {
    const monday = parseISODate(weekMondayISO);
    const sunday = endOfWeekSunday(monday);
    els.weekLabel.textContent = `Week: ${weekMondayISO} → ${toISODate(sunday)} (Mon–Sun)`;
    els.dashWeekRange.textContent = `Dashboard for ${weekMondayISO} → ${toISODate(sunday)}`;
  }

  function setDaySavedPill(isSaved) {
    els.daySavedPill.textContent = isSaved ? "Saved" : "Not saved";
    els.daySavedPill.classList.remove("ok", "warn");
    els.daySavedPill.classList.add(isSaved ? "ok" : "warn");
  }

  function clearForm(keepDate = true) {
    for (const def of getDefinitionsForDay(els.dayDate.value || currentDayISO())) {
      const input = metricInputEls.get(def.metric_id);
      if (!input) continue;
      if (def.type === "boolean") input.checked = false;
      else input.value = "";
    }
    if (!keepDate) els.dayDate.value = "";
    setDaySavedPill(false);
  }

  function getDayFormData(dayISO) {
    const metrics = {};
    const defs = getDefinitionsForDay(dayISO);
    defs.forEach((def) => {
      const input = metricInputEls.get(def.metric_id);
      if (!input) return;
      metrics[def.metric_id] = readMetricInputValue(def, input);
    });

    return {
      schema: "accountability_scorecard.day.v3",
      day: {
        iso_date: dayISO,
        week_monday: weekIdFromDayISO(dayISO)
      },
      metrics,
      meta: {
        metric_definitions_version: METRIC_DEFINITIONS_VERSION,
        saved_at_iso: new Date().toISOString()
      }
    };
  }

  function fillDayForm(entry) {
    const defs = getDefinitionsForDay(els.dayDate.value);
    defs.forEach((def) => {
      const input = metricInputEls.get(def.metric_id);
      if (!input) return;
      writeMetricInputValue(def, input, getMetricValue(entry, def.metric_id, null));
    });
  }

  function getWeekStructure(store, weekMondayISO) {
    return store.weeks[weekMondayISO]?.structure ?? {
      priorities_defined: false,
      two_completed: false,
      weekly_review_done: false
    };
  }

  function setWeekStructure(store, weekMondayISO, structure) {
    store.weeks[weekMondayISO] = store.weeks[weekMondayISO] || {};
    store.weeks[weekMondayISO].structure = structure;
    store.weeks[weekMondayISO].meta = { updated_at_iso: new Date().toISOString() };
  }

  function renderWeekDashboard(store, weekMondayISO) {
    updateWeekLabels(weekMondayISO);
    const weekObj = computeWeekSummary(store, weekMondayISO);

    const s = weekObj.summary;

    els.dashDays.textContent = String(s.days_logged);

    els.dashSleep.textContent = s.physiology.sleep_avg_hours == null ? "—" : s.physiology.sleep_avg_hours.toFixed(1);
    els.dashSleepS.textContent = `days logged: ${s.physiology.sleep_days_logged}`;

    els.dashCaff.textContent = s.physiology.caffeine_avg_drinks == null ? "—" : s.physiology.caffeine_avg_drinks.toFixed(1);
    els.dashCaffS.textContent = `days logged: ${s.physiology.caffeine_days_logged}`;

    els.dashSugar.textContent = String(s.physiology.sugar_binge_days);
    els.dashMove.textContent = String(s.physiology.movement_days);

    els.dashDWTech.textContent = String(s.execution.deep_work_sessions_technical_total);
    els.dashDWCreat.textContent = String(s.execution.deep_work_sessions_creative_total);

    els.dashStruct.textContent = `${s.structure.score}/3`;
    els.dashStructS.textContent = `${Number(!!s.structure.priorities_defined) + Number(!!s.structure.two_completed) + Number(!!s.structure.weekly_review_done)}/3`;

    els.prioritiesDefined.checked = !!s.structure.priorities_defined;
    els.twoCompleted.checked = !!s.structure.two_completed;
    els.weeklyReviewDone.checked = !!s.structure.weekly_review_done;

    els.weekDaysTable.innerHTML = "";
    const monday = parseISODate(weekMondayISO);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = toISODate(d);
      const entry = store.days[iso];

      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.innerHTML = `
        <td>${escapeHtml(iso)}</td>
        <td>${entry ? fmt(getMetricValue(entry, "sleep_hours", null)) : "—"}</td>
        <td>${entry ? fmt(getMetricValue(entry, "caffeine_drinks", null)) : "—"}</td>
        <td>${entry ? (getMetricValue(entry, "sugar_binge", false) ? "Y" : "N") : "—"}</td>
        <td>${entry ? (getMetricValue(entry, "movement_20m", false) ? "Y" : "N") : "—"}</td>
        <td>${entry ? fmt(getMetricValue(entry, "deep_work_tech", 0)) : "—"}</td>
        <td>${entry ? fmt(getMetricValue(entry, "deep_work_creative", 0)) : "—"}</td>
        <td>${entry ? escapeHtml(shortArtifacts(entry)) : "—"}</td>
      `;
      tr.addEventListener("click", () => {
        els.dayDate.value = iso;
        loadDayIntoForm();
        setStatus(`Loaded ${iso}.`);
      });
      els.weekDaysTable.appendChild(tr);
    }

    renderWeeksHistory(store);
  }

  function renderWeeksHistory(store) {
    const weekSet = new Set(Object.keys(store.weeks || {}));
    for (const dayISO of Object.keys(store.days || {})) {
      weekSet.add(weekIdFromDayISO(dayISO));
    }

    const weeks = Array.from(weekSet).sort((a, b) => b.localeCompare(a)).slice(0, 10);
    els.weeksTable.innerHTML = "";

    for (const weekMondayISO of weeks) {
      const wk = computeWeekSummary(store, weekMondayISO);
      const s = wk.summary;

      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";

      tr.innerHTML = `
        <td>${escapeHtml(`${wk.week.start_monday} → ${wk.week.end_sunday}`)}</td>
        <td>${escapeHtml(String(s.days_logged))}</td>
        <td>${s.physiology.sleep_avg_hours == null ? "—" : escapeHtml(s.physiology.sleep_avg_hours.toFixed(1))}</td>
        <td>${s.physiology.caffeine_avg_drinks == null ? "—" : escapeHtml(s.physiology.caffeine_avg_drinks.toFixed(1))}</td>
        <td>${escapeHtml(String(s.physiology.sugar_binge_days))}</td>
        <td>${escapeHtml(String(s.physiology.movement_days))}</td>
        <td>${escapeHtml(String(s.execution.deep_work_sessions_technical_total))}</td>
        <td>${escapeHtml(String(s.execution.deep_work_sessions_creative_total))}</td>
        <td><span class="pill ${s.structure.score >= 2 ? "ok" : "no"}">${escapeHtml(String(s.structure.score))}/3</span></td>
        <td class="right"><button class="ghost" data-export="${escapeHtml(weekMondayISO)}">JSON</button></td>
      `;

      tr.addEventListener("click", (evt) => {
        const btn = evt.target.closest("button[data-export]");
        if (btn) return;
        els.dayDate.value = weekMondayISO;
        loadDayIntoForm();
        setStatus(`Jumped to week ${weekMondayISO}.`);
      });

      tr.querySelector("button[data-export]")?.addEventListener("click", () => {
        downloadJSON(`scorecard_week_${weekMondayISO}.json`, wk);
        setStatus(`Exported week ${weekMondayISO}.`);
      });

      els.weeksTable.appendChild(tr);
    }
  }

  function fmt(v) { return (v === null || v === undefined || v === "") ? "—" : escapeHtml(String(v)); }

  function shortArtifacts(entry) {
    const t = (getMetricValue(entry, "artifact_technical", "") || "").trim();
    const c = (getMetricValue(entry, "artifact_creative", "") || "").trim();
    const parts = [];
    if (t) parts.push(`T: ${t}`);
    if (c) parts.push(`C: ${c}`);
    return parts.join(" | ").slice(0, 80);
  }

  function validateDay(entry) {
    const sh = getMetricValue(entry, "sleep_hours", null);
    const cf = getMetricValue(entry, "caffeine_drinks", null);
    const dwT = getMetricValue(entry, "deep_work_tech", 0);
    const dwC = getMetricValue(entry, "deep_work_creative", 0);

    if (sh !== null && (sh < 0 || sh > 24)) return "Sleep hours must be 0–24.";
    if (cf !== null && (cf < 0 || cf > 20)) return "Caffeine drinks must be 0–20.";
    if (dwT < 0 || dwT > 10) return "Deep work tech must be 0–10.";
    if (dwC < 0 || dwC > 10) return "Deep work creative must be 0–10.";
    return null;
  }

  function loadDayIntoForm() {
    const store = loadStore();
    const dayISO = els.dayDate.value;
    if (!dayISO) return;

    renderMetricFields(dayISO);

    const entry = store.days[dayISO];
    const weekMondayISO = weekIdFromDayISO(dayISO);

    updateWeekLabels(weekMondayISO);

    if (entry) {
      fillDayForm(entry);
      setDaySavedPill(true);
    } else {
      clearForm(true);
      setDaySavedPill(false);
    }

    const st = getWeekStructure(store, weekMondayISO);
    els.prioritiesDefined.checked = !!st.priorities_defined;
    els.twoCompleted.checked = !!st.two_completed;
    els.weeklyReviewDone.checked = !!st.weekly_review_done;

    renderWeekDashboard(store, weekMondayISO);
  }

  function setStructureFromCheckboxes(store, weekMondayISO) {
    const st = {
      priorities_defined: !!els.prioritiesDefined.checked,
      two_completed: !!els.twoCompleted.checked,
      weekly_review_done: !!els.weeklyReviewDone.checked
    };
    setWeekStructure(store, weekMondayISO, st);
  }

  /**
   * One-time migration from legacy day.v2 shape to day.v3 metric map.
   * Invariants:
   * - Each migrated entry receives a `metrics` object keyed by stable metric_id.
   * - Legacy fields are retained for backwards readability, but all app reads use metrics map.
   * - Migration is idempotent via `meta.migrated_to_metric_map_v3` flag.
   */
  function migrateLegacyDayEntries(store) {
    const migratedStore = {
      ...store,
      days: { ...(store.days || {}) },
      weeks: { ...(store.weeks || {}) }
    };
    let changed = false;

    for (const [dayISO, entry] of Object.entries(migratedStore.days)) {
      if (!entry || entry.metrics || entry.meta?.migrated_to_metric_map_v3) continue;

      const metrics = {
        one_sentence: entry.reflection?.one_sentence ?? "",
        sleep_hours: entry.physiology?.sleep_hours ?? null,
        caffeine_drinks: entry.physiology?.caffeine_drinks ?? null,
        sugar_binge: !!entry.physiology?.sugar_binge,
        movement_20m: !!entry.physiology?.movement_20m,
        weight_optional: entry.physiology?.weight_optional ?? null,
        deep_work_tech: entry.execution?.deep_work_tech ?? 0,
        deep_work_creative: entry.execution?.deep_work_creative ?? 0,
        artifact_technical: entry.execution?.artifact_technical ?? "",
        artifact_creative: entry.execution?.artifact_creative ?? ""
      };

      migratedStore.days[dayISO] = {
        ...entry,
        schema: "accountability_scorecard.day.v3",
        metrics,
        meta: {
          ...(entry.meta || {}),
          migrated_to_metric_map_v3: true,
          migrated_at_iso: new Date().toISOString()
        }
      };
      changed = true;
    }

    return { migratedStore, changed };
  }

  // --- Events ---
  els.dayDate.addEventListener("change", () => {
    if (!els.dayDate.value) return;
    loadDayIntoForm();
    setStatus(`Selected ${els.dayDate.value}.`);
  });

  els.saveDayBtn.addEventListener("click", () => {
    const dayISO = els.dayDate.value;
    if (!dayISO) return setStatus("Pick a day first.");

    const store = loadStore();
    const entry = getDayFormData(dayISO);
    const err = validateDay(entry);
    if (err) return setStatus(err);

    store.days[dayISO] = entry;

    const weekMondayISO = weekIdFromDayISO(dayISO);
    setStructureFromCheckboxes(store, weekMondayISO);

    saveStore(store);
    setDaySavedPill(true);
    renderWeekDashboard(store, weekMondayISO);
    setStatus(`Saved ${dayISO}.`);
  });

  els.deleteDayBtn.addEventListener("click", () => {
    const dayISO = els.dayDate.value;
    if (!dayISO) return setStatus("Pick a day first.");

    const store = loadStore();
    if (store.days?.[dayISO]) {
      delete store.days[dayISO];
      saveStore(store);
      clearForm(true);
      setDaySavedPill(false);
      renderWeekDashboard(store, weekIdFromDayISO(dayISO));
      setStatus(`Deleted ${dayISO}.`);
    } else {
      setStatus(`No saved entry for ${dayISO}.`);
    }
  });

  els.clearBtn.addEventListener("click", () => {
    clearForm(true);
    setStatus("Cleared form (nothing deleted).");
  });

  [els.prioritiesDefined, els.twoCompleted, els.weeklyReviewDone].forEach((cb) => {
    cb.addEventListener("change", () => {
      const dayISO = els.dayDate.value;
      if (!dayISO) return;
      const store = loadStore();
      const weekMondayISO = weekIdFromDayISO(dayISO);
      setStructureFromCheckboxes(store, weekMondayISO);
      saveStore(store);
      renderWeekDashboard(store, weekMondayISO);
      setStatus(`Updated weekly structure for ${weekMondayISO}.`);
    });
  });

  els.exportWeekBtn.addEventListener("click", () => {
    const dayISO = els.dayDate.value;
    if (!dayISO) return setStatus("Pick a day first.");
    const store = loadStore();
    const weekMondayISO = weekIdFromDayISO(dayISO);
    const wk = computeWeekSummary(store, weekMondayISO);
    downloadJSON(`scorecard_week_${weekMondayISO}.json`, wk);
    setStatus(`Exported week ${weekMondayISO}.`);
  });

  els.exportAllBtn.addEventListener("click", () => {
    const store = loadStore();
    const payload = {
      schema: "accountability_scorecard.all.v2",
      exported_at_iso: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      days: store.days || {},
      weeks: store.weeks || {}
    };
    downloadJSON("scorecard_all_data.json", payload);
    setStatus("Exported ALL data JSON.");
  });

  els.importFile.addEventListener("change", async () => {
    const file = els.importFile.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const store = loadStore();

      if (parsed?.schema === "accountability_scorecard.day.v2" && parsed?.day?.iso_date) {
        store.days[parsed.day.iso_date] = parsed;
        const { migratedStore } = migrateLegacyDayEntries(store);
        saveStore(migratedStore);
        els.dayDate.value = parsed.day.iso_date;
        loadDayIntoForm();
        setStatus(`Imported day ${parsed.day.iso_date}.`);
      } else if ((parsed?.schema === "accountability_scorecard.day.v3" || parsed?.metrics) && parsed?.day?.iso_date) {
        store.days[parsed.day.iso_date] = parsed;
        saveStore(store);
        els.dayDate.value = parsed.day.iso_date;
        loadDayIntoForm();
        setStatus(`Imported day ${parsed.day.iso_date}.`);
      } else if (parsed?.schema === "accountability_scorecard.week.v2" && parsed?.week?.start_monday) {
        const weekMondayISO = parsed.week.start_monday;
        if (parsed.summary?.structure) {
          setWeekStructure(store, weekMondayISO, {
            priorities_defined: !!parsed.summary.structure.priorities_defined,
            two_completed: !!parsed.summary.structure.two_completed,
            weekly_review_done: !!parsed.summary.structure.weekly_review_done
          });
        }
        if (Array.isArray(parsed.days)) {
          for (const d of parsed.days) {
            if (d?.day?.iso_date) store.days[d.day.iso_date] = d;
          }
        }
        const { migratedStore } = migrateLegacyDayEntries(store);
        saveStore(migratedStore);
        els.dayDate.value = weekMondayISO;
        loadDayIntoForm();
        setStatus(`Imported week ${weekMondayISO}.`);
      } else if (parsed?.schema === "accountability_scorecard.all.v2" && (parsed.days || parsed.weeks)) {
        for (const [k, v] of Object.entries(parsed.days || {})) store.days[k] = v;
        for (const [k, v] of Object.entries(parsed.weeks || {})) store.weeks[k] = v;
        const { migratedStore } = migrateLegacyDayEntries(store);
        saveStore(migratedStore);
        loadDayIntoForm();
        setStatus("Imported all data and merged.");
      } else {
        setStatus("Import failed: schema not recognized.");
      }
    } catch {
      setStatus("Import failed: invalid JSON.");
    } finally {
      els.importFile.value = "";
    }
  });

  // --- Init ---
  const todayISO = currentDayISO();
  els.dayDate.value = todayISO;
  setDaySavedPill(false);

  renderMetricFields(todayISO);
  loadDayIntoForm();
  setStatus(`Ready. Log today (${todayISO}) and hit Save day.`);
})();
