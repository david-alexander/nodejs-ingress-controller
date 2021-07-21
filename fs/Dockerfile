FROM node:14-alpine

WORKDIR /app

ADD . /app
RUN --mount=type=cache,id=yarn,target=/root/.yarn,sharing=locked rm -f /root/.yarn/berry/cache/*.flock && yarn

WORKDIR /app/main

ENTRYPOINT [ "yarn", "run", "dev" ]
