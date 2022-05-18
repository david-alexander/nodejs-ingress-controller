import { Backend } from "./Backend";
import { Request } from "./Request";

/**
 * Information about a request to be passed to a plugin.
 */
export class PluginRequest
{
    public constructor(
        public request: Request,
        public backend: Backend
    )
    {
        
    }
}