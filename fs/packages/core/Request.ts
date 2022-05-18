import * as http from 'http';
import { Session } from './Session';
import { SessionStore } from './SessionStore';

/**
 * Contains the information provided by the client in the Server Name Indication (SNI) phase at the beginning of a TLS session.
 */
export class SNIRequest
{
    /**
     * @param hostname The hostname that the client wants to connect to.
     */
    public constructor(
        public hostname: string
    )
    {

    }
}

/**
 * Represents a complete HTTP request that has been received from a client.
 * This extends `SNIRequest` because it contains all the information that we had at SNI time, and some more.
 */
export class Request extends SNIRequest
{
    /** Has a response already been sent for this request? */
    private _hasBeenRespondedTo = false;

    /** The response headers that we are going to send. These are buffered so that we can set the status code after we've set the headers. */
    private responseHeaders: { name: string, value: string }[] = [];

    /**
     * 
     * @param hostname The contents of the `Host` header.
     * @param isSecure `true` if the request was received via HTTPS, `false` otherwise.
     * @param url The path component of the request.
     * @param session The session information that has been loaded by the `SessionStore` for this request.
     * @param req The NodeJS request object.
     * @param output Contains the underlying NodeJS objects required to write output to the response of this request. These are different depending on whether or not the request has been upgraded to a WebSockets session.
     */
    public constructor(
        hostname: string,
        public isSecure: boolean,
        public url: URL,
        public session: Session,
        public req: http.IncomingMessage,
        public output: { isWebSocket: false, res: http.ServerResponse } | { isWebSocket: true, socket: any, head: any }
    )
    {
        super(hostname);
    }

    /**
     * Load any data that may be needed to handle a request. This includes session data from the session store.
     * @returns A `Request`.
     */
    public static async load(
        hostname: string,
        isSecure: boolean,
        url: URL,
        sessionStore: SessionStore,
        req: http.IncomingMessage,
        output: { isWebSocket: false, res: http.ServerResponse } | { isWebSocket: true, socket: any, head: any }
    )
    {
        let session = await Session.load(sessionStore, isSecure, req);
        return new Request(hostname, isSecure, url, session, req, output);
    }

    /** Has a response already been sent for this request? */
    public get hasBeenRespondedTo()
    {
        return this._hasBeenRespondedTo;
    }

    /**
     * Add a header to the response.
     * @param name The header name.
     * @param value The header contents.
     */
    public addResponseHeader(name: string, value: string)
    {
        this.responseHeaders.push({ name, value });
    }

    /**
     * Send a response to the request. This is done in a callback for error-handling and sequencing reasons.
     * @param func The function that will send the response.
     */
    public async respond(func: (res: http.ServerResponse) => Promise<void>)
    {
        if (!this._hasBeenRespondedTo)
        {
            this._hasBeenRespondedTo = true;

            if (!this.output.isWebSocket)
            {
                await this.session.save(this, this.output.res);
                if (this.isSecure)
                {
                    this.output.res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
                }
                for (let header of this.responseHeaders)
                {
                    this.output.res.setHeader(header.name, header.value);
                }
                await func(this.output.res);
            }
        }
    }
}
