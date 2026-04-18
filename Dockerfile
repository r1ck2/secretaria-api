FROM node:22.19.0-alpine3.22

RUN apk add --no-cache bash

WORKDIR /usr/src/app

COPY . /usr/src/app

RUN chmod -R 777 /usr/src/app

RUN rm -rf node_modules package-lock.json yarn.lock

RUN npm i
RUN npm run build || true
RUN tsc-alias -p tsconfig.json || true

EXPOSE 2727

CMD ["node", "dist/main.js"]
