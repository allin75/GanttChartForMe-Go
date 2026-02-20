# 项目上下文 - 甘特图项目管理工具

## 项目概述

一个轻量级的甘特图项目管理工具，用于可视化查看项目进度、管理任务时间线。

**技术栈：**
- 前端：React 18 + TypeScript + Bootstrap 5
- 后端：Node.js + Express + TypeScript
- 数据库：SQLite (sql.js - 纯 JavaScript 实现)
- 容器化：Docker

**架构：** 前后端分离，生产环境由 Express 静态托管前端构建产物

## 构建和运行命令

### Docker 部署（推荐）
```bash
docker-compose up -d --build
```
访问：http://localhost:3001

### 本地开发

**后端：**
```bash
cd backend
npm install          # 安装依赖
npm run build        # 编译 TypeScript
npm run dev          # 开发模式（ts-node）
npm start            # 生产模式
```

**前端：**
```bash
cd frontend
npm install          # 安装依赖
npm start            # 开发模式（热重载，端口3000，代理到3001）
npm run build        # 生产构建
```

**本地生产运行：**
```bash
# 1. 构建前后端
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build

# 2. 复制前端产物到后端
# Windows:
mkdir ..\backend\frontend; Copy-Item -Recurse -Force build\* ..\backend\frontend\
# Linux/Mac:
mkdir -p ../backend/frontend && cp -r build/* ../backend/frontend/

# 3. 启动服务
cd ../backend
$env:NODE_ENV='production'; node dist/index.js   # Windows
NODE_ENV=production node dist/index.js           # Linux/Mac
```

## 项目结构

```
GanttChart/
├── backend/                 # 后端代码
│   ├── src/
│   │   ├── routes/          # API 路由
│   │   │   ├── projects.ts  # 项目 CRUD API
│   │   │   └── tasks.ts     # 任务 CRUD API
│   │   ├── database.ts      # SQLite 数据库封装
│   │   ├── index.ts         # Express 应用入口
│   │   ├── types.ts         # TypeScript 类型定义
│   │   └── sql.js.d.ts      # sql.js 类型声明
│   ├── dist/                # 编译输出（git ignored）
│   ├── frontend/            # 前端构建产物（生产环境）
│   └── data/                # SQLite 数据库文件目录
├── frontend/                # 前端代码
│   ├── src/
│   │   ├── components/
│   │   │   ├── GanttChart.tsx   # 甘特图核心组件
│   │   │   ├── ProjectList.tsx  # 项目列表侧边栏
│   │   │   └── TaskModal.tsx    # 任务编辑弹窗
│   │   ├── App.tsx          # 主应用组件
│   │   ├── App.css          # 全局样式
│   │   ├── api.ts           # API 调用封装
│   │   ├── types.ts         # TypeScript 类型定义
│   │   └── index.tsx        # React 入口
│   └── public/
├── Dockerfile               # 多阶段 Docker 构建
├── docker-compose.yml       # Docker Compose 配置
└── README.md
```

## API 接口

**基础路径：** `/api`

### 项目管理
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/projects` | 获取所有项目 |
| GET | `/api/projects/:id` | 获取单个项目 |
| POST | `/api/projects` | 创建项目 |
| PUT | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 删除项目 |

### 任务管理
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/tasks/all` | 获取所有任务（带项目信息） |
| GET | `/api/tasks/project/:projectId` | 获取项目的所有任务 |
| GET | `/api/tasks/:id` | 获取单个任务 |
| POST | `/api/tasks` | 创建任务 |
| PUT | `/api/tasks/:id` | 更新任务 |
| DELETE | `/api/tasks/:id` | 删除任务 |

## 环境变量

| 变量名 | 默认值 | 描述 |
|--------|--------|------|
| `PORT` | 3001 | 服务端口 |
| `NODE_ENV` | development | 运行环境 (development/production) |
| `DB_PATH` | ./data/gantt.db | SQLite 数据库文件路径 |

## 开发约定

### 代码风格
- TypeScript 严格模式
- React 函数组件 + Hooks
- 异步操作使用 async/await
- CSS 使用普通 CSS 文件（非 CSS-in-JS）

### 前端开发
- 组件放在 `src/components/`
- API 调用统一通过 `api.ts`
- 类型定义放在 `types.ts`
- 样式文件与组件同级或集中在 `App.css`

### 后端开发
- 路由放在 `src/routes/`
- 数据库操作通过 `database.ts` 封装
- 所有 API 返回 JSON 格式

### 数据库
- 使用 sql.js（纯 JS SQLite，无需编译）
- 数据库文件存储在 `backend/data/`
- 备份只需复制 `.db` 文件

## 注意事项

1. **sql.js WASM 文件**：后端启动时会从 `node_modules/sql.js/dist/sql-wasm.wasm` 加载 WASM 文件，确保该文件存在

2. **前端代理**：开发模式下前端代理请求到 `http://localhost:3001`

3. **端口冲突**：修改端口需同时更新 `docker-compose.yml` 的端口映射和 `backend/src/index.ts` 的默认值

4. **TypeScript 版本**：前端使用 TypeScript 4.9.x 以兼容 react-scripts 5.0.1
