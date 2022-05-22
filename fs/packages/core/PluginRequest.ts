import { Backend } from "./Backend";
import { Request } from "./Request";
import { RequestMatcher } from "./RequestMatcher";

/**
 * Information about a request to be passed to a plugin.
 */
export class PluginRequest
{
    public constructor(
        public request: Request,
        public matcher: RequestMatcher | null,
        public backend: Backend
    )
    {
        
    }
}