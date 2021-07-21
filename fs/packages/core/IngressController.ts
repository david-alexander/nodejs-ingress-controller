import * as k8s from '@kubernetes/client-node';
import { HTTPFrontend } from "./HTTPFrontend";
import { KubernetesCluster } from "./KubernetesCluster";
import { TLSCertificate } from "./TLSCertificate";
import { Backend } from "./Backend";
import { Request, SNIRequest } from "./Request";
import { Plugin } from "./Plugin";
import { SessionStore } from "./SessionStore";
import { K8sCRDSessionStore } from "../k8scrdsession/K8sCRDSessionStore";
import { PluginRequest } from "./PluginRequest";
import { LogExporter } from './LogExporter';
import { Logger } from './Logger';

export class IngressController
{
    logger: Logger;
    cluster: KubernetesCluster;
    certificates: TLSCertificate[] = [];
    backends: Backend[] = [];
    frontend: HTTPFrontend;;

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
            let result = await this.cluster.processIngresses();
            this.certificates = result.certificates;
            this.backends = result.backends;
            
            await new Promise((resolve, reject) => setTimeout(resolve, 1000));
        }
    }

    private async findBackend(request: Request)
    {
        for (let backend of this.backends)
        {
            if (backend.host == request.hostname)
            {
                if (backend.pathType == 'Exact' && request.url.pathname == backend.path)
                {
                    return backend;
                }
                if (backend.pathType == 'ImplementationSpecific' && request.url.pathname == backend.path)
                {
                    return backend;
                }
                if (backend.pathType == 'Prefix' && request.url.pathname.startsWith(backend.path))
                {
                    return backend;
                }
            }
        }

        return null;
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
