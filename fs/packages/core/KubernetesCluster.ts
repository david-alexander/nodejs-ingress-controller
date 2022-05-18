import * as k8s from '@kubernetes/client-node';
import { TLSCertificate } from './TLSCertificate';
import { Backend, BackendPathType, HTTPBackend } from './Backend';
import { k8sApiCall } from './KubernetesUtils';
import { Logger } from './Logger';

const OUR_NAMESPACE = process.env.OUR_NAMESPACE || '';
const OUR_SERVICE = process.env.OUR_SERVICE || '';
const OUR_FIELD_MANAGER = process.env.OUR_FIELD_MANAGER || '';

/**
 * Represents the Kubernetes cluster that we are running inside,
 * and manages communication with the cluster's API server.
 */
export class KubernetesCluster
{
    private k8sApi: k8s.CoreV1Api;
    private networkingApi: k8s.NetworkingV1Api;

    public constructor(public kc: k8s.KubeConfig, private logger: Logger)
    {
        this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
        this.networkingApi = this.kc.makeApiClient(k8s.NetworkingV1Api);
    }


    private async getOurServiceIngress()
    {
        let ourService = (await k8sApiCall(() => this.k8sApi.readNamespacedService(OUR_SERVICE, OUR_NAMESPACE))).body;
        return ourService?.status?.loadBalancer?.ingress || null;
    }

    /**
     * Find all the ingresses that we are responsible for in the cluster,
     * update their statuses so that they know we're responsible for them, and what IP address they can be reached on,
     * and load the TLS certificates (where applicable) for each ingress.
     * @returns The data for the ingresses and TLS certificates.
     */
    async processIngresses()
    {
        let certificates: TLSCertificate[] = [];
        let backends: HTTPBackend[] = [];

        // Get the public IP address of the ingress controller, so that we can tell our `Ingress`es how they can be reached.
        let ourServiceIngress = await this.getOurServiceIngress();

        // Find all ingresses in the cluster.
        let ingresses = (await k8sApiCall(() => this.networkingApi.listIngressForAllNamespaces())).body.items;

        for (let ingress of ingresses)
        {
            try
            {
                // Ignore any ingresses that don't have our `kubernetes.io/ingress.class` annotation. (These belong to other ingress controllers.)
                if (ingress.metadata?.name && (ingress.metadata?.annotations || {})['kubernetes.io/ingress.class'] == 'nodejs')
                {
                    let ingressName = ingress.metadata.name;
                    let ingressNamespace = ingress.metadata?.namespace || 'default';

                    // Each rule may have a different hostname, so we handle them each separately.
                    for (let rule of ingress.spec?.rules || [])
                    {
                        let host = rule.host;

                        if (host)
                        {
                            let isSecure = false;

                            // Look through any TLS certs specified for this host.
                            let validTLS = (ingress.spec?.tls || []).filter(t => t.hosts?.find(h => h == host));

                            for (let ingressTLS of validTLS)
                            {
                                if (ingressTLS.secretName)
                                {
                                    let secretName = ingressTLS.secretName;

                                    try
                                    {
                                        // Try to load the `Secret` for this TLS cert.
                                        let secret = await k8sApiCall(() => this.k8sApi.readNamespacedSecret(secretName, ingressNamespace));
                                        let certificate = new TLSCertificate(secret.body);
                                        
                                        if (certificate.isValidForHost(host))
                                        {
                                            // We found a valid TLS cert, which is not expired, and is suitable for this host, so use it.
                                            certificates.push(certificate);
                                            
                                            // Mark this ingress as secure.
                                            // This means that *any* problem in getting to this point will lead to the ingress falling back to insecure HTTP.
                                            // TODO: Is this what we want?
                                            isSecure = true;
                                        }
                                    }
                                    catch (e)
                                    {
                                        // Secret might not exist yet.
                                    }
                                }
                            }

                            // Each path may have a different backend, so we handle them each separately.
                            for (let path of rule.http?.paths || [])
                            {
                                let service = path.backend.service;
                                
                                if (service?.name)
                                {
                                    // Get the IP address and port of the service.
                                    // TODO: Should we be doing this here, or only in response to requests?
                                    // TODO: Are we handling custom ports (in the `Ingress` and/or in the `Service`) correctly here?
                                    let serviceName = service.name;
                                    let serviceInfo = (await k8sApiCall(() => this.k8sApi.readNamespacedService(serviceName, ingressNamespace))).body;
                                    
                                    if (serviceInfo.spec?.clusterIP && path.path && path.pathType && service.port)
                                    {
                                        let backend = new HTTPBackend(
                                            host,
                                            path.path,
                                            path.pathType as BackendPathType,
                                            serviceInfo.spec.clusterIP,
                                            this.portToNumber(service.port),
                                            isSecure,
                                            ingress
                                        );
                                        backends.push(backend);
                                    }
                                }
                            }
                        }
                    }

                    // Write our public IP address into the `Ingress`' status.
                    if (ourServiceIngress)
                    {
                        await k8sApiCall(() => this.networkingApi.patchNamespacedIngressStatus(ingressName, ingressNamespace, {
                            status: {
                                loadBalancer: {
                                    ingress: ourServiceIngress
                                }
                            }
                        }, undefined, undefined, OUR_FIELD_MANAGER, undefined, {
                            headers: {
                                'Content-type': k8s.PatchUtils.PATCH_FORMAT_STRATEGIC_MERGE_PATCH
                            }
                        }));
                    }
                }
            }
            catch (e)
            {
                console.log(e);
            }
        }

        // Return the certificate and backend info.
        return { certificates, backends };
    }

    /**
     * Convert a Kubernetes `V1ServiceBackendPort` to a number.
     * TODO: Make this work for named ports.
     * @param port A `V1ServiceBackendPort`.
     * @returns The port number associated with this `V1ServiceBackendPort`.
     */
    private portToNumber(port: k8s.V1ServiceBackendPort)
    {
        return port.number!;
    }
}
