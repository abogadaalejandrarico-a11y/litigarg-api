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
    chatLimit: 5
  },
  [PLAN_IDS.PRO]: {
    id: PLAN_IDS.PRO,
    name: "Pro",
    price: 20900,
    messagesPerDay: 50,
    filesPerDay: 20,
    chatLimit: 20
  },
  [PLAN_IDS.PLUS]: {
    id: PLAN_IDS.PLUS,
    name: "Plus",
    price: 49900,
    messagesPerDay: 100,
    filesPerDay: 50,
    chatLimit: 100
  },
  [PLAN_IDS.ADMIN]: {
    id: PLAN_IDS.ADMIN,
    name: "Administradora",
    price: 0,
    messagesPerDay: null,
    filesPerDay: null,
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
  return config.messagesPerDay;
}

export function isPaidPlan(plan) {
  const normalizedPlan = normalizePlanId(plan);
  return normalizedPlan === PLAN_IDS.PRO || normalizedPlan === PLAN_IDS.PLUS;
}
