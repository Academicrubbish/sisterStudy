---
title: M1 学习闭环任务清单
plan: ./plan.md
status: draft
created: 2026-09-14
updated: 2026-09-14
author: yuanchuang
---

# M1 学习闭环任务清单 Tasks

> 完成标准：每个 Task 的实现内容完成 + 测试用例全部通过。

## Task 列表

### Task 1：processAiTask 占位与定时触发器验证（阶段 0-步骤 0.1）
- **操作类型**：新增
- **涉及文件**：
  - `uniCloud-alipay/cloudfunctions/processAiTask/index.js`（新增，占位实现）
  - `uniCloud-alipay/cloudfunctions/processAiTask/package.json`（新增，含 triggers 配置）
- **实现内容**：
  - 占位 main：写心跳 `{type:'heartbeat', time}` 到 ai_alerts（复用集合，rule='timer_heartbeat'）并 console.log
  - 触发器：HBuilderX 云函数目录右键 → 管理触发器/或 package.json `triggers` 数组，每分钟一次（支付宝云格式以控制台为准）
- **测试用例**：
  - 用例 1：上传部署 + 配置触发器后等待 2 分钟 → uniCloud 控制台云函数日志每分钟一条、ai_alerts 出现心跳记录
  - 用例 2：手动「云端运行」一次 → 立即出现一条心跳（排除部署问题）
- **依赖**：无

### Task 2：多图批次耗时实测（阶段 0-步骤 0.2）
- **操作类型**：验证（不改代码）
- **涉及文件**：无（使用现有冒烟页）
- **实现内容**：
  - 冒烟页一次选 4 张真实笔记图实测；记录总耗时与每阶段耗时到 design 变更记录
  - 结论回写：camera 页 MAX_IMAGES 定 4 或 2
- **测试用例**：
  - 用例 1：4 张图识别总耗时 < 60s → MAX_IMAGES=4；≥ 60s → MAX_IMAGES=2 并更新 design
- **依赖**：无

### Task 3：六个集合 schema 与索引（阶段 1-步骤 1.1）
- **操作类型**：新增
- **涉及文件**：
  - `uniCloud-alipay/database/{device_user,question,note,solution_log,task_queue,embedding}.schema.json`（新增 ×6）
- **实现内容**：
  - 字段定义按 design「数据结构」章节逐字段落地；全部 `permission: false`
  - 索引：task_queue(status+create_time)、question(uid+create_time)、note(uid+create_time)、solution_log(batch_id)、embedding(entity_type+entity_id)
- **测试用例**：
  - 用例 1：上传全部 schema → 控制台可见 6 个新集合及索引
- **依赖**：无

### Task 4：registerDevice 云函数（阶段 1-步骤 1.2）
- **操作类型**：新增
- **涉及文件**：
  - `uniCloud-alipay/cloudfunctions/registerDevice/index.js`（新增）
- **实现内容**：
  - `main(event: { uid?: string })`：uid 存在于 device_user → 更新 last_active_time 返回原 uid；否则生成 `device:` + 随机串 add 并返回
  - 返回 `{code:0, data:{uid}}`
- **测试用例**：
  - 用例 1：无 uid 调用 → 返回 `device:` 前缀 uid，device_user 新增一条
  - 用例 2：携带已有 uid 再次调用 → 返回相同 uid，不新增记录
- **依赖**：Task 3

### Task 5：统一请求封装与 uid 管理（阶段 1-步骤 1.3）
- **操作类型**：新增
- **涉及文件**：
  - `utils/request.js`（新增）
  - `utils/device.js`（新增）
  - `api/device.js`（新增）
- **实现内容**：
  - `callFn(name, data): Promise<payload>`：统一 callFunction、code!==0 抛 Error(message)、网络错误翻译
  - `getUid(): Promise<string>`：getStorageSync('uid') 命中直接返回 → 未命中调 registerDevice 并缓存
  - `api/device.js`：`registerDevice(uid?)` 封装
- **测试用例**：
  - 用例 1：首次 getUid → 返回 uid 且本地缓存有值；杀进程再调 → 直接读缓存不再请求
  - 用例 2：云函数返回 code:-1 → callFn 抛出且 message 可读
- **依赖**：Task 4

### Task 6：processOcr 微调（阶段 2-步骤 2.1）
- **操作类型**：修改
- **涉及文件**：
  - `uniCloud-alipay/cloudfunctions/processOcr/index.js`（修改）
- **实现内容**：
  - event 增加 `related_id`，创建 ocr_log 时写入；source 参数透传校验（question/note 白名单）
