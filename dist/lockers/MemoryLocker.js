"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryLocker = void 0;
const utils_1 = require("@tus/utils");
class MemoryLocker {
    constructor(options) {
        this.locks = new Map();
        this.timeout = options?.acquireLockTimeout ?? 1000 * 30;
    }
    newLock(id) {
        return new MemoryLock(id, this, this.timeout);
    }
}
exports.MemoryLocker = MemoryLocker;
class MemoryLock {
    constructor(id, locker, timeout = 1000 * 30) {
        this.id = id;
        this.locker = locker;
        this.timeout = timeout;
    }
    async lock(requestRelease) {
        const abortController = new AbortController();
        const lock = await Promise.race([
            this.waitTimeout(abortController.signal),
            this.acquireLock(this.id, requestRelease, abortController.signal),
        ]);
        abortController.abort();
        if (!lock) {
            throw utils_1.ERRORS.ERR_LOCK_TIMEOUT;
        }
    }
    async acquireLock(id, requestRelease, signal) {
        if (signal.aborted) {
            return false;
        }
        const lock = this.locker.locks.get(id);
        if (!lock) {
            const lock = {
                requestRelease,
            };
            this.locker.locks.set(id, lock);
            return true;
        }
        await lock.requestRelease?.();
        return await new Promise((resolve, reject) => {
            // Using setImmediate to:
            // 1. Prevent stack overflow by deferring recursive calls to the next event loop iteration.
            // 2. Allow event loop to process other pending events, maintaining server responsiveness.
            // 3. Ensure fairness in lock acquisition by giving other requests a chance to acquire the lock.
            setImmediate(() => {
                this.acquireLock(id, requestRelease, signal).then(resolve).catch(reject);
            });
        });
    }
    async unlock() {
        const lock = this.locker.locks.get(this.id);
        if (!lock) {
            throw new Error('Releasing an unlocked lock!');
        }
        this.locker.locks.delete(this.id);
    }
    waitTimeout(signal) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(false);
            }, this.timeout);
            const abortListener = () => {
                clearTimeout(timeout);
                signal.removeEventListener('abort', abortListener);
                resolve(false);
            };
            signal.addEventListener('abort', abortListener);
        });
    }
}