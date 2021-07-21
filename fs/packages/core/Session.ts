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

export class Session
{
    private constructor(private sessionStore: SessionStore, private id: string, private _data: any)
    {

    }

    public get data()
    {
        return this._data;
    }

    public static async load(sessionStore: SessionStore, isSecure: boolean, req: http.IncomingMessage)
    {
        let cookies = cookie.parse(req.headers.cookie || '');
        let sessionID = cookies[getCookieName(isSecure)] || uuid.v4();
        let data = await sessionStore.getSessionData(sessionID);
        return new Session(sessionStore, sessionID, data || {});
    }

    public async save(request: Request, res: http.ServerResponse)
    {
        await this.sessionStore.setSessionData(this.id, this._data);
        res.setHeader('Set-Cookie', cookie.serialize(getCookieName(request.isSecure), this.id, {
            sameSite: 'lax',
            httpOnly: true,
            secure: request.isSecure,
            path: '/'
        }));
    }
}