- **测试用例**：
  - 用例 1：携带 related_id 与 source=note 调用 → ocr_log 记录字段正确
  - 用例 2：source=other → 仍默认 question 或报参数错误（二选一，实现后回归）
- **依赖**：无

### Task 7：annotateNote 云函数（阶段 2-步骤 2.2）
- **操作类型**：新增
- **涉及文件**：
  - `uniCloud-alipay/cloudfunctions/annotateNote/index.js`（新增）
- **实现内容**：
  - `main(event: {content, imageFileIds, uid})`：校验 uid ∈ device_user、content 非空
  - 创建 note（subject/knowledge_points 置空待标注，summary=''）+ task_queue(task_type='note_annotate', ref_id=noteId)
  - 返回 `{code:0, data:{noteId, batchId}}`（batchId 复用 task._id）
- **测试用例**：
  - 用例 1：合法提交 → note 与 task 各一条，任务 pending
  - 用例 2：uid 非法 → code:-1「设备未注册」
- **依赖**：Task 3

### Task 8：generateSolution 云函数（阶段 2-步骤 2.3）
- **操作类型**：新增
- **涉及文件**：
  - `uniCloud-alipay/cloudfunctions/generateSolution/index.js`（新增）
- **实现内容**：
  - `main(event: {content, imageFileIds, uid, ocrLogId, force})`：uid 校验、按 ocrLogId 幂等（已有 pending 任务则拒绝）
  - `embedText(db, text): Promise<vector>`：智谱 embedding-3（app_config `zhipu_api_key` 双通道，复用 resolveConfigKey 模式）
  - `findSimilar(db, vector, uid): Promise<{questionId, score}|null>`：检索该 uid 历史 question 向量 Top1（实现以 Toolbox semanticSearch 源码迁移为准），score > 阈值（初定 0.85）且未 force → 返回值带 duplicate 提示但仍创建记录
  - 创建 question(unresolved, origin=photo) + solution_log(pending) + task(solution) + embedding
- **测试用例**：
  - 用例 1：新题提交 → 三集合各一条 + embedding 一条，返回 batchId
  - 用例 2：同题文本重复提交（不 force） → 返回 duplicate 含历史 questionId
  - 用例 3：force=true 重拍 → 正常创建新记录
- **依赖**：Task 3、Task 6（ocrLogId 关联）

### Task 9：processAiTask 消费者（阶段 2-步骤 2.4）
- **操作类型**：新增（替换 Task 1 占位）
- **涉及文件**：
  - `uniCloud-alipay/cloudfunctions/processAiTask/index.js`（修改）
- **实现内容**：
  - 主循环：取 pending（create_time 升序）最多 5 条，逐条 processing → 分发 → done/failed；retry_count<2 失败回 pending
  - `handleSolution(task)`：GLM（glm-5，thinking disabled，timeout 300s）生成 JSON `{is_question, subject, knowledge_points, root_cause, stage1_hint, stage2_full, similar_exercise}`；优先 `response_format:{type:'json_object'}`，异常退化 `splitSolution(content)` 按 `## 一、思路引导/## 二、完整解答/## 三、同类练习` 拆分；is_question=false → question 标 invalid；成功更新 solution_log(success)+question 标注
  - `handleNoteAnnotate(task)`：GLM 输出 `{subject, knowledge_points, summary}` 更新 note → 追加 embed 任务
  - `handleEmbed(task)`：embedding-3 写 embedding 集合
  - `resolveConfigKey(db, docId)`：通用 key 双通道（env → app_config）
  - 苏格拉底 prompt 硬约束：最终答案只允许出现在 stage2_full
  - ai_call_logs 监控（fn=solution/note_annotate/embed）
- **测试用例**：
  - 用例 1：插入一条 solution 测试任务手动触发 → solution_log 变 success，stage1 中不含最终答案
  - 用例 2：GLM 返回非 JSON → 退化拆分成功，功能不中断
  - 用例 3：人为构造失败（错误 key）→ retry 2 次后 failed，error_msg 落库
  - 用例 4：note_annotate 任务 → note 标注更新 + 自动生成 embed 任务并被下次消费
- **依赖**：Task 1、Task 7、Task 8

### Task 10：getSolveResult 查询云函数（阶段 2-步骤 2.5）
- **操作类型**：新增
- **涉及文件**：
  - `uniCloud-alipay/cloudfunctions/getSolveResult/index.js`（新增）
- **实现内容**：
  - `main(event: {uid, type: 'solution'|'note', batchId?, questionId?, noteId?, page?, pageSize?})`
  - solution：按 batchId/questionId 返回 solution_log+question（含 invalid/duplicate 状态）；note：按 noteId 返回 note
  - uid 归属校验（查到的记录 uid 不符视为不存在）
