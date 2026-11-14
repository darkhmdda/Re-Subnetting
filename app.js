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