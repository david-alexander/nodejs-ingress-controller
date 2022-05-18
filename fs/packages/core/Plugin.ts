import { Logger } from "./Logger";
import { PluginRequest } from "./PluginRequest";

/**
 * Extension point for the ingress controller.
 * When a request is received, each plugin is called in sequence on the request.
 * A plugin can choose to handle the request, in which case it is not passed to any
 * further plugins, nor to the `Backend`.
 */
export abstract class Plugin
{
    private logger!: Logger;

    public async initialize(logger: Logger)
    {
        this.logger = logger;
    }

    /**
     * Called for each request (unless another plugin earlier in the chain handles it first).
     * @param request The request. If `request.hasBeenRespondedTo` is `true` after this, we consider the request to have been handled by this plugin.
     */
    public async onRequest(request: PluginRequest)
    {

    }
}
