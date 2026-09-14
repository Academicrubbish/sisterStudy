'use strict'
const axios = require('axios')

// ========== 智谱 embedding-3（拍题去重用，同步调用 <1s） ==========
const EMBEDDING_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings'
const EMBED_MODEL = 'embedding-3'
const EMBED_DIMENSIONS = 512
/** 去重相似度阈值（Toolbox semanticSearch 同源参数体系，M1 联调时可调） */
const DUPLICATE_THRESHOLD = 0.85

const ZHIPU_ENV_KEY = process.env.ZHIPU_API_KEY

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
 * 文本向量化（单条，同步）
 * @param {string} key 智谱 API Key
 * @param {string} text 待向量化文本（超长截断）
 * @returns {Promise<number[]>} 512 维向量
 */
async function embedText(key, text) {
	const clipped = text.slice(0, 2000)
	const res = await axios.post(
		EMBEDDING_URL,
		{ model: EMBED_MODEL, input: [clipped], dimensions: EMBED_DIMENSIONS },
		{
			headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
			timeout: 30000
		}
	)
	const data = res.data.data || []
	if (data.length === 0 || !data[0].embedding) {
		throw new Error('embedding 返回为空')
	}
	return data[0].embedding
}

/** 余弦相似度 */
function cosineSimilarity(a, b) {
	let dot = 0
	let na = 0
	let nb = 0
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i]
		na += a[i] * a[i]
		nb += b[i] * b[i]
	}
	return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

/**
 * 在该用户的历史错题向量中找最相似的一条
 * @param {Object} db 数据库实例
 * @param {number[]} vector 新题向量
 * @param {string} uid 设备用户
 * @returns {Promise<{questionId: string, score: number}|null>} 超阈值返回最优匹配
 */
async function findSimilar(db, vector, uid) {
	const res = await db.collection('embedding')
		.where({ entity_type: 'question', uid: uid })
		.field({ entity_id: true, vector: true })
		.limit(500) // 单用户规模内全量比对
		.get()
	const list = (res.result || res).data || []
	let best = null
	for (const row of list) {
		if (!Array.isArray(row.vector) || row.vector.length !== vector.length) continue
		const score = cosineSimilarity(vector, row.vector)
		if (!best || score > best.score) {
			best = { questionId: row.entity_id, score: Math.round(score * 1000) / 1000 }
		}
	}
	return best && best.score >= DUPLICATE_THRESHOLD ? best : null
}

/**
 * 拍错题提交：同步向量去重 → 创建 question + solution_log + 任务，立即返回
 * @param {Object} event { content, imageFileIds, uid, ocrLogId, force }
 * @returns {Object} { code, data: { questionId, batchId, duplicate? } }
 *  duplicate 存在且未 force 时不创建记录，由客户端决策（查看旧题 / force 重提）
 */
exports.main = async (event, context) => {
	const content = (event.content || '').trim()
	const imageFileIds = event.imageFileIds || []
	const uid = (event.uid || '').trim()
	const ocrLogId = event.ocrLogId || ''
	const force = event.force === true

	if (!content) {
		return { code: -1, message: '题目内容不能为空' }
	}

	const db = uniCloud.database()
	const now = Date.now()

	try {
		// uid 合法性校验
		const userRes = await db.collection('device_user').where({ uid }).limit(1).get()
		if (((userRes.result || userRes).data || []).length === 0) {
			return { code: -1, message: '设备未注册' }
		}

		// 幂等：同一 ocr_log 不允许重复提交未完成任务
		if (ocrLogId) {
			const dupRes = await db.collection('question')
				.where({ ocr_log_id: ocrLogId, uid: uid })
				.limit(1)
				.get()
			if (((dupRes.result || dupRes).data || []).length > 0) {
				return { code: -1, message: '该批图片已提交过，请勿重复提交' }
			}
		}

		// 同步向量去重（失败不阻塞提交流程，降级为不去重）
		let vector = null
		let duplicate = null
		try {
			const key = await resolveZhipuKey(db)
			if (key) {
				vector = await embedText(key, content)
				duplicate = await findSimilar(db, vector, uid)
			} else {
				console.warn('[generateSolution] 无智谱 Key，本次跳过去重')
			}
		} catch (e) {
			console.error('[generateSolution] 去重检查失败（降级放行）：', e.message)
		}
		if (duplicate && !force) {
			// 不创建记录，客户端弹窗决策：查看旧题 or force 重新提交
			return { code: 0, data: { duplicate: duplicate } }
		}

		// 创建错题记录
		const questionRes = await db.collection('question').add({
			content_md: content,
			image_file_ids: imageFileIds,
			subject: '',
			knowledge_points: [],
			root_cause: '',
			status: 'unresolved',
			origin: 'photo',
			ocr_log_id: ocrLogId,
			uid: uid,
			create_time: now,
			update_time: now
		})

		// 创建解题记录（pending，待 processAiTask 填充两段式内容）
		const solutionRes = await db.collection('solution_log').add({
			question_id: questionRes.id,
			stage1_hint: '',
			stage2_full: '',
			similar_exercise: '',
			meta: duplicate ? { duplicate_of: duplicate.questionId } : {},
			path_trace: null,
			status: 'pending',
			error_msg: '',
			batch_id: '',
			create_time: now,
			complete_time: null,
			uid: uid
		})

		// 写入解题任务（batchId 即任务 ID）
		const taskRes = await db.collection('task_queue').add({
			task_type: 'solution',
			ref_id: solutionRes.id,
			payload: {
				content: content,
				question_id: questionRes.id,
				solution_log_id: solutionRes.id,
				uid: uid,
				grade: '初中'
			},
			status: 'pending',
			claim_token: '',
			retry_count: 0,
			error_msg: '',
			create_time: now,
			update_time: now
		})
		const batchId = taskRes.id
		await db.collection('solution_log').doc(solutionRes.id).update({ batch_id: batchId })

		// 落库向量（去重失败场景此处 vector 为 null，由 embed 任务补）
		if (vector) {
			await db.collection('embedding').add({
				entity_type: 'question',
				entity_id: questionRes.id,
				digest: content.slice(0, 50),
				vector: vector,
				uid: uid,
				create_time: now
			})
		}

		return { code: 0, data: { questionId: questionRes.id, batchId: batchId } }
	} catch (err) {
		console.error('[generateSolution] 提交失败：', err.message)
		return { code: -1, message: '提交失败，请稍后重试' }
	}
}
