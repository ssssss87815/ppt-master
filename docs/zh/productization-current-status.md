[中文](./productization-current-status.md) | [English](../productization-current-status.md)

---

# PPTMASTER 产品化 — 当前状态

> **状态：** 已实现并验证一个以运行时为依据的 Project Workbench 切片，覆盖“锁定确认项”门禁和“已验证导出”的配套界面。它是 PPT Master 之上的集成层，**不是**替代演示文稿生成流程的第二套工作流，也不是完整的生产应用。
>
> **更新：** 2026-07-11
>
> **当前验证基线：**
> - `npx tsc -p tsconfig.json --noEmit` — 通过
> - `npm run productization:mainline` — 通过
> - 直接运行 `productization/tests/*.test.ts` — 51 通过 / 0 失败
> - 已验证导出 HTTP 证明 — 通过（`project-workbench-verified-export-http.test.ts`）

## 目的

本文记录 `productization/` 的实际状态，避免后续工作：

- 重建已经交付的 Workbench 确认项切片；
- 宣称此仓库已有生产部署、完整安全边界或具体持久化实现；
- 以 UI 状态或伪造产物绕过 PPT Master 工作流；
- 将仓库内测试 fixture 当成生产应用宿主的证据。

权威工作流是 `skills/ppt-master/SKILL.md`：

```text
源材料导入
  -> 八项确认（Eight Confirmations）
  -> Strategist 运行时验证
  -> spec lock / spec_ready 门禁
  -> generation
  -> 基于 workspace 的 preview
  -> 导出 PPTX
```

产品化层只能投影、持久化和约束这条流程；不得发明第二条流程、提前把后续阶段标记为完成、或在 UI 契约中自行拼装 workspace 路径。

## 已实现并已验证的内容

### 1. 状态、动作与运行时边界

仓库已具备：

- project、artifact、checkpoint 与 workspace mapping 契约；
- source import 与 confirmation preparation 动作；
- 显式项目状态和受保护的阶段迁移；
- Strategist、generation、preview、export 的运行时桥接适配器；
- 从 project 状态投影 view model，而不是从 UI 文案推断工作流状态。

workspace mapping 仍归 backend/adapter 负责。UI 契约消费元数据、项目状态、checkpoint 和 artifact，不能自行构造仓库路径。

### 2. 可持久化的确认项 Workbench 路径

已实现的 Workbench 切片覆盖首个用户可操作门禁：

```text
导入源材料
  -> 准备八项确认
  -> 渲染问题
  -> 校验答案完整性
  -> 向 Workbench route POST JSON
  -> 持久化 project + artifact + checkpoint
  -> fresh GET 展示已锁定状态
  -> 暴露下一步受门禁保护的 Strategist 动作
```

相关实现：

- `productization/app/project-workbench-page.ts`
- `productization/app/render-project-workbench-shell.ts`
- `productization/app/project-workbench-http-route.ts`
- `productization/app/project-workbench-node-server.ts`
- `productization/backend/actions/submit-confirmations.ts`
- `productization/backend/services/project-view-service.ts`

Shell 会将表单答案序列化为 JSON 并提交给 route。Route 会拒绝错误格式或不完整的输入；只有具备持久化能力时才可返回成功；成功后会持久化迁移并通过同一组 repositories 重新渲染。因此成功响应并非仅内存中的临时投影。

### 3. 可复现的运行时 fixture 与 HTTP 边界证明

运行时 Workbench 测试使用仓库内 fixture：

```text
productization/test-fixtures/runtime-workspace/
```

验证不再依赖人工保留的 `/tmp/ppt-downstream-svg-probe`。

此外已有 `project-workbench-node-server.ts` 将 route 适配为最小 Node HTTP server，并验证真实 localhost HTTP 请求的 GET、POST、404 与 405 语义。它不是生产应用服务器，但证明了 Workbench route 可在真实网络边界被承载。

### 4. 诚实的阶段展示

Workbench 不会因确认项已提交就宣称 Strategist、generation、preview 或 export 已执行。后续阶段仍然通过 project/artifact/checkpoint 状态和对应运行时 bridge adapter 表示。

类型安全契约包含明确的 terminal failure 处理，因此 UI 能展示恢复状态而不会解锁后续动作。

### 5. 已验证的 Workbench Export PPTX 切片

Workbench 只有在服务端持有的当前 run preview evidence 通过验证时，才会暴露狭义的 Export PPTX 动作。已完成的切片流程为：

