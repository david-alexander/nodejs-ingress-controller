import { V1Ingress } from '@kubernetes/client-node';
import * as httpProxy from 'http-proxy';
import { Request } from './Request';

export type BackendPathType = 'Exact' | 'Prefix' | 'ImplementationSpecific';

let proxy = httpProxy.createProxyServer({
    proxyTimeout: 60 * 60 * 1000
});

export class Backend
{
    public constructor(
        public host: string,
        public path: string,
        public pathType: BackendPathType,
        public ipAddress: string,
        public port: number,
        public isSecure: boolean,
        public ingress: V1Ingress
    )
    {

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