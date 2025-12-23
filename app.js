// Режимы анализа соответствуют вкладкам интерфейса
const MODE = {
  STATUS: "status",
  PAIR: "pair",
  LINK: "link",
};

// Конфигурация селекторов формируется один раз и переиспользуется
const selectorsConfig = [
  { key: "known", title: "Известные параметры J", modes: [MODE.STATUS] },
  { key: "required", title: "Требуемые параметры T/τ", modes: [MODE.STATUS] },
  { key: "i", title: "Исходные параметры I", modes: [MODE.PAIR] },
  { key: "t", title: "Требуемые параметры T", modes: [MODE.PAIR] },
  { key: "ij", title: "Параметры Iij", modes: [MODE.LINK] },
  { key: "ik", title: "Параметры Iik", modes: [MODE.LINK] },
  { key: "analysis", title: "Параметры вне J (τ)", modes: [MODE.LINK] },
];

const MAX_ENUM_ROWS = 15;

// DOM-узлы и состояние приложения.
// Важно: этот файл импортируется тестами (Vitest/JSDOM). Поэтому все обращения к DOM
// выполняются только после проверки, что нужные элементы реально существуют.
let rowsInput = null;
let colsInput = null;
let matrixTableRoot = null;
let selectorContainer = null;
let resultsView = null;
let analyzeButton = null;
let resetButton = null;
let themeToggle = null;
let fixedInputsToggle = null;
let assumptionsBox = null;
let selectorTemplate = null;
let panes = null;
let splitterHandles = [];

const CONTROL_WIDTH = { min: 220, max: 420 };
const RESULTS_WIDTH = { min: 240, max: 420 };
const THEME_KEY = "deficit-app-theme";
let themeMediaQuery = null;
let userTheme = null;
const hoverState = { row: null, col: null };
let matrixHoverRefs = null;

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // В режиме file:// или при жёстких настройках приватности доступ к storage может быть запрещён.
  }
}

let currentMode = MODE.STATUS;
let matrix = createMatrix(0, 0);
let selectors = {};

function bindDomRefs() {
  rowsInput = document.getElementById("rowsInput");
  colsInput = document.getElementById("colsInput");
  matrixTableRoot = document.getElementById("matrixTable");
  selectorContainer = document.getElementById("selectorContainer");
  resultsView = document.getElementById("resultsView");
  analyzeButton = document.getElementById("analyzeButton");
  resetButton = document.getElementById("resetButton");
  themeToggle = document.getElementById("themeToggle");
  fixedInputsToggle = document.getElementById("fixedInputsToggle");
  assumptionsBox = document.getElementById("assumptionsBox");
  selectorTemplate = document.getElementById("selectorTemplate");
  panes = {
    controls: document.querySelector('[data-pane="controls"]'),
    matrix: document.querySelector('[data-pane="matrix"]'),
    results: document.querySelector('[data-pane="results"]'),
  };
  splitterHandles = Array.from(document.querySelectorAll('.splitter-handle'));
}

function hasAppDom() {
  // Минимально необходимые элементы для запуска приложения.
  return Boolean(
    rowsInput &&
      colsInput &&
      matrixTableRoot &&
      selectorContainer &&
      resultsView &&
      analyzeButton &&
      resetButton &&
      selectorTemplate &&
      panes?.controls &&
      panes?.results
  );
}

function boot() {
  bindDomRefs();
  if (!hasAppDom()) {
    return;
  }

  themeMediaQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : { matches: false };
  userTheme = safeLocalStorageGet(THEME_KEY);

  matrix = createMatrix(Number(rowsInput.value), Number(colsInput.value));
  selectors = buildSelectors();
  applyTheme(userTheme || (themeMediaQuery.matches ? "dark" : "light"));

  if (!userTheme) {
    const handleSystemTheme = (event) => {
      if (userTheme) {
        return;
      }
      applyTheme(event.matches ? "dark" : "light");
    };
    if (themeMediaQuery.addEventListener) {
      themeMediaQuery.addEventListener("change", handleSystemTheme);
    } else if (themeMediaQuery.addListener) {
      themeMediaQuery.addListener(handleSystemTheme);
    }
  }

  init();
}

