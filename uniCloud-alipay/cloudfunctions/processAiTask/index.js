'use strict'
const axios = require('axios')

// ========== 常量 ==========
const GLM_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const GLM_MODEL = 'glm-5'
// 百炼 MaaS 端点（与 processOcr 同通道，qwen3.6-flash 视觉解题用）
const QWEN_VL_URL = 'https://llm-l6r33y5g1xzlg9e0.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions'

const ZHIPU_ENV_KEY = process.env.ZHIPU_API_KEY
const QWEN_ENV_KEY = process.env.QWEN_API_KEY
const EMBEDDING_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings'
const EMBED_MODEL = 'embedding-3'
const EMBED_DIMENSIONS = 512

/** 每次触发消费的任务数上限（控制单次运行总时长在触发间隔内） */
const TASK_BATCH_SIZE = 5
/** 残留恢复：processing 超过 10 分钟视为上次运行被杀，重置回 pending */
const STUCK_RESET_MS = 10 * 60 * 1000
const MAX_RETRY_COUNT = 2
const GLM_TIMEOUT = 300000

// ========== 苏格拉底式解题 prompt（JSON 优先版） ==========
const SOLUTION_JSON_PROMPT = `你是一名耐心的一对一家教老师，正在辅导一名{grade}学生。你的教学法是苏格拉底式引导：先给思路引导让学生自己想，学生明确要求后才给完整解答。

学生会拍一道不会的题目给你（已 OCR 为 Markdown）。请输出严格 JSON（不要输出 JSON 以外的任何内容）：
{
  "is_question": true,
  "subject": "科目（如：数学）",
  "knowledge_points": ["知识点1", "知识点2"],
  "root_cause_guess": "初判此题易卡点：概念模糊 / 思路偏差 / 计算习惯 三选一",
  "stage1_hint": "## 思路引导\\n（Markdown：1.这道题在考什么（1-2句）；2.已有条件与求解目标梳理；3.由远及近的思路提示，不给关键步骤结果；4.一个引导性问题，让学生自己动手尝试）",
  "stage2_full": "## 完整解答\\n（Markdown：逐步详解，每步说明为什么这么做，最后给出**最终答案**）",
  "similar_exercise": "## 同类练习\\n（一道同知识点变式题 + 完整解答与答案）"
}

硬规则：
1. stage1_hint 严禁出现最终答案或直接求解结果（方向性提示可以）
2. 最终答案只允许出现在 stage2_full 和 similar_exercise 的解答中
3. 语言适配{grade}学生认知水平，鼓励不评判
4. 数学公式用 LaTeX（$...$ 或 $$...$$）
5. 若内容不是一道可解答的题目（如无关图片文字），is_question 置 false，其余字段给空字符串`

// ========== 退化版 prompt（固定标题拆分，Toolbox 已验证模式） ==========
const SOLUTION_TITLE_PROMPT = `你是一名耐心的一对一家教老师，正在辅导一名{grade}学生。你的教学法是苏格拉底式引导：先给思路引导让学生自己想，学生明确要求后才给完整解答。

请根据题目内容生成 Markdown 文档，严格按以下三个二级标题组织，不要修改标题文字：

## 一、思路引导
（这道题在考什么、条件与目标梳理、由远及近的思路提示、一个引导性问题。严禁出现最终答案）

## 二、完整解答
（逐步详解，每步说明为什么，最后给出**最终答案**）

## 三、同类练习
（一道同知识点变式题 + 完整解答与答案）

硬规则：最终答案只允许出现在「二、完整解答」和「三、同类练习」中；语言适配{grade}学生；公式用 LaTeX；若内容不是有效题目，仅输出「这不是一道有效的题目」。`

const NOTE_ANNOTATE_PROMPT = `请分析这份学生手写笔记（已 OCR 为 Markdown），输出严格 JSON（不要输出 JSON 以外的任何内容）：
{
  "subject": "科目（如：数学 / 物理 / 英语）",
  "knowledge_points": ["知识点1", "知识点2", "知识点3"],
  "summary": "一句话摘要（30 字内）"
}
若笔记内容与学习无关，subject 给"其他"，knowledge_points 给空数组。`

