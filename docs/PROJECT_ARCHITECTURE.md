# Anime Track 架构说明

这个项目现在是一套纯动漫记录系统，核心只围绕番剧条目、观看进度、观看历史和用户鉴权展开。

## 目录分工

- [app](app): 页面与 API 路由
- [components](components): 追番总览、番剧列表、详情展示等界面组件
- [hooks](hooks): 动漫数据与观看历史的数据获取逻辑
- [lib](lib): 数据库访问、鉴权、番剧数据处理、外部元数据抓取
- [database](database): 当前数据库结构和迁移脚本

## 当前核心数据表

1. users
负责本地登录、注册和角色权限。

2. anime
存储番剧主数据，包括标题、状态、进度、评分、简介、标签、封面、首播和声优信息等。

3. watch_history
按集记录观看历史，通过 animeId 关联到 anime。

## 核心数据流

1. 用户在 [components/anime/AnimeCard.tsx](components/anime/AnimeCard.tsx) 或表单中操作番剧数据。
2. 请求进入 [app/api/anime](app/api/anime) 下的路由。
3. 路由调用 [lib/anime.ts](lib/anime.ts) 读写数据库。
4. 当进度增加时，同时写入 [watch_history](database/schema.sql) 对应记录。
5. 首页和时间线页面通过 [app/api/history/route.ts](app/api/history/route.ts) 读取观看历史并展示统计结果。

## 保留的外部能力

- NextAuth 用于本地鉴权
- Bangumi / Jikan 用于动漫元数据补全
- DeepSeek 可选，用于标题、简介、标签、声优别名的补全

## 已移除的模块方向

- 财务与消费系统
- 购物 / 会员 / 库存
- 漫画记录
- 邮件挂钩
- 小工具挂件
- 路线图与聊天会话
- 系统管理面板