function bootIfDomReady() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const start = () => {
    bindDomRefs();
    if (hasAppDom()) {
      boot();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

bootIfDomReady();

function init() {
  // Подписываемся на все пользовательские действия (переключения режимов, размеры и т.п.)
  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        currentMode = radio.value;
        updateSelectorVisibility();
        if (currentMode === MODE.LINK) {
          autoFillAnalysis();
        }
        renderResultsMessage("Выберите параметры и нажмите «Анализировать».");
      }
    });
  });

  rowsInput.addEventListener("change", () => {
    const rows = clamp(Number(rowsInput.value), 1, 30);
    rowsInput.value = rows;
    resizeMatrix(rows, matrix[0]?.length ?? 0);
    refreshSelectors();
    renderMatrix();
    if (currentMode === MODE.LINK) {
      autoFillAnalysis();
    }
  });

  colsInput.addEventListener("change", () => {
    const cols = clamp(Number(colsInput.value), 1, 30);
    colsInput.value = cols;
    resizeMatrix(matrix.length, cols);
    refreshSelectors();
    renderMatrix();
    if (currentMode === MODE.LINK) {
      autoFillAnalysis();
    }
  });

  analyzeButton.addEventListener("click", runAnalysis);
  resetButton.addEventListener("click", resetState);
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const nextTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      safeLocalStorageSet(THEME_KEY, nextTheme);
      userTheme = nextTheme;
    });
  }
  initSplitter();

  refreshSelectors();
  updateSelectorVisibility();
  renderMatrix();
}

function applyTheme(mode) {
  // Сохраняем выбранную тему и синхронизируем подписи
  document.documentElement.setAttribute("data-theme", mode);
  if (themeToggle) {
    themeToggle.textContent = mode === "dark" ? "Светлая тема" : "Тёмная тема";
  }
}

function buildSelectors() {
  // Генерируем карточки выбора параметров из template, чтобы не дублировать разметку
  const map = {};
  selectorsConfig.forEach((cfg) => {
    const node = selectorTemplate.content.firstElementChild.cloneNode(true);
    const titleEl = node.querySelector(".selector-title");
    const countEl = node.querySelector("[data-count]");
    const gridEl = node.querySelector("[data-grid]");

    titleEl.textContent = cfg.title;
    selectorContainer.appendChild(node);

    map[cfg.key] = {
      ...cfg,
      element: node,
      countEl,
      gridEl,
      selected: new Set(),
    };
  });
  return map;
}

function refreshSelectors() {
  const names = parameterNames();
  Object.values(selectors).forEach((selector) => {
    selector.selected = new Set(
      [...selector.selected].filter((idx) => idx < names.length)
    );
    renderSelectorOptions(selector, names);
    updateSelectorCount(selector);
  });
}

function renderSelectorOptions(selector, names) {
  selector.gridEl.innerHTML = "";
  names.forEach((name, idx) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = idx;
    checkbox.checked = selector.selected.has(idx);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selector.selected.add(idx);
      } else {
        selector.selected.delete(idx);
      }
      updateSelectorCount(selector);
      if (currentMode === MODE.LINK && (selector.key === "ij" || selector.key === "ik")) {
        autoFillAnalysis();
      }
    });

    label.appendChild(checkbox);
    const span = document.createElement("span");
    span.textContent = name;
    label.appendChild(span);
    selector.gridEl.appendChild(label);
  });
}

function updateSelectorCount(selector) {
  selector.countEl.textContent = `${selector.selected.size} выбрано`;
}

function updateSelectorVisibility() {
  Object.values(selectors).forEach((selector) => {
    const visible = selector.modes.includes(currentMode);
    selector.element.classList.toggle("hidden", !visible);
  });

  if (assumptionsBox) {
    assumptionsBox.classList.toggle("is-hidden", currentMode === MODE.LINK);
  }
}

function resetState() {
  // Возвращаем приложение к настройкам по умолчанию
  rowsInput.value = 3;
  colsInput.value = 6;
  matrix = createMatrix(3, 6);
  Object.values(selectors).forEach((selector) => {
    selector.selected.clear();
  });
  refreshSelectors();
  renderMatrix();
  document.querySelector('input[name="mode"][value="status"]').checked = true;
  currentMode = MODE.STATUS;
  updateSelectorVisibility();
  renderResultsMessage("Состояние сброшено. Введите новые данные.");
}

function initSplitter() {
  if (!splitterHandles.length) {
    return;
  }
  let active = null;

  const onMove = (event) => {
    if (!active) {
      return;
    }
    const delta = event.clientX - active.startX;
    if (active.type === "left") {
      const nextWidth = clamp(active.startWidth + delta, CONTROL_WIDTH.min, CONTROL_WIDTH.max);
      panes.controls.style.flex = `0 0 ${nextWidth}px`;
    } else if (active.type === "right") {
      const nextWidth = clamp(active.startWidth - delta, RESULTS_WIDTH.min, RESULTS_WIDTH.max);
      panes.results.style.flex = `0 0 ${nextWidth}px`;
    }
  };

  const stopDrag = () => {
    if (!active) {
      return;
    }
    active = null;
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", stopDrag);
  };

  splitterHandles.forEach((handle) => {
    handle.addEventListener("mousedown", (event) => {
      const type = handle.dataset.handle;
      const startWidth = type === "left"
        ? panes.controls.getBoundingClientRect().width
        : panes.results.getBoundingClientRect().width;
      active = {
        type,
        startX: event.clientX,
        startWidth,
      };
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", stopDrag);
    });
  });
}

