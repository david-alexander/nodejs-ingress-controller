import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import * as stream from 'stream';

import { Backend } from './Backend';
import { TLSCertificate } from './TLSCertificate';
import { Request, SNIRequest } from './Request';
import { SessionStore } from './SessionStore';
import { Logger, LogLevel } from './Logger';

const LOG_COMPONENT = 'HTTPFrontend';

export class HTTPFrontend
{
    public constructor(private sessionStore: SessionStore, private logger: Logger)
    {

    }

    public start(
        getBackend: (request: Request) => Promise<Backend | null>,
        getCertificate: (request: SNIRequest) => Promise<TLSCertificate | null>)
    {
        let handleRequest = async (isSecure: boolean, req: http.IncomingMessage, output: { isWebSocket: false, res: http.ServerResponse } | { isWebSocket: true, socket: any, head: any }) => {
            try
            {
                if (req.headers?.host && req.url)
                {
                    this.logger.log(LOG_COMPONENT, LogLevel.TRACE, "Got HTTP request", { host: req.headers.host, path: req.url });
                    let request = await Request.load(req.headers.host, isSecure, new URL(req.url, `${(req.socket instanceof tls.TLSSocket) ? 'https' : 'http'}://${req.headers.host}`), this.sessionStore, req, output);
                    let backend = await getBackend(request); 

                    if (backend?.isSecure && !request.isSecure)
                    {
                        request.respond(async (res) => {
                            res.writeHead(308, {
                                'Location': `https://${request.hostname}${request.url.pathname}`
                            });
                            res.end('');
                        });
                        return;
                    }

                    if (backend)
                    {
                        await backend.handleRequest(request);
                    }

                    if (!request.hasBeenRespondedTo)
                    {
                        request.respond(async (res) => {
                            res.writeHead(404);
                            res.end('Not found');
                        });
                    }
                }
            }
            catch (e)
            {
                console.log(e);
                try
                {
                    if (!output.isWebSocket)
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
    
        let httpsServer = https.createServer({
            SNICallback: async (serverName, cb) => {
                this.logger.log(LOG_COMPONENT, LogLevel.TRACE, "Got SNI request", { serverName });

                let certificate = await getCertificate(new SNIRequest(serverName));

                if (certificate)
                {
                    this.logger.log(LOG_COMPONENT, LogLevel.TRACE, "Found certificate for SNI request", { serverName, secretName: certificate.secretName });
                    cb(null, certificate.secureContext!)
                }
                else
                {
                    this.logger.log(LOG_COMPONENT, LogLevel.TRACE, "Couldn't find certificate for SNI request", { serverName });
                    cb(new Error('Invalid hostname'), null!);
                }
            }
        }, (req, res) => {
            handleRequest(true, req, { isWebSocket: false, res });
        });
    
        httpsServer.on('error', (err) => {
    
        });
    
        httpsServer.listen(443);
    
        let httpServer = http.createServer((req, res) => {
            handleRequest(false, req, { isWebSocket: false, res });
        });
    
        httpServer.on('upgrade', (req, socket: stream.Duplex, head: Buffer) => {
            handleRequest(false, req, { isWebSocket: true, socket, head });
        });
    
        httpsServer.on('upgrade', (req, socket: stream.Duplex, head: Buffer) => {
            handleRequest(true, req, { isWebSocket: true, socket, head });
        });
    
        httpServer.on('error', (err) => {
    
        });
    
        httpServer.listen(80);
    }
}
