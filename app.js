const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let currentMode = "manual";
let currentSolution = null;
let selectedManualClass = "";
let manualMaskBits = Array(32).fill(0);
let manualQuestionAnswers = ["", "", "", ""];

const resultFields = [
  ["class", "Clase"],
  ["msd", "Máscara por defecto (MSD)"],
  ["msa", "Máscara de subred (MSA)"],
  ["nts", "No. Total de Subredes (NTS)"],
  ["ntsu", "No. Total de Subredes Útiles (NTSU)"],
  ["nth", "No. Total de Hosts (NTH)"],
  ["nthu", "No. Total de Hosts Útiles (NTHU)"],
  ["nbt", "No. de Bits Tomados (NBT)"]
];

const CLASS_INFO = {
  A: {name:"A", prefix:8, mask:[255,0,0,0], hostBits:24},
  B: {name:"B", prefix:16, mask:[255,255,0,0], hostBits:16},
  C: {name:"C", prefix:24, mask:[255,255,255,0], hostBits:8}
};

const POWERS = [128,64,32,16,8,4,2,1];

function parseIP(value) {
  const parts = value.trim().split(".");

  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p))) {
    throw new Error("Escribe una dirección IPv4 con cuatro octetos.");
  }

  const nums = parts.map(Number);

  if (nums.some(n => n < 0 || n > 255)) {
    throw new Error("Cada octeto debe estar entre 0 y 255.");
  }

  if (nums[0] === 0) {
    throw new Error("El primer octeto no puede ser 0 para este ejercicio classful.");
  }

  return nums;
}

function ipToInt(ip) {
  return (ip[0] * 16777216 + ip[1] * 65536 + ip[2] * 256 + ip[3]) >>> 0;
}

function intToIP(value) {
  return [
    value >>> 24 & 255,
    value >>> 16 & 255,
    value >>> 8 & 255,
    value & 255
  ].join(".");
}

function classForFirstOctet(first) {
  if (first >= 1 && first <= 127) return CLASS_INFO.A;
  if (first >= 128 && first <= 191) return CLASS_INFO.B;
  if (first >= 192 && first <= 223) return CLASS_INFO.C;

  if (first >= 224 && first <= 239) {
    throw new Error("La IP pertenece a la clase D y no se usa en este ejercicio.");
  }

  throw new Error("La IP pertenece a la clase E y no se usa en este ejercicio.");
}

function prefixToMask(prefix) {
  const mask = [];

  for (let i = 0; i < 4; i++) {
    const bits = Math.max(0, Math.min(8, prefix - i * 8));
    mask.push(bits === 0 ? 0 : 256 - 2 ** (8 - bits));
  }

  return mask;
}

function maskBits(mask) {
  return mask.map(n => n.toString(2).padStart(8, "0")).join("");
}

function bitsToMask(bits) {
  const mask = [];

  for (let i = 0; i < 4; i++) {
    mask.push(parseInt(bits.slice(i * 8, i * 8 + 8), 2));
  }

  return mask;
}

function bitsNeededUseful(count) {
  let n = 0;
  while (2 ** n - 2 < count) {
    n++;
  }
  return n;
}

function bitsNeededHosts(count) {
  let n = 0;
  while (2 ** n - 2 < count) {
    n++;
  }
  return n;
}

function fmt(n) {
  return Number(n).toLocaleString("es-MX");
}

function setStatusMessage(msg, isGood = false) {
  const el = currentMode === "manual" ? $("#manualStatusMessage") : $("#statusMessage");
  const other = currentMode === "manual" ? $("#statusMessage") : $("#manualStatusMessage");
  
  if (other) other.textContent = "";
  if (el) {
    el.textContent = msg;
    el.style.color = isGood ? "var(--good)" : (msg.includes("Limpiados") || msg.includes("Cargado") ? "var(--muted)" : "var(--bad)");
  }
}

function calculate() {
  const exerciseType = $("#exerciseType").value || "nsu";
  const ip = parseIP($("#ipAddress").value);
  const info = classForFirstOctet(ip[0]);

  const requiredSubnets = Number($("#requiredSubnets").value);
  const requiredHosts = Number($("#requiredHosts").value);
  const cidrPrefixInput = Number($("#cidrPrefixInput")?.value || 16);

  const asksNSU = exerciseType === "nsu" || exerciseType === "both";
  const asksNHU = exerciseType === "nhu" || exerciseType === "both";
  const asksCIDR = exerciseType === "cidr";

  if (asksNSU && (!Number.isInteger(requiredSubnets) || requiredSubnets < 1)) {
    throw new Error("NSU debe ser un entero mayor que 0.");
  }

  if (asksNHU && (!Number.isInteger(requiredHosts) || requiredHosts < 1)) {
    throw new Error("NHU debe ser un entero mayor que 0.");
  }

  let nbt = 0;
  let hostBits = 0;

  if (exerciseType === "nsu") {
    nbt = bitsNeededUseful(requiredSubnets);

    if (nbt > info.hostBits - 2) {
      throw new Error(
        `NSU=${requiredSubnets} requiere ${nbt} bits, pero la clase ${info.name} debe conservar al menos 2 bits para hosts.`
      );
    }

    hostBits = info.hostBits - nbt;

  } else if (exerciseType === "nhu") {
    hostBits = bitsNeededHosts(requiredHosts);

    if (hostBits > info.hostBits) {
      throw new Error(
        `NHU=${requiredHosts} no cabe en la clase ${info.name}: se necesitan ${hostBits} bits de host y solo hay ${info.hostBits} disponibles.`
      );
    }

    nbt = info.hostBits - hostBits;

  } else if (exerciseType === "both") {
    const subnetBitsNeeded = bitsNeededUseful(requiredSubnets);
    const hostBitsNeeded = bitsNeededHosts(requiredHosts);

    if (subnetBitsNeeded + hostBitsNeeded > info.hostBits) {
      throw new Error(
        "No existe una máscara válida para cumplir ambos requisitos simultáneamente"
      );
    }

    nbt = subnetBitsNeeded;
    hostBits = info.hostBits - nbt;

    if (hostBits < hostBitsNeeded) {
      throw new Error(
        "No existe una máscara válida para cumplir ambos requisitos simultáneamente"
      );
    }

  } else if (exerciseType === "cidr") {
    if (!Number.isInteger(cidrPrefixInput) || cidrPrefixInput < info.prefix || cidrPrefixInput > 30) {
      throw new Error(
        `Para la clase ${info.name}, el prefijo CIDR debe estar entre /${info.prefix} y /30.`
      );
    }

    nbt = cidrPrefixInput - info.prefix;
    hostBits = 32 - cidrPrefixInput;

  } else {
    throw new Error("Selecciona un tipo de ejercicio válido.");
  }

  const nts = 2 ** nbt;
  const ntsu = Math.max(0, nts - 2);

  const nth = 2 ** hostBits;
  const nthu = Math.max(0, nth - 2);

  const prefix = info.prefix + nbt;
  const msa = prefixToMask(prefix);
  const blockSize = 2 ** hostBits;

  const defaultMaskInt = ipToInt(info.mask);
  const networkInt = (ipToInt(ip) & defaultMaskInt) >>> 0;

  return {
    exerciseType,
    requiredSubnets: asksNSU ? requiredSubnets : null,
    requiredHosts: asksNHU ? requiredHosts : null,
    cidrPrefix: asksCIDR ? cidrPrefixInput : null,
    ip,
    class: info.name,
    defaultPrefix: info.prefix,
    defaultMask: info.mask,
    msa,
    prefix,
    nbt,
    hostBits,
    nts,
    ntsu,
    nth,
    nthu,
    networkInt,
    blockSize
  };
}

function buildManualFields() {
  $("#manualAnswerFields").innerHTML = resultFields.map(([key, label]) => {
    if (key === "class") {
      return `<label class="answer-field"><span>${label}</span>
        <select id="manualResultClass" data-answer="class" aria-label="Seleccionar clase IP">
          <option value="">Seleccionar clase…</option>
          <option value="A">Clase A</option>
          <option value="B">Clase B</option>
          <option value="C">Clase C</option>
        </select>
      </label>`;
    }

    const isMask = key === "msd";

    return `<label class="answer-field"><span>${label}</span>
      <input type="text" data-answer="${key}" aria-label="Respuesta ${label}" autocomplete="off" spellcheck="false"
      ${isMask ? 'readonly placeholder="Se completa al elegir clase"' : ""}>
    </label>`;
  }).join("");

  $("#manualResultClass").addEventListener("change", e => {
    selectManualClass(e.target.value);
  });
}