- **测试用例**：
  - 用例 1：按 batchId 轮询 pending → processing → success 状态正确流转可见
  - 用例 2：uid 不匹配 → 返回不存在（防越权读）
- **依赖**：Task 7、Task 8

### Task 11：saveNote / saveQuestion 轻量写接口（阶段 2-步骤 2.6）
- **操作类型**：新增
- **涉及文件**：
  - `uniCloud-alipay/cloudfunctions/saveNote/index.js`（新增）
  - `uniCloud-alipay/cloudfunctions/saveQuestion/index.js`（新增）
- **实现内容**：
  - saveNote `main({uid, action: 'update'|'delete', noteId, content?, knowledgePoints?})`：更新（update_time 刷新、删除关联 embedding）、物理删除（同步删 embedding）
  - saveQuestion `main({uid, action: 'trace'|'set_status'|'delete', questionId, pathTrace?, status?})`：埋点写 solution_log.path_trace、状态流转 unresolved↔resolved、删除级联（solution_log+embedding）
- **测试用例**：
  - 用例 1：trace 上报 {gave_up_stage:0, skipped_gate:true} → solution_log.path_trace 更新
  - 用例 2：set_status resolved → question.status 变更；delete → question/solution_log/embedding 同步消失
- **依赖**：Task 3

### Task 12：utils/media.js 媒体工具（阶段 3-步骤 3.1）
- **操作类型**：新增 + 修改
- **涉及文件**：
  - `utils/media.js`（新增）
  - `pages/home/index.vue`（修改，冒烟逻辑改引用）
- **实现内容**：
  - `compressImages(paths): Promise<paths>`：>1600px 压缩 q70，失败回退原图
  - `uploadImages(paths, folder): Promise<fileIDs>`：串行上传 `folder/timestamp-idx.ext`，单张失败重试 1 次
  - 冒烟页改为调用本模块（逻辑不变，回归通过）
- **测试用例**：
  - 用例 1：选 3000px 图 → 压缩后上传成功，云存储文件可访问
  - 用例 2：冒烟页全流程回归仍通过
- **依赖**：无

### Task 13：utils/poll.js 轮询器（阶段 3-步骤 3.2）
- **操作类型**：新增
- **涉及文件**：
  - `utils/poll.js`（新增）
- **实现内容**：
  - `pollTask({fn, isDone, maxWait=300000}): Promise<result>`：间隔 3s→5s→8s 退避；fn 抛错连续 3 次中止；超 maxWait 抛超时错误
- **测试用例**：
  - 用例 1：fn 第 3 次返回 done → 前两次后继续轮询，第 3 次resolve
  - 用例 2：持续 pending 超过 maxWait → reject 超时
- **依赖**：无

### Task 14：md-view 渲染组件（阶段 3-步骤 3.3）
- **操作类型**：新增
- **涉及文件**：
  - `component/md-view/index.vue`（新增）
  - npm 依赖 markdown-it、mp-html（uni_modules 或 npm）
- **实现内容**：
  - props：`content: String`；markdown-it 解析（表格/删除线启用）→ mp-html 渲染
  - LaTeX：mp-html latex 插件，预处理 `$...$`/`$$...$$`；渲染失败段落降级纯文本
  - 代码高亮插件接入；长内容 scroll-view 包裹
- **测试用例**：
  - 用例 1：渲染含行内/块级公式、代码块、表格、加粗的测试 Markdown → 全部正确显示
  - 用例 2：空 content / 非 Markdown 纯文本 → 不报错正常显示
- **依赖**：无

### Task 15：home 首页改造（阶段 3-步骤 3.4）
- **操作类型**：修改
- **涉及文件**：
  - `pages/home/index.vue`（修改）
  - `pages.json`（修改，注册新页面路由）
- **实现内容**：
  - 四入口：拍错题 / 拍笔记 / 错题本 / 笔记列表（跳转占位页）
  - 今日概览卡（数据接口后续接通，先静态占位）
  - 保留冒烟测试入口移至设置区（阶段 5 后移除）
- **测试用例**：
  - 用例 1：四入口分别跳转到占位页面无报错
- **依赖**：Task 12

### Task 16：camera 采集页（阶段 4-步骤 4.1）
- **操作类型**：新增
- **涉及文件**：
  - `pages/camera/index.vue`（新增）
  - `api/solution.js`、`api/note.js`（新增，提交封装）
