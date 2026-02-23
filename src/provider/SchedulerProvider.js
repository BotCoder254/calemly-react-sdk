import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSchedulerApi } from '../api/client';
import {
  BOOKING_STEPS,
  DEFAULT_API_BASE_URL,
  DEFAULT_CACHE_TTL_MS,
  PAYPAL_PENDING_BOOKING_STORAGE_KEY,
  DEFAULT_SLOT_WINDOW_DAYS,
} from '../constants';
import { SchedulerContext } from '../context/SchedulerContext';
import {
  buildWidgetBookingSource,
  getOrCreateClientRequestId,
  getOrCreateContactToken,
  getOrCreateTrackingSessionId,
  resolveEmbedOrigin,
} from '../utils/bookingSource';
import { dayjs, resolveUserTimezone } from '../utils/time';

const normalizeOrgIdentifier = (org) => {
  if (!org) {
    return null;
  }

  if (typeof org === 'string') {
    return org;
  }

  return org.id || org.slug || null;
};

const normalizeBookingError = (error) => {
  if (error?.code === 'OFFLINE') {
    return {
      ...error,
      message: 'You appear to be offline. Reconnect to the internet and try booking again.',
      alternatives: [],
    };
  }

  if (error?.status === 429) {
    const retrySeconds = Number.isFinite(error?.retryAfter)
      ? error.retryAfter
      : Number.parseInt(error?.retryAfter, 10);

    const retryMessage = Number.isFinite(retrySeconds) && retrySeconds > 0
      ? ` Please wait about ${retrySeconds} seconds and try again.`
      : ' Please wait a moment and try again.';

    return {
      ...error,
      message: `Too many booking attempts.${retryMessage}`,
      alternatives: [],
    };
  }

  if (error?.code === 'SLOT_CONFLICT') {
    return {
      ...error,
      message: 'That slot was booked moments ago. Please choose another available time.',
      alternatives: Array.isArray(error?.alternatives) ? error.alternatives : [],
    };
  }

  if (error?.code === 'SLOT_LOCKED') {
    return {
      ...error,
      message: 'That slot is currently being reserved. Try again in a few seconds.',
      alternatives: [],
    };
  }

  if (error?.code === 'TEMPLATE_INVALID') {
    return {
      ...error,
      message: error.message || 'Your saved template is no longer valid for this event.',
      alternatives: [],
      suggestions: Array.isArray(error?.suggestions) ? error.suggestions : [],
    };
  }

  if (error?.code === 'NO_SAVED_TEMPLATE') {
    return {
      ...error,
      message: 'Saved preferences were not found. Continue with the standard booking form.',
      alternatives: [],
    };
  }

  return {
    ...error,
    message: error?.message || 'Failed to create booking. Please try again.',
    alternatives: Array.isArray(error?.alternatives) ? error.alternatives : [],
  };
};

const mergeSubmissionMeta = (fallbackMeta, tokenMeta) => {
  if (!tokenMeta) {
    return fallbackMeta;
  }

  if (typeof tokenMeta === 'string') {
    return {
      ...fallbackMeta,
      signed_widget_token: tokenMeta,
    };
  }

  const sourceDetails = {
    ...fallbackMeta.source_details,
    ...(tokenMeta.source_details || {}),
    client_request_id: fallbackMeta.client_request_id,
    tracking_session_id: fallbackMeta.source_details?.tracking_session_id,
    contact_token: fallbackMeta.source_details?.contact_token,
  };

  return {
    ...fallbackMeta,
    source: tokenMeta.source || fallbackMeta.source,
    source_client: tokenMeta.source_client || fallbackMeta.source_client,
    source_details: sourceDetails,
    signed_widget_token:
      tokenMeta.signed_widget_token
      || tokenMeta.token
      || fallbackMeta.signed_widget_token
      || undefined,
  };
};

const pickPreferredTemplate = (templates) => {
  if (!Array.isArray(templates) || templates.length === 0) {
    return null;
  }

  return templates.find((template) => template.is_default) || templates[0];
};

