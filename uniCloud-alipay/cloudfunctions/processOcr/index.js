'use strict'
const axios = require('axios')

// ========== 模型配置（阿里云百炼 qwen3.6-flash 视觉模型，OpenAI 兼容接口） ==========
const QWEN_VL_URL = 'https://llm-l6r33y5g1xzlg9e0.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions'
const QWEN_API_KEY = process.env.QWEN_API_KEY // 环境变量优先，运行时缺失则回退 app_config 集合
const QWEN_MODEL = 'qwen3.6-flash'

/**
 * 获取百炼 API Key：环境变量优先，读不到时回退 app_config 集合（doc id: qwen_api_key）
 * 兼容支付宝小程序云环境变量支持不确定的情况（M0 验证项 #1）
 * @param {Object} db 数据库实例
 * @returns {Promise<string>} API Key，获取失败返回空串
 */
async function resolveApiKey(db) {
	if (QWEN_API_KEY) return QWEN_API_KEY
	try {
		const res = await db.collection('app_config').doc('qwen_api_key').get()
		if (res.data && res.data.length > 0 && res.data[0].value) {
			return res.data[0].value
		}
	} catch (e) {
		console.error('[resolveApiKey] 配置集合读取失败：', e.message)
	}
	return ''
}

/** OCR 识别+整理指令：视觉模型一步到位输出格式完整的 Markdown */
const OCR_PROMPT = [
	'请识别图片中的全部文字内容，并整理为格式完整的 Markdown：',
	'1) 准确还原文字、表格；数学公式用 LaTeX（$...$ 或 $$...$$），代码用代码块；',
	'2) 修正明显的识别错误，补全断裂的表格和公式结构；',
	'3) 标题层级清晰，保留原文章节结构；',
	'4) 只输出整理后的 Markdown，不要添加任何解释、说明或前后缀。'
].join('')

// ========== AI 调用监控相关常量 ==========
/** 单次调用 token 异常阈值，超过则即时告警 */
const SINGLE_BURST_THRESHOLD = 20000
const AI_FUNCTION = 'ocr'

/** 调 qwen3.6-flash 识别+整理单张图片，返回 { content, usage, error } */
function callQwenVL(imageUrl, apiKey) {
	return axios.post(
		QWEN_VL_URL,
		{
			model: QWEN_MODEL,
			messages: [{
				role: 'user',
				content: [
					{ type: 'text', text: OCR_PROMPT },
					{ type: 'image_url', image_url: { url: imageUrl } }
				]
			}],
			max_tokens: 8192,
			temperature: 0.1,
			enable_thinking: false // OCR 要快、省 token，关闭思考模式
		},
		{
			headers: {
				'Authorization': 'Bearer ' + apiKey,
				'Content-Type': 'application/json'
			},
			timeout: 45000
		}
	).then(function(res) {
		var choice = res.data.choices && res.data.choices[0]
		var content = (choice && choice.message && choice.message.content) || ''
		if (!content.trim()) {
			return { content: '', usage: res.data.usage || null, error: '模型返回空内容' }
		}
		return { content: content.trim(), usage: res.data.usage || null, error: '' }
	}).catch(function(err) {
		// 捕获模型返回的具体错误内容（如 invalid image url），便于定位 4xx 原因
		var detail = ''
		if (err.response && err.response.data) {
			try {
				detail = typeof err.response.data === 'string'
					? err.response.data.slice(0, 300)
					: JSON.stringify(err.response.data).slice(0, 300)
			} catch (e) { /* 忽略序列化失败 */ }
		}
		console.error('qwen3.6-flash 调用失败:', err.message, detail)
		return { content: '', usage: null, error: (err.message || 'OCR识别失败') + (detail ? ' | ' + detail : '') }
	})
}

/**
 * 在云函数内下载图片并转为 base64 data URL
 * 背景：支付宝云存储的临时链接可能无法被百炼服务端拉取（导致 400），
 * 改为函数内自行下载后以 base64 内联传给模型，绕开模型侧拉图
 * @param {string} url 图片临时链接
 * @returns {Promise<string>} data:image/xxx;base64,...
 */
