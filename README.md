# Anime Track

一个基于 Next.js 14 和 MySQL 的纯动漫记录工具，专注于番剧条目管理、观看进度、观看历史和时间线展示。

## 功能范围

- 番剧条目新增、编辑、删除
- 在看、已看完、弃坑、计划看等状态管理
- 观看历史记录与时间线回顾
- Bangumi / Jikan 元数据补全
- 基于 NextAuth 的本地登录与角色控制

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 创建数据库并导入结构

```sql
CREATE DATABASE anime_track;
```

然后执行 [database/schema.sql](database/schema.sql) 或 [database/reset_all.sql](database/reset_all.sql)。

3. 配置环境变量

复制 [.env.example](.env.example) 为 `.env.local`，至少填入：

```bash
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=你的密码
MYSQL_DATABASE=anime_track
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret
```

如果你希望自动补全番剧资料，还可以配置：

```bash
DEEPSEEK_API_KEY=your_api_key
```

如果你要把仓库中的共享动漫数据一并恢复到新服务器，保持数据库连接配置正确后再执行：

```bash
npm run db:init-with-anime-data
```

这会依次执行 [database/schema.sql](database/schema.sql) 和 `database/seed_anime_data.sql`，导入当前仓库内保存的动漫条目与观看历史。

4. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000`。

如果你希望开发环境在样式链路异常时自动重启（例如 `_next/static/css/app/layout.css` 404 导致页面无样式），可以使用守护模式：

```bash
npm run dev:guard
```

可选环境变量：

- `DEV_GUARD_PORT`：监听端口，默认 `38291`
- `DEV_GUARD_HOST`：监听地址，默认 `0.0.0.0`
- `DEV_GUARD_PAGE`：健康检查页面，默认 `/login`
- `DEV_GUARD_INTERVAL_MS`：检查间隔，默认 `15000`
- `DEV_GUARD_FAILURE_THRESHOLD`：连续失败几次后重启，默认 `2`

## 主要目录

- [app](app): 页面和 API 路由
- [components](components): 页面组件与追番 UI
- [hooks](hooks): 首页与历史数据 hooks
- [lib](lib): 数据库、鉴权、番剧数据处理逻辑
- [database](database): 数据库结构与迁移脚本

## 技术栈

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- MySQL
- NextAuth.js

## 当前定位

这个仓库现在只保留动漫记录相关能力。原先的生活管理、小工具、财务、路线图、邮件等功能已经移除。

## 数据同步

- [database/seed_anime_data.sql](database/seed_anime_data.sql) 保存当前共享的动漫条目和观看历史。
- 这份种子数据默认不包含 `users` 表，避免把账号密码哈希一起提交。
- 当本地数据库里的动漫数据更新后，可以执行 `npm run db:export-anime-seed` 重新生成种子文件。

## 批量元数据补全

- 新增脚本 [scripts/maintenance/backfill_anime_metadata.js](scripts/maintenance/backfill_anime_metadata.js)，默认 `dry-run`，只补空字段，不覆盖已有手工内容。
- 补全顺序：先走 Bangumi / Jikan，再用 DeepSeek 做兜底（未配置 `DEEPSEEK_API_KEY` 时会自动跳过 AI）。
- 默认不会修改 `start_date` / `end_date`，适合把“观看时间”继续当作手工记录。

常用命令：

```bash
# 预览将要更新的字段（不写库）
npm run anime:backfill-metadata

# 写入数据库
npm run anime:backfill-metadata:write

# 只补评分、首播、原作并关闭 AI
node scripts/maintenance/backfill_anime_metadata.js --write --no-ai --fields=score,premiereDate,originalWork

# 仅处理前 30 条，控制速率
node scripts/maintenance/backfill_anime_metadata.js --write --limit=30 --delay=1200
```

评分来源说明：

- 当前 `score` 字段优先来自 Jikan 的 MyAnimeList 评分（`anime.score`），不是 AI 生成值。
- 如果你在表单里手工填写评分，脚本在非 `--force` 模式下不会覆盖。
