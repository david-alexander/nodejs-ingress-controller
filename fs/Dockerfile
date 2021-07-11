FROM node:14-alpine

WORKDIR /app
ADD package*.json ./
RUN npm ci
ADD . ./

ENTRYPOINT [ "node", "start.js" ]
