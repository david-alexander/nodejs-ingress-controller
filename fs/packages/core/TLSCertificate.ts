import * as k8s from '@kubernetes/client-node';
import * as tls from 'tls';

/**
 * A TLS certificate loaded from a Kubernetes `Secret`.
 * These `Secret`s would typically be created by a tool like `cert-manager`,
 * but can also be created manually.
 */
export class TLSCertificate
{
    secureContext: tls.SecureContext | null = null;
    hostnames: string[] | null = null;
    public secretName: string;

    public constructor(secret: k8s.V1Secret)
    {
        this.secretName = secret.metadata?.name!;
        
        // TODO: are all the hostnames always in the alt names, or might the primary hostname sometimes not be there?
        let altnames = (secret.metadata?.annotations || {})['cert-manager.io/alt-names'];
        if (altnames)
        {
            this.hostnames = altnames.split(',');
        }

        let crt = (secret.data || {})['tls.crt'];
        let key = (secret.data || {})['tls.key'];

        if (crt && key)
        {
            this.secureContext = tls.createSecureContext({
                cert: Buffer.from(crt, 'base64'),
                key: Buffer.from(key, 'base64')
            });
        }
    }

    /**
     * Is this certificate valid, unexpired, and suitable for the given hostname?
     * @param host 
     * @returns 
     */
    isValidForHost(host: string)
    {
        return this.secureContext && (!this.hostnames || this.hostnames.find(h => h == host));
    }
}