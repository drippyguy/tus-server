/// <reference types="node" />
import { Lock, Locker, RequestRelease } from '@tus/utils';
/**
 * MemoryLocker is an implementation of the Locker interface that manages locks in memory.
 * This class is designed for exclusive access control over resources, often used in scenarios like upload management.
 *
 * Key Features:
 * - Ensures exclusive resource access by using a memory-based map to track locks.
 * - Implements timeout for lock acquisition, mitigating deadlock situations.
 * - Facilitates both immediate and graceful release of locks through different mechanisms.
 *
 * Locking Behavior:
 * - When the `lock` method is invoked for an already locked resource, the `cancelReq` callback is called.
 *   This signals to the current lock holder that another process is requesting the lock, encouraging them to release it as soon as possible.
 * - The lock attempt continues until the specified timeout is reached. If the timeout expires and the lock is still not
 *   available, an error is thrown to indicate lock acquisition failure.
 *
 * Lock Acquisition and Release:
 * - The `lock` method implements a wait mechanism, allowing a lock request to either succeed when the lock becomes available,
 *   or fail after the timeout period.
 * - The `unlock` method releases a lock, making the resource available for other requests.
 */
export interface MemoryLockerOptions {
    acquireLockTimeout: number;
}
interface LockEntry {
    requestRelease: RequestRelease;
}
export declare class MemoryLocker implements Locker {
    timeout: number;
    locks: Map<string, LockEntry>;
    constructor(options?: MemoryLockerOptions);
    newLock(id: string): MemoryLock;
}
declare class MemoryLock implements Lock {
    private id;
    private locker;
    private timeout;
    constructor(id: string, locker: MemoryLocker, timeout?: number);
    lock(requestRelease: RequestRelease): Promise<void>;
    protected acquireLock(id: string, requestRelease: RequestRelease, signal: AbortSignal): Promise<boolean>;
    unlock(): Promise<void>;
    protected waitTimeout(signal: AbortSignal): Promise<boolean>;
}
export {};