---
title: 拍照采集基础能力
parent: ../spec.md
status: draft
created: 2026-09-12
updated: 2026-09-12
author: yuanchuang
---

# 拍照采集基础能力 Spec

## 背景

App 有两个内容采集入口——拍错题（作业不会的题）和拍手写笔记（课堂/课后归档），共用同一条 OCR 识别链路。该链路从 Toolbox 的 processOcr 云函数迁移（百炼 qwen3.6-flash 视觉模型，OpenAI 兼容接口，多图并行识别后合并 Markdown），在 Toolbox 已上线验证。本子需求是全项目的基础能力层，对应里程碑 M0（冒烟验证）。

## 目标

提供「设备注册 → 拍照/选图 → 上传云存储 → OCR 识别 → 人工修正 → 按类型提交」的完整采集链路，输出可信的 Markdown 内容 + 归档原图，供 socratic-solve（解题）和 note（归档）两个下游场景消费。

## 功能描述

### 设备身份
- 首次启动调用 registerDevice 云函数生成 uid（格式如 `device:xxxx`），写入 device_user 集合并本地缓存
- 单用户单设备，无登录体系；后续所有请求附带 uid
- device_user 同时存储家长口令哈希（家长区校验用，见 review-report）

### 拍照采集
- 拍照或相册选图，单批次支持多张（一题多角度 / 笔记多页）
- 图片压缩后上传云存储，记录文件路径
- 单批次图片数上限由 M0 超时验证结果确定（初定 4 张）

### OCR 识别（processOcr 迁移改造）
- 客户端调用 processOcr，携带云存储图片路径列表 + 采集类型（question / note）
- 云函数并行调百炼 qwen3.6-flash 识别每张图，合并输出 Markdown
- 返回识别结果 + 每图耗时；识别任务写入日志集合（用量监控）
- **M0 验证项**（迁移时逐项确认，不通过则启用备选方案）：
  1. 云函数环境变量是否支持 → 不支持则 API Key 改用加密配置集合（schema 禁止客户端读）
  2. HTTP 触发云函数超时上限 → 决定单批次图片数与是否需队列化
  3. uniCloud.httpclient 兼容性 → 不支持则改用 axios / https 调外部 API

### 识别结果修正
- 修正页左侧原图对照、右侧 textarea 编辑识别文本
- 数学公式以 LaTeX 语法呈现（`$...$`），可手动修正
- 确认无误后按采集类型提交（进入对应下游流程）

### 用量监控
- 每次外部 API 调用记录：类型、token 数/图片数、耗时、时间戳
- 迁移 Toolbox checkAiAlert 思路：日/月用量超阈值告警（写入告警集合，家长区展示）

## 边界条件

- 手写体、几何图形题识别质量不可控 → 修正页是必要兜底，识别结果永远允许人工修正后才提交
- 识别失败/超时：明确报错并保留原图，允许重试，不产生半成品数据
- 不做语音输入、文件导入、链接导入（Toolbox 有 parseWechatArticle，本项目不带）
- 图片存储按月清理策略：仅保留题目原图与笔记原图，中间产物不落库

## 验收标准

1. M0 冒烟：妹妹真实作业照片 10 张 + 手写笔记 10 张，识别结果经轻度修正后可用（哥哥人工评审，通过率 ≥ 80%）
2. 全链路：拍照 → 提交后，云存储有原图、识别日志有记录、下游收到 Markdown 文本
3. 断网/失败场景有明确提示，可重试
4. 单次采集全流程（拍照到提交）≤ 2 分钟

## 关联信息
- 需求来源：docs/requirements-draft.md（v0.2）F4/F5 采集部分、M0 里程碑
- 依赖：无（基础层）
- 关联 spec：[socratic-solve](../socratic-solve/spec.md)、[note](../note/spec.md) 消费采集产出；迁移参考 Toolbox `uniCloud-aliyun/cloudfunctions/processOcr`

## 变更记录
| 日期 | 作者 | 变更内容 |
|------|------|---------|
| 2026-09-12 | yuanchuang | 初始版本 |
