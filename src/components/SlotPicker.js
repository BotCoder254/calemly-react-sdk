import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
  Globe,
  Sparkles,
  List,
  Grid3X3,
  Check,
  History,
} from 'lucide-react';
import clsx from 'clsx';
import { dayjs } from '../utils/time';
import { useOptionalSchedulerContext } from '../context/SchedulerContext';
import { Button } from './common/Button';
import { InlineSpinner } from './common/Spinner';

const VIEWS = {
  CALENDAR: 'calendar',
  LIST: 'list',
};

export function SlotPicker({
  slots,
  selectedSlot,
  onSelectSlot,
  onConfirm,
  duration,
  calendarTimezone,
  userTimezone,
  isLoading,
  onAutoFind,
  hasRecentTemplate,
  onUseRecentTemplate,
  className = '',
}) {
  const scheduler = useOptionalSchedulerContext();
  const state = scheduler?.state;
  const actions = scheduler?.actions;

  const resolvedSlots = slots || state?.slots || {};
  const resolvedSelectedSlot = selectedSlot || state?.selectedSlot || null;
  const resolvedDuration = duration || state?.eventType?.duration || 30;
  const resolvedCalendarTimezone =
    calendarTimezone
    || state?.eventType?.calendarTimezone
    || state?.eventType?.calendar_timezone
    || state?.calendarTimezone
    || 'UTC';
  const resolvedUserTimezone = userTimezone || state?.userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const resolvedIsLoading = typeof isLoading === 'boolean'
    ? isLoading
    : Boolean(state?.isLoadingSlots);
  const resolvedHasRecentTemplate = typeof hasRecentTemplate === 'boolean'
    ? hasRecentTemplate
    : Boolean((state?.templateOptions || []).length > 0);

  const [currentDate, setCurrentDate] = useState(dayjs());
  const [viewMode, setViewMode] = useState(VIEWS.CALENDAR);
  const [showTimezone, setShowTimezone] = useState('local');
  const [selectedDate, setSelectedDate] = useState(null);

  const displayTimezone = showTimezone === 'local' ? resolvedUserTimezone : resolvedCalendarTimezone;

  const weekDays = useMemo(() => {
    const start = currentDate.startOf('week');
    return Array.from({ length: 7 }, (_, index) => start.add(index, 'day'));
  }, [currentDate]);

  const dateSlots = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = selectedDate.format('YYYY-MM-DD');
    return resolvedSlots[dateStr] || [];
  }, [resolvedSlots, selectedDate]);

  const allSlots = useMemo(() => {
    const result = [];
    Object.entries(resolvedSlots).forEach(([date, daySlots]) => {
      daySlots.forEach((slot) => {
        result.push({ ...slot, date });
      });
    });
    return result.sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [resolvedSlots]);

  const hasSlots = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    return (resolvedSlots[dateStr]?.length || 0) > 0;
  };

  const formatTime = (isoString) => dayjs(isoString).tz(displayTimezone).format('h:mm A');

  const formatFullTime = (isoString) => dayjs(isoString).tz(displayTimezone).format('ddd, MMM D • h:mm A');

  const handlePrevWeek = () => setCurrentDate((prev) => prev.subtract(1, 'week'));
  const handleNextWeek = () => setCurrentDate((prev) => prev.add(1, 'week'));
  const handleToday = () => {
    setCurrentDate(dayjs());
    setSelectedDate(dayjs());
  };

  const handleDateClick = (date) => {
    if (hasSlots(date)) {
      setSelectedDate(date);
    }
  };

  const handleSelectSlot = (slot) => {
    if (typeof onSelectSlot === 'function') {
      onSelectSlot(slot);
      return;
    }
    actions?.selectSlot?.(slot);
  };

  const handleConfirm = () => {
    if (typeof onConfirm === 'function') {
      onConfirm();
      return;
    }
    actions?.confirmSelectedSlot?.();
  };

  const handleAutoFind = () => {
    if (typeof onAutoFind === 'function') {
      onAutoFind();
      return;
    }
    actions?.autoFindBestSlot?.();
  };

  const handleUseRecentTemplate = () => {
    if (typeof onUseRecentTemplate === 'function') {
      onUseRecentTemplate();
      return;
    }
    actions?.useRecentTemplate?.();
  };

  return (
    <div className={clsx('bg-white dark:bg-slate-900 rounded-xl shadow-card overflow-hidden border border-transparent dark:border-slate-700', className)}>
      <div className="p-4 border-b border-gray-100 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-semibold text-neutral-dark dark:text-slate-100">Select a Time</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">{resolvedDuration} minute meeting</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onAutoFind || actions?.autoFindBestSlot ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoFind}
                disabled={resolvedIsLoading}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                Auto-find
              </Button>
            ) : null}

            {resolvedHasRecentTemplate ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUseRecentTemplate}
                disabled={resolvedIsLoading || !resolvedSelectedSlot}
                title={resolvedSelectedSlot ? 'Reuse your previous booking details' : 'Select a time first'}
              >
                <History className="w-4 h-4 mr-1" />
                Same as last time
              </Button>
            ) : null}

            <div className="flex bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setViewMode(VIEWS.CALENDAR)}
                className={clsx(
                  'p-1.5 rounded transition-colors',
                  viewMode === VIEWS.CALENDAR
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-primary-600 dark:text-primary-200'
                    : 'text-gray-500 dark:text-slate-300 hover:text-gray-700 dark:hover:text-slate-100'
                )}
                aria-label="Calendar view"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode(VIEWS.LIST)}
                className={clsx(
                  'p-1.5 rounded transition-colors',
                  viewMode === VIEWS.LIST
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-primary-600 dark:text-primary-200'
                    : 'text-gray-500 dark:text-slate-300 hover:text-gray-700 dark:hover:text-slate-100'
                )}
                aria-label="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <Globe className="w-4 h-4 text-gray-400 dark:text-slate-400" />
          <button
            type="button"
            onClick={() => setShowTimezone((prev) => (prev === 'local' ? 'calendar' : 'local'))}
            className="text-sm text-gray-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-200 transition-colors"
          >
            {displayTimezone}
            <span className="text-gray-400 dark:text-slate-500 ml-1">
              ({showTimezone === 'local' ? 'Your time' : 'Calendar time'})
            </span>
          </button>
        </div>
      </div>

      {resolvedIsLoading ? (
        <div className="py-2 px-4">
          <InlineSpinner text="Loading available times..." />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {viewMode === VIEWS.CALENDAR ? (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={handlePrevWeek}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  aria-label="Previous week"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-slate-300" />
                </button>

                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-dark dark:text-slate-100 text-sm sm:text-base">
                    {weekDays[0].format('MMM D')} - {weekDays[6].format('MMM D, YYYY')}
                  </span>
                  <button
                    type="button"
                    onClick={handleToday}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Today
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleNextWeek}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  aria-label="Next week"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600 dark:text-slate-300" />
                </button>
              </div>

              <div className="grid grid-cols-7 border-b border-gray-100 dark:border-slate-700">
                {weekDays.map((day) => {
                  const isToday = day.isSame(dayjs(), 'day');
                  const isSelected = selectedDate?.isSame(day, 'day');
                  const isPast = day.isBefore(dayjs(), 'day');
                  const available = hasSlots(day);

                  return (
                    <button
                      key={day.format('YYYY-MM-DD')}
                      type="button"
                      onClick={() => handleDateClick(day)}
                      disabled={isPast || !available}
                      className={clsx(
                        'p-3 text-center transition-colors border-r border-gray-100 dark:border-slate-700 last:border-r-0',
                        isSelected && 'bg-primary-50 dark:bg-primary-900/30',
                        !isPast && available && 'hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer',
                        (isPast || !available) && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <p className="text-xs text-gray-500 dark:text-slate-400 uppercase">{day.format('ddd')}</p>
                      <p className={clsx(
                        'text-lg font-semibold mt-1',
                        (isToday || isSelected) && 'text-primary-600 dark:text-primary-200',
                        !isToday && !isSelected && 'text-neutral-dark dark:text-slate-100'
                      )}
                      >
                        {day.format('D')}
                      </p>
                      {available ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mx-auto mt-1" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="p-4 max-h-64 overflow-y-auto">
                {selectedDate ? (
                  dateSlots.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {dateSlots.map((slot, index) => {
                        const isSelected = resolvedSelectedSlot?.start === slot.start;
                        return (
                          <button
                            key={`${slot.start}-${index}`}
                            type="button"
                            onClick={() => handleSelectSlot(slot)}
                            className={clsx(
                              'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                              isSelected
                                ? 'bg-primary-500 text-white ring-2 ring-primary-300'
                                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-100 hover:bg-primary-100 dark:hover:bg-primary-900/40 hover:text-primary-700 dark:hover:text-primary-200'
                            )}
                          >
                            {formatTime(slot.start)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 dark:text-slate-400 py-8">
                      No available slots for this date
                    </p>
                  )
                ) : (
                  <p className="text-center text-gray-500 dark:text-slate-400 py-8">
                    Select a date to see available times
                  </p>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-4 max-h-96 overflow-y-auto"
              role="listbox"
              aria-label="Available time slots"
            >
              {allSlots.length > 0 ? (
                <div className="space-y-2">
                  {allSlots.slice(0, 20).map((slot, index) => {
                    const isSelected = resolvedSelectedSlot?.start === slot.start;
                    return (
                      <button
                        key={`${slot.start}-${index}`}
                        type="button"
                        onClick={() => handleSelectSlot(slot)}
                        role="option"
                        aria-selected={isSelected}
                        className={clsx(
                          'w-full flex items-center justify-between p-3 rounded-xl transition-all text-left',
                          isSelected
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-50 dark:bg-slate-800 hover:bg-primary-50 dark:hover:bg-primary-900/40 text-neutral-dark dark:text-slate-100'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Calendar className={clsx('w-5 h-5', isSelected ? 'text-white' : 'text-gray-400')} />
                          <div>
                            <p className="font-medium">{formatFullTime(slot.start)}</p>
                            <p className={clsx('text-sm', isSelected ? 'text-primary-100' : 'text-gray-500 dark:text-slate-400')}>
                              {resolvedDuration} minutes
                            </p>
                          </div>
                        </div>
                        {isSelected ? <Check className="w-5 h-5" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-gray-500 dark:text-slate-400 py-8">
                  No available slots found
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <AnimatePresence>
        {resolvedSelectedSlot ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="p-4 bg-primary-50 dark:bg-primary-900/20 border-t border-primary-100 dark:border-primary-900/40"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary-500 text-white flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-neutral-dark dark:text-slate-100 truncate">
                    {formatFullTime(resolvedSelectedSlot.start)}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {resolvedDuration} min • {displayTimezone}
                  </p>
                </div>
              </div>
              <Button onClick={handleConfirm}>Confirm</Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
