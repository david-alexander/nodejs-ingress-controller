import * as k8s from '@kubernetes/client-node';
import { HTTPFrontend } from "./HTTPFrontend";
import { KubernetesCluster } from "./KubernetesCluster";
import { TLSCertificate } from "./TLSCertificate";
import { Backend, DummyBackend, HTTPBackend } from "./Backend";
import { Request, SNIRequest } from "./Request";
import { Plugin } from "./Plugin";
import { SessionStore } from "./SessionStore";
import { K8sCRDSessionStore } from "../k8scrdsession/K8sCRDSessionStore";
import { PluginRequest } from "./PluginRequest";
import { LogExporter } from './LogExporter';
import { Logger } from './Logger';

const REDIRECT_TO_LOCALHOST = process.env.OIDC_REDIRECT_TO_LOCALHOST == '1';

export class IngressController
{
    logger: Logger;
    cluster: KubernetesCluster;
    certificates: TLSCertificate[] = [];
    backends: HTTPBackend[] = [];
    frontend: HTTPFrontend;

    public constructor(logExporter: LogExporter, kc: k8s.KubeConfig, private sessionStore: SessionStore, private plugins: Plugin[])
    {
        this.logger = new Logger(logExporter);
        this.frontend = new HTTPFrontend(this.sessionStore, this.logger);
        this.cluster = new KubernetesCluster(kc, this.logger);
    }

    public async run()
    {
        this.sessionStore.initialize(this.logger);

        for (let plugin of this.plugins)
        {
            await plugin.initialize(this.logger);
        }

        this.frontend.start(
            async (request) => {
                let backend = await this.findBackend(request);

                if (backend)
                {
                    let pr = new PluginRequest(request, backend);

                    for (let plugin of this.plugins)
                    {
                        await plugin.onRequest(pr);

                        if (request.hasBeenRespondedTo)
                        {
                            return null;
                        }
                    }
                }

                return backend;
            },
            async (request) => await this.findCertificate(request)
        );

        while (true)
        {
            try
            {
                let result = await this.cluster.processIngresses();
                this.certificates = result.certificates;
                this.backends = result.backends;
            }
            catch (e)
            {
                console.error(e);
            }
            
            await new Promise((resolve, reject) => setTimeout(resolve, 1000));
        }
    }

    private async findBackend(request: Request): Promise<Backend | null>
    {
        if (REDIRECT_TO_LOCALHOST && request.hostname == 'localhost')
        {
            return new DummyBackend();
        }

        let bestResult: HTTPBackend | null = null;

        for (let backend of this.backends)
        {
            if (backend.isBetterMatchForRequestThan(bestResult, request))
            {
                console.log("Selecting backend:" + backend.path)
                bestResult = backend;
            }
        }

        return bestResult;
    }

    private async findCertificate(request: SNIRequest)
    {
        for (let certificate of this.certificates)
        {
            if (certificate.isValidForHost(request.hostname))
            {
                return certificate;
            }
        }

        return null;
    }
}
