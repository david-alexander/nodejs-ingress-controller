import * as http from 'http';
import * as https from 'https';

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
        let handleRequest = async (isSecure: boolean, req: http.IncomingMessage, res: http.ServerResponse) => {
            try
            {
                if (req.headers?.host && req.url)
                {
                    this.logger.log(LOG_COMPONENT, LogLevel.TRACE, "Got HTTP request", { host: req.headers.host, path: req.url });
                    let request = await Request.load(req.headers.host, isSecure, new URL(req.url, `https://${req.headers.host}`), this.sessionStore, req, res);
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
                    if (!res.headersSent)
                    {
                        res.writeHead(502);
                    }
                    res.end('Bad Gateway');
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
            handleRequest(true, req, res);
        });
    
        httpsServer.on('error', (err) => {
    
        });
    
        httpsServer.listen(443);
    
        let httpServer = http.createServer((req, res) => {
            handleRequest(false, req, res);
        });
    
        httpServer.on('error', (err) => {
    
        });
    
        httpServer.listen(80);
    }
}
