# Calemly React SDK (`@calemly/sdk`)

`@calemly/sdk` embeds Calemly booking directly into React apps with the same multi-step widget flow used by Calemly:

- event selection
- slot picking
- guest confirmation
- conflict resolution
- custom form fields
- optional payment checkout
- booking success

The package is built for production use with idempotent booking submits, short-lived signed widget token support, and graceful handling for conflict/rate-limit/offline states.

## Installation

```bash
npm install @calemly/sdk
```

Import styles once in your app entrypoint:

```jsx
import '@calemly/sdk/styles.css';
```

## Quick Start

```jsx
import '@calemly/sdk/styles.css';
import { SchedulerWidget } from '@calemly/sdk';

export default function BookingPage() {
  return (
    <SchedulerWidget
      apiBaseUrl="https://your-api.example.com/api"
      embedKey="your_embed_key"
      mode="inline"
      theme="light"
    />
  );
}
```

## Modal Embed

```jsx
<SchedulerWidget
  apiBaseUrl="https://your-api.example.com/api"
  embedKey="your_embed_key"
  mode="modal"
  ctaLabel="Book a call"
/>
```

## Event Slug Mode (No Embed Key)

```jsx
<SchedulerWidget
  apiBaseUrl="https://your-api.example.com/api"
  eventSlug="intro-call"
  org="acme-inc"
/>
```

## Provider + Hook Composition

Use provider mode when you need custom layouts around Calemly components.

```jsx
import {
  SchedulerProvider,
  SlotPicker,
  BookingForm,
  BookingSuccess,
  useBooking,
} from '@calemly/sdk';

function BookingLayout() {
  const { step, steps, eventType, selectedSlot, confirmedBooking, userTimezone, goBack } = useBooking();

  if (step === steps.SELECT_TIME) {
    return <SlotPicker />;
  }

  if (step === steps.CONFIRM) {
    return (
      <BookingForm
        eventType={eventType}
        slot={selectedSlot}
        userTimezone={userTimezone}
        onBack={goBack}
      />
    );
  }

  if (step === steps.SUCCESS) {
    return <BookingSuccess booking={confirmedBooking} eventType={eventType} userTimezone={userTimezone} />;
  }

  return null;
}

export default function App() {
  return (
    <SchedulerProvider
      apiBaseUrl="https://your-api.example.com/api"
      embedKey="your_embed_key"
      theme="system"
      stripePublishableKey="pk_live_xxx"
    >
      <BookingLayout />
    </SchedulerProvider>
  );
}
```

## Exports

- `SchedulerWidget`
- `SchedulerProvider`
- `useBooking`
- `BOOKING_STEPS`
- `SlotPicker`
- `BookingForm`
- `BookingSuccess`
- `CustomFormRenderer`
- `validateFormAnswers`
- `ConflictResolver`
- `PaymentCheckout`

## Core Props

### `SchedulerWidget` / `SchedulerProvider`

- `apiBaseUrl` (required): Calemly API base URL (example: `https://api.example.com/api`)
- `embedKey`: public embed key for widget embeds
- `eventSlug`: direct event slug mode
- `org`: optional org id/slug for slug mode
- `mode`: `inline` | `modal`
- `theme`: `light` | `dark` | `system`
- `timezone`: override invitee timezone
- `embedOrigin`: explicit embed origin override
- `autoSignedWidgetToken`: auto-fetch signed token from backend (default `true`)
- `tokenProvider`: custom server token callback (recommended)
- `stripePublishableKey`: Stripe key for paid booking flows
- `cacheTtlMs`: slot cache TTL
- `slotWindowDays`: availability window

### Callbacks

- `onBeforeBook(payload, context)`
- `onBookingSuccess(booking, context)`
- `onBookingError(error, context)`

Example:

```jsx
<SchedulerWidget
  apiBaseUrl="https://your-api.example.com/api"
  embedKey="your_embed_key"
  onBeforeBook={async (payload) => payload}
  onBookingSuccess={(booking) => {
    console.log('Booked:', booking.id);
  }}
  onBookingError={(error) => {
    console.error(error.code, error.message);
  }}
/>
```

## Security and Token Mode

Recommended production setup: issue signed widget tokens from your server and pass them via `tokenProvider`.

