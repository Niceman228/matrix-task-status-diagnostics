// Режимы анализа соответствуют вкладкам интерфейса
const MODE = {
  STATUS: "status",
  PAIR: "pair",
  LINK: "link",
};

// Конфигурация селекторов формируется один раз и переиспользуется
const selectorsConfig = [
  { key: "known", title: "Известные параметры J", modes: [MODE.STATUS] },
  { key: "i", title: "Исходные параметры I", modes: [MODE.PAIR] },
  { key: "t", title: "Требуемые параметры T", modes: [MODE.PAIR] },
  { key: "ij", title: "Параметры Iij", modes: [MODE.LINK] },
  { key: "ik", title: "Параметры Iik", modes: [MODE.LINK] },
  { key: "analysis", title: "Анализируемые параметры", modes: [MODE.LINK] },
];

const rowsInput = document.getElementById("rowsInput");
const colsInput = document.getElementById("colsInput");
const matrixTableRoot = document.getElementById("matrixTable");
const selectorContainer = document.getElementById("selectorContainer");
const resultsView = document.getElementById("resultsView");
const analyzeButton = document.getElementById("analyzeButton");
const resetButton = document.getElementById("resetButton");
const themeToggle = document.getElementById("themeToggle");
const selectorTemplate = document.getElementById("selectorTemplate");
const panes = {
  controls: document.querySelector('[data-pane="controls"]'),
  matrix: document.querySelector('[data-pane="matrix"]'),
  results: document.querySelector('[data-pane="results"]'),
};
const splitterHandles = document.querySelectorAll('.splitter-handle');
const CONTROL_WIDTH = { min: 220, max: 420 };
const RESULTS_WIDTH = { min: 240, max: 420 };
const THEME_KEY = "deficit-app-theme";
const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
let userTheme = localStorage.getItem(THEME_KEY);
const hoverState = { row: null, col: null };
let matrixHoverRefs = null;

