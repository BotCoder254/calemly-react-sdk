import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Type,
  Mail,
  Phone,
  AlignLeft,
  List,
  CheckSquare,
  Calendar,
  Link as LinkIcon,
  AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';

const FIELD_TYPES = [
  { id: 'short_text', icon: Type },
  { id: 'long_text', icon: AlignLeft },
  { id: 'email', icon: Mail },
  { id: 'phone', icon: Phone },
  { id: 'dropdown', icon: List },
  { id: 'multiple_choice', icon: CheckSquare },
  { id: 'checkboxes', icon: CheckSquare },
  { id: 'date', icon: Calendar },
  { id: 'url', icon: LinkIcon },
];

const isFieldVisible = (field, answers) => {
  if (!field?.conditional?.show) {
    return true;
  }

  const conditions = Array.isArray(field.conditional.conditions)
    ? field.conditional.conditions
    : [];

  if (conditions.length === 0) {
    return true;
  }

  return conditions.every((condition) => {
    const answer = answers?.[condition.fieldId];

    switch (condition.operator) {
      case 'equals':
        if (Array.isArray(answer)) {
          return answer.includes(condition.value);
        }
        return String(answer || '') === String(condition.value);
      case 'not_equals':
        if (Array.isArray(answer)) {
          return !answer.includes(condition.value);
        }
        return String(answer || '') !== String(condition.value);
      case 'contains':
        return String(answer || '').toLowerCase().includes(String(condition.value || '').toLowerCase());
      case 'is_empty':
        if (Array.isArray(answer)) {
          return answer.length === 0;
        }
        return !answer || answer === '';
      case 'is_not_empty':
        if (Array.isArray(answer)) {
          return answer.length > 0;
        }
        return Boolean(answer && answer !== '');
      default:
        return true;
    }
  });
};

