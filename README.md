# GanttChartForMe-Go

一个轻量级的甘特图项目管理工具，前端使用 React + TypeScript，后端已迁移为 Go。

## 技术栈

- 前端：React 18 + TypeScript + Bootstrap 5
- 后端：Go 1.22 + 标准库 `net/http`
- 数据存储：SQLite 单文件持久化
- 部署：Docker 多阶段构建

## 架构说明

- `frontend/` 负责 UI 与交互
- `backend/` 现在是 Go 服务，不再依赖 Node/Express
- Go 后端同时负责 API 与前端静态文件托管

## 快速启动

### Docker

```bash
docker-compose up -d --build
```

访问：`http://localhost:3001`

默认数据文件：`./data/gantt.db`

### 本地开发

前端：

```bash
cd frontend
npm install
npm start
```

后端：

```bash
cd backend
go run .
```

前端开发服务器默认代理到 `http://localhost:3001`。

### 本地生产运行

1. 构建前端

```bash
cd frontend
npm install
npm run build
```

2. 复制前端产物到 Go 后端静态目录

```bash
New-Item -ItemType Directory -Force "../backend/frontend" | Out-Null
Copy-Item -Recurse -Force "build/*" "../backend/frontend/"
```

3. 构建并启动后端

```bash
cd ../backend
go build -o server .
./server
```

## 环境变量

- `PORT`：服务端口，默认 `3001`
- `DATA_PATH`：SQLite 文件路径，默认 `./data/gantt.db`
- `DB_PATH`：兼容旧配置的回退变量，仅在未设置 `DATA_PATH` 时生效；如果仍指向旧的 `.json` 路径，启动时会自动改写为同名 `.db` 并尝试导入旧 JSON 数据
- `FRONTEND_DIR`：静态文件目录，默认 `./frontend`

## API 兼容性

### 项目接口

- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`

### 任务接口

- `GET /api/tasks/all`
- `GET /api/tasks/project/:projectId`
- `GET /api/tasks/:id`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`

## 目录结构

```text
.
├── backend/
│   ├── go.mod
│   └── main.go
├── frontend/
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## 迁移结果

- Node/Express 后端主链路已移除
- 后端启动方式变为单一 Go 可执行文件
- 前端仍使用原有 `/api` 地址，无需改动调用代码
