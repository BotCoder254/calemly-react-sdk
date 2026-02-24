import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Clock,
  Calendar,
  Sparkles,
  ChevronRight,
  Check,
  TrendingUp,
  Info,
  Zap,
  ArrowRight,
  X,
} from 'lucide-react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import clsx from 'clsx';
import { Button } from './common/Button';
import { Spinner } from './common/Spinner';

dayjs.extend(utc);
dayjs.extend(timezone);

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      staggerChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: { duration: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3 },
  },
};

const pulseVariants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.05, 1],
    transition: { duration: 2, repeat: Infinity },
  },
};

const getConfidenceColor = (score) => {
  if (score >= 80) return 'text-green-700 bg-green-100 dark:text-green-200 dark:bg-green-900/40';
  if (score >= 60) return 'text-amber-700 bg-amber-100 dark:text-amber-200 dark:bg-amber-900/40';
  return 'text-gray-700 bg-gray-100 dark:text-slate-200 dark:bg-slate-800';
};

export function ConflictResolver({
  isOpen,
  onClose,
  conflictDetails,
  suggestions = [],
  bestSuggestion,
  onSelectSuggestion,
  onAutoSelect,
  userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  isLoading = false,
}) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showExplanation, setShowExplanation] = useState(null);

  const formatTime = (isoString) => dayjs(isoString).tz(userTimezone).format('h:mm A');
  const formatDate = (isoString) => dayjs(isoString).tz(userTimezone).format('ddd, MMM D');

  const handleSelectSuggestion = (suggestion, index) => {
    setSelectedIndex(index);
    setTimeout(() => {
      if (typeof onSelectSuggestion === 'function') {
        onSelectSuggestion(suggestion);
      }
    }, 200);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="calemly-sdk">
      <AnimatePresence>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="bg-white dark:bg-slate-900 rounded-2xl shadow-card overflow-hidden border border-gray-100 dark:border-slate-700"
        >
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <motion.div
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-200 flex items-center justify-center flex-shrink-0"
                initial={{ rotate: -10 }}
                animate={{ rotate: [0, -10, 0] }}
                transition={{ duration: 0.5 }}
              >
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
              </motion.div>
              <div>
                <h3 className="font-semibold text-neutral-dark dark:text-slate-100 text-base sm:text-lg">
                  Time Slot Unavailable
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-300 mt-0.5">
                  {conflictDetails?.message || 'This slot was just booked by someone else.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-100 hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <motion.div
            className="mt-4 p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-900/40 shadow-sm"
            variants={pulseVariants}
            initial="initial"
            animate="animate"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 text-white flex items-center justify-center">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide font-medium">AI Suggestion</p>
                  <p className="font-semibold text-neutral-dark dark:text-slate-100 text-sm sm:text-base">
                    We found {suggestions.length} alternative{suggestions.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              {bestSuggestion && typeof onAutoSelect === 'function' ? (
                <Button
                  onClick={() => onAutoSelect(bestSuggestion)}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <Zap className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">Auto-select Best Time</span>
                  <span className="sm:hidden">Auto-select Best</span>
                </Button>
              ) : null}
            </div>
          </motion.div>
        </div>

        <div className="p-4 sm:p-5 max-h-[50vh] sm:max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Spinner size="md" showLogo={false} className="w-10 h-10" text="" />
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-3">Finding best alternatives...</p>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-3">
              {suggestions.map((suggestion, index) => {
                const isSelected = selectedIndex === index;
                const isBest = bestSuggestion?.start === suggestion.start;

                return (
                  <motion.button
                    key={`${suggestion.start}-${index}`}
                    variants={itemVariants}
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion, index)}
                    className={clsx(
                      'w-full text-left p-3 sm:p-4 rounded-xl border-2 transition-all relative overflow-hidden',
                      isSelected
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-2 ring-primary-200 dark:ring-primary-700/40'
                        : isBest
                          ? 'border-primary-200 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/20 hover:border-primary-400 dark:hover:border-primary-500'
                          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-slate-800'
                    )}
                  >
                    {isBest ? (
                      <div className="absolute top-0 right-0">
                        <div className="bg-primary-500 text-white text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-bl-lg">
                          BEST MATCH
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={clsx(
                            'w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                            isSelected
                              ? 'bg-primary-500 text-white'
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-200'
                          )}
                        >
                          <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-dark dark:text-slate-100 text-sm sm:text-base truncate">
                            {formatDate(suggestion.start)}
                          </p>
                          <p className="text-gray-600 dark:text-slate-300 text-xs sm:text-sm flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {formatTime(suggestion.start)} - {formatTime(suggestion.end)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pl-[3.25rem] sm:pl-0">
                        <div className={clsx('px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1', getConfidenceColor(suggestion.confidenceScore || 0))}>
                          <TrendingUp className="w-3 h-3" />
                          {suggestion.confidenceScore || 0}%
                        </div>

                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            setShowExplanation(showExplanation === index ? null : index);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              setShowExplanation(showExplanation === index ? null : index);
                            }
                          }}
                          className="p-1.5 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          aria-label="Show explanation"
                        >
                          <Info className="w-4 h-4" />
                        </span>

                        {isSelected ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center"
                          >
                            <Check className="w-4 h-4" />
                          </motion.div>
                        ) : null}

                        <ChevronRight className={clsx('w-5 h-5 transition-colors hidden sm:block', isSelected ? 'text-primary-500' : 'text-gray-300 dark:text-slate-600')} />
                      </div>
                    </div>

                    <AnimatePresence>
                      {showExplanation === index ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700">
                            <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-slate-300">
                              <Sparkles className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
                              <p>{suggestion.explanation || 'Available time slot'}</p>
                            </div>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-gray-400 dark:text-slate-500" />
              </div>
              <p className="text-gray-600 dark:text-slate-300 font-medium">No alternatives found</p>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Please try selecting a different date.</p>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5 bg-gray-50 dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 text-center sm:text-left">
              <Sparkles className="w-3.5 h-3.5 inline-block mr-1 text-primary-500" />
              Suggestions powered by booking analytics
            </p>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
              {selectedIndex !== null && suggestions[selectedIndex] ? (
                <Button
                  size="sm"
                  onClick={() => onSelectSuggestion(suggestions[selectedIndex])}
                  className="flex-1 sm:flex-none"
                >
                  Confirm Selection
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
