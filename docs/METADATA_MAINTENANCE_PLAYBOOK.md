# 元数据维护手册

## 1. 维护范围

这份手册只覆盖动漫元数据批量维护，不覆盖用户账号、一次性数据修复或数据库结构迁移。

当前重点字段：

- `premiereDate`
- `score`
- `totalEpisodes`
- `summary`
- `tags`
- `cast`
- `castAliases`
- `isFinished`

约束：

- 运行时共享提示词在 `lib/metadata/ai-metadata-source.js`，不要为了批处理任务去修改它。
- 高风险字段优先拆成专用脚本，避免继续走“大一统补全脚本 + 通用 AI prompt”模式。
- 写库前必须先跑 dry-run，并保留审计日志。
- `start_date` / `end_date` 继续视为人工维护字段，不纳入自动补全。

## 2. scripts/maintenance 盘点

### package.json 当前直接引用

- `dev:guard` -> `scripts/maintenance/dev_guard.js`
- `test:smoke:api` -> `scripts/maintenance/smoke_api_health.js`
- `db:apply-sql` -> `scripts/maintenance/apply_sql_files.js`
- `db:init-with-anime-data` -> `scripts/maintenance/apply_sql_files.js`
- `db:export-anime-seed` -> `scripts/maintenance/export_anime_seed.js`
- `anime:backfill-metadata` -> `scripts/maintenance/backfill_anime_metadata.js`
- `anime:backfill-metadata:write` -> `scripts/maintenance/backfill_anime_metadata.js --write`
- `anime:backfill-premiere-date` -> `scripts/maintenance/backfill_premiere_date.js`
- `anime:backfill-premiere-date:write` -> `scripts/maintenance/backfill_premiere_date.js --write`
- `anime:backfill-cast` -> `scripts/maintenance/backfill_anime_cast.js`
- `anime:backfill-cast:write` -> `scripts/maintenance/backfill_anime_cast.js --write`

### 分类结论

| 脚本 | 分类 | package.json 引用 | 结论 |
| --- | --- | --- | --- |
| `apply_sql_files.js` | 保留 | 有 | 通用 SQL 执行器，仍是初始化和导入基础设施。 |
| `backfill_anime_metadata.js` | 保留 | 有 | 现有多字段补全入口，适合低风险字段批补。 |
| `backfill_premiere_date.js` | 保留 | 有 | 新增专用脚本，专门治理 `premiereDate`。 |
| `backfill_anime_cast.js` | 保留 | 有 | `cast` / `castAliases` 仍需要独立脚本处理。 |
| `report_anime_metadata_status.js` | 保留 | 无 | 只读审计脚本，适合作为写前/写后核验工具。 |
| `export_anime_seed.js` | 保留 | 有 | 数据回写到种子文件仍依赖它。 |
| `run_migrations.js` | 保留 | 无 | 结构变更仍需要，但建议后续再决定是否补 npm script。 |
| `smoke_api_health.js` | 保留 | 有 | 只读健康检查，风险低。 |
| `dev_guard.js` | 保留 | 有 | 开发环境护栏脚本，和元数据维护无冲突。 |
| `backup_db.js` | 保留 | 无 | 备份能力仍有价值，但命令行暴露密码的问题需要单独治理。 |
| `mark_all_completed.js` | 归档 | 无 | 一次性状态修复脚本，保留历史价值，不应继续作为日常维护工具。 |
| `refresh_anime_metadata.js` | 删除 | 无 | 旧版 AI 全量刷新脚本，硬编码数据库凭据，且已被更安全的回填路径取代。 |
| `create_users_table.js` | 删除 | 无 | 一次性建表脚本，硬编码数据库凭据，已经被迁移 SQL 取代。 |
| `fix_anime_progress.js` | 删除 | 无 | 一次性修复脚本，硬编码数据库凭据，且没有 dry-run。 |
| `insert_anime_batch.js` | 删除 | 无 | 硬编码数据和数据库凭据，只适合历史一次性导入。 |

说明：

- 这里的“归档 / 删除”是维护结论，不代表本次已经自动移动或删除文件。
- 真正执行删除前，先确认没有外部文档、个人命令历史或 CI 仍在调用这些文件。

## 3. 批量补字段标准流程

### 3.1 写库前

