import { V1Ingress } from '@kubernetes/client-node';
import * as httpProxy from 'http-proxy';
import * as http from 'http';
import { Request } from './Request';

export type BackendPathType = 'Exact' | 'Prefix' | 'ImplementationSpecific';

let proxy = httpProxy.createProxyServer({
    proxyTimeout: 60 * 60 * 1000,
    ws: true,
    agent: new http.Agent({
        keepAlive: true,
        maxSockets: 100
    })
});

/**
 * Represents a destination where HTTP requests can be sent.
 */
export abstract class Backend
{
    protected constructor(
        public isSecure: boolean
    )
    {

    }

    abstract handleRequest(request: Request): Promise<void>;
}

/**
 * A `Backend` that does not handle any requests.
 */
export class DummyBackend extends Backend
{
    public constructor()
    {
        super(false);
    }
    
    async handleRequest(request: Request)
    {

    }
}

/**
 * A `Backend` that matches HTTP requests according to their host and path,
 * and passes them on to a host such as a Kubernetes `Service`.
 */
export class HTTPBackend extends Backend
{
    /**
     * 
     * @param host The hostname to match requests against. Corresponds to `spec.rules[].host` in the Kubernetes `Ingress`.
     * @param path The path (or path prefix) to match requests against. Corresponds to `spec.rules[].http.paths[].path` in the Kubernetes `Ingress`.
     * @param pathType The path matching mode. Corresponds to `spec.rules[].http.paths[].pathType` in the Kubernetes `Ingress`.
     * @param ipAddress The IP address to pass matching requests on to. This is the IP address associated with the service named in `spec.rules[].http.paths[].backend.service.name` in the Kubernetes `Ingress`.
     * @param port The IP address to pass matching requests on to. Corresponds to `spec.rules[].http.paths[].backend.service.port` in the Kubernetes `Ingress`.
     * @param isSecure Whether to accept HTTPS (`true`) or HTTP (`false`) rqeuests. Insecure requests should only be used where absolutely necessary, e.g. for ACME challenges.
     * @param ingress The Kubernetes `Ingress` associated with this `HTTPBackend`.
     */
    public constructor(
        public host: string,
        public path: string,
        public pathType: BackendPathType,
        public ipAddress: string,
        public port: number,
        isSecure: boolean,
        public ingress: V1Ingress
    )
    {
        super(isSecure);
    }

    /**
     * Decides whether this `Backend` should handle the given `Request`.
     * @param otherBackend Another `Backend` that is currently the candidate match for this `Request`. If this is non-`null`, only return `true` if `this` is a better match than `otherBackend` for the `request`.
     * @param request The `Request` to match.
     * @returns `true` if the `Request` should be handled by this `Backend`, `false` otherwise.
     */
    isBetterMatchForRequestThan(otherBackend: HTTPBackend | null, request: Request)
    {
        if (this.host == request.hostname)
        {
            if (this.pathType == 'Exact' && request.url.pathname == this.path)
            {
                return true;
            }
            if (this.pathType == 'ImplementationSpecific' && request.url.pathname == this.path)
            {
                return true;
            }
            if (this.pathType == 'Prefix' && request.url.pathname.startsWith(this.path))
            {
                // TODO: This will currently match e.g. `/prefix` against `/prefix1` -- is that correct? Or should there have to be a path separator (or end of path) at the end of the prefix?
                if (!otherBackend || (otherBackend.pathType == 'Prefix' && otherBackend.path.length < this.path.length))
                {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Handle a request.
     * @param request The request to handle.
     */
    async handleRequest(request: Request)
    {
        if (request.output.isWebSocket)
        {
            proxy.ws(request.req, request.output.socket, request.output.head, { target: `http://${this.ipAddress}:${this.port}` }, (err) => {
                console.log(err);
            });
        }
        else
        {
            await request.respond(async (res) => {
                console.log(`Proxying to ${`http://${this.ipAddress}:${this.port}`}`);
                proxy.web(request.req, res, { target: `http://${this.ipAddress}:${this.port}` }, (err) => {
                    // The request to the backend failed.
                    // This could happen before or after the backend returns HTTP headers.
                    // Since we pass headers straight onto the client, we can only return a `502` response if the backend hasn't already sent headers.
                    console.log(err);
                    if (!res.headersSent)
                    {
                        res.writeHead(502);
                    }
                    res.end('Bad Gateway');
                });
            })
        }
    }
}