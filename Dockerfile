# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制前端文件
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm install
COPY frontend/ ./
RUN npm run build

# 后端构建
WORKDIR /app
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install
COPY backend/ ./
RUN npm run build

# 生产阶段
FROM node:20-alpine

WORKDIR /app

# 复制后端
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./

# 复制前端构建产物
COPY --from=builder /app/frontend/build ./frontend

# 创建数据目录
RUN mkdir -p /app/data

# 设置环境变量
ENV NODE_ENV=production
ENV DB_PATH=/app/data/gantt.db
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
