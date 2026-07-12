[English](../productization-automation-operating-state.md) | [中文](./productization-automation-operating-state.md)

---

# PPT Master 产品化 — 自动化运行状态

> **状态：** 已启用受控安全自动化；旧自治 worker 保持暂停；一项失效的 reviewer 定时任务已暂停，等待修复。
>
> **更新：** 2026-07-12
>
> **范围：** Hermes Kanban 板 `ppt-master-productization-mainline` 及其关联定时任务。本文件是运维控制面说明，**不是** `productization/` 已作为生产应用部署的证据。

## 决策

Kanban 板是控制面；唯一允许交付的工作区是 canonical 仓库：

```text
/home/ubuntu/projects/ppt-master-upstream
```

Kanban run、worker comment、scratch worktree commit，或看上去成功的 UI，都**不等于完成**。只有变更已进入 canonical 仓库、且任务要求的验证已在 canonical 环境通过，任务才可以关闭。

root 卡 `t_a4281740` 只作为总览 tracker。它必须保持 `blocked/comment-only`：不得 claim、promote、reclaim、dispatch、decompose，也不得添加 `child -> root` 链接。

## 当前板面检查点

verified-export composition 修复及独立审计已关闭：

| 卡片 | 状态 | 含义 |
| --- | --- | --- |
| `t_dbcb654c` | done | 已在 canonical commit `217451b808b645f7c2323b1a57c55e1a0f1a1a65` 上补齐并独立验证生产式 Workbench verified-export HTTP composition。 |
| `t_1cd93ecd` | done | 原始 P1 composition gap 已复核为已解决，独立 export 审计关闭。 |
| `t_051691a7` | done | verified-export 产品化状态文档已对齐。 |
| `t_a4281740` | blocked / needs_input | 总览 tracker，不是可执行卡。 |

最近一次 clean canonical tree 已通过：

```bash
npx tsc -p tsconfig.json --noEmit
npm run productization:mainline
npx tsx productization/tests/project-workbench-verified-export-http.test.ts
npx tsx productization/tests/project-workbench-verified-export-node-server.test.ts
git diff --check
```

这些验证证明的是仓库内切片，不证明已部署应用、认证、租户隔离、CSRF/origin 防护、滥用控制或生产运维能力。

## 自动化分类

### 1. 可信且启用：仅安全 guard

| 任务 | 状态 | 作用 | 允许行为 |
| --- | --- | --- | --- |
| `pptmaster-productization-guarded-autocontinue-dispatch` (`77cd12289560`) | enabled | Guard + 有界 dispatch | 先运行仓库 guard，再调用 `hermes kanban dispatch --max 1`。仓库 guard 自身不选择/claim/promote/reclaim/decompose 任务，也不修改 root；只有 guard 正常返回后 dispatch 才可能启动 board-ready 卡。 |

仓库 guard 的 policy contract 必须保持狭窄。这个定时 wrapper 不是交付 worker：它只是一次最多启动一个任务的有界 dispatch trigger；没有 qualifying handoff 或 ready card 时必须静默。

### 2. 已暂停：旧执行通道

| 任务 | 状态 | 保持暂停的原因 | 可恢复前提 |
| --- | --- | --- | --- |
| `pptmaster-productization-kanban-autocontinue` (`cfb3f20414d8`) | paused | 并行实现 lane 可在 canonical 验收前选择/执行任务，且曾导致不安全板面行为。 | 由经过审查的 canonical-only dispatcher 替代，并具备 dependency gating 和验收证据。 |
| `pptmaster-productization-verify-parallel-lane` (`facaad7b5842`) | paused | 并行验证 lane 可能与实现竞争，且可能报告未验证状态。 | 验证必须在 canonical 交付后串行进行，并机器记录命令结果。 |
| `pptmaster-preview-export-proof-worker` (`b9d7ac1c0ad1`) | paused | 它绑定旧 export-proof 阶段，已不是当前事实来源。 | 新 successor 明确需要这项范围，并使用 canonical workspace 与当前 runtime evidence。 |
| `pptmaster-next-runtime-action-worker` (`652f87610ad4`) | paused | 它会在 dependency-controlled successor cards 外猜测/推进“下一步”。 | 下一个相邻 PPT Master gate 必须表示为预建的 dependent task。 |
| `pptmaster-export-foundation-canonical-autopilot` (`67593d1e3e2f`) | paused | 它属于已经完成的 export-foundation 阶段；重跑可能产生重复工作。 | 新的、明确范围 successor 真正需要它；否则永久退役。 |

### 3. 已暂停：失效/陈旧的 scheduler 配置

