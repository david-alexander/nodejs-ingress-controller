import * as k8s from '@kubernetes/client-node';
import { HTTPFrontend } from "./HTTPFrontend";
import { ClusterIngressData, KubernetesCluster, RequestMatchResult } from "./KubernetesCluster";
import { TLSCertificate } from "./TLSCertificate";
import { Backend, DummyBackend, HTTPBackend, NotFoundBackend, UnavailableBackend } from "./Backend";
import { Request, SNIRequest } from "./Request";
import { Plugin } from "./Plugin";
import { SessionStore } from "./SessionStore";
import { K8sCRDSessionStore } from "../k8scrdsession/K8sCRDSessionStore";
import { PluginRequest } from "./PluginRequest";
import { LogExporter } from './LogExporter';
import { Logger } from './Logger';
import { RequestMatcher } from './RequestMatcher';

const REDIRECT_TO_LOCALHOST = process.env.OIDC_REDIRECT_TO_LOCALHOST == '1';

/**
 * Implements the main loop of the ingress controller.
 */
export class IngressController
{
    logger: Logger;
    cluster: KubernetesCluster;
    ingressData: ClusterIngressData[] = [];
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
                    let pr = new PluginRequest(request, backend.matcher, backend.backend);
                    
                    for (let plugin of this.plugins)
                    {
                        await plugin.onRequest(pr);
                        
                        if (request.hasBeenRespondedTo)
                        {
                            break;
                        }
                    }
                }
                
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
                let newIngressData = await this.cluster.processIngresses();

                for (let ingressData of newIngressData)
                {
                    let existingData = this.ingressData.find(i => i.matcher.isIdenticalTo(ingressData.matcher)) || null;

                    // Fall back to existing data if the latest data is unavailable.
                    ingressData.certificate ||= existingData?.certificate || null;
                    ingressData.backend ||= existingData?.backend || null;
                }

                this.ingressData = newIngressData;
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
    private async findBackend(request: Request): Promise<RequestMatchResult>
    {
        // Use a dummy backend for the `localhost` hostname, if the `OpenIDConnectPlugin` needs it.
        // TODO: This should be handled inside the plugin.
        if (REDIRECT_TO_LOCALHOST && request.hostname == 'localhost')
        {
            return { matcher: null, certificate: null, backend: new DummyBackend() };
        }

        // Find the best backend for the request.
        let bestResult: ClusterIngressData | null = null;

        for (let ingressData of this.ingressData)
        {
            if (ingressData.matcher.isBetterMatchForRequestThan(bestResult?.matcher || null, request))
            {
                console.log("Selecting backend:" + ingressData.matcher.path)
                bestResult = ingressData;
            }
        }

        if (!bestResult)
        {
            return {
                matcher: null,

                backend: new NotFoundBackend(),
    
                // TODO: We may have a valid certificate for the hostname, even if there's no ingress that matches the path.
                //       If so, we should return it here.
                certificate: null
            };
        }

        return {
            matcher: bestResult.matcher,

            backend: bestResult.backend || new UnavailableBackend(),

            // TODO: We may have a valid certificate for the hostname, even if there's no ingress that matches the path.
            //       If so, we should return it here.
            certificate: bestResult.certificate
        };
    }

    /**
     * Helper function for selecting a `TLSCertificate` for a TLS session.
     * @param request The `SNIRequest` sent by the client.
     * @returns The certificate that should be used for the TLS session.
     */
    private async findCertificate(request: SNIRequest)
    {
        for (let ingressData of this.ingressData)
        {
            if (ingressData.certificate && ingressData.certificate.isValidForHost(request.hostname))
            {
                return ingressData.certificate;
            }
        }

        return null;
    }
}
