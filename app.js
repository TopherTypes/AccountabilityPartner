/*
  Accountability Partner dashboard behavior.
  Handles local persistence, daily data entry, metric-driven rendering, weekly aggregation, and JSON import/export.
*/

(() => {
  const STORAGE_KEY = "accountability_daily_scorecard_v1";
  const METRIC_DEFINITIONS_KEY = "store.metric_definitions";
  const METRIC_DEFINITIONS_VERSION = 1;
  const SUPPORTED_SCHEMA_VERSIONS = Object.freeze({
    day: 3,
    week: 3,
    all: 3
  });

  /**
   * Canonical metric type contracts + serialized formats stored in day entries.
   * - number_int: JSON number (integer) or null.
   * - number_float: JSON number (float/integer) or null.
   * - binary_yes_no: JSON boolean.
   * - binary_pos_neg: JSON boolean.
   * - text_short: JSON string (trimmed, short-form).
   * - text_long: JSON string (trimmed, long-form).
   * - select_single: JSON string option value, or null when unselected.
   * - select_multi: JSON array<string> option values.
   */
  const METRIC_TYPES = Object.freeze({
    NUMBER_INT: "number_int",
    NUMBER_FLOAT: "number_float",
    BINARY_YES_NO: "binary_yes_no",
    BINARY_POS_NEG: "binary_pos_neg",
    TEXT_SHORT: "text_short",
    TEXT_LONG: "text_long",
    SELECT_SINGLE: "select_single",
    SELECT_MULTI: "select_multi"
  });

  const SUPPORTED_METRIC_TYPES = new Set(Object.values(METRIC_TYPES));

  const LEGACY_METRIC_TYPE_MAP = Object.freeze({
    integer: METRIC_TYPES.NUMBER_INT,
    number: METRIC_TYPES.NUMBER_FLOAT,
    boolean: METRIC_TYPES.BINARY_YES_NO,
    text: METRIC_TYPES.TEXT_SHORT,
    select: METRIC_TYPES.SELECT_SINGLE
  });

  const LEGACY_AGGREGATION_MAP = Object.freeze({
    avg: "average"
  });

  const LEGACY_DAY_V2_TO_METRIC_ID = Object.freeze({
    "reflection.one_sentence": "one_sentence",
    "physiology.sleep_hours": "sleep_hours",
    "physiology.caffeine_drinks": "caffeine_drinks",
    "physiology.sugar_binge": "sugar_binge",
    "physiology.movement_20m": "movement_20m",
    "physiology.weight_optional": "weight_optional",
    "execution.deep_work_tech": "deep_work_tech",
    "execution.deep_work_creative": "deep_work_creative",
    "execution.artifact_technical": "artifact_technical",
    "execution.artifact_creative": "artifact_creative"
  });

  const $ = (id) => document.getElementById(id);

  const els = {
    weekLabel: $("weekLabel"),
    dashWeekRange: $("dashWeekRange"),
    openSettingsBtn: $("openSettingsBtn"),
    settingsModal: $("settingsModal"),
    closeSettingsBtn: $("closeSettingsBtn"),
    generalSettingsTab: $("generalSettingsTab"),
    metricSettingsTab: $("metricSettingsTab"),
    generalSettingsPanel: $("generalSettingsPanel"),
    metricSettingsPanel: $("metricSettingsPanel"),

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

    metricEffectiveDate: $("metricEffectiveDate"),
    metricRetireDate: $("metricRetireDate"),
    metricEditorMode: $("metricEditorMode"),
    metricIdInput: $("metricIdInput"),
    metricLabelInput: $("metricLabelInput"),
    metricTypeInput: $("metricTypeInput"),
    metricGroupInput: $("metricGroupInput"),
    metricGroupList: $("metricGroupList"),
    metricUnitInput: $("metricUnitInput"),
    metricAggregationInput: $("metricAggregationInput"),
    saveMetricBtn: $("saveMetricBtn"),
    clearMetricEditorBtn: $("clearMetricEditorBtn"),
    removeMetricBtn: $("removeMetricBtn"),
    metricsTable: $("metricsTable")?.querySelector("tbody"),

    weekDaysTable: $("weekDaysTable").querySelector("tbody"),
    weeksTable: $("weeksTable").querySelector("tbody"),
  };

  /**
   * Metric definition shape invariants:
   * - metric_id is stable and never repurposed for a different meaning.
   * - active_from / active_to are inclusive ISO dates used for date-scoped rendering.
   * - aggregation is metadata used by weekly summaries (average, sum, count_true, count_selected, latest, none).
   * - options is only populated for select-type metrics.
   */
  const DEFAULT_METRIC_DEFINITIONS = Object.freeze([
    {
      metric_id: "one_sentence",
      label: "One-sentence reflection",
      type: METRIC_TYPES.TEXT_LONG,
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
      type: METRIC_TYPES.NUMBER_FLOAT,
      unit: "hours",
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "average",
      group: "Physiology",
      input_attrs: { min: 0, max: 24, step: 0.1, placeholder: "e.g., 7.4" }
    },
    {
      metric_id: "caffeine_drinks",
      label: "Caffeine",
      type: METRIC_TYPES.NUMBER_FLOAT,
      unit: "drinks",
      options: null,
      active_from: "2024-01-01",
      active_to: null,
      aggregation: "average",
      group: "Physiology",
      input_attrs: { min: 0, max: 20, step: 0.1, placeholder: "e.g., 2" }
    },
    {
      metric_id: "sugar_binge",
      label: "Sugar binge",
      type: METRIC_TYPES.BINARY_YES_NO,
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
      type: METRIC_TYPES.BINARY_YES_NO,
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
      type: METRIC_TYPES.NUMBER_INT,
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
      type: METRIC_TYPES.NUMBER_INT,
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
      type: METRIC_TYPES.NUMBER_FLOAT,
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
      type: METRIC_TYPES.TEXT_SHORT,
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
      type: METRIC_TYPES.TEXT_SHORT,
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
  let selectedMetricVersion = null;
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
  function intOrNull(v) { if (v === "" || v == null) return null; const n = Number(v); return Number.isInteger(n) ? n : null; }

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
        const normalized = normalizeMetricDefinitions(parsed.definitions);
        if (normalized.changed) persistMetricDefinitions(normalized.definitions);
        return normalized.definitions;
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

  function persistMetricDefinitions(definitions) {
    localStorage.setItem(METRIC_DEFINITIONS_KEY, JSON.stringify({
      version: METRIC_DEFINITIONS_VERSION,
      definitions,
      updated_at_iso: new Date().toISOString()
    }));
  }

  function normalizeMetricDefinitions(definitions) {
    let changed = false;
    const normalized = definitions.map((def) => {
      const next = { ...def };
      const normalizedType = LEGACY_METRIC_TYPE_MAP[next.type] || next.type;
      if (normalizedType !== next.type) {
        next.type = normalizedType;
        changed = true;
      }
      if (!SUPPORTED_METRIC_TYPES.has(next.type)) {
        next.type = METRIC_TYPES.TEXT_SHORT;
        changed = true;
      }
      const normalizedAggregation = LEGACY_AGGREGATION_MAP[next.aggregation] || next.aggregation || "none";
      if (normalizedAggregation !== next.aggregation) {
        next.aggregation = normalizedAggregation;
        changed = true;
      }
      if (!next.input_attrs || typeof next.input_attrs !== "object") {
        next.input_attrs = {};
        changed = true;
      }
      if (!Array.isArray(next.options)) {
        next.options = null;
      }
      if (!next.active_from) {
        next.active_from = "2024-01-01";
        changed = true;
      }
      if (!Object.prototype.hasOwnProperty.call(next, "active_to")) {
        next.active_to = null;
        changed = true;
      }
      return next;
    });
    return { definitions: normalized, changed };
  }

  function isMetricActiveOnDate(definition, dayISO) {
    const starts = !definition.active_from || definition.active_from <= dayISO;
    const ends = !definition.active_to || definition.active_to >= dayISO;
    return starts && ends;
  }

  /**
   * Historical immutability rules for metric definitions:
   * - We never overwrite old definition rows; edits append a new row with a later active_from.
   * - Each row represents a validity window [active_from, active_to].
   * - For any metric/day pair we resolve exactly one effective row: the active row with the latest active_from.
   * This guarantees old days render/aggregate against the definition that existed on that day.
   */
  function getDefinitionsForDay(dayISO) {
    const latestByMetric = new Map();
    for (const def of metricDefinitions) {
      if (!isMetricActiveOnDate(def, dayISO)) continue;
      const current = latestByMetric.get(def.metric_id);
      if (!current || def.active_from > current.active_from) {
        latestByMetric.set(def.metric_id, def);
      }
    }

    return Array.from(latestByMetric.values()).sort((a, b) => {
      const g = String(a.group || "").localeCompare(String(b.group || ""));
      if (g !== 0) return g;
      return a.metric_id.localeCompare(b.metric_id);
    });
  }

  function getDefinitionForMetricOnDate(metricId, dayISO) {
    const defs = metricDefinitions
      .filter((def) => def.metric_id === metricId && isMetricActiveOnDate(def, dayISO))
      .sort((a, b) => b.active_from.localeCompare(a.active_from));
    return defs[0] || null;
  }

  function toSerializableDefinition(definition) {
    return {
      metric_id: definition.metric_id,
      label: definition.label,
      type: definition.type,
      unit: definition.unit ?? null,
      options: Array.isArray(definition.options) ? definition.options.map((opt) => ({ ...opt })) : null,
      active_from: definition.active_from,
      active_to: definition.active_to ?? null,
      aggregation: definition.aggregation || "none",
      group: definition.group || null,
      input_attrs: { ...(definition.input_attrs || {}) }
    };
  }

  /**
   * Snapshot the exact day-scoped metric contracts so exported JSON can be understood offline
   * even if the local metric definitions change later.
   */
  function buildMetricDefinitionSnapshotForDay(dayISO) {
    return getDefinitionsForDay(dayISO).map((def) => toSerializableDefinition(def));
  }

  function buildMetricDefinitionSnapshotForRange(startISO, endISO) {
    const unique = new Map();
    metricDefinitions.forEach((def) => {
      const startsBeforeEnd = !def.active_from || def.active_from <= endISO;
      const endsAfterStart = !def.active_to || def.active_to >= startISO;
      if (!startsBeforeEnd || !endsAfterStart) return;
      unique.set(`${def.metric_id}::${def.active_from}`, toSerializableDefinition(def));
    });
    return Array.from(unique.values()).sort((a, b) => {
      const idCmp = a.metric_id.localeCompare(b.metric_id);
      if (idCmp !== 0) return idCmp;
      return a.active_from.localeCompare(b.active_from);
    });
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
        const wrap = createMetricControl(def);
        grid.appendChild(wrap);
      }

      els.metricsForm.appendChild(grid);
      els.metricsForm.appendChild(document.createElement("div")).className = "hr";
    }
  }

  function metricLabel(definition) {
    return definition.unit ? `${definition.label} (${definition.unit})` : definition.label;
  }

  function createMetricControl(definition) {
    const inputId = `metric_${definition.metric_id}`;
    const wrap = document.createElement("div");
    const attrs = definition.input_attrs || {};

    const applyAttrs = (el) => {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === "required" && typeof v === "boolean") {
          if (v) el.setAttribute("required", "required");
          return;
        }
        el.setAttribute(k, String(v));
      });
    };

    const createLabel = (text) => {
      const label = document.createElement("label");
      label.setAttribute("for", inputId);
      label.textContent = text;
      return label;
    };

    const binaryLabel = definition.type === METRIC_TYPES.BINARY_POS_NEG ? "Positive / Negative" : "Yes / No";

    let input;
    switch (definition.type) {
      case METRIC_TYPES.BINARY_YES_NO:
      case METRIC_TYPES.BINARY_POS_NEG: {
        wrap.className = "check";
        input = document.createElement("input");
        input.type = "checkbox";
        input.id = inputId;
        wrap.appendChild(input);

        const label = createLabel(definition.label);
        label.style.margin = "0";
        wrap.appendChild(label);

        const hint = document.createElement("span");
        hint.className = "small muted";
        hint.textContent = binaryLabel;
        wrap.appendChild(hint);
        break;
      }
      case METRIC_TYPES.NUMBER_INT:
      case METRIC_TYPES.NUMBER_FLOAT:
      case METRIC_TYPES.TEXT_SHORT: {
        wrap.appendChild(createLabel(metricLabel(definition)));
        input = document.createElement("input");
        input.type = (definition.type === METRIC_TYPES.TEXT_SHORT) ? "text" : "number";
        input.id = inputId;
        applyAttrs(input);
        wrap.appendChild(input);
        break;
      }
      case METRIC_TYPES.TEXT_LONG: {
        wrap.appendChild(createLabel(metricLabel(definition)));
        input = document.createElement("textarea");
        input.id = inputId;
        input.rows = 3;
        applyAttrs(input);
        wrap.appendChild(input);
        break;
      }
      case METRIC_TYPES.SELECT_SINGLE: {
        wrap.appendChild(createLabel(metricLabel(definition)));
        input = document.createElement("select");
        input.id = inputId;
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select…";
        input.appendChild(placeholder);
        (definition.options || []).forEach((opt) => {
          const option = document.createElement("option");
          option.value = String(opt.value);
          option.textContent = opt.label;
          input.appendChild(option);
        });
        applyAttrs(input);
        wrap.appendChild(input);
        break;
      }
      case METRIC_TYPES.SELECT_MULTI: {
        wrap.appendChild(createLabel(metricLabel(definition)));
        input = document.createElement("select");
        input.id = inputId;
        input.multiple = true;
        input.size = Math.min(Math.max((definition.options || []).length, 2), 6);
        (definition.options || []).forEach((opt) => {
          const option = document.createElement("option");
          option.value = String(opt.value);
          option.textContent = opt.label;
          input.appendChild(option);
        });
        applyAttrs(input);
        wrap.appendChild(input);
        break;
      }
      default: {
        wrap.appendChild(createLabel(metricLabel(definition)));
        input = document.createElement("input");
        input.type = "text";
        input.id = inputId;
        applyAttrs(input);
        wrap.appendChild(input);
      }
    }

    metricInputEls.set(definition.metric_id, input);
    return wrap;
  }

  /**
   * Parse UI control -> normalized metric value according to the metric contract.
   */
  function readMetricInputValue(definition, inputEl) {
    switch (definition.type) {
      case METRIC_TYPES.BINARY_YES_NO:
      case METRIC_TYPES.BINARY_POS_NEG:
        return !!inputEl.checked;
      case METRIC_TYPES.NUMBER_INT:
        return intOrNull(inputEl.value);
      case METRIC_TYPES.NUMBER_FLOAT:
        return numOrNull(inputEl.value);
      case METRIC_TYPES.TEXT_SHORT:
      case METRIC_TYPES.TEXT_LONG:
        return (inputEl.value || "").trim();
      case METRIC_TYPES.SELECT_SINGLE:
        return (inputEl.value || "").trim() || null;
      case METRIC_TYPES.SELECT_MULTI:
        return Array.from(inputEl.selectedOptions || []).map((opt) => opt.value);
      default:
        return (inputEl.value || "").trim();
    }
  }

  function writeMetricInputValue(definition, inputEl, value) {
    switch (definition.type) {
      case METRIC_TYPES.BINARY_YES_NO:
      case METRIC_TYPES.BINARY_POS_NEG:
        inputEl.checked = !!value;
        return;
      case METRIC_TYPES.SELECT_MULTI: {
        const values = new Set(Array.isArray(value) ? value.map(String) : []);
        Array.from(inputEl.options || []).forEach((opt) => {
          opt.selected = values.has(opt.value);
        });
        return;
      }
      default:
        inputEl.value = valOrEmpty(value);
    }
  }

  function isRequiredMetric(definition) {
    const required = definition.input_attrs?.required;
    return required === true || required === "true" || required === "required";
  }

  function isStepAligned(value, min, step) {
    const base = Number.isFinite(min) ? min : 0;
    const ratio = (value - base) / step;
    return Math.abs(ratio - Math.round(ratio)) < 1e-9;
  }

  function validateMetricValue(definition, value) {
    const attrs = definition.input_attrs || {};
    const required = isRequiredMetric(definition);

    if (required) {
      if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
        return `${definition.label} is required.`;
      }
    }

    switch (definition.type) {
      case METRIC_TYPES.NUMBER_INT:
      case METRIC_TYPES.NUMBER_FLOAT: {
        if (value === null || value === undefined || value === "") return null;
        if (!Number.isFinite(value)) return `${definition.label} must be a number.`;
        if (definition.type === METRIC_TYPES.NUMBER_INT && !Number.isInteger(value)) {
          return `${definition.label} must be an integer.`;
        }
        const min = numOrNull(attrs.min);
        const max = numOrNull(attrs.max);
        const step = numOrNull(attrs.step);
        if (min !== null && value < min) return `${definition.label} must be at least ${min}.`;
        if (max !== null && value > max) return `${definition.label} must be at most ${max}.`;
        if (step !== null && step > 0 && !isStepAligned(value, min, step)) {
          return `${definition.label} must follow step ${step}.`;
        }
        return null;
      }
      case METRIC_TYPES.BINARY_YES_NO:
      case METRIC_TYPES.BINARY_POS_NEG:
        return (typeof value === "boolean") ? null : `${definition.label} must be true/false.`;
      case METRIC_TYPES.TEXT_SHORT:
      case METRIC_TYPES.TEXT_LONG: {
        if (value === null || value === undefined) return null;
        if (typeof value !== "string") return `${definition.label} must be text.`;
        const maxLength = intOrNull(attrs.maxlength);
        if (maxLength !== null && value.length > maxLength) {
          return `${definition.label} must be at most ${maxLength} characters.`;
        }
        return null;
      }
      case METRIC_TYPES.SELECT_SINGLE: {
        if (value === null || value === undefined || value === "") return null;
        const optionValues = new Set((definition.options || []).map((opt) => String(opt.value)));
        return optionValues.has(String(value)) ? null : `${definition.label} must be a valid option.`;
      }
      case METRIC_TYPES.SELECT_MULTI: {
        if (value == null) return null;
        if (!Array.isArray(value)) return `${definition.label} must be an array of options.`;
        const optionValues = new Set((definition.options || []).map((opt) => String(opt.value)));
        const invalid = value.find((item) => !optionValues.has(String(item)));
        return invalid === undefined ? null : `${definition.label} includes an invalid option.`;
      }
      default:
        return null;
    }
  }

  function aggregateMetricValues(aggregation, values) {
    const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
    switch (aggregation) {
      case "average": {
        const nums = nonNull.filter((v) => Number.isFinite(v));
        return {
          value: nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length) : null,
          value_count: nums.length
        };
      }
      case "sum": {
        const nums = nonNull.filter((v) => Number.isFinite(v));
        return {
          value: nums.reduce((a, b) => a + b, 0),
          value_count: nums.length
        };
      }
      case "count_true": {
        const trues = values.filter((v) => v === true).length;
        return { value: trues, value_count: values.length };
      }
      case "count_selected": {
        const selected = values.reduce((acc, v) => {
          if (Array.isArray(v)) return acc + v.length;
          return (v === null || v === undefined || v === "") ? acc : acc + 1;
        }, 0);
        return { value: selected, value_count: values.length };
      }
      case "latest":
        return { value: nonNull.length ? nonNull[nonNull.length - 1] : null, value_count: nonNull.length };
      case "none":
      default:
        return { value: null, value_count: nonNull.length };
    }
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
      if (entry) days.push({ iso, entry });
    }

    const metricBuckets = new Map();
    days
      .slice()
      .sort((a, b) => a.iso.localeCompare(b.iso))
      .forEach((dayObj) => {
        const defs = getDefinitionsForDay(dayObj.iso);
        defs.forEach((def) => {
          const bucket = metricBuckets.get(def.metric_id) || { definition: def, values: [] };
          bucket.definition = def;
          bucket.values.push(getMetricValue(dayObj.entry, def.metric_id, null));
          metricBuckets.set(def.metric_id, bucket);
        });
      });

    const metricAggregates = {};
    metricBuckets.forEach((bucket, metricId) => {
      metricAggregates[metricId] = {
        aggregation: bucket.definition.aggregation || "none",
        ...aggregateMetricValues(bucket.definition.aggregation || "none", bucket.values)
      };
    });

    const sleepAgg = metricAggregates.sleep_hours || { value: null, value_count: 0 };
    const caffAgg = metricAggregates.caffeine_drinks || { value: null, value_count: 0 };
    const sugarAgg = metricAggregates.sugar_binge || { value: 0 };
    const moveAgg = metricAggregates.movement_20m || { value: 0 };
    const dwTechAgg = metricAggregates.deep_work_tech || { value: 0 };
    const dwCreatAgg = metricAggregates.deep_work_creative || { value: 0 };

    const weekStruct = store.weeks[weekMondayISO]?.structure ?? {
      priorities_defined: false,
      two_completed: false,
      weekly_review_done: false
    };
    const structScore = [weekStruct.priorities_defined, weekStruct.two_completed, weekStruct.weekly_review_done].filter(Boolean).length;

    return {
      schema: "accountability_scorecard.week.v3",
      week: {
        start_monday: weekMondayISO,
        end_sunday: toISODate(sunday),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local"
      },
      summary: {
        days_logged: days.length,
        metrics: metricAggregates,
        physiology: {
          sleep_avg_hours: sleepAgg.value,
          sleep_days_logged: sleepAgg.value_count || 0,
          caffeine_avg_drinks: caffAgg.value,
          caffeine_days_logged: caffAgg.value_count || 0,
          sugar_binge_days: sugarAgg.value || 0,
          movement_days: moveAgg.value || 0
        },
        execution: {
          deep_work_sessions_technical_total: dwTechAgg.value || 0,
          deep_work_sessions_creative_total: dwCreatAgg.value || 0
        },
        structure: {
          ...weekStruct,
          score: structScore
        }
      },
      days: days
        .slice()
        .sort((a, b) => (a.entry.day.iso_date).localeCompare(b.entry.day.iso_date))
        .map((d) => d.entry),
      metric_definitions: {
        source: "snapshot",
        definitions: buildMetricDefinitionSnapshotForRange(weekMondayISO, toISODate(sunday)),
        catalog_version: METRIC_DEFINITIONS_VERSION
      },
      meta: {
        exported_at_iso: new Date().toISOString(),
        app_schema_versions: { ...SUPPORTED_SCHEMA_VERSIONS }
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
      writeMetricInputValue(def, input, def.type === METRIC_TYPES.SELECT_MULTI ? [] : null);
      if (def.type === METRIC_TYPES.TEXT_SHORT || def.type === METRIC_TYPES.TEXT_LONG) {
        input.value = "";
      }
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
      metric_definitions: {
        source: "snapshot",
        definitions: buildMetricDefinitionSnapshotForDay(dayISO),
        catalog_version: METRIC_DEFINITIONS_VERSION
      },
      meta: {
        metric_definitions_version: METRIC_DEFINITIONS_VERSION,
        saved_at_iso: new Date().toISOString(),
        app_schema_versions: { ...SUPPORTED_SCHEMA_VERSIONS }
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
    const defs = getDefinitionsForDay(entry.day.iso_date);
    for (const def of defs) {
      const value = getMetricValue(entry, def.metric_id, null);
      const err = validateMetricValue(def, value);
      if (err) return err;
    }
    return null;
  }

  function loadDayIntoForm() {
    const store = loadStore();
    const dayISO = els.dayDate.value;
    if (!dayISO) return;

    // Load is date-aware: the selected day must render only the definition versions effective on that day.
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
    renderMetricManagementTable();
  }

  function shiftISODate(dayISO, deltaDays) {
    const d = parseISODate(dayISO);
    d.setDate(d.getDate() + deltaDays);
    return toISODate(d);
  }

  function populateMetricTypeOptions() {
    if (!els.metricTypeInput) return;
    els.metricTypeInput.innerHTML = "";
    Object.values(METRIC_TYPES).forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      els.metricTypeInput.appendChild(option);
    });
  }

  function refreshMetricGroupList() {
    if (!els.metricGroupList) return;
    const groups = [...new Set(metricDefinitions.map((def) => String(def.group || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    els.metricGroupList.innerHTML = "";
    groups.forEach((groupName) => {
      const option = document.createElement("option");
      option.value = groupName;
      els.metricGroupList.appendChild(option);
    });
  }

  function clearMetricEditor() {
    selectedMetricVersion = null;
    if (els.metricEditorMode) els.metricEditorMode.value = "create";
    if (els.metricIdInput) els.metricIdInput.value = "";
    if (els.metricLabelInput) els.metricLabelInput.value = "";
    if (els.metricTypeInput) els.metricTypeInput.value = METRIC_TYPES.TEXT_SHORT;
    if (els.metricGroupInput) els.metricGroupInput.value = "";
    if (els.metricUnitInput) els.metricUnitInput.value = "";
    if (els.metricAggregationInput) els.metricAggregationInput.value = "none";
  }

  function fillMetricEditor(definition) {
    selectedMetricVersion = { metric_id: definition.metric_id, active_from: definition.active_from };
    if (els.metricEditorMode) els.metricEditorMode.value = "edit";
    if (els.metricIdInput) els.metricIdInput.value = definition.metric_id || "";
    if (els.metricLabelInput) els.metricLabelInput.value = definition.label || "";
    if (els.metricTypeInput) els.metricTypeInput.value = definition.type || METRIC_TYPES.TEXT_SHORT;
    if (els.metricGroupInput) els.metricGroupInput.value = definition.group || "";
    if (els.metricUnitInput) els.metricUnitInput.value = definition.unit || "";
    if (els.metricAggregationInput) els.metricAggregationInput.value = definition.aggregation || "none";
  }

  /**
   * Forward-only guardrail for metric definition changes.
   * Historical records are immutable: metric contracts can only change from today onward.
   */
  function isForwardOnlyDate(isoDate) {
    return Boolean(isoDate) && isoDate >= currentDayISO();
  }

  function renderMetricManagementTable() {
    if (!els.metricsTable) return;
    els.metricsTable.innerHTML = "";
    refreshMetricGroupList();

    const defs = [...metricDefinitions].sort((a, b) => {
      const idCmp = a.metric_id.localeCompare(b.metric_id);
      if (idCmp !== 0) return idCmp;
      return b.active_from.localeCompare(a.active_from);
    });

    defs.forEach((def) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(def.metric_id)}</td>
        <td>${escapeHtml(def.label)}</td>
        <td>${escapeHtml(def.type)}</td>
        <td>${escapeHtml(def.group || "—")}</td>
        <td>${escapeHtml(def.active_from || "—")}</td>
        <td>${escapeHtml(def.active_to || "—")}</td>
        <td class="right">
          <button class="ghost" data-load="${escapeHtml(def.metric_id)}" data-from="${escapeHtml(def.active_from || "")}">Load</button>
          <button class="ghost" data-retire="${escapeHtml(def.metric_id)}" data-from="${escapeHtml(def.active_from || "")}">Remove</button>
        </td>
      `;
      els.metricsTable.appendChild(tr);
    });
  }

  function saveMetricDefinitionVersion(definition, effectiveFromISO) {
    if (!isForwardOnlyDate(effectiveFromISO)) {
      return { ok: false, reason: "Metric changes must be effective today or later." };
    }

    const updatedDefs = metricDefinitions.map((row) => ({ ...row }));
    const previous = updatedDefs
      .filter((row) => row.metric_id === definition.metric_id && !row.active_to && row.active_from <= effectiveFromISO)
      .sort((a, b) => b.active_from.localeCompare(a.active_from))[0];

    if (previous) {
      previous.active_to = shiftISODate(effectiveFromISO, -1);
    }

    updatedDefs.push({
      ...definition,
      active_from: effectiveFromISO,
      active_to: null
    });

    metricDefinitions = updatedDefs;
    persistMetricDefinitions(metricDefinitions);
    return { ok: true };
  }

  function retireMetricDefinition(metricId, retireISO) {
    if (!isForwardOnlyDate(retireISO)) {
      return { ok: false, reason: "Metric removals must be effective today or later." };
    }

    const updatedDefs = metricDefinitions.map((row) => ({ ...row }));
    const current = updatedDefs
      .filter((row) => row.metric_id === metricId && !row.active_to && row.active_from <= retireISO)
      .sort((a, b) => b.active_from.localeCompare(a.active_from))[0];
    if (!current) return { ok: false, reason: `No active version found for ${metricId} on ${retireISO}.` };

    // Soft-retire keeps the row for audit/history and closes its validity window at retire date.
    current.active_to = retireISO;
    metricDefinitions = updatedDefs;
    persistMetricDefinitions(metricDefinitions);
    return { ok: true };
  }

  function setStructureFromCheckboxes(store, weekMondayISO) {
    const st = {
      priorities_defined: !!els.prioritiesDefined.checked,
      two_completed: !!els.twoCompleted.checked,
      weekly_review_done: !!els.weeklyReviewDone.checked
    };
    setWeekStructure(store, weekMondayISO, st);
  }

  function getPathValue(source, path) {
    return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), source);
  }

  /**
   * Compatibility bridge for legacy day.v2 records.
   * Assumption: each legacy field path maps 1:1 to a stable metric_id and never changes meaning.
   * Fallback: if a legacy field is missing, we emit null/empty defaults so downstream v3 readers stay deterministic.
   */
  function mapLegacyDayV2ToMetrics(entry) {
    const metricDefs = getDefinitionsForDay(entry?.day?.iso_date || currentDayISO());
    const metricIds = metricDefs.map((def) => def.metric_id);

    const metrics = {};
    metricIds.forEach((metricId) => {
      const legacyPath = Object.entries(LEGACY_DAY_V2_TO_METRIC_ID).find(([, id]) => id === metricId)?.[0];
      const fallbackDef = metricDefs.find((def) => def.metric_id === metricId);
      const fallbackByType = (type) => {
        if (type === METRIC_TYPES.NUMBER_INT || type === METRIC_TYPES.NUMBER_FLOAT || type === METRIC_TYPES.SELECT_SINGLE) return null;
        if (type === METRIC_TYPES.SELECT_MULTI) return [];
        if (type === METRIC_TYPES.BINARY_YES_NO || type === METRIC_TYPES.BINARY_POS_NEG) return false;
        return "";
      };
      const rawValue = legacyPath ? getPathValue(entry, legacyPath) : undefined;
      metrics[metricId] = (rawValue === undefined || rawValue === null) ? fallbackByType(fallbackDef?.type) : rawValue;
    });

    return metrics;
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
      if (!entry) continue;

      const isAlreadyV3 = entry.schema === "accountability_scorecard.day.v3" || !!entry.metrics;
      if (isAlreadyV3 && entry.metric_definitions) continue;

      if (isAlreadyV3) {
        migratedStore.days[dayISO] = {
          ...entry,
          schema: "accountability_scorecard.day.v3",
          metric_definitions: entry.metric_definitions || {
            source: "reference",
            catalog_version: METRIC_DEFINITIONS_VERSION,
            reference_key: METRIC_DEFINITIONS_KEY
          },
          meta: {
            ...(entry.meta || {}),
            app_schema_versions: { ...SUPPORTED_SCHEMA_VERSIONS }
          }
        };
        changed = true;
        continue;
      }

      const metrics = mapLegacyDayV2ToMetrics({ ...entry, day: { ...(entry.day || {}), iso_date: dayISO } });
      migratedStore.days[dayISO] = {
        ...entry,
        schema: "accountability_scorecard.day.v3",
        metrics,
        metric_definitions: {
          source: "reference",
          catalog_version: METRIC_DEFINITIONS_VERSION,
          reference_key: METRIC_DEFINITIONS_KEY
        },
        meta: {
          ...(entry.meta || {}),
          migrated_to_metric_map_v3: true,
          migrated_at_iso: new Date().toISOString(),
          app_schema_versions: { ...SUPPORTED_SCHEMA_VERSIONS }
        }
      };
      changed = true;
    }

    return { migratedStore, changed };
  }

  function parseSchemaDescriptor(schema) {
    const match = /^accountability_scorecard\.(day|week|all)\.v(\d+)$/.exec(String(schema || ""));
    if (!match) return null;
    return { scope: match[1], version: Number(match[2]) };
  }

  function getUnsupportedSchemaStatus(schemaInfo) {
    if (!schemaInfo) return "Import failed: schema not recognized.";
    const maxSupported = SUPPORTED_SCHEMA_VERSIONS[schemaInfo.scope];
    if (!maxSupported) return `Import failed: unsupported schema group '${schemaInfo.scope}'.`;
    if (schemaInfo.version > maxSupported) {
      return `Import failed: unsupported future ${schemaInfo.scope} schema v${schemaInfo.version}. Current max is v${maxSupported}.`;
    }
    return `Import failed: unsupported ${schemaInfo.scope} schema v${schemaInfo.version}.`;
  }

  function normalizeImportedDayEntry(parsedDay) {
    const dayISO = parsedDay?.day?.iso_date;
    if (!dayISO) return null;

    if (parsedDay?.schema === "accountability_scorecard.day.v2") {
      return {
        ...parsedDay,
        schema: "accountability_scorecard.day.v3",
        metrics: mapLegacyDayV2ToMetrics(parsedDay),
        metric_definitions: {
          source: "reference",
          catalog_version: METRIC_DEFINITIONS_VERSION,
          reference_key: METRIC_DEFINITIONS_KEY
        },
        meta: {
          ...(parsedDay.meta || {}),
          imported_from_legacy_day_v2: true,
          imported_at_iso: new Date().toISOString(),
          app_schema_versions: { ...SUPPORTED_SCHEMA_VERSIONS }
        }
      };
    }

    if (parsedDay?.schema === "accountability_scorecard.day.v3" || parsedDay?.metrics) {
      return {
        ...parsedDay,
        schema: "accountability_scorecard.day.v3",
        metric_definitions: parsedDay.metric_definitions || {
          source: "reference",
          catalog_version: METRIC_DEFINITIONS_VERSION,
          reference_key: METRIC_DEFINITIONS_KEY
        },
        meta: {
          ...(parsedDay.meta || {}),
          app_schema_versions: { ...SUPPORTED_SCHEMA_VERSIONS }
        }
      };
    }

    return null;
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
      schema: "accountability_scorecard.all.v3",
      exported_at_iso: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      metric_definitions: {
        source: "snapshot",
        catalog_version: METRIC_DEFINITIONS_VERSION,
        definitions: metricDefinitions.map((def) => toSerializableDefinition(def))
      },
      days: store.days || {},
      weeks: store.weeks || {},
      meta: {
        app_schema_versions: { ...SUPPORTED_SCHEMA_VERSIONS }
      }
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

      const schemaInfo = parseSchemaDescriptor(parsed?.schema);
      // Safety gate: never attempt best-effort parsing of future schema versions,
      // because field semantics may have changed and could silently corrupt local data.
      if (schemaInfo && schemaInfo.version > SUPPORTED_SCHEMA_VERSIONS[schemaInfo.scope]) {
        setStatus(getUnsupportedSchemaStatus(schemaInfo));
      } else if (parsed?.schema === "accountability_scorecard.day.v2" || parsed?.schema === "accountability_scorecard.day.v3" || (parsed?.metrics && parsed?.day?.iso_date)) {
        const normalizedDay = normalizeImportedDayEntry(parsed);
        if (!normalizedDay) {
          setStatus("Import failed: day payload missing required fields.");
        } else {
          store.days[normalizedDay.day.iso_date] = normalizedDay;
          saveStore(store);
          els.dayDate.value = normalizedDay.day.iso_date;
          loadDayIntoForm();
          setStatus(`Imported day ${normalizedDay.day.iso_date}.`);
        }
      } else if (parsed?.schema === "accountability_scorecard.week.v2" || parsed?.schema === "accountability_scorecard.week.v3") {
        const weekMondayISO = parsed?.week?.start_monday;
        if (!weekMondayISO) {
          setStatus("Import failed: week payload missing week.start_monday.");
        } else {
          if (parsed.summary?.structure) {
            setWeekStructure(store, weekMondayISO, {
              priorities_defined: !!parsed.summary.structure.priorities_defined,
              two_completed: !!parsed.summary.structure.two_completed,
              weekly_review_done: !!parsed.summary.structure.weekly_review_done
            });
          }
          if (Array.isArray(parsed.days)) {
            for (const d of parsed.days) {
              const normalizedDay = normalizeImportedDayEntry(d);
              if (normalizedDay?.day?.iso_date) {
                store.days[normalizedDay.day.iso_date] = normalizedDay;
              }
            }
          }
          const { migratedStore } = migrateLegacyDayEntries(store);
          saveStore(migratedStore);
          els.dayDate.value = weekMondayISO;
          loadDayIntoForm();
          setStatus(`Imported week ${weekMondayISO}.`);
        }
      } else if (parsed?.schema === "accountability_scorecard.all.v2" || parsed?.schema === "accountability_scorecard.all.v3") {
        for (const [k, v] of Object.entries(parsed.days || {})) {
          const normalizedDay = normalizeImportedDayEntry(v);
          if (normalizedDay) {
            store.days[normalizedDay.day.iso_date || k] = normalizedDay;
          }
        }
        for (const [k, v] of Object.entries(parsed.weeks || {})) store.weeks[k] = v;
        const { migratedStore } = migrateLegacyDayEntries(store);
        saveStore(migratedStore);
        loadDayIntoForm();
        setStatus("Imported all data and merged.");
      } else {
        setStatus(getUnsupportedSchemaStatus(schemaInfo));
      }
    } catch {
      setStatus("Import failed: invalid JSON.");
    } finally {
      els.importFile.value = "";
    }
  });

  function setSettingsTab(tabKey) {
    const isGeneral = tabKey === "general";
    els.generalSettingsPanel?.classList.toggle("hidden", !isGeneral);
    els.metricSettingsPanel?.classList.toggle("hidden", isGeneral);
    els.generalSettingsTab?.classList.toggle("active", isGeneral);
    els.metricSettingsTab?.classList.toggle("active", !isGeneral);
  }

  function buildMetricDefinitionFromEditor() {
    const metricId = (els.metricIdInput?.value || "").trim();
    const label = (els.metricLabelInput?.value || "").trim();
    const type = els.metricTypeInput?.value || METRIC_TYPES.TEXT_SHORT;
    const group = (els.metricGroupInput?.value || "").trim() || "Metrics";
    const unit = (els.metricUnitInput?.value || "").trim() || null;
    const aggregation = els.metricAggregationInput?.value || "none";

    if (!metricId) return { error: "Metric ID is required." };
    if (!label) return { error: "Metric name is required." };
    if (!/^[a-z0-9_]+$/.test(metricId)) {
      return { error: "Metric ID must contain lowercase letters, numbers, and underscores only." };
    }
    if (!SUPPORTED_METRIC_TYPES.has(type)) {
      return { error: "Metric type is not supported." };
    }

    const base = selectedMetricVersion
      ? metricDefinitions.find((def) => def.metric_id === selectedMetricVersion.metric_id && def.active_from === selectedMetricVersion.active_from)
      : null;

    return {
      value: {
        metric_id: metricId,
        label,
        type,
        unit,
        options: base?.options || null,
        aggregation,
        group,
        input_attrs: { ...(base?.input_attrs || {}) }
      }
    };
  }

  function saveMetricFromEditor() {
    const effectiveFromISO = els.metricEffectiveDate?.value || currentDayISO();
    const parsed = buildMetricDefinitionFromEditor();
    if (parsed.error) {
      setStatus(parsed.error);
      return;
    }

    const result = saveMetricDefinitionVersion(parsed.value, effectiveFromISO);
    if (!result.ok) {
      setStatus(result.reason);
      return;
    }

    clearMetricEditor();
    loadDayIntoForm();
    setStatus(`Saved metric version ${parsed.value.metric_id} effective ${effectiveFromISO}.`);
  }

  els.openSettingsBtn?.addEventListener("click", () => {
    els.settingsModal?.showModal();
  });

  els.generalSettingsTab?.addEventListener("click", () => setSettingsTab("general"));
  els.metricSettingsTab?.addEventListener("click", () => setSettingsTab("metrics"));

  els.clearMetricEditorBtn?.addEventListener("click", () => {
    clearMetricEditor();
    setStatus("Metric editor cleared.");
  });

  els.saveMetricBtn?.addEventListener("click", saveMetricFromEditor);

  els.removeMetricBtn?.addEventListener("click", () => {
    const metricId = (els.metricIdInput?.value || "").trim();
    if (!metricId) {
      setStatus("Load a metric or enter a Metric ID before removing.");
      return;
    }

    const retireISO = els.metricRetireDate?.value || els.metricEffectiveDate?.value || currentDayISO();
    const result = retireMetricDefinition(metricId, retireISO);
    if (!result.ok) {
      setStatus(result.reason);
      return;
    }

    clearMetricEditor();
    loadDayIntoForm();
    setStatus(`Removed ${metricId} effective ${retireISO}.`);
  });

  els.metricsTable?.addEventListener("click", (evt) => {
    const loadBtn = evt.target.closest("button[data-load]");
    if (loadBtn) {
      const metricId = loadBtn.getAttribute("data-load");
      const fromISO = loadBtn.getAttribute("data-from");
      const base = metricDefinitions.find((def) => def.metric_id === metricId && def.active_from === fromISO);
      if (!base) return;
      fillMetricEditor(base);
      setStatus(`Loaded ${metricId} (${fromISO}) into editor.`);
      return;
    }

    const retireBtn = evt.target.closest("button[data-retire]");
    if (!retireBtn) return;

    const metricId = retireBtn.getAttribute("data-retire");
    const retireISO = els.metricRetireDate?.value || els.metricEffectiveDate?.value || currentDayISO();
    const result = retireMetricDefinition(metricId, retireISO);
    if (!result.ok) {
      setStatus(result.reason);
      return;
    }
    clearMetricEditor();
    loadDayIntoForm();
    setStatus(`Removed ${metricId} effective ${retireISO}.`);
  });

  // --- Init ---
  const todayISO = currentDayISO();
  els.dayDate.value = todayISO;
  if (els.metricEffectiveDate) els.metricEffectiveDate.value = todayISO;
  if (els.metricRetireDate) els.metricRetireDate.value = todayISO;
  if (els.metricEffectiveDate) els.metricEffectiveDate.min = todayISO;
  if (els.metricRetireDate) els.metricRetireDate.min = todayISO;
  setDaySavedPill(false);

  populateMetricTypeOptions();
  clearMetricEditor();
  setSettingsTab("general");
  renderMetricFields(todayISO);
  renderMetricManagementTable();
  loadDayIntoForm();
  setStatus(`Ready. Log today (${todayISO}) and hit Save day.`);
})();
