import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export { dayjs };

export const resolveUserTimezone = (value) => {
  if (value) {
    return value;
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_error) {
    return 'UTC';
  }
};

export const formatTimeInZone = (isoString, tz) => dayjs(isoString).tz(tz).format('h:mm A');

export const formatDateInZone = (isoString, tz) => dayjs(isoString).tz(tz).format('dddd, MMMM D, YYYY');

export const formatDateShortInZone = (isoString, tz) => dayjs(isoString).tz(tz).format('ddd, MMM D');

export const formatDateTimeInZone = (isoString, tz) => dayjs(isoString).tz(tz).format('ddd, MMM D \u2022 h:mm A');

export const formatUtcConfirmation = (isoString) => dayjs(isoString).utc().format('ddd, MMM D, YYYY [at] HH:mm [UTC]');
