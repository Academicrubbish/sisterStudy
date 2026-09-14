---
title: M1 学习闭环实施计划
design: ./design.md
status: draft
created: 2026-09-14
updated: 2026-09-14
author: yuanchuang
---

# M1 学习闭环实施计划 Plan

## 需求简述
M1 交付妹妹可日常使用的完整学习闭环：拍错题 → 苏格拉底式两段引导解题 → 错题沉淀；拍手写笔记 → AI 标注归档。覆盖 capture / socratic-solve（简化两段式）/ note 三个子 spec。

## 前置条件
- M0 已通过（commit b20371b）：processOcr 链路可用、base64 内联、客户端压缩、app_config 双通道均已验证
- 智谱 API Key 已入 app_config（doc id：`zhipu_api_key`，供 GLM 与 embedding-3 使用）——首次使用前配置
- HBuilderX 已关联支付宝小程序云空间，云端运行模式
- **本计划对 design 的补充**：新增轻量写接口 `saveNote` / `saveQuestion`（note 编辑、掌握状态流转、引导埋点上报；design 模块划分遗漏，已追加 design 变更记录）

## 实施阶段

### 阶段 0：环境验证
**目标**：排除两个 M0 遗留的不确定性，确认 processAiTask 架构成立
**为什么先做这个**：定时触发器是异步架构命脉，不生效则阶段 2 的消费方案要推翻重来；多图批次上限影响 camera 页参数

- 步骤 0.1：部署 processAiTask 占位函数（含触发器配置），验证定时触发
- 步骤 0.2：冒烟页 4 张图实测 processOcr 总耗时，确定单批上限

**验证点**：
- 控制台每分钟出现 processAiTask 执行日志（或数据库写入心跳记录）
- 4 张图识别总耗时 < 60s（超出则 camera 上限降为 2 张并记录）

### 阶段 1：数据与身份基建
**目标**：6 个集合 schema + 设备身份 + 统一请求封装就绪
**为什么先做这个**：所有云函数与页面都被数据模型和 uid 依赖

- 步骤 1.1：新建 6 个 schema（device_user / question / note / solution_log / task_queue / embedding）+ 索引
- 步骤 1.2：registerDevice 云函数（幂等注册）
- 步骤 1.3：utils/request.js 统一 callFunction 封装 + utils/device.js uid 管理

**验证点**：
- 全部 schema 上传后控制台可见集合
- 首次调用 registerDevice 返回 uid，重复调用同 uid

### 阶段 2：云函数层全量
**目标**：5+2 个云函数完成，后端契约全部可测
**为什么先做这个**：契约先定，前端页面一次接通不做返工

- 步骤 2.1：processOcr 微调（related_id / source 透传）
- 步骤 2.2：annotateNote（拍笔记提交）
- 步骤 2.3：generateSolution（拍题提交 + 同步向量去重）
- 步骤 2.4：processAiTask（定时消费：solution / note_annotate / embed 三 handler + 重试）
- 步骤 2.5：getSolveResult（轮询/详情查询，uid 校验）
- 步骤 2.6：saveNote / saveQuestion（编辑、状态流转、埋点上报的轻量写接口）

**验证点**：
- 云端手动触发 processAiTask 能消费一条测试任务并正确落库
- GLM 结构化输出可用性确认（不可用则切换标题拆分，记录结论）

### 阶段 3：前端基建
**目标**：渲染组件、媒体工具、轮询器、首页框架就绪
**为什么先做这个**：所有页面共用这些底座

- 步骤 3.1：utils/media.js（压缩+上传，冒烟页逻辑抽取并回改冒烟页引用）
- 步骤 3.2：utils/poll.js（退避轮询器）
- 步骤 3.3：component/md-view（markdown-it + mp-html + latex/高亮）
- 步骤 3.4：home 首页改造（四入口 + 今日概览）

**验证点**：
- md-view 正确渲染含 LaTeX 公式 / 代码块 / 表格的测试 Markdown
- 首页四入口可跳转（目标页可为占位）

### 阶段 4：页面闭环
**目标**：camera / note×3 / solve / wrongbook×2 全部实装
**为什么先做这个**：依赖阶段 2 契约与阶段 3 底座

- 步骤 4.1：camera 采集页（type 区分拍题/拍笔记，六步状态流）
- 步骤 4.2：note 列表 / 详情 / 编辑
- 步骤 4.3：solve 解题页（轮询 + 两段式 + 答案门槛 + 埋点）
- 步骤 4.4：wrongbook 列表 / 详情

**验证点**：
- 拍一道真实题目走完 stage1→门槛→stage2 全流程，path_trace 落库
- 拍一篇笔记 3 分钟内完成归档并可查看渲染结果

### 阶段 5：联调与验收
**目标**：M1 验收标准逐条通过
**为什么先做这个**：收口

- 步骤 5.1：全链路联调（含失败重试、断网、重复提交场景）
- 步骤 5.2：spec 验收（妹妹独立完成拍题解题 + 笔记归档；泄露率 0/10；去重生效；标注抽检 ≥80%）

**验证点**：
- socratic-solve spec 验收标准 1-5 全通过
- capture spec 验收标准 1-4 全通过

## 并行策略
- 阶段 1 与阶段 0 可并行（互不依赖）
- 阶段 3 与阶段 2 可并行（契约由 design 数据结构章节锁定）
- 阶段 4 内 4.1→4.2 与 4.1→4.3→4.4 两条线可并行

## 风险与应对

| 风险 | 影响阶段 | 应对方案 |
|------|---------|---------|
| 定时触发器不生效（支付宝云差异） | 阶段 0/2 | 降级方案：generateSolution/annotateNote 提交尾部**同步调用**一次消费逻辑（单任务场景延迟可接受）；或提供 URL 化手动触发入口 |
| GLM 不支持 response_format JSON | 阶段 2 | D4 退化：固定二级标题拆分（Toolbox 已验证模式） |
| 多图批次超时 | 阶段 0/4 | 单批降为 2 张，camera 页提示分批拍摄 |
| 向量去重误报/漏报 | 阶段 2/5 | 阈值 execute 时以 Toolbox semanticSearch 实测参数校准；误报不阻塞（可强制提交） |
| processAiTask 单次消费积压 | 阶段 2 | 每次触发循环消费最多 5 条（总耗时控制在触发器间隔内） |
| md-html latex 插件渲染不佳 | 阶段 3 | 保底方案：迁移 Toolbox renderLatex 云函数出 SVG（M0 同款服务端思路） |

## 变更记录
| 日期 | 作者 | 变更内容 |
|------|------|---------|
| 2026-09-14 | yuanchuang | 初始版本（6 阶段，含 M0 遗留验证项为阶段 0） |
