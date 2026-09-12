---
title: 解题引导与错题本
parent: ../spec.md
status: draft
created: 2026-09-12
updated: 2026-09-12
author: yuanchuang
---

# 解题引导与错题本 Spec

## 背景

拍照解题是 App 的核心功能，也是"先提示后答案"原则的主要载体。用户（妹妹）自制力不高，若拍照直接出完整答案，软件会加速抄作业——因此解题输出必须是苏格拉底式引导：一次 LLM 调用预生成完整「引导树」，客户端按状态机逐级揭示，不二次调用（适配定时触发器异步架构，零额外延迟）。架构模式迁移自 Toolbox generateLearnNote / processLearnNote（任务队列 + 定时消费 + 一次调用产出多结果）。

## 目标

妹妹拍一道不会的题后，通过由远及近的引导阶梯自己推出答案；过程数据（每级选择、提示次数、卡点）沉淀为错题根因与复习调度的依据；题目自动进入错题本并向量化供去重与召回。

## 功能描述

### 异步解题链路
- generateSolution（客户端调用）：创建 question 记录（origin=photo，状态待解决）+ 写 task_queue（task_type=solution，含题目 Markdown、科目、年级、学生画像）后立即返回 batchId
- processSolution（定时触发器消费）：pending → processing → 调智谱 GLM 生成引导树 JSON → 拆分写入 solution_log → done / failed（含 error_msg，失败可重试）
- 客户端轮询 batch 状态，完成后进入引导页

### 引导树结构（GLM 输出契约）
```json
{
  "knowledge_point": "考察知识点（1-2 个）",
  "subject": "科目",
  "diagnostic": { "question": "这道题在考什么？", "options": ["A", "B", "C", "不确定"], "answer_index": 0, "misconception_map": { "1": "概念模糊", "2": "思路偏差" } },
  "ladder": [
    { "question": "引导问题（第 1 级只问题目条件/目标，任何人能答）", "options": ["..."], "answer_index": 0, "hint": "再具体一点的提示", "hint_if_wrong": "针对错误选项的误解解释" }
  ],
  "full_solution": ["步骤 1", "步骤 2"],
  "answer": "最终答案（仅允许出现在此字段）",
  "root_cause_guess": "错误根因初判（概念模糊/思路偏差/计算习惯）",
  "self_check": "模型自检：答案是否在 question/hint/options 中泄露"
}
```
- ladder 共 3~5 级，由远及近，最后一级只差一步计算
- 错误选项必须对应真实常见误解并映射根因
- prompt 注入学生画像：年级 + 该知识点历史错误根因（从错题本聚合）

### 客户端引导状态机
```
S0 题目展示 → S1 诊断提问（选项）→ S2..Sn 阶梯逐级揭示
  ├─ 选对 → 下一级
  ├─ 选错 → 分支提示（hint_if_wrong）→ 重试或降级
  ├─ 「再提示一点」→ 本级 hint
  └─ 「直接看完整讲解」→ 记录卡点 = 第 n 级
SGate 答案门槛：「你算出的答案是？」（输入/选项，可跳过但记录）
  → 揭示完整分步讲解 + 答案对照 → S5 同类练习一道
```
- 分期实现：M1 简化两段式（诊断+提示 → 完整解答）；M2 完整阶梯 + 结构化选项 + 分支
- 乱点检测：连续快速选错触发「先想一想再选哦」提示

### 路径埋点（传感器）
- solution_log 记录引导树 JSON + 引导路径：每级选项、提示次数、卡点级别、是否跳过答案门槛、总耗时
- 根因判定从「AI 初判」升级为「行为计算值」：诊断错 → 概念模糊；方向选项错 → 思路偏差；方向对答案错 → 计算习惯

### 错题本
- 列表：按科目 / 知识点 / 时间 / 来源（photo 拍题、practice 练习、review 复习）筛选
- 详情：题目原文 + 原图、讲解、当前掌握状态、引导路径回顾
- 掌握状态流转：未解决 → 已解决（手动或复习通过）
- 拍题去重：提交时新题 embedding 与历史 question 比对，相似度高于阈值提示「这道题你拍过」并关联历史记录（复用 semanticSearch 混合检索模式）
- 解题完成后自动向量化入 embedding 集合

### 解题历史
- 按 batch 查看历史解题记录列表，可回看引导过程

## 边界条件

- **答案永不泄露**：最终答案只允许出现在 answer 字段；维护 10 道真题回归测试集，每次改 prompt 跑一遍，泄露率必须 0/10
- 引导树 JSON 解析失败 → 降级为两段式纯文本展示，保证功能可用
- 学科适配：数学/理科用完整阶梯；文科（概念记忆类）阶梯更短更粗，由 prompt 按题型自适应
- 生成失败允许重试 2 次，仍失败则标记 failed 并通知用户稍后再试

## 验收标准

1. 妹妹独立完成一次完整拍题解题（含诊断提问、至少 1 级引导、答案门槛）
2. 回归测试集答案泄露率 0/10；阶梯递进性人工评审通过
3. 每次解题的引导路径埋点完整落库（缺字段率 0）
4. 同一道题重拍触发去重提示
5. AI 自动标注科目/知识点抽检 10 题准确率 ≥ 80%

## 关联信息
- 需求来源：docs/requirements-draft.md（v0.2）F1/F2/F3 + 苏格拉底式引导设计讨论
- 依赖：[capture](../capture/spec.md)（采集产出）
- 关联 spec：[exercise](../exercise/spec.md) 复用错题与作答组件；[review-report](../review-report/spec.md) 消费埋点数据；迁移参考 Toolbox generateLearnNote / processLearnNote / semanticSearch

## 变更记录
| 日期 | 作者 | 变更内容 |
|------|------|---------|
| 2026-09-12 | yuanchuang | 初始版本（含引导树 JSON 契约与状态机） |
