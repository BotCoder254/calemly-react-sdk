import { createContext, useContext } from 'react';

export const SchedulerContext = createContext(null);

export const useSchedulerContext = () => {
  const value = useContext(SchedulerContext);

  if (!value) {
    throw new Error('useBooking must be used inside SchedulerProvider.');
  }

  return value;
};

export const useOptionalSchedulerContext = () => useContext(SchedulerContext);