/**
 * 获取智谱 API Key：环境变量优先，读不到回退 app_config 集合（doc id: zhipu_api_key）
 * @param {Object} db 数据库实例
 * @returns {Promise<string>}
 */
async function resolveZhipuKey(db) {
	if (ZHIPU_ENV_KEY) return ZHIPU_ENV_KEY
	try {
		const res = await db.collection('app_config').doc('zhipu_api_key').get()
		if (res.data && res.data.length > 0 && res.data[0].value) {
			return res.data[0].value
		}
	} catch (e) {
		console.error('[resolveZhipuKey] 配置集合读取失败：', e.message)
	}
	return ''
}

/**
 * 获取百炼 API Key：环境变量优先，读不到回退 app_config 集合（doc id: qwen_api_key）
 * @param {Object} db 数据库实例
 * @returns {Promise<string>}
 */
async function resolveQwenKey(db) {
	if (QWEN_ENV_KEY) return QWEN_ENV_KEY
	try {
		const res = await db.collection('app_config').doc('qwen_api_key').get()
		if (res.data && res.data.length > 0 && res.data[0].value) {
			return res.data[0].value
		}
	} catch (e) {
		console.error('[resolveQwenKey] 配置集合读取失败：', e.message)
	}
	return ''
}

/**
 * 调百炼 qwen 视觉模型（OpenAI 兼容格式，与 processOcr 同端点）
 * @param {string} key 百炼 API Key
 * @param {Array} messages 消息数组（content 支持多模态数组）
 * @param {Object} opts { model, temperature, enable_thinking }
 * @returns {Promise<{content: string, usage: Object}>}
 */
async function callQwenVision(key, messages, opts) {
	const res = await axios.post(
		QWEN_VL_URL,
		{
			model: opts.model,
			messages: messages,
			max_tokens: 8192,
			temperature: opts.temperature,
			enable_thinking: opts.enable_thinking !== false // 解题默认开思考提升数学推理
		},
		{
			headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
			timeout: GLM_TIMEOUT
		}
	)
	const choice = res.data.choices && res.data.choices[0]
	const content = (choice && choice.message && choice.message.content) || ''
	if (!content.trim()) throw new Error('qwen 视觉模型返回空内容')
	return { content: content.trim(), usage: res.data.usage || null }
}

/**
 * 统一任务消费者（定时触发；也可手动/云端运行触发）
 * 状态机：pending → processing（claim_token 认领）→ done / failed（retry 上限 2）
 */