```jsx
<SchedulerWidget
  apiBaseUrl="https://your-api.example.com/api"
  embedKey="your_embed_key"
  tokenProvider={async ({ guestData, slot, eventType }) => {
    const response = await fetch('/api/booking-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestData, slot, eventType }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch booking token');
    }

    return response.json();
  }}
/>
```

Expected token shape:

```json
{
  "token": "signed_widget_token_here",
  "source": "widget",
  "source_client": "embed-widget-v2",
  "source_details": {
    "widget_id": "..."
  }
}
```

If `tokenProvider` is omitted and `embedKey` is provided, the SDK calls `POST /embed/public/widget-token`.

## Booking Behavior Built In

- idempotent request metadata (`client_request_id`)
- slot conflict handling with alternatives
- conflict suggestion UI for re-selecting time
- template reuse (`Book same as last time`)
- optional pre-booking brief acknowledgements (`brief_ack`)
- optional custom dynamic form rendering/validation
- optional paid event checkout (Stripe and PayPal)
- PayPal return/capture completion handled in provider state
- rate limit guidance (`429` + `Retry-After`)
- offline-safe error messages

## Payment Notes

For paid events (`requires_payment`, `payment_enabled`, `price_cents > 0`), booking form can launch payment checkout.

- Stripe: initialize with `stripePublishableKey`
- PayPal: SDK creates order, redirects to approval, then auto-captures and finalizes booking when user returns with PayPal query params

If Stripe key is not set, checkout warns and cannot confirm card payment.

## API Contract Used by SDK

- `GET /embed/public/event-types`
- `POST /embed/public/widget-token`
- `GET /bookings/public/event/:slug`
- `GET /bookings/public/slots`
- `GET /bookings/public/recent-templates`
- `GET /bookings/auto-suggest`
- `GET /bookings/suggestions`
- `POST /bookings/public/preferences`
- `DELETE /bookings/public/preferences`
- `POST /bookings/public`
- `GET /billing/public/event-payment/:eventTypeId`
- `POST /billing/public/create-payment-intent`
- `POST /billing/public/create-paypal-order`
- `POST /billing/public/capture-paypal-order`

## Theming and Responsiveness

- supports `light`, `dark`, and `system`
- mobile-first layout in widget/form/conflict/payment flows
- Tailwind-based SDK stylesheet emitted to `dist/index.css`
- SDK styles are isolated under a `.calemly-sdk` scope to prevent host app CSS collisions

## Local Development

From `calemlysdk/`:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Test:

```bash
npm test
```

Package dry run:

```bash
npm pack --dry-run
```

## GitHub Workflows

Repository includes SDK-specific workflows:

- `.github/workflows/sdk-ci.yml`
  - runs on every push/PR/manual dispatch
  - runs SDK install, build, tests, package dry-run, and runtime dependency audit
- `.github/workflows/sdk-publish.yml`
  - supports manual publish dry-runs (`workflow_dispatch`)
  - publishes on tag push (`sdk-v*` or `v*`)
  - validates tag/package version alignment before publish
  - publishes with npm provenance and creates GitHub Releases automatically

## Publishing `@calemly/sdk`

### Required repository setup

1. Add `NPM_TOKEN` in GitHub repository secrets:
   - `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`
2. Use an npm token with publish access for the package scope.
3. Ensure GitHub Actions permissions allow release creation (`contents: write`).

### Recommended release flow (used by this repo)

1. Confirm `package.json` version is correct (example: `0.1.0`).
2. Run `SDK Publish` manually with `dry_run: true`.
3. After dry-run success, create and push tag `sdk-v0.1.0`.
4. Tag push triggers live publish + GitHub Release creation.

### Command example

```bash
git tag sdk-v0.1.0
git push origin sdk-v0.1.0
```

## Troubleshooting

- **`Missing scheduler setup`**: pass `embedKey` or `eventSlug`.
- **No slots shown**: verify event type availability and timezone payload.
- **Payment form not loading**: set `stripePublishableKey` and ensure backend billing routes are enabled.
- **Conflict errors**: expected under race conditions; pick one of suggested alternatives and retry.
- **Styles look different in another app**: import `@calemly/sdk/styles.css` once at app entry and avoid CSS pipelines that strip package CSS.
