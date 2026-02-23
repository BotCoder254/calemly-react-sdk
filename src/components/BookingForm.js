import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  DollarSign,
  FileText,
  Globe,
  Mail,
  MessageSquare,
  Phone,
  Shield,
  Sparkles,
  User,
  Video,
  X,
} from 'lucide-react';
import { useOptionalSchedulerContext } from '../context/SchedulerContext';
import {
  formatDateInZone,
  formatDateShortInZone,
  formatTimeInZone,
  formatUtcConfirmation,
} from '../utils/time';
import { PAYPAL_PENDING_BOOKING_STORAGE_KEY } from '../constants';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { CustomFormRenderer, validateFormAnswers } from './CustomFormRenderer';
import { PaymentCheckout } from './PaymentCheckout';
import { ConflictResolver } from './ConflictResolver';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_ARRAY = [];

const isValidEmail = (value) => /.+@.+\..+/.test((value || '').trim());

const hasBriefContent = (template) => {
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    return false;
  }

  return Object.entries(template).some(([key, value]) => {
    if (key === 'recording_consent') {
      return false;
    }

    if (typeof value === 'string') {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return Boolean(value);
  });
};

const safeSetSessionItem = (key, value) => {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // no-op
  }
};

export function BookingForm({
  eventType,
  slot,
  calendarTimezone,
  userTimezone,
  isLoading,
  error,
  alternatives,
  onSubmit,
  onBack,
  onPickAlternative,
  templateOptions,
  initialTemplate,
  templateFallbackSuggestions,
  onApplyTemplateSuggestion,
}) {
  const scheduler = useOptionalSchedulerContext();
  const state = scheduler?.state;
  const actions = scheduler?.actions;
  const config = scheduler?.config;

  const resolvedEventType = eventType || state?.eventType;
  const resolvedSlot = slot || state?.selectedSlot;
  const resolvedCalendarTimezone =
    calendarTimezone
    || state?.eventType?.calendarTimezone
    || state?.eventType?.calendar_timezone
    || state?.calendarTimezone
    || 'UTC';
  const resolvedUserTimezone =
    userTimezone
    || state?.userTimezone
    || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const resolvedIsLoading = typeof isLoading === 'boolean' ? isLoading : Boolean(state?.isSubmitting);
  const resolvedError = typeof error === 'string' ? error : state?.error || '';
  const resolvedAlternatives = alternatives || state?.alternatives || EMPTY_ARRAY;
  const resolvedTemplateOptions = templateOptions || state?.templateOptions || EMPTY_ARRAY;
  const resolvedInitialTemplate = initialTemplate || state?.activeTemplate || null;
  const resolvedTemplateFallbackSuggestions =
    templateFallbackSuggestions
    || state?.templateFallbackSuggestions
    || EMPTY_ARRAY;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [answers, setAnswers] = useState({});
  const [honeypot, setHoneypot] = useState('');

  const [fieldErrors, setFieldErrors] = useState({});
  const [inlineError, setInlineError] = useState('');
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateModified, setTemplateModified] = useState(false);
  const [savePreferencesConsent, setSavePreferencesConsent] = useState(false);
  const [templateSaveDefault, setTemplateSaveDefault] = useState(false);
  const [templateActionError, setTemplateActionError] = useState('');
  const [isClearingPreferences, setIsClearingPreferences] = useState(false);

  const [showConflictResolver, setShowConflictResolver] = useState(false);
  const [conflictSuggestions, setConflictSuggestions] = useState([]);
  const [bestSuggestion, setBestSuggestion] = useState(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const [paymentInfo, setPaymentInfo] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState('stripe');
  const [isLoadingPaymentInfo, setIsLoadingPaymentInfo] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);

  const [showBrief, setShowBrief] = useState(false);
  const [briefConsents, setBriefConsents] = useState({});
  const [briefChecklist, setBriefChecklist] = useState({});
  const [briefRecordingConsent, setBriefRecordingConsent] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [briefError, setBriefError] = useState(null);
  const [briefPendingPayload, setBriefPendingPayload] = useState(null);

  const templatesById = useMemo(
    () => new Map((resolvedTemplateOptions || []).map((template) => [template.id, template])),
    [resolvedTemplateOptions]
  );

  const hasTemplateFallbackSuggestions = Array.isArray(resolvedTemplateFallbackSuggestions)
    && resolvedTemplateFallbackSuggestions.length > 0;

  const stripePublishableKey = config?.stripePublishableKey || null;
  const isPaidEvent = Boolean(
    resolvedEventType?.requires_payment
      && resolvedEventType?.price_cents > 0
      && resolvedEventType?.payment_enabled
  );
  const isValid = Boolean(name.trim()) && isValidEmail(email);

  const briefTemplate = useMemo(() => {
    if (resolvedEventType?.brief_template && typeof resolvedEventType.brief_template === 'object') {
      return resolvedEventType.brief_template;
    }
    return {};
  }, [resolvedEventType?.brief_template]);

  const hasBrief = useMemo(() => (
    Boolean(resolvedEventType?.brief_enabled)
      && hasBriefContent(briefTemplate)
  ), [briefTemplate, resolvedEventType?.brief_enabled]);

  const formatPrice = useCallback((priceCents, currency = 'USD') => {
    const safeAmount = Number.isFinite(priceCents) ? priceCents : 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(safeAmount / 100);
  }, []);

  const applyTemplate = useCallback((template) => {
    if (!template) {
      return;
    }

    if (template.contact_name) setName(template.contact_name);
    if (template.contact_email) setEmail(template.contact_email);
    if (template.contact_phone) setPhone(template.contact_phone);
    if (template.answers && typeof template.answers === 'object' && !Array.isArray(template.answers)) {
      setAnswers(template.answers);
    }

    const safeTemplateId = typeof template.id === 'string' && UUID_PATTERN.test(template.id)
      ? template.id
      : '';

    setSelectedTemplateId(safeTemplateId);
    setTemplateModified(false);
    setSavePreferencesConsent(false);
    setTemplateSaveDefault(false);
    setInlineError('');
    setTemplateActionError('');
  }, []);

  useEffect(() => {
    if (resolvedInitialTemplate?.id) {
      applyTemplate(resolvedInitialTemplate);
      return;
    }

    if (!selectedTemplateId && resolvedTemplateOptions.length > 0) {
      const preferred = resolvedTemplateOptions.find((template) => template.is_default) || resolvedTemplateOptions[0];
      applyTemplate(preferred);
    }
  }, [applyTemplate, resolvedInitialTemplate, selectedTemplateId, resolvedTemplateOptions]);

  const markTemplateEdited = useCallback(() => {
    if (selectedTemplateId) {
      setTemplateModified(true);
    }
  }, [selectedTemplateId]);

  const handleTemplateChange = (templateId) => {
    setSelectedTemplateId(templateId);
    setInlineError('');
    setTemplateActionError('');

    if (!templateId) {
      setTemplateModified(false);
      setSavePreferencesConsent(false);
      setTemplateSaveDefault(false);
      return;
    }

    const selectedTemplate = templatesById.get(templateId);
    applyTemplate(selectedTemplate);
  };

  const submitBooking = async (payload) => {
    if (typeof onSubmit === 'function') {
      return onSubmit(payload);
    }

    return actions?.submitBooking?.(payload);
  };

  const selectAlternativeSlot = (alternativeSlot) => {
    if (typeof onPickAlternative === 'function') {
      onPickAlternative(alternativeSlot);
      return;
    }

    actions?.selectAlternativeSlot?.(alternativeSlot);
  };

  const applyFallbackTemplate = (template) => {
    applyTemplate(template);

    if (typeof onApplyTemplateSuggestion === 'function') {
      onApplyTemplateSuggestion(template);
      return;
    }

    actions?.applyTemplateSuggestion?.(template);
  };

  const buildBasePayload = useCallback(() => {
    const payload = {
      guest_name: name.trim(),
      guest_email: email.trim().toLowerCase(),
      guest_phone: phone.trim() || undefined,
      guest_notes: notes.trim() || undefined,
      answers: Object.keys(answers).length > 0 ? answers : undefined,
      honeypot,
    };

    if (selectedTemplateId) {
      payload.template_id = selectedTemplateId;
      payload.template_used = true;
      payload.template_modified = templateModified;
      payload.save_preferences_consent = savePreferencesConsent;
      payload.template_save_default = templateSaveDefault;

      if (templateModified) {
        payload.inline_template = {
          event_type_id: resolvedEventType?.id,
          calendar_id: resolvedEventType?.calendarId || resolvedEventType?.calendar_id,
          duration_minutes: resolvedEventType?.duration,
          timezone: resolvedUserTimezone,
          answers,
        };
      }
    }

    return payload;
  }, [
    answers,
    email,
    honeypot,
    name,
    notes,
    phone,
    resolvedEventType?.calendarId,
    resolvedEventType?.calendar_id,
    resolvedEventType?.duration,
    resolvedEventType?.id,
    resolvedUserTimezone,
    savePreferencesConsent,
    selectedTemplateId,
    templateModified,
    templateSaveDefault,
  ]);

  const submitPayload = useCallback(async (payload) => {
    const result = await submitBooking(payload);
    if (result?.ok === false && result.error?.message) {
      setInlineError(result.error.message);
      setFieldErrors((previous) => ({
        ...previous,
        _form: result.error.message,
      }));
    }
    return result;
  }, [submitBooking]);

  const submitOrStartPayment = useCallback(async (payload) => {
    if (!isPaidEvent || !resolvedEventType?.id || !resolvedSlot) {
      return submitPayload(payload);
    }

    setIsCreatingPayment(true);
    setPendingPayload(payload);

    try {
      if (selectedProvider === 'paypal') {
        const orderData = await actions?.createPayPalOrder?.({
          eventTypeId: resolvedEventType.id,
          guestEmail: payload.guest_email,
          guestName: payload.guest_name,
        });

        const approveUrl = orderData?.approveUrl || orderData?.approve_url;
        const orderId = orderData?.orderId || orderData?.order_id || orderData?.id;

        if (!approveUrl || !orderId) {
          throw new Error('Unable to initialize PayPal checkout. Please try again.');
        }

        safeSetSessionItem(PAYPAL_PENDING_BOOKING_STORAGE_KEY, {
          orderId,
          payload,
          slot: {
            start: resolvedSlot.start,
            end: resolvedSlot.end,
            startLocal: resolvedSlot.startLocal,
            endLocal: resolvedSlot.endLocal,
          },
          eventType: {
            id: resolvedEventType.id,
            name: resolvedEventType.name,
            slug: resolvedEventType.slug,
            duration: resolvedEventType.duration,
            calendarId: resolvedEventType.calendarId || resolvedEventType.calendar_id,
            orgName: resolvedEventType.orgName || resolvedEventType.org_name,
            requires_payment: resolvedEventType.requires_payment,
            payment_enabled: resolvedEventType.payment_enabled,
            price_cents: resolvedEventType.price_cents,
            currency: resolvedEventType.currency,
            refund_policy: resolvedEventType.refund_policy,
          },
          userTimezone: resolvedUserTimezone,
        });

        if (typeof window !== 'undefined') {
          try {
            if (typeof window.location?.assign === 'function') {
              window.location.assign(approveUrl);
            } else {
              window.location.href = approveUrl;
            }
          } catch (_error) {
            window.__calemlyRedirectUrl = approveUrl;
          }
        }

        return { ok: true, redirected: true };
      }

      const paymentData = await actions?.createPaymentIntent?.({
        eventTypeId: resolvedEventType.id,
        guestEmail: payload.guest_email,
        guestName: payload.guest_name,
      });

      const clientSecret = paymentData?.clientSecret || paymentData?.client_secret;
      if (!clientSecret) {
        throw new Error('Unable to initialize payment. Please try again.');
      }

      setPaymentClientSecret(clientSecret);
      setShowPayment(true);
      return { ok: true, paymentRequired: true };
    } catch (paymentError) {
      setFieldErrors((previous) => ({
        ...previous,
        _form: paymentError?.message || 'Failed to initialize payment. Please try again.',
      }));
      return {
        ok: false,
        error: paymentError,
      };
    } finally {
      setIsCreatingPayment(false);
    }
  }, [
    actions,
    isPaidEvent,
    resolvedEventType,
    resolvedSlot,
    resolvedUserTimezone,
    selectedProvider,
    submitPayload,
  ]);

  const handleClearPreferences = useCallback(async () => {
    if (!resolvedEventType?.id || (!email.trim() && !phone.trim())) {
      setTemplateActionError('Add an email or phone first to clear saved preferences.');
      return;
    }

    if (typeof actions?.clearSavedPreferences !== 'function') {
      setTemplateActionError('Preference clearing is unavailable in this context.');
      return;
    }

    setIsClearingPreferences(true);
    setTemplateActionError('');

    try {
      await actions.clearSavedPreferences({
        eventTypeId: resolvedEventType.id,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });

      setSelectedTemplateId('');
      setTemplateModified(false);
      setSavePreferencesConsent(false);
      setTemplateSaveDefault(false);
    } catch (clearError) {
      setTemplateActionError(clearError?.message || 'Failed to clear saved preferences.');
    } finally {
      setIsClearingPreferences(false);
    }
  }, [actions, email, phone, resolvedEventType?.id]);

  useEffect(() => {
    if (!isPaidEvent || !resolvedEventType?.id) {
      setPaymentInfo(null);
      setSelectedProvider('stripe');
      return;
    }

    if (typeof actions?.getEventPaymentInfo !== 'function') {
      setPaymentInfo(null);
      setSelectedProvider('stripe');
      return;
    }

    let active = true;
    setIsLoadingPaymentInfo(true);

    actions.getEventPaymentInfo(resolvedEventType.id)
      .then((info) => {
        if (!active) {
          return;
        }

        setPaymentInfo(info || null);
        if (info?.providers?.stripe && info?.providers?.paypal) {
          setSelectedProvider(info.preferredProvider || 'stripe');
        } else if (info?.providers?.paypal) {
          setSelectedProvider('paypal');
        } else {
          setSelectedProvider('stripe');
        }
      })
      .catch(() => {
        if (active) {
          setPaymentInfo(null);
          setSelectedProvider('stripe');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingPaymentInfo(false);
        }
      });

    return () => {
      active = false;
    };
  }, [actions, isPaidEvent, resolvedEventType?.id]);

  useEffect(() => {
    const shouldLoadSuggestions = Boolean(
      resolvedError
      && resolvedSlot
      && resolvedEventType?.id
      && !hasTemplateFallbackSuggestions
      && (resolvedError.toLowerCase().includes('conflict')
        || resolvedError.toLowerCase().includes('slot was booked')
        || resolvedError.toLowerCase().includes('unavailable'))
    );

    if (!shouldLoadSuggestions) {
      if (showConflictResolver) {
        setShowConflictResolver(false);
      }
      if (conflictSuggestions.length > 0) {
        setConflictSuggestions([]);
      }
      if (bestSuggestion) {
        setBestSuggestion(null);
      }
      if (isLoadingSuggestions) {
        setIsLoadingSuggestions(false);
      }
      return;
    }

    let active = true;
    setShowConflictResolver(true);

    const toFallbackSuggestions = () => (resolvedAlternatives || []).map((option, index) => ({
      ...option,
      confidenceScore: Math.max(40, 75 - (index * 10)),
      explanation: 'Available alternative slot',
    }));

    if (typeof actions?.getConflictSuggestions !== 'function') {
      const fallbackSuggestions = toFallbackSuggestions();
      setConflictSuggestions(fallbackSuggestions);
      setBestSuggestion(fallbackSuggestions[0] || null);
      return () => {
        active = false;
      };
    }

    setIsLoadingSuggestions(true);

    actions.getConflictSuggestions({
      originalStart: resolvedSlot.start,
      duration: resolvedEventType.duration,
      count: 5,
    })
      .then((result) => {
        if (!active) {
          return;
        }

        const suggestions = Array.isArray(result) ? result : [];
        if (suggestions.length > 0) {
          setConflictSuggestions(suggestions);
          setBestSuggestion(suggestions[0] || null);
          return;
        }

        const fallbackSuggestions = toFallbackSuggestions();
        setConflictSuggestions(fallbackSuggestions);
        setBestSuggestion(fallbackSuggestions[0] || null);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        const fallbackSuggestions = toFallbackSuggestions();
        setConflictSuggestions(fallbackSuggestions);
        setBestSuggestion(fallbackSuggestions[0] || null);
      })
      .finally(() => {
        if (active) {
          setIsLoadingSuggestions(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    actions,
    hasTemplateFallbackSuggestions,
    resolvedAlternatives,
    resolvedError,
    resolvedEventType?.duration,
    resolvedEventType?.id,
    resolvedSlot,
    showConflictResolver,
    conflictSuggestions,
    bestSuggestion,
    isLoadingSuggestions,
  ]);

  const handleAnswersChange = useCallback((nextAnswers) => {
    setAnswers(nextAnswers || {});
    markTemplateEdited();
    setFieldErrors((previous) => {
      if (!previous || Object.keys(previous).length === 0) {
        return previous;
      }

      const nextErrors = { ...previous };
      Object.keys(nextAnswers || {}).forEach((fieldId) => {
        if (nextErrors[fieldId]) {
          delete nextErrors[fieldId];
        }
      });
      return nextErrors;
    });
  }, [markTemplateEdited]);

  const handleSelectSuggestion = useCallback((suggestion) => {
    if (!suggestion) {
      return;
    }

    if (
      typeof actions?.submitSuggestionFeedback === 'function'
      && resolvedEventType?.id
      && resolvedSlot?.start
      && resolvedSlot?.end
    ) {
      actions.submitSuggestionFeedback({
        originalSlot: {
          start: resolvedSlot.start,
          end: resolvedSlot.end,
        },
        suggestedSlot: {
          start: suggestion.start,
          end: suggestion.end,
        },
        accepted: true,
        confidenceScore: suggestion.confidenceScore,
      }).catch(() => {});
    }

    setShowConflictResolver(false);
    setConflictSuggestions([]);
    setBestSuggestion(null);

    selectAlternativeSlot({
      start: suggestion.start,
      end: suggestion.end,
      startLocal: suggestion.startLocal,
      endLocal: suggestion.endLocal,
    });
  }, [actions, resolvedEventType?.id, resolvedSlot?.end, resolvedSlot?.start, selectAlternativeSlot]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (honeypot) {
      return;
    }

    const nextErrors = {};
    if (!name.trim()) nextErrors.name = 'Please enter your name';
    if (!isValidEmail(email)) nextErrors.email = 'Please enter a valid email address';

    if (resolvedEventType?.form_schema?.fields?.length > 0) {
      const validation = validateFormAnswers(resolvedEventType.form_schema, answers);
      if (!validation.isValid) {
        Object.assign(nextErrors, validation.errors);
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setInlineError('');

    const payload = buildBasePayload();

    if (hasBrief && !showBrief) {
      setBriefPendingPayload(payload);
      setBriefError(null);
      setShowBrief(true);
      return;
    }

    await submitOrStartPayment(payload);
  };

  const handleBriefConfirm = useCallback(async () => {
    setBriefError(null);

    const requiredConsents = (briefTemplate.consent_items || []).filter((item) => item.required);
    for (const consent of requiredConsents) {
      if (!briefConsents[consent.id]) {
        setBriefError(`Please accept: "${consent.label}"`);
        return;
      }
    }

    if (briefTemplate.recording_consent && !briefRecordingConsent) {
      setBriefError('Recording consent is required for this meeting.');
      return;
    }

    const briefAck = {
      acknowledged_at: new Date().toISOString(),
      consent_items: Object.keys(briefConsents).length > 0 ? briefConsents : undefined,
      checklist_items: Object.keys(briefChecklist).length > 0 ? briefChecklist : undefined,
      recording_consent: briefTemplate.recording_consent ? briefRecordingConsent : undefined,
    };

    const payload = {
      ...(briefPendingPayload || buildBasePayload()),
      brief_ack: briefAck,
    };

    await submitOrStartPayment(payload);
  }, [
    briefChecklist,
    briefConsents,
    briefPendingPayload,
    briefRecordingConsent,
    briefTemplate,
    buildBasePayload,
    submitOrStartPayment,
  ]);

  const handleBriefBack = useCallback(() => {
    setShowBrief(false);
    setBriefError(null);
  }, []);

  const handlePaymentSuccess = async (paymentIntent) => {
    if (!pendingPayload) {
      setShowPayment(false);
      return;
    }

    const result = await submitPayload({
      ...pendingPayload,
      payment_intent_id: paymentIntent?.id,
    });

    if (result?.ok) {
      setShowPayment(false);
      setPaymentClientSecret(null);
      setPendingPayload(null);
    }
  };

  const handlePaymentClose = () => {
    setShowPayment(false);
    setPaymentClientSecret(null);
  };

  const briefAllConsentsAccepted = (() => {
    if (!hasBrief) return true;
    const requiredConsents = (briefTemplate.consent_items || []).filter((item) => item.required);
    const allRequiredConsentsAccepted = requiredConsents.every((item) => briefConsents[item.id]);
    const recordingAccepted = !briefTemplate.recording_consent || briefRecordingConsent;
    return allRequiredConsentsAccepted && recordingAccepted;
  })();

  if (showConflictResolver && (conflictSuggestions.length > 0 || isLoadingSuggestions)) {
    return (
      <ConflictResolver
        isOpen
        onClose={() => setShowConflictResolver(false)}
        conflictDetails={{ message: resolvedError || inlineError }}
        suggestions={conflictSuggestions}
        bestSuggestion={bestSuggestion}
        onSelectSuggestion={handleSelectSuggestion}
        onAutoSelect={handleSelectSuggestion}
        userTimezone={resolvedUserTimezone}
        isLoading={isLoadingSuggestions}
      />
    );
  }

  if (!resolvedSlot) {
    return null;
  }

  if (showBrief && hasBrief) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="w-full max-w-xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-card overflow-hidden flex flex-col max-h-[calc(100vh-12rem)] border border-transparent dark:border-slate-700"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBriefBack}
              className="p-2 text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Go back to form"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: resolvedEventType?.color || '#10B981' }}
              />
              <h2 className="text-lg font-semibold text-neutral-dark dark:text-slate-100">
                {briefTemplate.headline || 'Before You Book'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onBack || actions?.goBack}
            className="p-2 text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Close brief"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-100 dark:border-primary-900/40">
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="w-4 h-4 text-primary-600 dark:text-primary-300 flex-shrink-0" />
            <span className="font-medium text-primary-700 dark:text-primary-200">
              {formatDateShortInZone(resolvedSlot.start, resolvedUserTimezone)}
              {' • '}
              {formatTimeInZone(resolvedSlot.start, resolvedUserTimezone)}
              {' - '}
              {formatTimeInZone(resolvedSlot.end, resolvedUserTimezone)}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto flex-1" role="region" aria-label="Booking brief">
          {briefTemplate.summary ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl"
            >
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-gray-500 dark:text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                  {briefTemplate.summary}
                </p>
              </div>
            </motion.div>
          ) : null}

          {briefTemplate.checklist?.length > 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="text-sm font-semibold text-neutral-dark dark:text-slate-100 mb-3 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-primary-500" />
                Preparation Checklist
              </h3>
              <div className="space-y-2">
                {briefTemplate.checklist.map((item) => (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      briefChecklist[item.id]
                        ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-900/40'
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(briefChecklist[item.id])}
                      onChange={(event) => {
                        setBriefChecklist((previous) => ({
                          ...previous,
                          [item.id]: event.target.checked,
                        }));
                      }}
                      className="mt-0.5 w-4 h-4 text-primary-500 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-slate-200">{item.label}</span>
                  </label>
                ))}
              </div>
            </motion.div>
          ) : null}

          {briefTemplate.cancellation_policy ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-900/40 rounded-xl"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">Cancellation Policy</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-100 leading-relaxed whitespace-pre-line">
                    {briefTemplate.cancellation_policy}
                  </p>
                </div>
              </div>
            </motion.div>
          ) : null}

          {briefTemplate.custom_notes ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900/40 rounded-xl"
            >
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">Important Notes</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-100 leading-relaxed whitespace-pre-line">
                    {briefTemplate.custom_notes}
                  </p>
                </div>
              </div>
            </motion.div>
          ) : null}

          {briefTemplate.faq?.length > 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="text-sm font-semibold text-neutral-dark dark:text-slate-100 mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-primary-500" />
                Frequently Asked Questions
              </h3>
              <div className="space-y-2">
                {briefTemplate.faq.map((item) => (
                  <div key={item.id} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedFaq((previous) => (previous === item.id ? null : item.id))}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                      aria-expanded={expandedFaq === item.id}
                    >
                      <span className="text-sm font-medium text-neutral-dark dark:text-slate-100 pr-2">{item.question}</span>
                      {expandedFaq === item.id ? (
                        <ChevronUp className="w-4 h-4 text-gray-400 dark:text-slate-300 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400 dark:text-slate-300 flex-shrink-0" />
                      )}
                    </button>

                    <AnimatePresence>
                      {expandedFaq === item.id ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-slate-700 text-sm text-gray-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                            {item.answer}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : null}

          {briefTemplate.recording_consent ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-purple-50 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-900/40 rounded-xl"
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={briefRecordingConsent}
                  onChange={(event) => setBriefRecordingConsent(event.target.checked)}
                  className="mt-0.5 w-4 h-4 text-purple-500 rounded focus:ring-purple-500"
                />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Video className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-semibold text-purple-800 dark:text-purple-200">Recording Consent</span>
                    <span className="text-xs text-red-500 font-medium">Required</span>
                  </div>
                  <p className="text-sm text-purple-700 dark:text-purple-100">
                    This session may be recorded for quality and training purposes. By checking this box, you consent to the recording.
                  </p>
                </div>
              </label>
            </motion.div>
          ) : null}

          {briefTemplate.consent_items?.length > 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="text-sm font-semibold text-neutral-dark dark:text-slate-100 mb-3 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary-500" />
                Acknowledgements
              </h3>
              <div className="space-y-2">
                {briefTemplate.consent_items.map((item) => (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      briefConsents[item.id]
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/40'
                        : item.required
                          ? 'bg-white dark:bg-slate-900 border-red-200 dark:border-red-900/40'
                          : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(briefConsents[item.id])}
                      onChange={(event) => {
                        setBriefConsents((previous) => ({
                          ...previous,
                          [item.id]: event.target.checked,
                        }));
                      }}
                      className="mt-0.5 w-4 h-4 text-green-500 rounded focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-slate-200">
                      {item.label}
                      {item.required ? <span className="text-red-500 ml-1">*</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </motion.div>
          ) : null}

          {briefError ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-50 border border-red-200 rounded-xl"
            >
              <p className="text-sm text-red-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {briefError}
              </p>
            </motion.div>
          ) : null}

          <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <Shield className="w-4 h-4 text-gray-400 dark:text-slate-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Your acknowledgements are stored securely with your booking.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 p-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 flex-shrink-0">
          <Button variant="outline" onClick={handleBriefBack} className="order-2 sm:order-1">
            Back
          </Button>
          <Button
            onClick={handleBriefConfirm}
            disabled={!briefAllConsentsAccepted || resolvedIsLoading || isCreatingPayment}
            isLoading={resolvedIsLoading || isCreatingPayment}
            className="order-1 sm:order-2"
          >
            {isCreatingPayment
              ? (selectedProvider === 'paypal' ? 'Redirecting to PayPal...' : 'Preparing Payment...')
              : resolvedIsLoading
                ? 'Booking...'
                : isPaidEvent
                  ? `Acknowledge & Pay ${formatPrice(resolvedEventType?.price_cents, resolvedEventType?.currency || 'USD')}`
                  : 'Acknowledge & Confirm'}
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-card overflow-hidden flex flex-col max-h-[calc(100vh-12rem)] border border-transparent dark:border-slate-700">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
        <h2 className="text-lg font-semibold text-neutral-dark dark:text-slate-100">Confirm Your Details</h2>
        <button
          type="button"
          onClick={onBack || actions?.goBack}
          className="p-2 text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-100 dark:border-primary-900/40">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary-500 text-white flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-neutral-dark dark:text-slate-100 text-sm sm:text-base">
              {resolvedEventType?.name || 'Meeting'}
            </p>
            <p className="text-primary-700 dark:text-primary-200 font-medium mt-1 text-sm sm:text-base">
              <span className="sm:hidden">{formatDateShortInZone(resolvedSlot.start, resolvedUserTimezone)}</span>
              <span className="hidden sm:inline">{formatDateInZone(resolvedSlot.start, resolvedUserTimezone)}</span>
            </p>
            <p className="text-primary-600 dark:text-primary-300 text-sm">
              {formatTimeInZone(resolvedSlot.start, resolvedUserTimezone)} - {formatTimeInZone(resolvedSlot.end, resolvedUserTimezone)}
            </p>

            <div className="mt-2 sm:mt-3 space-y-1 text-xs sm:text-sm">
              <div className="flex items-center gap-2 text-gray-600 dark:text-slate-300">
                <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="truncate">{resolvedUserTimezone}</span>
              </div>
              {resolvedCalendarTimezone !== resolvedUserTimezone ? (
                <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="truncate">
                    Host: {formatTimeInZone(resolvedSlot.start, resolvedCalendarTimezone)} ({resolvedCalendarTimezone})
                  </span>
                </div>
              ) : null}
              <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="truncate">UTC: {formatUtcConfirmation(resolvedSlot.start)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {(resolvedError || inlineError) ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-4 p-3 sm:p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-error text-sm sm:text-base">{resolvedError || inlineError}</p>

              {hasTemplateFallbackSuggestions ? (
                <p className="text-xs text-red-700 mt-1">
                  Pick a recommended fallback template or continue with the standard form.
                </p>
              ) : null}

              {resolvedAlternatives.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAlternatives((previous) => !previous)}
                  className="text-sm text-primary-600 hover:text-primary-700 mt-2 font-medium"
                >
                  {showAlternatives ? 'Hide' : 'Show'} alternative times
                </button>
              ) : null}
            </div>
          </div>

          {hasTemplateFallbackSuggestions ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-gray-600 dark:text-slate-300">Recommended templates:</p>
              {resolvedTemplateFallbackSuggestions.slice(0, 3).map((template, index) => (
                <button
                  key={template.id || index}
                  type="button"
                  onClick={() => applyFallbackTemplate(template)}
                  className="w-full text-left p-2 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-neutral-dark dark:text-slate-100">
                      {template.template_name || template.event_type_name || 'Recommended template'}
                    </p>
                    <span className="text-xs font-medium text-primary-600 dark:text-primary-300">Use template</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    {template.event_type_name || resolvedEventType?.name || 'Meeting'}
                    {template.duration_minutes ? ` • ${template.duration_minutes} min` : ''}
                  </p>
                </button>
              ))}
            </div>
          ) : null}

          <AnimatePresence>
            {showAlternatives && resolvedAlternatives.length > 0 ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 space-y-2"
              >
                <p className="text-sm text-gray-600 dark:text-slate-300">Available alternatives:</p>
                {resolvedAlternatives.map((alternativeSlot, index) => (
                  <button
                    key={`${alternativeSlot.start}-${index}`}
                    type="button"
                    onClick={() => selectAlternativeSlot(alternativeSlot)}
                    className="w-full text-left p-2 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 transition-colors"
                  >
                    <p className="text-sm font-medium text-neutral-dark dark:text-slate-100">
                      {formatDateShortInZone(alternativeSlot.start, resolvedUserTimezone)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {formatTimeInZone(alternativeSlot.start, resolvedUserTimezone)} - {formatTimeInZone(alternativeSlot.end, resolvedUserTimezone)}
                    </p>
                  </button>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}

      <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
          style={{ position: 'absolute', left: '-9999px', opacity: 0, width: 0, height: 0 }}
          aria-hidden="true"
        />

        {resolvedTemplateOptions.length > 0 ? (
          <div className="p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-primary-700 dark:text-primary-200">Book same as last time</p>
                <p className="text-xs text-primary-600 dark:text-primary-300">Reuse your previous booking details, then edit anything you want.</p>
              </div>
              <Sparkles className="w-4 h-4 text-primary-500 flex-shrink-0" />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedTemplateId || ''}
                onChange={(event) => handleTemplateChange(event.target.value)}
                className="flex-1 px-3 py-2 border border-primary-200 rounded-lg bg-white dark:bg-slate-900 text-sm text-neutral-dark dark:text-slate-100"
              >
                <option value="">Use standard form</option>
                {resolvedTemplateOptions.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.template_name}
                    {template.is_default ? ' (Default)' : ''}
                  </option>
                ))}
              </select>

              <Button
                type="button"
                variant="outline"
                onClick={handleClearPreferences}
                disabled={isClearingPreferences}
              >
                {isClearingPreferences ? 'Clearing...' : 'Forget preferences'}
              </Button>
            </div>

            {selectedTemplateId ? (
              <>
                <label className="flex items-center gap-2 text-xs text-primary-700 dark:text-primary-200">
                  <input
                    type="checkbox"
                    checked={savePreferencesConsent}
                    onChange={(event) => setSavePreferencesConsent(event.target.checked)}
                  />
                  Save updates to my booking preferences
                </label>

                <label className="flex items-center gap-2 text-xs text-primary-700 dark:text-primary-200">
                  <input
                    type="checkbox"
                    checked={templateSaveDefault}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setTemplateSaveDefault(checked);
                      if (checked) {
                        setSavePreferencesConsent(true);
                      }
                    }}
                  />
                  Set as default for next time
                </label>

                <p className="text-xs text-primary-700 dark:text-primary-200 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  This booking uses your saved template.
                  {templateModified ? ' Updated before confirm.' : ''}
                </p>
              </>
            ) : null}

            {templateActionError ? (
              <p className="text-xs text-red-600 dark:text-red-300">{templateActionError}</p>
            ) : null}
          </div>
        ) : null}

        <Input
          label="Your Name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            markTemplateEdited();
          }}
          placeholder="John Smith"
          icon={User}
          error={fieldErrors.name}
          required
        />

        <Input
          type="email"
          label="Email Address"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            markTemplateEdited();
          }}
          placeholder="john@example.com"
          icon={Mail}
          error={fieldErrors.email}
          required
          helperText="Confirmation will be sent to this email"
        />

        <Input
          type="tel"
          label="Phone Number (optional)"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            markTemplateEdited();
          }}
          placeholder="+1 (555) 123-4567"
          icon={Phone}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
            Additional Notes (optional)
          </label>
          <div className="relative">
            <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                markTemplateEdited();
              }}
              placeholder="Any additional information or questions..."
              rows={3}
              className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none text-sm sm:text-base dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {resolvedEventType?.form_schema && resolvedEventType.form_schema.fields?.length > 0 ? (
          <CustomFormRenderer
            formSchema={resolvedEventType.form_schema}
            answers={answers}
            onChange={handleAnswersChange}
            errors={fieldErrors}
          />
        ) : null}

        {fieldErrors._form ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {fieldErrors._form}
            </p>
          </div>
        ) : null}

        {isPaidEvent ? (
          <div className="space-y-3">
            <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-primary-600 dark:text-primary-300" />
                  <span className="font-medium text-neutral-dark dark:text-slate-100">Payment Required</span>
                </div>
                <span className="text-xl font-bold text-primary-600 dark:text-primary-300">
                  {formatPrice(resolvedEventType?.price_cents, resolvedEventType?.currency || 'USD')}
                </span>
              </div>
              {resolvedEventType?.refund_policy && resolvedEventType.refund_policy !== 'none' ? (
                <p className="text-xs text-primary-600 dark:text-primary-300 mt-2">
                  {resolvedEventType.refund_policy === 'flexible' ? 'Full refund available up to 24 hours before.' : null}
                  {resolvedEventType.refund_policy === 'moderate' ? 'Full refund available up to 5 days before.' : null}
                  {resolvedEventType.refund_policy === 'strict' ? '50% refund available up to 7 days before.' : null}
                </p>
              ) : null}
            </div>

            {isLoadingPaymentInfo ? (
              <p className="text-xs text-gray-500 dark:text-slate-400">Loading payment methods...</p>
            ) : null}

            {paymentInfo?.providers?.stripe && paymentInfo?.providers?.paypal ? (
              <div className="p-4 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-3">
                  Choose payment method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedProvider('stripe')}
                    className={`rounded-xl border-2 px-3 py-2 text-sm font-medium transition-colors ${selectedProvider === 'stripe' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200' : 'border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:border-gray-300 dark:hover:border-slate-600'}`}
                  >
                    Card (Stripe)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProvider('paypal')}
                    className={`rounded-xl border-2 px-3 py-2 text-sm font-medium transition-colors ${selectedProvider === 'paypal' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200' : 'border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:border-gray-300 dark:hover:border-slate-600'}`}
                  >
                    PayPal
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
          <Shield className="w-4 h-4 text-gray-400 dark:text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Your information is secure and is only shared with the meeting host.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onBack || actions?.goBack}>
            Back
          </Button>
          <Button
            type="submit"
            disabled={!isValid || resolvedIsLoading || isCreatingPayment || (isPaidEvent && isLoadingPaymentInfo)}
            isLoading={resolvedIsLoading || isCreatingPayment}
          >
            {isCreatingPayment
              ? (selectedProvider === 'paypal' ? 'Redirecting to PayPal...' : 'Preparing Payment...')
              : resolvedIsLoading
                ? 'Booking...'
                : hasBrief
                  ? (isPaidEvent
                    ? `Review Brief & Pay ${formatPrice(resolvedEventType?.price_cents, resolvedEventType?.currency || 'USD')}`
                    : 'Review Brief')
                  : isPaidEvent
                    ? (selectedProvider === 'paypal'
                      ? `Pay with PayPal ${formatPrice(resolvedEventType?.price_cents, resolvedEventType?.currency || 'USD')}`
                      : `Pay ${formatPrice(resolvedEventType?.price_cents, resolvedEventType?.currency || 'USD')}`)
                    : 'Confirm Booking'}
          </Button>
        </div>
      </form>

      <PaymentCheckout
        isOpen={showPayment}
        onClose={handlePaymentClose}
        onSuccess={handlePaymentSuccess}
        clientSecret={paymentClientSecret}
        amount={resolvedEventType?.price_cents || 0}
        currency={resolvedEventType?.currency || 'USD'}
        eventName={resolvedEventType?.name || 'Meeting'}
        organizerName={resolvedEventType?.orgName || state?.organization?.name || 'Organizer'}
        refundPolicy={resolvedEventType?.refund_policy}
        stripePublishableKey={stripePublishableKey}
      />
    </div>
  );
}
