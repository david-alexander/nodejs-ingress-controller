# Node.js Ingress Controller
Node.js-based ingress controller for Kubernetes

## What is this?

This is an [ingress controller](https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/) for [Kubernetes](https://kubernetes.io/).

Ingress controllers provide access to services running within a Kubernetes cluster, to clients outside the cluster. They can provide features such as SSL termination, authentication, and more.

This ingress controller is implemented in Node.js. This doesn't mean you can only use it with Node.js applications. However, if you need to add custom functionality to the ingress controller, you will find it easier if you're familiar with Node.js.

## Why another ingress controller?

Currently, the most commonly used ingress controller is [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/). NGINX Ingress Controller works well for many people, and _**Node.js Ingress Controller**_ does not seek to replace it. However, our goals are somewhat different from those of NGINX Ingress Controller, and it is perhaps instructive to look at some of these goals:

* **Small, auditable codebase:** The ingress controller is an important part of the security of your Kubernetes cluster. We think it's important that you can read the entire core codebase and understand how it works. We keep the core codebase as small as possible, with as few dependencies as possible. (See [Trusted Computing Base](#trusted-computing-base) below.) Modern TypeScript features help us make the code readable and robust.
* **Access to the Node.js ecosystem:** Extensions for NGINX are typically written in Lua. While Lua is an excellent language, and has a great ecosystem of its own, many web application developers are more comfortable with Node.js. With _**Node.js Ingress Controller**_, if you need to write an extension to add custom functionality, there's a good chance you'll find a library on NPM to do most of the work for you. Over time, we hope to build up a library of useful and high-quality extensions that you can enable with the flip of a switch.
* **Best practices by default:** There are some things you'd rather not have to think about. _**Node.js Ingress Controller**_ aims to handle these things for you, out-of-the-box or with minimal setup required.

## Quick start

### Prerequisites

The only strict prerequisite is that you have **a Kubernetes cluster** of some sort. However, there are a few other things that you'll probably want to set up, assuming you want your ingresses to be accessible from the public internet.

* Your Kubernetes cluster needs to be able to allocate a **public IP address** to the ingress controller's [LoadBalancer Service](https://kubernetes.io/docs/concepts/services-networking/service/#loadbalancer). Most managed cloud Kubernetes providers will do this for you automatically when you deploy _**Node.js Ingress Controller**_ to your cluster.
* You'll want one or more **domain names** to point at your ingresses. You can either set these up manually (once you have your public IP address) or use something like [external-dns](https://github.com/kubernetes-sigs/external-dns) to do it automatically. If you're planning on having just one (or a few) registered domains, and a lot of subdomains under them for your various services, you may find it helpful to set up a DNS zone with your cloud provider and then configure external-dns to manage that zone automatically for you.
* Assuming you're using HTTPS (which you almost always should), you'll need certificates for your hostnames. We recommend installing [cert-manager](https://cert-manager.io/) on your cluster, and [configuring it to use Let's Encrypt](https://cert-manager.io/docs/configuration/acme/).

### Configuring your ingresses

Each `Ingress` that you want to expose via _**Node.js Ingress Controller**_ must have the following annotation:

    kubernetes.io/ingress.class: nodejs

If you're using cert-manager and Let's Encrypt, you'll also want these annotations. (Assuming your `Issuer` is called `letsencrypt` as per the [guide](https://cert-manager.io/docs/configuration/acme/).)

    cert-manager.io/cluster-issuer: letsencrypt
    cert-manager.io/acme-challenge-type: http01

You should also have the following section in the `spec` of your `Ingress` (replace `HOSTNAME_GOES_HERE` with the hostname, and `SECRET_NAME_FOR_TLS_CERT` with a unique name for the `Secret` that the TLS certificate will be stored in).

    tls:
      - hosts:
          - HOSTNAME_GOES_HERE
        secretName: SECRET_NAME_FOR_TLS_CERT

### Deploying the ingress controller

_**Node.js Ingress Controller**_ is provided as a [Helm](https://helm.sh/) chart. You can install it as follows:

* Build the container image and push it to your container registry:

      cd fs
      docker build . -t YOUR_REGISTRY_HERE/ingress-nodejs-controller
      docker push YOUR_REGISTRY_HERE/ingress-nodejs-controller

* Configure the settings in `chart/values.yaml`.

* Deploy the Helm chart to your Kubernetes cluster (here we use the example instance name `my-ingress-controller`, but you can use whatever name you want here):

      cd chart
      helm install my-ingress-controller .

If all goes well, you should see the following steps take place over the next few minutes:

1. The `Service` called `my-ingress-controller-nodejs-ingress-controller` will be allocated a public IP address.
2. The _**Node.js Ingress Controller**_ will start running, find all `Ingress`es with the appropriate annotation, and put its public IP address into the `.status.loadBalancer.ingress` field of each one. This tells Kubernetes that the `Ingress`es can be reached via this IP address.
3. Your external-dns instance (if applicable) will see this, and start pointing DNS records at this IP address. (If you're not using external-dns, you'll have to do this step manually.) Now people on the public internet will be able to reach the ingress controller via the relevant hostnames — but not via HTTPS yet.
4. Any `Ingress`es you have which are not configured for HTTPS (i.e. do not have a `tls` section), will simply be served via regular HTTP. However, `Ingress`es that _**are**_ configured for HTTPS will _**not**_ be served at all until their certificates are ready.
5. Your cert-manager instance will see that there are `Ingress`es that are configured for HTTPS by do not yet have certificates, and will start the process of provisioning them. This process is as follows:
   1. cert-manager contacts Let's Encrypt to get a "challenge". This is a string that it will use to prove to Let's Encrypt that you control the hostname in question.
   2. cert-manager sets up a special temporary `Ingress` to serve this challenge at a specific path under your hostname. This is served over HTTP (not HTTPS).
   3. cert-manager does a "self-check" to ensure that the challenge is reachable at the appropriate URL. (This step may fail a few times while the DNS is propagating, but cert-manager will keep retrying until it succeeds.)
   4. Let's Encrypt checks for the presence of the challenge at the appropriate URL. Upon successful validation of the challenge, Let's Encrypt issues a certificate for the hostname.
   5. cert-manager stores the certificate in the `Secret` whose name you specified in the `tls` section of the `Ingress`.
5. When _**Node.js Ingress Controller**_ sees a valid certificate in a `Secret` pointed to by an `Ingress`, it will start using that certificate to serve HTTPS for the `Ingress`. Your service is now live!

## Trusted Computing Base

When thinking about the security (and general code quality) of a system, it is useful to consider the [Trusted Computing Base](https://en.wikipedia.org/wiki/Trusted_computing_base) (TCB) of that system. This is the full set of software and hardware that the system relies on.

We think it's important to keep tabs on the TCB of Node.js Ingress Controller to make sure it remains small and auditable as the project evolves. To that end, we document the TCB below. For simplicity, we only cover the software that runs inside the _**Node.js Ingress Controller**_ container — but you can find discussions of the wider Kubernetes TCB elsewhere. We also do not include indirect NPM dependencies.

Item     | Purpose | Used by component | Notes
---------|---------|------|-----
**[Alpine Linux](https://alpinelinux.org/) v3.11** | Operating system | All | Lightweight base image. Latest major release.
**[Node.js](https://nodejs.org/) v14** | JS runtime | All | Current long-term support (LTS) release. Only the core modules listed below are referenced directly.
([http](https://nodejs.org/api/http.html) core module) | Handles HTTP requests. | All | 
([https](https://nodejs.org/api/https.html) core module) | Handles HTTPS requests. | All | 
([tls](https://nodejs.org/api/tls.html) core module) | Reads and validates TLS certificates for use by HTTPS server. | All | 
**[NPM](https://npmjs.com/) CLI v7** | Package manager | All | Build-time dependency.
**[TypeScript](https://npmjs.com/package/typescript) v4** | JS preprocessor / static checker | All | TODO: Run this at build time.
**[ts-node](https://npmjs.com/package/ts-node)** | Transpiles TS to JS at runtime. | All | TODO: Remove this and run TS transpiler at build time.
**[@kubernetes/client-node](https://npmjs.com/package/@kubernetes/client-node)** | Kubernetes client library | Core, K8sCRDSessionStore | 
**[http-proxy](https://npmjs.com/package/http-proxy)** | Facilitates proxying of HTTP connections to backend servers | Core | 
**[cookie](https://npmjs.com/package/cookie)** | Parses and generates `Cookie`/`Set-Cookie` headers. Used for session management. | Core |
**[uuid](https://npmjs.com/package/uuid)** | Generates UUIDs. Used for session management. | Core |
**[openid-client](https://npmjs.com/package/openid-client)** | Performs OAuth / OIDC flows. | OpenIDConnectPlugin |
