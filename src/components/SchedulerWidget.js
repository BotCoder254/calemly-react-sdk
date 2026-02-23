import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ExternalLink, AlertCircle, User, X } from 'lucide-react';
import { SchedulerProvider } from '../provider/SchedulerProvider';
import { useOptionalSchedulerContext } from '../context/SchedulerContext';
import { useBooking } from '../hooks/useBooking';
import { Button } from './common/Button';
import { Spinner, InlineSpinner } from './common/Spinner';
import { LogoIcon, PoweredByCalemly } from './common/Logo';
import { SlotPicker } from './SlotPicker';
import { BookingForm } from './BookingForm';
import { BookingSuccess } from './BookingSuccess';

const PROVIDER_PROP_KEYS = [
  'apiBaseUrl',
  'embedKey',
  'embedOrigin',
  'mode',
  'theme',
  'timezone',
  'eventSlug',
  'org',
  'eventType',
  'autoSignedWidgetToken',
  'tokenProvider',
  'onBookingSuccess',
  'onBookingError',
  'onBeforeBook',
  'cacheTtlMs',
  'slotWindowDays',
  'stripePublishableKey',
];

const resolveTheme = (theme) => {
  if (theme === 'system' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return theme === 'dark' ? 'dark' : 'light';
};

const normalizeExternalUrl = (value) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
};

const pickProviderProps = (props) => Object.fromEntries(
  PROVIDER_PROP_KEYS.filter((key) => key in props).map((key) => [key, props[key]])
);

