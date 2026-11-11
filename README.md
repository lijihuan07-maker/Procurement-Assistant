# 询价比价助手

面向海外项目工程采购的 AI 询价比价工具：工程部需求清单 → 澄清问题 → 询价包和询价单 → 询价邮件 → 收集报价 → 比价表 → 定标和历史价。

## 一期功能

| 模块 | 内容 |
| --- | --- |
| 账号与团队 | 公司注册、邮箱密码登录、管理员添加成员，数据按公司隔离 |
| 需求清单与澄清 | 上传 Excel / PDF / 扫描件，AI 提取物资项、判断材料类别，按“材料澄清参数清单”生成待确认问题；可点选或填写答案，导出问题清单 Excel |
| 技术规格书 | 上传带文字的 PDF，按 SECTION 章节号建立索引，AI 根据需求项的规范号查原文回答问题、补充技术要求 |
| 询价包与询价单 | AI 按供应商类型分包，可移动、合并、改名；锁定后生成编号并冻结内容；按公司模板或默认格式导出询价单 Excel |
| 供应商库与推荐 | 导入历史采购记录 Excel，按同类采购次数、报价回复率、评分推荐；定标结果自动写回历史价 |
| 询价邮件 | 按邮件模板为每家供应商生成邮件，一键复制，标记已发送（一期从自己的邮箱发送） |
| 报价与比价 | 上传报价（Excel / PDF / 扫描件 / 图片），AI 对齐询价行、统一不含税价和计价单位；人工修改单价和折算系数并留痕；规则核对 + AI 风险审查；导出带公式的比价表 Excel；整单或分项定标 |

## 部署（Vercel + Neon，免费额度即可起步）

需要准备：GitHub 账号、[Vercel](https://vercel.com) 账号、[Neon](https://neon.tech) 账号、[Anthropic API Key](https://console.anthropic.com)。

1. **代码放到 GitHub**：新建一个私有仓库，把本项目所有文件上传进去。
2. **建数据库**：在 Neon 新建项目，区域选离用户近的（中东用户可选欧洲区域）。复制连接串（`postgresql://...`，选带 `-pooler` 的那个）。
3. **导入到 Vercel**：Vercel → Add New → Project → 选择刚才的 GitHub 仓库。
4. **填环境变量**（Vercel 项目 → Settings → Environment Variables）：
   - `DATABASE_URL` = Neon 连接串
   - `ANTHROPIC_API_KEY` = 你的 API Key
   - 可选 `ANTHROPIC_MODEL`，默认 `claude-sonnet-5-5`
5. **部署**：点 Deploy。首次访问时会自动建表。打开网址 → 注册公司账号即可使用。

以后改了代码，推送到 GitHub，Vercel 会自动重新部署。

### 限制说明

- Vercel 免费版单次请求最长 5 分钟、请求体最大 4.5 MB。程序已经做了处理：报价和清单在浏览器里先读取，扫描件压缩成图片后再发送，规格书分批上传。需求清单特别长（几百项）时，AI 识别可能超时，可以拆成几份。
- 扫描版规格书暂不支持（需要文字版 PDF）。
- 二期：邮箱直连（SMTP 发信、自动收集回信）、推荐当地新供应商、比价表模板映射。

## 本地开发

```bash
npm install
cp .env.example .env.local   # 填 ANTHROPIC_API_KEY；不填 DATABASE_URL 时使用内置数据库（.data 目录）
npm run dev                  # http://localhost:3000
```

修改数据库结构：编辑 `src/db/schema.ts` 后运行 `npm run db:generate`，生成的迁移文件在 `drizzle/`，启动时自动执行。

## 代码结构

```
src/
  app/(auth)/            登录、注册
  app/(app)/projects/    项目列表；项目页（需求与澄清、规格书、询价包）
  app/(app)/packages/    询价单页（询价单、供应商与邮件、报价与比价）
  app/(app)/suppliers/   供应商库与历史采购导入
  app/(app)/settings/    公司设置、询价单模板、邮件模板、成员
  app/api/               接口（全部按公司做权限校验）
  db/                    数据库结构（Drizzle）与连接
  lib/ai.ts, prompts.ts  调用 Claude 和提示词
  lib/checklist.ts       材料澄清参数清单（可持续扩充）
  lib/compare.ts         比价计算与规则核对（前后端共用）
  lib/client/            浏览器端：文件读取、Excel 生成
```
