# PPT 产品化自动推进契约（受控模式）

## 目的与权威来源

本契约同时受以下两类来源约束；冲突时以项目文档的范围、验收与 stop rule 为准，且不得绕过 PPT Master 的生产阶段和工件门禁：

1. **项目文档与工程治理**：`AGENTS.md`、`docs/productization-architecture.md`、`docs/productization-current-status.md`、`docs/productization-four-piece-usage-audit.md`。
2. **PPT Master 生产流程**：`skills/ppt-master/SKILL.md`。

Kanban 只拥有任务生命周期真相；Cron 只提供定时唤醒；两者都不能替代 PPT Master 的真实阶段、工件或质量门。

## 唯一执行边界

- 唯一 canonical workspace：`dir:/home/ubuntu/projects/ppt-master-upstream`。
- 同一时刻最多一个会修改 canonical workspace 的 worker。
- 根卡 `t_a4281740` 永远是 tracker-only：保持 `blocked / needs_input`，无 claim lock、worker PID、current run，且没有 child → root 入边。
- 任何 worker 不得通过 SQL 直接修改 Kanban 数据库。

## 双流程阶段映射

| 项目化状态 | PPT Master 阶段 | 必须证明的真实工件 / 证据 | 不满足时的动作 |
|---|---|---|---|
| `sources_ready` | Source / Create Project | 输入源归档在 `sources/` | 停止，不进入确认 |
| `confirmation_locked` | Eight Confirmations | `confirm_ui/result.json` 已锁定 | 停止，不运行 Strategist |
| `spec_ready` | Strategist | 当前 run 的 `design_spec.md`、`spec_lock.md`，以及 Strategist runtime 证据 | 停止，不开放 generation |
| `asset_preparing` | Image / icon / formula preparation | 资源 manifests 与实际资源 | 停止，不进入 Executor |
| `generation_in_progress` | Executor / SVG output | `svg_output/` 的当前 run 工件 | 停止，不伪称 preview/export |
| `preview_available` | Live Preview | workspace-derived preview artifacts | 停止，不伪称 export |
| `post_processing` | Quality Check / Post-processing | Quality Check 通过；`svg_final/` | 停止，不导出 PPTX |
| `export_ready` | Export | `exports/*.pptx` 与验证记录 | 停止，不宣称生产部署 |

负向证据（failed、pending、planned、stale、superseded、cross-run、缺失必需工件）必须阻止对应 action 的暴露和实际执行。

## 卡片与依赖纪律

1. 只创建一个最小、相邻的 PPT Master 阶段切片；不得跳阶段。
2. successor 必须在 predecessor 开始前创建，并用 `hermes kanban link parent child` 预建 dependency；禁止由 guard、Cron 或完成回调动态猜测/创建 successor。
3. `todo` 需经正常 lifecycle promote 成 `ready`；只有 dependency 已满足的 `ready` 卡能被 dispatch。
4. 每个卡片 body / review handoff 必须包含：
   - PPT Master 当前阶段、前置 checkpoint、输入/输出工件；
   - 项目文档 acceptance criteria 与明确 stop rule；
   - 允许修改的文件范围；
   - 必跑的 targeted + mainline 验证命令；
   - 后继已预链接卡 ID；
   - 四件套真实 evidence：RTK state/checkpoint、codebase 调用/影响面、ponytail 最小切片边界、已加载的 agent-skills。
5. review-required 只在有 `changed_files` 和 `verification_commands` 的真实 handoff 后才能进入自动 acceptance 评估；无此证据保持阻塞。

## Guard、Cron 与 dispatch

- `productization/kanban/pptmaster_autocontinue.py` 只允许：
  1. 检查根 tracker invariant；
  2. 验证窄范围 review handoff 的 changed files 与验证命令；
  3. 完成满足严格 policy 的 review 卡。
- Guard **不得**：创建任务、推测 successor、链接任务、promote/claim/reclaim 任务、修改 root、或 dispatch worker。
- Cron 只能执行：`guard → hermes kanban dispatch --max 1`。
- dispatch 只会运行已有、依赖满足的 ready 卡；若不存在，则静默结束。
- 任一 P0/P1、未映射的 PPT Master 阶段、缺失工件、验证失败、dirty canonical workspace、并发 worker 或需产品/安全决策时，Cron 保持暂停/静默，直到最小 remediation card 被人工预建和链接。

## 当前恢复顺序

1. 恢复前将 canonical 工作树收敛为干净基线；不可把 stash 或历史混合改动当作单一交付。
2. 依据 `docs/productization-current-status.md` 的 required next increment，预建并链接唯一的 generation negative-gate 修复 → 验证 → review → 下一相邻 PPT Master gate 链。
3. 每张卡写入上述双流程 handoff；仅在 predecessor 完成并通过 review 后 promote successor。
4. 恢复受控 Cron；任何时点只 dispatch 一个 canonical worker。
5. 实际经过一个无工可派/有合法 successor 的 Cron 周期后，核对 board event、worker run、Git 状态和工件；不得以配置存在替代运行证据。
