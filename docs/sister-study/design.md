---
title: M1 学习闭环（拍照采集 · 解题引导 · 笔记归档）
spec: ./spec.md
status: draft
created: 2026-09-14
updated: 2026-09-14
author: yuanchuang
---

# M1 学习闭环 Design

## 需求简述

M1 覆盖三个子 spec：[capture 拍照采集](capture/spec.md)、[socratic-solve 解题引导与错题本](socratic-solve/spec.md)（M1 简化两段式）、[note 笔记归档](note/spec.md)。交付妹妹可日常使用的完整闭环：拍错题 → 苏格拉底式两段引导解题 → 错题沉淀；拍手写笔记 → AI 标注归档。三个子需求共享数据模型、任务队列与页面骨架，故合并为一份设计。

M0 已落定的硬约束（本设计全程遵循）：视觉调用 base64 内联、客户端图片压缩（1600px/q70）、API Key 双通道（环境变量优先 + app_config 集合）、schema 一律 permission:false 读写全走云函数。

## 业务逻辑

### 模块划分

| 层 | 模块 | 说明 |
|----|------|------|
| 页面 | `pages/home` | M1 首页：今日概览（错题数/笔记数）+ 四个入口（拍题/拍笔记/错题本/笔记） |
| 页面 | `pages/camera` | 采集页（拍题/拍笔记共用，`type=question\|note` 参数区分）：选图→压缩→上传→OCR→修正→提交 |
| 页面 | `pages/solve` | 解题引导页：轮询等待 → stage1 思路引导 → 答案门槛 → stage2 完整解答+同类练习 → 埋点上报 |
| 页面 | `pages/wrongbook` | 错题本列表（按科目/掌握状态筛选）+ 详情（原图/讲解/引导回顾） |
| 页面 | `pages/note` | 笔记列表 + 详情（md 渲染+标签）+ 编辑（textarea 修正） |
| 组件 | `component/md-view` | markdown-it（客户端解析）+ mp-html（渲染，latex/代码高亮插件）——M1 核心 UI 投资，全场景共用 |
| 工具 | `utils/device.js` | uid 首次注册（registerDevice）与本地缓存 |
| 工具 | `utils/media.js` | 图片压缩（>1600px→1600px/q70）+ 云存储上传 + 失败重试（从冒烟页抽取） |
| 工具 | `utils/poll.js` | 任务轮询器（3s 起步退避至 8s，上限 5 分钟） |
| API | `api/question.js` `api/note.js` `api/solution.js` `api/device.js` | callFunction 封装层（schema 全禁客户端直连，无 clientDB） |
| 云函数 | `registerDevice` | 生成 uid 写 device_user，幂等（传回已有 uid 则复用） |
| 云函数 | `processOcr`（已有） | 微调：写入 related_id、source 透传 |
| 云函数 | `generateSolution` | 拍错题提交：同步 embedding 去重检查 → 创建 question + solution_log → 写 task(solution)，立即返回 |
| 云函数 | `annotateNote` | 拍笔记提交：创建 note → 写 task(note_annotate)，立即返回 |
| 云函数 | `processAiTask` | **定时触发器统一消费**，按 task_type 分发：solution（GLM 两段式生成）/ note_annotate（标注+摘要）/ embed（向量化） |
| 云函数 | `getSolveResult` | 轮询/详情查询（solution_log/question/note 按 uid 校验） |

### 设计决策

**D1 统一任务消费者 processAiTask**（偏离 Toolbox 每类一个消费函数的模式）：单一定时触发器内按 task_type 分发 handler。理由：支付宝云触发器配置方式未验证（M0 遗留项），一个触发器最稳；M2 增加 exercise 只需加 handler 不加触发器。代价是单 handler 失败影响其他类型——通过 retry_count 与 error_msg 隔离。

**D2 schema 全部 permission:false，读写全走云函数**：无登录体系下 clientDB 无法做身份校验，任何拿到空间信息的人都可匿名读。单用户场景数据面小，但原则不破例。云函数内部统一校验 `event.uid` 合法性（存在且属于 device_user）。

**D3 拍题去重在提交时同步做**：generateSolution 内联调智谱 embedding-3（<1s 可同步）+ 相似度比对，高相似返回「拍过」提示并携带历史 question 供关联，不阻塞提交（用户可选择仍提交或查看旧题）。

**D4 引导内容输出格式**：优先尝试 GLM `response_format: json_object`（结构化输出，含 markdown 字段：stage1_hint/stage2_full/similar_exercise/meta）；execute 阶段验证智谱支持性，不支持则退化 Toolbox 模式——固定二级标题（`## 一、思路引导` / `## 二、完整解答` / `## 三、同类练习`）拆分，元数据放首行 JSON 行。

