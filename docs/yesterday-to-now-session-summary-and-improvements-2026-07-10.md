# 昨天到现在：PPT Master 产品化会话总结与改进存档

> **归档范围：** 本文汇总本轮可恢复的会话记录、Kanban 历史、Git 提交、代码与测试实证；时间覆盖 2026-07-09 至 2026-07-10 的 PPT Master 产品化推进。
>
> **归档原则：** 只将实际代码、运行命令、测试或持久化 board/git 状态支持的内容写为事实。会话被压缩或中断时，以当前仓库与 Kanban 的 live state 为准；不会将计划、mock、占位 UI 或代理自述当作已交付。
>
> **边界：** 本文是工程会话档案，不包含任何 token、cookie、Authorization、密钥或连接串；全部按 `[REDACTED]` 处理。

---

## 1. 执行摘要

昨天到现在的主线是把 PPT Master 从“产品化设计/投影与测试骨架”推进为一个受真实工作区、真实 HTTP 请求和真实状态门禁约束的 **Project Workbench**，并同时收口类型质量、文档口径及 Kanban 控制面。

截至本归档截点，已可确认的结果是：

1. **PPT Master 流程没有被替换。** 产品化层仍围绕既定主流程：
   `源材料导入 → 八项确认 → Strategist 验证 / spec lock → generation → preview → revision/resume → export → delivery`。
2. **Workbench 已跨过纯文本/纯 mock 表面。** 已有真实项目投影、确认项提交、HTTP route、Node loopback server adapter、从工作区导出的 preview/export artifact 证据，以及针对错误和未知项目的真实状态码处理。
3. **全仓 TypeScript gate 已被收口。** 提交 `4489788` 后，`npx tsc -p tsconfig.json --noEmit` 为 exit 0；该调整同时保持主线 runtime 测试绿色。
4. **产品化主线已反复通过。** `npm run productization:mainline` 当前通过；其覆盖 generation/preview/export bridge、workbench projection、confirmation 提交、HTTP route、Node server、timeline focus 等 runtime test surface。
5. **流程文档已按真实证据重写。** 状态文档、中英文状态文档及 code audit 已明确区分“已运行验证”与“尚未实现/不应夸大”的边界。
6. **Kanban 自动化没有被仓促恢复。** root tracker 的反向入链与错误 claim/reclaim 反复出现；受限 guard 已加入 root invariant 检查，旧的泛 agent cron 仍保持 paused。

当前不应误读为“产品化已全部完成”或“自动化已经恢复”。最近的 UI slice 仍处于实施/测试链中，且 Kanban root 仍可能被并行 dispatcher 回写反向链接，需先维持人工受控推进。

---

## 2. 产品与架构口径：本轮确认的长期决定

### 2.1 PPT Master 是 agent-native 内核，产品可以不是聊天 UI

会话中明确了一个关键架构判断：PPT Master 的多轮确认、上下文推进、spec 演进和分页执行依赖内部 agent orchestration；因此当前不能简单去 agent 化。

推荐并持续采用的分层是：

```text
Product Workbench
  └─ Project / confirmation / preview / export state
       └─ Agent orchestration adapter
            └─ PPT Master Strategist → Image Generator → Executor pipeline
```

含义：

- 用户侧可以是结构化工作台、确认页、预览和导出页；
- 系统内部保留 agent runtime 来驱动 PPT Master；
- 产品化层负责把 agent 的阶段、工件、确认门禁和可恢复状态投影成稳定契约；
- 不把产品锁死成聊天 UI，也不虚构一个脱离 PPT Master 的平行流程。

### 2.2 不允许绕过的流程门禁

本轮文档和实现均持续遵守：

1. source intake 必须先于确认与生成；
2. 八项确认锁定后，才允许 Strategist 验证与 `spec_ready`；
3. generation 必须由真实 Strategist/spec 结果解锁；
4. preview/export 来自工作区及 runtime artifact，而非前端伪造 URL；
5. revision/resume 必须保留与当前 run / checkpoint 的连续性；
6. 可恢复失败、终态失败和阻塞状态不能被 UI 隐藏成“可继续”。