function renderResults(sol) {
  const values = {
    class: sol.class,
    msd: sol.defaultMask.join("."),
    msa: sol.msa.join("."),
    nts: fmt(sol.nts),
    ntsu: fmt(sol.ntsu),
    nth: fmt(sol.nth),
    nthu: fmt(sol.nthu),
    nbt: String(sol.nbt)
  };

  $("#autoAnswerFields").innerHTML = resultFields.map(([key, label]) =>
    `<div class="result-item ${["msa", "nbt"].includes(key) ? "primary-result" : ""}">
      <div class="result-label">${label}</div>
      <div class="result-value ${["msd", "msa"].includes(key) ? "mono" : ""}">${values[key]}</div>
    </div>`
  ).join("");
}

function renderProcedure(sol) {
  let requirementDescription = "";

  if (sol.exerciseType === "nsu") {
    requirementDescription = `Se solicitan ${sol.requiredSubnets} subredes útiles; se toman los bits mínimos necesarios y se conservarán al menos 2 bits para hosts.`;
  } else if (sol.exerciseType === "nhu") {
    requirementDescription = `Se solicitan ${sol.requiredHosts} hosts útiles por subred; se reservan ${sol.hostBits} bits para hosts y los ${sol.nbt} bits restantes se destinan a subredes.`;
  } else if (sol.exerciseType === "both") {
    requirementDescription = `Se solicitan ${sol.requiredSubnets} subredes útiles y ${sol.requiredHosts} hosts útiles por subred; los requisitos caben simultáneamente en la porción de host de la clase.`;
  } else if (sol.exerciseType === "cidr") {
    requirementDescription = `Notación CIDR seleccionada: prefijo /${sol.cidrPrefix}. Se toman NBT = ${sol.nbt} bits de subred sobre la clase ${sol.class} (/${sol.defaultPrefix}).`;
  }

  const steps = [
    [
      "Identificar la clase",
      `El primer octeto es ${sol.ip[0]}, por lo que la IP corresponde a la clase ${sol.class}.`
    ],
    [
      "Máscara por defecto (MSD)",
      `La MSD de la clase ${sol.class} es ${sol.defaultMask.join(".")} (/${sol.defaultPrefix}).`
    ],
    [
      "Requisitos y distribución de bits",
      requirementDescription
    ],
    [
      "Bits de subred (NBT)",
      `Se toman ${sol.nbt} bits para subredes; NTS = 2^${sol.nbt} = ${fmt(sol.nts)} y NTSU = ${fmt(sol.ntsu)}.`
    ],
    [
      "Bits de host",
      `Quedan ${sol.hostBits} bits para hosts. Por ello NTH = 2^${sol.hostBits} = ${fmt(sol.nth)} y NTHU = ${fmt(sol.nthu)}.`
    ],
    [
      "Máscara de subred (MSA)",
      `Se pasa de /${sol.defaultPrefix} a /${sol.prefix}; la MSA es ${sol.msa.join(".")}.`
    ],
    [
      "Salto",
      `Cada subred avanza ${fmt(sol.blockSize)} direcciones.`
    ]
  ];

  $("#autoProcedure").innerHTML =
    `<div class="procedure-heading">Procedimiento de resolución</div><ol>${
      steps.map(([title, body]) =>
        `<li><strong>${title}</strong><span>${body}</span></li>`
      ).join("")
    }</ol>`;

  $("#autoProcedure").hidden = false;
}

function subnetAt(sol, index) {
  const network = sol.networkInt + index * sol.blockSize;
  const broadcast = network + sol.blockSize - 1;

  return {
    index,
    network: intToIP(network),
    first: intToIP(network + 1),
    last: intToIP(broadcast - 1),
    broadcast: intToIP(broadcast),
    useful: index > 0 && index < sol.nts - 1
  };
}

function usefulSubnet(sol, ordinal) {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > sol.ntsu) {
    return null;
  }

  return subnetAt(sol, ordinal);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function renderTable(filterSubnets = null) {
  const startInput = $("#tableStart");
  const countInput = $("#tableCount");
  const onlyUseful = $("#onlyUseful").checked;

  let sol;

  try {
    sol = calculate();
  } catch (error) {
    $("#addressTableBody").innerHTML =
      `<tr><td colspan="6">No se puede generar la tabla: ${escapeHTML(error.message)}</td></tr>`;

    $("#tableModeNote").textContent =
      "Revisa la dirección de red y los requisitos seleccionados.";

    countInput.removeAttribute("max");
    return;
  }

  // Filtrado de subredes específicas para exportación en PDF
  if (Array.isArray(filterSubnets) && filterSubnets.length > 0) {
    const uniqueSorted = [...new Set(filterSubnets)].sort((a, b) => a - b);
    const pdfRows = uniqueSorted.map(n => {
      const item = usefulSubnet(sol, n);
      if (!item) return "";
      return `<tr>
        <td>${item.index}</td>
        <td class="mono copyable-ip" data-copy="${item.network}" title="Clic para copiar">${item.network}</td>
        <td class="mono copyable-ip" data-copy="${item.broadcast}" title="Clic para copiar">${item.broadcast}</td>
        <td class="mono copyable-ip" data-copy="${item.first} – ${item.last}" title="Clic para copiar">${item.first} – ${item.last}</td>
        <td class="mono copyable-ip" data-copy="${item.first} – ${item.last}" title="Clic para copiar">${item.first} – ${item.last}</td>
        <td class="state-useful">Útil (${n}.ª solicitada)</td>
      </tr>`;
    }).filter(Boolean);

    $("#addressTableBody").innerHTML = pdfRows.join("");
    return;
  }

  startInput.max = String(Math.max(0, sol.nts - 1));

  let start = Math.max(0, Math.floor(Number(startInput.value) || 0));

  if (start > sol.nts - 1) {
    start = sol.nts - 1;
    startInput.value = String(start);
  }

  const available = Array.from({length: sol.nts}, (_, index) => index)
    .filter(index =>
      index >= start &&
      (!onlyUseful || (index > 0 && index < sol.nts - 1))
    ).length;

  const maxRows = Math.max(1, available);
  countInput.max = String(maxRows);

  const requestedCount = Math.max(1, Math.floor(Number(countInput.value) || 1));
  const count = available === 0 ? 0 : Math.min(requestedCount, maxRows);
  const wasAdjusted = available > 0 && count !== requestedCount;

  if (wasAdjusted) {
    countInput.value = String(count);
  }

  const rows = [];
  let idx = start;
  let scanned = 0;

  while (rows.length < count && idx < sol.nts && scanned < sol.nts) {
    const item = subnetAt(sol, idx++);
    scanned++;

    if (onlyUseful && !item.useful) continue;

    rows.push(`<tr>
      <td>${item.index}</td>
      <td class="mono copyable-ip" data-copy="${item.network}" title="Clic para copiar">${item.network}</td>
      <td class="mono copyable-ip" data-copy="${item.broadcast}" title="Clic para copiar">${item.broadcast}</td>
      <td class="mono copyable-ip" data-copy="${item.first} – ${item.last}" title="Clic para copiar">${item.first} – ${item.last}</td>
      <td class="mono copyable-ip" data-copy="${item.first} – ${item.last}" title="Clic para copiar">${item.first} – ${item.last}</td>
      <td class="${item.useful ? "state-useful" : "state-reserved"}">${item.useful ? "Útil" : "Reservada"}</td>
    </tr>`);
  }

  $("#addressTableBody").innerHTML = rows.join("") ||
    `<tr><td colspan="6">No hay subredes que mostrar.</td></tr>`;

  const baseNote =
    `${rows.length} fila${rows.length === 1 ? "" : "s"} generada${rows.length === 1 ? "" : "s"} automáticamente.`;

  const adjustmentNote = wasAdjusted
    ? ` Se ajustó la cantidad solicitada a ${count}, porque solo hay ${available} fila${available === 1 ? "" : "s"} disponible${available === 1 ? "" : "s"} con los criterios actuales.`
    : (
      available === 0
        ? " No hay filas disponibles con el número inicial y los filtros seleccionados."
        : ""
    );

  $("#tableModeNote").textContent = baseNote + adjustmentNote;
}

function ordinal(n) {
  if (n === 1) return "1.ª";
  if (n === 2) return "2.ª";
  if (n === 3) return "3.ª";

  return `${n}.ª`;
}

function questionText(n, i) {
  const o = ordinal(n);

  if (i === 0) {
    return `¿Cuál es el rango de hosts de la ${o} subred útil?`;
  }

  if (i === 1) {
    return `¿Cuál es la dirección de red de la ${o} subred útil?`;
  }

  if (i === 2) {
    return `¿Cuál es la dirección de difusión (Broadcast) para la ${o} subred útil?`;
  }

  return `¿Cuáles son las direcciones asignables a la ${o} subred útil?`;
}

