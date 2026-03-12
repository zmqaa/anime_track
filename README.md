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