---

## 3. 昨天到现在的工程推进

### 3.1 设计系统恢复与审计基础

- 用户提供的 `DESIGN.md` 已被作为项目设计源恢复；
- `token.json` 已重新导出并恢复；
- 设计规范经 `@google/design.md` lint 验证；
- 该设计资产被保留为规范和导出物，不被伪称为已接入完整前端主题系统。

这一阶段的改进是：对“已有 DESIGN/token 文件”与“真实 UI 已消费 token”严格区分。产品化早期主要是 view model / renderer / runtime test 层，不能因为有 token 文件就宣称已完成完整视觉系统接入。

### 3.2 Workbench 从投影到可请求的 runtime 边界

本轮推进过的关键交付面包括：

- `project-workbench-page`：把项目投影成可渲染页面；
- `render-project-workbench-shell`：把 confirmation、timeline、preview、delivery、next actions 等投影为 workbench shell；
- `project-workbench-http-route`：处理真实 GET/POST 入口、project id 编解码、未知项目、错误输入、方法约束；
- `project-workbench-node-server`：用最小 Node `http.createServer` adapter 将 loopback 请求交给既有 HTTP route，并保留真实 status/header/body；
- confirmation submission：UI / POST / 后端 action / fresh GET 链路被持续对齐。

这不是“做一个看上去像 workbench 的 HTML”。本轮专门加入或复核了：

- POST malformed body → 400；
- 未知项目 → 404；
- 非法 HTTP method → 405 + `Allow`；
- route 不拥有的路径 → 404；
- confirmation 成功提交后以 fresh GET 读取更新后的投影；
- error UI 不将失败伪装为成功；
- runtime workspace 的 preview / export 交付物保持可追踪 provenance。

### 3.3 类型质量收口

类型错误一度是主要真实 blocker。过程上遵守了“先恢复 runtime / focused tests，再以小批类型修复收口”的策略，而不是在整个仓库做无关重构。

最终形成的关键提交：

```text
4489788 fix(productization): make workbench contracts type-safe
```

收口点包括：

- `ProjectStatus` / `failed_terminal` 的一致类型契约；
- confirmation submission 的 payload / `confirmationSetId` 对齐；
- preview/export / artifact summary / workbench shell 的投影类型；
- generation action、schema、view service、view models 与 fixtures 的局部一致性；
- TypeScript resolver / Node typings 的最小配置补齐。

实测结果：

```text
npx tsc -p tsconfig.json --noEmit
→ exit 0
```

且后续 `npm run productization:mainline` 继续通过，说明类型收口没有以破坏 runtime 行为为代价。

### 3.4 官方状态与审计文档对齐

本轮曾发现“代码已经绿色、旧审计/状态文档却仍表达旧阶段结论”的风险。为避免将旧 blocker 当作当前事实，已完成：

- `docs/productization-current-status.md`：更新为 runtime-backed workbench 的真实状态；
- `docs/zh/productization-current-status.md`：同步中文口径；
- `docs/productization-ppt-master-code-audit-2026-07-10.md`：加上 point-in-time / remediation 说明，防止旧审计被误读为当前失败状态；
- `productization/README.md`：作为流程和边界说明的持续参考。

状态文档明确保留的限制：

- 不把 runtime-backed workbench 说成完整商业产品；
- 不把 mainline green 说成自动化控制面已恢复；
- 不把未实现的实际 browser deployment / full production UI 当作已完成；
- 明确下一步应继续验证 Strategist 产物的 failed / pending / planned / stale / superseded / cross-run 不能错误解锁 generation。

### 3.5 Kanban 控制面问题与修复

这一部分是本轮最需要保留的经验：**root 主卡不能被当作可执行工作卡。**

观察到的异常：

- root `t_a4281740` 曾被错误 claim，残留已死亡 worker PID；
- root 多次出现 `child → root` 的反向入链；
- 并行 cron / generic dispatcher 会尝试对 root claim、reclaim、decompose 或继续拆卡；
- 因此在代码绿的同时，看板自动化仍不安全。

