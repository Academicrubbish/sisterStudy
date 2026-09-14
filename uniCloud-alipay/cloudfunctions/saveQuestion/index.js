'use strict'

/**
 * 错题写接口：引导埋点 / 掌握状态流转 / 删除（级联）
 * @param {Object} event { uid, action: 'trace'|'set_status'|'delete', questionId, pathTrace?, status? }
 */
exports.main = async (event, context) => {
	const uid = (event.uid || '').trim()
	const action = event.action || ''
	const questionId = (event.questionId || '').trim()

	if (!uid || !questionId) {
		return { code: -1, message: '缺少参数' }
	}

	const db = uniCloud.database()
	const now = Date.now()

	try {
		// 归属校验
		const res = await db.collection('question').doc(questionId).get()
		const list = (res.result || res).data || []
		const question = list[0]
		if (!question || question.uid !== uid) {
			return { code: -1, message: '错题不存在' }
		}

		if (action === 'trace') {
			// 引导路径埋点：写入该题最新的 solution_log
			const trace = event.pathTrace || {}
			const logRes = await db.collection('solution_log')
				.where({ question_id: questionId })
				.orderBy('create_time', 'desc')
				.limit(1)
				.get()
			const logs = (logRes.result || logRes).data || []
			if (logs.length === 0) {
				return { code: -1, message: '该错题无解题记录' }
			}
			await db.collection('solution_log').doc(logs[0]._id).update({ path_trace: trace })
			return { code: 0, data: {} }
		}

		if (action === 'set_status') {
			const status = event.status || ''
			if (['unresolved', 'resolved'].indexOf(status) === -1) {
				return { code: -1, message: '非法状态：' + status }
			}
			await db.collection('question').doc(questionId).update({
				status: status, update_time: now
			})
			return { code: 0, data: {} }
		}

		if (action === 'delete') {
			await db.collection('question').doc(questionId).remove()
			await db.collection('solution_log').where({ question_id: questionId }).remove()
			await db.collection('embedding')
				.where({ entity_type: 'question', entity_id: questionId })
				.remove()
			return { code: 0, data: {} }
		}

		return { code: -1, message: '未知操作：' + action }
	} catch (err) {
		console.error('[saveQuestion] 操作失败：', err.message)
		return { code: -1, message: '操作失败：' + err.message }
	}
}
