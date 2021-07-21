import { Plugin } from 'nodejs-ingress-controller-core/Plugin';
import { PluginRequest } from 'nodejs-ingress-controller-core/PluginRequest'

import * as openid from 'openid-client';
import { Logger } from '../core/Logger';

const DISCOVERY_URL = process.env.OIDC_DISCOVERY_URL || '';
const CLIENT_ID = process.env.OIDC_CLIENT_ID || '';
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || '';
const SCOPES = "openid email profile offline_access";

export class OpenIDConnectPlugin extends Plugin
{
    private issuer: openid.Issuer<openid.Client>;
    private client: openid.Client;

    public async initialize(logger: Logger)
    {
        super.initialize(logger);
        
        this.issuer = await openid.Issuer.discover(DISCOVERY_URL)
        this.client = new this.issuer.Client({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            response_types: ['code']
        });
    }

    public async onRequest(pr: PluginRequest)
    {
        const request = pr.request;
        const backend = pr.backend;

        const isEnabled = (backend.ingress.metadata?.annotations || {})['oidc.api.k8s.dma.net.nz/requireAuth'] == "true";

        if (isEnabled)
        {
            const extraScopes = (backend.ingress.metadata?.annotations || {})['oidc.api.k8s.dma.net.nz/extraScopes'] || "";
            const allowAuthorizationHeader = (backend.ingress.metadata?.annotations || {})['oidc.api.k8s.dma.net.nz/allowAuthorizationHeader'] == "true";

            const redirectUri = `${request.hostname == 'localhost' ? 'http' : 'https'}://${request.hostname}/redirect_uri`;
            let tokens = request.session.data.tokens ? new openid.TokenSet(request.session.data.tokens) : null;
            
            try
            {
                if (request.url.pathname == '/redirect_uri')
                {
                    let tokens = await this.client.callback(redirectUri, this.client.callbackParams(request.url.search), {
                        response_type: 'code',
                        code_verifier: request.session.data.codeVerifier
                    });
                    
                    request.session.data.tokens = tokens;
                    
                    await request.respond(async (res) => {
                        res.writeHead(302, {
                            'Location': request.session.data.nextPath
                        });
                        res.end();
                    });

                    return;
                }
            }
            catch (e)
            {
                console.error(e);
            }

            try
            {
                if (tokens?.expired())
                {
                    tokens = await this.client.refresh(tokens);
                }
            }
            catch (e)
            {
                tokens = null;
            }

            try
            {
                if (!tokens)
                {
                    const codeVerifier = openid.generators.codeVerifier();
                    const codeChallenge = openid.generators.codeChallenge(codeVerifier);
                    
                    const authUrl = this.client.authorizationUrl({
                        scope: `${SCOPES} ${extraScopes}`,
                        code_challenge: codeChallenge,
                        code_challenge_method: 'S256',
                        redirect_uri: redirectUri
                    });

                    request.session.data.nextPath = request.url.pathname;
                    request.session.data.codeVerifier = codeVerifier;

                    await request.respond(async (res) => {
                        res.writeHead(302, {
                            'Location': authUrl
                        });
                        res.end();
                    });
                    
                    return;
                }
            }
            catch (e)
            {
                await request.respond(async (res) => {
                    res.writeHead(500, {
                    });
                    res.end();
                });
                return;
            }

            request.req.headers['x-openid-access-token'] = tokens.access_token;
            request.req.headers['x-openid-id-token'] = tokens.id_token;
            request.req.headers['x-openid-refresh-token'] = tokens.refresh_token;
            request.req.headers['x-openid-claims'] = JSON.stringify(tokens.claims());
            request.req.headers['x-openid-user'] = tokens.claims().email;
        }
    }
}
