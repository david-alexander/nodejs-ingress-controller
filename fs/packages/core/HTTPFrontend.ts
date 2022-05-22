import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import * as stream from 'stream';

import { Backend, NotFoundBackend } from './Backend';
import { TLSCertificate } from './TLSCertificate';
import { Request, SNIRequest } from './Request';
import { SessionStore } from './SessionStore';
import { Logger, LogLevel } from './Logger';
import { RequestMatcher } from './RequestMatcher';
import { RequestMatchResult } from './KubernetesCluster';

const LOG_COMPONENT = 'HTTPFrontend';

/**
 * Listens for HTTP and HTTPS requests on ports 80 and 443, and passes them on to the callbacks provided.
 */
export class HTTPFrontend
{
    public constructor(private sessionStore: SessionStore, private logger: Logger)
    {

    }

    /**
     * Start listening for requests.
     * @param getBackend Callback that returns a `Backend` to use for a given `Request`.
     * @param getCertificate Callback that returns a `TLSCertificate` to use for a given `SNIRequest`.
     */
    public start(
        getBackend: (request: Request) => Promise<RequestMatchResult>,
        getCertificate: (request: SNIRequest) => Promise<TLSCertificate | null>)
    {
        // Generic request handler.
        // When this is called, we already know whether the request is HTTP or HTTPS (and have done SNI if required), and whether or not it is a WebSockets request.
        let handleRequest = async (isSecure: boolean, req: http.IncomingMessage, output: { isWebSocket: false, res: http.ServerResponse } | { isWebSocket: true, socket: any, head: any }) => {
            try
            {
                if (req.headers?.host && req.url)
                {
                    this.logger.log(LOG_COMPONENT, LogLevel.TRACE, "Got HTTP request", { host: req.headers.host, path: req.url });
                    let request = await Request.load(req.headers.host, isSecure, new URL(req.url, `${(req.socket instanceof tls.TLSSocket) ? 'https' : 'http'}://${req.headers.host}`), this.sessionStore, req, output);
                    this.logger.log(LOG_COMPONENT, LogLevel.TRACE, "Request loaded", { host: req.headers.host, path: req.url });
                    let backend = await getBackend(request); 
                    this.logger.log(LOG_COMPONENT, LogLevel.TRACE, "Got backend", { host: req.headers.host, path: req.url });

                    // At this point we have all the data that we need to process the request, and we know which backend (if any) it should be passed to.

                    // Redirect to HTTPS if necessary.
                    // We use a 308 Permanent Redirect so that the browser will (hopefully - need to check this!) default to HTTPS for this hostname in the future.
                    if (backend?.certificate && !request.isSecure)
                    {
                        request.respond(async (res) => {
                            res.writeHead(308, {
                                'Location': `https://${request.hostname}${request.url.pathname}`
                            });
                            res.end('');
                        });
                        return;
                    }

                    backend.backend ||= new NotFoundBackend();

                    // Pass the request on to the backend.
                    await backend.backend.handleRequest(request);

                    // If the backend couldn't handle the request, return a 502 Bad Gateway response.
                    if (!request.hasBeenRespondedTo)
                    {
                        request.respond(async (res) => {
                            res.writeHead(502);
                            res.end('Bad gateway');
                        });
                    }
                }
                else
                {
                    // TODO: When would `host` or `url` be empty? What should we do in that schenario?
                }
            }
            catch (e)
            {
                // If something went wrong that wasn't handled elsewhere, assume it's a problem with the backend. (TODO: Is this assumption correct?)
                console.log(e);
                try
                {
                    if (!output.isWebSocket) // can't send response headers if we've already upgraded to a WebSocket connection.
                    {
                        if (!output.res.headersSent)
                        {
                            output.res.writeHead(502);
                        }
                        output.res.end('Bad Gateway');
                    }
                }
                catch (e)
                {
                    console.log(e);
                }
            }
        };
    
        // Listen for and handle HTTPS connections.
        let httpsServer = https.createServer({
            SNICallback: async (serverName, cb) => {
                // This callback handles Server Name Indication (SNI),
                // which is how the client specifies which hostname it wants to
                // connect to, of the multiple hostnames associated with this IP address.
                // We use this to decide which TLS certificate to use.

                this.logger.log(LOG_COMPONENT, LogLevel.TRACE, "Got SNI request", { serverName });

                // Try to find a certificate that matches the provided hostname.
                let certificate = await getCertificate(new SNIRequest(serverName));

                if (certificate)
                {
                    // Found a certificate - use it.
                    this.logger.log(LOG_COMPONENT, LogLevel.TRACE, "Found certificate for SNI request", { serverName, secretName: certificate.secretName });
                    cb(null, certificate.secureContext!)
                }
                else
                {
                    // Didn't find a certificate - throw an error.
                    // TODO: Currently this just closes the connection, resulting in an `ERR_CONNECTION_CLOSED` in the browser. Is there a better way to handle this?
                    this.logger.log(LOG_COMPONENT, LogLevel.TRACE, "Couldn't find certificate for SNI request", { serverName });
                    cb(new Error('Invalid hostname'), null!);
                }
            }
        }, (req, res) => {
            // SNI has been done and the HTTP request has been received. Pass it on to our generic request handler.
            handleRequest(true, req, { isWebSocket: false, res });
        });
    
        httpsServer.on('error', (err) => {
            // An error occurred at the server level.
            // TODO: Find out what kinds of errors can occur here and handle them properly.
        });
    
        httpsServer.listen(443);
    
        // Listen for and handle HTTP connections.
        let httpServer = http.createServer((req, res) => {
            handleRequest(false, req, { isWebSocket: false, res });
        });
    
        // Handle WebSockets upgrades (HTTP).
        httpServer.on('upgrade', (req, socket: stream.Duplex, head: Buffer) => {
            handleRequest(false, req, { isWebSocket: true, socket, head });
        });
        
        // Handle WebSockets upgrades (HTTPS).
        httpsServer.on('upgrade', (req, socket: stream.Duplex, head: Buffer) => {
            handleRequest(true, req, { isWebSocket: true, socket, head });
        });
    
        httpServer.on('error', (err) => {
            // An error occurred at the server level.
            // TODO: Find out what kinds of errors can occur here and handle them properly.
        });
    
        httpServer.listen(80);
    }
}
