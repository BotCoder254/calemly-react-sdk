import { BOOKING_STEPS } from '../constants';
import { useSchedulerContext } from '../context/SchedulerContext';

export { BOOKING_STEPS };

export const useBooking = () => {
  const context = useSchedulerContext();

  return {
    ...context.state,
    ...context.actions,
    config: context.config,
    steps: context.constants.BOOKING_STEPS,
  };
};
