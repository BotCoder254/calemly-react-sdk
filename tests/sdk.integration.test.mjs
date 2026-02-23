import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkRoot = path.resolve(__dirname, '..');

const setupDom = (url = 'https://sdk.test/') => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url });

  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  });
  global.HTMLElement = dom.window.HTMLElement;
  global.CustomEvent = dom.window.CustomEvent;
  global.Node = dom.window.Node;
  global.sessionStorage = dom.window.sessionStorage;
  global.localStorage = dom.window.localStorage;
  global.IS_REACT_ACT_ENVIRONMENT = true;

  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = (id) => clearTimeout(id);
  }

  if (dom.window.Location?.prototype?.assign) {
    dom.window.Location.prototype.assign = function assign(url) {
      dom.window.__calemlyRedirectUrl = url;
    };
  }

  return dom;
};

const teardownDom = (dom) => {
  dom.window.close();
};

const jsonResponse = (body, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  }
);

const loadSdkModule = async () => {
  const moduleUrl = `${pathToFileURL(path.join(sdkRoot, 'dist', 'index.mjs')).href}?t=${Date.now()}`;
  return import(moduleUrl);
};

test('provider completes PayPal capture flow into success state', { concurrency: false }, async () => {
  const dom = setupDom('https://sdk.test/widget');

  const pendingBooking = {
    orderId: 'ord_1',
    payload: {
      guest_name: 'Jane Guest',
      guest_email: 'jane@example.com',
    },
    slot: {
      start: '2026-05-10T10:00:00.000Z',
      end: '2026-05-10T10:30:00.000Z',
    },
    eventType: {
      id: 'evt_1',
      name: 'Paid Intro Call',
      duration: 30,
      requires_payment: true,
      payment_enabled: true,
      price_cents: 5000,
      currency: 'USD',
    },
    userTimezone: 'UTC',
  };

  const fetchCalls = [];
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    fetchCalls.push({ url, init });

    if (url.includes('/billing/public/capture-paypal-order')) {
      return jsonResponse({
        success: true,
        captureId: 'cap_1',
      });
    }

    if (url.includes('/bookings/public') && init.method === 'POST') {
      return jsonResponse({
        booking: {
          id: 'book_1',
          start_time: pendingBooking.slot.start,
          end_time: pendingBooking.slot.end,
          guest_name: pendingBooking.payload.guest_name,
          guest_email: pendingBooking.payload.guest_email,
          payment_provider: 'paypal',
          payment_status: 'paid',
          amount_paid_cents: 5000,
        },
      });
    }

    if (url.includes('/bookings/public/slots')) {
      return jsonResponse({ slots: {} });
    }

    if (url.includes('/bookings/public/recent-templates')) {
      return jsonResponse({ templates: [] });
    }

    return jsonResponse({});
  };

  try {
    const sdk = await loadSdkModule();
    const { render, waitFor, cleanup } = await import('@testing-library/react');

    function Probe() {
      const booking = sdk.useBooking();

      React.useEffect(() => {
        if (!booking.confirmedBooking) {
          booking.completePayPalBooking({
            pendingBooking,
            payerId: 'payer_1',
          });
        }
      }, [booking]);

      return React.createElement(
        'div',
        { 'data-testid': 'booking-state' },
        `${booking.step}:${booking.confirmedBooking?.id || ''}`
      );
    }

    const view = render(
      React.createElement(
        sdk.SchedulerProvider,
        {
          apiBaseUrl: 'https://api.test',
          eventType: pendingBooking.eventType,
        },
        React.createElement(Probe)
      )
    );

    await waitFor(() => {
      assert.equal(view.getByTestId('booking-state').textContent, 'success:book_1');
    });

    const createBookingCall = fetchCalls.find((call) => (
      call.url.includes('/bookings/public') && call.init.method === 'POST'
    ));

    assert.ok(createBookingCall, 'Expected create booking API call');
    const createBookingPayload = JSON.parse(createBookingCall.init.body);
    assert.equal(createBookingPayload.paypal_order_id, 'ord_1');
    assert.equal(createBookingPayload.paypal_capture_id, 'cap_1');
    assert.equal(createBookingPayload.event_type_id, 'evt_1');
    assert.equal(createBookingPayload.start_time, pendingBooking.slot.start);
    assert.equal(createBookingPayload.end_time, pendingBooking.slot.end);

    cleanup();
  } finally {
    teardownDom(dom);
    delete global.fetch;
  }
});

