# PPTMASTER 产品化架构方案

[English](../productization-architecture.md) | [中文](./productization-architecture.md)

---

## 适用范围

本文讨论的不是「PPT Master 如何生成 PPT」，而是「**如何把当前依赖交互式 agent 流程的 PPT Master 能力产品化**」。

前提约束已经明确：**现阶段如果不经过交互式、多轮推进的 agent 流程，PPT Master 跑不通**。因此这里不再讨论“要不要 agent”这种抽象问题，而把它收敛为一个工程问题：

> **如何在保留 agent 运行时约束的前提下，把 PPT Master 封装成一个可交付、可商业化、可替换内核的产品系统。**

### 第一原则

PPTMASTER 产品化**不是**做一个更漂亮的“生成按钮”。

它要做的是：在**不牺牲当前生成质量**的前提下，把 **ppt-master 的完整工作流协议** 封装成一个**可控、可恢复、可视化**的产品壳。

这意味着，产品化对象不是一个抽象的“PPT 生成能力”，而是仓库今天已经真实存在的那套协议：

- 串行 phase 推进
- blocking confirmations
- `design_spec.md` / `spec_lock.md` 这类设计状态工件
- `resume-execute`、`refine-spec`、`live-preview` 这类可恢复 / 可回改中间态
- 当前 workflow 为保证输出质量而施加的执行约束

因此，本文采用的是一个**PPTMASTER-first**而不是 generic-PPT-first 的视角：

- 先保留 PPTMASTER 之所以能稳定出高质量结果的协议
- 再把这套协议包装成用户可见、系统可控、失败后可恢复的产品壳
- 再在外围逐步做模块化边界，使系统未来可以支持替换引擎，但不把今天依赖的高质量工作流粗暴压扁成低质量的一次性 API

模块化是目标之一，但**模块化不能通过抹平现有协议来换取**。更合理的做法是：围绕 PPTMASTER 引入显式的产品层、状态契约、adapter 与边界，让系统逐步获得可替换性，而不是一开始就为了“插件化”重写掉当前真正保证质量的工作流约束。

本文面向三类读者：

- 想把 PPT Master 接入 SaaS / 工作台产品的工程负责人
- 想把当前多轮协作流程改造成稳定服务边界的架构设计者
- 想评估未来是否能把 PPT Master 换成其他插件或引擎的产品/平台负责人

---

## 产品化研发默认执行约定

对于 PPTMASTER 产品化相关的软件工程、规划、代码评审、QA 与发布工作，默认执行约定是：**保留当前引擎/运行时约束**，并且在用户没有明确要求改走其他路径时，默认遵循仓库里的工程工具链约定：

- **RTK** —— 涉及结构化 runtime/state orchestration 时默认采用，尤其是 workflow state、checkpoint 流转、action dispatch、前端状态建模。
- **codebase** —— 涉及大范围 repo 导航、依赖追踪、符号查找、影响分析时默认采用；当手工读文件已经不可靠时，不再当成可选项。
- **ponytail** —— coding / refactor / cleanup / QA / review 的默认实现姿势：先做最小可运行切片，直接执行，以真实验证为准。
- **agent-skills** —— 多阶段或高风险工作的默认治理框架：先加载 `using-agent-skills`，再按 phase 进入对应 skill（如 `spec-driven-development`、`planning-and-task-breakdown`、后续实现/验证/评审技能），plan mode 下 `.hermes/plans/` 是 canonical plan 位置。

之所以要把这组约定写清楚，是因为 PPTMASTER 产品化不是通用 CRUD 改造：当前系统天然带着 staged runtime discipline。默认工程方法必须偏向于保留协议边界、显式化状态、以及基于真实执行做验证，而不是过早把工作流压扁成一次性抽象。

## 问题重述

当前真实问题不是：

- 产品要不要做成聊天机器人？
- 用户是不是必须和 agent 对话？

而是：

- **PPT Master 的执行内核天然依赖多轮上下文推进、阶段确认和串行 gate**
- **如果直接拿掉 agent 运行时，现有流水线的关键约束会失效**

换句话说，真正的问题应当重述为：

> **PPT Master 是一个 agent-native 的生成引擎；应当把 agent 放在哪一层，才能既保留可运行性，又把最终产品形态从“原始聊天流程”中解耦出来？**

