export const parseMeetingPayload = (meeting) => {
  if (!meeting) {
    return null;
  }

  if (typeof meeting === 'object' && !Array.isArray(meeting)) {
    return meeting;
  }

  if (typeof meeting === 'string') {
    try {
      const parsed = JSON.parse(meeting);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  return null;
};

const normalizeProvider = (provider) => {
  const value = String(provider || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!value) {
    return '';
  }

  if (value === 'google-meet' || value === 'googlemeet') {
    return 'google_meet';
  }

  if (value === 'microsoft-teams' || value === 'microsoftteams') {
    return 'microsoft_teams';
  }

  return value;
};

const extractJoinKey = (urlValue) => {
  const value = String(urlValue || '').trim();
  if (!value) {
    return '';
  }

  try {
    const baseUrl = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
    const parsed = new URL(value, baseUrl);
    return parsed.searchParams.get('jk') || '';
  } catch (_error) {
    const match = value.match(/[?&]jk=([^&]+)/i);
    if (!match || !match[1]) {
      return '';
    }

    try {
      return decodeURIComponent(match[1]);
    } catch (_decodeError) {
      return match[1];
    }
  }
};

const toAbsolutePath = (pathValue) => {
  const value = String(pathValue || '');
  if (!value.startsWith('/')) {
    return value;
  }

  if (typeof window === 'undefined' || !window.location?.origin) {
    return value;
  }

  return `${window.location.origin}${value}`;
};

export const getMeetingJoinUrl = (booking, options = {}) => {
  const meeting = parseMeetingPayload(booking?.meeting);
  const preferHost = Boolean(options.preferHost);
  const provider = normalizeProvider(meeting?.provider || booking?.conferencing_provider);

  if (provider === 'daily' && booking?.id) {
    const basePath = `/meeting/${booking.id}`;
    const baseUrl = toAbsolutePath(basePath);

    if (preferHost) {
      return baseUrl;
    }

    const sourceUrl = meeting?.guest_join_url || meeting?.meeting_url || booking?.meeting_url || '';
    const joinKey = extractJoinKey(sourceUrl);
    if (joinKey) {
      return `${baseUrl}?jk=${encodeURIComponent(joinKey)}`;
    }

    return '';
  }

  if (preferHost) {
    return meeting?.host_join_url || meeting?.guest_join_url || meeting?.meeting_url || booking?.meeting_url || '';
  }

  return meeting?.guest_join_url || meeting?.meeting_url || booking?.meeting_url || meeting?.host_join_url || '';
};

export const isMeetingEnded = (booking, nowMs = Date.now()) => {
  const endTime = booking?.end_time;
  if (!endTime) {
    return false;
  }

  const endMs = new Date(endTime).getTime();
  if (Number.isNaN(endMs)) {
    return false;
  }

  return endMs <= nowMs;
};

export const canJoinMeeting = (booking, options = {}) => {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const preferHost = Boolean(options.preferHost);

  if (!booking) {
    return false;
  }

  if (String(booking.status || '').toLowerCase() === 'cancelled') {
    return false;
  }

  if (isMeetingEnded(booking, nowMs)) {
    return false;
  }

  return Boolean(getMeetingJoinUrl(booking, { preferHost }));
};