test('booking form covers paid PayPal path and conflict recovery selection', { concurrency: false }, async () => {
  const dom = setupDom('https://sdk.test/widget');

  try {
    const sdk = await loadSdkModule();
    const { render, fireEvent, waitFor, cleanup } = await import('@testing-library/react');

    const paypalCalls = [];
    const pickedAlternatives = [];
    const feedbackCalls = [];

    const paidEventType = {
      id: 'evt_paid_1',
      name: 'Paid Strategy Session',
      duration: 30,
      requires_payment: true,
      payment_enabled: true,
      price_cents: 5000,
      currency: 'USD',
    };

    const slot = {
      start: '2026-05-11T09:00:00.000Z',
      end: '2026-05-11T09:30:00.000Z',
    };

    const paidContextValue = {
      state: {
        eventType: paidEventType,
        selectedSlot: slot,
        isSubmitting: false,
      },
      actions: {
        createPayPalOrder: async (payload) => {
          paypalCalls.push(payload);
          return {
            approveUrl: 'https://paypal.test/checkout',
            orderId: 'ord_77',
          };
        },
        createPaymentIntent: async () => ({ clientSecret: 'cs_test_1' }),
        getEventPaymentInfo: async () => ({
          providers: {
            stripe: true,
            paypal: true,
          },
          preferredProvider: 'paypal',
        }),
        clearSavedPreferences: async () => ({ ok: true }),
        submitBooking: async () => ({ ok: true, booking: { id: 'unused' } }),
        getConflictSuggestions: async () => [],
        submitSuggestionFeedback: async (payload) => {
          feedbackCalls.push(payload);
          return { ok: true };
        },
      },
      config: {
        stripePublishableKey: 'pk_test_123',
      },
      constants: {
        BOOKING_STEPS: sdk.BOOKING_STEPS,
      },
    };

    const paidWrapper = ({ children }) => React.createElement(
      sdk.SchedulerContext.Provider,
      { value: paidContextValue },
      children
    );

    const paidView = render(
      React.createElement(sdk.BookingForm, {
        eventType: paidEventType,
        slot,
        onPickAlternative: (alternative) => {
          pickedAlternatives.push(alternative);
        },
      }),
      {
        wrapper: paidWrapper,
      }
    );

    const nameInput = await paidView.findByLabelText('Your Name');
    const emailInput = await paidView.findByLabelText('Email Address');

    fireEvent.change(nameInput, {
      target: { value: 'Jane Guest' },
    });
    fireEvent.change(emailInput, {
      target: { value: 'jane@example.com' },
    });

    await waitFor(() => {
      assert.ok(paidView.getByRole('button', { name: /Pay with PayPal/i }));
    });

    fireEvent.click(paidView.getByRole('button', { name: /Pay with PayPal/i }));

    await waitFor(() => {
      assert.equal(paypalCalls.length, 1);
    });

    assert.equal(paypalCalls[0].eventTypeId, 'evt_paid_1');
    assert.equal(paypalCalls[0].guestEmail, 'jane@example.com');
    assert.equal(paypalCalls[0].guestName, 'Jane Guest');

    const storedPendingBookingRaw = window.sessionStorage.getItem('calemly-sdk:pending-booking');
    assert.ok(storedPendingBookingRaw, 'Expected pending PayPal booking in sessionStorage');
    const storedPendingBooking = JSON.parse(storedPendingBookingRaw);
    assert.equal(storedPendingBooking.orderId, 'ord_77');
    assert.equal(storedPendingBooking.payload.guest_email, 'jane@example.com');

    cleanup();

    const conflictEventType = {
      id: 'evt_conflict_1',
      name: 'Conflict Session',
      duration: 30,
      calendarId: 'cal_1',
      requires_payment: false,
      payment_enabled: false,
      price_cents: 0,
    };

    const conflictSlot = {
      start: '2026-05-12T09:00:00.000Z',
      end: '2026-05-12T09:30:00.000Z',
    };

    const conflictSuggestion = {
      start: '2026-05-12T10:00:00.000Z',
      end: '2026-05-12T10:30:00.000Z',
      confidenceScore: 86,
      explanation: 'Best available nearby slot',
    };

    const conflictContextValue = {
      state: {
        eventType: conflictEventType,
        selectedSlot: conflictSlot,
        isSubmitting: false,
      },
      actions: {
        getConflictSuggestions: async () => [conflictSuggestion],
        submitSuggestionFeedback: async (payload) => {
          feedbackCalls.push(payload);
          return { ok: true };
        },
        selectAlternativeSlot: () => {},
      },
      config: {},
      constants: {
        BOOKING_STEPS: sdk.BOOKING_STEPS,
      },
    };

    const conflictWrapper = ({ children }) => React.createElement(
      sdk.SchedulerContext.Provider,
      { value: conflictContextValue },
      children
    );

    const conflictView = render(
      React.createElement(sdk.BookingForm, {
        eventType: conflictEventType,
        slot: conflictSlot,
        error: 'This slot was just booked and is now unavailable due to conflict.',
        onPickAlternative: (alternative) => {
          pickedAlternatives.push(alternative);
        },
      }),
      {
        wrapper: conflictWrapper,
      }
    );

    await waitFor(() => {
      assert.ok(conflictView.getByRole('button', { name: /Auto-select Best/i }));
    });

    fireEvent.click(conflictView.getByRole('button', { name: /Auto-select Best/i }));

    await waitFor(() => {
      assert.equal(pickedAlternatives.length > 0, true);
    });

    const selectedAlternative = pickedAlternatives[pickedAlternatives.length - 1];
    assert.equal(selectedAlternative.start, conflictSuggestion.start);
    assert.equal(selectedAlternative.end, conflictSuggestion.end);

    const latestFeedback = feedbackCalls[feedbackCalls.length - 1];
    assert.equal(latestFeedback.originalSlot.start, conflictSlot.start);
    assert.equal(latestFeedback.suggestedSlot.start, conflictSuggestion.start);
    assert.equal(latestFeedback.accepted, true);

    cleanup();
  } finally {
    teardownDom(dom);
  }
});
