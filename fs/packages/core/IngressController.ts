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

/**
 * Implements the main loop of the ingress controller.
 */
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

    /**
     * Runs the main loop.
     */
    public async run()
    {
        // Initialization.
        this.sessionStore.initialize(this.logger);

        for (let plugin of this.plugins)
        {
            await plugin.initialize(this.logger);
        }

        // Start the `HTTPFrontend` and register callbacks.
        this.frontend.start(
            // Callback for finding `Backend`s for `Request`s.
            async (request) => {
                let backend = await this.findBackend(request);
                
                if (backend)
                {
                    // Give plugins an opportunity to handle the request before it gets passed to the backend.
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
                
                // If no plugin has handled the request, let it be passed to the backend.
                return backend;
            },

            // Callback for finding `TLSCertificate`s for `SNIRequest`s.
            async (request) => await this.findCertificate(request)
        );

        // Repeatedly update our in-memory copy of the ingresses and TLS certificates from the Kubernetes cluster.
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

    /**
     * Helper function for selecting a `Backend` for a `Request`.
     * @param request The request to find a backend for.
     * @returns The backend that should handle the request.
     */
    private async findBackend(request: Request): Promise<Backend | null>
    {
        // Use a dummy backend for the `localhost` hostname, if the `OpenIDConnectPlugin` needs it.
        // TODO: This should be handled inside the plugin.
        if (REDIRECT_TO_LOCALHOST && request.hostname == 'localhost')
        {
            return new DummyBackend();
        }

        // Find the best backend for the request.
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

    /**
     * Helper function for selecting a `TLSCertificate` for a TLS session.
     * @param request The `SNIRequest` sent by the client.
     * @returns The certificate that should be used for the TLS session.
     */
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