let currentMode = MODE.STATUS;
let matrix = createMatrix(Number(rowsInput.value), Number(colsInput.value));
const selectors = buildSelectors();
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
      localStorage.setItem(THEME_KEY, nextTheme);
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
      checkbox.addEventListener("change", () => {
        matrix[rowIdx][colIdx] = checkbox.checked ? 1 : 0;
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
  let targetIndices = [];
  let knownNames = [];
  let knownIndices = [];
  const allParamIndices = allIndexRange(cols);
  let pairMetadata = null;

  if (currentMode === MODE.STATUS) {
    knownIndices = sortedIndices(selectors.known.selected);
    targetIndices = allParamIndices.filter((idx) => !knownIndices.includes(idx));
    knownNames = knownIndices.map((idx) => paramNames[idx]);
    report.push(`<h3>Тип задачи: определение статуса проектной задачи</h3>`);
    report.push(
      `<p><strong>Известные параметры J:</strong> ${formatList(knownNames)}</p>`
    );
    const unknownNames = targetIndices.map((idx) => paramNames[idx]);
    report.push(
      `<p><strong>Неизвестные параметры U:</strong> ${formatList(unknownNames)}</p>`
    );
  } else if (currentMode === MODE.PAIR) {
    const iIndices = sortedIndices(selectors.i.selected);
    const tIndices = sortedIndices(selectors.t.selected);
    knownIndices = iIndices;
    knownNames = iIndices.map((idx) => paramNames[idx]);
    targetIndices = allParamIndices.filter((idx) => !iIndices.includes(idx));
    const tNames = tIndices.map((idx) => paramNames[idx]);
    const overlapTargets = tIndices.filter((idx) => iIndices.includes(idx));
    const cleanedTargets = tIndices.filter((idx) => !iIndices.includes(idx));
    const unknownNames = targetIndices.map((idx) => paramNames[idx]);
    pairMetadata = {
      requestedTargets: tNames,
      overlapNames: overlapTargets.map((idx) => paramNames[idx]),
      effectiveTargets: cleanedTargets.map((idx) => paramNames[idx]),
    };
    report.push(`<h3>Тип задачи: анализ корректности пары (I, T)</h3>`);
    report.push(
      `<p><strong>Исходные параметры I:</strong> ${formatList(knownNames)}</p>`
    );
    report.push(
      `<p><strong>Требуемые параметры T:</strong> ${formatList(tNames)}</p>`
    );
    report.push(
      `<p><strong>Неизвестные параметры U = P \ I:</strong> ${formatList(unknownNames)}</p>`
    );
    if (pairMetadata.overlapNames.length) {
      report.push(
        `<p class="notice info">ℹ️ Параметры ${formatList(
          pairMetadata.overlapNames
        )} входят в I и считаются известными.</p>`
      );
    }
  } else if (currentMode === MODE.LINK) {
    const ij = sortedIndices(selectors.ij.selected);
    const ik = sortedIndices(selectors.ik.selected);
    const union = Array.from(new Set([...ij, ...ik])).sort((a, b) => a - b);
    targetIndices = sortedIndices(selectors.analysis.selected);
    knownNames = union.map((idx) => paramNames[idx]);
    report.push(`<h3>Тип задачи: проверка информационной связи операций</h3>`);
    report.push(
      `<p><strong>Входы первой операции Iij:</strong> ${formatSet(ij, paramNames)}</p>`
    );
    report.push(
      `<p><strong>Входы второй операции Iik:</strong> ${formatSet(ik, paramNames)}</p>`
    );
    report.push(
      `<p><strong>Объединение J = Iij ∪ Iik:</strong> ${formatSet(union, paramNames)}</p>`
    );
    report.push(
      `<p><strong>Анализируемые параметры:</strong> ${formatSet(targetIndices, paramNames)}</p>`
    );
  } else {
    renderResultsMessage("Неизвестный режим анализа.");
    return;
  }

  report.push(
    `<p><strong>Размерность модели:</strong> m = ${rows}, n = ${cols}</p>`
  );
  report.push(matrixAsciiBlock());

  if (!targetIndices.length) {
    const emptyMessage = currentMode === MODE.PAIR
      ? '⚠️ Неизвестные параметры отсутствуют: все столбцы входят в I. Уберите хотя бы один параметр из I.'
      : '⚠️ Не выбрано ни одного параметра для анализа. Укажите хотя бы один столбец.';
    report.push(`<p class="notice">${emptyMessage}</p>`);
    resultsView.innerHTML = report.join("");
    return;
  }

  const zeroRows = matrix
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => targetIndices.every((col) => row[col] === 0))
    .map(({ idx }) => idx);

  if (zeroRows.length) {
    report.push(
      `<p class="notice info">ℹ️ Строки ${indicesToLabels(
        zeroRows,
        "F"
      )} не содержат анализируемых параметров и не влияют на статус задачи.</p>`
    );
  }

  const { maxDeficit, subsets } = enumerateDeficits(matrix, targetIndices);
  report.push(`<p><strong>Максимальный дефицит:</strong> <code>max d(L) = ${maxDeficit}</code></p>`);

  if (!subsets.length) {
    report.push(
      '<p class="notice">Списки подмножеств L не сформированы (проверьте матрицу).</p>'
    );
    resultsView.innerHTML = report.join("");
    return;
  }

  const coversAll = subsets.some(
    (info) => info.covered.length === targetIndices.length && info.deficit === 0
  );

  const subsetLines = subsets.slice(0, 10).map((info) => {
    const rowsLabel = indicesToLabels(info.rows, "F");
    const coveredLabel = indicesToLabels(info.covered, "P");
    return `<li><code>L = {${rowsLabel}}</code> → <code>P(L) = {${coveredLabel}}</code>; <code>d(L) = ${info.deficit}</code></li>`;
  });
  if (subsets.length > 10) {
    subsetLines.push(
      `<li>… и ещё ${subsets.length - 10} набор(ов) со значением <code>d(L) = ${maxDeficit}</code></li>`
    );
  }
  report.push("<p><strong>Подмножества строк с максимальным дефицитом:</strong></p>");
  report.push(`<ul>${subsetLines.join("")}</ul>`);

  const statusType = determineStatus(maxDeficit, coversAll);
  const conclusion = buildConclusion(currentMode, statusType, { pair: pairMetadata });
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

function enumerateDeficits(matrixData, parameterIndices) {
  // Перебираем все возможные множества строк и находим те, где дефицит максимален
  if (!matrixData.length || !parameterIndices.length) {
    return { maxDeficit: 0, subsets: [] };
  }
  const m = matrixData.length;
  let maxDeficit = -Infinity;
  const bestSubsets = [];

  const rowIndices = [...Array(m).keys()];
  for (let size = 1; size <= m; size += 1) {
    combinations(rowIndices, size).forEach((subset) => {
      const covered = new Set();
      subset.forEach((rowIdx) => {
        parameterIndices.forEach((colIdx) => {
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
  return { maxDeficit, subsets: bestSubsets };
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

function determineStatus(maxDeficit, coversAll) {
  if (maxDeficit > 0) {
    return "infeasible";
  }
  if (coversAll) {
    return "calculation";
  }
  return "optimization";
}

function buildConclusion(mode, statusType, context = {}) {
  if (mode === MODE.STATUS) {
    if (statusType === "infeasible") {
      return "Задача невыполнима: дефицит положителен хотя бы для одного множества операций.";
    }
    if (statusType === "calculation") {
      return "Задача расчётная: существует множество операций с d(L) = 0, покрывающее все неизвестные.";
    }
    return "Задача оптимизационная: требуется критерий, так как ни одно L с d(L) = 0 не покрывает все параметры.";
  }

  if (mode === MODE.PAIR) {
    if (statusType === "infeasible") {
      return "Пара (I, T) некорректна: структура модели приводит к невыполнимой постановке, расчётная схема невозможна.";
    }
    if (statusType === "calculation") {
      const overlap = context.pair?.overlapNames ?? [];
      const overlapNote = overlap.length
        ? ` Некоторые параметры (${formatList(overlap)}) уже входят в I и потому считаются известными.`
        : "";
      return `Пара (I, T) корректна: при заданных I можно построить расчётную модель.${overlapNote}`;
    }
    return "Пара (I, T) формально допустима, но задача остаётся оптимизационной и требует введения критерия.";
  }

  if (mode === MODE.LINK) {
    if (statusType === "infeasible") {
      return "Информационная связь присутствует: положительный дефицит указывает на структурную зависимость.";
    }
    return "Информационная связь не выявлена: дефицит нулевой для всех наборов операций.";
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
