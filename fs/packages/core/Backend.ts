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

export abstract class Backend
{
    protected constructor(
        public isSecure: boolean
    )
    {

    }

    abstract handleRequest(request: Request): Promise<void>;
}

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

export class HTTPBackend extends Backend
{
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
                if (!otherBackend || (otherBackend.pathType == 'Prefix' && otherBackend.path.length < this.path.length))
                {
                    return true;
                }
            }
        }
        return false;
    }

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