### 核心流程

```mermaid
flowchart TD
    A[首页] -->|拍错题| B["camera(type=question)"]
    A -->|拍笔记| C["camera(type=note)"]
    A -->|错题本| W[wrongbook 列表/详情]
    A -->|笔记| N[note 列表/详情/编辑]
    B --> B2[选图→压缩→上传→OCR→textarea修正]
    C --> C2[选图→压缩→上传→OCR→textarea修正]
    B2 --> D[generateSolution<br>向量去重检查→创建question→写队列→返回batchId]
    C2 --> E[annotateNote<br>创建note→写队列→返回batchId]
    D --> F["processAiTask(定时)<br>solution: GLM两段式生成+知识点标注"]
    E --> G["processAiTask(定时)<br>note_annotate: 标注科目/知识点/摘要<br>→ 追加 embed 任务"]
    F --> H[solve页轮询getSolveResult<br>展示 stage1 思路引导]
    H --> I{答案门槛<br>提交自己的答案可跳过记录}
    I --> J[stage2 完整解答+同类练习]
    J --> K[更新question标注+status<br>path_trace 埋点落库]
    G --> L[note 详情渲染+标签展示]

## 时序图

解题核心链路（笔记链路同构，省略）：

```mermaid
sequenceDiagram
    participant C as 客户端
    participant O as processOcr
    participant G as generateSolution
    participant P as processAiTask(定时)
    participant AI as GLM/百炼/embedding
    C->>C: 选图→压缩→上传云存储
    C->>O: imageUrls(fileIDs)
    O->>AI: base64 内联调 qwen3.6-flash
    AI-->>O: Markdown 题目文本
    O-->>C: content + ocrLogId
    C->>C: textarea 修正
    C->>G: 修正后题目 + uid
    G->>AI: embedding-3 向量化(同步)
    G->>G: 相似度比对历史 question
    G->>G: 创建 question + solution_log(pending)<br>写 task_queue(solution)
    G-->>C: batchId（含去重提示，立即返回）
    Note over P: 定时触发，单条消费
    P->>P: pending→processing
    P->>AI: GLM 生成两段式+标注+同类练习
    AI-->>P: 结构化结果
    P->>P: 更新 solution_log(success)<br>+ question 标注 + done
    C->>C: 轮询 getSolveResult(3s退避)
    C->>C: stage1 引导→答案门槛→stage2→埋点上报