这是本文的核心判断轴。

---

## 约束来源：为什么当前内核离不开 agent

这不是对话偏好问题，而是由仓库当前的执行模型直接决定的。

### 1. 串行流水线而非无状态函数调用

仓库主流程是严格串行的：

`Source → Project Init → [Template] → Strategist → [Image_Generator] → Executor → Quality Check → Post-processing → Export`

其中 `skills/ppt-master/SKILL.md` 明确规定：

- 步骤必须顺序执行
- blocking gate 必须停下等待确认
- 不允许跨阶段打包
- Executor 逐页连续生成，不能并行切页
- 每页生成前必须重新读取 `spec_lock.md`

这意味着它不是一个“输入 JSON，返回 PPTX”的一次性函数，而是一个**依赖中间状态与阶段性确认的会话型系统**。

### 2. Eight Confirmations 是产品级阻塞 gate

Strategist 阶段的 Eight Confirmations 并不是 UI embellishment，而是整个设计系统的唯一阻塞决策点。其职责是一次性锁定：

- 画布
- 页数
- 受众
- 风格
- 配色
- 图标
- 排版
- 图像策略

这些决策彼此耦合。拆散成多个“静态表单提交”在理论上可行，但在当前实现里，它们本质上仍由 agent 组织、推荐、解释、并在确认后写入 `design_spec.md` / `spec_lock.md`。

### 3. `design_spec.md` 与 `spec_lock.md` 是双轨状态，不是单次输出

当前系统用两份工件承接设计状态：

- `design_spec.md`：面向人类的叙述性设计说明
- `spec_lock.md`：面向 Executor 的机器可执行契约

这本身就是典型的 agent orchestration 结构：

- 上游角色产出解释性状态
- 下游角色消费锁定状态
- 长流程中用 `spec_lock.md` 抗上下文漂移

说明内核依赖的是**显式会话状态传播**，不是单一 API 调用。

### 4. 运行时包含“可退回、可补充、可恢复”的中间态

仓库已经显式提供：

- `resume-execute`：Phase B 续跑
- `refine-spec`：spec 先停下供用户修改
- `live-preview`：Step 6 再进入预览/修改
- `visual-review`：用户显式要求时再插入审阅步骤

这说明系统天然支持的是**可分段重入的长事务**。这类长事务如果没有 agent runtime 或与之等价的编排层，无法稳定管理。

---

## 结论：不要讨论“要不要 agent”，而要讨论“agent 在哪一层”

因此，架构问题不应该继续表述为：

- 做 agent 产品
- 做非 agent 产品

更准确的三种选择是：

| 方案 | 用户前台 | 系统内核 | 适用阶段 |
|---|---|---|---|
| A. 直接 agent 产品 | 聊天/对话式 | agent runtime | 验证最快，产品包装最弱 |
| B. 工作台产品 + 内部 agent 编排 | 工作台 / 向导 / 确认页 | agent runtime | **当前最推荐** |
| C. 全面重构为无状态服务 | 结构化产品 | 非 agent / service graph | 终局架构，近期成本最高 |

核心结论只有一句：

> **前台不一定要 agent 化，但后台在当前阶段必须保留 agent runtime。**

---

## 三种可选架构

### 方案 A：Agent 作为产品内核，前台也直接暴露为 agent

这是最贴近当前仓库工作方式的路线。

#### 形态

- 用户通过聊天或类聊天界面提交需求
- 后台直接驱动 Strategist / Image_Generator / Executor 流程
- 中间确认直接以 agent 对话形式暴露
- 最终返回预览、PPTX、修订入口

#### 优点

- 改造成本最低
- 最快落地
- 与现有 SKILL.md / workflow 边界最一致
- 适合内部工具、试运营、人工陪跑场景

#### 缺点

- 产品可控性差
- 状态展示不够结构化
- 商业化体验容易被“原始 agent 交互感”拖累
- 权限、计费、项目管理、失败恢复都需要二次封装

#### 何时适用

- 先验证需求，而不是先做成成熟 SaaS
- 团队容忍用户直接面对 agent 流程
- 首要目标是尽快跑通闭环

### 方案 B：工作台产品 + 内部 agent orchestration（推荐）

这是当前阶段最现实、也最稳妥的路线。

