function isTruthy(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function getRequestIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).trim();
  }

  const realIp = req?.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  return null;
}

function projectSnapshot(project) {
  if (!project) {
    return null;
  }

  const customer =
    project.customerId && typeof project.customerId === 'object' && project.customerId._id
      ? project.customerId
      : null;

  return {
    id: String(project._id || ''),
    description: project.description || null,
    locationKey: project.locationKey || null,
    address: {
      raw: project.address?.raw || null,
      normalized: project.address?.normalized || null
    },
    customer: customer
      ? {
          id: String(customer._id),
          fullName: customer.fullName || null,
          email: customer.email || null,
          phone: customer.phone || null,
          address: customer.address || null
        }
      : null
  };
}

function userSnapshot(user) {
  if (!user) {
    return null;
  }

  return {
    id: String(user._id || ''),
    name: user.name || null,
    surname: user.surname || null,
    email: user.email || null,
    role: user.role || null
  };
}

async function sendSecurityAlert(payload) {
  const featureEnabled = isTruthy(process.env.SECURITY_ALERTS_FEATURE_ENABLED);
  const enabled = featureEnabled && isTruthy(process.env.SECURITY_ALERTS_ENABLED);
  const endpoint = process.env.SECURITY_ALERTS_WEBHOOK_URL;
  if (!enabled || !endpoint) {
    return { delivered: false, skipped: true };
  }

  const timeoutMs = 15000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token = process.env.SECURITY_ALERTS_WEBHOOK_TOKEN;
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Security alert webhook failed (${response.status}): ${text.slice(0, 200)}`);
    }

    return { delivered: true, skipped: false };
  } finally {
    clearTimeout(timeout);
  }
}

function buildLoginAlertPayload({ req, user }) {
  return {
    eventType: 'login',
    occurredAt: new Date().toISOString(),
    user: userSnapshot(user),
    ip: getRequestIp(req)
  };
}

function buildCheckInAlertPayload({ req, user, project, entry }) {
  return {
    eventType: 'check_in',
    occurredAt: new Date().toISOString(),
    user: userSnapshot(user),
    project: projectSnapshot(project),
    timeEntry: {
      id: String(entry?._id || ''),
      clockInAt: entry?.clockInAt || null,
      addrIn: entry?.addrIn || null,
      geoIn: entry?.geoIn || null
    },
    ip: getRequestIp(req)
  };
}

function buildCheckOutAlertPayload({ req, user, project, entry }) {
  return {
    eventType: 'check_out',
    occurredAt: new Date().toISOString(),
    user: userSnapshot(user),
    project: projectSnapshot(project),
    timeEntry: {
      id: String(entry?._id || ''),
      clockInAt: entry?.clockInAt || null,
      clockOutAt: entry?.clockOutAt || null,
      addrOut: entry?.addrOut || null,
      geoOut: entry?.geoOut || null
    },
    ip: getRequestIp(req)
  };
}

function buildTaskStatusUpdatedAlertPayload({
  req,
  actor,
  task,
  statusFrom,
  statusTo,
  project
}) {
  return {
    eventType: 'task_status_updated',
    occurredAt: new Date().toISOString(),
    // Keep both fields for compatibility with older script templates.
    actor: userSnapshot(actor),
    user: userSnapshot(actor),
    task: {
      id: String(task?._id || ''),
      title: task?.title || null,
      description: task?.description || null,
      address: task?.address || null,
      dueDate: task?.dueDate || null,
      updatedAt: task?.updatedAt || null,
      projectId: task?.projectId ? String(task.projectId) : null,
      assignedToUserIds: Array.isArray(task?.assignedToUserIds)
        ? task.assignedToUserIds.map((id) => String(id))
        : [],
      statusFrom: statusFrom || null,
      statusTo: statusTo || null
    },
    project: projectSnapshot(project),
    ip: getRequestIp(req)
  };
}

module.exports = {
  sendSecurityAlert,
  buildLoginAlertPayload,
  buildCheckInAlertPayload,
  buildCheckOutAlertPayload,
  buildTaskStatusUpdatedAlertPayload
};
