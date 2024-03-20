/// <reference types="node" />
/// <reference types="node" />
import EventEmitter from 'node:events';
import type { ServerOptions } from '../types';
import type { DataStore, CancellationContext } from '@tus/utils';
import type http from 'node:http';
import { Upload } from '@tus/utils';
export declare class BaseHandler extends EventEmitter {
    options: ServerOptions;
    store: DataStore;
    constructor(store: DataStore, options: ServerOptions);
    write(res: http.ServerResponse, status: number, headers?: {}, body?: string): http.ServerResponse<http.IncomingMessage>;
    generateUrl(req: http.IncomingMessage, id: string): string;
    getFileIdFromRequest(req: http.IncomingMessage): string | void;
    protected extractHostAndProto(req: http.IncomingMessage): {
        host: string;
        proto: string;
    };
    protected getLocker(req: http.IncomingMessage): Promise<import("@tus/utils").Locker>;
    protected acquireLock(req: http.IncomingMessage, id: string, context: CancellationContext): Promise<import("@tus/utils").Lock>;
    protected writeToStore(req: http.IncomingMessage, id: string, offset: number, maxFileSize: number, context: CancellationContext): Promise<number>;
    getConfiguredMaxSize(req: http.IncomingMessage, id: string | null): number | Promise<number>;
    /**
     * Calculates the maximum allowed size for the body of an upload request.
     * This function considers both the server's configured maximum size and
     * the specifics of the upload, such as whether the size is deferred or fixed.
     */
    calculateMaxBodySize(req: http.IncomingMessage, file: Upload, configuredMaxSize?: number): Promise<number>;
}