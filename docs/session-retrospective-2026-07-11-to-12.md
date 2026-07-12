---
title: "PPT Master productization: 2026-07-11 to 2026-07-12 session retrospective and improvement archive"
date: 2026-07-12
scope: "Conversation, Kanban, automation, and engineering-governance retrospective"
status: archived-record
---

# 2026-07-11 to 2026-07-12 会话总结与改进存档

> **用途。** 本文记录 2026-07-11 至 2026-07-12 的 PPT Master productization 相关会话、工程结果、Kanban/自动化治理变化及改进项。它不是生产就绪声明，也不替代 `AGENTS.md`、PPT Master `SKILL.md`、产品化架构文档或 Kanban 中的原始 handoff。
>
> **证据原则。** 仅把已通过工具/命令、Kanban lifecycle 或已落地 Git 记录证实的内容表述为事实；未完成的目标明确标为“进行中”或“未证明”。凭据、token、端点密钥和聊天标识一律不写入本文。

## 一、执行摘要

这段时间完成了两类工作：

1. **工程链路：**完成并落地 Executor SVG authoring → live-preview handoff 的最小修复与独立验证。最终 canonical landing 为：

   ```text
   9d29ab0 fix(productization): gate preview handoff on svg authoring
   ```

2. **治理与自动化链路：**将自动推进从不受控的 legacy continuation 收敛为“**已预建依赖卡自动解锁 + 唯一 guarded dispatcher 自动 dispatch**”。同时发现并修复了 Kanban 中 tracker root 被误当作执行依赖、scope 完成但没有 materialize successor 等实际流程缺口。

当前仍**不应**宣称完整生产服务、完整 Quality Check、post-processing/SVG final 或真实 PPTX export 已实现。当前在跑的是一个受限的 availability implementation card，目标是使 preview/export 可用性只从真实 workspace/run/checkpoint/artifact 证据推导。

## 二、约束与权威来源的最终对齐

本次会话反复澄清了四个系统的职责，今后必须同时满足：

| 系统 | 负责内容 | 不可替代的责任 |
|---|---|---|
| 项目文档 | 产品化范围、状态模型、acceptance、stop rule、四件套治理 | 决定什么是合理的下一产品化增量 |
| `skills/ppt-master/SKILL.md` | 真实 PPT Master 生产顺序、角色、artifact 与质量阶段 | 决定不能跨越的实际生产阶段 |
| Hermes Kanban | 状态、依赖、任务 handoff、执行审计 | 决定已有任务何时可解锁和运行 |
| Cron | 受控唤醒/dispatch | 不定义验收、不创建或猜测后继任务 |

### 项目“四件套”

项目文档中的四件套是：

```text
RTK / codebase / ponytail / agent-skills
```

它们不是 PPT Master 的 Strategist/Image_Generator/Executor/Quality Checker，也不是 `skills/ppt-master/scripts/*` 的代称。

本周期确认的正确用法：

- **RTK**：明确 workflow state、checkpoint、action dispatch、前端状态投影与恢复/拒绝路径；
- **codebase**：先查实际 adapter → orchestrator → service/route/UI → artifact reader 调用链、影响面和测试面；
- **ponytail**：只完成一个相邻、最小可验证切片，排除无关重构；
- **agent-skills**：先用适用的 spec/planning/TDD/review 方法，再把实际使用证据写进 handoff。

历史审计只可靠证明了部分直接使用证据；因此后续不得用“已经使用四件套”作无证断言。另一方面，四件套 evidence 是工程与 review 证据，不应被机械化成缺少任一标签就无法完成有效卡的伪门禁。

## 三、已完成的工程工作

### 3.1 Executor SVG authoring / preview handoff

已完成并落地的最小实现修复，核心链路为：

```text
generation evidence
→ live SVG authoring via POST /api/save-all
→ refreshed generation evidence
→ preview handoff
```

关键结果：

- preview handoff 保持 fail-closed：SVG authoring mutation 失败时不得进入 preview；
- authoring probe 后刷新 generation evidence，checkpoint 同时携带 initial、authoring、refreshed 与 preview evidence；
- 同一 run、同一时间戳的重复 probe 使用 UUID 区分，避免幂等条件导致“看似执行但未真实写入”；
- local orchestration 测试改为依赖受版本控制的 runtime fixture，而不是未追踪的 `projects/*` / `runs/*` 本地状态；
- 边界止于 Executor/live-preview handoff：未进入 `finalize_svg`、post-processing 或 PPTX export。