exports.main = async (event, context) => {
	const db = uniCloud.database()
	const _ = db.command
	const now = Date.now()
	// 触发器验证日志：每次运行必打（Task 1 验证定时触发器是否生效）
	console.log('[processAiTask] 触发执行 @', new Date(now).toISOString())

	try {
		// 0. 残留恢复：上次运行被超时杀死的 processing 任务重置回队列
		await db.collection('task_queue')
			.where({ status: 'processing', update_time: _.lt(now - STUCK_RESET_MS) })
			.update({ status: 'pending', claim_token: '', update_time: now })

		// 1. 候选并认领（claim_token 防并发重复消费）
		const candRes = await db.collection('task_queue')
			.where({ status: 'pending' })
			.orderBy('create_time', 'asc')
			.limit(TASK_BATCH_SIZE)
			.get()
		const candidates = (candRes.result || candRes).data || []
		if (candidates.length === 0) {
			return { code: 0, message: '无待处理任务' }
		}

		const claimToken = now + '_' + Math.random().toString(36).slice(2, 10)
		const candIds = candidates.map(t => t._id)
		await db.collection('task_queue')
			.where({ _id: _.in(candIds), status: 'pending' })
			.update({ status: 'processing', claim_token: claimToken, update_time: now })
		const claimedRes = await db.collection('task_queue')
			.where({ status: 'processing', claim_token: claimToken })
			.limit(TASK_BATCH_SIZE)
			.get()
		const tasks = (claimedRes.result || claimedRes).data || []

		// 2. 逐条分发处理，单条失败不影响其他
		const stats = { done: 0, fail: 0 }
		for (const task of tasks) {
			try {
				await dispatch(db, task)
				await db.collection('task_queue').doc(task._id).update({
					status: 'done', claim_token: '', error_msg: '', update_time: Date.now()
				})
				stats.done++
			} catch (err) {
				console.error('[processAiTask] 任务失败', task._id, task.task_type, '：', err.message)
				const nextRetry = (task.retry_count || 0) + 1
				await db.collection('task_queue').doc(task._id).update({
					status: nextRetry >= MAX_RETRY_COUNT ? 'failed' : 'pending',
					retry_count: nextRetry,
					claim_token: '',
					error_msg: (err.message || '').slice(0, 500),
					update_time: Date.now()
				})
				// 解题/标注任务同步置 error，客户端轮询可见
				if (task.task_type === 'solution' && task.payload.solution_log_id) {
					await db.collection('solution_log').doc(task.payload.solution_log_id).update({
						status: 'error', error_msg: (err.message || '').slice(0, 500)
					})
				}
				stats.fail++
			}
		}

		console.log('[processAiTask] 本轮完成：', JSON.stringify(stats))
		return { code: 0, message: '处理完成', data: stats }
	} catch (err) {
		console.error('[processAiTask] 执行异常：', err.message)
		return { code: -1, message: '任务处理异常：' + err.message }
	}
}

/** 按任务类型分发 */
async function dispatch(db, task) {
	switch (task.task_type) {
		case 'solution':
			return handleSolution(db, task)
		case 'note_annotate':
			return handleNoteAnnotate(db, task)
		case 'embed':
			return handleEmbed(db, task)
		default:
			throw new Error('未知任务类型：' + task.task_type)
	}
}

/**
 * 解题任务：GLM 生成苏格拉底两段式内容
 * 视觉模式（推荐）：原图 base64 直传视觉模型，OCR 文本仅作参考，规避识别错误传播
 * 纠错重生成：payload.regenerate_note 会注入 prompt，提示模型上次讲解有误
 * 优先 response_format JSON；失败降级固定标题 prompt + 拆分；视觉失败降级纯文本模型
 */
