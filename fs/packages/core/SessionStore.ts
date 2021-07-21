import { Logger } from "./Logger";

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