function expectedQuestion(sol, n, i) {
  const subnet = usefulSubnet(sol, n);

  if (!subnet) return null;

  if (i === 0) {
    return `${subnet.first} – ${subnet.last}`;
  }

  if (i === 1) {
    return subnet.network;
  }

  if (i === 2) {
    return subnet.broadcast;
  }

  return `${subnet.first} – ${subnet.last}`;
}

function normalizeAnswer(value) {
  return String(value || "")
    .trim()
    .replace(/[−–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function renderQuestions() {
  $$("[data-question-answer]").forEach(input => {
    const index = Number(input.dataset.questionAnswer);

    if (index >= 0 && index < 4) {
      manualQuestionAnswers[index] = input.value;
    }
  });

  let limitSolution = null;

  try {
    limitSolution = calculate();
  } catch {}

  const maxOrdinal = limitSolution ? limitSolution.ntsu : 1;

  const ordinalValues = [1, 2, 3, 4].map(i => {
    const input = $(`#q${i}n`);

    input.max = String(Math.max(1, maxOrdinal));

    const raw = Math.floor(Number(input.value) || 1);

    input.setAttribute(
      "aria-invalid",
      String(raw < 1 || raw > maxOrdinal)
    );

    return Math.max(1, raw);
  });

  const limitNote = $("#questionLimitNote");

  if (limitNote) {
    const invalid = ordinalValues.some(n => n > maxOrdinal);

    limitNote.textContent = invalid
      ? `El ejercicio tiene ${maxOrdinal} subredes útiles. Los números deben estar entre 1 y ${maxOrdinal}; al salir del campo se ajustarán al límite.`
      : `Máximo permitido para cada pregunta: ${maxOrdinal} subred${maxOrdinal === 1 ? " útil" : "es útiles"}.`;
  }

  $("#questions").innerHTML = ordinalValues.map((n, i) => {
    let answer = "";

    if (currentMode === "auto" && currentSolution) {
      answer = expectedQuestion(currentSolution, n, i);

      if (answer === null) {
        answer = `La subred útil ${n} no existe en esta configuración.`;
      }
    }

    const answerMarkup = currentMode === "auto" && currentSolution
      ? `<div class="question-answer copyable-ip" data-copy="${escapeHTML(answer)}" title="Clic para copiar">${escapeHTML(answer)}</div>`
      : `<label class="question-response">
           <span class="sr-only">Respuesta ${i + 1}</span>
           <textarea data-question-answer="${i}" rows="2" placeholder="Escribe tu respuesta…" aria-label="Respuesta ${i + 1}">${escapeHTML(manualQuestionAnswers[i])}</textarea>
         </label>`;

    return `<article class="question-item">
      <h3 class="question-title">${i + 1}. ${questionText(n, i)}</h3>
      ${answerMarkup}
    </article>`;
  }).join("");
}

function clampQuestionOrdinals() {
  let sol;

  try {
    sol = calculate();
  } catch {
    return;
  }

  [1, 2, 3, 4].forEach(i => {
    const input = $(`#q${i}n`);

    input.max = String(Math.max(1, sol.ntsu));

    const value = Math.floor(Number(input.value) || 1);

    if (value < 1) {
      input.value = "1";
    } else if (value > sol.ntsu) {
      input.value = String(sol.ntsu);
    }
  });
}

function renderBinaryWorkspace() {
  const cls = selectedManualClass;

  if (!cls) {
    $("#binaryWorkspace").innerHTML =
      '<div class="empty-state">Selecciona una clase para mostrar la máscara binaria.</div>';

    $("#practiceNbt").textContent = "—";
    $("#practiceHostBits").textContent = "—";
    return;
  }

  const info = CLASS_INFO[cls];

  let nbt = 0;
  let hostBits = info.hostBits;
  let targetPrefix = null;

  try {
    const sol = calculate();

    if (sol.class === cls) {
      nbt = sol.nbt;
      hostBits = sol.hostBits;
      targetPrefix = sol.prefix;
    }
  } catch {
    nbt = manualMaskBits.slice(info.prefix).filter(Boolean).length;
    hostBits = 32 - info.prefix - nbt;
  }

  $("#practiceNbt").textContent = String(nbt);
  $("#practiceHostBits").textContent = String(hostBits);

  const base = maskBits(info.mask).split("").map(Number);

  if (manualMaskBits.length !== 32) {
    manualMaskBits = base.slice();
  }

  manualMaskBits = manualMaskBits.map((v, i) => i < info.prefix ? 1 : v);

  const bits = manualMaskBits.map((v, i) => i < info.prefix ? 1 : v);

  const octets = [];

  for (let oct = 0; oct < 4; oct++) {
    const group = bits.slice(oct * 8, oct * 8 + 8);
    const value = parseInt(group.join(""), 2);

    const cells = group.map((bit, j) => {
      const idx = oct * 8 + j;
      const fixed = idx < info.prefix;

      return `<button type="button" class="bit-button ${bit ? "on" : ""} ${fixed ? "fixed" : ""}"
        data-bit="${idx}" ${fixed ? "disabled" : ""}>${bit}</button>`;
    }).join("");

    octets.push(`<div class="octet-card">
      <div class="octet-head"><span>Octeto ${oct + 1}</span><span class="octet-value">${value}</span></div>
      <div class="bit-buttons">${cells}</div>
      <div class="bit-weights">${POWERS.map(p => `<span>${p}</span>`).join("")}</div>
      <div class="octet-help">${group.join("")}</div>
    </div>`);
  }

  const mask = bitsToMask(bits);
  const prefix = bits.filter(Boolean).length;
  const defaultBits = maskBits(info.mask);

  $("#binaryWorkspace").innerHTML =
    `<div class="binary-mask-title">Máscara por defecto · Clase ${cls} · /${info.prefix}</div>
     <div class="mono binary-line">${defaultBits.slice(0, 8)}.${defaultBits.slice(8, 16)}.${defaultBits.slice(16, 24)}.${defaultBits.slice(24, 32)}</div>
     <div class="binary-mask-title space-top">Máscara en práctica · cambia los bits disponibles</div>
     <div class="mono binary-line">${bits.slice(0, 8).join("")}.${bits.slice(8, 16).join("")}.${bits.slice(16, 24).join("")}.${bits.slice(24, 32).join("")}</div>
     <div class="binary-octets">${octets.join("")}</div>
     <div class="candidate-mask">
       <span>Máscara que estás construyendo:</span><strong class="mono copyable-ip" data-copy="${mask.join(".")}" title="Clic para copiar">${mask.join(".")}</strong>
       <span>Prefijo actual de la máscara construida:</span><strong class="mono">/${prefix}</strong>
       <span>Prefijo CIDR esperado según los datos del ejercicio:</span><strong class="mono">${targetPrefix === null ? "—" : `/${targetPrefix}`}</strong>
       <button class="btn btn-quiet no-print" id="btnResetBits" type="button">Restablecer máscara</button>
     </div>`;

  $$("[data-bit]").forEach(button => button.addEventListener("click", () => {
    const idx = Number(button.dataset.bit);

    if (idx < info.prefix) return;

    manualMaskBits[idx] = manualMaskBits[idx] ? 0 : 1;
    renderBinaryWorkspace();
  }));

  $("#btnResetBits")?.addEventListener("click", () => {
    manualMaskBits = base.slice();
    renderBinaryWorkspace();
  });
}

function selectManualClass(value) {
  selectedManualClass = value;

  const resultClass = $("#manualResultClass");
  const practiceClass = $("#manualClass");

  if (resultClass && resultClass.value !== value) {
    resultClass.value = value;
  }

  if (practiceClass && practiceClass.value !== value) {
    practiceClass.value = value;
  }

  const msd = $('[data-answer="msd"]');

  if (msd) {
    msd.value = value && CLASS_INFO[value]
      ? CLASS_INFO[value].mask.join(".")
      : "";
  }

  manualMaskBits = value
    ? maskBits(CLASS_INFO[value].mask).split("").map(Number)
    : Array(32).fill(0);

  const exponentInput = document.getElementById("powerExponent");
  if (exponentInput && value && CLASS_INFO[value]) {
    exponentInput.value = CLASS_INFO[value].hostBits;
    const event = new Event("input");
    exponentInput.dispatchEvent(event);
  }

  renderBinaryWorkspace();
}

function setMode(mode) {
  currentMode = mode;

  $$(".mode-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });

  $("#btnResolve").hidden = mode !== "auto";
  $("#manualCheckContainer").hidden = mode !== "manual";
  $("#manualAnswerFields").hidden = mode !== "manual";
  $("#autoAnswerFields").hidden = mode !== "auto";
  $("#autoProcedure").hidden = mode !== "auto" || !currentSolution;

  $("#modeDescription").textContent = mode === "manual"
    ? "Modo manual: completa tus cálculos. La distribución de bits depende del tipo de ejercicio seleccionado."
    : "Modo automático: calcula resultados, procedimiento, tabla y respuestas.";

  setStatusMessage("");

  if (mode === "manual") {
    currentSolution = null;

    $("#autoAnswerFields").innerHTML = "";
    $("#autoProcedure").innerHTML = "";
    $("#autoProcedure").hidden = true;

    renderTable();
    renderQuestions();
    renderBinaryWorkspace();

  } else if (currentSolution) {
    renderResults(currentSolution);
    renderProcedure(currentSolution);
    renderTable();
    renderQuestions();

  } else {
    $("#autoAnswerFields").innerHTML = "";
    $("#autoProcedure").innerHTML = "";
    $("#autoProcedure").hidden = true;

    renderTable();
    renderQuestions();
  }
}

function resolveAndRender() {
  try {
    currentSolution = calculate();

    renderResults(currentSolution);
    renderProcedure(currentSolution);
    renderTable();
    renderQuestions();
    renderBinaryWorkspace();

    setStatusMessage("Solución calculada.", true);

  } catch (error) {
    currentSolution = null;

    setStatusMessage(error.message, false);

    $("#autoAnswerFields").innerHTML = "";
    $("#autoProcedure").innerHTML = "";
    $("#autoProcedure").hidden = true;

    renderTable();
    renderQuestions();
  }
}

function checkAnswers() {
  let sol;

  try {
    sol = calculate();
  } catch (error) {
    setStatusMessage(error.message, false);
    return;
  }

  let correct = 0;
  let total = 0;

  let correctClass = 0;
  let correctCalculations = 0;
  let correctQuestions = 0;

  $$("[data-answer]").forEach(field => {
    const key = field.dataset.answer;

    if (key === "msd") return;

    total++;

    const expected = {
      class: sol.class,
      msa: sol.msa.join("."),
      nts: String(sol.nts),
      ntsu: String(sol.ntsu),
      nth: String(sol.nth),
      nthu: String(sol.nthu),
      nbt: String(sol.nbt)
    }[key];

    const ok = normalizeAnswer(field.value) === normalizeAnswer(expected);

    field.classList.toggle("correct", ok);
    field.classList.toggle("incorrect", !ok);

    if (ok) {
      correct++;

      if (key === "class") {
        correctClass++;
      } else {
        correctCalculations++;
      }
    }
  });

  $$("[data-question-answer]").forEach(field => {
    const i = Number(field.dataset.questionAnswer);
    const n = Math.max(1, Math.floor(Number($(`#q${i + 1}n`).value) || 1));
    const expected = expectedQuestion(sol, n, i);

    const ok = expected !== null &&
      normalizeAnswer(field.value) === normalizeAnswer(expected);

    field.classList.toggle("correct", ok);
    field.classList.toggle("incorrect", !ok);

    total++;

    if (ok) {
      correct++;
      correctQuestions++;
    }
  });

  const selected = $("#manualResultClass")?.value;

  if (selected) {
    $("#manualResultClass").classList.toggle("correct", selected === sol.class);
    $("#manualResultClass").classList.toggle("incorrect", selected !== sol.class);
  }

  const message = `Comprobación: ${correct} de ${total}. Desglose: clase ${correctClass}/1, cálculos ${correctCalculations}/6 y preguntas ${correctQuestions}/4. La MSD es informativa y no se evalúa.`;
  setStatusMessage(message, correct === total);
}

function clearManualAnswers() {
  $$("[data-answer]").forEach(input => {
    if (input.id !== "manualResultClass" && input.dataset.answer !== "msd") {
      input.value = "";
    }

    input.classList.remove("correct", "incorrect");
  });

  manualQuestionAnswers = ["", "", "", ""];

  renderQuestions();

  setStatusMessage("Campos manuales limpiados.");
}

function updateExerciseInputs() {
  const type = $("#exerciseType").value;

  const showNSU = type === "nsu" || type === "both";
  const showNHU = type === "nhu" || type === "both";
  const showCIDR = type === "cidr";

  const nsuField = $("#nsuField");
  const nhuField = $("#nhuField");
  const cidrField = $("#cidrField");

  if (nsuField) nsuField.hidden = !showNSU;
  if (nhuField) nhuField.hidden = !showNHU;
  if (cidrField) cidrField.hidden = !showCIDR;

  const hint = $("#problemRequirementHint");

  if (type === "nsu") {
    hint.textContent =
      "Modo NSU: se calcularán los bits de subred necesarios y se conservarán al menos 2 bits para hosts.";
  } else if (type === "nhu") {
    hint.textContent =
      "Modo NHU: se reservarán los bits necesarios para los hosts solicitados y el resto se usará para subredes.";
  } else if (type === "both") {
    hint.textContent =
      "Modo Ambos: se comprobará que los bits necesarios para NSU y NHU quepan simultáneamente en la clase IP.";
  } else if (type === "cidr") {
    hint.textContent =
      "Modo CIDR: analiza directamente la longitud del prefijo elegido (/n), mostrando la máscara equivalente y la distribución de hosts.";
  }
}

function handleExerciseTypeChange() {
  updateExerciseInputs();

  clearManualAnswers();

  currentSolution = null;

  $("#autoAnswerFields").innerHTML = "";
  $("#autoProcedure").innerHTML = "";
  $("#autoProcedure").hidden = true;

  if (currentMode === "auto") {
    resolveAndRender();
  } else {
    renderTable();
    renderQuestions();
    renderBinaryWorkspace();
  }
}

function loadExample() {
  $("#ipAddress").value = "192.10.10.0";
  $("#exerciseType").value = "nsu";
  $("#requiredSubnets").value = 14;
  $("#requiredHosts").value = 30;
  if ($("#cidrPrefixInput")) $("#cidrPrefixInput").value = 28;

  updateExerciseInputs();

  $("#tableStart").value = 0;
  $("#tableCount").value = 10;
  $("#onlyUseful").checked = true;

  [3, 7, 12, 8].forEach((n, i) => {
    $(`#q${i + 1}n`).value = n;
  });

  clearManualAnswers();
  selectManualClass("");
  setMode("manual");

  setStatusMessage("Ejemplo cargado en modo manual.");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function printExercise() {
  if (currentMode === "auto" && !currentSolution) {
    try {
      currentSolution = calculate();

      renderResults(currentSolution);
      renderProcedure(currentSolution);
      renderTable();
      renderQuestions();

    } catch (error) {
      setStatusMessage(error.message, false);
      return;
    }
  }

  // Filtrar la tabla de impresión solo a las subredes útiles consultadas en la sección 06
  const questionSubnets = [1, 2, 3, 4].map(i => Math.floor(Number($(`#q${i}n`).value) || 0)).filter(n => n > 0);
  renderTable(questionSubnets);

  const oldTitle = document.title;
  const ip = ($("#ipAddress").value || "ejercicio")
    .replace(/[^0-9.]/g, "")
    .replaceAll(".", "-");

  document.title = `Re-Subnetting-${ip}-${currentMode}`;

  window.addEventListener("afterprint", () => {
    document.title = oldTitle;
    renderTable(); // Restaurar tabla completa en la vista en pantalla
  }, {once: true});

  window.print();
}

// Delegación de eventos global para copiar IP/Máscaras con 1 clic
document.addEventListener("click", e => {
  const target = e.target.closest(".copyable-ip");
  if (!target) return;

  const textToCopy = target.dataset.copy;
  if (!textToCopy) return;

  navigator.clipboard.writeText(textToCopy).then(() => {
    const originalText = target.textContent;
    target.textContent = "¡Copiado!";
    target.classList.add("copied-feedback");

    setTimeout(() => {
      target.textContent = originalText;
      target.classList.remove("copied-feedback");
    }, 1000);
  }).catch(err => {
    console.error("Error al copiar al portapapeles:", err);
  });
});

// Inicialización de la interfaz.
buildManualFields();

$$(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

$("#btnResolve").addEventListener("click", resolveAndRender);
$("#btnCheck").addEventListener("click", checkAnswers);
$("#btnResetWork").addEventListener("click", clearManualAnswers);
$("#btnExample").addEventListener("click", loadExample);
$("#btnPdf").addEventListener("click", printExercise);
$("#btnGenerateTable").addEventListener("click", renderTable);

["ipAddress", "requiredSubnets", "requiredHosts", "cidrPrefixInput"].forEach(id => {
  $("#" + id)?.addEventListener("input", () => {
    if (currentMode === "auto") {
      resolveAndRender();
    } else {
      renderTable();
      renderQuestions();
      renderBinaryWorkspace();
    }
  });
});

$("#exerciseType").addEventListener("change", handleExerciseTypeChange);

$("#manualClass").addEventListener("change", e => {
  selectManualClass(e.target.value);
});

["tableStart", "tableCount", "onlyUseful"].forEach(id => {
  $("#" + id).addEventListener("change", () => renderTable());
});

["q1n", "q2n", "q3n", "q4n"].forEach(id => {
  $("#" + id).addEventListener("input", renderQuestions);

  $("#" + id).addEventListener("change", () => {
    clampQuestionOrdinals();
    renderQuestions();
  });
});

["requiredSubnets", "requiredHosts", "cidrPrefixInput"].forEach(id => {
  $("#" + id)?.addEventListener("change", () => {
    clampQuestionOrdinals();
    renderQuestions();
    renderTable();
    renderBinaryWorkspace();
  });
});

loadExample();

// Lógica de la calculadora de potencias 2ⁿ
(() => {
  const exponentInput = document.getElementById("powerExponent");
  const totalOutput = document.getElementById("powerTotal");
  const usefulOutput = document.getElementById("powerUseful");

  if (!exponentInput || !totalOutput || !usefulOutput) return;

  function updatePowerCalc() {
    const exp = Math.max(0, Math.min(30, Math.floor(Number(exponentInput.value) || 0)));
    const total = 2 ** exp;
    const useful = Math.max(0, total - 2);

    totalOutput.textContent = fmt(total);
    usefulOutput.textContent = fmt(useful);
  }

  exponentInput.addEventListener("input", updatePowerCalc);
  exponentInput.addEventListener("change", updatePowerCalc);
  updatePowerCalc();
})();

/* Mini reproductor de música */
(() => {
  const player = document.getElementById("miniPlayer");
  const audio = document.getElementById("backgroundMusic");

  if (!player || !audio) return;

  const playlist = [
    { title: "So Scandalous", src: "audio/So-Scandalous.mp3" },
    { title: "OH! TENGO SUERTE", src: "audio/OH-TENGO-SUERTE.mp3" },
    { title: "Re:Re:", src: "audio/Re-Re.mp3" }
  ];

  const MINIMIZE_DELAY = 5000;
  let currentTrack = 0;
  let minimizeTimer = null;

  const playerStyles = document.createElement("style");

  playerStyles.textContent = `
    #miniPlayer {
      position: fixed !important;
      right: 24px !important;
      bottom: 24px !important;
      z-index: 9999 !important;
      box-sizing: border-box;
      width: 290px;
      padding: 12px 14px;
      border: 1px solid var(--line, #3d424e);
      border-radius: 14px;
      background: linear-gradient(180deg, #121a2b, #101725);
      color: var(--ink, #f4f1ea);
      box-shadow: 0 10px 30px rgba(0,0,0,.4);
      font-family: inherit;
      transition: all .25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    #miniPlayer *, #miniPlayer *::before, #miniPlayer *::after {
      box-sizing: border-box;
    }

    .player-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .player-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }

    .player-tag {
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.12em;
      color: var(--primary, #f07828);
      text-transform: uppercase;
      margin-bottom: 2px;
    }

    #trackTitle {
      font-size: 13px;
      font-weight: 700;
      color: var(--ink, #f4f1ea);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .player-top-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .icon-btn {
      width: 32px;
      height: 32px;
      border: 1px solid var(--line, #3d424e);
      border-radius: 8px;
      background: #1c2230;
      color: var(--ink, #f4f1ea);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      transition: background .15s, border-color .15s, color .15s;
    }

    .icon-btn svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }

    .icon-btn:hover {
      background: var(--primary, #f07828);
      border-color: var(--primary-light, #ffad62);
      color: #071021;
    }

    .player-drawer {
      display: grid;
      grid-template-rows: 1fr;
      transition: grid-template-rows .25s ease, opacity .25s ease, margin-top .25s ease;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--line, #3d424e);
      opacity: 1;
    }

    .player-drawer-content {
      overflow: hidden;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .player-sub-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .player-sub-controls .icon-btn {
      width: 28px;
      height: 28px;
    }

    .player-sub-controls .icon-btn svg {
      width: 12px;
      height: 12px;
    }

    .player-volume-box {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .player-volume-box .icon-btn {
      width: 26px;
      height: 26px;
      border: none;
      background: transparent;
      color: var(--muted, #adb3bf);
    }

    .player-volume-box .icon-btn:hover {
      background: transparent;
      color: var(--primary-light, #ffad62);
    }

    #volumeControl {
      width: 100%;
      height: 4px;
      accent-color: var(--primary, #f07828);
      cursor: pointer;
    }

    #miniPlayer.is-minimized {
      width: 230px;
      padding: 8px 12px;
    }

    #miniPlayer.is-minimized .player-drawer {
      grid-template-rows: 0fr;
      margin-top: 0;
      padding-top: 0;
      border-top: none;
      opacity: 0;
      pointer-events: none;
    }

    @media print {
      #miniPlayer { display: none !important; }
    }
  `;

  document.head.appendChild(playerStyles);

  const icons = {
    play: `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
    prev: `<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`,
    next: `<svg viewBox="0 0 24 24"><path d="M16 18h2V6h-2zM6 18l8.5-6L6 6z"/></svg>`,
    volume: `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`,
    mute: `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`,
    minus: `<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>`,
    plus: `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`
  };

  const savedVolume = localStorage.getItem("resub_volume");
  if (savedVolume !== null) {
    audio.volume = Number(savedVolume);
  }
  const savedMinimized = localStorage.getItem("resub_minimized") === "true";

  player.innerHTML = `
    <div class="player-top">
      <div class="player-meta">
        <span class="player-tag">Re:Subnetting Audio</span>
        <strong id="trackTitle">Cargando...</strong>
      </div>
      <div class="player-top-actions">
        <button type="button" class="icon-btn" id="playPauseMusic" title="Reproducir/Pausar">${icons.play}</button>
        <button type="button" class="icon-btn" id="togglePlayer" title="Minimizar">${icons.minus}</button>
      </div>
    </div>
    <div class="player-drawer">
      <div class="player-drawer-content">
        <div class="player-sub-controls">
          <button type="button" class="icon-btn" id="prevTrack" title="Anterior">${icons.prev}</button>
          <button type="button" class="icon-btn" id="nextTrack" title="Siguiente">${icons.next}</button>
        </div>
        <div class="player-volume-box">
          <button type="button" class="icon-btn" id="muteMusic" title="Silenciar">${icons.volume}</button>
          <input id="volumeControl" type="range" min="0" max="1" step="0.05" value="${audio.volume}">
        </div>
      </div>
    </div>
  `;

  const playBtn = player.querySelector("#playPauseMusic");
  const toggleBtn = player.querySelector("#togglePlayer");
  const prevBtn = player.querySelector("#prevTrack");
  const nextBtn = player.querySelector("#nextTrack");
  const muteBtn = player.querySelector("#muteMusic");
  const volCtrl = player.querySelector("#volumeControl");
  const titleEl = player.querySelector("#trackTitle");

  function updateButtons() {
    playBtn.innerHTML = audio.paused ? icons.play : icons.pause;
    muteBtn.innerHTML = audio.muted || audio.volume === 0 ? icons.mute : icons.volume;
  }

  function scheduleMinimize() {
    clearTimeout(minimizeTimer);
    minimizeTimer = setTimeout(() => {
      setMinimized(true);
    }, MINIMIZE_DELAY);
  }

  function setMinimized(minimized) {
    player.classList.toggle("is-minimized", minimized);
    toggleBtn.innerHTML = minimized ? icons.plus : icons.minus;
    toggleBtn.title = minimized ? "Expandir" : "Minimizar";
    
    localStorage.setItem("resub_minimized", minimized);

    if (minimized) {
      clearTimeout(minimizeTimer);
    } else {
      scheduleMinimize();
    }
  }

  function loadTrack(index, autoplay = false) {
    if (playlist.length === 0) return;
    currentTrack = (index + playlist.length) % playlist.length;
    const track = playlist[currentTrack];

    audio.pause();
    audio.src = track.src;
    audio.load();
    titleEl.textContent = track.title;
    updateButtons();

    if (autoplay) {
      audio.play().catch(() => {});
    }
  }

  toggleBtn.addEventListener("click", () => {
    setMinimized(!player.classList.contains("is-minimized"));
  });

  player.addEventListener("mousemove", () => {
    if (!player.classList.contains("is-minimized")) {
      scheduleMinimize();
    }
  });

  playBtn.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    updateButtons();
  });

  prevBtn.addEventListener("click", () => loadTrack(currentTrack - 1, true));
  nextBtn.addEventListener("click", () => loadTrack(currentTrack + 1, true));

  muteBtn.addEventListener("click", () => {
    audio.muted = !audio.muted;
    updateButtons();
  });

  volCtrl.addEventListener("input", () => {
    audio.volume = Number(volCtrl.value);
    localStorage.setItem("resub_volume", audio.volume);
    if (audio.volume > 0) audio.muted = false;
    updateButtons();
  });

  audio.addEventListener("play", updateButtons);
  audio.addEventListener("pause", updateButtons);
  audio.addEventListener("ended", () => loadTrack(currentTrack + 1, true));

  if (playlist.length > 0) {
    loadTrack(0, false);
  }

  setMinimized(savedMinimized);
})();

/* =========================================================
   MODO EXAMEN: CARGA DEL PDF, GUARDADO Y AUTORRELLENO
   Lee la hoja del profesor con PDF.js, detecta los problemas y
   escribe las respuestas encima con pdf-lib, ubicándolas a partir
   de las etiquetas impresas ("Clase:", "1. ¿Cuál es…", etc.) para
   no depender de coordenadas fijas.
   ========================================================= */
(() => {
  const STORE_KEY = "resub_exam_v1";
  const INK = [0.05, 0.2, 0.55];          // azul tinta
  const ANSWER_X = 304;                    // las rayas de respuesta van de x=300 a x=520
  const ANSWER_MAX_X = 518;
  const QUESTION_X = 86;                   // las rayas de pregunta van de x=80 a x=540
  const QUESTION_MAX_X = 538;
  const BOX_LEFT = 58, BOX_RIGHT = 554, BOX_BOTTOM = 46;

  const FIELD_DEFS = [
    ["class", /^clase:/],
    ["msd",   /^mascara de subred \(por defecto\)/],
    ["msa",   /^mascara de subred \(adaptada\)/],
    ["nts",   /^no total de subredes/],
    ["ntsu",  /^no de subredes utiles:/],
    ["nth",   /^no total de direcciones de host/],
    ["nthu",  /^no de direcciones utiles/],
    ["nbt",   /^no de bits cogidos/]
  ];

  const uploadInput = $("#pdfUploadInput");
  const btnLoadPdf = $("#btnLoadExamPdf");
  const toolbar = $("#examToolbar");
  const problemSelect = $("#examProblemSelect");
  const badge = $("#examStatusBadge");
  const frame = $("#examPreviewFrame");
  const offX = $("#examOffsetX");
  const offY = $("#examOffsetY");
  if (!uploadInput || !btnLoadPdf || !toolbar) return;

  let pdfBytes = null;
  let pdfSig = "";
  let problems = [];
  let layouts = {};      // { pageIndex: [líneas de texto] }
  let saved = {};        // { numProblema: respuestas }
  let previewUrl = null;

  /* ---------- utilidades ---------- */
  const norm = s => String(s || "").normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

  // Helvetica (WinAnsi) no puede codificar cualquier carácter: se limpia.
  const safe = s => String(s ?? "")
    .replace(/[   ]/g, " ")
    .replace(/→/g, "->").replace(/≥/g, ">=").replace(/≤/g, "<=")
    .replace(/[^\x20-\x7E -ÿ–—‘’“”•…]/g, "?");

  function msg(text, kind = "info") {
    const n = Object.keys(saved).length;
    const progress = problems.length ? ` · Guardados: ${n} de ${problems.length}` : "";
    badge.textContent = text + progress;
    badge.style.color = kind === "good" ? "var(--good)" : kind === "bad" ? "var(--bad)" : "var(--muted)";
  }

  function libsReady() {
    if (typeof pdfjsLib === "undefined" || typeof PDFLib === "undefined") {
      toolbar.hidden = false;
      msg("No se cargaron las librerías PDF. Se necesita internet (al menos la primera vez); recarga la página.", "bad");
      return false;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return true;
  }

  /* ---------- persistencia local (por si se cierra la pestaña) ---------- */
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        sig: pdfSig, saved,
        fields: {
          name: $("#examStudentName").value, group: $("#examStudentGroup").value,
          date: $("#examStudentDate").value, dx: offX.value, dy: offY.value
        }
      }));
    } catch {}
  }

  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; }
  }

  (() => {
    const st = readStore();
    if (!st?.fields) return;
    $("#examStudentName").value = st.fields.name ?? $("#examStudentName").value;
    $("#examStudentGroup").value = st.fields.group ?? "";
    $("#examStudentDate").value = st.fields.date ?? $("#examStudentDate").value;
    offX.value = st.fields.dx ?? 0;
    offY.value = st.fields.dy ?? 0;
  })();

  ["examStudentName", "examStudentGroup", "examStudentDate", "examOffsetX", "examOffsetY"]
    .forEach(id => $("#" + id).addEventListener("input", persist));

  /* ---------- lectura del PDF ---------- */
  async function extractLines(page) {
    const tc = await page.getTextContent();
    const items = tc.items
      .filter(i => i.str && i.str.length)
      .map(i => ({
        str: i.str, x: i.transform[4], y: i.transform[5],
        size: Math.hypot(i.transform[0], i.transform[1]) || i.height || 11, w: i.width
      }))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const lines = [];
    for (const it of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= 2) last.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    }

    lines.forEach(line => {
      line.items.sort((a, b) => a.x - b.x);
      let text = "", prevEnd = null;
      line.items.forEach(it => {
        if (prevEnd !== null && it.x - prevEnd > 1.5 && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
        it.start = text.length;
        text += it.str;
        prevEnd = it.x + it.w;
      });
      line.text = text;
      line.x = line.items[0].x;
      line.n = norm(text);
    });
    return lines;
  }

  function parseProblem(lines, pageIndex) {
    const head = lines.find(l => /^problema\s+\d+/.test(l.n));
    if (!head) return null;

    const num = Number(head.n.match(/^problema\s+(\d+)/)[1]);
    const grab = re => {
      for (const l of lines) {
        const m = l.n.match(re);
        if (m) return m;
      }
      return null;
    };

    const nsuM = grab(/subredes utiles necesarias:?\s*([\d.,]+)/);
    const nhuM = grab(/hosts utiles necesarios:?\s*([\d.,]+)/);
    const ipM = grab(/direccion de red:?\s*(\d{1,3}(?:\.\d{1,3}){3})(?:\s*\/\s*(\d{1,2}))?/);
    if (!ipM) return null;

    const toNum = s => Number(String(s).replace(/,/g, ""));
    const prob = { num, page: pageIndex, ip: ipM[1], q: [] };

    if (ipM[2]) {
      prob.type = "cidr";
      prob.cidr = Number(ipM[2]);
    } else if (nsuM && nhuM) {
      prob.type = "both";
    } else if (nsuM) {
      prob.type = "nsu";
    } else if (nhuM) {
      prob.type = "nhu";
    } else {
      return null;
    }

    if (nsuM && prob.type !== "cidr") prob.nsu = toNum(nsuM[1]);
    if (nhuM && prob.type !== "cidr") prob.nhu = toNum(nhuM[1]);

    lines.forEach(l => {
      const qm = l.text.match(/^\s*([1-4])\.\s*¿/);
      if (!qm) return;
      const om = l.text.match(/(\d+)\s*[ºªo°]/);
      prob.q[Number(qm[1]) - 1] = om ? Number(om[1]) : 1;
    });

    if (prob.q.length !== 4 || prob.q.some(v => !v)) return null;
    return prob;
  }

  uploadInput.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    uploadInput.value = "";
    if (!file || !libsReady()) return;

    try {
      pdfBytes = new Uint8Array(await file.arrayBuffer());
      pdfSig = `${file.name}|${file.size}`;

      const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
      layouts = {};
      problems = [];

      for (let p = 1; p <= doc.numPages; p++) {
        const lines = await extractLines(await doc.getPage(p));
        layouts[p - 1] = lines;
        const prob = parseProblem(lines, p - 1);
        if (prob) problems.push(prob);
      }

      if (!problems.length) {
        toolbar.hidden = false;
        msg("No encontré problemas en ese PDF. Verifica que sea Ejercicios_Subredes_Alumnos.pdf.", "bad");
        return;
      }

      const st = readStore();
      saved = st && st.sig === pdfSig && st.saved ? st.saved : {};

      toolbar.hidden = false;
      renderSelector();
      loadProblem(problems[0].num);
      const restored = Object.keys(saved).length;
      msg(`PDF cargado: ${problems.length} problemas detectados${restored ? `; recuperé ${restored} guardados` : ""}.`, "good");
    } catch (err) {
      console.error(err);
      toolbar.hidden = false;
      msg("No se pudo leer el PDF seleccionado.", "bad");
    }
  });

  btnLoadPdf.addEventListener("click", () => {
    if (libsReady()) uploadInput.click();
  });

  /* ---------- selector y carga al laboratorio ---------- */
  function renderSelector() {
    const keep = problemSelect.value;
    problemSelect.innerHTML = problems.map(p =>
      `<option value="${p.num}">Problema ${p.num} · ${p.ip}${p.cidr ? "/" + p.cidr : ""}${saved[p.num] ? " ✓" : ""}</option>`
    ).join("");
    if (keep) problemSelect.value = keep;
  }

  function currentProblem() {
    return problems.find(p => p.num === Number(problemSelect.value));
  }

  function loadProblem(num) {
    const prob = problems.find(p => p.num === Number(num));
    if (!prob) return;
    problemSelect.value = String(prob.num);

    $("#ipAddress").value = prob.ip;
    $("#exerciseType").value = prob.type;
    if (prob.nsu != null) $("#requiredSubnets").value = prob.nsu;
    if (prob.nhu != null) $("#requiredHosts").value = prob.nhu;
    if (prob.cidr != null) $("#cidrPrefixInput").value = prob.cidr;
    updateExerciseInputs();
    prob.q.forEach((n, i) => { $(`#q${i + 1}n`).value = n; });

    clearManualAnswers();
    selectManualClass("");
    currentSolution = null;

    const ex = saved[prob.num];
    if (ex?.class) selectManualClass(ex.class);

    if (currentMode === "auto") {
      resolveAndRender();
    } else {
      renderTable();
      renderQuestions();
      renderBinaryWorkspace();
    }

    if (ex) {
      $$("[data-answer]").forEach(inp => {
        const key = inp.dataset.answer;
        if (key !== "class" && key !== "msd" && ex[key] !== undefined) inp.value = ex[key];
      });
      manualQuestionAnswers = [0, 1, 2, 3].map(i => ex.questions?.[i] || "");
      $$("[data-question-answer]").forEach(t => {
        t.value = manualQuestionAnswers[Number(t.dataset.questionAnswer)] || "";
      });
    }

    msg(`Problema ${prob.num} cargado en el laboratorio.`, "info");
  }

  problemSelect.addEventListener("change", e => loadProblem(e.target.value));

  const step = delta => {
    if (!problems.length) return;
    const i = Math.min(problems.length - 1, Math.max(0, problemSelect.selectedIndex + delta));
    loadProblem(problems[i].num);
  };
  $("#btnExamPrev").addEventListener("click", () => step(-1));
  $("#btnExamNext").addEventListener("click", () => step(1));

  /* ---------- guardado ---------- */
  function workspaceMatches(prob) {
    const sameQ = prob.q.every((n, i) => Number($(`#q${i + 1}n`).value) === n);
    return $("#ipAddress").value.trim() === prob.ip &&
      $("#exerciseType").value === prob.type &&
      (prob.nsu == null || Number($("#requiredSubnets").value) === prob.nsu) &&
      (prob.nhu == null || Number($("#requiredHosts").value) === prob.nhu) &&
      (prob.cidr == null || Number($("#cidrPrefixInput").value) === prob.cidr) &&
      sameQ;
  }

  const ord = n => `${n}.ª`;

  // Muestra los últimos intentos de bits: "2 bits: 2^2 - 2 = 2 [no] | 3 bits: 2^3 - 2 = 6 [OK]"
  function bitsTrial(found) {
    const from = Math.max(1, found - 2);
    const out = [];
    for (let b = from; b <= found; b++) {
      out.push(`${b} bit${b > 1 ? "s" : ""}: 2^${b} - 2 = ${2 ** b - 2} ${b === found ? "[OK]" : "[no]"}`);
    }
    return (from > 1 ? "... " : "") + out.join("  |  ");
  }

  // Devuelve bloques: { text, indent } o { table: { head, rows, widths } }
  function buildProcedure(sol) {
    const dp = sol.defaultPrefix;
    const hostClass = 32 - dp;
    const ordinals = [1, 2, 3, 4].map(i => Math.max(1, Math.floor(Number($(`#q${i}n`).value) || 1)));
    const blocks = [];

    blocks.push({ text: `1) Clase ${sol.class}: el primer octeto es ${sol.ip[0]}. MSD = ${sol.defaultMask.join(".")} (/${dp}).` });

    const subnetsLine = () => [
      { text: `Tomamos ${sol.nbt} bits para subredes → NTS = 2^${sol.nbt} = ${sol.nts}; NTSU = ${sol.nts} - 2 = ${sol.ntsu}.`, indent: 12 }
    ];
    const hostsLine = () => [
      { text: `Los bits restantes son de host: ${sol.hostBits} → NTH = 2^${sol.hostBits} = ${sol.nth}; NTHU = ${sol.nth} - 2 = ${sol.nthu}.`, indent: 12 }
    ];

    if (sol.exerciseType === "nsu") {
      blocks.push({ text: `2) Piden ${sol.requiredSubnets} subredes útiles. Probamos: ${bitsTrial(sol.nbt)}` });
      blocks.push(...subnetsLine(), ...hostsLine());
    } else if (sol.exerciseType === "nhu") {
      blocks.push({ text: `2) Piden ${sol.requiredHosts} hosts útiles. Probamos: ${bitsTrial(sol.hostBits)}` });
      blocks.push({ text: `Bits de host = ${sol.hostBits} → NTH = 2^${sol.hostBits} = ${sol.nth}; NTHU = ${sol.nth} - 2 = ${sol.nthu}.`, indent: 12 });
      blocks.push({ text: `Los bits restantes son de subred: NBT = ${hostClass} - ${sol.hostBits} = ${sol.nbt} → NTS = 2^${sol.nbt} = ${sol.nts}; NTSU = ${sol.nts} - 2 = ${sol.ntsu}.`, indent: 12 });
    } else if (sol.exerciseType === "both") {
      blocks.push({ text: `2) Piden ${sol.requiredSubnets} subredes útiles. Probamos: ${bitsTrial(sol.nbt)}` });
      blocks.push(...subnetsLine(), ...hostsLine());
      blocks.push({ text: `Piden ${sol.requiredHosts} hosts útiles y tenemos NTHU = ${sol.nthu} >= ${sol.requiredHosts}: cumple.`, indent: 12 });
    } else {
      blocks.push({ text: `2) Prefijo /${sol.cidrPrefix}: NBT = ${sol.cidrPrefix} - ${dp} = ${sol.nbt} bits de subred.` });
      blocks.push(...subnetsLine());
      blocks.push({ text: `Bits de host = 32 - ${sol.cidrPrefix} = ${sol.hostBits} → NTH = 2^${sol.hostBits} = ${sol.nth}; NTHU = ${sol.nth} - 2 = ${sol.nthu}.`, indent: 12 });
    }

    blocks.push({ text: `MSA = /${dp} + ${sol.nbt} = /${sol.prefix} → ${sol.msa.join(".")}. Salto = 2^${sol.hostBits} = ${sol.blockSize}.`, indent: 12 });

    const asks = [
      `1) rango útil de la ${ord(ordinals[0])} subred`,
      `2) número de subred de la ${ord(ordinals[1])}`,
      `3) difusión de la ${ord(ordinals[2])}`,
      `4) direcciones asignables de la ${ord(ordinals[3])}`
    ];
    blocks.push({ text: `3) Vemos qué pide cada pregunta: ${asks.join(";  ")}.` });

    const byOrdinal = new Map();
    ordinals.forEach((n, i) => byOrdinal.set(n, [...(byOrdinal.get(n) || []), `P${i + 1}`]));
    const rows = [...byOrdinal.keys()].sort((x, y) => x - y).map(n => {
      const sn = usefulSubnet(sol, n);
      return sn
        ? [`${ord(n)} (${byOrdinal.get(n).join(",")})`, sn.network, `${sn.first} – ${sn.last}`, sn.broadcast]
        : [`${ord(n)} (${byOrdinal.get(n).join(",")})`, "no existe", "", ""];
    });

    blocks.push({ text: `4) Tabla solo con las subredes que piden (red = red base + n × salto, salto = ${sol.blockSize}):` });
    blocks.push({
      table: {
        head: ["Subred útil", "Red", "Rango de hosts", "Difusión"],
        widths: [70, 104, 190, 104],
        rows
      }
    });

    const answers = [1, 2, 3, 4].map(i =>
      `${i}) ${expectedQuestion(sol, ordinals[i - 1], i - 1) || "no existe"}`);
    blocks.push({ text: `5) Respuestas:  ${answers[0]}  |  ${answers[1]}` });
    blocks.push({ text: `${answers[2]}  |  ${answers[3]}`, indent: 12 });

    return blocks;
  }

  function collectAnswers() {
    const sol = calculate();
    const procedure = buildProcedure(sol);

    if (currentMode === "auto") {
      return {
        class: sol.class,
        msd: sol.defaultMask.join("."),
        msa: sol.msa.join("."),
        nts: String(sol.nts), ntsu: String(sol.ntsu),
        nth: String(sol.nth), nthu: String(sol.nthu),
        nbt: String(sol.nbt),
        questions: [1, 2, 3, 4].map(i =>
          expectedQuestion(sol, Math.max(1, Math.floor(Number($(`#q${i}n`).value) || 1)), i - 1) || ""),
        procedure
      };
    }

    const data = { questions: ["", "", "", ""], procedure };
    $$("[data-answer]").forEach(inp => { data[inp.dataset.answer] = inp.value.trim(); });
    $$("[data-question-answer]").forEach(t => {
      data.questions[Number(t.dataset.questionAnswer)] = t.value.trim();
    });
    return data;
  }

  $("#btnSaveProblemToExam").addEventListener("click", () => {
    const prob = currentProblem();
    if (!prob) return msg("Primero carga el PDF del examen.", "bad");

    if (!workspaceMatches(prob)) {
      return msg(`Los datos del laboratorio ya no coinciden con el Problema ${prob.num}. Vuelve a seleccionarlo en la lista (se perderán los cambios no guardados).`, "bad");
    }

    try {
      saved[prob.num] = collectAnswers();
      renderSelector();
      persist();
      msg(`Respuestas del Problema ${prob.num} guardadas.`, "good");
    } catch (err) {
      msg(err.message, "bad");
    }
  });

  /* ---------- escritura sobre el PDF ---------- */
  function wrap(text, font, size, maxW) {
    const out = [];
    let line = "";
    safe(text).split(/\s+/).forEach(word => {
      const trial = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(trial, size) <= maxW || !line) line = trial;
      else { out.push(line); line = word; }
    });
    if (line) out.push(line);
    return out;
  }

  function layoutProcedure(blocks, font, size, maxW) {
    const lineH = size * 1.22;
    const rowH = size * 1.4;
    const ops = [];
    let y = 0;

    blocks.forEach(raw => {
      const b = typeof raw === "string" ? { text: raw } : raw;

      if (b.table) {
        ops.push({ table: b.table, y });
        y += (b.table.rows.length + 1) * rowH + lineH * 0.35;
        return;
      }

      const indent = b.indent || 0;
      wrap(b.text, font, size, maxW - indent).forEach(t => {
        ops.push({ text: t, x: indent, y });
        y += lineH;
      });
      y += lineH * 0.15;
    });

    return { ops, height: y, rowH };
  }

  function drawProcedure(page, plan, size, top, reg, bold, color, dx, dy) {
    const base = top - 11;
    const line = { thickness: 0.5, color };

    plan.ops.forEach(op => {
      if (op.text !== undefined) {
        page.drawText(safe(op.text), { x: BOX_LEFT + op.x + dx, y: base - op.y + dy, size, font: reg, color });
        return;
      }

      const { head, rows, widths } = op.table;
      const rh = plan.rowH;
      const y0 = base - op.y + size * 0.9 + 1;
      const total = widths.reduce((a, b) => a + b, 0);
      const xs = widths.reduce((acc, w) => [...acc, acc[acc.length - 1] + w], [0]);
      const left = BOX_LEFT + 12;

      for (let i = 0; i <= rows.length + 1; i++) {
        page.drawLine({
          start: { x: left + dx, y: y0 - i * rh + dy },
          end: { x: left + total + dx, y: y0 - i * rh + dy }, ...line
        });
      }
      xs.forEach(x => page.drawLine({
        start: { x: left + x + dx, y: y0 + dy },
        end: { x: left + x + dx, y: y0 - (rows.length + 1) * rh + dy }, ...line
      }));

      [head, ...rows].forEach((cells, r) => {
        cells.forEach((cell, c) => {
          page.drawText(safe(cell), {
            x: left + xs[c] + 3 + dx,
            y: y0 - (r + 1) * rh + (rh - size) / 2 + size * 0.15 + dy,
            size, font: r === 0 ? bold : reg, color
          });
        });
      });
    });
  }

  async function buildFilledPdf() {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.load(pdfBytes);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg = await doc.embedFont(StandardFonts.Helvetica);
    const color = rgb(...INK);
    const dx = Number(offX.value) || 0;
    const dy = Number(offY.value) || 0;
    const pages = doc.getPages();
    const warnings = [];

    const put = (page, text, x, y, size, font, maxX) => {
      const t = safe(text);
      if (!t) return;
      let s = size;
      while (s > 6 && font.widthOfTextAtSize(t, s) > maxX - x) s -= 0.5;
      page.drawText(t, { x: x + dx, y: y + dy, size: s, font, color });
    };

    // Portada: se escribe justo después de cada etiqueta, sobre su raya "____".
    const cover = pages[0];
    const coverLines = layouts[0] || [];
    [
      ["Nombre:", $("#examStudentName").value],
      ["Grupo:", $("#examStudentGroup").value],
      ["Fecha:", $("#examStudentDate").value]
    ].forEach(([label, value]) => {
      if (!value.trim()) return;
      const line = coverLines.find(l => l.text.includes(label));
      const li = line ? line.text.indexOf(label) : -1;
      const us = li >= 0 ? line.text.indexOf("_", li) : -1;
      if (us < 0) return warnings.push(`portada (${label.replace(":", "")})`);

      const run = line.text.slice(us).match(/^_+/)[0].length;
      const xAt = idx => {
        const it = [...line.items].reverse().find(i => i.start <= idx);
        return it.x + reg.widthOfTextAtSize(safe(it.str.slice(0, idx - it.start)), it.size);
      };
      put(cover, value, xAt(us) + 3, line.y + 3, 12, bold, xAt(us + run));
    });

    problems.forEach(prob => {
      const ans = saved[prob.num];
      const page = pages[prob.page];
      const lines = layouts[prob.page] || [];
      if (!ans || !page) return;

      FIELD_DEFS.forEach(([key, re]) => {
        const line = lines.find(l => re.test(l.n));
        if (!line) return warnings.push(`P${prob.num} ${key}`);
        put(page, ans[key], ANSWER_X, line.y + 1, 11, bold, ANSWER_MAX_X);
      });

      lines.forEach(l => {
        const m = l.text.match(/^\s*([1-4])\.\s*¿/);
        if (m) put(page, ans.questions?.[Number(m[1]) - 1], QUESTION_X, l.y - 19, 10.5, bold, QUESTION_MAX_X);
      });

      const boxLabel = lines.find(l => /^muestre aqui/.test(l.n));
      if (!boxLabel) return warnings.push(`P${prob.num} procedimiento`);

      const top = boxLabel.y - 15;
      const availH = top - BOX_BOTTOM - 8;
      const maxW = BOX_RIGHT - BOX_LEFT;
      const blocks = ans.procedure || [];

      for (let size = 9; size >= 6; size -= 0.5) {
        const plan = layoutProcedure(blocks, reg, size, maxW);
        if (plan.height > availH && size > 6) continue;
        drawProcedure(page, plan, size, top, reg, bold, color, dx, dy);
        break;
      }
    });

    return { bytes: await doc.save(), warnings };
  }

  function warnText(w) {
    return w.length ? ` Sin ancla (revisa): ${w.slice(0, 4).join(", ")}${w.length > 4 ? "…" : ""}.` : "";
  }

  $("#btnPreviewFilledPdf").addEventListener("click", async () => {
    if (!pdfBytes) return msg("Primero carga el PDF del examen.", "bad");
    try {
      const { bytes, warnings } = await buildFilledPdf();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const prob = currentProblem();
      frame.src = `${previewUrl}#page=${prob ? prob.page + 1 : 1}`;
      frame.hidden = false;
      msg("Vista previa generada." + warnText(warnings), warnings.length ? "bad" : "good");
    } catch (err) {
      console.error(err);
      msg("Error al generar la vista previa: " + err.message, "bad");
    }
  });

  $("#btnDownloadFilledPdf").addEventListener("click", async () => {
    if (!pdfBytes) return msg("Primero carga el PDF del examen.", "bad");
    try {
      const { bytes, warnings } = await buildFilledPdf();
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "Ejercicios_Subredes_Resuelto.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      msg("PDF descargado." + warnText(warnings), warnings.length ? "bad" : "good");
    } catch (err) {
      console.error(err);
      msg("Error al generar el PDF: " + err.message, "bad");
    }
  });
})();