```text
校验 project/run/preview checkpoint evidence
  -> 以 exportKey / idempotency key reserve，并实施 project-run lease
  -> 将既有 export bridge 输出到确定性的 staging 目录
  -> 拒绝或清理无效的 staged output
  -> 原子提交 project + export artifacts + export-ready checkpoint + ExportAttempt
  -> fresh GET 只暴露 durable delivery
```

持久化契约和 focused tests 覆盖 active/completed 的幂等复用、lease 冲突、失败回滚，以及 staging output 永远不能成为 fresh-read delivery 的规则。Workbench route/UI 会拒绝 stale、cross-run、缺失或其他无效 preview evidence，且不会暴露 server workspace path。

相关 canonical 实现提交序列：

- `43b7ec5` — 原子 export-persistence test double；
- `4e331e0` — staged export bridge；
- `b8dd251` — state-backed atomic export commit；
- `9ccecb7` — verified Workbench export surface；
- `c8d8ebf` — Workbench timeline-contract 修复。

`project-workbench-verified-export-http.test.ts` 通过真实 localhost HTTP 证明：durable delivery 尚未存在时 export 不可用；存在后响应返回预期 PPTX MIME type 且 artifact 字节保持不变。这证明仓库内以运行时为依据的切片；**不**宣称生产下载服务、已部署宿主、生产数据库/文件系统，或对缺乏已验证运行时 evidence 的项目宣称 generation/export 已执行。

## 验证证据

当前修订已检查：

- 仓库 TypeScript：`npx tsc -p tsconfig.json --noEmit`。
- 主线 bridge 与 Workbench：`npm run productization:mainline`。
- 直接 inventory：全部 `productization/tests/*.test.ts`（51 通过 / 0 失败）。
- 已验证导出 HTTP 证明：`project-workbench-verified-export-http.test.ts` 证明 export 前不可见；export 可用后，通过真实 localhost GET 返回预期 PPTX MIME type 且 artifact 字节保持不变。
- 可持久化确认项证明：`project-workbench-confirmation-submit-post.test.ts` 在同一组 repositories 上执行 POST 后 fresh GET。
- Shell/route 集成：`project-workbench-shell-confirmation-submission-integration.test.ts`。
- 浏览器可见的失败重试行为：`project-workbench-confirmation-submit-error-ui.test.ts`。
- 仓库 fixture 的 Workbench 覆盖：`project-workbench-ui-slice.test.ts`。
- 真实 Node HTTP 边界：`project-workbench-node-server.test.ts`。

审计报告 `docs/productization-ppt-master-code-audit-2026-07-10.md` 被保留为当时的审计快照。后续 Workbench 与 type-safety 提交已经修复其中 fixture、TypeScript、表单提交和持久化相关 blocker；它不能脱离本状态文档被当作当前状态来源。

## 尚未实现 / 不作宣称的内容

本仓库尚未证明或提供：

1. 已部署应用宿主、生产 server 生命周期或生产依赖注入。
2. 面向外部写 route 的身份认证、授权、租户隔离、CSRF/origin 保护、限流和对外错误脱敏。
3. 具体生产数据库/文件系统持久化实现、迁移、保留策略或运维恢复流程。
4. 完整 dashboard、artifact 浏览/下载界面、SVG 编辑器嵌入、全状态响应式/无障碍审阅或设计系统覆盖。
5. 各 PPT Master role adapter 在真实客户源材料和生成 PPTX 上的生产部署证据。

因此，这个 Workbench 切片不是“生产服务已经完成”的声明。

## 必须遵守的下一增量

下一项实现必须遵循 PPT Master 顺序，并且**先增加反向（negative）门禁证据**：

```text
locked confirmations
  -> Strategist runtime verification
  -> 明确的 spec_ready 门禁
  -> generation 可用性
  -> 基于 workspace 的 preview/export 可用性
```

在暴露 generation 或 delivery 动作之前，测试必须证明 failed、pending、planned、stale、superseded 或 cross-run artifact 不能解锁它。Workbench 必须如实解释阻塞原因，不能伪造完成状态。

## 结论

产品化区域现在已有一个经过验证、以运行时为依据的确认项 Workbench 切片：从源材料派生确认项、用户提交答案、持久化锁定确认项，并如实投影下一步。

它不是完整的生产应用。后续必须每次只扩展一个相邻 PPT Master 门禁，保留运行时/adapter 真相来源，在展示正向 UI 动作之前先增加反向阻塞测试，并始终维护权威 PPT Master 管线。
