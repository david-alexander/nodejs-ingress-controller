import * as http from 'http';
import * as https from 'https';

import { Backend } from './Backend';
import { TLSCertificate } from './TLSCertificate';
import { Request, SNIRequest } from './Request';
import { SessionStore } from './SessionStore';

export class HTTPFrontend
{
    public constructor(private sessionStore: SessionStore)
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
                let certificate = await getCertificate(new SNIRequest(serverName));
                if (certificate)
                {
                    cb(null, certificate.secureContext!)
                }
                else
                {
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