function fetchImageAsDataUrl(url) {
	return axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })
		.then(function(res) {
			var contentType = (res.headers && res.headers['content-type']) || 'image/jpeg'
			return 'data:' + contentType + ';base64,' + Buffer.from(res.data).toString('base64')
		})
}

/** 累加多张图 usage，并保留每次模型请求的 Token，供阶梯价格精确计算 */
function sumUsage(results) {
	var agg = {
		prompt_tokens: 0,
		completion_tokens: 0,
		total_tokens: 0,
		request_prompt_tokens: [],
		request_completion_tokens: []
	}
	var has = false
	results.forEach(function(r) {
		if (r.usage && typeof r.usage.total_tokens === 'number') {
			has = true
			var promptTokens = r.usage.prompt_tokens || 0
			var completionTokens = r.usage.completion_tokens || 0
			agg.prompt_tokens += promptTokens
			agg.completion_tokens += completionTokens
			agg.total_tokens += r.usage.total_tokens || 0
			agg.request_prompt_tokens.push(promptTokens)
			agg.request_completion_tokens.push(completionTokens)
		}
	})
	return has ? agg : null
}

/** 汇总失败图片，限制直接返回给客户端的错误长度 */
function buildOcrErrorMessage(results) {
	var errors = []
	results.forEach(function(result, index) {
		if (result.error) {
			errors.push('第' + (index + 1) + '张：' + result.error)
		}
	})
	var visibleErrors = errors.slice(0, 3).join('；')
	return visibleErrors + (errors.length > 3 ? '；另有' + (errors.length - 3) + '张失败' : '')
}

exports.main = async (event, context) => {
	var imageUrls = event.imageUrls || []
	var source = event.source || 'question' // question 拍错题 / note 拍笔记
	var uid = event.uid || ''
	if (imageUrls.length === 0) {
		return { code: -1, message: '图片列表为空' }
	}

	var db = uniCloud.database()

	// 创建 OCR 日志
	var logRes = await db.collection('ocr_log').add({
		related_id: '', // 后续关联 question/note 记录 ID，冒烟阶段为空
		image_urls: imageUrls,
		raw_results: [],
		merged_content: '',
		status: 'processing',
		error_msg: '',
		source: source,
		create_time: Date.now(),
		uid: uid
	})
	var logId = logRes.id

	try {
		// 环境变量优先，缺失时回退配置集合
		const apiKey = await resolveApiKey(db)
		if (!apiKey) {
			throw new Error('OCR 服务缺少 API Key（环境变量 QWEN_API_KEY 与 app_config 集合均未配置）')
		}

		// 获取临时下载链接（公网可访问，百炼服务端可读取）
		var tempUrlRes = await uniCloud.getTempFileURL({ fileList: imageUrls })
		var tempUrls = []
		if (tempUrlRes.fileList) {
			for (var i = 0; i < imageUrls.length; i++) {
				for (var j = 0; j < tempUrlRes.fileList.length; j++) {
					if (tempUrlRes.fileList[j].fileID === imageUrls[i]) {
						tempUrls.push(tempUrlRes.fileList[j].tempFileURL)
						break
					}
				}
			}
		}

		if (tempUrls.length !== imageUrls.length) {
			throw new Error('获取图片临时链接失败（' + tempUrls.length + '/' + imageUrls.length + '）')
		}
		// 详细日志：记录生成的临时链接（截断），便于排查存储域名可达性
		console.log('[processOcr] temp urls:', JSON.stringify(tempUrls.map(function(u) { return u.slice(0, 120) })))

		// 并行调用 qwen3.6-flash 识别所有图片（识别+整理一步到位，RPM 充裕无需限流）
		// 每张图先在函数内下载转 base64 再传给模型（支付宝云存储链接百炼侧可能拉不到）
		var ocrStart = Date.now()
		var ocrResults = await Promise.all(tempUrls.map(async function(url, idx) {
			const dataUrl = await fetchImageAsDataUrl(url)
			console.log('[processOcr] 第' + (idx + 1) + '张下载完成，大小(KB):', Math.round(dataUrl.length / 1024))
			return callQwenVL(dataUrl, apiKey)
		}))

		var ocrFailCount = ocrResults.filter(function(r) { return r.error }).length
		var ocrErrorMessage = buildOcrErrorMessage(ocrResults)

		// 记录 AI 调用监控（一次识别任务一条，含真实 token）
		await recordAiCall(db, {
			fn: AI_FUNCTION, model: QWEN_MODEL, uid: uid,
			usage: sumUsage(ocrResults), durationMs: Date.now() - ocrStart,
			status: ocrFailCount > 0 ? 'error' : 'success',
			errorMsg: ocrFailCount > 0 ? (ocrFailCount + '/' + ocrResults.length + ' 张识别失败') : ''
		})

		// 合并结果
		var finalContent = ocrResults
			.filter(function(r) { return r.content && r.content.trim() })
			.map(function(r) { return r.content })
			.join('\n\n')

		// 任意图片失败都视为整批失败，避免把缺页内容静默带入编辑器
		if (ocrFailCount > 0) {
			await db.collection('ocr_log').doc(logId).update({
				raw_results: ocrResults.map(function(r) { return r.content }),
				merged_content: finalContent,
				status: 'failed',
				error_msg: ocrErrorMessage
			})
			return { code: -1, message: '识别失败：' + ocrErrorMessage }
		}

		await db.collection('ocr_log').doc(logId).update({
			raw_results: ocrResults.map(function(r) { return r.content }),
			merged_content: finalContent,
			status: 'done',
			error_msg: ''
		})

		return { code: 0, data: { content: finalContent, logId: logId } }
	} catch (err) {
		var errMsg = err.message || '未知错误'
		await db.collection('ocr_log').doc(logId).update({ status: 'failed', error_msg: errMsg })
		return { code: -1, message: '识别失败：' + errMsg }
	}
}

