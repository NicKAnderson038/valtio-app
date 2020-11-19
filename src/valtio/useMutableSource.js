/*
export {
  unstable_createMutableSource as createMutableSource,
  unstable_useMutableSource as useMutableSource,
} from 'react'
*/
// emulation with use-subscription
import { useMemo } from "react";
import { useSubscription } from "use-subscription";

const TARGET = Symbol();

export const createMutableSource = (target, _getVersion) => ({
  [TARGET]: target,
});

export const useMutableSource = (source, getSnapshot, subscribe) => {
  const subscription = useMemo(
    () => ({
      getCurrentValue: () => getSnapshot(source[TARGET]),
      subscribe: (callback) => subscribe(source[TARGET], callback),
    }),
    [source, getSnapshot, subscribe]
  );
  return useSubscription(subscription);
};
