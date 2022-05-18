import { Plugin } from 'nodejs-ingress-controller-core/Plugin';
import { PluginRequest } from 'nodejs-ingress-controller-core/PluginRequest'

import * as openid from 'openid-client';
import { Logger } from '../core/Logger';

import * as JwtVerifier from '@okta/jwt-verifier';
import { HTTPBackend } from '../core/Backend';

/** The OIDC discovery URL, e.g. for Azure AD: https://login.microsoftonline.com/MY_AZURE_AD_TENANT_ID/.well-known/openid-configuration */
const DISCOVERY_URL = process.env.OIDC_DISCOVERY_URL || '';

/** The OIDC client ID. */
const CLIENT_ID = process.env.OIDC_CLIENT_ID || '';

/** The OIDC client secret. */
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || '';

/**
 * Whether the OIDC redirect URI should use `localhost` instead of the original requested domain.
 * This is useful for local development Kubernetes clusters where you want to use ingress hostnames like `myapp.localhost`,
 * if your OIDC provider doesn't allow insecure redirect URIs under any domain other than `localhost`.
 */
const REDIRECT_TO_LOCALHOST = process.env.OIDC_REDIRECT_TO_LOCALHOST == '1';

/**
 * Which scopes to request from the user. Must include:
 *  - `openid` (to get the ID token)
 *  - `email` (to get the user's email address for the X-OpenID-User header)
 *  - `offline_access` (to get the refresh token)
 */
const SCOPES = "openid email profile offline_access";

/**
 * Plugin that implements single sign on (SSO) using OpenID Connect (OIDC).
 * 
 * Any ingresses that are marked with the `oidc.api.k8s.dma.net.nz/requireAuth` annotation will be protected by this plugin.
 * Users accessing these ingresses without a valid and unexpired session will be redirected to the OIDC provider's login flow.
 * Once the user is logged in, requests will be passed on to the backend with extra headers added (prefixed with `X-OpenID-`) to identify the user.
 * 
 * All valid logins to the OIDC provider are allowed access, so if the backend wants to only allow access to a subset of users, it must handle that itself
 * by looking at the information in the `X-OpenID-` headers (e.g. which groups the user is a member of, which should be in the `X-OpenID-Claims` header).
 * 
 * If the ingress is also marked with the `oidc.api.k8s.dma.net.nz/extraScopes` annotation, the specified scopes will be requested from the user in addition
 * to the ones specified in `SCOPES` above.
 * 
 * If the ingress is also marked with the `oidc.api.k8s.dma.net.nz/allowAccessTokenInHeader` annotation, and incoming requests include an ID token in the `X-OpenID-ID-Token`
 * header, this token will be validated (checked to ensure it is valid for the configured OIDC client and has not expired), if valid, the request will be forwarded onto the backend.
 * This is useful if making requests from a browser to an API that is on a different domain than the requesting `Origin`.
 */
export class OpenIDConnectPlugin extends Plugin
{
    private issuer: openid.Issuer<openid.Client>;
    private client: openid.Client;
    private jwtVerifier: JwtVerifier;

    public async initialize(logger: Logger)
    {
        super.initialize(logger);
        
        this.issuer = await openid.Issuer.discover(DISCOVERY_URL);
        this.client = new this.issuer.Client({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            response_types: ['code']
        });

        this.jwtVerifier = new JwtVerifier({
            issuer: this.issuer.metadata.issuer,
            clientId: CLIENT_ID,
            jwksUri: this.issuer.metadata.jwks_uri
        } as any);
    }

