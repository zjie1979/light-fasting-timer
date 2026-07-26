(function () {
  "use strict";

  const STORAGE_KEY = "lightFastingTimer.v1";
  const VERSION = "20260726t5";
  const DEFAULT_RESCUE_STEPS = [
    "先喝无热量的水",
    "再喝低卡的饮料",
    "最后吃番茄、黄瓜",
    "然后再忍30分钟"
  ];
  const els = {
    status: document.getElementById("fastStatus"),
    countdown: document.getElementById("countdown"),
    currentTimeHome: document.getElementById("currentTimeHome"),
    currentTimeTimer: document.getElementById("currentTimeTimer"),
    timerLabel: document.getElementById("timerLabel"),
    timerSubtitle: document.getElementById("timerSubtitle"),
    progressFill: document.getElementById("progressFill"),
    progressText: document.getElementById("progressText"),
    startTime: document.getElementById("startTime"),
    endTime: document.getElementById("endTime"),
    startButton: document.getElementById("startButton"),
    finishButton: document.getElementById("finishButton"),
    formHint: document.getElementById("formHint"),
    rescueList: document.getElementById("rescueList"),
    rescueEditButton: document.getElementById("rescueEditButton"),
    rescueEditor: document.getElementById("rescueEditor"),
    rescueSaveButton: document.getElementById("rescueSaveButton"),
    rescueResetButton: document.getElementById("rescueResetButton"),
    rescueLatest: document.getElementById("rescueLatest"),
    rescueInputs: [
      document.getElementById("rescueStep1"),
      document.getElementById("rescueStep2"),
      document.getElementById("rescueStep3"),
      document.getElementById("rescueStep4")
    ],
    homeTodayTotal: document.getElementById("homeTodayTotal"),
    todayTotal: document.getElementById("todayTotal"),
    plannedDuration: document.getElementById("plannedDuration"),
    statTodayTotal: document.getElementById("statTodayTotal"),
    statSevenDayAverage: document.getElementById("statSevenDayAverage"),
    statSessionAverage: document.getElementById("statSessionAverage"),
    statSessionCount: document.getElementById("statSessionCount"),
    historyList: document.getElementById("historyList"),
    clearButton: document.getElementById("clearButton")
  };

  const state = loadState();
  let tickHandle = 0;

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        active: parsed.active || null,
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        rescueSteps: normalizeRescueSteps(parsed.rescueSteps),
        rescueCheckins: normalizeRescueCheckins(parsed.rescueCheckins)
      };
    } catch (error) {
      return {
        active: null,
        sessions: [],
        rescueSteps: DEFAULT_RESCUE_STEPS.slice(),
        rescueCheckins: []
      };
    }
  }

  function normalizeRescueSteps(value) {
    if (!Array.isArray(value)) {
      return DEFAULT_RESCUE_STEPS.slice();
    }
    return DEFAULT_RESCUE_STEPS.map((fallback, index) => {
      const text = String(value[index] || "").trim();
      return text || fallback;
    });
  }

  function normalizeRescueCheckins(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item) => {
      if (typeof item === "string") {
        return {
          createdAt: item,
          stepIndex: null,
          stepLabel: "应急打卡"
        };
      }

      if (!item || typeof item !== "object") {
        return null;
      }

      const stepIndex = Number.isInteger(item.stepIndex) && item.stepIndex >= 0 && item.stepIndex < DEFAULT_RESCUE_STEPS.length
        ? item.stepIndex
        : null;
      const fallbackLabel = stepIndex === null ? "应急打卡" : DEFAULT_RESCUE_STEPS[stepIndex];
      return {
        createdAt: item.createdAt,
        stepIndex,
        stepLabel: String(item.stepLabel || fallbackLabel).trim() || fallbackLabel
      };
    }).filter((item) => item && item.createdAt && !Number.isNaN(new Date(item.createdAt).getTime()))
      .slice(0, 60);
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function toInputValue(date) {
    return [
      date.getFullYear(),
      "-",
      pad(date.getMonth() + 1),
      "-",
      pad(date.getDate()),
      "T",
      pad(date.getHours()),
      ":",
      pad(date.getMinutes())
    ].join("");
  }

  function parseInput(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDuration(ms) {
    const safeMs = Math.max(0, ms);
    const totalMinutes = Math.round(safeMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}小时${minutes}分`;
  }

  function formatClock(ms) {
    const safeMs = Math.max(0, ms);
    const totalSeconds = Math.floor(safeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  function formatDateKey(date) {
    return [
      date.getFullYear(),
      "-",
      pad(date.getMonth() + 1),
      "-",
      pad(date.getDate())
    ].join("");
  }

  function formatShortDate(date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function formatTime(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatCurrentTime(date) {
    return `${formatShortDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function formatDateTime(date) {
    return `${formatShortDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function splitDurationByDay(startDate, endDate) {
    const result = new Map();
    let cursor = new Date(startDate);
    const end = new Date(endDate);

    while (cursor < end) {
      const nextMidnight = new Date(cursor);
      nextMidnight.setHours(24, 0, 0, 0);
      const sliceEnd = nextMidnight < end ? nextMidnight : end;
      const key = formatDateKey(cursor);
      result.set(key, (result.get(key) || 0) + (sliceEnd - cursor));
      cursor = sliceEnd;
    }

    return result;
  }

  function completedSessions() {
    return state.sessions
      .filter((session) => session.startedAt && session.endedAt)
      .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));
  }

  function getDailyTotals() {
    const totals = new Map();
    for (const session of completedSessions()) {
      const start = new Date(session.startedAt);
      const end = new Date(session.endedAt);
      for (const [key, value] of splitDurationByDay(start, end)) {
        totals.set(key, (totals.get(key) || 0) + value);
      }
    }

    if (state.active) {
      const now = new Date();
      const start = new Date(state.active.startedAt);
      for (const [key, value] of splitDurationByDay(start, now)) {
        totals.set(key, (totals.get(key) || 0) + value);
      }
    }

    return totals;
  }

  function setHint(message, isError) {
    els.formHint.textContent = message;
    els.formHint.classList.toggle("error", Boolean(isError));
  }

  function setDefaultTimes() {
    const now = new Date();
    now.setSeconds(0, 0);
    const end = new Date(now.getTime() + 16 * 60 * 60 * 1000);

    if (!els.startTime.value) {
      els.startTime.value = toInputValue(now);
    }
    if (!els.endTime.value) {
      els.endTime.value = toInputValue(end);
    }
  }

  function readPlan() {
    const start = parseInput(els.startTime.value);
    const end = parseInput(els.endTime.value);
    if (!start || !end) {
      return { error: "请先填好开始和结束时间。" };
    }
    if (end <= start) {
      return { error: "结束时间必须晚于开始时间，跨天请直接选择第二天日期。" };
    }
    return { start, end };
  }

  function startFast() {
    const plan = readPlan();
    if (plan.error) {
      setHint(plan.error, true);
      return;
    }

    state.active = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      startedAt: plan.start.toISOString(),
      plannedEndAt: plan.end.toISOString(),
      createdAt: new Date().toISOString()
    };
    saveState();
    setHint("本次禁食已开始，倒计时会自动更新。", false);
    render();
  }

  function finishFast() {
    if (!state.active) {
      setHint("当前没有正在进行的禁食。", true);
      return;
    }

    const now = new Date();
    const start = new Date(state.active.startedAt);
    if (now <= start) {
      setHint("结束时间不能早于开始时间。", true);
      return;
    }

    state.sessions.push({
      id: state.active.id,
      startedAt: state.active.startedAt,
      plannedEndAt: state.active.plannedEndAt,
      endedAt: now.toISOString()
    });
    state.active = null;
    saveState();
    setHint("已记录本次禁食。", false);
    render();
  }

  function clearHistory() {
    if (!state.sessions.length && !state.active) {
      return;
    }
    const ok = window.confirm("确定清空全部禁食记录吗？");
    if (!ok) {
      return;
    }
    state.sessions = [];
    state.active = null;
    saveState();
    render();
  }

  function checkinRescue(stepIndex) {
    const safeIndex = Number(stepIndex);
    if (!Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex >= state.rescueSteps.length) {
      return;
    }

    state.rescueCheckins.unshift({
      createdAt: new Date().toISOString(),
      stepIndex: safeIndex,
      stepLabel: state.rescueSteps[safeIndex]
    });
    state.rescueCheckins = state.rescueCheckins.slice(0, 60);
    saveState();
    renderRescue();
  }

  function saveRescueSteps() {
    state.rescueSteps = normalizeRescueSteps(els.rescueInputs.map((input) => input.value));
    saveState();
    els.rescueEditor.hidden = true;
    renderRescue();
  }

  function resetRescueSteps() {
    state.rescueSteps = DEFAULT_RESCUE_STEPS.slice();
    saveState();
    syncRescueInputs();
    renderRescue();
  }

  function applyQuickDuration(hours) {
    const start = parseInput(els.startTime.value) || new Date();
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + Number(hours) * 60 * 60 * 1000);
    els.startTime.value = toInputValue(start);
    els.endTime.value = toInputValue(end);
    updatePlannedDuration();
  }

  function updatePlannedDuration() {
    const plan = readPlan();
    if (plan.error) {
      els.plannedDuration.textContent = "0小时0分";
      return;
    }
    els.plannedDuration.textContent = formatDuration(plan.end - plan.start);
  }

  function renderTimer() {
    const now = new Date();
    const currentTimeText = formatCurrentTime(now);
    els.currentTimeHome.textContent = currentTimeText;
    els.currentTimeTimer.textContent = currentTimeText;
    updatePlannedDuration();

    if (!state.active) {
      els.status.textContent = "未开始";
      els.timerLabel.textContent = "距离结束";
      els.countdown.textContent = "00:00:00";
      els.timerSubtitle.textContent = "设置禁食时间后开始";
      els.progressFill.style.width = "0%";
      els.progressText.textContent = "0%";
      els.finishButton.disabled = false;
      return;
    }

    const start = new Date(state.active.startedAt);
    const end = new Date(state.active.plannedEndAt);
    const total = end - start;
    const elapsed = now - start;
    const remaining = end - now;
    const progress = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;

    els.status.textContent = remaining > 0 ? "进行中" : "已到点";
    els.timerLabel.textContent = remaining > 0 ? "距离结束" : "已超过";
    els.countdown.textContent = formatClock(Math.abs(remaining));
    els.timerSubtitle.textContent = `${formatShortDate(start)} ${formatTime(start)} - ${formatShortDate(end)} ${formatTime(end)}`;
    els.progressFill.style.width = `${progress.toFixed(1)}%`;
    els.progressText.textContent = `${Math.round(progress)}%`;
  }

  function renderStats() {
    const totals = getDailyTotals();
    const todayKey = formatDateKey(new Date());
    const todayMs = totals.get(todayKey) || 0;
    const sessions = completedSessions();
    const totalSessionMs = sessions.reduce((sum, item) => sum + (new Date(item.endedAt) - new Date(item.startedAt)), 0);
    const sessionAverage = sessions.length ? totalSessionMs / sessions.length : 0;

    let sevenDayMs = 0;
    for (let i = 0; i < 7; i += 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      sevenDayMs += totals.get(formatDateKey(date)) || 0;
    }

    els.todayTotal.textContent = formatDuration(todayMs);
    els.homeTodayTotal.textContent = formatDuration(todayMs);
    els.statTodayTotal.textContent = formatDuration(todayMs);
    els.statSevenDayAverage.textContent = formatDuration(sevenDayMs / 7);
    els.statSessionAverage.textContent = formatDuration(sessionAverage);
    els.statSessionCount.textContent = `${sessions.length}次`;
    renderHistory(totals, sessions);
  }

  function renderHistory(totals, sessions) {
    if (!sessions.length && !state.active) {
      els.historyList.innerHTML = '<div class="empty-state">还没有记录，完成一次禁食后这里会显示。</div>';
      return;
    }

    const rows = [];
    if (state.active) {
      const start = new Date(state.active.startedAt);
      const now = new Date();
      rows.push(`
        <article class="history-item">
          <div>
            <time>${formatShortDate(start)} 正在进行</time>
            <small>${formatTime(start)} 开始，到现在 ${formatDuration(now - start)}</small>
          </div>
          <strong>进行中</strong>
        </article>
      `);
    }

    const dailyRows = Array.from(totals.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 21);

    for (const [dateKey, ms] of dailyRows) {
      const daySessions = sessions.filter((session) => {
        const start = new Date(session.startedAt);
        const end = new Date(session.endedAt);
        return splitDurationByDay(start, end).has(dateKey);
      }).length;
      rows.push(`
        <article class="history-item">
          <div>
            <time>${dateKey}</time>
            <small>${daySessions}次记录，跨天禁食会拆到对应日期</small>
          </div>
          <strong>${formatDuration(ms)}</strong>
        </article>
      `);
    }

    els.historyList.innerHTML = rows.join("");
  }

  function renderRescue() {
    els.rescueList.innerHTML = state.rescueSteps.map((step, index) => `
      <li>
        <div class="rescue-main">
          <span class="rescue-number">${index + 1}</span>
          <strong>${escapeHtml(step)}</strong>
        </div>
        <div class="rescue-action-row">
          <small>${escapeHtml(getRescueStepTime(index))}</small>
          <button class="rescue-checkin" type="button" data-rescue-index="${index}">打卡</button>
        </div>
      </li>
    `).join("");
    if (els.rescueEditor.hidden) {
      syncRescueInputs();
    }
    const latest = state.rescueCheckins[0];
    els.rescueLatest.textContent = latest ? `${latest.stepLabel} ${formatDateTime(new Date(latest.createdAt))}` : "还没有";
  }

  function getRescueStepTime(index) {
    const checkin = state.rescueCheckins.find((item) => item.stepIndex === index);
    return checkin ? `上次：${formatDateTime(new Date(checkin.createdAt))}` : "还没有打卡";
  }

  function syncRescueInputs() {
    els.rescueInputs.forEach((input, index) => {
      input.value = state.rescueSteps[index];
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function render() {
    renderTimer();
    renderStats();
    renderRescue();
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;
        document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
        document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
        document.getElementById(`${target}Page`).classList.add("active");
      });
    });

    document.querySelectorAll("[data-hours]").forEach((button) => {
      button.addEventListener("click", () => applyQuickDuration(button.dataset.hours));
    });

    els.startButton.addEventListener("click", startFast);
    els.finishButton.addEventListener("click", finishFast);
    els.clearButton.addEventListener("click", clearHistory);
    els.rescueList.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const button = event.target.closest("[data-rescue-index]");
      if (!button) {
        return;
      }
      checkinRescue(Number(button.dataset.rescueIndex));
    });
    els.rescueEditButton.addEventListener("click", () => {
      if (els.rescueEditor.hidden) {
        syncRescueInputs();
      }
      els.rescueEditor.hidden = !els.rescueEditor.hidden;
    });
    els.rescueSaveButton.addEventListener("click", saveRescueSteps);
    els.rescueResetButton.addEventListener("click", resetRescueSteps);
    els.startTime.addEventListener("change", updatePlannedDuration);
    els.endTime.addEventListener("change", updatePlannedDuration);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  setDefaultTimes();
  bindEvents();
  registerServiceWorker();
  render();
  tickHandle = window.setInterval(render, 1000);
  window.addEventListener("beforeunload", () => window.clearInterval(tickHandle));

  window.lightFastingDebug = { state, VERSION };
})();
