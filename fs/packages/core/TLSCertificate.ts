import * as k8s from '@kubernetes/client-node';
import * as tls from 'tls';

export class TLSCertificate
{
    secureContext: tls.SecureContext | null = null;
    hostnames: string[] | null = null;
    public secretName: string;

    public constructor(secret: k8s.V1Secret)
    {
        this.secretName = secret.metadata?.name!;
        
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

    isValidForHost(host: string)
    {
        return this.secureContext && (!this.hostnames || this.hostnames.find(h => h == host));
    }
}