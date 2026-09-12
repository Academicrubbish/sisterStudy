# sisterStudy — 项目指令

## 项目概述

**sisterStudy** 是为开发者妹妹（初中生）定制的学习机 App（安卓平板），替代商业学习机。核心功能：拍照解题（苏格拉底式引导）、错题本、手写笔记归档、出题工作流（真题优先）、间隔复习、薄弱点分析、家长区。

单用户单设备，无登录体系（设备注册生成 uid）。配合平板系统级未成年人模式使用。

**技术栈**：uni-app（**Vue 3 + 选项式 API**）+ uniCloud（**支付宝小程序云**）+ markdown-it & mp-html（渲染）+ 智谱 GLM（解题/出题，含 web_search_tool 联网搜真题）+ 智谱 embedding-3（向量化）+ 阿里云百炼 qwen3.6-flash（视觉识题/识笔记）

> 项目由 Toolbox（微信小程序，姐姐项目：D:\mySpace\Toolbox）的云函数模式迁移而来，需求来源见 [docs/requirements-draft.md](docs/requirements-draft.md)。

## 开发流程

遵循 **Spec → Design → Plan → Execute** 流程，文档在 `docs/<feature>/`。
新功能开发使用 taiji 系列技能（taiji-spec / taiji-design / taiji-plan / taiji-execute）。

## 项目结构

**现状**：演示模板已于 2026-09-12 清理完毕（基线 commit 2be505d 可恢复）。当前处于 **M0 冒烟阶段**：`pages/home/index.vue` 为冒烟测试页，`processOcr` 云函数已从 Toolbox 迁移（axios 调百炼 qwen3.6-flash，环境变量 `QWEN_API_KEY`），`ocr_log` / `ai_call_logs` / `ai_alerts` 三个 schema 已就绪。uni_modules 仅保留 6 个基础组件库。

**目标结构**：

```
api/                    # 数据库操作层（每个集合一个文件）
component/              # 公共组件
pages/
  home/                 # 首页（待复习数 + 快捷入口）
  camera/               # 拍照识题/识笔记
  solve/                # 解题引导页（状态机）
  wrongbook/            # 错题本
  note/                 # 笔记归档
  exercise/             # 练习作答
  review/               # 间隔复习
  report/               # 薄弱点分析
  parent/               # 家长区（口令进入）
styles/tokens.scss      # 设计 tokens
utils/                  # 工具函数
uniCloud-alipay/        # 云开发（云函数 + 数据库 schema）
```

## 架构约束

### uniCloud 支付宝小程序云（与 Toolbox 的阿里云版有差异）
- **定时触发器可用**，单次最长运行 3 小时（异步任务队列架构成立）
- 云对象、clientDB/JQL 可用（模板已验证）
- **云函数 return 后逻辑立即终止**，异步任务必须采用 **定时触发器 + 任务队列** 方案
- ⚠️ **M0 需验证**（从 Toolbox 搬运云函数时）：
  1. 云函数环境变量是否支持（不支持则 API Key 改用加密配置集合，schema 禁止客户端读）
  2. HTTP 触发云函数的超时上限（影响 processOcr 多图识别批次大小）
  3. `uniCloud.httpclient` 兼容性（不支持则改用 axios/https 调 GLM、百炼）
- API Key 禁止暴露在客户端

### 数据库集合（规划，spec 阶段细化）

| 集合 | 说明 |
|------|------|
| `device_user` | 设备用户（uid、家长口令哈希） |
| `question` | 错题/题目（知识点、根因、掌握状态、origin） |
| `note` | 手写笔记归档（Markdown、知识点标注） |
| `practice_log` | 练习题（source_type 真题/AI、来源、作答结果） |
| `solution_log` | 解题记录（引导树 JSON + 路径埋点） |
| `task_queue` | 异步任务队列（task_type: solution/exercise/embed） |
| `embedding` | 向量表（note/question/practice 实体） |
| `review_schedule` | SM-2 复习调度 |

### AI 功能架构
- 提交任务：云函数只写 `task_queue` 立即返回
- 消费任务：定时触发器云函数调 AI API（智谱 GLM / 百炼 qwen3.6-flash / embedding-3）
- 状态流转：`pending` → `processing` → `done` / `failed`
- 解题输出为**引导树 JSON**（苏格拉底式阶梯，客户端状态机逐级揭示），规范见 [ai-product-principles.md](.claude/rules/ai-product-principles.md)

## 编码规范

详细规范见 `.claude/rules/` 目录：
- [code-style.md](.claude/rules/code-style.md) — 代码风格（Vue 3 选项式、API 层、样式 tokens）
- [commit-convention.md](.claude/rules/commit-convention.md) — Commit 格式（`<type>(<scope>): <subject>`，subject 中文）

### 关键规范速查
- Vue 3 + **选项式 API**；函数 ≤ 80 行，Vue 文件 ≤ 500 行
- API 层 `getRequest()` 延迟初始化；**无 withAuth**（单用户），请求附带本地 uid
- 样式用 `rpx` + `scoped`，统一走 `styles/tokens.scss`
- 面向初中生：大字号、大点击区域（≥ 88rpx）

## 产品定位与 AI 教学原则

**所有 AI 功能的准入标准**：统一检验问题「这个功能是在替她思考，还是让她思考？」
详见 [ai-product-principles.md](.claude/rules/ai-product-principles.md) —— 苏格拉底式引导规范、答案门槛、结构化选项即诊断数据、prompt 硬约束。

## 常见模式

### API 文件模板（Vue 3，无登录体系）
```javascript
const getRequest = () => {
  if (typeof uniCloud === 'undefined' || !uniCloud.database) {
    throw new Error('uniCloud 未初始化，请确保在应用启动后再调用数据库操作')
  }
  return uniCloud.database().collection('question')
}

/** 获取错题列表 */
exports.getQuestionList = (uid, params) => {
  return getRequest().where({ uid }).skip(params.skip).limit(params.limit).get()
}
```

### 云函数模板
```javascript
'use strict'
exports.main = async (event, context) => {
  const db = uniCloud.database()
  // 业务逻辑...
  return { code: 0, message: 'success', data: {} }
}
```

### 异步任务模式（从 Toolbox 迁移）
提交函数（客户端调用，只写队列）→ 消费函数（**定时触发器**，状态流转 pending→processing→done/failed）→ 客户端轮询结果。参考 Toolbox 的 generateLearnNote / processLearnNote 实现。
