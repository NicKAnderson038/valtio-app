import { useMemo, useRef, useEffect } from "react";
import {
  createDeepProxy,
  isDeepChanged,
  getUntrackedObject,
} from "proxy-compare";
import { createMutableSource, useMutableSource } from "./useMutableSource";

const MUTABLE_SOURCE = Symbol();
const LISTENERS = Symbol();
const SNAPSHOT = Symbol();
const isObject = (x) => typeof x === "object" && x !== null;
let globalVersion = 0;
const snapshotCache = new WeakMap();

const createProxy = (initialObject = {}) => {
  let version = globalVersion;
  let mutableSource;
  const listeners = new Set();
  const notifyUpdate = (nextVersion) => {
    if (!nextVersion) {
      nextVersion = ++globalVersion;
    }
    if (version !== nextVersion) {
      version = nextVersion;
      listeners.forEach((listener) => listener(nextVersion));
    }
  };
  const emptyCopy = Array.isArray(initialObject)
    ? []
    : Object.create(initialObject.constructor.prototype);
  const proxy = new Proxy(emptyCopy, {
    get(target, prop, receiver) {
      if (prop === MUTABLE_SOURCE) {
        if (!mutableSource) {
          mutableSource = createMutableSource(receiver, () => version);
        }
        return mutableSource;
      }
      if (prop === LISTENERS) {
        return listeners;
      }
      if (prop === SNAPSHOT) {
        const cache = snapshotCache.get(receiver);
        if (cache && cache.version === version) {
          return cache.snapshot;
        }
        const snapshot = Object.create(target.constructor.prototype);
        snapshotCache.set(receiver, { version, snapshot });
        Reflect.ownKeys(target).forEach((key) => {
          const value = target[key];
          if (!isObject(value)) {
            snapshot[key] = value;
          } else if (value instanceof Promise) {
            Object.defineProperty(snapshot, key, {
              get() {
                throw value;
              },
            });
          } else {
            snapshot[key] = value[SNAPSHOT];
          }
        });
        return snapshot;
      }
      return target[prop];
    },
    deleteProperty(target, prop) {
      const value = target[prop];
      const childListeners = isObject(value) && value[LISTENERS];
      if (childListeners) {
        childListeners.delete(notifyUpdate);
      }
      delete target[prop];
      notifyUpdate();
      return true;
    },
    set(target, prop, value, receiver) {
      var _a;
      const childListeners = isObject(target[prop]) && target[prop][LISTENERS];
      if (childListeners) {
        childListeners.delete(notifyUpdate);
      }
      if (!isObject(value)) {
        target[prop] = value;
      } else if (value instanceof Promise) {
        target[prop] = value.then((v) => {
          receiver[prop] = v;
        });
      } else {
        value =
          (_a = getUntrackedObject(value)) !== null && _a !== void 0
            ? _a
            : value;
        if (value[LISTENERS]) {
          target[prop] = value;
        } else {
          target[prop] = createProxy(value);
        }
        target[prop][LISTENERS].add(notifyUpdate);
      }
      notifyUpdate();
      return true;
    },
  });
  Reflect.ownKeys(initialObject).forEach((key) => {
    proxy[key] = initialObject[key];
  });
  return proxy;
};

const subscribe = (proxy, callback) => {
  proxy[LISTENERS].add(callback);
  return () => {
    proxy[LISTENERS].delete(callback);
  };
};

const useProxy = (proxy) => {
  const affected = new WeakMap();
  const lastAffected = useRef();
  useEffect(() => {
    lastAffected.current = affected;
  });
  const getSnapshot = useMemo(() => {
    let prevSnapshot = null;
    const deepChangedCache = new WeakMap();
    return (proxy) => {
      const snapshot = proxy[SNAPSHOT];
      try {
        if (
          prevSnapshot !== null &&
          lastAffected.current &&
          !isDeepChanged(
            prevSnapshot,
            snapshot,
            lastAffected.current,
            deepChangedCache
          )
        ) {
          // not changed
          return prevSnapshot;
        }
      } catch (e) {
        // ignore and return new snapshot
      }
      return (prevSnapshot = snapshot);
    };
  }, []);
  const snapshot = useMutableSource(
    proxy[MUTABLE_SOURCE],
    getSnapshot,
    subscribe
  );
  const proxyCache = useMemo(() => new WeakMap(), []); // per-hook proxyCache
  return createDeepProxy(snapshot, affected, proxyCache);
};
export { createProxy as proxy, useProxy, subscribe };