async function handleSolution(db, task) {
	const key = await resolveZhipuKey(db)
	if (!key) throw new Error('缺少智谱 API Key')

	const payload = task.payload

	// 视觉模式：原图直传千问视觉模型（用户实测千问视觉优于智谱），OCR 文本仅作参考
	// 模型可通过 app_config.solution_model 配置（默认 qwen3.6-flash，与 OCR 同端点同 Key）
	let imageDataUrls = []
	const visionModel = await resolveConfigValue(db, 'solution_model', 'qwen3.6-flash')
	const qwenKey = await resolveQwenKey(db)
	if (payload.image_file_ids && payload.image_file_ids.length > 0 && qwenKey) {
		try {
			imageDataUrls = await loadImagesAsDataUrls(payload.image_file_ids)
			console.log('[handleSolution] 视觉模式，图片数：', imageDataUrls.length, '模型：', visionModel)
		} catch (e) {
			console.error('[handleSolution] 图片加载失败，降级纯文本模式：', e.message)
			imageDataUrls = []
		}
	}
	const useVision = imageDataUrls.length > 0

	const callStart = Date.now()
	const messages = (prompt) => {
		const system = prompt.replace(/\{grade\}/g, payload.grade || '初中')
		let userText = useVision
			? '请解答图片中的题目。OCR 初步识别的文本仅供参考（可能存在识别错误，一切以图片为准）：\n\n' + payload.content
			: payload.content
		if (payload.regenerate_note) {
			userText += '\n\n【用户反馈】上一次生成的讲解存在错误：' + payload.regenerate_note + '。请重新仔细审题（有图以图为准），给出正确解答。'
		}
		if (useVision) {
			const content = imageDataUrls.map(u => ({ type: 'image_url', image_url: { url: u } }))
			content.push({ type: 'text', text: userText })
			return [
				{ role: 'system', content: system },
				{ role: 'user', content: content }
			]
		}
		return [
			{ role: 'system', content: system },
			{ role: 'user', content: userText }
		]
	}
	// 视觉走千问（解题开启思考模式提升数学推理），纯文本走智谱 glm-5
	const visionCall = (prompt, temperature) => callQwenVision(qwenKey, messages(prompt), {
		model: visionModel,
		temperature: temperature,
		enable_thinking: true
	})

	let result = null
	let usage = null
	// 尝试 A：结构化 JSON 输出
	try {
		const res = useVision
			? await visionCall(SOLUTION_JSON_PROMPT, 0.3)
			: await callGlm(key, messages(SOLUTION_JSON_PROMPT), {
				temperature: 0.3,
				response_format: { type: 'json_object' }
			})
		result = parseJsonObject(res.content)
		usage = res.usage
	} catch (e) {
		console.warn('[handleSolution] JSON 模式失败，降级标题模式：', e.message)
	}

	// 尝试 B：退化固定标题拆分；视觉连续失败回退 glm-5 纯文本
	if (!result) {
		if (useVision) {
			try {
				const res = await visionCall(SOLUTION_TITLE_PROMPT, 0.7)
				usage = usage || res.usage
				result = buildResultFromTitle(res.content)
			} catch (e2) {
				console.warn('[handleSolution] 视觉标题模式失败，回退纯文本模型：', e2.message)
				const textMessages = [
					{ role: 'system', content: SOLUTION_TITLE_PROMPT.replace(/\{grade\}/g, payload.grade || '初中') },
					{ role: 'user', content: buildTextUser(payload) }
				]
				const res = await callGlm(key, textMessages, { temperature: 0.7 })
				usage = usage || res.usage
				result = buildResultFromTitle(res.content)
			}
		} else {
			const res = await callGlm(key, messages(SOLUTION_TITLE_PROMPT), { temperature: 0.7 })
			usage = usage || res.usage
			result = buildResultFromTitle(res.content)
		}
	}

	await recordAiCall(db, {
		fn: 'solution', model: GLM_MODEL, uid: payload.uid || '',
		usage: usage, durationMs: Date.now() - callStart,
		status: 'success', errorMsg: ''
	})

	// 非题目：question 标记 invalid，解题记录以提示内容落库
	if (!result.is_question) {
		await db.collection('question').doc(payload.question_id).update({
			status: 'invalid', update_time: Date.now()
		})
		await db.collection('solution_log').doc(payload.solution_log_id).update({
			stage1_hint: result.stage1_hint || '这张图片似乎不是一道题目，请重新拍摄',
			status: 'success', complete_time: Date.now()
		})
		return
	}

	// 正常落库：两段式内容 + question 标注
	await db.collection('solution_log').doc(payload.solution_log_id).update({
		stage1_hint: result.stage1_hint || '',
		stage2_full: result.stage2_full || '',
		similar_exercise: result.similar_exercise || '',
		meta: {
			subject: result.subject || '',
			knowledge_points: result.knowledge_points || [],
			root_cause: result.root_cause_guess || '',
			grade: payload.grade || '初中'
		},
		status: 'success',
		error_msg: '',
		complete_time: Date.now()
	})
	await db.collection('question').doc(payload.question_id).update({
		subject: result.subject || '',
		knowledge_points: result.knowledge_points || [],
		root_cause: result.root_cause_guess || '',
		update_time: Date.now()
	})
}

/**
 * 笔记标注任务：GLM 输出科目/知识点/摘要，更新 note 并追加向量化任务
 */