#### 形态

用户看到的不是裸聊天，而是结构化工作台：

1. 新建项目
2. 上传资料 / 输入主题
3. 确认大纲与设计建议
4. 确认 Eight Confirmations
5. 生成 / 预览
6. 单页重生成 / 微调
7. 导出 PPTX

但这些动作背后，仍然由 agent runtime 驱动。

#### 优点

- 保留现有内核可运行性
- 用户体验可以产品化，而不是工具化
- 中间状态更容易存档、追踪、审计
- 商业化模块（登录、配额、支付、项目列表）容易嫁接
- 未来更容易逐步抽象底层引擎

#### 缺点

- 要做一层状态映射
- 前后端要显式管理 step / checkpoint / artifact
- 比方案 A 多一层工程复杂度

#### 为什么这是当前最优解

因为它同时满足两件事：

1. **承认 PPT Master 当下必须由 agent 编排才能跑通**
2. **避免把最终产品锁死成一个“聊天机器人”**

### 方案 C：把 PPT Master 重构成无状态服务图

这是最干净的终局方案，但不适合作为当前第一步。

#### 形态

把现有流程拆解为多个清晰服务，例如：

- outline service
- spec service
- asset planning service
- page generation service
- export service

前台和编排层只通过结构化输入/输出驱动，不再依赖 agent 会话。

#### 优点

- 架构最模块化
- 最适合平台化、多内核替换
- 测试和 SLA 管理最清晰
- 最接近真正的“插件式引擎”

#### 缺点

- 改造成本最大
- 容易把当前能跑通的能力拆坏
- 需要先搞清楚哪些状态是可以形式化的，哪些仍需要人机协商

#### 何时适用

- 产品已经验证
- 有稳定的用户需求形态
- 需要多引擎接入或强 SLA 服务化

---

## 推荐架构：五层模型

针对当前仓库现实，建议采用下面的五层结构。

### 第 1 层：Product Shell（产品壳层）

用户可见的应用层，负责：

- 登录、组织、权限
- 项目列表与项目详情
- 文件上传 / URL 输入 / 主题输入
- 大纲确认
- Eight Confirmations 确认页
- 生成进度
- 页面预览
- 局部修改与重生成
- 导出与计费

这一层不需要暴露 Strategist / Executor 术语，但要能表达它们的结果。

### 第 2 层：Workflow State / Session State（状态层）

这是产品化成败的关键层。

它负责持久化：

- 当前项目阶段（source / confirm / spec / generate / review / export）
- 输入源与导入记录
- 当前大纲版本
- 当前确认结果（Eight Confirmations）
- 当前 `design_spec.md` 版本
- 当前 `spec_lock.md` 版本
- 当前图片计划 / 资源状态
- 当前页级生成进度
- 当前导出工件
- 用户反馈与修订历史

这层的作用，是把“agent 的连续上下文”翻译成“产品可管理的显式状态”。

### 第 3 层：Agent Orchestrator（编排层）

这是系统内部的运行时核心。职责包括：

- 按阶段驱动 Strategist / Image_Generator / Executor
- 管理 blocking gate
- 在合适的步骤启动 `refine-spec` / `resume-execute` / `live-preview` 等分支工作流
- 读取与写回项目工件
- 把 agent 的建议、理由、产物同步到状态层
- 失败时支持恢复或回滚到上一个 checkpoint

这里不要求“看起来像聊天”；要求的是**能稳妥承接当前仓库的 agent-native 工作流**。

### 第 4 层：PPT Master Adapter（领域适配层）

这是“产品系统”与“仓库工作流”之间的边界。

职责包括：

- 把产品输入转成项目目录与源材料
- 调用 `project_manager.py`、conversion scripts、workflow 文件定义的能力边界
- 将 Eight Confirmations 的表单/页面状态映射为 `recommendations.json` / `result.json` 所需结构
- 把 `design_spec.md` / `spec_lock.md` / `svg_output/` / `exports/` 等工件转换为上层可消费的项目状态
- 对外暴露稳定的领域动作，例如：
  - `create_project`
  - `import_sources`
  - `prepare_confirmations`
  - `confirm_design`
  - `generate_deck`
  - `resume_generation`
  - `preview_slide`
  - `regenerate_slide`
  - `export_pptx`