function SchedulerWidgetInner({ className = '', ctaLabel, showPoweredBy = true }) {
  const {
    organization,
    embedSettings,
    eventTypes,
    eventType,
    slots,
    selectedSlot,
    confirmedBooking,
    error,
    alternatives,
    templateOptions,
    step,
    loadError,
    isInitializing,
    isLoadingSlots,
    isFetchingEvent,
    isSubmitting,
    userTimezone,
    selectEventType,
    selectSlot,
    confirmSelectedSlot,
    selectAlternativeSlot,
    useRecentTemplate,
    autoFindBestSlot,
    goBack,
    restartAfterSuccess,
    config,
    steps,
  } = useBooking();

  const [isWidgetOpen, setIsWidgetOpen] = useState(config.mode !== 'modal');
  const resolvedTheme = useMemo(() => resolveTheme(config.theme), [config.theme]);

  const hostMeta = eventType?.hostAvatar
    || eventType?.hostName
    || eventType?.hostBio
    || eventType?.hostJobTitle
    || eventType?.hostLocation
    || eventType?.hostPhone
    || eventType?.hostWebsite;

  const wrapperClass = clsx(
    'min-h-screen p-4 sm:p-6',
    resolvedTheme === 'dark' ? 'dark bg-slate-950' : 'bg-neutral-light'
  );

  const content = (
    <div className={clsx('bg-white dark:bg-slate-900 rounded-2xl shadow-card border border-gray-100 dark:border-slate-700 overflow-hidden', className)}>
      <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            {organization?.logo_url ? (
              <img src={organization.logo_url} alt={organization.name} className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <LogoIcon size={28} className="text-primary-500" />
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-slate-400">Scheduling for</p>
            <h1 className="text-xl font-semibold text-neutral-dark dark:text-slate-100">
              {organization?.name || eventType?.orgName || 'Organization'}
            </h1>
          </div>
        </div>

        {step !== steps.SELECT_EVENT && embedSettings.selection_mode !== 'single' ? (
          <Button variant="ghost" onClick={goBack} className="self-start">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Change event
          </Button>
        ) : null}
      </div>

      <div className="p-5 sm:p-6">
        {loadError ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-4 h-4" />
            <span>{loadError}</span>
          </div>
        ) : null}

        {!loadError && isInitializing ? (
          <div className="py-2">
            <InlineSpinner text="Loading booking widget..." />
          </div>
        ) : null}

        {!loadError && !isInitializing ? (
          <AnimatePresence mode="wait">
            {step === steps.SELECT_EVENT ? (
              <motion.div
                key="select-event"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-neutral-dark dark:text-slate-100">Choose an event</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Pick the meeting type you want to book.</p>
                </div>

                {eventTypes.length === 0 ? (
                  <div className="bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm text-gray-500 dark:text-slate-400 rounded-xl p-6">
                    No event types available.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {eventTypes.map((eventItem) => (
                      <button
                        key={eventItem.id}
                        type="button"
                        onClick={() => selectEventType(eventItem)}
                        className="text-left p-4 border border-gray-200 dark:border-slate-700 rounded-xl hover:border-primary-300 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-neutral-dark dark:text-slate-100">{eventItem.name}</p>
                            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{eventItem.duration} min</p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-400" />
                        </div>
                        {eventItem.description ? (
                          <p className="text-sm text-gray-500 dark:text-slate-400 mt-3 line-clamp-2">{eventItem.description}</p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : null}

            {step === steps.SELECT_TIME ? (
              <motion.div
                key="select-time"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-dark dark:text-slate-100">{eventType?.name}</h2>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Pick a time that works for you.</p>
                  </div>
                  {isFetchingEvent ? <Spinner size="sm" showLogo={false} className="w-5 h-5 py-0" text="" /> : null}
                </div>

                {hostMeta ? (
                  <div className="p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 flex items-start gap-3">
                    {eventType?.hostAvatar ? (
                      <img
                        src={eventType.hostAvatar}
                        alt={eventType.hostName || 'Host'}
                        className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-slate-700 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0">
                        {eventType?.hostName ? eventType.hostName.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-dark dark:text-slate-100 truncate">
                        {eventType?.hostName || organization?.name || 'Host'}
                      </p>
                      {(eventType?.hostJobTitle || eventType?.hostLocation) ? (
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                          {[eventType?.hostJobTitle, eventType?.hostLocation].filter(Boolean).join(' • ')}
                        </p>
                      ) : null}
                      {eventType?.hostPhone ? <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{eventType.hostPhone}</p> : null}
                      {eventType?.hostWebsite ? (
                        <a
                          href={normalizeExternalUrl(eventType.hostWebsite)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary-500 hover:text-primary-600 truncate block"
                        >
                          {eventType.hostWebsite.replace(/^https?:\/\//, '')}
                        </a>
                      ) : null}
                      {eventType?.hostBio ? (
                        <p className="text-xs text-gray-600 dark:text-slate-300 mt-1 line-clamp-2">{eventType.hostBio}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <SlotPicker
                  slots={slots}
                  selectedSlot={selectedSlot}
                  onSelectSlot={selectSlot}
                  onConfirm={confirmSelectedSlot}
                  duration={eventType?.duration || 30}
                  calendarTimezone={eventType?.calendarTimezone || eventType?.calendar_timezone || 'UTC'}
                  userTimezone={userTimezone}
                  isLoading={isLoadingSlots}
                  onAutoFind={autoFindBestSlot}
                  hasRecentTemplate={templateOptions.length > 0}
                  onUseRecentTemplate={useRecentTemplate}
                />
              </motion.div>
            ) : null}

            {step === steps.CONFIRM ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <BookingForm
                  eventType={eventType}
                  slot={selectedSlot}
                  calendarTimezone={eventType?.calendarTimezone || eventType?.calendar_timezone || 'UTC'}
                  userTimezone={userTimezone}
                  isLoading={isSubmitting}
                  error={error}
                  alternatives={alternatives}
                  onBack={goBack}
                  onPickAlternative={selectAlternativeSlot}
                />
              </motion.div>
            ) : null}

            {step === steps.SUCCESS && confirmedBooking ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
              >
                <BookingSuccess
                  booking={confirmedBooking}
                  eventType={eventType}
                  userTimezone={userTimezone}
                  onDone={restartAfterSuccess}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  );

  if (config.mode === 'modal') {
    return (
      <div className={wrapperClass}>
        <div className="min-h-[180px] flex items-center justify-center bg-transparent p-4">
          <Button onClick={() => setIsWidgetOpen(true)}>{ctaLabel || embedSettings.cta_label || 'Book time'}</Button>

          <AnimatePresence>
            {isWidgetOpen ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="w-full max-w-4xl"
                >
                  <div className="flex justify-end mb-3">
                    <Button variant="ghost" onClick={() => setIsWidgetOpen(false)}>
                      <X className="w-4 h-4 mr-2" />
                      Close
                    </Button>
                  </div>
                  {content}
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className="max-w-4xl mx-auto">
        {content}
        {showPoweredBy ? (
          <div className="mt-6 text-center">
            <PoweredByCalemly />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SchedulerWidget(props) {
  const existingContext = useOptionalSchedulerContext();

  if (existingContext) {
    return <SchedulerWidgetInner {...props} />;
  }

  const providerProps = pickProviderProps(props);

  return (
    <SchedulerProvider {...providerProps}>
      <SchedulerWidgetInner {...props} />
    </SchedulerProvider>
  );
}
