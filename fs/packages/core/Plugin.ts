import { Logger } from "./Logger";
import { PluginRequest } from "./PluginRequest";

export abstract class Plugin
{
    private logger!: Logger;

    public async initialize(logger: Logger)
    {
        this.logger = logger;
    }

    public async onRequest(request: PluginRequest)
    {

    }
}