```

## 数据结构

M1 新建/沿用集合（全部 permission:false，仅云函数读写；embedding 存储结构以 Toolbox `processEmbedding`/`semanticSearch` 源码迁移为准）：

**device_user** — 设备用户
| 字段 | 类型 | 说明 |
|------|------|------|
| uid | string | `device:` 前缀自生成 ID |
| device_info | string | 型号等（可选） |
| last_active_time | long | 活跃时间 |
| parent_pwd_hash | string | 家长口令哈希（M1 仅预留不启用） |
| create_time | long | |

**question** — 错题/题目
| 字段 | 类型 | 说明 |
|------|------|------|
| content_md | string | 题目 Markdown |
| image_file_ids | array | 原图 fileID |
| subject | string | 科目（AI 标注） |
| knowledge_points | array | 知识点（AI 标注，可手动修正） |
| root_cause | string | 错误根因初判（概念模糊/思路偏差/计算习惯） |
| status | string | unresolved / resolved |
| origin | string | M1 固定 photo（M2 扩展 practice/review） |
| ocr_log_id | string | 关联 ocr_log |
| uid | string | |
| create_time / update_time | long | |

**note** — 笔记
| 字段 | 类型 | 说明 |
|------|------|------|
| content_md | string | 笔记 Markdown |
| image_file_ids | array | 原图 |
| subject | string | AI 标注 |
| knowledge_points | array | AI 标注，可修正 |
| summary | string | 一句话摘要（AI） |
| uid | string | |
| create_time / update_time | long | |

**solution_log** — 解题记录
| 字段 | 类型 | 说明 |
|------|------|------|
| question_id | string | |
| stage1_hint | string | 思路引导 Markdown（知识点定位+提示+引导提问） |
| stage2_full | string | 完整分步讲解+最终答案 Markdown |
| similar_exercise | string | 同类练习一道（含答案） |
| meta | object | {subject, knowledge_points, root_cause, grade}（M2 扩展完整引导树 ladder） |
| path_trace | object | {gave_up_stage, skipped_gate, duration_ms}（M2 扩展每级选项路径） |
| status | string | pending / success / error |
| error_msg | string | |
| batch_id | string | |
| create_time / complete_time | long | |
| uid | string | |

**task_queue** — 统一任务队列
| 字段 | 类型 | 说明 |
|------|------|------|
| task_type | string | solution / note_annotate / embed（M2 加 exercise） |
| ref_id | string | solution_log._id 或 note._id |
| payload | object | {content, question_id?, grade} |
| status | string | pending / processing / done / failed |
| retry_count | int | 上限 2 |
| error_msg | string | |
| create_time / update_time | long | |

**embedding** — 向量
| 字段 | 类型 | 说明 |
|------|------|------|
| entity_type | string | question / note |
| entity_id | string | |
| vector | array | embedding-3 输出 |
| create_time | long | |

## 边界情况

| 场景 | 处理 |
|------|------|
| OCR 拍到无关内容（非题目/笔记） | processOcr 返回内容后由 AI 在 solution 生成时判断：GLM prompt 含「若内容不是有效题目，返回 not_a_question 标记」，客户端提示重拍 |
| 引导内容拆分失败（D4 退化方案标题缺失 / JSON 解析失败） | 整体内容降级为 stage1 展示（纯文本），meta 标注置空，功能不中断 |
| 同一题重拍 | D3 去重提示「这道题你拍过」+ 历史关联；用户可坚持提交（生成新记录）或查看旧题 |
| 多图批次超时 | M0 未验证项：M1 单批上限 4 张，首个真实多图任务实测 processOcr 总耗时，若超限降为 2 张并在 camera 页提示 |
| 压缩失败 | 回退原图上传（utils/media 内置） |
| uid 缺失/非法 | 所有云函数入口校验 uid 存在于 device_user，不合法返回特定错误码，客户端引导重新注册 |
| 重复提交（双击/重试） | batchId 客户端去抖 + 服务端 question 按 ocr_log_id 幂等（同 ocr_log_id 已有 pending 任务则拒绝重复提交） |
| 定时触发器不生效 | M0 遗留验证项：部署后用控制台手动触发一次 processAiTask 验证；不生效则排查触发器配置（这是 M1 最高优先级验证） |
| 笔记被删除时已被 embedding 引用 | M1 物理删除并同步删 embedding 记录（无 practice_log 关联，M2 再改快照策略） |

## 错误处理

- **云函数统一返回** `{code, message, data}`；code=0 成功，-1 业务错误（message 直接可展示）
- **processAiTask 失败处理**：AI 调用异常 → retry_count+1 重新入 pending；≥2 次转 failed + error_msg，solution_log/note 同步置 error，客户端轮询到 error 展示「生成失败，点击重试」（重试=新建任务）
- **AI 调用监控沿用 M0 模式**：ai_call_logs 记录 fn=solution/note_annotate/embed 的 token/耗时/状态；single_burst 告警阈值沿用 20000
- **客户端**：buildFriendlyError 翻译常见错误（沿用冒烟页模式）；所有请求 try-catch，失败不丢用户已修正的文本（暂存 data）

## 扩展性设计

| 扩展点 | M1 设计 | M2 演进 |
|--------|--------|--------|
| task_type 枚举 | solution / note_annotate / embed | + exercise（出题工作流：搜真题+生成+自验） |
| solution_log.meta | 两段式字段 + meta 对象 | 完整引导树 ladder（diagnostic+3~5 级+分支），path_trace 每级选项 |
| question.origin | photo | + practice（练习做错）/ review（复习做错） |
| review_schedule | 不建 | M2 建（SM-2 字段） |
| md-view 组件 | 组件化渲染 markdown | 家长区报告、出题展示复用 |

## 性能设计

| 项 | 设计 |
|----|------|
| 图片体积 | 客户端压缩 1600px/q70（M0 已验证），单批 ≤4 张 |
| OCR | 云函数内 per-image 并行调 qwen3.6-flash（M0 模式），base64 内联 |
| 解题等待 | 轮询 3s→5s→8s 退避，上限 5 分钟转「稍后在错题本查看」；GLM 生成 timeout 300s（Toolbox 验证值），定时触发器 3h 上限内 |
| 任务消费 | 单条串行消费（processing 标记防重复），触发器频率 1 分钟——用户体感等待 ≈ 生成时间 + 最多 1 分钟触发延迟 |
| 列表分页 | wrongbook/note 列表 skip/limit 分页，20 条/页 |
| 索引 | task_queue(status+create_time)、question(uid+create_time)、note(uid+create_time)、solution_log(batch_id)、embedding(entity_type+entity_id) |

## 变更记录
| 日期 | 作者 | 变更内容 |
|------|------|---------|
| 2026-09-14 | yuanchuang | 初始版本（M1 范围：capture + socratic-solve 简化两段式 + note） |
| 2026-09-14 | yuanchuang | plan 阶段补充：云函数清单增加 saveNote / saveQuestion（note 编辑保存、掌握状态流转、引导埋点上报的轻量写接口，补模块划分遗漏） |