已采取的修复：

- root 固化为 umbrella tracker / comment-only 语义；
- 对自动续跑 runner 加入 root invariant：
  - 允许 `todo` / `ready`；
  - tracker 允许 `blocked + needs_input`；
  - 必须无 lock、无 worker PID、无 run；
  - 必须 `incoming=0`；
- 在 autoclose 前和 spawn successor 前双重检查 invariant；
- runner / wrapper 去除失效 `/root/...` 硬编码，改用当前 `/home/ubuntu/...` 环境或可覆写环境变量；
- 固定使用 `/home/ubuntu/.local/bin/hermes`；
- 为 root invariant 添加专门测试：
  `productization/kanban/tests/pptmaster_autocontinue.test.py`；
- 提交：

```text
62717c4 fix(kanban): guard PPT Master root invariant
```

已做过受限 dry-run；guard 在 root 不合法时静默拒绝推进，不会触碰 root。

但后续仍观测到并行 dispatcher 回写新的 `child → root` link。因此，**当前结论仍是：人工 lane 可推进；旧的泛 agent cron 必须保持 paused。**

---

## 4. 本轮已验证的检查面

以下均为真实命令/测试层面的证据，不是人工目测：

```text
npx tsc -p tsconfig.json --noEmit
npm run productization:mainline
productization/tests/*.test.ts
```

`productization:mainline` 包含的 runtime surface 包括：

- generation runtime bridge；
- preview runtime bridge；
- export runtime bridge；
- preview/export artifact richness；
- phase-runner preview；
- project view / workflow local phases；
- revision/export、recoverable failure、resume continuity；
- shell projection / checkpoint view；
- workbench UI / confirmation UI / confirmation submit error UI；
- workbench confirmation integration；
- page renderer / artifact actions；
- app shell render；
- HTTP route；
- Node server loopback；
- next action UI / primary timeline focus。

本归档截点的 live verification 仍显示：

```text
TypeScript: exit 0
productization:mainline: exit 0
```

---

## 5. 当前未收口项（必须如实保留）

### 5.1 当前 Preview page focus slice 仍未完成

最新独立 lane 的规划已完成，选择的最小下一切片是：

> 在已有 Preview assets 面板里，用当前 `PreviewViewModel.items` 的真实 page 投影实现 page selector 与 focused-page metadata；保留 live preview 链接；不编造单页 URL、iframe 或图片预览。

当前状态：

```text
规划卡：done
实施卡：blocked / needs_input（此前曾 running）
测试卡：todo
```

其相关工作树改动仍存在，尚不能宣称为已经提交或完整验收的交付。

### 5.2 Kanban root 仍可能被其他 dispatcher 污染

归档前 live board 仍有 3 条对 root 的反向入链。根因不是 guard 本身；guard 正确拒绝推进，而是有其它 active worker / dispatcher 继续按错误方向写 link。

因此：

- 不能 unpause 旧两个泛 agent cron；
- 不能把 root 当作普通 lane；
- 每次继续前必须先查 `incoming=0`；
- 应仅用人工受控 lane 或单一受限 guard 推进。

### 5.3 浏览器视觉验收仍有环境边界

曾有真实 HTTP / loopback 级验证；但历史 browser 工具对本地 loopback URL 有访问保护，不能把受限环境中的 HTML contract 验证误报为完整视觉 E2E。

另有两次临时 E2E server 被人工清理而产生 `SIGTERM`：

```text
proc_d6ce41b075a7
proc_799b91b1ea9d
```

它们属于临时 server 清理，不是应用 crash。

---

## 6. 会话执行中发现的改进点

### 6.1 先区分“运行时完成”与“控制面完成”

本轮最大教训：

```text
代码 / tests / mainline green
≠
Kanban 自动化安全恢复
```

以后状态汇报固定分三层：

1. 代码与类型 gate；
2. runtime / HTTP / artifact 行为；
3. board / cron / dispatcher 控制面。

任何一层未通过，都不能用“全部完成”概括。

### 6.2 强制 root tracker-only 约束应写入执行工具，而不只写在提示词