| 任务 | 状态 | 发现 | 恢复前必须修复 |
| --- | --- | --- | --- |
| `pptmaster-productization-kanban-reviewer-and-idle-continuation` (`645ed70cfad6`) | 已于 2026-07-12 暂停 | scheduler 配置引用 `pptmaster_auto_review.py`，但该脚本不存在于 `~/.hermes/scripts/`。没有可执行文件的 reviewer 不是可信自动化。 | 按经过审查的规格重建脚本；先 dry-run；证明它不能修改 root、伪造 successor，或在未完成 canonical 验收时将卡标为 complete。 |

## Canonical successor 协议

以后任何自动化的 PPT 产品化增量都必须遵循本协议。

### 前置条件

- 任务为非 root child，并有明确范围。
- 任务使用 canonical workspace：

  ```text
  dir:/home/ubuntu/projects/ppt-master-upstream
  ```

- predecessor 真正处于 `done`，并记录 canonical commit 和所需检查。
- successor 预先创建且由 dependency link 管理；worker 不得在完成时临时发明下一张卡。
- root 无 inbound link、无 claim lock、无 worker PID，且不被任何 scheduler 选中。
- 同一时间最多一个会修改 canonical worktree 的 worker。

### 执行步骤

1. 只 promote 符合依赖条件的 successor。
2. 只 claim `ready` 状态的非 root 任务。
3. 按 `skills/ppt-master/SKILL.md` 做最小相邻变更。
4. 运行任务要求的 focused negative/positive proof，再运行适用的 TypeScript、`productization:mainline` 与 `git diff --check`。
5. 确认 canonical working tree clean，且申报 commit 存在于 canonical HEAD。
6. 将精确 commit 和命令结果记录到任务 result。
7. 只有完成上述验收后才能 complete。若有真实 P0/P1，必须以文件/行号证据 block，并创建一张最小、依赖受控的 remediation card。

### 禁止行为

- 禁止 scratch-only completion。
- 禁止 root 操作，除了 comment / guard observation。
- 禁止 `todo -> claim`；必须经 `todo -> ready -> claim`。
- 禁止 worker 自行创建“下一张卡”替代 dependency link。
- 禁止用笼统的 `review-required` / `needs_input` 阻塞本可由 canonical 验收决定的结果。
- 禁止并行 cron 对任务执行 claim/promote/reclaim/decompose。
- 禁止只信 worker 报告的 SHA；必须独立确认该 SHA 在 canonical 仓库存在。

## 重新启用 checklist

任务完成不等于可恢复已暂停执行 job。任何旧 job 的替代或恢复，必须满足以下全部适用项：

- [ ] scheduler 解析路径上的脚本存在且可执行。
- [ ] 脚本有 dry-run 模式，且具备任务板/fixture 决策测试。
- [ ] 任务选择逻辑按 ID 排除 `t_a4281740`，不能仅按 title 或 status。
- [ ] 所有会写入的工作仅使用 `dir:/home/ubuntu/projects/ppt-master-upstream`。
- [ ] 尊重 dependency links；parent 未 done 时绝不选择 child。
- [ ] 串行化 canonical mutations；定时 wrapper 每个 tick 最多 dispatch 一张 ready 任务，且不能同时运行第二个 mutating worker。
- [ ] 关闭前验证 canonical commit 存在、working tree clean、focused proof、TypeScript、mainline 和 diff check。
- [ ] 在 Kanban task 中记录精确命令与结果。
- [ ] 失败时仅因具体、可复现 P0/P1 而 block；不能把普通 review 写成 `needs_input`。
- [ ] 一次手动 dry-run 与一次受控 live run 均证明不会污染 root link/lock。
- [ ] 替代实现满足全部条件前，旧 job 必须继续 paused。

## 运营快速检查

```bash
# Canonical 仓库验收状态
cd /home/ubuntu/projects/ppt-master-upstream
git status --short
npx tsc -p tsconfig.json --noEmit
npm run productization:mainline
git diff --check

# Kanban 状态
export HERMES_KANBAN_BOARD=ppt-master-productization-mainline
/home/ubuntu/.local/bin/hermes kanban status
/home/ubuntu/.local/bin/hermes kanban diagnostics

# 定时任务状态
/home/ubuntu/.local/bin/hermes cron list
```

## 本文件不授权的事情

本运行状态说明不授权将 Workbench 宣称为生产服务，也不授权恢复任意 cron worker。生产部署仍需要独立证明：宿主生命周期、生产持久化、认证/授权、租户隔离、CSRF/origin controls、限流/滥用处理、日志、备份恢复和运维归属。
