# PPTMASTER Productization —— 当前状态说明

[中文](./zh/productization-current-status.md) | [English](./productization-current-status.md)

---

## 文档目的

这份说明用于记录：**当前 productization 实际走到了哪里**，以及它和架构锚点文档、最初的 Slice 1 / MVP skeleton 文档相比处于什么位置。

它不是新的架构提案，而是一份状态对齐说明，避免后续实现工作混淆以下三件事：

- 架构意图
- 后端契约/编排进度
- 真实产品壳/UI 进度

---

## 一句话结论

> **PPTMASTER 的 productization 在后端契约 / orchestrator 层面已经超过最初的 Slice 1 边界，但真正的 workbench UI shell 还没有落地。**

更具体一点说：

> **系统已经具备了贯穿 preview / revision / export shell 阶段的多切片 productization 状态、动作、checkpoint、artifact ref 和 view model，但用户真正能操作的 workbench 产品界面仍基本缺位。**

---

## 相对于架构文档的当前位置

架构锚点文档（`productization-architecture.md`）推荐的方向是：

- 当前最佳路径是 **Workbench product with internal agent orchestration**
- 保留当前能保证产出质量的 agent/runtime 约束
- 在现有协议外面建立明确的产品层：
  - Product Shell
  - Workflow State
  - Orchestrator
  - Adapter

### 当前对齐情况

当前代码库在**边界/契约层面**已经基本对齐这一路线：

- 已经存在独立的 `productization/` 目录
- product-facing state 已被显式建模
- orchestrator / action 边界已存在
- adapter 边界已存在
- UI-facing 的 view model 已存在
- 已有测试覆盖状态流转与契约丰富度

### 当前缺口

但在**真实用户界面层面**还没有对齐到位：

- 这里还没有一个真正完成的 workbench UI runtime
- 当前 `productization/` 仍主要是 contracts、orchestrators、stubs 和 tests 的骨架
- 架构文档里描述的结构化产品壳，还没有作为完整 app flow 落地

---

## 相对于最初 Slice 1 文档的当前位置

Slice 1 实现文档（`pptmaster-productization-slice-1-confirmation-lock-spec.md`）对第一条 vertical slice 的定义非常窄：

- create project
- import source(s)
- prepare confirmation recommendations
- submit Eight Confirmations
- 到达 `confirmation_locked`

并且它明确说 Slice 1 **不包含**：

- spec generation
- preview
- revision
- export

### 当前实际情况

实现已经明显超出了这个边界。

当前代码中的证据：

- `productization/backend/state/schema.ts` 已包含超出 Slice 1 的状态：
  - `spec_ready`
  - `generation_in_progress`
  - `preview_available`
  - `revision_requested`
  - `export_ready`
  - `failed_recoverable`
- `productization/backend/actions/submit-confirmations.ts` 当前会直接推进到 `spec_ready`，而不是停在 `confirmation_locked`
- `productization/backend/orchestrator/phase-runner.ts` 已经有以下 shell/stub 流程：
  - start generation
  - preview sync
  - request revision
  - resume generation
  - export PPTX

### 这意味着什么

所以从实现角度看，代码库已经**超出了最初 Slice 1 的范围**。

但这**不等于**产品壳已经完成。它只说明：项目已经把**后端 productization shell**推进到了比第一份 spec 更靠后的地方。

---

## 当前实际上已经实现了什么

### 1）Productization 状态机

当前 productization 层已经建模了一条扩展到以下阶段的项目生命周期：

- `draft`
- `sources_ready`
- `confirmation_pending`
- `confirmation_locked`
- `spec_ready`
- `generation_in_progress`
- `preview_available`
- `revision_requested`
- `export_ready`
- `failed_recoverable`

这说明 productization 已经具备了比最初第一阶段文档更宽的 workflow contract。

### 2）Product action 与 orchestration shell

当前代码已经定义/预留了以下 product-facing actions 与 orchestration：

