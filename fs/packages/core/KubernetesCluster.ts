import * as k8s from '@kubernetes/client-node';
import { TLSCertificate } from './TLSCertificate';
import { Backend, BackendPathType, HTTPBackend } from './Backend';
import { k8sApiCall } from './KubernetesUtils';
import { Logger } from './Logger';

const OUR_NAMESPACE = process.env.OUR_NAMESPACE || '';
const OUR_SERVICE = process.env.OUR_SERVICE || '';
const OUR_FIELD_MANAGER = process.env.OUR_FIELD_MANAGER || '';

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

    async processIngresses()
    {
        let certificates: TLSCertificate[] = [];
        let backends: HTTPBackend[] = [];

        let ourServiceIngress = await this.getOurServiceIngress();

        let ingresses = (await k8sApiCall(() => this.networkingApi.listIngressForAllNamespaces())).body.items;

        for (let ingress of ingresses)
        {
            try
            {
                if (ingress.metadata?.name && (ingress.metadata?.annotations || {})['kubernetes.io/ingress.class'] == 'nodejs')
                {
                    let ingressName = ingress.metadata.name;
                    let ingressNamespace = ingress.metadata?.namespace || 'default';

                    for (let rule of ingress.spec?.rules || [])
                    {
                        let host = rule.host;

                        if (host)
                        {
                            let isSecure = false;
                            let validTLS = (ingress.spec?.tls || []).filter(t => t.hosts?.find(h => h == host));

                            for (let ingressTLS of validTLS)
                            {
                                if (ingressTLS.secretName)
                                {
                                    let secretName = ingressTLS.secretName;

                                    try
                                    {
                                        let secret = await k8sApiCall(() => this.k8sApi.readNamespacedSecret(secretName, ingressNamespace));
                                        let certificate = new TLSCertificate(secret.body);
                                        
                                        if (certificate.isValidForHost(host))
                                        {
                                            isSecure = true;
                                            certificates.push(certificate);
                                        }
                                    }
                                    catch (e)
                                    {
                                        // Secret might not exist yet.
                                    }
                                }
                            }

                            for (let path of rule.http?.paths || [])
                            {
                                let service = path.backend.service;
                                
                                if (service?.name)
                                {
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

        return { certificates, backends };
    }

    private portToNumber(port: k8s.V1ServiceBackendPort)
    {
        return port.number!;
    }
}
