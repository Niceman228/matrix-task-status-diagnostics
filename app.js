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
  let linkMetadata = null;

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
    linkMetadata = {
      ijNames: ij.map((idx) => paramNames[idx]),
      ikNames: ik.map((idx) => paramNames[idx]),
      unionNames: knownNames,
    };
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

  if ((currentMode === MODE.STATUS || currentMode === MODE.PAIR) && !tauEffectiveIndices.length) {
    const emptyMessage = currentMode === MODE.PAIR
      ? "⚠️ Все параметры T уже входят в I и считаются известными. Добавьте в T новые параметры или сократите I, чтобы проверить пару."
      : "⚠️ Не выбрано ни одного требуемого параметра T/τ (или все они уже входят в J). Выберите хотя бы один параметр в T.";
    report.push(`<p class="notice">${emptyMessage}</p>`);
    resultsView.innerHTML = report.join("");
    return;
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
      )} не покрывают ни один из анализируемых параметров. Их можно опустить при поиске множеств с минимальным дефицитом.</p>`
    );
  }

  const {
    maxDeficit,
    subsets,
    zeroDeficitCoversTau,
    zeroDeficitCoversUniverse,
  } = enumerateDeficits(matrix, universeIndices, tauEffectiveIndices);

  report.push(`<p><strong>Максимальный дефицит:</strong> <code>max d(L) = ${maxDeficit}</code></p>`);

  if (!subsets.length) {
    report.push(
      '<p class="notice">Списки подмножеств L не сформированы (проверьте матрицу).</p>'
    );
    resultsView.innerHTML = report.join("");
    return;
  }

  const statusType = determineStatus(maxDeficit, zeroDeficitCoversTau);
  const chiType = determineChi(maxDeficit, zeroDeficitCoversUniverse);

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

  if (currentMode === MODE.LINK) {
    report.push(`<p><strong>Состояние χ(J):</strong> <code>${chiType}</code></p>`);
    const conclusion = buildConclusion(currentMode, null, { link: { chiType } });
    report.push(`<p><strong>Вывод:</strong> ${conclusion}</p>`);
  } else {
    const conclusion = buildConclusion(currentMode, statusType, { pair: pairMetadata });
    report.push(`<p><strong>Вывод:</strong> ${conclusion}</p>`);
  }

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

function enumerateDeficits(matrixData, universeIndices, tauIndices = []) {
  // По методике дефицита: d(L) = |L| - |σ(L, J)|,
  // где σ(L, J) — множество всех переменных из U = P \ J, затронутых строками L.
  if (!matrixData.length) {
    return {
      maxDeficit: 0,
      subsets: [],
      zeroDeficitCoversTau: false,
      zeroDeficitCoversUniverse: universeIndices.length === 0,
    };
  }
  const m = matrixData.length;
  let maxDeficit = -Infinity;
  const bestSubsets = [];
  let zeroDeficitCoversTau = tauIndices.length === 0;
  let zeroDeficitCoversUniverse = universeIndices.length === 0;

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

      if (deficit === 0) {
        if (!zeroDeficitCoversTau && tauIndices.length) {
          zeroDeficitCoversTau = tauIndices.every((idx) => covered.has(idx));
        }
        if (!zeroDeficitCoversUniverse && universeIndices.length) {
          zeroDeficitCoversUniverse = covered.size === universeIndices.length;
        }
      }

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
    zeroDeficitCoversTau,
    zeroDeficitCoversUniverse,
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

function determineStatus(maxDeficit, zeroDeficitCoversTau) {
  if (maxDeficit > 0) {
    return "infeasible";
  }
  if (zeroDeficitCoversTau) {
    return "calculation";
  }
  return "optimization";
}

function determineChi(maxDeficit, zeroDeficitCoversUniverse) {
  if (maxDeficit > 0) {
    return "J+";
  }
  if (zeroDeficitCoversUniverse) {
    return "J0";
  }
  return "J-";
}

function buildConclusion(mode, statusType, context = {}) {
  if (mode === MODE.STATUS) {
    if (statusType === "infeasible") {
      return "Задача невыполнима: дефицит положителен хотя бы для одного множества операций.";
    }
    if (statusType === "calculation") {
      return "Задача расчётная: существует множество операций с d(L) = 0, покрывающее все требуемые параметры T \\ J.";
    }
    return "Задача оптимизационная: требуется критерий, так как ни одно L с d(L) = 0 не покрывает все требуемые параметры T \\ J.";
  }

  if (mode === MODE.PAIR) {
    const overlap = context.pair?.overlapNames ?? [];
    const overlapNote = overlap.length
      ? ` Некоторые параметры (${formatList(overlap)}) уже входят в I и считаются заданными.`
      : "";
    if (statusType === "calculation") {
      return `Задание (I, T) корректно: T \\ I можно выразить на основе I без противоречий.${overlapNote}`;
    }
    if (statusType === "infeasible") {
      return "Задание (I, T) должно быть скорректировано: для части параметров T \\ I модель приводит к невыполнимой постановке (положительный дефицит).";
    }
    return "Задание (I, T) должно быть скорректировано: система для параметров T \\ I недоопределена и требует введения критерия (оптимизационная постановка).";
  }

  if (mode === MODE.LINK) {
    const chiType = context.link?.chiType ?? "?";
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