相应正式链已完成：

```text
t_4892d894  Executor SVG authoring implementation        done
t_3882db64  isolated deterministic verification          done
t_9d3821d8  independent review                            done
```

### 3.2 已执行的验收证据

落地后及隔离验证中，以下命令曾以通过结果记录在对应 handoff/会话中：

```bash
npx tsx productization/tests/workflow-orchestrator-local-phases.test.ts
npx tsx productization/tests/resume-generation-revision-continuity.test.ts
node --import tsx productization/tests/svg-authoring-runtime-bridge.test.ts
node --import tsx productization/tests/phase-runner-preview.test.ts
npm run productization:mainline
npx tsc -p tsconfig.json --noEmit
git diff --check
```

一个重要纠偏：曾被写作 `npm run runtime:svg-authoring-bridge` 的 npm script 实际不存在；正确、可执行的证据是直接运行 `svg-authoring-runtime-bridge.test.ts`。以后 handoff 必须先实际执行命令，再记录命令名和结果。

## 四、自动推进与 Kanban 过程

### 4.1 从 legacy automation 收敛为受控 dispatcher

当前唯一允许自动运行的 PPT dispatcher 为：

```text
77cd12289560
pptmaster-productization-guarded-autocontinue-dispatch
schedule: every 5m
state: enabled/scheduled
```

它的职责仅为：在 repo/root guard 合格时，调用官方 Kanban dispatcher 分发**已有、依赖已满足、可运行**的任务。

以下 legacy/stale PPT automation 继续暂停，不能恢复来绕过 lifecycle 或动态扩卡：

```text
cfb3f20414d8  pptmaster-productization-kanban-autocontinue
facaad7b5842  pptmaster-productization-verify-parallel-lane
b9d7ac1c0ad1  pptmaster-preview-export-proof-worker
652f87610ad4  pptmaster-next-runtime-action-worker
67593d1e3e2f  pptmaster-export-foundation-canonical-autopilot
645ed70cfad6  pptmaster-productization-kanban-reviewer-and-idle-continuation
```

全局：

```text
kanban.auto_decompose: false
```

这是有意保留的治理限制：它禁止系统自动创建未知的全新后继卡；**不会**阻止已预建依赖任务被自动解锁/dispatch。

### 4.2 Worker runtime 调查与止损

本周期发现部分 worker profile 在第一轮工具调用前崩溃或等待，未产生 diff、日志、comment 或 handoff。此类问题不能被解释成代码失败、依赖失败或“再重派一次即可”。

采取的正确止损策略：

1. 用 Hermes 官方 `reclaim` / `block` / `unblock` / `reassign` / `dispatch` lifecycle 处理；
2. 终止孤儿 worker 前先记录 task/run 状态；
3. 不写 SQLite，不让 cron 对同一失联卡无限重试；
4. 对验证卡，在独立 worktree 中实际运行确定性测试，再以真实证据关闭，而不伪造 worker 成功。

已验证 `default` worker 路径能完成隔离 smoke task；当前自动推进沿用该可观测路径。故障 profile 的稳定性仍应作为运行时问题继续观察，而不能宣称已经完全修复。

### 4.3 官方 Kanban lifecycle 的关键纠偏

以下是本周期实际发生并已修正的错误，必须作为长期规则：

| 发现 | 原因 | 改进规则 |
|---|---|---|
| 新 scope 卡存在但没有运行 | `triage` 状态不是可 dispatch 状态 | scope 要先通过官方 `specify` 进入 `todo`；依赖满足后才 `ready` |
| `todo` 卡没有变 `ready` | 将 blocked tracker root 误连为 executable child 的 parent | tracker root 永远不能作为执行卡 parent/dependency |
| scope 完成后没有新卡 | scope 只产出计划，没有在完成前后 materialize successor chain | scope completion 前必须预建 implementation → verification → review 链，或由授权 orchestrator 显式按计划创建并链接 |
| 把“自动开卡”与“自动推进”混淆 | `auto_decompose: false` 被误解为 Kanban 失效 | 区分：依赖自动解锁、ready 自动 dispatch、全新卡自动创建是三种不同能力 |

