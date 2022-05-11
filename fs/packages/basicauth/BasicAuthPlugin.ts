import { Plugin } from 'nodejs-ingress-controller-core/Plugin';
import { PluginRequest } from 'nodejs-ingress-controller-core/PluginRequest'
import { HTTPBackend } from '../core/Backend';
import { Logger } from '../core/Logger';

export class BasicAuthPlugin extends Plugin
{
    public async initialize(logger: Logger)
    {
        super.initialize(logger);
    }

    public async onRequest(pr: PluginRequest)
    {
        if (!(pr.backend instanceof HTTPBackend))
        {
            return;
        }

        const request = pr.request;
        const backend = pr.backend;

        const isEnabled = (backend.ingress.metadata?.annotations || {})['basicauth.api.k8s.dma.net.nz/requireAuth'] == "true";

        if (isEnabled)
        {
            const expectedAuthHeader = (backend.ingress.metadata?.annotations || {})['basicauth.api.k8s.dma.net.nz/expectedAuthHeader'] || "";
            const realm = (backend.ingress.metadata?.annotations || {})['basicauth.api.k8s.dma.net.nz/realm'] || "";

            if (request.req.headers['authorization'] != expectedAuthHeader)
            {
                await request.respond(async (res) => {
                    res.writeHead(401, {
                        'WWW-Authenticate': `Basic realm="${encodeURIComponent(realm)}", charset="UTF-8"`
                    });
                    res.end();
                });

                return;
            }
        }
    }
}