仅在 cron prompt 中写“不要碰 root”不够。正确做法是把 invariant 编码入 guard：

- root 状态、lock、worker PID、run id、incoming links 必须被程序化检查；
- 每次 side effect 前重新检查；
- 不满足即 no-op / silent exit；
- 用测试覆盖该拒绝行为。

### 6.3 避免并行泛 agent 争夺同一看板树

两个并行 cron 同时具备 claim/promote/reclaim/decompose 能力，会导致：

- stale lock；
- root 被错误 claim；
- 反向 link；
- 重复 successor；
- 旧卡被重新激活。

改进原则：一个产品主线同一时间只允许一个受限自动化写 lane 状态；其它 job 只能验证和评论，不能管理 root 或建图。

### 6.4 测试门禁必须从 fixture 契约向真实 runtime workspace 迁移

已有经验表明，单靠 view model fixture 很容易得到“表面绿”。后续优先级应是：

```text
runtime workspace
→ phase runner / adapter
→ project view
→ route
→ server / browser boundary
```

每一层都要保持 provenance，避免 UI 自己创造状态或 URL。

### 6.5 文档作为状态面必须与代码同步提交

旧审计/状态文档如果不标注时间边界，会在代码修复后继续制造假 blocker。改进规则：

- 每次关键 runtime / TS gate 改变后，同一批更新 current status；
- 旧 audit 必须保留历史价值，但增加 point-in-time 说明；
- 中英文状态文档一次同步；
- 文档中列出的 “pass” 必须能给出命令、日志或测试来源。

### 6.6 不把“干净工作树”与“无关删除”混为一谈

会话中曾清理过过时 session/triage 文档。今后应先将其内容归档到本类总结文档，再删除；避免为了视觉干净而丢失决策与验证轨迹。

---

## 7. 建议的后续恢复顺序

1. **保留旧泛 agent cron 为 paused。** 不恢复 `cfb3f20414d8` 和 `facaad7b5842`。
2. **处理当前实施 lane。** 先审查/收口 Preview page focus 的工作树，补它对应的 focused test，再跑完整 mainline。
3. **在每次 lane 转换前修 root link。** 只删除 `child → root` 错误边，不建立新的 root 执行依赖；root 最终应保持 `incoming=0`。
4. **继续 PPT Master 门禁负向测试。** 优先验证 failed/pending/planned/stale/superseded/cross-run Strategist 结果不能解锁 `spec_ready`、`start_generation`、preview/export。
5. **只在连续多次 guard dry-run 均保持 root clean 后，讨论自动化恢复。** 恢复形态应是单一 `no_agent` guard，只自动 close 合格 review lane 和 seed 唯一 successor，不操作 root。
6. **最终 release 前补真实外部浏览器/部署验收。** loopback HTML/HTTP 合同不能替代一个可访问环境上的真实交互验证。

---

## 8. 归档时的当前快照

- 仓库：`/home/ubuntu/projects/ppt-master-upstream`
- 分支：`chore/productization-worktree-cleanup`
- 相对 `origin/main`：本次归档时本地有领先提交，未见落后计数。
- 已形成的关键提交：

```text
1a3a4b4 feat(productization): persist confirmation workbench flow
190a619 docs(productization): record ppt master compliance audit
4489788 fix(productization): make workbench contracts type-safe
b5e7b91 docs(productization): align live workflow status
62717c4 fix(kanban): guard PPT Master root invariant
```

- 工作树：仍存在当前 Preview page focus / workbench 相关未提交改动；本归档不将其标记为完成。
- Kanban：root tracker 当前不应自动恢复；反向入链需要在下一次人工推进前复查并清理。

---

## 9. 一句话结论

昨天到现在，PPT Master 产品化已经从“有架构和测试骨架”推进到“有真实 runtime-backed Workbench、HTTP / Node server 边界、确认提交链路、TypeScript 质量 gate 和状态文档收口”的阶段；但 **当前仍应以人工受控 lane 继续，不能因为主线绿就恢复旧的泛 agent Kanban 自动化。**