- **实现内容**：
  - onLoad 读 `type=question|note`；六步状态流：select → compress → upload → ocr → edit（textarea+原图对照）→ submit
  - 提交路由：question→generateSolution（处理 duplicate 弹窗：查看旧题/仍要提交 force）、note→annotateNote
  - 成功跳转：question→solve(batchId)、note→note 详情
  - 防重复提交（running 锁）；失败保留已修正文本
- **测试用例**：
  - 用例 1：拍题全流程 → 跳转 solve 页且携带 batchId
  - 用例 2：重复拍同题 → 弹出去重提示，选择 force 后正常提交
  - 用例 3：提交失败 → 停留本页，修正文本未丢失
- **依赖**：Task 8、Task 12、Task 15

### Task 17：笔记三页（阶段 4-步骤 4.2）
- **操作类型**：新增
- **涉及文件**：
  - `pages/note/index.vue`、`pages/note/detail.vue`、`pages/note/edit.vue`（新增）
- **实现内容**：
  - 列表：分页 20/页，下拉刷新，按科目筛选；显示 summary + 知识点 chips
  - 详情：md-view 渲染 + 原图查看 + 标注标签（可进编辑修正）
  - 编辑：textarea 修正内容 + 标签编辑 → saveNote(update)（触发重新标注策略：内容变更后重新入 note_annotate 队列）
- **测试用例**：
  - 用例 1：归档完成的笔记在列表出现，详情渲染正常
  - 用例 2：编辑内容保存 → update_time 刷新，稍后标注/向量更新
- **依赖**：Task 7、Task 11、Task 14、Task 16（数据来源）

### Task 18：solve 解题引导页（阶段 4-步骤 4.3）
- **操作类型**：新增
- **涉及文件**：
  - `pages/solve/index.vue`（新增）
- **实现内容**：
  - data：`{batchId, phase: waiting|stage1|gate|stage2|error|invalid, gateAnswer, trace}`
  - onLoad(batchId) → pollTask 轮询 getSolveResult；invalid（非题目）→ 提示重拍返回
  - stage1：md-view 展示思路引导 +「我自己再想想」(结束并 trace) /「还是不会」→ gate
  - gate：答案门槛——输入自己算的答案（可跳过，记 skipped_gate）→ stage2
  - stage2：完整解答 + 同类练习（md-view）→ 完成时 saveQuestion(trace)
  - trace 字段：{gave_up_stage, skipped_gate, duration_ms}
- **测试用例**：
  - 用例 1：stage1 页面无最终答案字样（泄露检查）；点「还是不会」过门槛后才出现完整解答
  - 用例 2：全流程完成 → solution_log.path_trace 落库
  - 用例 3：轮询超时 → 显示「稍后在错题本查看」并可离开
- **依赖**：Task 9、Task 10、Task 11、Task 13、Task 14

### Task 19：错题本两页（阶段 4-步骤 4.4）
- **操作类型**：新增
- **涉及文件**：
  - `pages/wrongbook/index.vue`、`pages/wrongbook/detail.vue`（新增）
  - `api/question.js`（新增，列表/详情封装，getSolveResult 扩展 list 模式）
- **实现内容**：
  - 列表：按科目/掌握状态/来源筛选，分页；条目显示题目摘要+知识点 chips+状态
  - 详情：题目原文（md-view）+ 原图 + stage2 讲解 + 引导路径回顾（trace）+ 「标记已解决」（saveQuestion set_status）+「再来一道类似的」按钮（M1 置灰提示 M2）
- **测试用例**：
  - 用例 1：解过的题出现在列表，状态未解决
  - 用例 2：标记已解决 → 列表状态同步
- **依赖**：Task 10、Task 11、Task 14、Task 18（数据来源）

### Task 20：联调与 M1 验收（阶段 5-步骤 5.1/5.2）
- **操作类型**：验证
- **涉及文件**：无新增
- **实现内容**：
  - 失败场景演练：断网重试、GLM 失败重试、重复提交、非题目图片
  - spec 验收：妹妹独立完成拍题解题+笔记归档；10 题回归 stage1 泄露率 0；重拍去重生效；标注抽检 ≥80%；path_trace 完整率 100%
- **测试用例**：
  - 用例 1：socratic-solve spec 验收 1-5 全过
  - 用例 2：capture/note spec 验收全过
  - 用例 3：验收结论回写 spec 变更记录与 CLAUDE.md 现状
- **依赖**：Task 16-19 全部

## 变更记录
| 日期 | 作者 | 变更内容 |
|------|------|---------|
| 2026-09-14 | yuanchuang | 初始版本（20 个 Task，6 阶段） |
