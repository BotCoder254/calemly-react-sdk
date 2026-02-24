import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  CreditCard,
  Mail,
  Share2,
  User,
  Video,
} from 'lucide-react';
import { useOptionalSchedulerContext } from '../context/SchedulerContext';
import { formatDateInZone, formatTimeInZone } from '../utils/time';
import { canJoinMeeting, getMeetingJoinUrl, isMeetingEnded, parseMeetingPayload } from '../utils/meeting';
import { Button } from './common/Button';
import { Spinner } from './common/Spinner';

export function BookingSuccess({ booking, eventType, userTimezone, onDone }) {
  const scheduler = useOptionalSchedulerContext();
  const actions = scheduler?.actions;

  const [showShareOptions, setShowShareOptions] = useState(false);
  const [showSubmittedDetails, setShowSubmittedDetails] = useState(false);
  const [meetingData, setMeetingData] = useState(null);
  const [meetingLoading, setMeetingLoading] = useState(false);

  if (!booking) {
    return null;
  }

  const bookingWithLatestMeeting = {
    ...booking,
    meeting: meetingData || booking.meeting,
  };

  const hasMeetingPending = Boolean(booking.meeting_pending || booking.conferencing_provider);
  const meetingPayload = parseMeetingPayload(bookingWithLatestMeeting.meeting);
  const meetingUrl = getMeetingJoinUrl(bookingWithLatestMeeting);
  const meetingInProgress = Boolean(meetingPayload?.in_progress);
  const meetingEnded = isMeetingEnded(bookingWithLatestMeeting);
  const canJoin = canJoinMeeting(bookingWithLatestMeeting);

  useEffect(() => {
    if (!hasMeetingPending || meetingUrl || !booking.guest_email || typeof actions?.getPublicMeeting !== 'function') {
      return;
    }

    let isActive = true;
    let pollCount = 0;
    const maxPolls = 10;

    const pollForMeeting = async () => {
      if (!isActive || pollCount >= maxPolls) {
        setMeetingLoading(false);
        return;
      }

      setMeetingLoading(true);

      try {
        const response = await actions.getPublicMeeting({
          bookingId: booking.id,
          email: booking.guest_email,
        });

        if (response?.meeting && response.meeting.status === 'created') {
          setMeetingData(response.meeting);
          setMeetingLoading(false);
          return;
        }
      } catch (_error) {
        // no-op
      }

      pollCount += 1;
      if (isActive) {
        setTimeout(pollForMeeting, 3000);
      }
    };

    const timeout = setTimeout(pollForMeeting, 1500);
    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [actions, booking.guest_email, booking.id, hasMeetingPending, meetingUrl]);

  const durationMinutes = booking.duration_minutes || eventType?.duration || 30;
  const isPaidBooking = Boolean(
    booking.payment_status === 'paid'
      || booking.amount_paid_cents > 0
      || eventType?.requires_payment
  );
  const paymentAmount = booking.amount_paid_cents || eventType?.price_cents || 0;
  const paymentCurrency = booking.currency || eventType?.currency || 'USD';

  const sourceLabel = booking.source_client || booking.source || 'widget';
  const sourceSummary = [
    booking.source,
    booking.source_client,
    booking.source_details?.embed_origin,
    booking.source_details?.landing_page_path,
  ].filter(Boolean).join(' • ');

  const hasSubmittedDetails = Boolean(booking.guest_notes)
    || Boolean(booking.invitee_answers && Object.keys(booking.invitee_answers).length > 0)
    || Boolean(sourceSummary);

  const formatPrice = (amountCents, currencyCode = 'USD') => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format((amountCents || 0) / 100);

  const copyToClipboard = (text) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent(`Meeting Scheduled: ${eventType?.name || booking.title}`);
    const body = encodeURIComponent(
      `A meeting has been scheduled:\n\n`
      + `${eventType?.name || booking.title}\n`
      + `Date: ${formatDateInZone(booking.start_time, userTimezone)}\n`
      + `Time: ${formatTimeInZone(booking.start_time, userTimezone)} - ${formatTimeInZone(booking.end_time, userTimezone)}\n`
      + `Guest: ${booking.guest_name}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleCopyDetails = () => {
    let details = `${eventType?.name || booking.title}\n`
      + `Date: ${formatDateInZone(booking.start_time, userTimezone)}\n`
      + `Time: ${formatTimeInZone(booking.start_time, userTimezone)} - ${formatTimeInZone(booking.end_time, userTimezone)}\n`
      + `Guest: ${booking.guest_name} (${booking.guest_email})`;

    if (isPaidBooking && paymentAmount > 0) {
      details += `\nAmount Paid: ${formatPrice(paymentAmount, paymentCurrency)}`;
    }

    if (meetingUrl) {
      details += `\nMeeting Link: ${meetingUrl}`;
    }

    copyToClipboard(details);
  };

  return (
    <div className="calemly-sdk">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-modal max-w-md w-full mx-auto overflow-hidden border border-transparent dark:border-slate-700"
      >
      <div className="bg-primary-500 p-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <Check className="w-8 h-8 text-primary-500" />
        </motion.div>
        <h2 className="text-xl font-bold text-white">Booking Confirmed!</h2>
        <p className="text-primary-100 mt-1">A confirmation email has been sent</p>
      </div>

      <div className="p-5 space-y-3">
        <div className="text-center pb-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="font-semibold text-lg text-neutral-dark dark:text-slate-100">
            {eventType?.name || booking.title || 'Meeting'}
          </h3>
          <p className="text-gray-500 dark:text-slate-400">{durationMinutes} minutes</p>
          <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 text-xs font-medium">
            <Clock className="w-3.5 h-3.5" />
            Source: {sourceLabel}
          </div>
          {booking.template_used ? (
            <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-200 text-xs font-medium">
              <Check className="w-3.5 h-3.5" />
              Booked using Same as last time
            </div>
          ) : null}
        </div>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="font-medium text-neutral-dark dark:text-slate-100">
              {formatDateInZone(booking.start_time, userTimezone)}
            </p>
            <p className="text-gray-500 dark:text-slate-400">
              {formatTimeInZone(booking.start_time, userTimezone)} - {formatTimeInZone(booking.end_time, userTimezone)}
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{userTimezone}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-200 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="font-medium text-neutral-dark dark:text-slate-100">{booking.guest_name}</p>
            <p className="text-gray-500 dark:text-slate-400 text-sm">{booking.guest_email}</p>
            {booking.guest_phone ? <p className="text-gray-500 dark:text-slate-400 text-sm">{booking.guest_phone}</p> : null}
          </div>
        </div>

        {meetingUrl ? (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-900/40 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                <Video className="w-5 h-5 text-blue-600 dark:text-blue-300" />
              </div>
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200">Video Conference</p>
                <p className="text-xs text-blue-600 dark:text-blue-300">{booking.conferencing_provider || 'Meeting link available'}</p>
              </div>
            </div>

            {meetingInProgress ? (
              <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-200 text-xs font-medium mb-3">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Meeting in progress
              </div>
            ) : null}

            <Button
              fullWidth
              onClick={() => {
                if (!canJoin) {
                  return;
                }
                window.open(meetingUrl, '_blank', 'noopener,noreferrer');
              }}
              disabled={!canJoin}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Video className="w-4 h-4 mr-2" />
              {canJoin ? 'Join Meeting' : 'Meeting Ended'}
            </Button>

            {!canJoin && meetingEnded ? (
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">This meeting has already ended.</p>
            ) : null}

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-200 dark:border-blue-900/40">
              <p className="text-xs text-blue-600 dark:text-blue-300 truncate flex-1">{meetingUrl}</p>
              <button
                type="button"
                onClick={() => {
                  if (!canJoin) {
                    return;
                  }
                  copyToClipboard(meetingUrl);
                }}
                disabled={!canJoin}
                className={`p-1.5 rounded transition-colors flex-shrink-0 ${canJoin ? 'text-blue-500 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40' : 'text-blue-300 cursor-not-allowed'}`}
                aria-label="Copy meeting link"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : null}

        {hasMeetingPending && !meetingUrl ? (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-900/40 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                {meetingLoading ? (
                  <Spinner size="sm" showLogo={false} className="w-5 h-5 py-0" text="" />
                ) : (
                  <Video className="w-5 h-5 text-blue-500 dark:text-blue-300" />
                )}
              </div>
              <div>
                <p className="font-medium text-blue-800 dark:text-blue-200">Video Conference</p>
                <p className="text-xs text-blue-600 dark:text-blue-300">
                  {meetingLoading
                    ? 'Creating your meeting link...'
                    : 'Your meeting link will be sent via email shortly.'}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {hasSubmittedDetails ? (
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSubmittedDetails((previous) => !previous)}
              className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-between"
            >
              <span className="text-sm font-medium text-neutral-dark dark:text-slate-100">Submitted details</span>
              {showSubmittedDetails ? (
                <ChevronUp className="w-4 h-4 text-gray-500 dark:text-slate-300" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500 dark:text-slate-300" />
              )}
            </button>

            {showSubmittedDetails ? (
              <div className="px-3 pb-3 pt-2 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-700 space-y-3">
                {booking.guest_notes ? (
                  <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-900/40 rounded-lg p-2.5">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-1">Notes</p>
                    <p className="text-sm text-amber-900 dark:text-amber-100">{booking.guest_notes}</p>
                  </div>
                ) : null}

                {booking.invitee_answers && Object.keys(booking.invitee_answers).length > 0 ? (
                  <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-900/40 rounded-lg p-2.5">
                    <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-2">Form responses</p>
                    <div className="space-y-2">
                      {Object.entries(booking.invitee_answers).map(([fieldId, answer]) => {
                        if (!answer) return null;
                        const label = fieldId.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

                        return (
                          <div key={fieldId}>
                            <p className="text-xs text-blue-600 dark:text-blue-300 font-medium">{label}</p>
                            <p className="text-sm text-blue-900 dark:text-blue-100">
                              {Array.isArray(answer) ? answer.join(', ') : answer}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {sourceSummary ? (
                  <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 bg-gray-50 dark:bg-slate-800">
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 break-all">{sourceSummary}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {isPaidBooking && paymentAmount > 0 ? (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-900/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-green-600 dark:text-green-300" />
              </div>
              <div>
                <p className="font-medium text-green-800 dark:text-green-200">Payment Confirmed</p>
                <p className="text-xs text-green-700 dark:text-green-300">
                  {booking.payment_provider === 'paypal' ? 'Paid via PayPal' : 'Paid via Stripe'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-green-200 dark:border-green-900/50">
              <span className="text-sm text-green-700 dark:text-green-300">Amount Paid</span>
              <span className="text-lg font-bold text-green-700 dark:text-green-200">
                {formatPrice(paymentAmount, paymentCurrency)}
              </span>
            </div>
          </div>
        ) : null}

        <div className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <Clock className="w-3.5 h-3.5" />
          Keep this confirmation for your records.
        </div>
      </div>

        <div className="p-4 bg-gray-50 dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 space-y-3">
        <div className="relative">
          <Button
            variant="outline"
            fullWidth
            onClick={() => setShowShareOptions((previous) => !previous)}
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share Details
          </Button>

          {showShareOptions ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden"
            >
              <button
                type="button"
                onClick={handleShareEmail}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Mail className="w-4 h-4 text-gray-500 dark:text-slate-300" />
                <span className="text-sm text-neutral-dark dark:text-slate-100">Share via Email</span>
              </button>
              <button
                type="button"
                onClick={handleCopyDetails}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors border-t border-gray-100 dark:border-slate-700"
              >
                <Copy className="w-4 h-4 text-gray-500 dark:text-slate-300" />
                <span className="text-sm text-neutral-dark dark:text-slate-100">Copy Details</span>
              </button>
            </motion.div>
          ) : null}
        </div>

        <Button onClick={onDone} fullWidth>
          Done
        </Button>
        </div>
      </motion.div>
    </div>
  );
}