这一层是未来替换底层引擎的关键隔离带。

### 第 5 层：Commerce / Platform Layer（商业与平台层）

用于承接真正产品化所需的外围能力：

- 账号体系
- 团队空间
- 配额 / 点数 / 套餐
- 支付
- 项目归档
- 模板市场 / 插件市场
- 用量统计 / 审计 / SLA

这层不应渗入 PPT Master 内核，而应消费状态层和适配层暴露出的稳定接口。

---

## 状态机建议

为了把当前 workflow 产品化，建议把系统状态显式化，而不是让它只存在于 agent 上下文里。

推荐的一级状态如下：

| 状态 | 含义 | 典型产物 |
|---|---|---|
| `draft` | 项目刚创建，还未完成资料导入 | project metadata |
| `sources_ready` | 源材料已就绪 | `sources/` |
| `confirmation_pending` | 等待用户完成 Eight Confirmations | `confirm_ui/recommendations.json` |
| `confirmation_locked` | Eight Confirmations 已锁定 | `confirm_ui/result.json` |
| `spec_ready` | 设计规范已生成 | `design_spec.md`, `spec_lock.md` |
| `asset_preparing` | 正在获取图片 / 公式 / 图标等资源 | `images/`, manifests |
| `generation_in_progress` | Executor 正在逐页生成 | `svg_output/` |
| `preview_available` | 可进入 live preview / review | preview artifacts |
| `post_processing` | 正在后处理与导出 | `svg_final/`, notes |
| `export_ready` | PPTX 已可下载 | `exports/*.pptx` |
| `needs_revision` | 用户要求回退或修订 | issue / annotation state |
| `failed_recoverable` | 某一步失败，但可从 checkpoint 恢复 | error metadata |

这类状态应该由产品系统维护，并与项目目录工件双向同步。

---

## 为什么用户前台不应该直接暴露“原始 agent 流程”

即便后台保留 agent runtime，前台仍建议产品化封装，原因有四个。

### 1. 用户要的是结果与控制，不是 prompt 细节

多数用户并不需要知道 Strategist / Executor 如何切换，只需要：

- 当前进度是什么
- 我现在需要确认什么
- 哪一步失败了
- 哪里可以修改
- 什么时候能导出

### 2. 产品状态需要比聊天消息更稳定

聊天记录适合解释，不适合做严肃的工程状态源。产品层必须能在不依赖会话 transcript 的情况下回答：

- 当前项目卡在哪一步
- 用户已经锁定了什么
- 当前版本和上一个版本差异是什么
- 是否能从 Phase B 恢复

### 3. 商业化功能天然依赖结构化状态

配额、支付、权限、项目归档、团队协作都要求结构化对象，而不是一段聊天上下文。

### 4. 后续替换内核时，产品层不该重做

如果未来接入新的 deck 引擎，前台仍应复用同一套：

- 项目管理
- 确认工作流
- 预览
- 导出
- 商业化能力

因此前台必须绑定的是**状态与动作**，而不是某个具体 prompt 流程。

---

## 插件化与未来替换：应抽象什么，不应抽象什么

如果未来希望把 PPT Master 换成别的插件或引擎，不要在当前阶段抽象一个过于理想化的“单一 generate() 接口”。

因为从仓库现状看，真正稳定的抽象不是“一次性生成”，而是**会话型生成能力**。

### 推荐抽象：Session-capable deck engine

建议定义如下领域接口：

| 能力 | 含义 |
|---|---|
| `analyze_input()` | 理解输入源，抽取结构化事实 |
| `build_outline()` | 生成大纲 / 页面规划建议 |
| `propose_confirmations()` | 给出确认候选与推荐值 |
| `lock_confirmations()` | 锁定用户确认结果 |
| `generate_spec()` | 产出设计规范与执行契约 |
| `prepare_assets()` | 准备图像 / 图标 / 公式等资源 |
| `generate_pages()` | 逐页生成页面 |
| `preview()` | 提供可视预览与反馈入口 |
| `revise()` | 基于反馈回退并修订 |
| `export()` | 导出成品 |

这组接口与当前 PPT Master 的真实能力边界更匹配，也为未来替换其他多轮型引擎留出了空间。

### 不推荐抽象：伪装成单步无状态 API