function renderMatrix() {
  // Перестраиваем таблицу матрицы, чтобы отражать текущее состояние данных
  clearMatrixHover();
  matrixHoverRefs = null;
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(document.createElement("th"));
  const names = parameterNames();
  const columnHeaders = [];
  const columnCells = Array.from({ length: names.length }, () => []);
  const rowHeaders = [];
  const rowElements = [];
  names.forEach((name, idx) => {
    const th = document.createElement("th");
    th.textContent = name;
    th.dataset.col = idx;
    th.classList.add("col-label");
    columnHeaders.push(th);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  matrix.forEach((row, rowIdx) => {
    const tr = document.createElement("tr");
    const rowHeader = document.createElement("th");
    rowHeader.textContent = `F${rowIdx + 1}`;
    rowHeader.dataset.row = rowIdx;
    rowHeader.classList.add("row-label");
    rowHeaders.push(rowHeader);
    tr.appendChild(rowHeader);
    rowElements.push(tr);

    row.forEach((value, colIdx) => {
      const td = document.createElement("td");
      td.dataset.row = rowIdx;
      td.dataset.col = colIdx;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(value);
      const syncValue = () => {
        matrix[rowIdx][colIdx] = checkbox.checked ? 1 : 0;
      };
      checkbox.addEventListener("change", () => {
        syncValue();
      });
      td.addEventListener("click", (event) => {
        if (event.target === checkbox) {
          return;
        }
        checkbox.checked = !checkbox.checked;
        syncValue();
      });
      td.addEventListener("mouseenter", () => setMatrixHover(rowIdx, colIdx));
      td.appendChild(checkbox);
      tr.appendChild(td);
      columnCells[colIdx]?.push(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  matrixTableRoot.innerHTML = "";
  matrixTableRoot.appendChild(table);
  table.addEventListener("mouseleave", clearMatrixHover);
  matrixHoverRefs = {
    rowHeaders,
    columnHeaders,
    columnCells,
    rowElements,
  };
}

function setMatrixHover(rowIdx, colIdx) {
  if (!matrixHoverRefs) {
    return;
  }
  if (hoverState.row !== rowIdx) {
    if (hoverState.row !== null) {
      removeRowHighlight(hoverState.row);
    }
    if (rowIdx !== null) {
      applyRowHighlight(rowIdx);
    }
    hoverState.row = rowIdx;
  }
  if (hoverState.col !== colIdx) {
    if (hoverState.col !== null) {
      removeColumnHighlight(hoverState.col);
    }
    if (colIdx !== null) {
      applyColumnHighlight(colIdx);
    }
    hoverState.col = colIdx;
  }
}

function clearMatrixHover() {
  if (!matrixHoverRefs) {
    hoverState.row = null;
    hoverState.col = null;
    return;
  }
  if (hoverState.row !== null) {
    removeRowHighlight(hoverState.row);
    hoverState.row = null;
  }
  if (hoverState.col !== null) {
    removeColumnHighlight(hoverState.col);
    hoverState.col = null;
  }
}

function applyRowHighlight(rowIdx) {
  matrixHoverRefs.rowHeaders[rowIdx]?.classList.add("is-highlighted");
  matrixHoverRefs.rowElements[rowIdx]?.classList.add("is-row-highlight");
}

function removeRowHighlight(rowIdx) {
  matrixHoverRefs.rowHeaders[rowIdx]?.classList.remove("is-highlighted");
  matrixHoverRefs.rowElements[rowIdx]?.classList.remove("is-row-highlight");
}

function applyColumnHighlight(colIdx) {
  matrixHoverRefs.columnHeaders[colIdx]?.classList.add("is-highlighted");
  matrixHoverRefs.columnCells[colIdx]?.forEach((cell) => cell.classList.add("is-col-highlight"));
}

function removeColumnHighlight(colIdx) {
  matrixHoverRefs.columnHeaders[colIdx]?.classList.remove("is-highlighted");
  matrixHoverRefs.columnCells[colIdx]?.forEach((cell) => cell.classList.remove("is-col-highlight"));
}

function runAnalysis() {
  // Основная точка входа: извлекаем выбранные параметры, считаем дефициты и формируем отчёт
  const paramNames = parameterNames();
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  if (!rows || !cols) {
    renderResultsMessage("Матрица пуста. Задайте размерность модели.");
    return;
  }

  const report = [];
  const allParamIndices = allIndexRange(cols);
  let knownIndices = [];
  let knownNames = [];
  let tauRequestedIndices = [];
  let tauEffectiveIndices = [];
  let tauRequestedNames = [];
  let tauEffectiveNames = [];
  let tauOverlapNames = [];
  let universeIndices = [];
  let universeNames = [];
  let pairMetadata = null;

  if (currentMode === MODE.STATUS) {
    knownIndices = sortedIndices(selectors.known.selected);
    knownNames = knownIndices.map((idx) => paramNames[idx]);
    tauRequestedIndices = sortedIndices(selectors.required.selected);
    tauRequestedNames = tauRequestedIndices.map((idx) => paramNames[idx]);
    const overlap = tauRequestedIndices.filter((idx) => knownIndices.includes(idx));
    tauOverlapNames = overlap.map((idx) => paramNames[idx]);
    tauEffectiveIndices = tauRequestedIndices.filter((idx) => !knownIndices.includes(idx));
    tauEffectiveNames = tauEffectiveIndices.map((idx) => paramNames[idx]);
    report.push(`<h3>Тип задачи: определение статуса проектной задачи (даны J, требуется T/τ)</h3>`);
    report.push(`<p><strong>Известные параметры J:</strong> ${formatList(knownNames)}</p>`);
    report.push(`<p><strong>Требуемые параметры T (τ):</strong> ${formatList(tauRequestedNames)}</p>`);
    report.push(`<p><strong>Требуемые неизвестные T \\ J:</strong> ${formatList(tauEffectiveNames)}</p>`);
    if (tauOverlapNames.length) {
      report.push(
        `<p class="notice info">ℹ️ Параметры ${formatList(tauOverlapNames)} входят в J и считаются уже известными.</p>`
      );
    }
  } else if (currentMode === MODE.PAIR) {
    const iIndices = sortedIndices(selectors.i.selected);
    const tIndices = sortedIndices(selectors.t.selected);
    knownIndices = iIndices;
    knownNames = iIndices.map((idx) => paramNames[idx]);
    tauRequestedIndices = tIndices;
    tauRequestedNames = tIndices.map((idx) => paramNames[idx]);
    const overlap = tIndices.filter((idx) => iIndices.includes(idx));
    tauOverlapNames = overlap.map((idx) => paramNames[idx]);
    tauEffectiveIndices = tIndices.filter((idx) => !iIndices.includes(idx));
    tauEffectiveNames = tauEffectiveIndices.map((idx) => paramNames[idx]);

    pairMetadata = {
      overlapNames: tauOverlapNames,
    };

    report.push(`<h3>Тип задачи: анализ корректности пары (I, T)</h3>`);
    report.push(`<p><strong>Исходные параметры I:</strong> ${formatList(knownNames)}</p>`);
    report.push(`<p><strong>Требуемые параметры T:</strong> ${formatList(tauRequestedNames)}</p>`);
    report.push(`<p><strong>Требуемые неизвестные T \\ I:</strong> ${formatList(tauEffectiveNames)}</p>`);
    if (tauOverlapNames.length) {
      report.push(
        `<p class="notice info">ℹ️ Параметры ${formatList(tauOverlapNames)} входят в I и считаются известными.</p>`
      );
    }
  } else if (currentMode === MODE.LINK) {
    const ij = sortedIndices(selectors.ij.selected);
    const ik = sortedIndices(selectors.ik.selected);
    const union = Array.from(new Set([...ij, ...ik])).sort((a, b) => a - b);
    knownIndices = union;
    knownNames = union.map((idx) => paramNames[idx]);
    tauRequestedIndices = sortedIndices(selectors.analysis.selected);
    tauRequestedNames = tauRequestedIndices.map((idx) => paramNames[idx]);
    tauEffectiveIndices = tauRequestedIndices.filter((idx) => !knownIndices.includes(idx));
    tauEffectiveNames = tauEffectiveIndices.map((idx) => paramNames[idx]);
    report.push(`<h3>Тип задачи: выявление информационных связей между операциями S₁ⱼ и S₁ₖ (через χ(J))</h3>`);
    report.push(`<p><strong>Входы первой операции Iij:</strong> ${formatSet(ij, paramNames)}</p>`);
    report.push(`<p><strong>Входы второй операции Iik:</strong> ${formatSet(ik, paramNames)}</p>`);
    report.push(`<p><strong>J = Iij ∪ Iik:</strong> ${formatSet(union, paramNames)}</p>`);
    report.push(`<p><strong>Параметры вне J (τ):</strong> ${formatSet(tauEffectiveIndices, paramNames)}</p>`);
  } else {
    renderResultsMessage("Неизвестный режим анализа.");
    return;
  }

  universeIndices = allParamIndices.filter((idx) => !knownIndices.includes(idx));
  universeNames = universeIndices.map((idx) => paramNames[idx]);
  report.push(`<p><strong>Полное множество неизвестных после удаления J:</strong> U = P \\ J = ${formatList(universeNames)}</p>`);
  if (!universeIndices.length) {
    report.push(
      '<p class="notice info">ℹ️ Случай <code>U = P \\ J = ∅</code>: после удаления компонент J неизвестных параметров не остаётся. Далее метод дефицита применяется как структурная диагностика взаимозависимости внутри J (покрытие по U отсутствует).</p>'
    );
  }

  report.push(
    `<p><strong>Размерность модели:</strong> m = ${rows}, n = ${cols}</p>`
  );
  report.push(matrixAsciiBlock());

  if (rows > MAX_ENUM_ROWS) {
    report.push(
      `<p class="notice">⚠️ m = ${rows} слишком велико для полного перебора подмножеств строк (2^m). Для предотвращения зависания ограничение: m ≤ ${MAX_ENUM_ROWS}. Уменьшите число операций или используйте более малую модель.</p>`
    );
    resultsView.innerHTML = report.join("");
    return;
  }

  if (currentMode === MODE.PAIR && !tauEffectiveIndices.length) {
    report.push(
      '<p class="notice info">ℹ️ Тривиальный случай: <code>T \\ I = ∅</code> — все требуемые параметры уже заданы во входах <code>I</code>. Ниже всё равно вычисляется χ(J) для <code>J = I</code> (структурная диагностика по методу дефицита).</p>'
    );
  }
  if (currentMode === MODE.STATUS && !tauEffectiveIndices.length) {
    report.push(
      '<p class="notice info">ℹ️ Для данной постановки <code>T \\ J = ∅</code> (либо T/τ не задано, либо все выбранные параметры уже входят в J). Ниже всё равно вычисляется χ(J) по методу дефицита; проверка τ‑полноты в этом случае тривиальна.</p>'
    );
  }

  const zeroRows = universeIndices.length
    ? matrix
        .map((row, idx) => ({ row, idx }))
        .filter(({ row }) => universeIndices.every((col) => row[col] === 0))
        .map(({ idx }) => idx)
    : [];

  if (zeroRows.length) {
    report.push(
      `<p class="notice info">ℹ️ Строки ${indicesToLabels(
        zeroRows,
        "F"
      )} не затрагивают множество неизвестных <code>U = P \\ J</code> (по всем столбцам из U в них стоят нули). При полном переборе они всё равно учитываются, так как могут входить в L и влиять на <code>|L|</code> и <code>d(L)</code>.</p>`
    );
  }

  const {
    maxDeficit,
    subsets,
  } = enumerateDeficits(matrix, universeIndices);

  const chiType = determineChi(maxDeficit);
  const statusType = determineStatus(maxDeficit, tauEffectiveIndices, subsets, {
    assumeFixedInputs: Boolean(fixedInputsToggle?.checked),
  });

  report.push(`<p><strong>Максимальный дефицит:</strong> <code>max d(L) = ${maxDeficit}</code></p>`);
  report.push(`<p><strong>Состояние χ(J):</strong> <code>${chiType}</code></p>`);

  if (!subsets.length) {
    report.push(
      '<p class="notice">Списки подмножеств L не сформированы (проверьте матрицу).</p>'
    );
    resultsView.innerHTML = report.join("");
    return;
  }

  const Lcrit = pickCritical(subsets);
  if (Lcrit) {
    const rowsLabel = indicesToLabels(Lcrit.rows, "F");
    const PofL = paramsOfRows(matrix, Lcrit.rows);
    const phiSt = PofL.filter((idx) => knownIndices.includes(idx));

    report.push(`<p><strong>Критическое множество:</strong> <code>L* = {${rowsLabel}}</code></p>`);

    if (maxDeficit > 0) {
      report.push(`<p><strong>St(J+):</strong> <code>${maxDeficit}</code></p>`);
      report.push(`<p><strong>ΦSt(J+)=J ∩ P(L*):</strong> ${formatSet(phiSt, paramNames)}</p>`);
    } else if (maxDeficit < 0) {
      const lambdaSize = -maxDeficit;
      const lambdaOne = Lcrit.covered.slice(0, lambdaSize);
      report.push(`<p><strong>|Λ(J−)|:</strong> <code>${lambdaSize}</code> (минимальное дополнение до корректности)</p>`);
      report.push(`<p><strong>Кандидаты для добавления в J (из σ(L*,J)):</strong> ${formatSet(Lcrit.covered, paramNames)}</p>`);
      report.push(`<p><strong>Пример варианта Λ(J−):</strong> ${formatSet(lambdaOne, paramNames)}</p>`);
    }

    const LN = allIndexRange(rows);
    const LnoDef = LN.filter((rowIdx) => !Lcrit.rows.includes(rowIdx));
    report.push(
      `<p><strong>Дополнение к L*:</strong> <code>L̄ = {${indicesToLabels(
        LnoDef,
        "F"
      )}}</code> (<code>L̄ = LN \\ L*</code>)</p>`
    );
  }

  if (maxDeficit === 0) {
    const L0 = pickL0ByTau(subsets, tauEffectiveIndices);
    if (L0) {
      const l0Label = indicesToLabels(L0.rows, "F");
      const title = tauEffectiveIndices.length
        ? "L0 (для проверки τ)"
        : "L0 (одно из L с d(L)=0)";
      report.push(`<p><strong>${title}:</strong> <code>{${l0Label}}</code></p>`);
      report.push(`<p><strong>σ(L0,J):</strong> ${formatSet(L0.covered, paramNames)}</p>`);
    }
  }

  const subsetLines = subsets.slice(0, 10).map((info) => {
    const rowsLabel = indicesToLabels(info.rows, "F");
    const coveredSet = formatSet(info.covered, paramNames);
    return `<li><code>L = {${rowsLabel}}</code> → <code>σ(L,J) = </code>${coveredSet}; <code>d(L) = ${info.deficit}</code></li>`;
  });
  if (subsets.length > 10) {
    subsetLines.push(
      `<li>… и ещё ${subsets.length - 10} набор(ов) со значением <code>d(L) = ${maxDeficit}</code></li>`
    );
  }
  report.push("<p><strong>Подмножества строк с максимальным дефицитом:</strong></p>");
  report.push(`<ul>${subsetLines.join("")}</ul>`);

  const conclusion = buildConclusion(currentMode, statusType, {
    pair: pairMetadata,
    link: { chiType },
    maxDeficit,
    chiType,
  });
  report.push(`<p><strong>Вывод:</strong> ${conclusion}</p>`);

  resultsView.innerHTML = report.join("");
}

function matrixAsciiBlock() {
  // Формируем компактное ASCII-представление матрицы для блока отчёта
  const paramNames = parameterNames();
  if (!matrix.length || !paramNames.length) {
    return "<p>Матрица не задана.</p>";
  }
  const rowNames = matrix.map((_, idx) => `F${idx + 1}`);
  const colWidths = [Math.max(3, ...rowNames.map((name) => name.length))];
  paramNames.forEach((name) => colWidths.push(Math.max(3, name.length)));

  const horizontal = (char) => `+${colWidths.map((w) => char.repeat(w + 2)).join("+")}+`;

  const headerCells = [centerText("", colWidths[0])].concat(
    paramNames.map((name, idx) => centerText(name, colWidths[idx + 1]))
  );
  const lines = [horizontal("-"), `|${headerCells.join("|")}|`, horizontal("=")];

  matrix.forEach((row, rowIdx) => {
    const cells = [centerText(rowNames[rowIdx], colWidths[0])];
    row.forEach((value, colIdx) => {
      cells.push(centerText(String(value), colWidths[colIdx + 1]));
    });
    lines.push(`|${cells.join("|")}|`);
    lines.push(horizontal("-"));
  });

  return `<pre>${lines.join("\n")}</pre>`;
}

function centerText(text, width) {
  const pad = Math.max(width - text.length, 0);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ` ${" ".repeat(left)}${text}${" ".repeat(right)} `;
}

function enumerateDeficits(matrixData, universeIndices) {
  // По методике дефицита: d(L) = |L| - |σ(L, J)|,
  // где σ(L, J) — множество всех переменных из U = P \ J, затронутых строками L.
  if (!matrixData.length) {
    return {
      maxDeficit: 0,
      subsets: [],
    };
  }
  const m = matrixData.length;
  let maxDeficit = -Infinity;
  const bestSubsets = [];

  const rowIndices = [...Array(m).keys()];
  for (let size = 1; size <= m; size += 1) {
    combinations(rowIndices, size).forEach((subset) => {
      const covered = new Set();
      subset.forEach((rowIdx) => {
        universeIndices.forEach((colIdx) => {
          if (matrixData[rowIdx][colIdx]) {
            covered.add(colIdx);
          }
        });
      });
      const deficit = subset.length - covered.size;

      if (deficit > maxDeficit) {
        maxDeficit = deficit;
        bestSubsets.length = 0;
        bestSubsets.push({ rows: subset.slice(), covered: [...covered].sort((a, b) => a - b), deficit });
      } else if (deficit === maxDeficit) {
        bestSubsets.push({ rows: subset.slice(), covered: [...covered].sort((a, b) => a - b), deficit });
      }
    });
  }
  return {
    maxDeficit,
    subsets: bestSubsets,
  };
}

function combinations(array, k) {
  // Простейший генератор сочетаний без повторений
  const result = [];
  const combo = [];
  (function backtrack(start) {
    if (combo.length === k) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i < array.length; i += 1) {
      combo.push(array[i]);
      backtrack(i + 1);
      combo.pop();
    }
  })(0);
  return result;
}

function countCoveredTau(covered, tauSet) {
  let count = 0;
  for (const x of covered) {
    if (tauSet.has(x)) {
      count += 1;
    }
  }
  return count;
}

function pickL0ByTau(zeroDeficitSubsets, tauIndices) {
  if (!zeroDeficitSubsets.length) {
    return null;
  }
  const tauSet = new Set(tauIndices);
  return zeroDeficitSubsets.reduce((best, cur) => {
    if (!best) {
      return cur;
    }

    const curTau = countCoveredTau(cur.covered, tauSet);
    const bestTau = countCoveredTau(best.covered, tauSet);

    if (curTau !== bestTau) {
      return curTau > bestTau ? cur : best;
    }
    if (cur.rows.length !== best.rows.length) {
      return cur.rows.length > best.rows.length ? cur : best;
    }
    if (cur.covered.length !== best.covered.length) {
      return cur.covered.length > best.covered.length ? cur : best;
    }
    return best;
  }, null);
}

function pickCritical(subsets) {
  if (!subsets.length) {
    return null;
  }
  return subsets.reduce((best, cur) => {
    if (!best) {
      return cur;
    }
    if (cur.rows.length !== best.rows.length) {
      return cur.rows.length > best.rows.length ? cur : best;
    }
    if (cur.covered.length !== best.covered.length) {
      return cur.covered.length > best.covered.length ? cur : best;
    }
    return best;
  }, null);
}

function paramsOfRows(matrixData, rows) {
  const cols = new Set();
  rows.forEach((r) => {
    matrixData[r]?.forEach((value, c) => {
      if (value) {
        cols.add(c);
      }
    });
  });
  return [...cols].sort((a, b) => a - b);
}

function determineStatus(maxDeficit, tauIndices, bestSubsets, options = {}) {
  const { assumeFixedInputs = false } = options;

  if (maxDeficit > 0) {
    // χ(J)=J+ — противоречивость/взаимозависимость компонент J.
    // «Невыполнимо» можно утверждать только при дополнительных данных
    // (например, фиксированные входы или взаимоисключающие ограничения).
    return assumeFixedInputs ? "infeasible" : "contradictory";
  }
  if (maxDeficit < 0) {
    return "optimization";
  }

  // maxDeficit === 0 ⇒ χ(J)=J0.
  // τ-полноту считаем по σ(L0, J) для одного выбранного множества L0 с d(L)=0.
  const L0 = pickL0ByTau(bestSubsets, tauIndices);
  const computable = new Set(L0 ? L0.covered : []);

  let coveredTau = 0;
  for (const t of tauIndices) {
    if (computable.has(t)) {
      coveredTau += 1;
    }
  }

  if (coveredTau === tauIndices.length) {
    return "calculation";
  }
  if (coveredTau > 0) {
    return "mixed";
  }
  return "optimization";
}

function determineChi(maxDeficit) {
  if (maxDeficit > 0) {
    return "J+";
  }
  if (maxDeficit === 0) {
    return "J0";
  }
  return "J-";
}

function buildConclusion(mode, statusType, context = {}) {
  const { maxDeficit, chiType } = context;

  if (mode === MODE.STATUS) {
    if (statusType === "contradictory") {
      return "χ(J)=J+ (противоречивость/взаимозависимость компонент J): вывод о невыполнимости без информации о характере ограничений преждевременен. Требуется согласование/корректировка J и анализ ограничений.";
    }
    if (statusType === "infeasible") {
      return "Задача невыполнима: при фиксированных входах/взаимоисключающих ограничениях и χ(J)=J+ дефицит положителен хотя бы для одного множества операций.";
    }
    if (statusType === "calculation") {
      return "Задача расчётная: существует множество операций с d(L) = 0, покрывающее все требуемые параметры T \\ J.";
    }
    if (statusType === "mixed") {
      return "Задача смешанная: часть требуемых параметров T \\ J определяется расчётом (существуют L с d(L)=0, покрывающие часть T), а оставшаяся часть требует оптимизации/дополнительного критерия.";
    }
    if (maxDeficit < 0) {
      return "Система недоопределена (χ(J)=J−): постановку можно сделать корректной через дозадание минимального дополнения Λ(J−) (добавить параметры в J), а также/или через введение критерия и оптимизационную постановку.";
    }
    return "Задача оптимизационная: χ(J)=J0, но требуемые параметры T \\ J не покрыты нулевыми L полностью, поэтому нужна оптимизация.";
  }

  if (mode === MODE.PAIR) {
    const overlap = context.pair?.overlapNames ?? [];
    const overlapNote = overlap.length
      ? ` Некоторые параметры (${formatList(overlap)}) уже входят в I и считаются заданными.`
      : "";
    if (statusType === "calculation") {
      return `Задание (I, T) корректно: T \\ I можно выразить на основе I без противоречий.${overlapNote}`;
    }
    if (statusType === "mixed") {
      return `Задание (I, T) частично определимо: часть T \\ I выражается через I расчётно, а для оставшейся части требуется критерий/оптимизация (смешанная постановка).${overlapNote}`;
    }
    if (statusType === "contradictory") {
      return `Для (I, T) получено χ(J)=J+ (противоречивость/взаимозависимость компонент J=I): вывод о невыполнимости без данных о фиксированности входов/характере ограничений преждевременен. Требуется согласование/корректировка исходных предпосылок.${overlapNote}`;
    }
    if (statusType === "infeasible") {
      return "Задание (I, T) должно быть скорректировано: при фиксированных входах/взаимоисключающих ограничениях и χ(J)=J+ модель приводит к невыполнимой постановке (положительный дефицит).";
    }
    if (maxDeficit < 0) {
      return `Задание (I, T) должно быть скорректировано: система недоопределена (χ(J)=J−). Для корректности можно дозадать минимальное дополнение Λ(J−) (расширить I/J), и/или ввести критерий и рассматривать оптимизационную постановку.${overlapNote}`;
    }
    return `Задание (I, T) должно быть скорректировано: χ(J)=J0, но параметры T \\ I не покрыты нулевыми L полностью, требуется критерий.${overlapNote}`;
  }

  if (mode === MODE.LINK) {
    if (chiType === "J+") {
      return "Операции взаимозависимы: χ(J) = J+ (структурная противоречивость), информационная связь присутствует.";
    }
    return `Операции не взаимозависимы по критерию χ(J): χ(J) = ${chiType}. Информационная связь отсутствует.`;
  }

  return "Режим не распознан.";
}

function renderResultsMessage(message) {
  resultsView.innerHTML = `<p>${message}</p>`;
}

function autoFillAnalysis() {
  // В режиме LINK автоматически подставляем комплементарные параметры в блок «Анализируемые»
  const total = parameterNames().length;
  const union = new Set([
    ...selectors.ij.selected,
    ...selectors.ik.selected,
  ]);
  const complement = new Set();
  for (let idx = 0; idx < total; idx += 1) {
    if (!union.has(idx)) {
      complement.add(idx);
    }
  }
  selectors.analysis.selected = complement;
  renderSelectorOptions(selectors.analysis, parameterNames());
  updateSelectorCount(selectors.analysis);
}

function parameterNames() {
  return Array.from({ length: matrix[0]?.length ?? 0 }, (_, idx) => `P${idx + 1}`);
}

function resizeMatrix(rows, cols) {
  // При изменении размерности переносим существующие значения в новую матрицу
  const newMatrix = createMatrix(rows, cols);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      newMatrix[r][c] = matrix[r]?.[c] ?? 0;
    }
  }
  matrix = newMatrix;
}

function createMatrix(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function sortedIndices(selectedSet) {
  return [...selectedSet].sort((a, b) => a - b);
}

function allIndexRange(length) {
  return Array.from({ length }, (_, idx) => idx);
}

function indicesToLabels(indices, prefix) {
  if (!indices.length) {
    return "—";
  }
  return indices.map((idx) => `${prefix}${idx + 1}`).join(", ");
}

function formatList(values) {
  if (!values.length) {
    return "—";
  }
  return values.join(", ");
}

function formatSet(indices, paramNames) {
  if (!indices.length) {
    return "<code>∅</code>";
  }
  const names = indices.map((idx) => paramNames[idx]);
  return `<code>{${names.join(", ")}}</code>`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
