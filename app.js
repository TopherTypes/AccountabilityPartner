/*
  Accountability Partner dashboard behavior.
  Handles local persistence, daily data entry, weekly aggregation, and JSON import/export.
*/

(() => {
  const STORAGE_KEY = "accountability_daily_scorecard_v1";
  const $ = (id) => document.getElementById(id);

  const els = {
    weekLabel: $("weekLabel"),
    dashWeekRange: $("dashWeekRange"),

    dayDate: $("dayDate"),
    oneSentence: $("oneSentence"),

    sleepHours: $("sleepHours"),
    caffeineDrinks: $("caffeineDrinks"),
    sugarBinge: $("sugarBinge"),
    movement: $("movement"),

    dwTech: $("dwTech"),
    dwCreative: $("dwCreative"),
    weightOptional: $("weightOptional"),
    artifactTech: $("artifactTech"),
    artifactCreative: $("artifactCreative"),

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

  function pad(n) { return String(n).padStart(2, "0"); }
  function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function parseISODate(s) { const [y,m,dd] = s.split("-").map(Number); return new Date(y, m-1, dd); }

  function startOfWeekMonday(d) {
    const day = d.getDay(); // Sun=0..Sat=6
    const diff = (day === 0) ? -6 : (1 - day);
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(12,0,0,0);
    return monday;
  }
  function endOfWeekSunday(monday) {
    const s = new Date(monday);
    s.setDate(monday.getDate() + 6);
    return s;
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? { days: {}, weeks: {} };
    } catch {
      return { days: {}, weeks: {} };
    }
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
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[c]);
  }

  function weekIdFromDayISO(dayISO) {
    const monday = startOfWeekMonday(parseISODate(dayISO));
    return toISODate(monday);
  }

  function currentDayISO() {
    const d = new Date();
    d.setHours(12,0,0,0);
    return toISODate(d);
  }

  function computeWeekSummary(store, weekMondayISO) {
    const monday = parseISODate(weekMondayISO);
    const sunday = endOfWeekSunday(monday);
    const days = [];

    for (let i=0; i<7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = toISODate(d);
      const entry = store.days[iso];
      if (entry) days.push(entry);
    }

    // Averages only over days where value is present.
    const sleepVals = days.map(d => d.physiology.sleep_hours).filter(v => v !== null && v !== undefined);
    const caffVals  = days.map(d => d.physiology.caffeine_drinks).filter(v => v !== null && v !== undefined);

    const avg = (arr) => arr.length ? (arr.reduce((a,b)=>a+b,0) / arr.length) : null;
    const sum = (arr) => arr.reduce((a,b)=>a+b,0);

    const sugarDays = days.filter(d => d.physiology.sugar_binge).length;
    const moveDays  = days.filter(d => d.physiology.movement_20m).length;

    const dwTechTotal = sum(days.map(d => d.execution.deep_work_tech ?? 0));
    const dwCreatTotal = sum(days.map(d => d.execution.deep_work_creative ?? 0));

    // Weekly structure is stored at week level (but editable from daily form)
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
        .sort((a,b) => (a.day.iso_date).localeCompare(b.day.iso_date)),
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
    els.daySavedPill.classList.remove("ok","warn");
    els.daySavedPill.classList.add(isSaved ? "ok" : "warn");
  }

  function clearForm(keepDate = true) {
    els.oneSentence.value = "";
    els.sleepHours.value = "";
    els.caffeineDrinks.value = "";
    els.sugarBinge.checked = false;
    els.movement.checked = false;
    els.dwTech.value = "";
    els.dwCreative.value = "";
    els.weightOptional.value = "";
    els.artifactTech.value = "";
    els.artifactCreative.value = "";
    if (!keepDate) els.dayDate.value = "";
    setDaySavedPill(false);
  }

  function getDayFormData(dayISO) {
    return {
      schema: "accountability_scorecard.day.v2",
      day: {
        iso_date: dayISO,
        week_monday: weekIdFromDayISO(dayISO)
      },
      physiology: {
        sleep_hours: numOrNull(els.sleepHours.value),
        caffeine_drinks: numOrNull(els.caffeineDrinks.value),
        sugar_binge: !!els.sugarBinge.checked,
        movement_20m: !!els.movement.checked,
        weight_optional: numOrNull(els.weightOptional.value)
      },
      execution: {
        deep_work_tech: intOrNull(els.dwTech.value) ?? 0,
        deep_work_creative: intOrNull(els.dwCreative.value) ?? 0,
        artifact_technical: (els.artifactTech.value || "").trim(),
        artifact_creative: (els.artifactCreative.value || "").trim()
      },
      reflection: {
        one_sentence: (els.oneSentence.value || "").trim()
      },
      meta: {
        saved_at_iso: new Date().toISOString()
      }
    };
  }

  function fillDayForm(entry) {
    els.oneSentence.value = entry.reflection?.one_sentence ?? "";
    els.sleepHours.value = valOrEmpty(entry.physiology?.sleep_hours);
    els.caffeineDrinks.value = valOrEmpty(entry.physiology?.caffeine_drinks);
    els.sugarBinge.checked = !!entry.physiology?.sugar_binge;
    els.movement.checked = !!entry.physiology?.movement_20m;
    els.weightOptional.value = valOrEmpty(entry.physiology?.weight_optional);

    els.dwTech.value = valOrEmpty(entry.execution?.deep_work_tech ?? 0);
    els.dwCreative.value = valOrEmpty(entry.execution?.deep_work_creative ?? 0);
    els.artifactTech.value = entry.execution?.artifact_technical ?? "";
    els.artifactCreative.value = entry.execution?.artifact_creative ?? "";
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

    // Sync weekly structure checkboxes
    els.prioritiesDefined.checked = !!s.structure.priorities_defined;
    els.twoCompleted.checked = !!s.structure.two_completed;
    els.weeklyReviewDone.checked = !!s.structure.weekly_review_done;

    // Render week days table
    els.weekDaysTable.innerHTML = "";
    const monday = parseISODate(weekMondayISO);
    for (let i=0; i<7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = toISODate(d);
      const entry = store.days[iso];

      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.innerHTML = `
        <td>${escapeHtml(iso)}</td>
        <td>${entry ? fmt(entry.physiology.sleep_hours) : "—"}</td>
        <td>${entry ? fmt(entry.physiology.caffeine_drinks) : "—"}</td>
        <td>${entry ? (entry.physiology.sugar_binge ? "Y" : "N") : "—"}</td>
        <td>${entry ? (entry.physiology.movement_20m ? "Y" : "N") : "—"}</td>
        <td>${entry ? fmt(entry.execution.deep_work_tech ?? 0) : "—"}</td>
        <td>${entry ? fmt(entry.execution.deep_work_creative ?? 0) : "—"}</td>
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
    // Build set of weeks present either via saved week structure or via any day entry
    const weekSet = new Set(Object.keys(store.weeks || {}));
    for (const dayISO of Object.keys(store.days || {})) {
      weekSet.add(weekIdFromDayISO(dayISO));
    }

    const weeks = Array.from(weekSet).sort((a,b) => b.localeCompare(a)).slice(0, 10);
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
        <td><span class="pill ${s.structure.score>=2 ? "ok":"no"}">${escapeHtml(String(s.structure.score))}/3</span></td>
        <td class="right"><button class="ghost" data-export="${escapeHtml(weekMondayISO)}">JSON</button></td>
      `;

      tr.addEventListener("click", (evt) => {
        const btn = evt.target.closest("button[data-export]");
        if (btn) return;
        // Jump dashboard to that week by setting the selected day to the Monday
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
    const t = (entry.execution?.artifact_technical || "").trim();
    const c = (entry.execution?.artifact_creative || "").trim();
    const parts = [];
    if (t) parts.push(`T: ${t}`);
    if (c) parts.push(`C: ${c}`);
    return parts.join(" | ").slice(0, 80);
  }

  function validateDay(entry) {
    const sh = entry.physiology.sleep_hours;
    const cf = entry.physiology.caffeine_drinks;
    const dwT = entry.execution.deep_work_tech;
    const dwC = entry.execution.deep_work_creative;

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

    // load weekly structure into checkboxes
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

  // --- Events ---
  els.dayDate.addEventListener("change", () => {
    // snap to local date, load its data, render dashboard
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

  // structure checkboxes apply to the week; persist them immediately when toggled
  [els.prioritiesDefined, els.twoCompleted, els.weeklyReviewDone].forEach(cb => {
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
        saveStore(store);
        els.dayDate.value = parsed.day.iso_date;
        loadDayIntoForm();
        setStatus(`Imported day ${parsed.day.iso_date}.`);
      } else if (parsed?.schema === "accountability_scorecard.week.v2" && parsed?.week?.start_monday) {
        // Merge week structure and days
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
        saveStore(store);
        els.dayDate.value = weekMondayISO;
        loadDayIntoForm();
        setStatus(`Imported week ${weekMondayISO}.`);
      } else if (parsed?.schema === "accountability_scorecard.all.v2" && (parsed.days || parsed.weeks)) {
        // Merge all
        for (const [k,v] of Object.entries(parsed.days || {})) store.days[k] = v;
        for (const [k,v] of Object.entries(parsed.weeks || {})) store.weeks[k] = v;
        saveStore(store);
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

  // Ensure a dashboard exists on first load
  loadDayIntoForm();
  setStatus(`Ready. Log today (${todayISO}) and hit Save day.`);
})();
