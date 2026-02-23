import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { CreditCard, Lock, X, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './common/Button';
import { Spinner } from './common/Spinner';

const STRIPE_PROMISES = new Map();

const getStripePromise = (publishableKey) => {
  if (!publishableKey) {
    return Promise.resolve(null);
  }

  if (!STRIPE_PROMISES.has(publishableKey)) {
    STRIPE_PROMISES.set(publishableKey, loadStripe(publishableKey));
  }

  return STRIPE_PROMISES.get(publishableKey);
};

const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1a1a2e',
      fontFamily: 'Inter, system-ui, sans-serif',
      '::placeholder': {
        color: '#9ca3af',
      },
      iconColor: '#6366f1',
    },
    invalid: {
      color: '#ef4444',
      iconColor: '#ef4444',
    },
  },
  hidePostalCode: false,
};

function PaymentForm({
  clientSecret,
  onSuccess,
  onError,
  amount,
  currency,
  isProcessing,
  setIsProcessing,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState(null);
  const [cardComplete, setCardComplete] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setCardError(null);

    const cardElement = elements.getElement(CardElement);

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (error) {
        setCardError(error.message);
        if (typeof onError === 'function') {
          onError(error);
        }
      } else if (paymentIntent?.status === 'succeeded') {
        if (typeof onSuccess === 'function') {
          onSuccess(paymentIntent);
        }
      } else {
        const fallbackError = { message: 'Payment was not completed. Please try again.' };
        setCardError(fallbackError.message);
        if (typeof onError === 'function') {
          onError(fallbackError);
        }
      }
    } catch (_error) {
      const fallbackError = { message: 'An unexpected error occurred. Please try again.' };
      setCardError(fallbackError.message);
      if (typeof onError === 'function') {
        onError(fallbackError);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCardChange = (event) => {
    setCardComplete(Boolean(event.complete));
    if (event.error) {
      setCardError(event.error.message);
      return;
    }
    setCardError(null);
  };

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format((amount || 0) / 100);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-dark dark:text-slate-200 mb-2">
          Card Information
        </label>
        <div className="p-4 border border-gray-300 dark:border-slate-700 rounded-lg focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200 transition-all bg-white dark:bg-slate-900">
          <CardElement options={cardElementOptions} onChange={handleCardChange} />
        </div>
        {cardError ? (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-500 text-sm mt-2 flex items-center gap-1"
          >
            <AlertCircle className="w-4 h-4" />
            {cardError}
          </motion.p>
        ) : null}
      </div>

      <Button
        type="submit"
        fullWidth
        disabled={!stripe || !cardComplete || isProcessing}
        isLoading={isProcessing}
        size="lg"
      >
        <Lock className="w-4 h-4 mr-2" />
        Pay {formattedAmount}
      </Button>

      <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-slate-400">
        <Shield className="w-4 h-4" />
        <span>Secured by Stripe</span>
      </div>
    </form>
  );
}

export function PaymentCheckout({
  isOpen,
  onClose,
  onSuccess,
  clientSecret,
  amount,
  currency = 'USD',
  eventName,
  organizerName,
  refundPolicy,
  stripePublishableKey,
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const stripePromise = useMemo(
    () => getStripePromise(stripePublishableKey || process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || null),
    [stripePublishableKey]
  );

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format((amount || 0) / 100);

  const refundPolicyText = {
    flexible: 'Full refund available up to 24 hours before the event.',
    moderate: 'Full refund available up to 5 days before the event.',
    strict: '50% refund available up to 7 days before the event.',
    none: 'This booking is non-refundable.',
  };

  if (!isOpen) {
    return null;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={!isProcessing ? onClose : undefined}
          className="absolute inset-0 bg-black/50"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-modal overflow-hidden border border-gray-100 dark:border-slate-700"
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-primary-600 dark:text-primary-300" />
              </div>
              <div>
                <h2 className="font-semibold text-neutral-dark dark:text-slate-100">Complete Payment</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">{organizerName || 'Organizer'}</p>
              </div>
            </div>
            {!isProcessing ? (
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
              </button>
            ) : null}
          </div>

          <div className="p-6">
            {paymentSuccess ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-300" />
                </div>
                <h3 className="text-xl font-semibold text-neutral-dark dark:text-slate-100 mb-2">Payment Successful!</h3>
                <p className="text-gray-500 dark:text-slate-400">Your booking is being confirmed...</p>
              </motion.div>
            ) : !clientSecret ? (
              <div className="py-12 text-center">
                <Spinner size="lg" text="Loading payment form..." />
              </div>
            ) : (
              <>
                <div className="mb-6 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                  <h3 className="font-medium text-neutral-dark dark:text-slate-100 mb-2">{eventName || 'Meeting'}</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 dark:text-slate-400">Total</span>
                    <span className="text-xl font-bold text-neutral-dark dark:text-slate-100">{formattedAmount}</span>
                  </div>
                </div>

                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: 'stripe',
                      variables: {
                        colorPrimary: '#6366f1',
                        fontFamily: 'Inter, system-ui, sans-serif',
                      },
                    },
                  }}
                >
                  <PaymentForm
                    clientSecret={clientSecret}
                    onSuccess={(paymentIntent) => {
                      setPaymentSuccess(true);
                      setTimeout(() => {
                        if (typeof onSuccess === 'function') {
                          onSuccess(paymentIntent);
                        }
                      }, 1200);
                    }}
                    onError={() => {}}
                    amount={amount}
                    currency={currency}
                    isProcessing={isProcessing}
                    setIsProcessing={setIsProcessing}
                  />
                </Elements>

                {!stripePublishableKey && !process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY ? (
                  <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-900/40 rounded-lg">
                    <p className="text-xs text-amber-700 dark:text-amber-200">
                      Stripe publishable key not configured. Pass `stripePublishableKey` to `SchedulerProvider`.
                    </p>
                  </div>
                ) : null}

                {refundPolicy ? (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900/40 rounded-lg">
                    <p className="text-xs text-blue-700 dark:text-blue-200">
                      <span className="font-medium">Refund Policy:</span>{' '}
                      {refundPolicyText[refundPolicy] || 'Contact organizer for refund policy.'}
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