- project creation
- source import
- confirmation preparation
- confirmation submission
- generation start
- generation resume
- revision request
- preview sync
- export

这一步很有价值，因为它先冻结了产品外层契约，即便最终 UI 壳还没有出现。

### 3）View model 与 artifact richness

当前 productization 层已经提供了面向产品层的形状，例如：

- `ProjectViewModel`
- `PreviewViewModel`
- `ExportViewModel`
- confirmation view models

并且已经携带更丰富的 artifact/checkpoint metadata，目的是给未来的 workbench UI 使用。

### 4）测试

`productization/tests/` 已经验证了多条 vertical slice 和契约行为，例如：

- confirmation lock flow
- checkpoint persistence
- generation/preview shell
- revision/export shell
- recoverable failure continuity

这强烈说明当前阶段已经不是“productization 还没开始”，而是**contract-and-orchestration stabilization**。

---

## 还没有实现的东西

尽管后端/product-shell 已有明显进展，下面这些仍然缺失或只存在很薄的一层：

### 1）真正的 workbench UI shell

架构文档推荐的产品表面是一个结构化 workbench，大致步骤是：

1. create project
2. upload material / input topic
3. confirm outline and design recommendations
4. confirm Eight Confirmations
5. generate / preview
6. revise/regenerate
7. export

但这个完整的用户可见壳层，**现在并没有真正实现出来**。

### 2）具体的 app/runtime wiring

当前 `productization/` 目录还不能算是一个完整前端应用/runtime，无法把上面的用户流程完整串起来并作为可交付产品直接运行。

### 3）足够丰富的视觉产品表面

这点尤其重要，因为产品目标本身就是高质量 PPT 产出：当前 productization 层虽然已经有状态与 artifacts，但还没有一个足够“像产品”的 rich, visual workbench，去把这些状态变成真正有价值的用户体验。

---

## 现在这个阶段最准确的命名

最准确的阶段命名是：

> **Backend-first productization shell through preview/export contracts; workbench UI still pending.**

中文可以更直白地说：

> **产品化已经从最初的 Slice 1 进入多切片的后端/编排骨架阶段，但还没有跨入完整 workbench UI 的实现阶段。**

---

## 为什么这份状态对齐很重要

如果没有这份状态对齐，后续工作很容易朝两个错误方向漂移：

### 风险 A：误以为 product shell 已经存在

这会导致类似“productization 基本做完了”的误判，但其实当前 repo 仍缺少真正的 workbench 产品界面。

### 风险 B：误以为什么都还没有，于是从零重来

这又会忽略当前 repo 已经拥有的：

- product state modeling
- action contracts
- adapter/orchestrator boundaries
- checkpoint flows
- artifact-rich view models
- 多条 slice 的 tests

正确的下一步不是这两个极端中的任意一个。

---

## 建议的下一步

下一步最值得做的事情应该是：

> **实现最小但真实可用的 workbench UI slice，并直接消费现有 productization contracts，而不是再发明一套新的后端抽象。**

建议目标：

- 先做一个最小但真实的 user-facing workbench flow
- 尽量直接复用现有 checkpoint/timeline/artifact contracts
- 只有当 UI 暴露出真实契约缺口时，才回头修改 backend

### 建议的第一个 UI slice

最小可用的产品壳实现建议至少覆盖：

- project overview/status timeline
- source import status
- confirmation recommendation display
- confirmation submission UI
- checkpoint/status visibility
- preview/export summary cards（即便最终渲染仍是部分实现）

这样才能把项目从“backend-first shell”真正推进到第一个有产品意义的 workbench milestone。

---

## Bottom line

> **按项目文档，目标方向是“Workbench product with internal agent orchestration”。按当前代码，后端 productization shell 已经明显超过最初的 Slice 1 边界。按当前 repo 的表面状态，我们还没有真正做出能把这套 shell 变成产品的 workbench UI。**
