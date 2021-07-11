import { Backend } from "./Backend";
import { Request } from "./Request";

export class PluginRequest
{
    public constructor(
        public request: Request,
        public backend: Backend
    )
    {
        
    }
}