import { V1Ingress } from '@kubernetes/client-node';
import * as httpProxy from 'http-proxy';
import { Request } from './Request';

export type BackendPathType = 'Exact' | 'Prefix' | 'ImplementationSpecific';

let proxy = httpProxy.createProxyServer({
    proxyTimeout: 60 * 60 * 1000
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

    async handleRequest(request: Request)
    {
        await request.respond(async (res) => {
            proxy.web(request.req, res, { target: `http://${this.ipAddress}:${this.port}` }, (err) => {
                if (!res.headersSent)
                {
                    res.writeHead(502);
                }
                res.end('Bad Gateway');
            });
        })
    }
}