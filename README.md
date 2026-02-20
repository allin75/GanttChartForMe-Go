# 甘特图 - 项目进度管理工具

一个轻量级的甘特图项目管理工具，支持可视化查看项目进度、任务管理等功能。

## 功能特性

- 📊 **甘特图可视化** - 直观展示项目任务时间线
- 📁 **多项目管理** - 支持创建和管理多个项目
- ✅ **任务管理** - 创建、编辑、删除任务
- 🎨 **自定义颜色** - 为项目和任务设置不同颜色
- 📈 **进度追踪** - 设置和查看任务完成进度
- 🖱️ **拖拽操作** - 拖拽调整任务开始/结束时间
- 📅 **多视图模式** - 支持日/周/月视图切换
- 🐳 **Docker 部署** - 一键部署到你的服务器

## 技术栈

- **前端**: React + TypeScript + Bootstrap
- **后端**: Node.js + Express
- **数据库**: SQLite (sql.js)
- **容器化**: Docker

## 快速开始

### 方式一：Docker 部署（推荐）

1. 构建并启动容器：
```bash
docker-compose up -d --build
```

2. 访问应用：打开浏览器访问 `http://localhost:3001`

3. 数据持久化：数据存储在 `./data/gantt.db` 文件中

### 方式二：本地开发

#### 前置要求
- Node.js 18+
- npm 或 yarn

#### 安装步骤

1. 安装后端依赖：
```bash
cd backend
npm install
npm run build
```

2. 安装前端依赖并构建：
```bash
cd ../frontend
npm install
npm run build
```

3. 复制前端构建产物：
```bash
# Windows
mkdir ..\backend\frontend
Copy-Item -Recurse -Force build\* ..\backend\frontend\

# Linux/Mac
mkdir -p ../backend/frontend
cp -r build/* ../backend/frontend/
```

4. 启动服务器：
```bash
cd ../backend
npm start
```

5. 访问应用：打开浏览器访问 `http://localhost:3001`

### 开发模式

后端开发：
```bash
cd backend
npm run dev
```

前端开发：
```bash
cd frontend
npm start
```

## 项目结构

```
GanttChart/
├── backend/                # 后端代码
│   ├── src/
│   │   ├── routes/         # API 路由
│   │   ├── database.ts     # 数据库配置
│   │   ├── index.ts        # 入口文件
│   │   └── types.ts        # 类型定义
│   ├── dist/               # 编译输出
│   ├── frontend/           # 前端构建产物
│   └── data/               # SQLite 数据库文件
├── frontend/               # 前端代码
│   ├── src/
│   │   ├── components/     # React 组件
│   │   ├── App.tsx         # 主应用
│   │   ├── api.ts          # API 调用
│   │   └── types.ts        # 类型定义
│   └── public/
├── Dockerfile              # Docker 构建文件
├── docker-compose.yml      # Docker Compose 配置
└── README.md
```

## API 接口

### 项目管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/projects | 获取所有项目 |
| GET | /api/projects/:id | 获取单个项目 |
| POST | /api/projects | 创建项目 |
| PUT | /api/projects/:id | 更新项目 |
| DELETE | /api/projects/:id | 删除项目 |

### 任务管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/tasks/project/:projectId | 获取项目的所有任务 |
| GET | /api/tasks/:id | 获取单个任务 |
| POST | /api/tasks | 创建任务 |
| PUT | /api/tasks/:id | 更新任务 |
| DELETE | /api/tasks/:id | 删除任务 |

## 环境变量

| 变量名 | 默认值 | 描述 |
|--------|--------|------|
| PORT | 3001 | 服务端口 |
| NODE_ENV | development | 运行环境 |
| DB_PATH | ./data/gantt.db | 数据库文件路径 |

## 数据备份

数据库文件位于 `./data/gantt.db`，备份只需复制该文件即可。

## License

MIT
