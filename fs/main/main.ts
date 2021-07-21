import * as k8s from '@kubernetes/client-node';
import { IngressController } from 'nodejs-ingress-controller-core/IngressController';
import { OpenIDConnectPlugin } from 'nodejs-ingress-controller-plugin-openid/OpenIDConnectPlugin';
import { BasicAuthPlugin } from 'nodejs-ingress-controller-plugin-basicauth/BasicAuthPlugin';
import { K8sCRDSessionStore } from 'nodejs-ingress-controller-plugin-k8scrdsession/K8sCRDSessionStore';

async function main()
{
    try
    {
        let kc = new k8s.KubeConfig();
        kc.loadFromDefault();
        
        let server = new IngressController(
            kc,
            new K8sCRDSessionStore(kc),
            [
                new OpenIDConnectPlugin(),
                new BasicAuthPlugin()
            ]
        );
        await server.run();
    }
    catch (e)
    {
        console.log(e);
    }
}

main();