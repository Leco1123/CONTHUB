const CLICKUP_API_BASE_URL = String(process.env.CLICKUP_API_BASE_URL || "https://api.clickup.com/api/v2").trim().replace(/\/+$/, "");
const CLICKUP_API_TOKEN = String(process.env.CLICKUP_API_TOKEN || "").trim();
const CLICKUP_LIST_ID = String(process.env.CLICKUP_LIST_ID || "").trim();
const CLICKUP_NEXT_ACTIONS_LIST_ID = String(process.env.CLICKUP_NEXT_ACTIONS_LIST_ID || "901713939274").trim();
const CLICKUP_TICKETS_ENABLED = String(process.env.CLICKUP_TICKETS_ENABLED || "").trim().toLowerCase();
const CLICKUP_FIELD_FUNCAO_ID = String(process.env.CLICKUP_FIELD_FUNCAO_ID || "").trim();
const CLICKUP_FIELD_SOLICITANTE_NOME_ID = String(process.env.CLICKUP_FIELD_SOLICITANTE_NOME_ID || "").trim();
const CLICKUP_FIELD_SOLICITANTE_EMAIL_ID = String(process.env.CLICKUP_FIELD_SOLICITANTE_EMAIL_ID || "").trim();
const CLICKUP_ASSIGNEE_IDS = String(process.env.CLICKUP_ASSIGNEE_IDS || "")
  .split(",")
  .map((value) => Number(String(value || "").trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

const STATUS_MAP = {
  aberto: String(process.env.CLICKUP_STATUS_ABERTO || "to do").trim(),
  em_andamento: String(process.env.CLICKUP_STATUS_EM_ANDAMENTO || "in progress").trim(),
  aguardando: String(process.env.CLICKUP_STATUS_AGUARDANDO || "on hold").trim(),
  concluido: String(process.env.CLICKUP_STATUS_CONCLUIDO || "complete").trim(),
};

const PRIORITY_TO_CLICKUP = {
  critica: 1,
  alta: 2,
  media: 3,
  baixa: 4,
};

const HOUR_MS = 60 * 60 * 1000;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isClickUpTicketsEnabled() {
  if (CLICKUP_TICKETS_ENABLED) {
    return CLICKUP_TICKETS_ENABLED === "true";
  }
  return Boolean(CLICKUP_API_TOKEN && CLICKUP_LIST_ID);
}

function assertConfigured() {
  if (!isClickUpTicketsEnabled() || !CLICKUP_API_TOKEN || !CLICKUP_LIST_ID) {
    const err = new Error("Integração ClickUp não configurada.");
    err.code = "CLICKUP_NOT_CONFIGURED";
    throw err;
  }
}

function assertListConfigured(listId) {
  if (!isClickUpTicketsEnabled() || !CLICKUP_API_TOKEN || !String(listId || "").trim()) {
    const err = new Error("Integração ClickUp não configurada.");
    err.code = "CLICKUP_NOT_CONFIGURED";
    throw err;
  }
}

async function clickupFetch(pathname, options = {}) {
  assertConfigured();
  const url = `${CLICKUP_API_BASE_URL}${pathname}`;
  const headers = {
    Authorization: CLICKUP_API_TOKEN,
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {}
    const err = new Error(payload?.err || payload?.error || `ClickUp retornou ${response.status}.`);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  if (response.status === 204) return null;
  return response.json();
}

function mapPriorityToClickUp(priority) {
  return PRIORITY_TO_CLICKUP[String(priority || "").trim().toLowerCase()] || PRIORITY_TO_CLICKUP.media;
}

function mapPriorityFromClickUp(priority) {
  const normalized = normalizeText(priority);
  if (normalized === "urgent") return "critica";
  if (normalized === "high") return "alta";
  if (normalized === "low") return "baixa";

  const value = Number(priority);
  if (value === 1) return "critica";
  if (value === 2) return "alta";
  if (value === 4) return "baixa";
  return "media";
}

function mapStatusToClickUp(status) {
  return STATUS_MAP[String(status || "").trim().toLowerCase()] || STATUS_MAP.aberto;
}

function mapStatusFromClickUp(status) {
  const normalized = normalizeText(status);
  const entry = Object.entries(STATUS_MAP).find(([, label]) => normalizeText(label) === normalized);
  return entry ? entry[0] : "aberto";
}

function cloneDate(value = new Date()) {
  return new Date(value.getTime());
}

function setLocalTime(date, hours, minutes = 0, seconds = 0, ms = 0) {
  const next = cloneDate(date);
  next.setHours(hours, minutes, seconds, ms);
  return next;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function nextBusinessDay(date) {
  const next = cloneDate(date);
  next.setDate(next.getDate() + 1);
  while (isWeekend(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function computeTicketDueDate(priority, now = new Date()) {
  const normalized = String(priority || "").trim().toLowerCase();

  if (normalized === "critica") {
    return new Date(now.getTime() + 3 * HOUR_MS);
  }

  if (normalized === "alta") {
    const todayAtFive = setLocalTime(now, 17, 0, 0, 0);
    if (todayAtFive.getTime() - now.getTime() > 4 * HOUR_MS) {
      return todayAtFive;
    }
    return setLocalTime(nextBusinessDay(now), 17, 0, 0, 0);
  }

  if (normalized === "baixa") {
    return setLocalTime(nextBusinessDay(now), 17, 0, 0, 0);
  }

  return setLocalTime(nextBusinessDay(now), 12, 0, 0, 0);
}

function formatIsoFromUnixMs(value) {
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return new Date().toISOString();
  return new Date(time).toISOString();
}

function toSingleLine(value, max = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function buildTaskName(funcao, descricao) {
  const summary = toSingleLine(descricao, 90);
  return toSingleLine(`${funcao || "Chamado"} - ${summary || "Sem descrição"}`, 120);
}

function buildTaskDescription({ funcao, descricao, solicitanteNome, solicitanteEmail }) {
  return [
    "[CONTHUB_TICKET_META]",
    `FUNCAO: ${String(funcao || "").trim()}`,
    `SOLICITANTE_NOME: ${String(solicitanteNome || "").trim()}`,
    `SOLICITANTE_EMAIL: ${String(solicitanteEmail || "").trim()}`,
    "[/CONTHUB_TICKET_META]",
    "",
    "Descrição do chamado:",
    String(descricao || "").trim(),
  ].join("\n");
}

function parseTaskDescription(description) {
  const raw = String(description || "");
  const match = raw.match(/\[CONTHUB_TICKET_META\]\s*([\s\S]*?)\s*\[\/CONTHUB_TICKET_META\]/i);
  const meta = {};

  if (match) {
    String(match[1] || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [key, ...rest] = line.split(":");
        if (!key || !rest.length) return;
        meta[normalizeText(key).replace(/\s+/g, "_")] = rest.join(":").trim();
      });
  }

  const body = raw
    .replace(/\[CONTHUB_TICKET_META\][\s\S]*?\[\/CONTHUB_TICKET_META\]/i, "")
    .replace(/^\s*Descrição do chamado:\s*/i, "")
    .trim();

  return {
    funcao: meta.funcao || "",
    solicitanteNome: meta.solicitante_nome || "",
    solicitanteEmail: meta.solicitante_email || "",
    descricao: body,
  };
}

function dataUrlToAttachment(dataUrl, fallbackName = "anexo.png") {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;

  const mimeType = String(match[1] || "image/png").trim().toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  const ext =
    mimeType === "image/jpeg" ? "jpg"
      : mimeType === "image/webp" ? "webp"
      : mimeType === "image/gif" ? "gif"
      : "png";

  return {
    mimeType,
    buffer: bytes,
    filename: fallbackName.replace(/\.[a-z0-9]+$/i, "") + `.${ext}`,
  };
}

let customFieldsCache = {
  listId: "",
  ts: 0,
  data: [],
};

async function getListCustomFields() {
  assertConfigured();
  const now = Date.now();
  if (
    customFieldsCache.listId === CLICKUP_LIST_ID &&
    customFieldsCache.data.length &&
    now - customFieldsCache.ts < 5 * 60 * 1000
  ) {
    return customFieldsCache.data;
  }

  const fields = await clickupFetch(`/list/${encodeURIComponent(CLICKUP_LIST_ID)}/field`);
  customFieldsCache = {
    listId: CLICKUP_LIST_ID,
    ts: now,
    data: Array.isArray(fields) ? fields : [],
  };
  return customFieldsCache.data;
}

async function buildCreateCustomFields({ funcao, solicitanteNome, solicitanteEmail }) {
  const fieldEntries = [
    { id: CLICKUP_FIELD_FUNCAO_ID, value: String(funcao || "").trim() },
    { id: CLICKUP_FIELD_SOLICITANTE_NOME_ID, value: String(solicitanteNome || "").trim() },
    { id: CLICKUP_FIELD_SOLICITANTE_EMAIL_ID, value: String(solicitanteEmail || "").trim() },
  ].filter((entry) => entry.id && entry.value);

  if (!fieldEntries.length) return [];

  const fields = await getListCustomFields();
  const fieldMap = new Map(fields.map((field) => [String(field.id), field]));

  return fieldEntries
    .map((entry) => {
      const field = fieldMap.get(String(entry.id));
      if (!field) return null;

      if (field.type === "drop_down") {
        const options = Array.isArray(field.type_config?.options) ? field.type_config.options : [];
        const match = options.find((option) => normalizeText(option?.name) === normalizeText(entry.value));
        return match ? { id: String(entry.id), value: String(match.id) } : null;
      }

      return { id: String(entry.id), value: entry.value };
    })
    .filter(Boolean);
}

function getCustomFieldDisplayValue(task, fieldId) {
  if (!fieldId) return "";
  const field = (Array.isArray(task?.custom_fields) ? task.custom_fields : []).find(
    (item) => String(item?.id || "") === String(fieldId)
  );
  if (!field) return "";

  if (field.type === "drop_down") {
    const options = Array.isArray(field.type_config?.options) ? field.type_config.options : [];
    const selected = options.find((option) => String(option?.id || "") === String(field.value || ""));
    return String(selected?.name || "").trim();
  }

  return String(field.value || "").trim();
}

function mapTaskToTicket(task) {
  const meta = parseTaskDescription(task?.description || task?.markdown_description || "");
  const attachments = Array.isArray(task?.attachments) ? task.attachments : [];
  const firstAttachment = attachments[0] || null;
  const imagem =
    String(firstAttachment?.thumbnail_small || firstAttachment?.thumbnail_medium || firstAttachment?.url || "").trim();
  const assignees = Array.isArray(task?.assignees) ? task.assignees : [];
  const firstAssignee = assignees[0] || null;

  return {
    id: String(task?.id || "").trim(),
    funcao:
      getCustomFieldDisplayValue(task, CLICKUP_FIELD_FUNCAO_ID) ||
      meta.funcao ||
      "Contábil",
    descricao: meta.descricao || String(task?.name || "").trim(),
    urgencia: mapPriorityFromClickUp(task?.priority?.priority || task?.priority),
    status: mapStatusFromClickUp(task?.status?.status || task?.status),
    solicitanteNome:
      getCustomFieldDisplayValue(task, CLICKUP_FIELD_SOLICITANTE_NOME_ID) ||
      meta.solicitanteNome ||
      "",
    solicitanteEmail:
      getCustomFieldDisplayValue(task, CLICKUP_FIELD_SOLICITANTE_EMAIL_ID) ||
      meta.solicitanteEmail ||
      "",
    assigneeName: String(firstAssignee?.username || firstAssignee?.email || "").trim(),
    imagem,
    dueAt: formatIsoFromUnixMs(task?.due_date),
    createdAt: formatIsoFromUnixMs(task?.date_created),
    updatedAt: formatIsoFromUnixMs(task?.date_updated || task?.date_created),
  };
}

async function getTaskDetails(taskId) {
  return clickupFetch(`/task/${encodeURIComponent(taskId)}`);
}

async function listTasksFromList(listId, options = {}) {
  assertListConfigured(listId);
  const includeClosed = options.includeClosed !== false;
  const detailed = options.detailed !== false;
  let page = 0;
  const tasks = [];

  while (true) {
    const payload = await clickupFetch(
      `/list/${encodeURIComponent(String(listId).trim())}/task?archived=false&page=${page}&include_closed=${includeClosed ? "true" : "false"}&subtasks=true`
    );
    const chunk = Array.isArray(payload?.tasks) ? payload.tasks : [];
    tasks.push(...chunk);
    if (chunk.length < 100) break;
    page += 1;
  }

  if (!detailed) return tasks;

  const detailedTasks = await Promise.all(
    tasks.map(async (task) => {
      const taskId = String(task?.id || "").trim();
      if (!taskId) return task;
      try {
        return await getTaskDetails(taskId);
      } catch (_) {
        return task;
      }
    })
  );

  return detailedTasks;
}

async function listAllTasks() {
  const tasks = await listTasksFromList(CLICKUP_LIST_ID, { includeClosed: true, detailed: true });
  return tasks.map(mapTaskToTicket);
}

function mapTaskToNextAction(task) {
  const assignees = Array.isArray(task?.assignees) ? task.assignees : [];
  const assigneeNames = assignees
    .map((assignee) => String(assignee?.username || assignee?.email || "").trim())
    .filter(Boolean);
  const assigneeEmails = assignees
    .map((assignee) => String(assignee?.email || "").trim().toLowerCase())
    .filter(Boolean);
  const statusRaw = String(task?.status?.status || task?.status || "").trim();
  const priorityRaw = String(task?.priority?.priority || task?.priority || "").trim();
  const updatedAt = formatIsoFromUnixMs(task?.date_updated || task?.date_created);
  const createdAt = formatIsoFromUnixMs(task?.date_created);

  return {
    id: String(task?.id || "").trim(),
    name: String(task?.name || "").trim() || "Tarefa sem título",
    description: String(task?.description || task?.text_content || "").trim(),
    status: statusRaw,
    priority: mapPriorityFromClickUp(priorityRaw),
    assigneeName: assigneeNames[0] || "",
    assigneeNames,
    assigneeEmails,
    assigneeLabel: assigneeNames.join(" • "),
    dueAt: formatIsoFromUnixMs(task?.due_date),
    createdAt,
    updatedAt,
    url: String(task?.url || "").trim(),
    listName: String(task?.list?.name || "").trim(),
    folderName: String(task?.folder?.name || "").trim(),
    spaceName: String(task?.space?.name || "").trim(),
  };
}

async function listNextActionsTasks() {
  const tasks = await listTasksFromList(CLICKUP_NEXT_ACTIONS_LIST_ID, {
    includeClosed: false,
    detailed: true,
  });

  return tasks.map(mapTaskToNextAction);
}

async function createTaskAttachment(taskId, imageDataUrl) {
  const attachment = dataUrlToAttachment(imageDataUrl, `ticket-${taskId}`);
  if (!attachment) return;

  const form = new FormData();
  const blob = new Blob([attachment.buffer], { type: attachment.mimeType });
  form.append("attachment", blob, attachment.filename);

  await clickupFetch(`/task/${encodeURIComponent(taskId)}/attachment`, {
    method: "POST",
    body: form,
  });
}

async function createTicket(input) {
  const funcao = String(input?.funcao || "").trim() || "Contábil";
  const descricao = String(input?.descricao || "").trim();
  const urgencia = String(input?.urgencia || "media").trim().toLowerCase();
  const solicitanteNome = String(input?.solicitanteNome || "").trim();
  const solicitanteEmail = String(input?.solicitanteEmail || "").trim();
  const imagem = String(input?.imagem || "").trim();
  const dueDate = computeTicketDueDate(urgencia);

  const payload = {
    name: buildTaskName(funcao, descricao),
    description: buildTaskDescription({
      funcao,
      descricao,
      solicitanteNome,
      solicitanteEmail,
    }),
    priority: mapPriorityToClickUp(urgencia),
    status: mapStatusToClickUp("aberto"),
    due_date: dueDate.getTime(),
    due_date_time: true,
  };

  if (CLICKUP_ASSIGNEE_IDS.length) {
    payload.assignees = CLICKUP_ASSIGNEE_IDS;
  }

  const customFields = await buildCreateCustomFields({
    funcao,
    solicitanteNome,
    solicitanteEmail,
  });
  if (customFields.length) payload.custom_fields = customFields;

  const created = await clickupFetch(`/list/${encodeURIComponent(CLICKUP_LIST_ID)}/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const taskId = String(created?.id || "").trim();
  if (taskId && imagem) {
    await createTaskAttachment(taskId, imagem);
  }

  if (taskId) {
    try {
      const detailed = await getTaskDetails(taskId);
      return mapTaskToTicket(detailed);
    } catch (_) {}
  }

  return mapTaskToTicket(created);
}

async function updateTicketStatus(taskId, nextStatus) {
  await clickupFetch(`/task/${encodeURIComponent(taskId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: mapStatusToClickUp(nextStatus),
    }),
  });
}

async function deleteTicket(taskId) {
  await clickupFetch(`/task/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });
}

module.exports = {
  isClickUpTicketsEnabled,
  createTicket,
  listAllTasks,
  listNextActionsTasks,
  updateTicketStatus,
  deleteTicket,
};
