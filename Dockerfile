FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM golang:1.22-alpine AS backend-builder

WORKDIR /app/backend
COPY backend/go.mod ./
RUN go mod download
COPY backend/ ./
RUN go build -o /app/server .

FROM alpine:3.20

WORKDIR /app
RUN mkdir -p /app/data

COPY --from=backend-builder /app/server ./server
COPY --from=frontend-builder /app/frontend/build ./frontend

ENV PORT=3001
ENV DATA_PATH=/app/data/gantt.db
ENV FRONTEND_DIR=/app/frontend

EXPOSE 3001

CMD ["./server"]
