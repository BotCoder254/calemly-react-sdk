const TRACKING_SESSION_KEY = 'calemly-sdk:tracking-session-id';
const CONTACT_TOKEN_KEY = 'calemly-sdk:booking-contact-token';
const REQUEST_ID_STORAGE_KEY = 'calemly-sdk:booking-request-ids';
const REQUEST_ID_TTL_MS = 72 * 60 * 60 * 1000;

const createUuid = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  const random = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${random()}${random()}-${random()}-${random()}-${random()}-${random()}${random()}${random()}`;
};

const parseStoredRequestIds = () => {
  if (typeof localStorage === 'undefined') {
    return {};
  }

  try {
    const raw = localStorage.getItem(REQUEST_ID_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const persistStoredRequestIds = (value) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(REQUEST_ID_STORAGE_KEY, JSON.stringify(value));
  } catch (_error) {
    // no-op when storage is unavailable
  }
};

export const getOrCreateTrackingSessionId = () => {
  if (typeof sessionStorage === 'undefined') {
    return createUuid();
  }

  try {
    const existing = sessionStorage.getItem(TRACKING_SESSION_KEY);
    if (existing) {
      return existing;
    }

    const next = createUuid();
    sessionStorage.setItem(TRACKING_SESSION_KEY, next);
    return next;
  } catch (_error) {
    return createUuid();
  }
};

export const getOrCreateContactToken = () => {
  if (typeof localStorage === 'undefined') {
    return createUuid();
  }

  try {
    const existing = localStorage.getItem(CONTACT_TOKEN_KEY);
    if (existing) {
      return existing;
    }

    const next = createUuid();
    localStorage.setItem(CONTACT_TOKEN_KEY, next);
    return next;
  } catch (_error) {
    return createUuid();
  }
};

export const getOrCreateClientRequestId = (scopeKey, ttlMs = REQUEST_ID_TTL_MS) => {
  const safeScope = (scopeKey || 'default').toString().slice(0, 180);
  const now = Date.now();
  const store = parseStoredRequestIds();

  const cleanedStore = Object.fromEntries(
    Object.entries(store).filter(([, entry]) => entry && typeof entry === 'object' && entry.expiresAt > now)
  );

  const existingEntry = cleanedStore[safeScope];
  if (existingEntry?.id) {
    persistStoredRequestIds(cleanedStore);
    return existingEntry.id;
  }

  const nextId = createUuid();
  cleanedStore[safeScope] = {
    id: nextId,
    expiresAt: now + ttlMs,
  };

  persistStoredRequestIds(cleanedStore);
  return nextId;
};

const getUrlFromValue = (value) => {
  if (!value || typeof URL === 'undefined') {
    return null;
  }

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : undefined;
    return new URL(value, base);
  } catch (_error) {
    return null;
  }
};

const toOrigin = (value) => getUrlFromValue(value)?.origin || null;

const toLandingUrl = (value) => {
  const parsed = getUrlFromValue(value);
  if (!parsed) {
    return null;
  }

  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
};

const readUtmValues = (searchValue) => {
  const parsed = getUrlFromValue(searchValue);
  if (!parsed) {
    return {};
  }

  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  const result = {};

  keys.forEach((key) => {
    const value = parsed.searchParams.get(key);
    if (value) {
      result[key] = value;
    }
  });

  return result;
};

const pruneEmpty = (value) => Object.fromEntries(
  Object.entries(value || {}).filter(([, entry]) => entry !== null && entry !== undefined && entry !== '')
);

export const resolveEmbedOrigin = () => {
  if (typeof document !== 'undefined' && document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch (_error) {
      return document.referrer;
    }
  }

  if (typeof window !== 'undefined' && window.location?.ancestorOrigins?.length > 0) {
    return window.location.ancestorOrigins[0];
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return null;
};

export const buildWidgetBookingSource = ({
  widgetId,
  embedOrigin,
  trackingSessionId,
  signedTokenId,
  pageId,
  pageSlug,
  landingPageUrl,
  contactToken,
}) => {
  const safeEmbedOrigin = toOrigin(embedOrigin) || null;
  const fallbackLandingPage = typeof window !== 'undefined' ? window.location.href : null;
  const safeLandingPage = toLandingUrl(landingPageUrl || fallbackLandingPage);
  const fallbackPath = typeof window !== 'undefined' ? window.location.pathname : '/';

  return {
    source: 'widget',
    source_client: 'embed-widget-v2',
    source_details: pruneEmpty({
      widget_id: widgetId || null,
      embed_origin: safeEmbedOrigin,
      landing_page_url: safeLandingPage,
      landing_page_path: fallbackPath,
      page_id: pageId,
      page_slug: pageSlug,
      signed_token_id: signedTokenId || null,
      tracking_session_id: trackingSessionId || getOrCreateTrackingSessionId(),
      contact_token: contactToken || getOrCreateContactToken(),
      ...readUtmValues(landingPageUrl || fallbackLandingPage || ''),
    }),
  };
};
