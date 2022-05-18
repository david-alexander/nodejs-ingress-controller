import { SessionStore } from "./SessionStore";
import * as cookie from 'cookie';
import * as http from 'http';
import * as uuid from 'uuid';
import { Request } from "./Request";

const COOKIE_PREFIX = '__Host-';
const COOKIE_NAME = `nodejs_ingress_sessionid`;

function getCookieName(isSecure: boolean)
{
    return `${isSecure ? COOKIE_PREFIX : ''}${COOKIE_NAME}`;
}

/**
 * Contains data associated with a user session.
 */
export class Session
{
    private loadedDataJSON: any;

    private constructor(private sessionStore: SessionStore, private id: string, private _data: any)
    {
        this.loadedDataJSON = JSON.stringify(_data);
    }

    /**
     * Arbitrary data associated with the session.
     * This must be JSON-serializable.
     * If you modify the data in this object, you should call `save()` to ensure that your modifications are persisted.
     */
    public get data()
    {
        return this._data;
    }

    /**
     * Given a request which may contain a session cookie, load the session data for the associated session if it exists. (Otherwise returns a new session.)
     * @param sessionStore The `SessionStore` to load the session data from.
     * @param isSecure Whether or not the request was received over HTTPS.
     * @param req The NodeJS request object.
     * @returns The session data.
     */
    public static async load(sessionStore: SessionStore, isSecure: boolean, req: http.IncomingMessage)
    {
        let cookies = cookie.parse(req.headers.cookie || '');
        let sessionID = cookies[getCookieName(isSecure)] || uuid.v4();
        let data = await sessionStore.getSessionData(sessionID);
        return new Session(sessionStore, sessionID, data || {});
    }

    /**
     * Persist any modifications to the session, and include the session cookie in the HTTP response.
     * @param request The request that is being responded to.
     * @param res The NodeJS response object.
     */
    public async save(request: Request, res: http.ServerResponse)
    {
        // Only save the data if it has changed since it was loaded.
        // TODO: Is this "optimization" really necessary, given that we are now using an in-memory `SessionStore`?
        if (JSON.stringify(this._data) != this.loadedDataJSON)
        {
            await this.sessionStore.setSessionData(this.id, this._data);
        }
        
        res.setHeader('Set-Cookie', cookie.serialize(getCookieName(request.isSecure), this.id, {
            sameSite: 'lax',
            httpOnly: true,
            secure: request.isSecure,
            path: '/'
        }));
    }
}
