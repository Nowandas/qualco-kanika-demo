FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN test -n "${VITE_API_BASE_URL}" || (echo "VITE_API_BASE_URL must be provided at build time" && exit 1)
RUN case "${VITE_API_BASE_URL}" in \
      *localhost*|*127.0.0.1*|*://[::1]* ) echo "VITE_API_BASE_URL must not target localhost for production image builds" && exit 1 ;; \
      * ) : ;; \
    esac

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS prod

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 5173

FROM node:20-alpine AS dev

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