/**
 * 记录一次 AI 调用到 ai_call_logs，并对单次异常消耗触发即时告警
 * 全程 try-catch 兜底：监控的任何异常都静默忽略，绝不影响业务主流程
 * @param {Object} db 数据库实例
 * @param {Object} params { fn, model, uid, usage, durationMs, status, errorMsg }
 */
async function recordAiCall(db, params) {
	try {
		const { fn, model, uid, usage, durationMs, status, errorMsg } = params
		const totalTokens = usage && typeof usage.total_tokens === 'number' ? usage.total_tokens : null

		await db.collection('ai_call_logs').add({
			function: fn,
			model: model,
			uid: uid || '',
			prompt_tokens: usage ? usage.prompt_tokens : null,
			completion_tokens: usage ? usage.completion_tokens : null,
			total_tokens: totalTokens,
			request_prompt_tokens: usage && usage.request_prompt_tokens ? usage.request_prompt_tokens : [],
			request_completion_tokens: usage && usage.request_completion_tokens ? usage.request_completion_tokens : [],
			duration_ms: durationMs,
			status: status,
			error_msg: errorMsg || '',
			batch_id: '',
			create_time: Date.now()
		})

		// 单次 token 异常即时告警
		if (totalTokens !== null && totalTokens > SINGLE_BURST_THRESHOLD) {
			await raiseAlert(db, {
				rule: 'single_burst',
				level: 'warn',
				uid: uid || '',
				function: fn,
				metric_value: totalTokens,
				threshold: SINGLE_BURST_THRESHOLD,
				message: `单次调用 token 异常：${fn}/${model} 消耗 ${totalTokens} tokens`
			})
		}
	} catch (e) {
		console.error('[recordAiCall] 监控异常，已忽略不影响业务：', e.message)
	}
}

/**
 * 写入一条告警记录到 ai_alerts 并打印日志
 * 预留 notifyAlert() 钩子，未来可接入 webhook / 推送
 * @param {Object} db 数据库实例
 * @param {Object} alert 告警内容（不含 create_time）
 */
async function raiseAlert(db, alert) {
	try {
		await db.collection('ai_alerts').add({
			...alert,
			create_time: Date.now()
		})
		console.warn(`[AI告警] ${alert.rule}: ${alert.message}`)
	} catch (e) {
		console.error('[raiseAlert] 写入告警失败：', e.message)
	}
}