export function validateFormAnswers(formSchema, answers) {
  const fields = formSchema?.fields || [];
  const errors = {};

  fields.forEach((field) => {
    if (!isFieldVisible(field, answers)) {
      return;
    }

    const value = answers?.[field.id];

    if (field.required && (!value || (Array.isArray(value) && value.length === 0) || value === '')) {
      errors[field.id] = 'This field is required';
      return;
    }

    if (!value) {
      return;
    }

    if (field.type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        errors[field.id] = 'Please enter a valid email address';
      }
    }

    if (field.type === 'url') {
      try {
        new URL(value);
      } catch (_error) {
        errors[field.id] = 'Please enter a valid URL';
      }
    }

    if (field.type === 'phone') {
      const phoneRegex = /^[\d\s\-+()]+$/;
      if (!phoneRegex.test(value)) {
        errors[field.id] = 'Please enter a valid phone number';
      }
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function CustomFormRenderer({ formSchema, answers, onChange, errors, className = '' }) {
  const [localAnswers, setLocalAnswers] = useState(answers || {});
  const fields = formSchema?.fields || [];

  useEffect(() => {
    setLocalAnswers(answers || {});
  }, [answers]);

  const handleChange = (fieldId, value) => {
    const nextAnswers = {
      ...localAnswers,
      [fieldId]: value,
    };

    setLocalAnswers(nextAnswers);
    if (typeof onChange === 'function') {
      onChange(nextAnswers);
    }
  };

  const renderField = (field) => {
    const iconEntry = FIELD_TYPES.find((entry) => entry.id === field.type);
    const Icon = iconEntry?.icon || Type;
    const value = localAnswers[field.id];
    const error = errors?.[field.id];

    return (
      <motion.div
        key={field.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="space-y-2"
      >
        <label className="flex items-start gap-2 text-sm font-medium text-gray-700 dark:text-slate-200">
          <Icon className="w-4 h-4 mt-0.5 text-primary-600 dark:text-primary-300 flex-shrink-0" />
          <span>
            {field.label}
            {field.required ? <span className="text-red-500 ml-1">*</span> : null}
          </span>
        </label>

        {field.description ? (
          <p className="text-sm text-gray-500 dark:text-slate-400 ml-6">{field.description}</p>
        ) : null}

        <div className="ml-6">
          {field.type === 'short_text' ? (
            <input
              type="text"
              placeholder={field.placeholder || 'Enter your answer...'}
              value={value || ''}
              onChange={(event) => handleChange(field.id, event.target.value)}
              className={clsx(
                'w-full px-4 py-2.5 border rounded-lg transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary-500',
                'dark:bg-slate-900 dark:text-slate-100',
                error ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-gray-300 dark:border-slate-700 bg-white'
              )}
            />
          ) : null}

          {field.type === 'long_text' ? (
            <textarea
              rows={4}
              placeholder={field.placeholder || 'Enter your answer...'}
              value={value || ''}
              onChange={(event) => handleChange(field.id, event.target.value)}
              className={clsx(
                'w-full px-4 py-2.5 border rounded-lg transition-colors resize-none',
                'focus:outline-none focus:ring-2 focus:ring-primary-500',
                'dark:bg-slate-900 dark:text-slate-100',
                error ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-gray-300 dark:border-slate-700 bg-white'
              )}
            />
          ) : null}

          {field.type === 'email' ? (
            <input
              type="email"
              placeholder="email@example.com"
              value={value || ''}
              onChange={(event) => handleChange(field.id, event.target.value)}
              className={clsx(
                'w-full px-4 py-2.5 border rounded-lg transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary-500',
                'dark:bg-slate-900 dark:text-slate-100',
                error ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-gray-300 dark:border-slate-700 bg-white'
              )}
            />
          ) : null}

          {field.type === 'phone' ? (
            <input
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={value || ''}
              onChange={(event) => handleChange(field.id, event.target.value)}
              className={clsx(
                'w-full px-4 py-2.5 border rounded-lg transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary-500',
                'dark:bg-slate-900 dark:text-slate-100',
                error ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-gray-300 dark:border-slate-700 bg-white'
              )}
            />
          ) : null}

          {field.type === 'dropdown' ? (
            <select
              value={value || ''}
              onChange={(event) => handleChange(field.id, event.target.value)}
              className={clsx(
                'w-full px-4 py-2.5 border rounded-lg transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary-500',
                'dark:bg-slate-900 dark:text-slate-100',
                error ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-gray-300 dark:border-slate-700 bg-white'
              )}
            >
              <option value="">Select an option...</option>
              {(field.options || []).map((option, index) => (
                <option key={`${field.id}-option-${index}`} value={option}>{option}</option>
              ))}
            </select>
          ) : null}

          {field.type === 'multiple_choice' ? (
            <div className="space-y-2.5">
              {(field.options || []).map((option, index) => (
                <label
                  key={`${field.id}-choice-${index}`}
                  className={clsx(
                    'flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all',
                    value === option
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                      : 'border-gray-300 dark:border-slate-700 hover:border-gray-400 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-slate-800'
                  )}
                >
                  <input
                    type="radio"
                    name={field.id}
                    value={option}
                    checked={value === option}
                    onChange={(event) => handleChange(field.id, event.target.value)}
                    className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-slate-200 flex-1">{option}</span>
                </label>
              ))}
            </div>
          ) : null}

          {field.type === 'checkboxes' ? (
            <div className="space-y-2.5">
              {(field.options || []).map((option, index) => {
                const checked = (value || []).includes(option);
                return (
                  <label
                    key={`${field.id}-checkbox-${index}`}
                    className={clsx(
                      'flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all',
                      checked
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                        : 'border-gray-300 dark:border-slate-700 hover:border-gray-400 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-slate-800'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const current = Array.isArray(value) ? value : [];
                        const next = event.target.checked
                          ? [...current, option]
                          : current.filter((item) => item !== option);
                        handleChange(field.id, next);
                      }}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-slate-200 flex-1">{option}</span>
                  </label>
                );
              })}
            </div>
          ) : null}

          {field.type === 'date' ? (
            <input
              type="date"
              value={value || ''}
              onChange={(event) => handleChange(field.id, event.target.value)}
              className={clsx(
                'w-full px-4 py-2.5 border rounded-lg transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary-500',
                'dark:bg-slate-900 dark:text-slate-100',
                error ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-gray-300 dark:border-slate-700 bg-white'
              )}
            />
          ) : null}

          {field.type === 'url' ? (
            <input
              type="url"
              placeholder="https://example.com"
              value={value || ''}
              onChange={(event) => handleChange(field.id, event.target.value)}
              className={clsx(
                'w-full px-4 py-2.5 border rounded-lg transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary-500',
                'dark:bg-slate-900 dark:text-slate-100',
                error ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-gray-300 dark:border-slate-700 bg-white'
              )}
            />
          ) : null}

          {error ? (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-sm text-red-600 mt-1"
            >
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </motion.div>
          ) : null}
        </div>
      </motion.div>
    );
  };

  if (fields.length === 0) {
    return null;
  }

  const visibleFields = fields.filter((field) => isFieldVisible(field, localAnswers));

  return (
    <div className={clsx('space-y-6', className)}>
      <div className="border-t border-gray-100 dark:border-slate-700 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Additional Information</h3>
        <AnimatePresence mode="wait">
          <div className="space-y-6">
            {visibleFields.map((field) => renderField(field))}
          </div>
        </AnimatePresence>
      </div>
    </div>
  );
}
