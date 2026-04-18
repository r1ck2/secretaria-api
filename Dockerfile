# SET IMAAGE
FROM node:22.19.0-alpine3.22

RUN echo "Workdir"
WORKDIR /usr/src/app

RUN echo "Copiar arquivos"
COPY . /usr/src/app

RUN echo "CHOWN permissao"
RUN chmod -R 777 /usr/src/app

RUN echo "clean up"
RUN rm -rf node_modules package-lock.json yarn.lock

RUN echo "Instalacao e build"
RUN npm i @rollup/rollup-linux-x64-musl
RUN npm i
RUN npm run build

RUN echo "Expor porta"
EXPOSE 2727

RUN echo "Rodar aplicacao"
# CMD ["npm", "run", "start:prod"]
CMD ["npm", "start"]