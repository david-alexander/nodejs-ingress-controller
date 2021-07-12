# Node.js Ingress Controller
Node.js-based ingress controller for Kubernetes

## What is this?

This is an [ingress controller](https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/) for [Kubernetes](https://kubernetes.io/).

Ingress controllers provide access to services running within a Kubernetes cluster, to clients outside the cluster. They can provide services such as SSL termination, authentication, and more.

This ingress controller is implemented in Node.js. This doesn't mean you can only use it with Node.js applications. However, if you need to add custom functionality to the ingress controller, you will find it easier if you're familiar with Node.js.

## Why another ingress controller?

Currently, the most commonly used ingress controller is [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/). NGINX Ingress Controller works well for many people, and **Node.js Ingress Controller** does not seek to replace it. However, our goals are somewhat different from those of NGINX Ingress Controller, and it is perhaps instructive to look at some of these goals:

* **Small, auditable codebase:** The ingress controller is an important part of the security of your Kubernetes cluster. We think it's important that you can read the entire core codebase and understand how it works. We keep the core codebase as small as possible, with as few dependencies as possible. (See Trusted Computing Base below.) Modern TypeScript features help us make the code readable and robust.
* **Access to the Node.js ecosystem:** Extensions for NGINX are typically written in Lua. While Lua is an excellent language, and has a great ecosystem of its own, many web application developers are more comfortable with Node.js. With **Node.js Ingress Controller**, if you need to write an extension to add custom functionality, there's a good chance you'll find a library on NPM to do most of the work for you. Over time, we hope to build up a library of useful and high-quality extensions that you can enable with the flip of a switch.
* **Best practices by default:** There are some things you'd rather not have to think about. **Node.js Ingress Controller** aims to handle these things for you, out-of-the-box or with minimal setup required.

## Trusted Computing Base

When thinking about the security (and general code quality) of a system, it is useful to consider the [Trusted Computing Base](https://en.wikipedia.org/wiki/Trusted_computing_base) (TCB) of that system. This is the full set of software and hardware that the system relies on.

We think it's important to keep tabs on the TCB of Node.js Ingress Controller to make sure it remains small and auditable as the project evolves. To that end, we document the TCB below. For simplicity, we only cover the software that runs inside the `nodejs-ingress-controller` container — but you can find discussions of the wider Kubernetes TCB elsewhere. We also do not include indirect NPM dependencies.

Item     | Purpose | Used by component | Notes
---------|---------|------|-----
[Alpine Linux](https://alpinelinux.org/) v3.11 | Operating system | All | Lightweight base image. Latest major release.
[Node.js](https://nodejs.org/) v14 | JS runtime | All | Current long-term support (LTS) release.
[NPM](https://npmjs.com/) CLI v7 | Package manager | All | Build-time dependency.
[TypeScript](https://npmjs.com/package/typescript) v4 | JS preprocessor / static checker | All | TODO: Run this at build time.
[ts-node](https://npmjs.com/package/ts-node) | Transpiles TS to JS at runtime. | All | TODO: Remove this and run TS transpiler at build time.
[@kubernetes/client-node](https://npmjs.com/package/@kubernetes/client-node) | Kubernetes client library | Core, K8sCRDSessionStore | 
[http-proxy](https://npmjs.com/package/http-proxy) | Facilitates proxying of HTTP connections to backend servers | Core | 
[cookie](https://npmjs.com/package/cookie) | Parses and generates `Cookie`/`Set-Cookie` headers. Used for session management. | Core |
[uuid](https://npmjs.com/package/uuid) | Generates UUIDs. Used for session management. | Core |
[openid-client](https://npmjs.com/package/openid-client) | Performs OAuth / OIDC flows. | OpenIDConnectPlugin |
