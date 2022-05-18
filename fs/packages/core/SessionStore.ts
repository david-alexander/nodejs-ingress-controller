import { Logger } from "./Logger";

/**
 * A place where session data can be stored.
 * TODO: Currently this just stores session data in memory,
 *       which will not work properly if there are multiple
 *       instances (i.e. pods) of this ingress controller.
 */
export abstract class SessionStore
{
    private logger!: Logger;

    public constructor()
    {

    }

    public async initialize(logger: Logger)
    {
        this.logger = logger;
    }

    public abstract getSessionData(sessionID: string): Promise<any>;

    public abstract setSessionData(sessionID: string, data: any): Promise<void>;

    public abstract deleteSession(sessionID: string): Promise<void>;
}
