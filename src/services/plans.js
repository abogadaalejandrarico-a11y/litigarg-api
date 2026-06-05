export const PLAN_IDS = {
  FREE: "free",
  PRO: "pro_mensual",
  PLUS: "plus_mensual",
  ADMIN: "admin"
};

const PLAN_ALIASES = {
  premium_mensual: PLAN_IDS.PRO,
  premium_anual: PLAN_IDS.PLUS
};

export const PLAN_LIMITS = {
  [PLAN_IDS.FREE]: {
    id: PLAN_IDS.FREE,
    name: "Experiencia gratuita",
    price: 0,
    messagesPerDay: 8,
    filesPerDay: 8,
    audiosPerDay: 0,
    audioMaxMb: 0,
    videosPerDay: 0,
    videoMaxMb: 0,
    chatLimit: 5
  },
  [PLAN_IDS.PRO]: {
    id: PLAN_IDS.PRO,
    name: "Pro",
    price: 20900,
    messagesPerDay: 50,
    filesPerDay: 20,
    audiosPerDay: 10,
    audioMaxMb: 10,
    videosPerDay: 0,
    videoMaxMb: 0,
    chatLimit: 20
  },
  [PLAN_IDS.PLUS]: {
    id: PLAN_IDS.PLUS,
    name: "Plus",
    price: 49900,
    messagesPerDay: 100,
    filesPerDay: 50,
    audiosPerDay: 25,
    audioMaxMb: 25,
    videosPerDay: 5,
    videoMaxMb: 25,
    chatLimit: 100
  },
  [PLAN_IDS.ADMIN]: {
    id: PLAN_IDS.ADMIN,
    name: "Administradora",
    price: 0,
    messagesPerDay: null,
    filesPerDay: null,
    audiosPerDay: null,
    audioMaxMb: 25,
    videosPerDay: null,
    videoMaxMb: 25,
    chatLimit: 500
  }
};

export function normalizePlanId(plan) {
  return PLAN_ALIASES[plan] || plan || PLAN_IDS.FREE;
}

export function getPlanConfig(plan, { admin = false } = {}) {
  if (admin) return PLAN_LIMITS[PLAN_IDS.ADMIN];

  const normalizedPlan = normalizePlanId(plan);
  return PLAN_LIMITS[normalizedPlan] || PLAN_LIMITS[PLAN_IDS.FREE];
}

export function getPlanName(plan, options = {}) {
  return getPlanConfig(plan, options).name;
}

export function getPlanPrice(plan) {
  return getPlanConfig(plan).price;
}

export function getPlanChatLimit(plan, options = {}) {
  return getPlanConfig(plan, options).chatLimit;
}

export function getPlanDailyLimit(plan, kind, options = {}) {
  const config = getPlanConfig(plan, options);

  if (kind === "file") return config.filesPerDay;
  if (kind === "audio") return config.audiosPerDay;
  if (kind === "video") return config.videosPerDay;
  return config.messagesPerDay;
}

export function getPlanAudioMaxBytes(plan, options = {}) {
  const config = getPlanConfig(plan, options);
  return (config.audioMaxMb || 0) * 1024 * 1024;
}

export function getPlanVideoMaxBytes(plan, options = {}) {
  const config = getPlanConfig(plan, options);
  return (config.videoMaxMb || 0) * 1024 * 1024;
}

export function isPaidPlan(plan) {
  const normalizedPlan = normalizePlanId(plan);
  return normalizedPlan === PLAN_IDS.PRO || normalizedPlan === PLAN_IDS.PLUS;
}
