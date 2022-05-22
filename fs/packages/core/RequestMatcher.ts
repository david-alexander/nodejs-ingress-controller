import { V1Ingress } from "@kubernetes/client-node";
import { Request } from './Request';

export type RequestMatcherPathType = 'Exact' | 'Prefix' | 'ImplementationSpecific';

/**
 * Represents a URL pattern (hostname + path) that
 * should be routed to a specific `Backend`.
 */
export class RequestMatcher
{
    /**
     * 
     * @param host The hostname to match requests against. Corresponds to `spec.rules[].host` in the Kubernetes `Ingress`.
     * @param path The path (or path prefix) to match requests against. Corresponds to `spec.rules[].http.paths[].path` in the Kubernetes `Ingress`.
     * @param pathType The path matching mode. Corresponds to `spec.rules[].http.paths[].pathType` in the Kubernetes `Ingress`.
     * @param ingress The Kubernetes `Ingress` associated with this `RequestMatcher`.
     */
     public constructor(
        public readonly host: string,
        public readonly path: string,
        public readonly pathType: RequestMatcherPathType,
        public ingress: V1Ingress
    )
    {
    }

    /**
     * Determines whether this `RequestMatcher` is identical to the given `RequestMatcher`.
     * This is used when deciding which cached data to fall back on when the latest data from the cluster is unavailable.
     * @returns `true` if the two `RequestMatcher`s are identical, `false` otherwise.
     */
    isIdenticalTo(otherMatcher: RequestMatcher)
    {
        return (this.host === otherMatcher.host)
            && (this.path === otherMatcher.path)
            && (this.pathType === otherMatcher.pathType);
    }

    /**
     * Decides whether this `RequestMatcher` should handle the given `Request`.
     * @param otherMatcher Another `RequestMatcher` that is currently the candidate match for this `Request`. If this is non-`null`, only return `true` if `this` is a better match than `otherMatcher` for the `request`.
     * @param request The `Request` to match.
     * @returns `true` if the `Request` should be handled by this `RequestMatcher`, `false` otherwise.
     */
    isBetterMatchForRequestThan(otherMatcher: RequestMatcher | null, request: Request)
    {
        if (this.host == request.hostname)
        {
            if (this.pathType == 'Exact' && request.url.pathname == this.path)
            {
                return true;
            }
            if (this.pathType == 'ImplementationSpecific' && request.url.pathname == this.path)
            {
                return true;
            }
            if (this.pathType == 'Prefix' && request.url.pathname.startsWith(this.path))
            {
                // TODO: This will currently match e.g. `/prefix` against `/prefix1` -- is that correct? Or should there have to be a path separator (or end of path) at the end of the prefix?
                if (!otherMatcher || (otherMatcher.pathType == 'Prefix' && otherMatcher.path.length < this.path.length))
                {
                    return true;
                }
            }
        }
        return false;
    }
}
