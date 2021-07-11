import * as http from 'http';
import { Session } from './Session';
import { SessionStore } from './SessionStore';

export class SNIRequest
{
    public constructor(
        public hostname: string
    )
    {

    }
}

export class Request extends SNIRequest
{
    private _hasBeenRespondedTo = false;

    public constructor(
        hostname: string,
        public isSecure: boolean,
        public url: URL,
        public session: Session,
        public req: http.IncomingMessage,
        private res: http.ServerResponse
    )
    {
        super(hostname);
    }

    public static async load(
        hostname: string,
        isSecure: boolean,
        url: URL,
        sessionStore: SessionStore,
        req: http.IncomingMessage,
        res: http.ServerResponse,
    )
    {
        let session = await Session.load(sessionStore, isSecure, req);
        return new Request(hostname, isSecure, url, session, req, res);
    }

    public get hasBeenRespondedTo()
    {
        return this._hasBeenRespondedTo;
    }

    public async respond(func: (res: http.ServerResponse) => Promise<void>)
    {
        if (!this._hasBeenRespondedTo)
        {
            this._hasBeenRespondedTo = true;
            await this.session.save(this, this.res);
            if (this.isSecure)
            {
                this.res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
            }
            await func(this.res);
        }
    }
}