Tracker root `t_a4281740` 的正确不变式：

```text
blocked / tracker-only / no incoming execution edges / no worker / no PID
```

它可用于记录主线，但不可被 claim、promote、dispatch、reclaim、decompose，也不可成为任何可执行子任务的 gate parent。

## 五、当前正式主线（截至存档时）

上一个 scope：

```text
t_f91ed54b
Plan truthful workspace-derived preview/export availability
done
```

该 scope 在 scratch workspace 中产出 implementation-ready plan，并记录了如下事实：

- preview 必须来自 current-run 的 canonical workspace preview/SVG artifact 与匹配 completed checkpoint；
- export 除同 run 约束外，还必须有 durable、真实的 PPTX artifact 和匹配 completed export checkpoint；
- executor/SVG authoring 不能被表示成 Quality、post-processing 或 export 已完成。

基于该计划，后继链已经在工作开始前创建：

```text
t_a76fb279  Implement truthful workspace-derived preview/export availability contract  running
t_ddaa332a  Verify workspace-derived preview/export availability contract               blocked by implementation
t_b4edb6fb  Review workspace-derived preview/export availability contract               blocked by verification
```

当前 implementation 使用隔离 worktree：

```text
/home/ubuntu/projects/ppt-master-upstream/.worktrees/pptmaster-workspace-availability
```

其范围严格限定为：从真实 current workspace/run/checkpoint/artifact 推导 preview/export availability 与 truthful denial reason。它不实施 Quality Check、`svg_final`、post-processing 或 PPTX exporter。

## 六、后续工作改进清单

### 必须执行

1. **每张 scope 卡完成前检查 successor 链。**
   - 有 implementation、isolated verification、independent review；
   - 每个 successor 都有明确 parent；
   - root 未作为 executable dependency；
   - 每张卡已订阅 Feishu；
   - 只有第一张可被 dispatch。

2. **把官方 lifecycle 作为状态唯一入口。**
   - `create --triage` → `specify` → `todo` → dependency auto-promote `ready` → `dispatch`；
   - 使用 `block` / `unblock` / `reclaim` / `reassign` 管理异常；
   - SQLite 只读审计，绝不直接改状态。

3. **在 handoff 中记录真正运行过的验证。**
   - 命令、exit code、范围、workspace、artifact/checkpoint identity；
   - 不记录不存在的 npm script；
   - 不以 worker 自报代替独立 verification。

4. **把四件套变成可归因的简短证据。**
   - RTK：状态/动作/恢复；
   - codebase：调用链/影响面/测试；
   - ponytail：最小切片与明确排除项；
   - agent-skills：实际加载和执行的方法。

5. **坚持 PPT Master 相邻阶段。**
   - 当前 availability 结束后才评估 Quality Check；
   - Quality Check 之后才评估 post-processing/SVG final；
   - 真实 export artifact 与 gate 未完成前，不出现可下载的 export 叙述或 UI action。

### 应避免

- 不恢复 legacy cron；
- 不让 Cron 动态创建/猜测 successor；
- 不将 tracker root 连到执行依赖图；
- 不并发写 canonical worktree；
- 不把 scratch plan、worker 运行、或 UI 状态当成真实 artifact completion；
- 不在 docs、Kanban comment、日志或聊天中保存 credentials/tokens。

## 七、可复核入口

- 项目入口与 PPT Master workflow：`AGENTS.md`、`skills/ppt-master/SKILL.md`
- 产品化架构：`docs/productization-architecture.md`
- 当前边界与下一增量：`docs/productization-current-status.md`
- 四件套审计：`docs/productization-four-piece-usage-audit.md`
- 自动化 operating state：`docs/productization-automation-operating-state.md`
- 当前 board：`ppt-master-productization-mainline`

## 八、存档结论

本周期的有效进展是：Executor → preview 的最小 fail-closed handoff 已由 canonical commit、独立验证和 review 支撑；自动化已从 legacy 模式收敛为受控 dispatch；下一增量的 scope 已完成，并已有预建 implementation/verification/review 链。

本周期最重要的改进不是“让更多卡自动跑”，而是使每次自动推进都能回答：**为什么此卡已解锁、它依赖的真实 artifact 是什么、它绝不会越过哪一个 PPT Master 阶段、以及它失败时如何停下并留下可审计证据。**
