export abstract class SessionStore
{
    public constructor()
    {

    }

    public async initialize()
    {

    }

    public abstract getSessionData(sessionID: string): Promise<any>;

    public abstract setSessionData(sessionID: string, data: any): Promise<void>;

    public abstract deleteSession(sessionID: string): Promise<void>;
}
