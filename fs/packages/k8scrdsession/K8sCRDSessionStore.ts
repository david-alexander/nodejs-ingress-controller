import { SessionStore } from "nodejs-ingress-controller-core/SessionStore";
import * as k8s from '@kubernetes/client-node';
import { k8sApiCall } from "nodejs-ingress-controller-core/KubernetesUtils";
import { Logger } from "../core/Logger";

const API_GROUP = 'api.k8s.dma.net.nz';
const API_VERSION = 'v1';
const CRD_NAME_SINGULAR = 'Session';
const CRD_NAME_PLURAL = 'sessions';
const NAMESPACE = process.env.OUR_NAMESPACE || '';

type SessionCRDObject = {
    kind: typeof CRD_NAME_SINGULAR,
    apiVersion: `${typeof API_GROUP}/${typeof API_VERSION}`,
    metadata: {
        name: string
    },
    spec: {
        data: any
    }
};

export class K8sCRDSessionStore extends SessionStore
{
    private api: k8s.CustomObjectsApi;

    public constructor(kc: k8s.KubeConfig)
    {
        super();
        this.api = kc.makeApiClient(k8s.CustomObjectsApi);
    }

    public async initialize(logger: Logger)
    {
        super.initialize(logger);
    }

    public async getSessionData(sessionID: string)
    {
        try
        {
            let object = (await k8sApiCall(() => this.api.getNamespacedCustomObject(API_GROUP, API_VERSION, NAMESPACE, CRD_NAME_PLURAL, sessionID))).body as (SessionCRDObject | undefined);
            return object?.spec.data;
        }
        catch (e)
        {
            return undefined;
        }
    }

    public async setSessionData(sessionID: string, data: any)
    {
        let object: SessionCRDObject = {
            kind: CRD_NAME_SINGULAR,
            apiVersion: `${API_GROUP}/${API_VERSION}`,
            metadata: {
                name: sessionID
            },
            spec: {
                data: data
            }
        };
        try
        {
            await k8sApiCall(() => this.api.createNamespacedCustomObject(API_GROUP, API_VERSION, NAMESPACE, CRD_NAME_PLURAL, object));
        }
        catch (e)
        {
            await k8sApiCall(() => this.api.patchNamespacedCustomObject(API_GROUP, API_VERSION, NAMESPACE, CRD_NAME_PLURAL, sessionID, object, undefined, undefined, undefined, {
                headers: {
                    'Content-type': k8s.PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH
                }
            }));
        }
    }

    public async deleteSession(sessionID: string)
    {
        await k8sApiCall(() => this.api.deleteNamespacedCustomObject(API_GROUP, API_VERSION, NAMESPACE, CRD_NAME_PLURAL, sessionID));
    }
}
