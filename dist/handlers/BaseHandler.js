"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseHandler = void 0;
const node_events_1 = __importDefault(require("node:events"));
const utils_1 = require("@tus/utils");
const promises_1 = __importDefault(require("node:stream/promises"));
const stream_1 = require("stream");
const reExtractFileID = /([^/]+)\/?$/;
const reForwardedHost = /host="?([^";]+)/;
const reForwardedProto = /proto=(https?)/;
class BaseHandler extends node_events_1.default {
    constructor(store, options) {
        super();
        if (!store) {
            throw new Error('Store must be defined');
        }
        this.store = store;
        this.options = options;
    }
    write(res, status, headers = {}, body = '') {
        if (status !== 204) {
            // @ts-expect-error not explicitly typed but possible
            headers['Content-Length'] = Buffer.byteLength(body, 'utf8');
        }
        res.writeHead(status, headers);
        res.write(body);
        return res.end();
    }
    generateUrl(req, id) {
        const path = this.options.path === '/' ? '' : this.options.path;
        if (this.options.generateUrl) {
            // user-defined generateUrl function
            const { proto, host } = this.extractHostAndProto(req);
            return this.options.generateUrl(req, {
                proto,
                host,
                path: path,
                id,
            });
        }
        // Default implementation
        if (this.options.relativeLocation) {
            return `${path}/${id}`;
        }
        const { proto, host } = this.extractHostAndProto(req);
        return `${proto}://${host}${path}/${id}`;
    }
    getFileIdFromRequest(req) {
        if (this.options.getFileIdFromRequest) {
            return this.options.getFileIdFromRequest(req);
        }
        const match = reExtractFileID.exec(req.url);
        if (!match || this.options.path.includes(match[1])) {
            return;
        }
        return decodeURIComponent(match[1]);
    }
    extractHostAndProto(req) {
        let proto;
        let host;
        if (this.options.respectForwardedHeaders) {
            const forwarded = req.headers.forwarded;
            if (forwarded) {
                host ?? (host = reForwardedHost.exec(forwarded)?.[1]);
                proto ?? (proto = reForwardedProto.exec(forwarded)?.[1]);
            }
            const forwardHost = req.headers['x-forwarded-host'];
            const forwardProto = req.headers['x-forwarded-proto'];
            // @ts-expect-error we can pass undefined
            if (['http', 'https'].includes(forwardProto)) {
                proto ?? (proto = forwardProto);
            }
            host ?? (host = forwardHost);
        }
        host ?? (host = req.headers.host);
        proto ?? (proto = 'http');
        return { host: host, proto };
    }
    async getLocker(req) {
        if (typeof this.options.locker === 'function') {
            return this.options.locker(req);
        }
        return this.options.locker;
    }
    async acquireLock(req, id, context) {
        const locker = await this.getLocker(req);
        const lock = locker.newLock(id);
        await lock.lock(() => {
            context.cancel();
        });
        return lock;
    }
    writeToStore(req, id, offset, maxFileSize, context) {
        return new Promise(async (resolve, reject) => {
            // Abort early if the operation has been cancelled.
            if (context.signal.aborted) {
                reject(utils_1.ERRORS.ABORTED);
                return;
            }
            // Create a PassThrough stream as a proxy to manage the request stream.
            // This allows for aborting the write process without affecting the incoming request stream.
            const proxy = new stream_1.PassThrough();
            (0, stream_1.addAbortSignal)(context.signal, proxy);
            proxy.on('error', (err) => {
                req.unpipe(proxy);
                reject(err.name === 'AbortError' ? utils_1.ERRORS.ABORTED : err);
            });
            req.on('error', () => {
                if (!proxy.closed) {
                    // we end the stream gracefully here so that we can upload the remaining bytes to the store
                    // as an incompletePart
                    proxy.end();
                }
            });
            // Pipe the request stream through the proxy. We use the proxy instead of the request stream directly
            // to ensure that errors in the pipeline do not cause the request stream to be destroyed,
            // which would result in a socket hangup error for the client.
            promises_1.default
                .pipeline(req.pipe(proxy), new utils_1.StreamLimiter(maxFileSize), async (stream) => {
                return this.store.write(stream, id, offset);
            })
                .then(resolve)
                .catch(reject);
        });
    }
    getConfiguredMaxSize(req, id) {
        if (typeof this.options.maxSize === 'function') {
            return this.options.maxSize(req, id);
        }
        return this.options.maxSize ?? 0;
    }
    /**
     * Calculates the maximum allowed size for the body of an upload request.
     * This function considers both the server's configured maximum size and
     * the specifics of the upload, such as whether the size is deferred or fixed.
     */
    async calculateMaxBodySize(req, file, configuredMaxSize) {
        // Use the server-configured maximum size if it's not explicitly provided.
        configuredMaxSize ?? (configuredMaxSize = await this.getConfiguredMaxSize(req, file.id));
        // Parse the Content-Length header from the request (default to 0 if not set).
        const length = parseInt(req.headers['content-length'] || '0', 10);
        const offset = file.offset;
        const hasContentLengthSet = req.headers['content-length'] !== undefined;
        const hasConfiguredMaxSizeSet = configuredMaxSize > 0;
        if (file.sizeIsDeferred) {
            // For deferred size uploads, if it's not a chunked transfer, check against the configured maximum size.
            if (hasContentLengthSet &&
                hasConfiguredMaxSizeSet &&
                offset + length > configuredMaxSize) {
                throw utils_1.ERRORS.ERR_SIZE_EXCEEDED;
            }
            if (hasConfiguredMaxSizeSet) {
                return configuredMaxSize - offset;
            }
            else {
                return Number.MAX_SAFE_INTEGER;
            }
        }
        // Check if the upload fits into the file's size when the size is not deferred.
        if (offset + length > (file.size || 0)) {
            throw utils_1.ERRORS.ERR_SIZE_EXCEEDED;
        }
        if (hasContentLengthSet) {
            return length;
        }
        return (file.size || 0) - offset;
    }
}
exports.BaseHandler = BaseHandler;