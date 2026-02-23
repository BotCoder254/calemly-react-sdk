const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const calculateBackoff = (attempt, baseDelay = 1000, maxDelay = 12000) => {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  return delay + Math.random() * 350;
};

const parseRetryAfterHeader = (value) => {
  if (!value) {
    return null;
  }

  const asSeconds = Number.parseInt(value, 10);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return asSeconds;
  }

  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return null;
  }

  const remainingMs = asDate.getTime() - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : null;
};

const toQueryString = (params = {}) => {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }

    query.append(key, value);
  });

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
};

const buildEmbedHeaders = (embed) => {
  const headers = {};

  if (embed?.key) {
    headers['X-Embed-Key'] = embed.key;
  }

  if (embed?.origin) {
    headers['X-Embed-Origin'] = embed.origin;
  }

  return headers;
};

const normalizeBaseUrl = (value) => {
  if (!value) {
    return '';
  }

  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const normalizeError = (response, data) => {
  const error = new Error(
    data?.message
      || data?.error
      || (response.status === 429
        ? 'Too many requests. Please try again in a moment.'
        : 'Request failed')
  );

  error.status = response.status;
  error.code = data?.code;
  error.retryAfter = data?.retryAfter || parseRetryAfterHeader(response.headers.get('Retry-After'));
  error.alternatives = data?.alternatives || [];
  error.suggestions = data?.suggestions || [];
  error.actionUrl = data?.actionUrl;
  error.details = data;
  return error;
};

export const createSchedulerApi = ({ baseUrl }) => {
  const safeBaseUrl = normalizeBaseUrl(baseUrl);

  const request = async (
    endpoint,
    { method = 'GET', body, headers = {}, retryConfig = { maxRetries: 2, retryOn429: true } } = {}
  ) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const error = new Error('You appear to be offline. Check your internet connection and try again.');
      error.status = 0;
      error.code = 'OFFLINE';
      throw error;
    }

    let attempt = 0;
    let lastError = null;

    while (attempt <= retryConfig.maxRetries) {
      try {
        const response = await fetch(`${safeBaseUrl}${endpoint}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        let data = {};
        try {
          data = await response.json();
        } catch (_error) {
          data = {};
        }

        if (!response.ok) {
          const error = normalizeError(response, data);

          if (response.status === 429 && retryConfig.retryOn429 && attempt < retryConfig.maxRetries) {
            const waitMs = error.retryAfter
              ? error.retryAfter * 1000
              : calculateBackoff(attempt);
            await sleep(waitMs);
            attempt += 1;
            continue;
          }

          throw error;
        }

        return data;
      } catch (error) {
        lastError = error;

        const isClientError = error?.status >= 400 && error?.status < 500 && error?.status !== 429;
        if (isClientError) {
          throw error;
        }

        if (attempt < retryConfig.maxRetries) {
          const waitMs = calculateBackoff(attempt);
          await sleep(waitMs);
          attempt += 1;
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Request failed');
  };

  return {
    getEmbedEventTypes: (embed) => request('/embed/public/event-types', {
      headers: buildEmbedHeaders(embed),
    }),
    getEventType: ({ slug, org }, embed) => {
      const query = toQueryString({ org });
      return request(`/bookings/public/event/${encodeURIComponent(slug)}${query}`, {
        headers: buildEmbedHeaders(embed),
      });
    },
    getSlots: ({ eventTypeId, startDate, endDate, timezone }, embed) => request(
      `/bookings/public/slots${toQueryString({
        event_type_id: eventTypeId,
        start_date: startDate,
        end_date: endDate,
        timezone,
      })}`,
      {
        headers: buildEmbedHeaders(embed),
      }
    ),
    createBooking: (payload, embed) => request('/bookings/public', {
      method: 'POST',
      body: payload,
      headers: buildEmbedHeaders(embed),
    }),
    getSignedWidgetToken: (payload, embed) => request('/embed/public/widget-token', {
      method: 'POST',
      body: payload,
      headers: buildEmbedHeaders(embed),
    }),
    autoSuggest: ({ eventTypeId, timezone }, embed) => request(
      `/bookings/auto-suggest${toQueryString({ event_type_id: eventTypeId, timezone })}`,
      {
        headers: buildEmbedHeaders(embed),
      }
    ),
    getRecentTemplates: (params, embed) => request(
      `/bookings/public/recent-templates${toQueryString(params)}`,
      {
        headers: buildEmbedHeaders(embed),
      }
    ),
    getSuggestions: (params, embed) => request(
      `/bookings/suggestions${toQueryString({
        calendar_id: params?.calendarId,
        event_type_id: params?.eventTypeId,
        original_start: params?.originalStart,
        duration: params?.duration,
        timezone: params?.timezone,
        count: params?.count,
      })}`,
      {
        headers: buildEmbedHeaders(embed),
      }
    ),
    submitSuggestionFeedback: (payload, embed) => request('/bookings/suggestions/feedback', {
      method: 'POST',
      body: payload,
      headers: buildEmbedHeaders(embed),
    }),
    savePreferences: (payload, embed) => request('/bookings/public/preferences', {
      method: 'POST',
      body: payload,
      headers: buildEmbedHeaders(embed),
    }),
    clearPreferences: (payload, embed) => request('/bookings/public/preferences', {
      method: 'DELETE',
      body: payload,
      headers: buildEmbedHeaders(embed),
    }),
    getEventPaymentInfo: (eventTypeId, embed) => request(
      `/billing/public/event-payment/${encodeURIComponent(eventTypeId)}`,
      {
        headers: buildEmbedHeaders(embed),
      }
    ),
    getPublicMeeting: (bookingId, email, embed) => request(
      `/meetings/public/${encodeURIComponent(bookingId)}${toQueryString({ email })}`,
      {
        headers: buildEmbedHeaders(embed),
      }
    ),
    createPaymentIntent: (payload, embed) => request('/billing/public/create-payment-intent', {
      method: 'POST',
      body: payload,
      headers: buildEmbedHeaders(embed),
    }),
    createPayPalOrder: (payload, embed) => request('/billing/public/create-paypal-order', {
      method: 'POST',
      body: payload,
      headers: buildEmbedHeaders(embed),
    }),
    capturePayPalOrder: (payload, embed) => request('/billing/public/capture-paypal-order', {
      method: 'POST',
      body: payload,
      headers: buildEmbedHeaders(embed),
    }),
  };
};
