import { Plugin } from 'nodejs-ingress-controller-core/Plugin';
import { PluginRequest } from 'nodejs-ingress-controller-core/PluginRequest'
import { Logger } from '../core/Logger';

export class BasicAuthPlugin extends Plugin
{
    public async initialize(logger: Logger)
    {
        super.initialize(logger);
    }

    public async onRequest(pr: PluginRequest)
    {
        const request = pr.request;
        const backend = pr.backend;

        const isEnabled = (backend.ingress.metadata?.annotations || {})['basicauth.api.k8s.dma.net.nz/requireAuth'] == "true";

        if (isEnabled)
        {
            const expectedAuthHeader = (backend.ingress.metadata?.annotations || {})['basicauth.api.k8s.dma.net.nz/expectedAuthHeader'] || "";

            if (request.req.headers['authorization'] != expectedAuthHeader)
            {
                await request.respond(async (res) => {
                    res.writeHead(401, {
                    });
                    res.end();
                });

                return;
            }
        }
    }
}