    public async onRequest(pr: PluginRequest)
    {
        const request = pr.request;


        // Handle the special localhost redirect URI.
        if (REDIRECT_TO_LOCALHOST && request.hostname == 'localhost')
        {
            let callbackParams = this.client.callbackParams(request.url.search);
            let nextHostname = callbackParams.state!;

            if (nextHostname && nextHostname != 'localhost')
            {
                const actualRedirect = new URL(request.url.toString());
                actualRedirect.hostname = nextHostname;
                
                await request.respond(async (res) => {
                    res.writeHead(302, {
                        'Location': actualRedirect.toString()
                    });
                    res.end();
                });
                
                return;
            }

            return;
        }

        // If there's no backend, we don't need to go any further.
        if (!(pr.backend instanceof HTTPBackend))
        {
            return;
        }

        const backend = pr.backend;

        const isEnabled = (backend.ingress.metadata?.annotations || {})['oidc.api.k8s.dma.net.nz/requireAuth'] == "true";

        // Only handle requests for ingresses that we have been asked to protect. Allow all others to continue without authentication.
        if (isEnabled)
        {
            const extraScopes = (backend.ingress.metadata?.annotations || {})['oidc.api.k8s.dma.net.nz/extraScopes'] || "";
            const allowAccessTokenInHeader = (backend.ingress.metadata?.annotations || {})['oidc.api.k8s.dma.net.nz/allowAccessTokenInHeader'] == "true";

            if (allowAccessTokenInHeader)
            {
                // Ensure that the client can provide the X-OpenID-ID-Token header without getting CORS errors.
                // TODO: Can we avoid clobbering the CORS headers from the backend?
                // TODO: Are we introducing any CORS vulnerabilities here? What if the backend doesn't want to allow CORS?
                request.addResponseHeader('Access-Control-Allow-Origin', '*');
                request.addResponseHeader('Access-Control-Allow-Headers', 'X-OpenID-ID-Token, Content-Type');
                request.addResponseHeader('Access-Control-Allow-Methods', '*');

                // Respond directly to OPTIONS requests (for CORS).
                if (request.req.method == 'OPTIONS')
                {
                    await request.respond(async (res) => {
                        res.writeHead(200, {
                        });
                        res.end();
                    });
                    return;
                }
                else
                {
                    // TODO: Include refresh token in header as well.
                    //       Use this to refresh the id_token if needed.
                    let idTokenFromHeader = request.req.headers['x-openid-id-token'];

                    // Make sure the ID token is present and valid. If so, allow the request to continue to the backend. If not, return a 401 Unauthorized response.
                    if (idTokenFromHeader)
                    {
                        let token = Array.isArray(idTokenFromHeader) ? idTokenFromHeader[0] : idTokenFromHeader;
                        try
                        {
                            let result = await this.jwtVerifier.verifyIdToken(token, CLIENT_ID, '');

                            request.req.headers['x-openid-id-token'] = idTokenFromHeader;
                        }
                        catch (e)
                        {
                            await request.respond(async (res) => {
                                res.writeHead(401, {
                                });
                                res.end();
                            });
        
                        }

                        return;
                    }
                }
            }

            const redirectUri = REDIRECT_TO_LOCALHOST ? 'http://localhost/redirect_uri' : `https://${request.hostname}/redirect_uri`;
            let tokens = request.session.data.tokens ? new openid.TokenSet(request.session.data.tokens) : null;
            
            try
            {
                // Handle the redirect from the OIDC provider.
                if (request.url.pathname == '/redirect_uri')
                {
                    let callbackParams = this.client.callbackParams(request.url.search);

                    let tokens = await this.client.callback(redirectUri, callbackParams, {
                        response_type: 'code',
                        code_verifier: request.session.data.codeVerifier,
                        state: callbackParams.state
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

            // Try to refresh the access token if it has expired.
            try
            {
                if (tokens?.expired())
                {
                    tokens = await this.client.refresh(tokens);
                    // TODO: Are we actually saving the refreshed access token properly into the session store?
                }
            }
            catch (e)
            {
                tokens = null;
            }

            try
            {
                // If no valid token, redirect to the OIDC flow.
                if (!tokens)
                {
                    const codeVerifier = openid.generators.codeVerifier();
                    const codeChallenge = openid.generators.codeChallenge(codeVerifier);
                    
                    const authUrl = this.client.authorizationUrl({
                        scope: `${SCOPES} ${extraScopes}`,
                        code_challenge: codeChallenge,
                        code_challenge_method: 'S256',
                        redirect_uri: redirectUri,
                        state: request.url.hostname
                    });

                    request.session.data.nextPath = request.url.pathname + request.url.search;
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

            // Pass on the extra headers to the backend.
            // TODO: Is it possible for a user to fake these headers by putting them in their original request?
            request.req.headers['x-openid-access-token'] = tokens.access_token;
            request.req.headers['x-openid-id-token'] = tokens.id_token;
            request.req.headers['x-openid-refresh-token'] = tokens.refresh_token;
            request.req.headers['x-openid-claims'] = JSON.stringify(tokens.claims());
            request.req.headers['x-openid-user'] = tokens.claims().email;
        }
    }
}