如果过早把内核强行包装成：

- `generate_deck(input) -> pptx`

会把当前真正重要的中间态全部藏起来，最后会导致：

- 失败难恢复
- 用户无法局部确认或修订
- 预览无法稳妥插入
- 计费与阶段控制模糊

这会让产品表面更“整洁”，但系统实际上更脆弱。

---

## 与仓库现状的直接映射

下面给出一个产品化映射表，说明本文不是抽象想象，而是基于仓库现有结构推导而来。

| 仓库现状 | 产品化含义 |
|---|---|
| `project_manager.py` | 项目生命周期的底层初始化器 |
| `sources/` | 用户输入资产仓 |
| `confirm_ui/recommendations.json` | 待确认建议集 |
| `confirm_ui/result.json` | 已锁定确认结果 |
| `design_spec.md` | 人类可读的设计状态 |
| `spec_lock.md` | 机器可读的执行契约 |
| `resume-execute` | 长任务恢复点 |
| `refine-spec` | 中途用户 review gate |
| `live-preview` | 可视化反馈入口 |
| `svg_output/` | 进行中的视觉中间产物 |
| `exports/*.pptx` | 标准交付产物 |

这张表揭示了一个事实：**仓库已经天然具备产品化骨架，只是目前主要以工作流和工件形式存在。**

产品化的重点不是推翻这些东西，而是：

1. 给它们加上一层稳定的状态建模
2. 给用户提供更好的交互壳层
3. 给平台提供更稳定的服务边界

---

## 分阶段落地建议

### Phase 1：工作台包壳，不动内核

目标：尽快把现有仓库工作流封装成产品可用形态。

建议动作：

- 做项目列表 / 项目详情 / 上传入口
- 把 Eight Confirmations 做成可嵌入的产品页面
- 把关键工件同步进数据库或状态存储
- 后台仍直接调用当前 workflows / scripts
- 支持 Phase B 恢复与基础失败重试

### Phase 2：显式状态机与可观测性

目标：让系统更像产品，而不是一组脚本。

建议动作：

- 引入持久化状态机
- 把每一步的输入、输出、错误、耗时都结构化记录
- 建立 artifact index，而不是靠扫描目录猜当前状态
- 让预览、重生成、回退都走统一状态层

### Phase 3：抽象领域适配层

目标：把 PPT Master 与产品系统解耦。

建议动作：

- 把仓库脚本与 workflow 调用封装进 adapter
- 上层只调用领域动作，不碰底层目录细节
- 为未来新引擎预留相同能力接口

### Phase 4：逐步服务化

目标：在不破坏现有能力的前提下，抽出稳定服务。

建议动作：

- 先抽出低风险能力：source analysis、confirm proposal、export 管理
- 再评估 spec 生成与页生成哪些部分能服务化
- 始终保留从产品状态恢复到项目工件的能力，避免“数据库状态”和“项目目录状态”分叉失真

---

## 最终建议

基于当前仓库现实，推荐的判断非常明确：

> **不要试图在第一阶段拿掉 agent。真正应该拿掉的，是“用户必须直接面对原始 agent 交互流程”这件事。**

具体说就是：

- **对内**：保留 agent runtime，继续承接当前串行、多阶段、可重入的 PPT Master 工作流
- **对外**：做成结构化工作台，把上传、确认、预览、导出、修订变成产品动作
- **对未来**：在 adapter 层定义 session-capable 的 deck engine 接口，为后续替换内核留下余地

如果只选一句话作为这份文档的结论，那就是：

> **PPT Master 当前不是一个可以被简单 API 化的无状态引擎；它更像一个必须被产品外壳包住的 agent-native 运行时。**

---

## 落地规则（建议纳入项目约定）

为了避免后续讨论反复漂移，建议把下面三条作为项目层面的默认规则：

1. **未经重构验证，不得假设 PPT Master 可以脱离 agent runtime 独立运行。**
2. **产品前台默认采用工作台/向导/确认页形态，而不是把原始 agent transcript 直接暴露给终端用户。**
3. **所有新产品化接入优先围绕项目状态、工件状态和 adapter 动作建模，不以单次 `generate()` 假设为前提。**

这三条规则能把团队讨论重新锚定到真实约束上，而不是回到“是不是做聊天机器人”这种伪问题。