const parsePayPalReturnContext = () => {
  if (typeof window === 'undefined' || typeof URLSearchParams === 'undefined') {
    return {
      hasReturnParams: false,
      token: null,
      payerId: null,
      cancelled: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const payerId = params.get('PayerID');
  const cancelled = params.get('cancelled') === 'true';

  return {
    hasReturnParams: Boolean(token || payerId || cancelled),
    token,
    payerId,
    cancelled,
  };
};

const clearPayPalReturnParams = () => {
  if (typeof window === 'undefined' || typeof URL === 'undefined') {
    return;
  }

  try {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('token');
    nextUrl.searchParams.delete('PayerID');
    nextUrl.searchParams.delete('cancelled');
    const replacement = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    window.history.replaceState({}, '', replacement);
  } catch (_error) {
    // no-op
  }
};

const readPendingPayPalBooking = () => {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(PAYPAL_PENDING_BOOKING_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch (_error) {
    return null;
  }
};

const clearPendingPayPalBooking = () => {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.removeItem(PAYPAL_PENDING_BOOKING_STORAGE_KEY);
  } catch (_error) {
    // no-op
  }
};

export function SchedulerProvider({
  children,
  apiBaseUrl = process.env.CALEMLY_API_URL || DEFAULT_API_BASE_URL,
  embedKey = null,
  embedOrigin = null,
  mode = 'inline',
  theme = 'light',
  timezone,
  eventSlug = null,
  org = null,
  eventType: providedEventType = null,
  autoSignedWidgetToken = true,
  tokenProvider = null,
  onBookingSuccess,
  onBookingError,
  onBeforeBook,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  slotWindowDays = DEFAULT_SLOT_WINDOW_DAYS,
  stripePublishableKey = null,
}) {
  const orgIdentifier = useMemo(() => normalizeOrgIdentifier(org), [org]);
  const userTimezone = useMemo(() => resolveUserTimezone(timezone), [timezone]);
  const resolvedEmbedOrigin = useMemo(() => embedOrigin || resolveEmbedOrigin(), [embedOrigin]);

  const embedContext = useMemo(() => ({
    key: embedKey || null,
    origin: resolvedEmbedOrigin || null,
  }), [embedKey, resolvedEmbedOrigin]);

  const api = useMemo(() => createSchedulerApi({ baseUrl: apiBaseUrl || DEFAULT_API_BASE_URL }), [apiBaseUrl]);

  const trackingSessionId = useMemo(() => getOrCreateTrackingSessionId(), []);
  const contactToken = useMemo(() => getOrCreateContactToken(), []);

  const [organization, setOrganization] = useState(null);
  const [embedSettings, setEmbedSettings] = useState({});
  const [eventTypes, setEventTypes] = useState([]);
  const [eventType, setEventType] = useState(providedEventType || null);

  const [step, setStep] = useState(
    providedEventType || eventSlug ? BOOKING_STEPS.SELECT_TIME : BOOKING_STEPS.SELECT_EVENT
  );

  const [slots, setSlots] = useState({});
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const [templateOptions, setTemplateOptions] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [templateFallbackSuggestions, setTemplateFallbackSuggestions] = useState([]);

  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [alternatives, setAlternatives] = useState([]);

  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isFetchingEvent, setIsFetchingEvent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoFinding, setIsAutoFinding] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const availabilityCacheRef = useRef(new Map());
  const initRequestRef = useRef(0);
  const paypalReturnHandledRef = useRef(false);

  const clearBookingError = useCallback(() => {
    setError(null);
    setAlternatives([]);
    setTemplateFallbackSuggestions([]);
  }, []);

  const invalidateAvailability = useCallback((eventTypeId = null) => {
    if (!eventTypeId) {
      availabilityCacheRef.current.clear();
      return;
    }

    const prefix = `${eventTypeId}:`;
    for (const key of availabilityCacheRef.current.keys()) {
      if (key.startsWith(prefix)) {
        availabilityCacheRef.current.delete(key);
      }
    }
  }, []);

  const mutateSlotState = useCallback((slot, mutateFn) => {
    if (!slot?.start) {
      return;
    }

    const dateStr = slot.start.split('T')[0];

    setSlots((previous) => ({
      ...previous,
      [dateStr]: mutateFn(previous[dateStr] || []),
    }));
  }, []);

  const markSlotPending = useCallback((slot) => {
    mutateSlotState(slot, (daySlots) => daySlots.map((item) => (
      item.start === slot.start ? { ...item, isPending: true } : item
    )));
  }, [mutateSlotState]);

  const revertPendingSlot = useCallback((slot) => {
    mutateSlotState(slot, (daySlots) => daySlots.map((item) => (
      item.start === slot.start ? { ...item, isPending: false } : item
    )));
  }, [mutateSlotState]);

  const removeBookedSlot = useCallback((slot) => {
    mutateSlotState(slot, (daySlots) => daySlots.filter((item) => item.start !== slot.start));
  }, [mutateSlotState]);

  const fetchEventTypeBySlug = useCallback(async (slug, orgOverride = null) => {
    const scopedOrg = orgOverride || orgIdentifier || null;
    const data = await api.getEventType({ slug, org: scopedOrg }, embedContext);
    return data?.eventType || null;
  }, [api, embedContext, orgIdentifier]);

  const selectEventType = useCallback(async (selected, options = {}) => {
    if (!selected) {
      return null;
    }

    clearBookingError();
    setTemplateOptions([]);
    setActiveTemplate(null);

    const hasDetails = Boolean(selected.calendarTimezone || selected.form_schema || selected.orgName);
    if (hasDetails) {
      setEventType(selected);
      setStep(BOOKING_STEPS.SELECT_TIME);
      return selected;
    }

    if (!selected.slug) {
      setLoadError('Selected event type is missing a slug, so details cannot be loaded.');
      return null;
    }

    setIsFetchingEvent(true);
    try {
      const loaded = await fetchEventTypeBySlug(selected.slug, options.org || organization?.id || orgIdentifier);
      setEventType(loaded);
      setStep(BOOKING_STEPS.SELECT_TIME);
      return loaded;
    } catch (requestError) {
      setLoadError(requestError.message || 'Failed to load event details');
      return null;
    } finally {
      setIsFetchingEvent(false);
    }
  }, [clearBookingError, fetchEventTypeBySlug, organization?.id, orgIdentifier]);

  const loadSlots = useCallback(async ({ force = false } = {}) => {
    if (!eventType?.id) {
      return;
    }

    const startDate = dayjs().format('YYYY-MM-DD');
    const endDate = dayjs().add(slotWindowDays, 'day').format('YYYY-MM-DD');
    const cacheKey = [eventType.id, startDate, endDate, userTimezone].join(':');

    if (!force) {
      const cacheEntry = availabilityCacheRef.current.get(cacheKey);
      if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
        setSlots(cacheEntry.slots || {});
        return;
      }
    }

    setIsLoadingSlots(true);
    try {
      const response = await api.getSlots({
        eventTypeId: eventType.id,
        startDate,
        endDate,
        timezone: userTimezone,
      }, embedContext);

      const nextSlots = response?.slots || {};
      setSlots(nextSlots);
      availabilityCacheRef.current.set(cacheKey, {
        slots: nextSlots,
        expiresAt: Date.now() + cacheTtlMs,
      });
    } catch (requestError) {
      setError(requestError.message || 'Failed to load available slots.');
    } finally {
      setIsLoadingSlots(false);
    }
  }, [api, cacheTtlMs, embedContext, eventType?.id, slotWindowDays, userTimezone]);

  const loadRecentTemplates = useCallback(async () => {
    if (!eventType?.id) {
      setTemplateOptions([]);
      setActiveTemplate(null);
      return;
    }

    try {
      const result = await api.getRecentTemplates({
        event_type_id: eventType.id,
        contact_token: contactToken,
        top_n: 3,
      }, embedContext);

      const templates = result?.templates || [];
      setTemplateOptions(templates);

      if (!activeTemplate && templates.length > 0) {
        setActiveTemplate(pickPreferredTemplate(templates));
      }
    } catch (_error) {
      setTemplateOptions([]);
      setActiveTemplate(null);
    }
  }, [activeTemplate, api, contactToken, embedContext, eventType?.id]);

  const resolveSubmissionMeta = useCallback(async ({
    guestData,
    slot,
    eventTypeOverride = null,
  }) => {
    const scopedEventType = eventTypeOverride || eventType;

    if (!scopedEventType?.id || !slot?.start || !slot?.end) {
      return {};
    }

    const guestEmail = (guestData?.guest_email || '').trim().toLowerCase();
    const requestScope = [
      'sdk',
      embedKey || 'public',
      scopedEventType.id,
      slot.start,
      slot.end,
      guestEmail || 'anonymous',
    ].join(':');

    const clientRequestId = getOrCreateClientRequestId(requestScope);
    const landingPageUrl =
      (typeof document !== 'undefined' && document.referrer)
        || (typeof window !== 'undefined' ? window.location.href : null);

    const baseSource = buildWidgetBookingSource({
      widgetId: embedKey,
      embedOrigin: resolvedEmbedOrigin,
      trackingSessionId,
      pageId: scopedEventType.id,
      pageSlug: scopedEventType.slug || null,
      landingPageUrl,
      contactToken,
    });

    const fallbackMeta = {
      client_request_id: clientRequestId,
      source: baseSource.source,
      source_client: baseSource.source_client,
      source_details: {
        ...baseSource.source_details,
        client_request_id: clientRequestId,
        tracking_session_id: trackingSessionId,
        contact_token: contactToken,
      },
    };

    if (typeof tokenProvider === 'function') {
      try {
        const tokenMeta = await tokenProvider({
          guestData,
          slot,
          eventType: scopedEventType,
          embedContext,
          fallbackMeta,
        });

        return mergeSubmissionMeta(fallbackMeta, tokenMeta);
      } catch (_error) {
        return fallbackMeta;
      }
    }

    if (!embedKey || autoSignedWidgetToken === false) {
      return fallbackMeta;
    }

    try {
      const signedMeta = await api.getSignedWidgetToken({
        ...fallbackMeta.source_details,
        source_client: baseSource.source_client,
      }, embedContext);

      return mergeSubmissionMeta(fallbackMeta, signedMeta);
    } catch (_error) {
      return fallbackMeta;
    }
  }, [
    api,
    autoSignedWidgetToken,
    contactToken,
    embedContext,
    embedKey,
    eventType,
    resolvedEmbedOrigin,
    tokenProvider,
    trackingSessionId,
  ]);

  const createBookingForContext = useCallback(async ({
    guestData,
    slot: slotOverride = null,
    eventTypeOverride = null,
  }) => {
    const scopedSlot = slotOverride || selectedSlot;
    const scopedEventType = eventTypeOverride || eventType;

    if (!scopedSlot || !scopedEventType?.id) {
      return {
        ok: false,
        error: new Error('Select an event time before submitting the booking form.'),
      };
    }

    setIsSubmitting(true);
    clearBookingError();
    markSlotPending(scopedSlot);

    try {
      let payload = {
        event_type_id: scopedEventType.id,
        start_time: scopedSlot.start,
        end_time: scopedSlot.end,
        timezone: userTimezone,
        ...guestData,
      };

      const submissionMeta = await resolveSubmissionMeta({
        guestData: payload,
        slot: scopedSlot,
        eventTypeOverride: scopedEventType,
      });

      payload = {
        ...payload,
        ...submissionMeta,
      };

      if (typeof onBeforeBook === 'function') {
        const beforeResult = await onBeforeBook(payload, {
          eventType: scopedEventType,
          slot: scopedSlot,
        });

        if (beforeResult === false) {
          const cancelled = new Error('Booking cancelled before submit.');
          cancelled.code = 'BOOKING_CANCELLED';
          throw cancelled;
        }

        if (beforeResult && typeof beforeResult === 'object' && !Array.isArray(beforeResult)) {
          payload = {
            ...payload,
            ...beforeResult,
          };
        }
      }

      const result = await api.createBooking(payload, embedContext);
      const booking = result?.booking;

      removeBookedSlot(scopedSlot);
      setConfirmedBooking(booking || null);
      setSelectedSlot(null);
      setEventType((previous) => previous || scopedEventType);
      setActiveTemplate(null);
      setTemplateFallbackSuggestions([]);
      setStep(BOOKING_STEPS.SUCCESS);
      invalidateAvailability(scopedEventType.id);

      if (typeof onBookingSuccess === 'function') {
        onBookingSuccess(booking, {
          payload,
          eventType: scopedEventType,
        });
      }

      return {
        ok: true,
        booking,
        payload,
      };
    } catch (requestError) {
      revertPendingSlot(scopedSlot);
      const normalized = normalizeBookingError(requestError);

      setError(normalized.message);
      setAlternatives(normalized.alternatives || []);

      if (Array.isArray(normalized.suggestions) && normalized.suggestions.length > 0) {
        setTemplateFallbackSuggestions(normalized.suggestions);
      } else {
        setTemplateFallbackSuggestions([]);
      }

      if (typeof onBookingError === 'function') {
        onBookingError(normalized, {
          eventType: scopedEventType,
          slot: scopedSlot,
        });
      }

      return {
        ok: false,
        error: normalized,
      };
    } finally {
      setIsSubmitting(false);
    }
  }, [
    api,
    clearBookingError,
    embedContext,
    eventType,
    invalidateAvailability,
    markSlotPending,
    onBeforeBook,
    onBookingError,
    onBookingSuccess,
    removeBookedSlot,
    resolveSubmissionMeta,
    revertPendingSlot,
    selectedSlot,
    userTimezone,
  ]);

  const submitBooking = useCallback(async (guestData) => createBookingForContext({
    guestData,
  }), [createBookingForContext]);

  const selectSlot = useCallback((slot) => {
    setSelectedSlot(slot || null);
    clearBookingError();
  }, [clearBookingError]);

  const confirmSelectedSlot = useCallback(() => {
    if (!selectedSlot) {
      return;
    }

    setStep(BOOKING_STEPS.CONFIRM);
    clearBookingError();
  }, [clearBookingError, selectedSlot]);

  const selectAlternativeSlot = useCallback((alternativeSlot) => {
    if (!alternativeSlot) {
      return;
    }

    setSelectedSlot({
      start: alternativeSlot.start,
      end: alternativeSlot.end,
      startLocal: alternativeSlot.startLocal,
      endLocal: alternativeSlot.endLocal,
    });
    clearBookingError();
  }, [clearBookingError]);

  const useRecentTemplate = useCallback(() => {
    if (!selectedSlot) {
      return null;
    }

    const preferred = pickPreferredTemplate(templateOptions);
    if (!preferred) {
      return null;
    }

    setActiveTemplate(preferred);
    setStep(BOOKING_STEPS.CONFIRM);
    clearBookingError();
    return preferred;
  }, [clearBookingError, selectedSlot, templateOptions]);

  const applyTemplateSuggestion = useCallback((template) => {
    if (!template) {
      return;
    }

    setActiveTemplate(template);
    setTemplateFallbackSuggestions([]);
    clearBookingError();
  }, [clearBookingError]);

  const autoFindBestSlot = useCallback(async () => {
    if (!eventType?.id) {
      return null;
    }

    setIsAutoFinding(true);
    clearBookingError();

    try {
      const result = await api.autoSuggest({
        eventTypeId: eventType.id,
        timezone: userTimezone,
      }, embedContext);

      if (result?.bestSlot) {
        setSelectedSlot({
          start: result.bestSlot.start,
          end: result.bestSlot.end,
          startLocal: result.bestSlot.startLocal,
          endLocal: result.bestSlot.endLocal,
        });
        return result.bestSlot;
      }

      setError('No available slots were found right now.');
      return null;
    } catch (requestError) {
      setError(requestError.message || 'Failed to find the next best slot.');
      return null;
    } finally {
      setIsAutoFinding(false);
    }
  }, [api, clearBookingError, embedContext, eventType?.id, userTimezone]);

  const getConflictSuggestions = useCallback(async ({
    originalStart,
    duration,
    count = 5,
  }) => {
    if (!eventType?.id || !originalStart) {
      return [];
    }

    const result = await api.getSuggestions({
      calendarId: eventType.calendarId || eventType.calendar_id || null,
      eventTypeId: eventType.id,
      originalStart,
      duration: duration || eventType.duration,
      timezone: userTimezone,
      count,
    }, embedContext);

    return result?.suggestions || [];
  }, [api, embedContext, eventType, userTimezone]);

  const submitSuggestionFeedback = useCallback(async ({
    originalSlot,
    suggestedSlot,
    accepted = true,
    confidenceScore,
  }) => {
    if (!eventType?.id || !originalSlot?.start || !suggestedSlot?.start) {
      return null;
    }

    return api.submitSuggestionFeedback({
      calendar_id: eventType.calendarId || eventType.calendar_id || null,
      event_type_id: eventType.id,
      original_slot_start: originalSlot.start,
      original_slot_end: originalSlot.end || null,
      suggested_slot_start: suggestedSlot.start,
      suggested_slot_end: suggestedSlot.end || null,
      was_accepted: accepted,
      confidence_score: Number.isFinite(confidenceScore) ? confidenceScore : undefined,
      guest_timezone: userTimezone,
    }, embedContext);
  }, [api, embedContext, eventType, userTimezone]);

  const saveInviteePreferences = useCallback(async ({
    eventTypeId,
    email,
    phone,
    name,
    timezone: preferredTimezone,
    templateId,
    consent = true,
  }) => {
    if (!eventTypeId || (!email && !phone)) {
      return null;
    }

    return api.savePreferences({
      event_type_id: eventTypeId,
      email,
      phone,
      name,
      timezone: preferredTimezone,
      template_id: templateId,
      consent,
    }, embedContext);
  }, [api, embedContext]);

  const clearSavedPreferences = useCallback(async ({
    eventTypeId,
    email,
    phone,
  }) => {
    if (!eventTypeId || (!email && !phone)) {
      return null;
    }

    return api.clearPreferences({
      event_type_id: eventTypeId,
      email,
      phone,
    }, embedContext);
  }, [api, embedContext]);

  const getEventPaymentInfo = useCallback(async (eventTypeId) => {
    if (!eventTypeId) {
      return null;
    }

    return api.getEventPaymentInfo(eventTypeId, embedContext);
  }, [api, embedContext]);

  const getPublicMeeting = useCallback(async ({ bookingId, email }) => {
    if (!bookingId || !email) {
      return null;
    }

    return api.getPublicMeeting(bookingId, email, embedContext);
  }, [api, embedContext]);

  const createPaymentIntent = useCallback(async ({ eventTypeId, guestEmail, guestName }) => {
    if (!eventTypeId || !guestEmail || !guestName) {
      return null;
    }

    return api.createPaymentIntent({
      event_type_id: eventTypeId,
      guest_email: guestEmail,
      guest_name: guestName,
    }, embedContext);
  }, [api, embedContext]);

  const createPayPalOrder = useCallback(async ({ eventTypeId, guestEmail, guestName }) => {
    if (!eventTypeId || !guestEmail || !guestName) {
      return null;
    }

    return api.createPayPalOrder({
      event_type_id: eventTypeId,
      guest_email: guestEmail,
      guest_name: guestName,
    }, embedContext);
  }, [api, embedContext]);

  const capturePayPalOrder = useCallback(async ({ orderId, payerId }) => {
    if (!orderId) {
      return null;
    }

    return api.capturePayPalOrder({
      order_id: orderId,
      payer_id: payerId || undefined,
    }, embedContext);
  }, [api, embedContext]);

  const completePayPalBooking = useCallback(async ({
    pendingBooking,
    payerId,
  }) => {
    const orderId = pendingBooking?.orderId || pendingBooking?.order_id;
    const guestPayload = pendingBooking?.payload;
    const pendingSlot = pendingBooking?.slot;
    const pendingEventType = pendingBooking?.eventType;

    if (!orderId || !guestPayload || !pendingSlot?.start || !pendingSlot?.end || !pendingEventType?.id) {
      return {
        ok: false,
        error: new Error('Saved PayPal booking context is invalid. Please book again.'),
      };
    }

    try {
      const captureResult = await capturePayPalOrder({
        orderId,
        payerId,
      });

      const captureId = captureResult?.captureId || captureResult?.capture_id || captureResult?.id;
      if (!captureId && captureResult?.success === false) {
        throw new Error(captureResult.error || 'PayPal payment capture failed.');
      }

      const result = await createBookingForContext({
        guestData: {
          ...guestPayload,
          timezone: guestPayload.timezone || pendingBooking?.userTimezone || userTimezone,
          paypal_order_id: orderId,
          paypal_capture_id: captureId || undefined,
        },
        slot: pendingSlot,
        eventTypeOverride: pendingEventType,
      });

      if (result.ok) {
        clearPendingPayPalBooking();
      }

      return result;
    } catch (error) {
      const normalized = normalizeBookingError(error);
      setError(normalized.message);
      setAlternatives(normalized.alternatives || []);
      if (typeof onBookingError === 'function') {
        onBookingError(normalized, {
          eventType: pendingEventType,
          slot: pendingSlot,
        });
      }

      return {
        ok: false,
        error: normalized,
      };
    }
  }, [capturePayPalOrder, createBookingForContext, onBookingError, userTimezone]);

  useEffect(() => {
    if (paypalReturnHandledRef.current) {
      return;
    }

    const returnContext = parsePayPalReturnContext();
    if (!returnContext.hasReturnParams) {
      return;
    }

    paypalReturnHandledRef.current = true;
    const pendingBooking = readPendingPayPalBooking();

    if (returnContext.cancelled) {
      clearPendingPayPalBooking();
      setError('Payment was cancelled. No charges were made.');
      clearPayPalReturnParams();
      return;
    }

    if (!pendingBooking) {
      setError('Booking session expired. Please try booking again.');
      clearPayPalReturnParams();
      return;
    }

    if (!returnContext.token || !returnContext.payerId) {
      setError('Missing payment return details. Please try booking again.');
      clearPayPalReturnParams();
      return;
    }

    let cancelled = false;
    const process = async () => {
      const result = await completePayPalBooking({
        pendingBooking,
        payerId: returnContext.payerId,
      });

      if (!cancelled && !result.ok && result.error?.message) {
        setError(result.error.message);
      }

      if (!cancelled) {
        clearPayPalReturnParams();
      }
    };

    process();

    return () => {
      cancelled = true;
    };
  }, [completePayPalBooking]);

  const goBack = useCallback(() => {
    if (step === BOOKING_STEPS.CONFIRM) {
      setStep(BOOKING_STEPS.SELECT_TIME);
      clearBookingError();
      return;
    }

    if (step === BOOKING_STEPS.SELECT_TIME && embedSettings.selection_mode !== 'single') {
      setStep(BOOKING_STEPS.SELECT_EVENT);
      setEventType(null);
      setSlots({});
      setSelectedSlot(null);
      setActiveTemplate(null);
      clearBookingError();
    }
  }, [clearBookingError, embedSettings.selection_mode, step]);

  const restartAfterSuccess = useCallback(() => {
    setConfirmedBooking(null);
    setSelectedSlot(null);
    setActiveTemplate(null);
    clearBookingError();

    if (embedSettings.selection_mode === 'single' || eventSlug || providedEventType) {
      setStep(BOOKING_STEPS.SELECT_TIME);
      loadSlots({ force: true });
      return;
    }

    setStep(BOOKING_STEPS.SELECT_EVENT);
    setEventType(null);
  }, [
    clearBookingError,
    embedSettings.selection_mode,
    eventSlug,
    loadSlots,
    providedEventType,
  ]);

  useEffect(() => {
    let cancelled = false;
    const currentRequestId = initRequestRef.current + 1;
    initRequestRef.current = currentRequestId;

    const initialize = async () => {
      setIsInitializing(true);
      setLoadError(null);
      clearBookingError();

      try {
        const returnContext = parsePayPalReturnContext();
        if (returnContext.hasReturnParams && readPendingPayPalBooking()) {
          setIsInitializing(false);
          return;
        }

        if (providedEventType) {
          setOrganization((previous) => previous || {
            id: providedEventType.orgId || providedEventType.org_id || null,
            name: providedEventType.orgName || providedEventType.org_name || 'Organization',
            logo_url: providedEventType.orgLogo || providedEventType.org_logo || null,
          });
          setEventType(providedEventType);
          setEventTypes([]);
          setStep(BOOKING_STEPS.SELECT_TIME);
          return;
        }

        if (eventSlug) {
          const loaded = await fetchEventTypeBySlug(eventSlug, orgIdentifier);
          if (cancelled || initRequestRef.current !== currentRequestId) {
            return;
          }

          if (!loaded) {
            setLoadError('Unable to load the requested event.');
            return;
          }

          setOrganization({
            id: loaded.orgId,
            name: loaded.orgName,
            logo_url: loaded.orgLogo,
          });
          setEventType(loaded);
          setEventTypes([]);
          setStep(BOOKING_STEPS.SELECT_TIME);
          return;
        }

        if (embedKey) {
          const data = await api.getEmbedEventTypes(embedContext);
          if (cancelled || initRequestRef.current !== currentRequestId) {
            return;
          }

          const loadedEventTypes = data?.eventTypes || [];

          setOrganization(data?.organization || null);
          setEmbedSettings(data?.embed || {});
          setEventTypes(loadedEventTypes);

          if (loadedEventTypes.length === 0) {
            setStep(BOOKING_STEPS.SELECT_EVENT);
            return;
          }

          const shouldAutoSelect =
            (data?.embed?.selection_mode === 'single' && loadedEventTypes.length === 1)
            || loadedEventTypes.length === 1;

          if (!shouldAutoSelect) {
            setStep(BOOKING_STEPS.SELECT_EVENT);
            return;
          }

          const firstEvent = loadedEventTypes[0];

          if (firstEvent?.slug) {
            const loadedEventType = await fetchEventTypeBySlug(firstEvent.slug, data?.organization?.id || orgIdentifier);
            if (cancelled || initRequestRef.current !== currentRequestId) {
              return;
            }
            setEventType(loadedEventType);
            setStep(BOOKING_STEPS.SELECT_TIME);
            return;
          }

          setEventType(firstEvent);
          setStep(BOOKING_STEPS.SELECT_TIME);
          return;
        }

        setLoadError('Missing scheduler setup. Pass an embed key or an event slug.');
      } catch (requestError) {
        if (!cancelled && initRequestRef.current === currentRequestId) {
          setLoadError(requestError.message || 'Failed to load scheduler data.');
        }
      } finally {
        if (!cancelled && initRequestRef.current === currentRequestId) {
          setIsInitializing(false);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, [
    api,
    clearBookingError,
    embedContext,
    embedKey,
    eventSlug,
    fetchEventTypeBySlug,
    orgIdentifier,
    providedEventType,
    refreshTick,
  ]);

  useEffect(() => {
    setSlots({});
    setSelectedSlot(null);
    setActiveTemplate(null);
    setTemplateFallbackSuggestions([]);
    clearBookingError();
  }, [eventType?.id, clearBookingError]);

  useEffect(() => {
    const returnContext = parsePayPalReturnContext();
    if (returnContext.hasReturnParams && readPendingPayPalBooking()) {
      return;
    }

    if (!eventType?.id || step !== BOOKING_STEPS.SELECT_TIME) {
      return;
    }

    loadSlots();
    loadRecentTemplates();
  }, [eventType?.id, loadRecentTemplates, loadSlots, step]);

  const actions = useMemo(() => ({
    clearBookingError,
    invalidateAvailability,
    selectEventType,
    selectSlot,
    confirmSelectedSlot,
    selectAlternativeSlot,
    loadSlots,
    autoFindBestSlot,
    getConflictSuggestions,
    submitSuggestionFeedback,
    saveInviteePreferences,
    clearSavedPreferences,
    getEventPaymentInfo,
    getPublicMeeting,
    createPaymentIntent,
    createPayPalOrder,
    capturePayPalOrder,
    completePayPalBooking,
    submitBooking,
    goBack,
    restartAfterSuccess,
    setStep,
    setActiveTemplate,
    useRecentTemplate,
    applyTemplateSuggestion,
    refreshTemplates: loadRecentTemplates,
    refreshScheduler: () => {
      setRefreshTick((value) => value + 1);
    },
  }), [
    applyTemplateSuggestion,
    capturePayPalOrder,
    autoFindBestSlot,
    clearSavedPreferences,
    clearBookingError,
    completePayPalBooking,
    confirmSelectedSlot,
    createPayPalOrder,
    createPaymentIntent,
    getConflictSuggestions,
    getEventPaymentInfo,
    getPublicMeeting,
    goBack,
    invalidateAvailability,
    loadRecentTemplates,
    loadSlots,
    restartAfterSuccess,
    saveInviteePreferences,
    selectAlternativeSlot,
    selectEventType,
    selectSlot,
    submitSuggestionFeedback,
    submitBooking,
    useRecentTemplate,
  ]);

  const state = useMemo(() => ({
    organization,
    embedSettings,
    eventTypes,
    eventType,
    slots,
    selectedSlot,
    confirmedBooking,
    step,
    loadError,
    error,
    alternatives,
    templateOptions,
    activeTemplate,
    templateFallbackSuggestions,
    isInitializing,
    isLoadingSlots,
    isFetchingEvent,
    isSubmitting,
    isAutoFinding,
    isLoading: isInitializing || isLoadingSlots,
    userTimezone,
    calendarTimezone: eventType?.calendarTimezone || eventType?.calendar_timezone || 'UTC',
    contactToken,
    trackingSessionId,
  }), [
    activeTemplate,
    alternatives,
    confirmedBooking,
    contactToken,
    embedSettings,
    error,
    eventType,
    eventTypes,
    isAutoFinding,
    isFetchingEvent,
    isInitializing,
    isLoadingSlots,
    isSubmitting,
    loadError,
    organization,
    selectedSlot,
    slots,
    step,
    templateFallbackSuggestions,
    templateOptions,
    trackingSessionId,
    userTimezone,
  ]);

  const config = useMemo(() => ({
    apiBaseUrl,
    mode,
    theme,
    embedKey,
    embedOrigin: resolvedEmbedOrigin,
    embedContext,
    orgIdentifier,
    eventSlug,
    slotWindowDays,
    cacheTtlMs,
    stripePublishableKey,
  }), [
    apiBaseUrl,
    cacheTtlMs,
    embedContext,
    embedKey,
    eventSlug,
    mode,
    orgIdentifier,
    resolvedEmbedOrigin,
    slotWindowDays,
    stripePublishableKey,
    theme,
  ]);

  const value = useMemo(() => ({
    config,
    state,
    actions,
    constants: {
      BOOKING_STEPS,
    },
  }), [actions, config, state]);

  return (
    <SchedulerContext.Provider value={value}>
      {children}
    </SchedulerContext.Provider>
  );
}