async function handleNoteAnnotate(db, task) {
	const key = await resolveZhipuKey(db)
	if (!key) throw new Error('缺少智谱 API Key')

	const payload = task.payload
	const callStart = Date.now()
	const res = await callGlm(key, [
		{ role: 'system', content: NOTE_ANNOTATE_PROMPT },
		{ role: 'user', content: payload.content.slice(0, 4000) }
	], { temperature: 0.2, response_format: { type: 'json_object' } })

	let anno = parseJsonObject(res.content)
	if (!anno) {
		// 降级：无标注但不失败
		anno = { subject: '', knowledge_points: [], summary: '' }
	}

	await db.collection('note').doc(payload.note_id).update({
		subject: anno.subject || '',
		knowledge_points: anno.knowledge_points || [],
		summary: anno.summary || '',
		update_time: Date.now()
	})

	await recordAiCall(db, {
		fn: 'note_annotate', model: GLM_MODEL, uid: payload.uid || '',
		usage: res.usage, durationMs: Date.now() - callStart,
		status: 'success', errorMsg: ''
	})

	// 追加向量化任务（供后续语义检索/出题上下文）
	const now = Date.now()
	await db.collection('task_queue').add({
		task_type: 'embed',
		ref_id: payload.note_id,
		payload: {
			entity_type: 'note',
			entity_id: payload.note_id,
			content: payload.content,
			uid: payload.uid || ''
		},
		status: 'pending',
		claim_token: '',
		retry_count: 0,
		error_msg: '',
		create_time: now,
		update_time: now
	})
}

/**
 * 向量化任务：embedding-3 单向量，幂等（先删旧再写）
 */
async function handleEmbed(db, task) {
	const key = await resolveZhipuKey(db)
	if (!key) throw new Error('缺少智谱 API Key')

	const payload = task.payload
	const callStart = Date.now()
	const res = await axios.post(
		EMBEDDING_URL,
		{ model: EMBED_MODEL, input: [payload.content.slice(0, 2000)], dimensions: EMBED_DIMENSIONS },
		{
			headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
			timeout: 60000
		}
	)
	const data = res.data.data || []
	if (data.length === 0 || !data[0].embedding) {
		throw new Error('embedding 返回为空')
	}

	await db.collection('embedding')
		.where({ entity_type: payload.entity_type, entity_id: payload.entity_id })
		.remove()
	await db.collection('embedding').add({
		entity_type: payload.entity_type,
		entity_id: payload.entity_id,
		digest: (payload.content || '').slice(0, 50),
		vector: data[0].embedding,
		uid: payload.uid || '',
		create_time: Date.now()
	})

	await recordAiCall(db, {
		fn: 'embed', model: EMBED_MODEL, uid: payload.uid || '',
		usage: res.data.usage || null, durationMs: Date.now() - callStart,
		status: 'success', errorMsg: ''
	})
}

/**
 * 调 GLM chat completions
 * @param {string} key API Key
 * @param {Array} messages 消息数组（content 支持字符串或多模态数组）
 * @param {Object} opts { temperature, response_format, model }
 * @returns {Promise<{content: string, usage: Object}>}
 */
async function callGlm(key, messages, opts) {
	const res = await axios.post(
		GLM_URL,
		{
			model: opts.model || GLM_MODEL,
			messages: messages,
			thinking: { type: 'disabled' },
			max_tokens: 8192,
			temperature: opts.temperature,
			response_format: opts.response_format
		},
		{
			headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
			timeout: GLM_TIMEOUT
		}
	)
	const choice = res.data.choices && res.data.choices[0]
	const content = (choice && choice.message && choice.message.content) || ''
	if (!content.trim()) throw new Error('GLM 返回空内容')
	return { content: content.trim(), usage: res.data.usage || null }
}

/**
 * 读 app_config 通用配置（doc id → value），不存在返回默认值
 * @param {Object} db 数据库实例
 * @param {string} docId 配置项 ID
 * @param {string} fallback 默认值
 * @returns {Promise<string>}
 */
async function resolveConfigValue(db, docId, fallback) {
	try {
		const res = await db.collection('app_config').doc(docId).get()
		if (res.data && res.data.length > 0 && res.data[0].value) {
			return String(res.data[0].value).trim()
		}
	} catch (e) { /* 配置缺失用默认值 */ }
	return fallback
}