1. 先明确字段范围。高风险字段一律拆成专用脚本，不和 `summary`、`tags` 之类字段混跑。
2. 先备份，再做批量动作。当前和 `premiereDate` 纠偏直接相关的备份是 `backups/backup-premiere-reset-2026-03-18T16-02-57.sql`。
3. 先跑状态审计，确认当前空值量和异常样本，再决定是“只补空值”还是“带 `--force` 的定点重刷”。
4. 先选一小批 `--ids` 或 `--limit` 做 dry-run，不直接全量写。
5. 审查审计日志，确认来源、候选值、跳过原因和异常样本。

### 3.2 写库时

1. 默认只补空值。
2. 只有在已有字段被确认不可靠时，才允许 `--force`，并且优先配合 `--ids` 或小批量 `--limit`。
3. 写库必须保留审计文件，至少包含：旧值、候选值、最终来源、AI 置信度、跳过原因、错误信息。
4. 对 `premiereDate` 专用脚本，审计文件还要能看出是 `provider` 还是 `ai`，以及 provider 具体来自哪个站点和查询词。
5. 外部源请求要保留 `--delay`，避免把 provider 和 AI 压垮。

### 3.3 写库后

1. 再跑一次状态审计，检查空值量是否下降、是否引入异常未来日期。
2. 抽样打开详情页确认展示层没有出现日期格式问题。
3. 如果结果可信，再考虑执行 `npm run db:export-anime-seed` 把稳定结果导回种子文件。

## 4. 字段策略

### provider-first

这些字段优先走 Bangumi / Jikan 等 provider，AI 只做补位或校验性兜底：

- `originalTitle`
- `coverUrl`
- `score`
- `totalEpisodes`
- `premiereDate`
- `cast`
- `castAliases`
- `isFinished`

策略要求：

- `score` 不接受 AI 生成值。
- `premiereDate` 只能走专用脚本，不再混在通用多字段 prompt 里处理。
- `castAliases` 是增量字段，允许在不覆盖已有值的前提下扩充别名集合。

### ai-first

这些字段允许 AI 作为首选来源，但仍要通过字段级规范清洗：

- `summary`
- `tags`
- `durationMinutes`

策略要求：

- `summary` 必须是可读中文文本，不接受“未知”“无法确定”一类占位内容。
- `tags` 只保留有限、去重后的中文标签。
- `durationMinutes` 只接受正整数。

## 5. premiereDate 专项策略

### 为什么单独拆脚本

`premiereDate` 已经发生过一次批量清空和回填，且结果不可靠。这个字段又会直接影响排序、时间线和季番判断，所以需要独立治理，不再复用共享通用 prompt。

### 新脚本

- 文件：`scripts/maintenance/backfill_premiere_date.js`
- npm 入口：`npm run anime:backfill-premiere-date`
- 默认模式：dry-run
- 输出位置：`logs/maintenance/premiere-date/`

### 规则

1. 固定执行顺序是 provider first，AI fallback。
2. provider 链路优先用 Bangumi 命中作品本身；Jikan 只作为补位，并尽量基于 Bangumi 给出的原名去搜，避免直接拿中文混合标题做高风险模糊匹配。
3. AI 只能返回两项：`premiereDate` 和 `confidence`。
4. AI 只在 provider 没给出可接受日期时才会出场。
5. AI prompt 必须强调“是动画，不是漫画/轻小说/原作连载时间”。
6. 已有观看行为的条目，如果候选首播日期落在今天之后，直接判为可疑并跳过。
7. 默认只补空值；纠偏旧值时再显式加 `--force`。

### 推荐命令

```bash
# 先看前 20 条候选，不写库
npm run anime:backfill-premiere-date -- --limit=20

# 小批量写入，只补空值
npm run anime:backfill-premiere-date:write -- --limit=20 --delay=1200

# 对已知不可靠条目定点重刷
node scripts/maintenance/backfill_premiere_date.js --write --force --ids=12,34,56 --min-confidence=0.8

# 禁用 AI，只看 provider 结果
node scripts/maintenance/backfill_premiere_date.js --limit=30 --no-ai
```

## 6. 后续重构顺序

建议按下面的顺序推进，而不是继续直接堆新脚本：

1. 先把“删除”类脚本确认无外部依赖后清理掉。
2. 把“归档”类脚本移动到单独归档目录，并补一句历史用途说明。
3. 再考虑是否给 `report_anime_metadata_status.js` 和 `run_migrations.js` 补 npm script。
4. 最后再决定是否把专用脚本抽成 `scripts/maintenance/lib/` 级别的共享工具层。