import { V1Ingress } from '@kubernetes/client-node';
import * as httpProxy from 'http-proxy';
import * as http from 'http';
import { Request } from './Request';

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
    )
    {

    }

    abstract handleRequest(request: Request): Promise<void>;
}

/**
 * A `Backend` that does not handle any requests.
 * This can be used for requests that are intended to be handled by a plugin instead of a backend.
 */
export class DummyBackend extends Backend
{
    public constructor()
    {
        super();
    }
    
    async handleRequest(request: Request)
    {

    }
}

/**
 * A `Backend` that is currently available (e.g. because the Kubernetes `Service` is missing or misconfigured).
 */
 export class UnavailableBackend extends Backend
 {
     public constructor()
     {
         super();
     }
     
     async handleRequest(request: Request)
     {
         await request.respond(async (res) => {
             if (!res.headersSent)
             {
                 res.writeHead(503);
             }
             res.end('Service unavailable');
         });
     }
 }

/**
 * A fallback `Backend` for requests that do not match any ingress.
 */
export class NotFoundBackend extends Backend
{
    public constructor()
    {
        super();
    }
    
    async handleRequest(request: Request)
    {
        await request.respond(async (res) => {
            if (!res.headersSent)
            {
                res.writeHead(404);
            }
            res.end('Not found');
        });
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
     * @param ipAddress The IP address to pass requests on to. This is the IP address associated with the service named in `spec.rules[].http.paths[].backend.service.name` in the Kubernetes `Ingress`.
     * @param port The IP address to pass requests on to. Corresponds to `spec.rules[].http.paths[].backend.service.port` in the Kubernetes `Ingress`.
     */
    public constructor(
        public ipAddress: string,
        public port: number
    )
    {
        super();
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