/**
 * 在云函数内下载图片并转为 base64 data URL（视觉模型入参用）
 * @param {string} url 图片临时链接
 * @returns {Promise<string>}
 */
function fetchImageAsDataUrl(url) {
	return axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })
		.then(function(res) {
			var contentType = (res.headers && res.headers['content-type']) || 'image/jpeg'
			return 'data:' + contentType + ';base64,' + Buffer.from(res.data).toString('base64')
		})
}

/**
 * 云存储 fileID 列表 → base64 data URL 列表（顺序一致）
 * @param {string[]} fileIds
 * @returns {Promise<string[]>}
 */
async function loadImagesAsDataUrls(fileIds) {
	const tempUrlRes = await uniCloud.getTempFileURL({ fileList: fileIds })
	const fileList = tempUrlRes.fileList || []
	const urls = fileIds.map(id => {
		const hit = fileList.find(f => f.fileID === id)
		return hit ? hit.tempFileURL : ''
	}).filter(Boolean)
	if (urls.length === 0) throw new Error('获取图片临时链接失败')
	const out = []
	for (const u of urls) {
		out.push(await fetchImageAsDataUrl(u))
	}
	return out
}

/**
 * 从模型输出中解析 JSON 对象（容忍 ```json 围栏与前后杂文）
 * @param {string} text 模型输出
 * @returns {Object|null} 解析失败返回 null
 */
function parseJsonObject(text) {
	try {
		const start = text.indexOf('{')
		const end = text.lastIndexOf('}')
		if (start === -1 || end === -1 || end <= start) return null
		return JSON.parse(text.slice(start, end + 1))
	} catch (e) {
		return null
	}
}

/** 从标题模式输出构造 result 对象 */
function buildResultFromTitle(content) {
	if (content.indexOf('这不是一道有效的题目') > -1) {
		return { is_question: false, stage1_hint: content }
	}
	const parts = splitByTitles(content)
	return {
		is_question: true,
		subject: '',
		knowledge_points: [],
		root_cause_guess: '',
		stage1_hint: parts[0],
		stage2_full: parts[1],
		similar_exercise: parts[2]
	}
}

/** 纯文本模式（无图/视觉失败）的 user 文本 */
function buildTextUser(payload) {
	let userText = payload.content
	if (payload.regenerate_note) {
		userText += '\n\n【用户反馈】上一次生成的讲解存在错误：' + payload.regenerate_note + '。请重新仔细审题，给出正确解答。'
	}
	return userText
}

/**
 * 按固定二级标题拆分为三段（退化方案）
 * @param {string} content Markdown 全文
 * @returns {string[]} [思路引导, 完整解答, 同类练习]，缺失段为空串
 */
function splitByTitles(content) {
	const markers = ['## 一、思路引导', '## 二、完整解答', '## 三、同类练习']
	const parts = ['', '', '']
	let idx = -1
	for (const line of content.split('\n')) {
		const hit = markers.indexOf(line.trim())
		if (hit > -1) {
			idx = hit
			continue
		}
		if (idx > -1) parts[idx] += line + '\n'
	}
	return parts.map(p => p.trim())
}

/**
 * 记录一次 AI 调用到 ai_call_logs（监控写入异常静默忽略）
 * @param {Object} db 数据库实例
 * @param {Object} params { fn, model, uid, usage, durationMs, status, errorMsg }
 */
async function recordAiCall(db, params) {
	try {
		const { fn, model, uid, usage, durationMs, status, errorMsg } = params
		await db.collection('ai_call_logs').add({
			function: fn,
			model: model,
			uid: uid || '',
			prompt_tokens: usage ? (usage.prompt_tokens || null) : null,
			completion_tokens: usage ? (usage.completion_tokens || null) : null,
			total_tokens: usage && typeof usage.total_tokens === 'number' ? usage.total_tokens : null,
			duration_ms: durationMs,
			status: status,
			error_msg: errorMsg || '',
			batch_id: '',
			create_time: Date.now()
		})
	} catch (e) {
		console.error('[recordAiCall] 监控异常，已忽略不影响业务：', e.message)
	}
}
