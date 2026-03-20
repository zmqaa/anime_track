# Anime Track

一个基于 Next.js 14 和 MySQL 的个人动漫追番记录工具。管理番剧条目、追踪观看进度、记录观看历史，并通过仪表盘和时间线直观展示追番数据。

## 功能概览

- **番剧管理**：新增、编辑、删除番剧条目，支持封面、简介、声优、标签等完整元数据
- **观看状态**：追番中 / 已看完 / 已弃坑 / 计划看，配合集数进度跟踪
- **快速记录**：在列表页通过顶部输入条快速录入观看记录，支持 AI 智能解析标题
- **观看历史**：逐集记录 + 批量录入，按月时间线回顾
- **仪表盘**：追番统计、状态分布饼图、观看连续天数、每周速度、活动流、标签热度
- **季度视图**：按首播日期自动归类到冬/春/夏/秋季度
- **图鉴视图**：声优排行、评分分布、集数长度分析、元数据完整度
- **元数据补全**：从 Bangumi / Jikan 拉取，DeepSeek AI 做兜底
- **鉴权**：基于 NextAuth 的本地登录，支持管理员和访客角色

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 14 + React 18 |
| 语言 | TypeScript |
| 样式 | Tailwind CSS |
| 动画 | Framer Motion |
| 图标 | Heroicons |
| 数据库 | MySQL (mysql2/promise) |
| 鉴权 | NextAuth.js (Credentials + Guest) |
| AI | DeepSeek API (可选) |
| 外部数据 | Bangumi API、Jikan API |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 创建数据库

```sql
CREATE DATABASE anime_track CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

然后执行 `database/schema.sql` 建表。

### 3. 配置环境变量

复制 `.env.example` 为 `.env.local`，至少填入：

```bash
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=你的密码
MYSQL_DATABASE=anime_track
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret
```

可选（元数据 AI 补全）：

```bash
DEEPSEEK_API_KEY=your_api_key
```

### 4. 恢复数据（可选）

如果要把仓库里的共享数据一起导入：

```bash
npm run db:init-with-anime-data
```

这会依次执行 `schema.sql` → `seed_anime_data.sql`，导入仓库保存的全部番剧条目和观看历史。

### 5. 启动

```bash
npm run dev          # 开发模式
npm run build        # 构建生产版本
npm run start        # 启动生产服务器
```

访问 `http://localhost:3000`。

## 页面路由

| 路径 | 说明 |
|---|---|
| `/` | 仪表盘首页：统计面板、状态分布、活动流、追番连续天数 |
| `/anime` | 番剧列表：搜索、筛选、排序、分页、快速录入 |
| `/anime/[id]` | 番剧详情：编辑所有字段、AI 补全、删除 |
| `/anime/atlas` | 图鉴：评分 Top、声优排行、集数分析、元数据完整度 |
| `/anime/seasons` | 季度视图：按首播季度分组展示 |
| `/anime/timeline` | 时间线：按月查看观看历史 |
| `/login` | 登录（支持访客模式） |
| `/register` | 注册 |

## API 路由

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/anime` | 番剧列表（可按状态筛选） |
| POST | `/api/anime` | 新增番剧（管理员，自动 AI 补全） |
| GET | `/api/anime/[id]` | 番剧详情 |
| PATCH | `/api/anime/[id]` | 更新番剧（管理员） |
| DELETE | `/api/anime/[id]` | 删除番剧及关联历史（管理员） |
| POST | `/api/anime/[id]/enrich` | AI 元数据补全 |
| POST | `/api/anime/[id]/refresh` | 刷新外部元数据 |
| POST | `/api/anime/quick-record` | 快速录入（AI 智能解析） |
| POST | `/api/anime/export` | 导出数据 |
| POST | `/api/anime/import` | 导入数据 |
| GET | `/api/history` | 观看历史（支持 `?days=N&limit=N`） |
| POST | `/api/auth/register` | 注册用户 |

## 项目结构

```
app/                    页面 & API 路由
  anime/                番剧列表、详情、图鉴、季度、时间线
  api/                  anime / history / auth 三类接口
  login/ register/      登录注册页
