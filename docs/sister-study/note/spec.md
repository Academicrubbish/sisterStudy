---
title: 笔记归档
parent: ../spec.md
status: draft
created: 2026-09-12
updated: 2026-09-12
author: yuanchuang
---

# 笔记归档 Spec

## 背景

独立于错题的笔记功能：妹妹直接拍手写笔记（课堂笔记、课后整理），OCR 识别后归档管理。笔记是 App 的第二内容实体，与错题共享同一套「科目/知识点」标签体系——这使「笔记 × 错题」交叉分析（review-report）和「基于自己笔记出题」（exercise）成为可能，也是个性化注入（prompt 引用她自己的笔记内容）的数据来源。

## 目标

手写笔记拍照 → OCR → 修正 → 归档（AI 自动标注科目/知识点）→ 向量化，形成可检索、可被出题工作流引用的个人知识沉淀。

## 功能描述

### 笔记采集与归档
- 复用 capture 链路拍照（多页多图）→ OCR → textarea 修正 → 提交为 note 类型
- 归档任务（task_queue，task_type=embed 或同步小任务）：AI 生成科目、知识点数组、一句话摘要，写入 note 集合
- 标注结果可手动修正（知识点标签编辑，标签体系为自由文本 + AI 建议，不建独立标签集合）
- 笔记自动向量化入 embedding 集合（processEmbedding 定时消费，迁移自 Toolbox）

### 笔记管理
- 列表：按科目 / 知识点 / 时间筛选，支持搜索（关键词 + 语义搜索，复用 semanticSearch 模式）
- 详情：Markdown 渲染（markdown-it + mp-html，公式走 LaTeX 插件、复杂公式 renderLatex 云函数 SVG 兜底）+ 原图对照查看
- 编辑：textarea 修正内容、调整标注；更新后重新向量化
- 删除：软删除或物理删除 + 清理 embedding 记录（注意与引用它的 practice_log 的关联处理）

### 相关推荐
- 笔记详情页展示相关错题（同知识点的 question）——为交叉分析提供入口

## 边界条件

- 不做富文本/重型 Markdown 编辑器（textarea 修正即可，妹妹的输入主通道是拍照）
- 笔记不做分享、导出（个人沉淀场景）
- 手写笔记 OCR 质量依赖修正页兜底（同 capture 边界）
- 笔记删除时如已被 practice_log 引用（related_note_id），保留快照不级联删除

## 验收标准

1. 拍 3 页手写笔记 → 修正 → 归档全流程 ≤ 3 分钟
2. AI 自动标注科目/知识点抽检 10 篇准确率 ≥ 80%，可手动修正
3. 笔记详情公式、代码块渲染正常（含 LaTeX 行内/块级）
4. 语义搜索：用不同表述能搜到目标笔记（同义词测试 5 组通过 4 组）
5. 笔记更新后 embedding 同步刷新

## 关联信息
- 需求来源：docs/requirements-draft.md（v0.2）F5（v0.2 新增独立笔记需求）
- 依赖：[capture](../capture/spec.md)（采集产出）；processEmbedding / semanticSearch 云函数（自 Toolbox 迁移）
- 关联 spec：[exercise](../exercise/spec.md)（出题引用笔记）、[review-report](../review-report/spec.md)（交叉分析）

## 变更记录
| 日期 | 作者 | 变更内容 |
|------|------|---------|
| 2026-09-12 | yuanchuang | 初始版本 |