components/
  anime/                AnimeCard, AnimeGrid, AnimeFilterBar, AnimeForm, AnimeHeader
  dashboard/            PieChart, DonutChart, ActivityFeed, AdvancedActivityStats
  shared/               LazyRender 等通用组件
  Dashboard.tsx         首页仪表盘
  SidebarLayout.tsx     侧边栏导航
hooks/
  useAnimeData.ts       番剧列表 + 统计数据
  useHistoryData.ts     观看历史 + 解析
lib/
  db.ts                 MySQL 连接池
  auth.ts               NextAuth 配置
  anime.ts              番剧 CRUD + 标题匹配
  history.ts            观看历史读写
  anime-enrichment.ts   元数据补全（Provider + AI）
  anime-provider.ts     Bangumi / Jikan 接口
  ai.ts                 DeepSeek 集成
  chinese-parser.ts     CJK 文本解析
  metadata/             AI 数据源、Provider 数据源、合并策略
database/
  schema.sql            建表语句
  seed_anime_data.sql   共享数据种子（anime + watch_history）
  migrations/           数据库迁移脚本
scripts/maintenance/    维护脚本（见下方）
docs/                   架构文档、维护手册
backups/                数据库备份文件
```

## 数据库表

| 表名 | 说明 |
|---|---|
| `anime` | 番剧条目：标题、封面、状态、评分、进度、集数、标签、声优、简介、首播日期等 |
| `watch_history` | 观看历史：关联 animeId，逐集记录 watchedAt |
| `users` | 用户表：username、password_hash、role（admin/user） |

## 数据同步与备份

当前的数据同步方式是通过 Git 仓库共享种子文件：

1. 本地数据变更后执行 `npm run db:export-anime-seed`，生成 `database/seed_anime_data.sql`
2. 提交到 Git 仓库
3. 服务器端拉取后执行 `npm run db:init-with-anime-data` 恢复

种子数据包含 `anime` 和 `watch_history` 两张表的全量数据，**不包含** `users` 表（避免密码哈希泄漏）。

> 后续部署到服务器后，数据主要在线上录入，这一流程会弱化。

**完整备份**（包含所有表，基于 mysqldump）：

```bash
node scripts/maintenance/backup_db.js
```

备份文件保存在 `backups/` 目录，自动保留最近 7 份。

**纯数据导出**（SQL INSERT 脚本，不依赖 mysqldump）：

```bash
npm run db:export-anime-seed                                         # 导出到默认路径
node scripts/maintenance/export_anime_seed.js backups/snapshot.sql   # 导出到指定路径
```

## npm 脚本速查

```bash
# 开发
npm run dev                           # 启动开发服务器
npm run dev:guard                     # 带样式守护的开发模式
npm run build                         # 构建
npm run start                         # 生产模式启动
npm run lint                          # ESLint 检查

# 数据库
npm run db:apply-sql                  # 执行指定 SQL 文件
npm run db:init-with-anime-data       # 初始化：schema + 种子数据
npm run db:export-anime-seed          # 导出当前数据为种子文件

# 元数据补全
npm run anime:backfill-metadata       # 预览补全结果（dry-run）
npm run anime:backfill-metadata:write # 写入数据库
npm run anime:backfill-premiere-date  # 首播日期补全（dry-run）
npm run anime:backfill-premiere-date:write
npm run anime:backfill-cast           # 声优信息补全（dry-run）
npm run anime:backfill-cast:write

# 测试
npm run test:smoke:api                # API 冒烟测试
```

## 元数据补全

脚本默认 dry-run，只补空字段，不覆盖手工录入的内容。

**补全策略**：Provider-first（Bangumi → Jikan），AI 兜底（DeepSeek，需配置 `DEEPSEEK_API_KEY`）。

```bash
# 仅补评分、首播、总集数，关闭 AI
node scripts/maintenance/backfill_anime_metadata.js --write --no-ai --fields=score,premiereDate,totalEpisodes

# 限制条数 + 延迟
node scripts/maintenance/backfill_anime_metadata.js --write --limit=30 --delay=1200

# 首播日期单独处理
npm run anime:backfill-premiere-date:write -- --limit=20 --delay=1200

# 指定 ID 强制覆盖
node scripts/maintenance/backfill_premiere_date.js --write --force --ids=12,34,56
```

> 评分来自 Jikan（MAL 评分），非 AI 生成；手工填写的评分在非 `--force` 模式下不会被覆盖。
